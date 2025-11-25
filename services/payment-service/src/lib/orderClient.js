import axios from "axios";

const orderClient = axios.create({
	baseURL: process.env.ORDER_SERVICE_URL,
	timeout: 10000,
	headers: {
		"Content-Type": "application/json",
	},
});

// Retry logic for failed requests
orderClient.interceptors.response.use(
	(response) => response,
	async (error) => {
		const config = error.config;

		// Retry up to 3 times
		if (!config.__retryCount) {
			config.__retryCount = 0;
		}

		if (config.__retryCount >= 3) {
			return Promise.reject(error);
		}

		config.__retryCount += 1;

		// Wait before retrying
		const delay = new Promise((resolve) => setTimeout(resolve, 1000 * config.__retryCount));
		await delay;

		return orderClient(config);
	}
);

// Create order after successful payment
export const createOrder = async (orderData, token) => {
	try {
		const response = await orderClient.post("/api/orders", orderData, {
			headers: {
				Authorization: `Bearer ${token}`,
			},
		});
		return response.data;
	} catch (error) {
		console.error("Error creating order:", error.message);
		throw error;
	}
};
