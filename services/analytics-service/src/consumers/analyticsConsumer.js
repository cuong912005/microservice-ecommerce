import AnalyticsEvent from "../models/analyticsEvent.model.js";

// Process analytics events
export const processAnalyticsEvent = async (event) => {
	try {
		const { eventType, payload, timestamp } = event;

		console.log(`Processing analytics event: ${eventType}`, payload);

		// Store event in MongoDB
		const analyticsEvent = new AnalyticsEvent({
			eventType,
			userId: payload?.userId,
			metadata: payload || {},
			timestamp: timestamp ? new Date(timestamp) : new Date(),
		});

		await analyticsEvent.save();
		console.log(`Analytics event stored: ${eventType} for user ${payload?.userId || 'N/A'}`);
	} catch (error) {
		console.error("Error processing analytics event:", error);
		throw error; // Let Kafka retry
	}
};
