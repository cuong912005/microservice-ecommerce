import { Kafka } from 'kafkajs';

const kafka = new Kafka({
	clientId: 'auth-service',
	brokers: process.env.KAFKA_BROKERS.split(','),
	retry: {
		initialRetryTime: 100,
		retries: 8
	}
});

const producer = kafka.producer();

let isConnected = false;

export const connectKafkaProducer = async () => {
	try {
		await producer.connect();
		isConnected = true;
		console.log('Kafka producer connected successfully');
	} catch (error) {
		console.error('Error connecting Kafka producer:', error);
		isConnected = false;
	}
};

export const disconnectKafkaProducer = async () => {
	if (isConnected) {
		await producer.disconnect();
		isConnected = false;
		console.log('Kafka producer disconnected');
	}
};

export const publishEvent = async (topic, event) => {
	if (!isConnected) {
		console.warn('Kafka producer not connected, skipping event:', event);
		return;
	}

	try {
		await producer.send({
			topic,
			messages: [
				{
					key: event.eventId,
					value: JSON.stringify(event),
					headers: {
						'event-type': event.eventType,
					},
				},
			],
		});
		console.log(`Event published to ${topic}:`, event.eventType);
	} catch (error) {
		console.error(`Error publishing event to ${topic}:`, error);
		throw error;
	}
};

// Helper function to create event envelope
export const createEvent = (eventType, payload) => {
	return {
		eventId: `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
		eventType,
		timestamp: new Date().toISOString(),
		service: 'auth-service',
		payload,
	};
};
