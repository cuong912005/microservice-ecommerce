import Order from "../models/order.model.js";
import { publishEvent } from "../lib/kafka.js";
import { getCart, clearCart, getProduct, createPaymentSession } from "../lib/serviceClients.js";
import { v4 as uuidv4 } from "uuid";

// Create order from cart (Story 6.1)
export const createOrder = async (req, res) => {
	try {
		const userId = req.user.userId;
		const token = req.token;
		const { couponCode, shippingAddress } = req.body;

		// 1. Fetch cart items from Cart Service
		let cart;
		try {
			cart = await getCart(userId, token);
		} catch (error) {
			return res.status(400).json({
				message: "Failed to fetch cart",
				error: error.message,
			});
		}

		if (!cart || !cart.items || cart.items.length === 0) {
			return res.status(400).json({ message: "Cart is empty" });
		}

		// 2. Validate products and prepare order items
		const orderProducts = [];
		let totalAmount = 0;

		for (const item of cart.items) {
			try {
				// Validate product exists and is available
				const product = await getProduct(item.productId);

				if (!product) {
					return res.status(400).json({
						message: `Product ${item.productId} not found`,
					});
				}

				// Use cached price from cart (already validated)
				const itemTotal = item.price * item.quantity;
				totalAmount += itemTotal;

				orderProducts.push({
					product: item.productId,
					productId: item.productId,
					quantity: item.quantity,
					price: item.price,
					name: item.name,
					image: item.image,
				});
			} catch (error) {
				return res.status(400).json({
					message: `Product validation failed for ${item.productId}`,
					error: error.message,
				});
			}
		}

		// 3. Apply coupon discount if provided
		let couponDiscount = 0;
		if (couponCode) {
			// Note: In full implementation, would call Coupon Service to validate
			// For MVP, we'll accept the coupon from request
			// Assume 10% discount for simplicity
			couponDiscount = totalAmount * 0.1;
			totalAmount -= couponDiscount;
		}

		// 4. Create order in database
		const order = new Order({
			userId,
			products: orderProducts,
			totalAmount,
			status: "pending",
			paymentStatus: "pending",
			couponCode: couponCode || undefined,
			couponDiscount,
			shippingAddress: shippingAddress || undefined,
		});

		// Add initial status to history
		order.addStatusChange("pending", "Order created");

		await order.save();

		// 5. Create payment session via Payment Service
		try {
			const paymentData = {
				products: orderProducts.map((p) => ({
					_id: p.productId,
					name: p.name,
					price: p.price,
					quantity: p.quantity,
					image: p.image,
				})),
				couponCode: couponCode || undefined,
			};

			const paymentSession = await createPaymentSession(paymentData, token);

			// Update order with payment session ID
			order.stripeSessionId = paymentSession.id;
			await order.save();

			// 6. Clear cart after successful order creation
			try {
				await clearCart(userId, token);
			} catch (error) {
				console.error("Failed to clear cart:", error.message);
				// Don't fail the order if cart clear fails
			}

			// 7. Publish order creation event to Kafka
			await publishEvent("analytics-events", {
				eventId: uuidv4(),
				eventType: "order-created",
				timestamp: new Date().toISOString(),
				payload: {
					orderId: order._id,
					userId,
					totalAmount: order.totalAmount,
					productsCount: orderProducts.length,
					status: order.status,
				},
			});

			// Return order with payment URL
			res.status(201).json({
				success: true,
				message: "Order created successfully",
				order: {
					_id: order._id,
					orderId: order._id,
					userId: order.userId,
					products: order.products,
					totalAmount: order.totalAmount,
					status: order.status,
					paymentStatus: order.paymentStatus,
					createdAt: order.createdAt,
				},
				payment: {
					sessionId: paymentSession.id,
					url: paymentSession.url,
				},
			});
		} catch (paymentError) {
			// Rollback: Mark order as failed if payment session creation fails
			order.status = "cancelled";
			order.paymentStatus = "failed";
			order.addStatusChange("cancelled", "Payment session creation failed");
			await order.save();

			return res.status(500).json({
				message: "Failed to create payment session",
				error: paymentError.message,
				orderId: order._id,
			});
		}
	} catch (error) {
		console.error("Error creating order:", error);
		res.status(500).json({
			message: "Error creating order",
			error: error.message,
		});
	}
};

// Get single order by ID (Story 6.2)
export const getOrderById = async (req, res) => {
	try {
		const { id } = req.params;
		const userId = req.user.userId;
		const isAdmin = req.user.role === "admin";

		const order = await Order.findById(id);

		if (!order) {
			return res.status(404).json({ message: "Order not found" });
		}

		// Only allow user to view their own orders (unless admin)
		if (!isAdmin && order.userId !== userId) {
			return res.status(403).json({ message: "Forbidden - Not your order" });
		}

		res.json(order);
	} catch (error) {
		console.error("Error fetching order:", error);
		res.status(500).json({
			message: "Error fetching order",
			error: error.message,
		});
	}
};

