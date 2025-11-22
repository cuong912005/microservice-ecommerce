import { Kafka } from "kafkajs";
import AnalyticsEvent from "../models/analyticsEvent.model.js";

const kafka = new Kafka({
	clientId: "analytics-service",
	brokers: process.env.KAFKA_BROKERS.split(","),
	retry: {
		initialRetryTime: 100,
		retries: 8,
	},
});

const consumer = kafka.consumer({
	groupId: process.env.KAFKA_GROUP_ID || "analytics-service-group",
});

export const connectKafkaConsumer = async () => {
	try {
		await consumer.connect();
		console.log("Analytics Kafka consumer connected successfully");

		await consumer.subscribe({
			topic: "analytics-events",
			fromBeginning: false,
		});

		await consumer.run({
			eachMessage: async ({ topic, partition, message }) => {
				try {
					const event = JSON.parse(message.value.toString());
					console.log(`Processing analytics event: ${event.eventType}`);

					// Store event in MongoDB
					const analyticsEvent = new AnalyticsEvent({
						eventType: event.eventType,
						userId: event.payload?.userId,
						metadata: event.payload || {},
						timestamp: event.timestamp ? new Date(event.timestamp) : new Date(),
					});

					await analyticsEvent.save();
					console.log(`Analytics event stored: ${event.eventType}`);
				} catch (error) {
					console.error("Error processing analytics event:", error);
				}
			},
		});

		console.log("Analytics consumer running and listening for events...");
	} catch (error) {
		console.error("Error connecting to Kafka:", error.message);
		setTimeout(() => {
			console.log("Attempting to reconnect to Kafka...");
			connectKafkaConsumer();
		}, 5000);
	}
};

export const disconnectKafka = async () => {
	try {
		await consumer.disconnect();
		console.log("Kafka consumer disconnected");
	} catch (error) {
		console.error("Error disconnecting from Kafka:", error);
	}
};
