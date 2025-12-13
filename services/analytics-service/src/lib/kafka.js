import { Kafka } from "kafkajs";
import { processAnalyticsEvent } from "../consumers/analyticsConsumer.js";

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

		// Subscribe to multiple topics
		await consumer.subscribe({
			topics: ["analytics-events", "order-events"],
			fromBeginning: false,
		});

		await consumer.run({
			eachMessage: async ({ topic, partition, message }) => {
				try {
					const event = JSON.parse(message.value.toString());
					console.log(`[Analytics Service] Processing event from ${topic}: ${event.eventType}`);
					await processAnalyticsEvent(event);
				} catch (error) {
					console.error("[Analytics Service] Error processing event:", error);
					
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
