import axios from "axios";

// Retry configuration
const retryConfig = {
	retries: 3,
	retryDelay: (retryCount) => retryCount * 1000,
};

// Create axios instance with retry logic
const createServiceClient = (baseURL) => {
	const client = axios.create({
		baseURL,
		timeout: 10000,
		headers: {
			"Content-Type": "application/json",
		},
	});

	// Add retry interceptor
	client.interceptors.response.use(
		(response) => response,
		async (error) => {
			const config = error.config;

			if (!config || !config.retry) {
				config.retry = { count: 0 };
			}

			if (config.retry.count >= retryConfig.retries) {
				return Promise.reject(error);
			}

			config.retry.count += 1;

			const delay = retryConfig.retryDelay(config.retry.count);
			await new Promise((resolve) => setTimeout(resolve, delay));

			return client(config);
		}
	);

	return client;
};

// Cart Service Client
const cartClient = createServiceClient(process.env.CART_SERVICE_URL);

export const getCart = async (userId, token) => {
	try {
		const url = `/api/cart/`;
		console.log("Cart Service - Request:", {
			baseURL: process.env.CART_SERVICE_URL,
			url,
			userId,
			hasToken: !!token,
		});
		
		const response = await cartClient.get(url, {
			headers: {
				Authorization: `Bearer ${token}`,
			},
		});
		
		console.log("Cart Service - Response:", response.status, response.data);
		return response.data;
	} catch (error) {
		console.error("Cart Service - Error:", {
			message: error.message,
			status: error.response?.status,
			data: error.response?.data,
			url: error.config?.url,
		});
		throw error;
	}
};

export const clearCart = async (userId, token) => {
	try {
		const response = await cartClient.delete(`/api/cart/`, {
			headers: {
				Authorization: `Bearer ${token}`,
			},
		});
		return response.data;
	} catch (error) {
		console.error("Error clearing cart:", error.message);
		throw error;
	}
};

// Product Service Client
const productClient = createServiceClient(process.env.PRODUCT_SERVICE_URL);

export const getProduct = async (productId) => {
	try {
		const response = await productClient.get(`/api/products/${productId}`);
		return response.data;
	} catch (error) {
		console.error(`Error fetching product ${productId}:`, error.message);
		throw error;
	}
};

export const updateProductStock = async (productId, quantity, token) => {
	try {
		// Note: This would require a stock management endpoint in Product Service
		// For MVP, we'll skip actual stock reduction
		console.log(`Stock update skipped for product ${productId}: -${quantity}`);
		return { success: true };
	} catch (error) {
		console.error(`Error updating product stock ${productId}:`, error.message);
		throw error;
	}
};

// Payment Service Client
const paymentClient = createServiceClient(process.env.PAYMENT_SERVICE_URL);

export const createPaymentSession = async (orderData, token) => {
	try {
		const response = await paymentClient.post(
			"/api/payments/create-checkout-session",
			orderData,
			{
				headers: {
					Authorization: `Bearer ${token}`,
				},
			}
		);
		return response.data;
	} catch (error) {
		console.error("Error creating payment session:", error.message);
		throw error;
	}
};