// Get user's orders (Story 6.2)
export const getUserOrders = async (req, res) => {
	try {
		const { userId: requestedUserId } = req.params;
		const userId = req.user.userId;
		const isAdmin = req.user.role === "admin";

		// Only allow user to view their own orders (unless admin)
		if (!isAdmin && requestedUserId !== userId) {
			return res.status(403).json({ message: "Forbidden - Not your orders" });
		}

		const { page = 1, limit = 10, status } = req.query;
		const skip = (page - 1) * limit;

		// Build query
		const query = { userId: requestedUserId };
		if (status) {
			query.status = status;
		}

		const orders = await Order.find(query)
			.sort({ createdAt: -1 })
			.skip(skip)
			.limit(parseInt(limit))
			.lean();

		const total = await Order.countDocuments(query);

		res.json({
			orders,
			pagination: {
				page: parseInt(page),
				limit: parseInt(limit),
				total,
				pages: Math.ceil(total / limit),
			},
		});
	} catch (error) {
		console.error("Error fetching user orders:", error);
		res.status(500).json({
			message: "Error fetching orders",
			error: error.message,
		});
	}
};

// Update order status (Story 6.2 - Admin only)
export const updateOrderStatus = async (req, res) => {
	try {
		const { id } = req.params;
		const { status, note } = req.body;

		// Validate status
		const validStatuses = ["pending", "processing", "shipped", "delivered", "cancelled"];
		if (!validStatuses.includes(status)) {
			return res.status(400).json({
				message: "Invalid status",
				validStatuses,
			});
		}

		const order = await Order.findById(id);

		if (!order) {
			return res.status(404).json({ message: "Order not found" });
		}

		// Update status
		const oldStatus = order.status;
		order.status = status;
		order.addStatusChange(status, note || `Status changed from ${oldStatus} to ${status}`);

		await order.save();

		// Publish status change event to Kafka
		await publishEvent("analytics-events", {
			eventId: uuidv4(),
			eventType: "order-status-changed",
			timestamp: new Date().toISOString(),
			payload: {
				orderId: order._id,
				userId: order.userId,
				oldStatus,
				newStatus: status,
				note: note || "",
			},
		});

		// Publish notification event for customer
		if (status === "shipped" || status === "delivered") {
			await publishEvent("notification-tasks", {
				eventId: uuidv4(),
				eventType: "send-shipping-notification",
				timestamp: new Date().toISOString(),
				payload: {
					userId: order.userId,
					orderId: order._id,
					status,
					trackingNote: note || "",
				},
			});
		}

		res.json({
			success: true,
			message: "Order status updated successfully",
			order,
		});
	} catch (error) {
		console.error("Error updating order status:", error);
		res.status(500).json({
			message: "Error updating order status",
			error: error.message,
		});
	}
};

// Get all orders (Admin only)
export const getAllOrders = async (req, res) => {
	try {
		const { page = 1, limit = 20, status } = req.query;
		const skip = (page - 1) * limit;

		// Build query
		const query = {};
		if (status) {
			query.status = status;
		}

		const orders = await Order.find(query)
			.sort({ createdAt: -1 })
			.skip(skip)
			.limit(parseInt(limit))
			.lean();

		const total = await Order.countDocuments(query);

		res.json({
			orders,
			pagination: {
				page: parseInt(page),
				limit: parseInt(limit),
				total,
				pages: Math.ceil(total / limit),
			},
		});
	} catch (error) {
		console.error("Error fetching all orders:", error);
		res.status(500).json({
			message: "Error fetching orders",
			error: error.message,
		});
	}
};

// Cancel order
export const cancelOrder = async (req, res) => {
	try {
		const { id } = req.params;
		const userId = req.user.userId;
		const isAdmin = req.user.role === "admin";

		const order = await Order.findById(id);

		if (!order) {
			return res.status(404).json({ message: "Order not found" });
		}

		// Only allow user to cancel their own orders (unless admin)
		if (!isAdmin && order.userId !== userId) {
			return res.status(403).json({ message: "Forbidden - Not your order" });
		}

		// Can only cancel pending or processing orders
		if (!["pending", "processing"].includes(order.status)) {
			return res.status(400).json({
				message: `Cannot cancel order with status: ${order.status}`,
			});
		}

		// Update status
		order.status = "cancelled";
		order.addStatusChange("cancelled", "Order cancelled by user");

		await order.save();

		// Publish cancellation event
		await publishEvent("analytics-events", {
			eventId: uuidv4(),
			eventType: "order-cancelled",
			timestamp: new Date().toISOString(),
			payload: {
				orderId: order._id,
				userId: order.userId,
				totalAmount: order.totalAmount,
			},
		});

		res.json({
			success: true,
			message: "Order cancelled successfully",
			order,
		});
	} catch (error) {
		console.error("Error cancelling order:", error);
		res.status(500).json({
			message: "Error cancelling order",
			error: error.message,
		});
	}
};
