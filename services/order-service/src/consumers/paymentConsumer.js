
import Order from "../models/order.model.js";
import { clearCartInternal } from "../lib/serviceClients.js";

// Process payment event
export const processPaymentEvent = async (event) => {
	try {
		const { eventType, payload } = event;

		console.log(`Processing payment event: ${eventType}`, payload);

		switch (eventType) {
			case "payment-status-updated":
				await handlePaymentStatusUpdate(payload);
				break;

			case "payment-refunded":
				await handlePaymentRefund(payload);
				break;

			default:
				console.log(`Unhandled payment event type: ${eventType}`);
		}
	} catch (error) {
		console.error("Error processing payment event:", error);
		throw error; // Let Kafka retry
	}
};

// Handle payment status update
async function handlePaymentStatusUpdate(payload) {
	const { orderId, stripeSessionId, status, userId } = payload;

	try {
		// Find order by orderId or stripeSessionId
		let order;
		if (orderId) {
			order = await Order.findById(orderId);
		} else if (stripeSessionId) {
			order = await Order.findOne({ stripeSessionId });
		}

		if (!order) {
			console.warn(`Order not found for payment update:`, payload);
			return;
		}

		// Update payment status
		const oldPaymentStatus = order.paymentStatus;
		
		if (status === "succeeded") {
			order.paymentStatus = "paid";
			order.addStatusChange(
				order.status, 
				`Payment completed successfully`
			);
			
			// Auto-advance order to processing if still pending
			if (order.status === "pending") {
				order.status = "processing";
				order.addStatusChange("processing", "Payment received, order is being processed");
			}

			// Clear cart after successful payment (internal service call)
			try {
				await clearCartInternal(userId);
				console.log(`Cart cleared for user ${userId} after successful payment`);
			} catch (clearError) {
				console.error("Failed to clear cart after payment:", clearError.message);
				// Don't fail the payment update if cart clear fails
				// Cart will remain but order is completed
			}
		} else if (status === "failed") {
			order.paymentStatus = "failed";
			order.addStatusChange(
				order.status,
				`Payment failed: ${payload.reason || "Unknown error"}`
			);
		}

		await order.save();

		console.log(`Order ${order._id} payment status updated: ${oldPaymentStatus} → ${order.paymentStatus}`);
	} catch (error) {
		console.error("Error handling payment status update:", error);
		throw error;
	}
}

// Handle payment refund
async function handlePaymentRefund(payload) {
	const { orderId, stripeSessionId, refundId } = payload;

	try {
		// Find order
		let order;
		if (orderId) {
			order = await Order.findById(orderId);
		} else if (stripeSessionId) {
			order = await Order.findOne({ stripeSessionId });
		}

		if (!order) {
			console.warn(`Order not found for refund:`, payload);
			return;
		}

		// Update payment status
		order.paymentStatus = "refunded";
		order.addStatusChange(
			order.status,
			`Payment refunded (Refund ID: ${refundId})`
		);

		// If order is not already cancelled, cancel it
		if (order.status !== "cancelled") {
			order.status = "cancelled";
			order.addStatusChange("cancelled", "Order cancelled due to payment refund");
		}

		await order.save();

		console.log(`Order ${order._id} payment refunded`);
	} catch (error) {
		console.error("Error handling payment refund:", error);
		throw error;
	}
}
