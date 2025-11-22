import { Kafka } from "kafkajs";

const kafka = new Kafka({
	clientId: "coupon-service",
	brokers: process.env.KAFKA_BROKERS.split(","),
	retry: {
		initialRetryTime: 100,
		retries: 8,
	},
});

const consumer = kafka.consumer({
	groupId: process.env.KAFKA_GROUP_ID || "coupon-service-group",
});

const producer = kafka.producer();

// Import the handler function (will be defined in controller)
let orderCompletedHandler;

export const setOrderCompletedHandler = (handler) => {
	orderCompletedHandler = handler;
};

export const connectKafkaConsumer = async () => {
	try {
		await consumer.connect();
		console.log("Coupon Kafka consumer connected successfully");

		await consumer.subscribe({
			topic: "analytics-events",
			fromBeginning: false,
		});

		await consumer.run({
			eachMessage: async ({ topic, partition, message }) => {
				try {
					const event = JSON.parse(message.value.toString());
					
					// Only process order-completed events
					if (event.eventType === "order-completed" && orderCompletedHandler) {
						console.log(`Processing order-completed event for loyalty coupon`);
						await orderCompletedHandler(event);
					}
				} catch (error) {
					console.error("Error processing Kafka event:", error);
				}
			},
		});

		console.log("Coupon consumer running and listening for order-completed events...");
	} catch (error) {
		console.error("Error connecting to Kafka:", error.message);
		setTimeout(() => {
			console.log("Attempting to reconnect to Kafka...");
			connectKafkaConsumer();
		}, 5000);
	}
};

export const connectKafkaProducer = async () => {
	try {
		await producer.connect();
		console.log("Kafka producer connected successfully");
	} catch (error) {
		console.error("Error connecting Kafka producer:", error.message);
	}
};

export const produceEvent = async (topic, event) => {
	try {
		await producer.send({
			topic,
			messages: [
				{
					value: JSON.stringify(event),
				},
			],
		});
		console.log(`Event produced to ${topic}: ${event.eventType}`);
	} catch (error) {
		console.error("Error producing Kafka event:", error);
	}
};

export const disconnectKafka = async () => {
	try {
		await consumer.disconnect();
		await producer.disconnect();
		console.log("Kafka disconnected");
	} catch (error) {
		console.error("Error disconnecting from Kafka:", error);
	}
};
