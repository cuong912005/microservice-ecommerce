import mongoose from "mongoose";

const analyticsEventSchema = new mongoose.Schema(
	{
		eventType: {
			type: String,
			required: true,
			index: true,
			enum: [
				"user-registered",
				"user-login",
				"product-viewed",
				"product-created",
				"product-updated",
				"cart-item-added",
				"cart-item-removed",
				"order-created",
				"order-completed",
				"order-cancelled",
				"payment-completed",
				"payment-failed",
				"coupon-created",
				"coupon-used",
			],
		},
		userId: {
			type: String,
			index: true,
		},
		metadata: {
			type: mongoose.Schema.Types.Mixed,
			default: {},
		},
		timestamp: {
			type: Date,
			default: Date.now,
			index: true,
		},
	},
	{ timestamps: true }
);

// Indexes for common queries
analyticsEventSchema.index({ eventType: 1, timestamp: -1 });
analyticsEventSchema.index({ userId: 1, timestamp: -1 });
analyticsEventSchema.index({ timestamp: -1 });

const AnalyticsEvent = mongoose.model("AnalyticsEvent", analyticsEventSchema);

export default AnalyticsEvent;
