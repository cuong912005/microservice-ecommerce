import { Kafka } from "kafkajs";
import { processPaymentEvent } from "../consumers/paymentConsumer.js";

const kafka = new Kafka({
	clientId: "order-service",
	brokers: process.env.KAFKA_BROKERS.split(","),
	retry: {
		initialRetryTime: 100,
		retries: 8,
	},
});

export const producer = kafka.producer();

// Payment events consumer
const paymentConsumer = kafka.consumer({
	groupId: process.env.KAFKA_GROUP_ID || "order-service-group",
});

export const connectKafka = async () => {
	try {
		// Connect producer
		await producer.connect();
		console.log("Kafka producer connected successfully");

		// Connect consumer for payment events
		await paymentConsumer.connect();
		console.log("Kafka payment consumer connected successfully");

		await paymentConsumer.subscribe({
			topic: "payment-events",
			fromBeginning: false,
		});

		// Start consuming payment events
		await paymentConsumer.run({
			eachMessage: async ({ topic, partition, message }) => {
				try {
					const event = JSON.parse(message.value.toString());
					console.log(`[Order Service] Processing payment event: ${event.eventType}`);
					await processPaymentEvent(event);
				} catch (error) {
					console.error("[Order Service] Error processing payment event:", error);
					// Don't throw - let consumer continue
				}
			},
		});

		console.log("Order Service listening to payment-events topic");
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
		await paymentConsumer.disconnect();
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
