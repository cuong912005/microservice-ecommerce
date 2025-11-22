import { stripe, createStripeCoupon } from "../lib/stripe.js";
import { publishEvent } from "../lib/kafka.js";
import { createOrder } from "../lib/orderClient.js";
import Transaction from "../models/transaction.model.js";
import { v4 as uuidv4 } from "uuid";

// Create Stripe checkout session (Story 5.1)
export const createCheckoutSession = async (req, res) => {
	try {
		const userId = req.user.userId;
		const { products, couponCode } = req.body;

		if (!Array.isArray(products) || products.length === 0) {
			return res.status(400).json({ error: "Invalid or empty products array" });
		}

		let totalAmount = 0;
		let couponDiscount = 0;

		// Create line items for Stripe
		const lineItems = products.map((product) => {
			const amount = Math.round(product.price * 100); // Stripe uses cents
			totalAmount += amount * product.quantity;

			return {
				price_data: {
					currency: "usd",
					product_data: {
						name: product.name,
						images: product.image ? [product.image] : [],
					},
					unit_amount: amount,
				},
				quantity: product.quantity || 1,
			};
		});

		// Apply coupon if provided
		const discounts = [];
		if (couponCode) {
			// Note: In a real implementation, you would validate the coupon via Coupon Service
			// For MVP, we'll assume validation happens in the frontend
			const discountPercentage = 10; // Example: 10% discount
			couponDiscount = Math.round((totalAmount * discountPercentage) / 100);
			
			const stripeCouponId = await createStripeCoupon(discountPercentage);
			discounts.push({ coupon: stripeCouponId });
		}

		// Create Stripe checkout session
		const session = await stripe.checkout.sessions.create({
			payment_method_types: ["card"],
			line_items: lineItems,
			mode: "payment",
			success_url: `${process.env.CLIENT_URL}/purchase-success?session_id={CHECKOUT_SESSION_ID}`,
			cancel_url: `${process.env.CLIENT_URL}/purchase-cancel`,
			discounts,
			metadata: {
				userId,
				couponCode: couponCode || "",
				products: JSON.stringify(
					products.map((p) => ({
						id: p._id || p.id,
						quantity: p.quantity,
						price: p.price,
						name: p.name,
						image: p.image,
					}))
				),
			},
		});

		// Create transaction record
		const transaction = new Transaction({
			userId,
			stripeSessionId: session.id,
			amount: totalAmount / 100, // Convert to dollars
			currency: "usd",
			status: "pending",
			products: products.map((p) => ({
				productId: p._id || p.id,
				quantity: p.quantity,
				price: p.price,
				name: p.name,
				image: p.image,
			})),
			couponCode: couponCode || undefined,
			couponDiscount: couponDiscount / 100,
		});

		await transaction.save();

		// Publish event to Kafka
		await publishEvent("analytics-events", {
			eventId: uuidv4(),
			eventType: "payment-initiated",
			timestamp: new Date().toISOString(),
			payload: {
				userId,
				sessionId: session.id,
				amount: totalAmount / 100,
				productsCount: products.length,
			},
		});

		res.status(200).json({
			id: session.id,
			url: session.url,
			totalAmount: totalAmount / 100,
		});
	} catch (error) {
		console.error("Error creating checkout session:", error);
		res.status(500).json({
			message: "Error processing checkout",
			error: error.message,
		});
	}
};

// Handle successful checkout (Story 5.1)
export const checkoutSuccess = async (req, res) => {
	try {
		const { sessionId } = req.body;
		const userId = req.user.userId;
		const token = req.token;

		if (!sessionId) {
			return res.status(400).json({ message: "Session ID is required" });
		}

		// Retrieve session from Stripe
		const session = await stripe.checkout.sessions.retrieve(sessionId);

		if (session.payment_status !== "paid") {
			return res.status(400).json({
				message: "Payment not completed",
				status: session.payment_status,
			});
		}

		// Update transaction
		const transaction = await Transaction.findOne({ stripeSessionId: sessionId });

		if (!transaction) {
			return res.status(404).json({ message: "Transaction not found" });
		}

		if (transaction.status === "succeeded") {
			// Already processed
			return res.status(200).json({
				success: true,
				message: "Payment already processed",
				orderId: transaction.orderId,
			});
		}

		transaction.status = "succeeded";
		transaction.stripePaymentIntentId = session.payment_intent;
		transaction.customerEmail = session.customer_details?.email;
		transaction.paymentMethod = session.payment_method_types[0];

		// Parse products from metadata
		const products = JSON.parse(session.metadata.products);

		// Create order via Order Service
		try {
			const orderData = {
				products: products.map((p) => ({
					product: p.id,
					quantity: p.quantity,
					price: p.price,
				})),
				totalAmount: session.amount_total / 100,
				stripeSessionId: sessionId,
				couponCode: session.metadata.couponCode || undefined,
			};

			const order = await createOrder(orderData, token);
			transaction.orderId = order._id || order.orderId;
		} catch (orderError) {
			console.error("Error creating order:", orderError);
			// Continue even if order creation fails - we can retry later
		}

		await transaction.save();

		// Publish success events to Kafka
		await publishEvent("email-tasks", {
			eventId: uuidv4(),
			eventType: "send-order-confirmation-email",
			timestamp: new Date().toISOString(),
			payload: {
				userId,
				email: transaction.customerEmail,
				orderId: transaction.orderId,
				amount: transaction.amount,
			},
		});

		await publishEvent("analytics-events", {
			eventId: uuidv4(),
			eventType: "payment-completed",
			timestamp: new Date().toISOString(),
			payload: {
				userId,
				transactionId: transaction._id,
				amount: transaction.amount,
				currency: transaction.currency,
				orderId: transaction.orderId,
			},
		});

		res.status(200).json({
			success: true,
			message: "Payment successful and order created",
			orderId: transaction.orderId,
			transactionId: transaction._id,
		});
	} catch (error) {
		console.error("Error processing checkout success:", error);
		res.status(500).json({
			message: "Error processing successful checkout",
			error: error.message,
		});
	}
};

