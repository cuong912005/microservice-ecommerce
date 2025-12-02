import Cart from "../models/cart.model.js";
import { getCartFromRedis, setCartInRedis, deleteCartFromRedis } from "../lib/redis.js";
import { getProductById, validateProduct } from "../lib/productClient.js";
import { publishEvent } from "../lib/kafka.js";
import { v4 as uuidv4 } from "uuid";

// Get cart for user
export const getCart = async (req, res) => {
	try {
		const userId = req.user.userId;

		// Try Redis first for fast access
		let cart = await getCartFromRedis(userId);

		if (!cart) {
			// Fallback to MongoDB
			const cartDoc = await Cart.findOne({ userId });
			
			if (!cartDoc) {
				// Return empty cart
				return res.json({
					userId,
					items: [],
					totalItems: 0,
					subtotal: 0,
				});
			}

			cart = cartDoc.toObject();
			// Cache in Redis
			await setCartInRedis(userId, cart);
		}

		res.json(cart);
	} catch (error) {
		console.error("Error in getCart controller:", error.message);
		res.status(500).json({ message: "Server error", error: error.message });
	}
};

// Add item to cart
export const addToCart = async (req, res) => {
	try {
		const userId = req.user.userId;
		const { productId } = req.body;

		if (!productId) {
			return res.status(400).json({ message: "Product ID is required" });
		}

		// Validate product exists
		const { exists, product } = await validateProduct(productId);

		if (!exists) {
			return res.status(404).json({ message: "Product not found" });
		}

		// Get cart from Redis or MongoDB
		let cartDoc = await Cart.findOne({ userId });

		if (!cartDoc) {
			// Create new cart
			cartDoc = new Cart({
				userId,
				items: [],
			});
		}

		// Check if product already in cart
		const existingItemIndex = cartDoc.items.findIndex(
			(item) => item.productId === productId
		);

		if (existingItemIndex > -1) {
			// Increment quantity
			cartDoc.items[existingItemIndex].quantity += 1;
		} else {
			// Add new item with cached product data
			cartDoc.items.push({
				productId: product._id,
				quantity: 1,
				productName: product.name,
				productPrice: product.price,
				productImage: product.image,
				productCategory: product.category,
			});
		}

		// Calculate totals
		cartDoc.calculateTotals();

		// Save to MongoDB
		await cartDoc.save();

		// Update Redis cache
		await setCartInRedis(userId, cartDoc.toObject());

		// Publish event to Kafka
		await publishEvent("analytics-events", {
			eventId: uuidv4(),
			eventType: "cart-item-added",
			timestamp: new Date().toISOString(),
			payload: {
				userId,
				productId,
				quantity: 1,
			},
		});

		res.json(cartDoc);
	} catch (error) {
		console.error("Error in addToCart controller:", error.message);
		res.status(500).json({ message: "Server error", error: error.message });
	}
};

// Update item quantity
export const updateQuantity = async (req, res) => {
	try {
		const userId = req.user.userId;
		const { productId } = req.params;
		const { quantity } = req.body;

		if (quantity === undefined || quantity < 0) {
			return res.status(400).json({ message: "Valid quantity is required" });
		}

		// Get cart
		const cartDoc = await Cart.findOne({ userId });

		if (!cartDoc) {
			return res.status(404).json({ message: "Cart not found" });
		}

		// Find item in cart
		const itemIndex = cartDoc.items.findIndex((item) => item.productId === productId);

		if (itemIndex === -1) {
			return res.status(404).json({ message: "Product not found in cart" });
		}

		if (quantity === 0) {
			// Remove item from cart
			cartDoc.items.splice(itemIndex, 1);
		} else {
			// Update quantity
			cartDoc.items[itemIndex].quantity = quantity;
		}

		// Calculate totals
		cartDoc.calculateTotals();

		// Save to MongoDB
		await cartDoc.save();

		// Update Redis cache
		await setCartInRedis(userId, cartDoc.toObject());

		res.json(cartDoc);
	} catch (error) {
		console.error("Error in updateQuantity controller:", error.message);
		res.status(500).json({ message: "Server error", error: error.message });
	}
};

