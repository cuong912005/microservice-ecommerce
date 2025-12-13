
import Order from "../models/order.model.js";
import { publishEvent } from "../lib/kafka.js";
import { v4 as uuidv4 } from "uuid";

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

			// Publish order-completed event for Cart & Analytics services
			try {
				await publishEvent("order-events", {
					eventId: uuidv4(),
					eventType: "order-completed",
					timestamp: new Date().toISOString(),
					payload: {
						orderId: order._id.toString(),
						userId,
						totalAmount: order.totalAmount,
						products: order.products,
						paymentStatus: "paid",
					},
				});
				console.log(`Order completed event published for user ${userId}`);
			} catch (eventError) {
				console.error("Failed to publish order-completed event:", eventError.message);
				// Don't fail the payment update if event publish fails
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
