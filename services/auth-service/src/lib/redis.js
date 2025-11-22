import Redis from "ioredis";

export const redis = new Redis(process.env.REDIS_URL, {
	maxRetriesPerRequest: 3,
	retryStrategy(times) {
		const delay = Math.min(times * 50, 2000);
		return delay;
	},
});

redis.on('error', (err) => {
	console.error('Redis Client Error:', err);
});

redis.on('connect', () => {
	console.log('Redis connected successfully');
});
