import Notification from "../models/notification.model.js";

// Process notification tasks from Kafka (Story 7.2)
export const processNotificationTask = async (event) => {
	const { eventId, eventType, payload } = event;

	console.log(`Processing notification task: ${eventType} (${eventId})`);

	try {
		let notification;

		switch (eventType) {
			case "send-shipping-notification":
				notification = new Notification({
					userId: payload.userId,
					type: "shipping",
					title: "Order Shipped",
					message: `Your order #${payload.orderId} has been shipped. Status: ${payload.status}`,
					data: {
						orderId: payload.orderId,
						status: payload.status,
						trackingNote: payload.trackingNote || "",
					},
				});
				break;

			case "send-delivery-notification":
				notification = new Notification({
					userId: payload.userId,
					type: "delivery",
					title: "Order Delivered",
					message: `Your order #${payload.orderId} has been delivered successfully!`,
					data: {
						orderId: payload.orderId,
						status: "delivered",
					},
				});
				break;

			case "low-stock-alert":
				// Admin notification for low stock
				notification = new Notification({
					userId: payload.adminId || "admin",
					type: "low_stock",
					title: "Low Stock Alert",
					message: `Product "${payload.productName}" is running low on stock. Current quantity: ${payload.quantity}`,
					data: {
						productId: payload.productId,
						productName: payload.productName,
						quantity: payload.quantity,
					},
				});
				break;

			case "send-abandoned-cart-reminder":
				notification = new Notification({
					userId: payload.userId,
					type: "promotion",
					title: "Don't Forget Your Cart",
					message: `You have ${payload.itemsCount} item(s) in your cart. Complete your purchase now!`,
					data: {
						cartId: payload.cartId,
						itemsCount: payload.itemsCount,
					},
				});
				break;

			default:
				console.log(`Unknown notification event type: ${eventType}`);
				return;
		}

		if (notification) {
			await notification.save();
			console.log(`Notification created: ${eventType} for user ${notification.userId}`);
		}
	} catch (error) {
		console.error(`Error processing notification ${eventType}:`, error);
		// Don't throw - let consumer continue processing other messages
	}
};