// Handle Stripe webhooks (Story 5.2)
export const handleWebhook = async (req, res) => {
	const sig = req.headers["stripe-signature"];
	const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

	let event;

	try {
		// Verify webhook signature
		event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
	} catch (err) {
		console.error("Webhook signature verification failed:", err.message);
		return res.status(400).send(`Webhook Error: ${err.message}`);
	}

	// Handle the event
	try {
		switch (event.type) {
			case "payment_intent.succeeded":
				await handlePaymentIntentSucceeded(event.data.object);
				break;

			case "payment_intent.payment_failed":
				await handlePaymentIntentFailed(event.data.object);
				break;

			case "checkout.session.completed":
				await handleCheckoutSessionCompleted(event.data.object);
				break;

			case "checkout.session.expired":
				await handleCheckoutSessionExpired(event.data.object);
				break;

			default:
				console.log(`Unhandled event type: ${event.type}`);
		}

		res.json({ received: true });
	} catch (error) {
		console.error("Error handling webhook:", error);
		res.status(500).json({ error: "Webhook handler failed" });
	}
};

// Webhook handler: Payment intent succeeded
async function handlePaymentIntentSucceeded(paymentIntent) {
	console.log("Payment intent succeeded:", paymentIntent.id);

	const transaction = await Transaction.findOne({
		stripePaymentIntentId: paymentIntent.id,
	});

	if (transaction) {
		transaction.status = "succeeded";
		transaction.webhookEvents.push({
			eventType: "payment_intent.succeeded",
			eventId: paymentIntent.id,
			timestamp: new Date(),
		});
		await transaction.save();

		// Publish event
		await publishEvent("analytics-events", {
			eventId: uuidv4(),
			eventType: "payment-completed",
			timestamp: new Date().toISOString(),
			payload: {
				userId: transaction.userId,
				transactionId: transaction._id,
				amount: transaction.amount,
				paymentIntentId: paymentIntent.id,
			},
		});
	}
}

// Webhook handler: Payment intent failed
async function handlePaymentIntentFailed(paymentIntent) {
	console.log("Payment intent failed:", paymentIntent.id);

	const transaction = await Transaction.findOne({
		stripePaymentIntentId: paymentIntent.id,
	});

	if (transaction) {
		transaction.status = "failed";
		transaction.webhookEvents.push({
			eventType: "payment_intent.payment_failed",
			eventId: paymentIntent.id,
			timestamp: new Date(),
		});
		await transaction.save();

		// Publish failure event
		await publishEvent("analytics-events", {
			eventId: uuidv4(),
			eventType: "payment-failed",
			timestamp: new Date().toISOString(),
			payload: {
				userId: transaction.userId,
				transactionId: transaction._id,
				amount: transaction.amount,
				reason: paymentIntent.last_payment_error?.message,
			},
		});
	}
}

// Webhook handler: Checkout session completed
async function handleCheckoutSessionCompleted(session) {
	console.log("Checkout session completed:", session.id);

	const transaction = await Transaction.findOne({
		stripeSessionId: session.id,
	});

	if (transaction && transaction.status === "pending") {
		transaction.status = "processing";
		transaction.stripePaymentIntentId = session.payment_intent;
		transaction.webhookEvents.push({
			eventType: "checkout.session.completed",
			eventId: session.id,
			timestamp: new Date(),
		});
		await transaction.save();
	}
}

// Webhook handler: Checkout session expired
async function handleCheckoutSessionExpired(session) {
	console.log("Checkout session expired:", session.id);

	const transaction = await Transaction.findOne({
		stripeSessionId: session.id,
	});

	if (transaction) {
		transaction.status = "canceled";
		transaction.webhookEvents.push({
			eventType: "checkout.session.expired",
			eventId: session.id,
			timestamp: new Date(),
		});
		await transaction.save();
	}
}

// Get user transactions
export const getUserTransactions = async (req, res) => {
	try {
		const userId = req.user.userId;
		const { page = 1, limit = 10 } = req.query;

		const skip = (page - 1) * limit;

		const transactions = await Transaction.find({ userId })
			.sort({ createdAt: -1 })
			.skip(skip)
			.limit(parseInt(limit))
			.lean();

		const total = await Transaction.countDocuments({ userId });

		res.json({
			transactions,
			pagination: {
				page: parseInt(page),
				limit: parseInt(limit),
				total,
				pages: Math.ceil(total / limit),
			},
		});
	} catch (error) {
		console.error("Error fetching user transactions:", error);
		res.status(500).json({
			message: "Error fetching transactions",
			error: error.message,
		});
	}
};

// Get single transaction
export const getTransaction = async (req, res) => {
	try {
		const { id } = req.params;
		const userId = req.user.userId;

		const transaction = await Transaction.findOne({
			_id: id,
			userId,
		});

		if (!transaction) {
			return res.status(404).json({ message: "Transaction not found" });
		}

		res.json(transaction);
	} catch (error) {
		console.error("Error fetching transaction:", error);
		res.status(500).json({
			message: "Error fetching transaction",
			error: error.message,
		});
	}
};
