import { Kafka } from "kafkajs";

const kafka = new Kafka({
	clientId: "cart-service",
	brokers: process.env.KAFKA_BROKERS.split(","),
	retry: {
		initialRetryTime: 100,
		retries: 8,
	},
});

export const producer = kafka.producer();

export const connectKafka = async () => {
	try {
		await producer.connect();
		console.log("Kafka producer connected successfully");
	} catch (error) {
		console.error("Error connecting to Kafka:", error.message);
		// Don't exit process, allow service to work without Kafka
	}
};

export const disconnectKafka = async () => {
	try {
		await producer.disconnect();
		console.log("Kafka producer disconnected");
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
