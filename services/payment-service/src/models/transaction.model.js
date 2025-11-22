import mongoose from "mongoose";

const productSchema = new mongoose.Schema({
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

const transactionSchema = new mongoose.Schema(
	{
		userId: {
			type: String,
			required: true,
			index: true,
		},
		stripeSessionId: {
			type: String,
			required: true,
			unique: true,
			index: true,
		},
		stripePaymentIntentId: {
			type: String,
			index: true,
		},
		amount: {
			type: Number,
			required: true,
			min: 0,
		},
		currency: {
			type: String,
			default: "usd",
		},
		status: {
			type: String,
			enum: ["pending", "processing", "succeeded", "failed", "canceled", "refunded"],
			default: "pending",
			index: true,
		},
		products: [productSchema],
		couponCode: String,
		couponDiscount: {
			type: Number,
			default: 0,
		},
		// Payment metadata
		paymentMethod: String,
		customerEmail: String,
		// Order reference
		orderId: {
			type: String,
			index: true,
		},
		// Stripe webhook events
		webhookEvents: [{
			eventType: String,
			eventId: String,
			timestamp: Date,
		}],
	},
	{ timestamps: true }
);

// Index for querying user transactions
transactionSchema.index({ userId: 1, createdAt: -1 });

// Index for payment status queries
transactionSchema.index({ status: 1, createdAt: -1 });

const Transaction = mongoose.model("Transaction", transactionSchema);

export default Transaction;
