import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema(
	{
		userId: {
			type: String,
			required: true,
			index: true,
		},
		type: {
			type: String,
			required: true,
			enum: [
				"order_status",
				"shipping",
				"delivery",
				"low_stock",
				"promotion",
				"system",
			],
			index: true,
		},
		title: {
			type: String,
			required: true,
		},
		message: {
			type: String,
			required: true,
		},
		data: {
			type: mongoose.Schema.Types.Mixed,
		},
		isRead: {
			type: Boolean,
			default: false,
			index: true,
		},
		readAt: Date,
	},
	{ timestamps: true }
);

// Index for querying user notifications
notificationSchema.index({ userId: 1, createdAt: -1 });
notificationSchema.index({ userId: 1, isRead: 1, createdAt: -1 });

const Notification = mongoose.model("Notification", notificationSchema);

export default Notification;