// Remove item from cart
export const removeFromCart = async (req, res) => {
	try {
		const userId = req.user.userId;
		const { productId } = req.params;

		// Get cart
		const cartDoc = await Cart.findOne({ userId });

		if (!cartDoc) {
			return res.status(404).json({ message: "Cart not found" });
		}

		// Remove item
		cartDoc.items = cartDoc.items.filter((item) => item.productId !== productId);

		// Calculate totals
		cartDoc.calculateTotals();

		// Save to MongoDB
		await cartDoc.save();

		// Update Redis cache
		await setCartInRedis(userId, cartDoc.toObject());

		// Publish event to Kafka
		await publishEvent("analytics-events", {
			eventId: uuidv4(),
			eventType: "cart-item-removed",
			timestamp: new Date().toISOString(),
			payload: {
				userId,
				productId,
			},
		});

		res.json(cartDoc);
	} catch (error) {
		console.error("Error in removeFromCart controller:", error.message);
		res.status(500).json({ message: "Server error", error: error.message });
	}
};

// Clear entire cart
export const clearCart = async (req, res) => {
	try {
		const userId = req.user.userId;

		// Get cart
		const cartDoc = await Cart.findOne({ userId });

		if (!cartDoc) {
			return res.json({
				userId,
				items: [],
				totalItems: 0,
				subtotal: 0,
			});
		}

		// Clear items
		cartDoc.items = [];
		cartDoc.calculateTotals();

		// Save to MongoDB
		await cartDoc.save();

		// Delete from Redis
		await deleteCartFromRedis(userId);

		res.json(cartDoc);
	} catch (error) {
		console.error("Error in clearCart controller:", error.message);
		res.status(500).json({ message: "Server error", error: error.message });
	}
};

// Validate cart items 
export const validateCart = async (req, res) => {
	try {
		const userId = req.user.userId;

		// Get cart
		const cartDoc = await Cart.findOne({ userId });

		if (!cartDoc || cartDoc.items.length === 0) {
			return res.json({
				valid: true,
				cart: cartDoc || { items: [], totalItems: 0, subtotal: 0 },
				issues: [],
			});
		}

		const issues = [];
		let needsUpdate = false;

		// Validate each item
		for (let i = cartDoc.items.length - 1; i >= 0; i--) {
			const item = cartDoc.items[i];

			try {
				// Fetch current product data
				const product = await getProductById(item.productId);

				// Check if price changed
				if (product.price !== item.productPrice) {
					issues.push({
						productId: item.productId,
						productName: item.productName,
						issue: "price_changed",
						oldPrice: item.productPrice,
						newPrice: product.price,
					});

					// Update cached price
					item.productPrice = product.price;
					needsUpdate = true;
				}

				// Update other cached product data
				if (product.name !== item.productName || product.image !== item.productImage) {
					item.productName = product.name;
					item.productImage = product.image;
					item.productCategory = product.category;
					needsUpdate = true;
				}

			} catch (error) {
				// Product not found or unavailable
				if (error.response?.status === 404) {
					issues.push({
						productId: item.productId,
						productName: item.productName,
						issue: "product_unavailable",
					});

					// Remove unavailable product
					cartDoc.items.splice(i, 1);
					needsUpdate = true;

					// Log error to Kafka
					await publishEvent("analytics-events", {
						eventId: uuidv4(),
						eventType: "cart-validation-error",
						timestamp: new Date().toISOString(),
						payload: {
							userId,
							productId: item.productId,
							error: "product_unavailable",
						},
					});
				}
			}
		}

		// If cart was updated, save changes
		if (needsUpdate) {
			cartDoc.calculateTotals();
			await cartDoc.save();
			await setCartInRedis(userId, cartDoc.toObject());
		}

		res.json({
			valid: issues.length === 0,
			cart: cartDoc,
			issues,
		});

	} catch (error) {
		console.error("Error in validateCart controller:", error.message);
		res.status(500).json({ message: "Server error", error: error.message });
	}
};

// Clear cart by userId (Internal service-to-service call)
export const clearCartByUserId = async (req, res) => {
	try {
		const { userId } = req.params;

		// Verify internal service call using header secret
		const internalSecret = req.headers['x-internal-secret'];
		if (internalSecret !== process.env.INTERNAL_SERVICE_SECRET) {
			return res.status(403).json({ message: "Forbidden - Internal service access only" });
		}

		if (!userId) {
			return res.status(400).json({ message: "User ID is required" });
		}

		// Delete from MongoDB
		await Cart.findOneAndDelete({ userId });

		// Delete from Redis cache
		await deleteCartFromRedis(userId);

		console.log(`Cart cleared for userId: ${userId} (internal call)`);

		res.json({
			success: true,
			message: "Cart cleared successfully",
		});
	} catch (error) {
		console.error("Error in clearCartByUserId controller:", error.message);
		res.status(500).json({ message: "Server error", error: error.message });
	}
};
