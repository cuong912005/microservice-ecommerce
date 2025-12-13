import { Kafka } from "kafkajs";
import { processEmailTask } from "../workers/emailWorker.js";
import { processNotificationTask } from "../workers/notificationWorker.js";

const kafka = new Kafka({
	clientId: "worker-service",
	brokers: process.env.KAFKA_BROKERS.split(","),
	retry: {
		initialRetryTime: 100,
		retries: 8,
	},
});

// Email tasks consumer
const emailConsumer = kafka.consumer({
	groupId: process.env.KAFKA_GROUP_ID || "worker-service-group",
});

// Notification tasks consumer
const notificationConsumer = kafka.consumer({
	groupId: process.env.KAFKA_GROUP_ID || "worker-service-group",
});

export const connectKafkaConsumers = async () => {
	try {
		// Connect email consumer
		await emailConsumer.connect();
		console.log("Email consumer connected successfully");

		await emailConsumer.subscribe({
			topic: "email-tasks",
			fromBeginning: false,
		});

		// Start consuming email tasks
		await emailConsumer.run({
			eachMessage: async ({ topic, partition, message }) => {
				try {
					const event = JSON.parse(message.value.toString());
					console.log(`Processing email task: ${event.eventType}`);
					await processEmailTask(event);
				} catch (error) {
					console.error("Error processing email task:", error);
					
				}
			},
		});

		// Connect notification consumer
		await notificationConsumer.connect();
		console.log("Notification consumer connected successfully");

		await notificationConsumer.subscribe({
			topic: "notification-tasks",
			fromBeginning: false,
		});

		// Start consuming notification tasks
		await notificationConsumer.run({
			eachMessage: async ({ topic, partition, message }) => {
				try {
					const event = JSON.parse(message.value.toString());
					console.log(`Processing notification task: ${event.eventType}`);
					await processNotificationTask(event);
				} catch (error) {
					console.error("Error processing notification task:", error);
					// Don't throw - let consumer continue
				}
			},
		});

		console.log("Kafka consumers running and listening for tasks...");
	} catch (error) {
		console.error("Error connecting to Kafka:", error.message);
		// Don't exit process - try to reconnect
		setTimeout(() => {
			console.log("Attempting to reconnect to Kafka...");
			connectKafkaConsumers();
		}, 5000);
	}
};

export const disconnectKafka = async () => {
	try {
		await emailConsumer.disconnect();
		await notificationConsumer.disconnect();
		console.log("Kafka consumers disconnected");
	} catch (error) {
		console.error("Error disconnecting from Kafka:", error);
	}
};
