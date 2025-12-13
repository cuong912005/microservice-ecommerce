import { Kafka } from "kafkajs";
import { processOrderEvent } from "../consumers/orderConsumer.js";

const kafka = new Kafka({
	clientId: "cart-service",
	brokers: process.env.KAFKA_BROKERS.split(","),
	retry: {
		initialRetryTime: 100,
		retries: 8,
	},
});

export const producer = kafka.producer();

// Order events consumer
const orderConsumer = kafka.consumer({
	groupId: process.env.KAFKA_GROUP_ID || "cart-service-group",
});

export const connectKafka = async () => {
	try {
		// Connect producer
		await producer.connect();
		console.log("Kafka producer connected successfully");

		// Connect consumer for order events
		await orderConsumer.connect();
		console.log("Kafka order consumer connected successfully");

		await orderConsumer.subscribe({
			topic: "order-events",
			fromBeginning: false,
		});

		// Start consuming order events
		await orderConsumer.run({
			eachMessage: async ({ topic, partition, message }) => {
				try {
					const event = JSON.parse(message.value.toString());
					console.log(`[Cart Service] Processing order event: ${event.eventType}`);
					await processOrderEvent(event);
				} catch (error) {
					console.error("[Cart Service] Error processing order event:", error);
					// Don't throw - let consumer continue
				}
			},
		});

		console.log("Cart Service listening to order-events topic");
	} catch (error) {
		console.error("Error connecting to Kafka:", error.message);
		// Don't exit process, allow service to work without Kafka
		// Retry connection after delay
		setTimeout(() => {
			console.log("Attempting to reconnect to Kafka...");
			connectKafka();
		}, 5000);
	}
};

export const disconnectKafka = async () => {
	try {
		await producer.disconnect();
		await orderConsumer.disconnect();
		console.log("Kafka producer and consumer disconnected");
	} catch (error) {
		console.error("Error disconnecting from Kafka:", error);
	}
};

// Publish event to Kafka
export const publishEvent = async (topic, event) => {
	try {
		await producer.send({
			topic,
			messages: [
				{
					key: event.eventId,
					value: JSON.stringify(event),
				},
			],
		});
		console.log(`Event published to ${topic}:`, event.eventType);
	} catch (error) {
		console.error(`Error publishing event to ${topic}:`, error.message);
	}
};
