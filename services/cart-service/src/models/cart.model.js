import mongoose from "mongoose";

const cartItemSchema = new mongoose.Schema({
	productId: {
		type: String,
		required: true,
	},
	quantity: {
		type: Number,
		required: true,
		min: 1,
		default: 1,
	},
	// Cached product data for faster retrieval
	productName: String,
	productPrice: Number,
	productImage: String,
	productCategory: String,
	// Timestamp for tracking when item was added
	addedAt: {
		type: Date,
		default: Date.now,
	},
});

const cartSchema = new mongoose.Schema(
	{
		userId: {
			type: String,
			required: true,
			unique: true,
			index: true,
		},
		items: [cartItemSchema],
		// Total items count (for quick access)
		totalItems: {
			type: Number,
			default: 0,
		},
		// Subtotal amount (cached for performance)
		subtotal: {
			type: Number,
			default: 0,
		},
		// Last updated timestamp
		lastUpdated: {
			type: Date,
			default: Date.now,
		},
		// Expiry for abandoned cart cleanup
		expiresAt: {
			type: Date,
			index: true,
		},
	},
	{ timestamps: true }
);

// Update lastUpdated and expiresAt before save
cartSchema.pre('save', function(next) {
	this.lastUpdated = new Date();
	// Set expiry to 7 days from now
	const expiryDays = parseInt(process.env.CART_EXPIRY_DAYS) || 7;
	this.expiresAt = new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000);
	next();
});

// Calculate totals
cartSchema.methods.calculateTotals = function() {
	this.totalItems = this.items.reduce((sum, item) => sum + item.quantity, 0);
	this.subtotal = this.items.reduce((sum, item) => sum + (item.productPrice * item.quantity), 0);
};

const Cart = mongoose.model("Cart", cartSchema);

export default Cart;
