import Cart from "../models/cart.model.js";

// Process order events
export const processOrderEvent = async (event) => {
	try {
		const { eventType, payload } = event;

		console.log(`Processing order event: ${eventType}`, payload);

		switch (eventType) {
			case "order-completed":
				await handleOrderCompleted(payload);
				break;

			default:
				console.log(`Unhandled order event type: ${eventType}`);
		}
	} catch (error) {
		console.error("Error processing order event:", error);
		throw error; // Let Kafka retry
	}
};

// Handle order completed - clear user's cart
async function handleOrderCompleted(payload) {
	const { userId, orderId } = payload;

	try {
		// Delete cart for user
		const result = await Cart.findOneAndDelete({ user: userId });

		if (result) {
			console.log(`Cart cleared for user ${userId} after order ${orderId} completed`);
		} else {
			console.log(`No cart found for user ${userId} - may have been already cleared`);
		}
	} catch (error) {
		console.error("Error clearing cart after order completion:", error);
		throw error;
	}
}
