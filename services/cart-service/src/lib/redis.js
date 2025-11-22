import Redis from "ioredis";

export const redis = new Redis(process.env.REDIS_URL, {
	maxRetriesPerRequest: 3,
	enableReadyCheck: true,
	retryStrategy(times) {
		const delay = Math.min(times * 50, 2000);
		return delay;
	},
	reconnectOnError(err) {
		const targetError = "READONLY";
		if (err.message.includes(targetError)) {
			// Only reconnect when the error contains "READONLY"
			return true;
		}
		return false;
	},
});

redis.on("connect", () => {
	console.log("Redis connected successfully");
});

redis.on("error", (error) => {
	console.error("Redis connection error:", error);
});

// Helper functions for cart operations in Redis
export const getCartFromRedis = async (userId) => {
	try {
		const cartData = await redis.get(`cart:${userId}`);
		return cartData ? JSON.parse(cartData) : null;
	} catch (error) {
		console.error("Error getting cart from Redis:", error);
		return null;
	}
};

export const setCartInRedis = async (userId, cart, ttl = 604800) => {
	try {
		// TTL default 7 days (604800 seconds)
		await redis.setex(`cart:${userId}`, ttl, JSON.stringify(cart));
		return true;
	} catch (error) {
		console.error("Error setting cart in Redis:", error);
		return false;
	}
};

export const deleteCartFromRedis = async (userId) => {
	try {
		await redis.del(`cart:${userId}`);
		return true;
	} catch (error) {
		console.error("Error deleting cart from Redis:", error);
		return false;
	}
};
