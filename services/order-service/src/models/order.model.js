import mongoose from "mongoose";

const productSchema = new mongoose.Schema({
	product: {
		type: String,
		required: true,
	},
	productId: {
		type: String,
		required: true,
	},
	quantity: {
		type: Number,
		required: true,
		min: 1,
	},
	price: {
		type: Number,
		required: true,
		min: 0,
	},
	name: String,
	image: String,
});

const orderSchema = new mongoose.Schema(
	{
		userId: {
			type: String,
			required: true,
			index: true,
		},
		products: [productSchema],
		totalAmount: {
			type: Number,
			required: true,
			min: 0,
		},
		status: {
			type: String,
			enum: ["pending", "processing", "shipped", "delivered", "cancelled"],
			default: "pending",
			index: true,
		},
		// Payment information
		stripeSessionId: {
			type: String,
			index: true,
		},
		paymentStatus: {
			type: String,
			enum: ["pending", "paid", "failed", "refunded"],
			default: "pending",
		},
		// Coupon information
		couponCode: String,
		couponDiscount: {
			type: Number,
			default: 0,
		},
		// Shipping information
		shippingAddress: {
			street: String,
			city: String,
			state: String,
			zipCode: String,
			country: String,
		},
		// Status history
		statusHistory: [{
			status: String,
			timestamp: Date,
			note: String,
		}],
	},
	{ timestamps: true }
);

// Index for querying user orders
orderSchema.index({ userId: 1, createdAt: -1 });

// Index for status queries
orderSchema.index({ status: 1, createdAt: -1 });

// Add status change to history
orderSchema.methods.addStatusChange = function(status, note = "") {
	this.statusHistory.push({
		status,
		timestamp: new Date(),
		note,
	});
};

const Order = mongoose.model("Order", orderSchema);

export default Order;
