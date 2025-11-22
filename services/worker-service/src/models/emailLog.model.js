import mongoose from "mongoose";

const emailLogSchema = new mongoose.Schema(
	{
		eventId: {
			type: String,
			required: true,
			unique: true,
			index: true,
		},
		eventType: {
			type: String,
			required: true,
			index: true,
		},
		recipient: {
			type: String,
			required: true,
			index: true,
		},
		subject: {
			type: String,
			required: true,
		},
		status: {
			type: String,
			enum: ["pending", "sent", "failed", "retrying"],
			default: "pending",
			index: true,
		},
		attempts: {
			type: Number,
			default: 0,
		},
		maxAttempts: {
			type: Number,
			default: 3,
		},
		sendgridMessageId: String,
		error: String,
		payload: {
			type: mongoose.Schema.Types.Mixed,
		},
		sentAt: Date,
		lastAttemptAt: Date,
	},
	{ timestamps: true }
);

// Index for querying email logs
emailLogSchema.index({ status: 1, createdAt: -1 });
emailLogSchema.index({ recipient: 1, createdAt: -1 });

const EmailLog = mongoose.model("EmailLog", emailLogSchema);

export default EmailLog;
