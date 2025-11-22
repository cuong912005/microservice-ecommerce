import { sendEmail, emailTemplates } from "../lib/emailService.js";
import EmailLog from "../models/emailLog.model.js";

// Process email tasks from Kafka (Story 7.1)
export const processEmailTask = async (event) => {
	const { eventId, eventType, payload } = event;

	console.log(`Processing email task: ${eventType} (${eventId})`);

	// Check if already processed
	const existingLog = await EmailLog.findOne({ eventId });
	if (existingLog && existingLog.status === "sent") {
		console.log(`Email already sent for event ${eventId}`);
		return;
	}

	// Determine email type and content
	let emailContent;
	let recipient;
	let emailLog;

	try {
		switch (eventType) {
			case "send-welcome-email":
				recipient = payload.email;
				emailContent = emailTemplates.welcomeEmail(payload.name || "Customer");
				break;

			case "send-order-confirmation-email":
				recipient = payload.email;
				emailContent = emailTemplates.orderConfirmation({
					orderId: payload.orderId,
					totalAmount: payload.amount || payload.totalAmount,
					status: "Processing",
					products: payload.products || [],
				});
				break;

			case "send-payment-receipt":
				recipient = payload.email;
				emailContent = emailTemplates.paymentReceipt({
					transactionId: payload.transactionId,
					amount: payload.amount,
					paymentMethod: payload.paymentMethod || "Card",
				});
				break;

			case "send-shipping-notification":
				// For shipping notifications, we need to fetch user email
				// In a real implementation, we'd call Auth Service to get user email
				// For MVP, we'll skip if email is not in payload
				if (!payload.email) {
					console.log(`No email in payload for shipping notification ${eventId}`);
					return;
				}
				recipient = payload.email;
				emailContent = emailTemplates.shippingNotification({
					orderId: payload.orderId,
					status: payload.status || "Shipped",
					trackingNote: payload.trackingNote || "",
				});
				break;

			default:
				console.log(`Unknown email event type: ${eventType}`);
				return;
		}

		// Create or update email log
		emailLog = existingLog || new EmailLog({
			eventId,
			eventType,
			recipient,
			subject: emailContent.subject,
			status: "pending",
			payload,
		});

		emailLog.attempts += 1;
		emailLog.lastAttemptAt = new Date();
		emailLog.status = "retrying";

		await emailLog.save();

		// Send email via SendGrid
		const result = await sendEmail(
			recipient,
			emailContent.subject,
			emailContent.html,
			emailContent.text
		);

		// Update log with success
		emailLog.status = "sent";
		emailLog.sendgridMessageId = result.messageId;
		emailLog.sentAt = new Date();
		emailLog.error = undefined;

		await emailLog.save();

		console.log(`Email sent successfully: ${eventType} to ${recipient}`);
	} catch (error) {
		console.error(`Error sending email ${eventType}:`, error);

		if (emailLog) {
			emailLog.error = error.message;

			// Check if max retries reached
			if (emailLog.attempts >= emailLog.maxAttempts) {
				emailLog.status = "failed";
				console.error(`Max retries reached for email ${eventId}`);
			} else {
				emailLog.status = "pending";
				console.log(`Will retry email ${eventId} (attempt ${emailLog.attempts}/${emailLog.maxAttempts})`);
			}

			await emailLog.save();
		}

		// Don't throw - let consumer continue processing other messages
	}
};

// Retry failed emails (can be called periodically)
export const retryFailedEmails = async () => {
	try {
		const failedEmails = await EmailLog.find({
			status: "pending",
			attempts: { $lt: 3 },
			lastAttemptAt: { $lt: new Date(Date.now() - 5 * 60 * 1000) }, // 5 minutes ago
		}).limit(10);

		for (const emailLog of failedEmails) {
			const event = {
				eventId: emailLog.eventId,
				eventType: emailLog.eventType,
				payload: emailLog.payload,
			};

			await processEmailTask(event);
		}
	} catch (error) {
		console.error("Error retrying failed emails:", error);
	}
};
