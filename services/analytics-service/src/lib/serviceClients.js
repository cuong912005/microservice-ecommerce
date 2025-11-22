import axios from "axios";

const ORDER_SERVICE_URL = process.env.ORDER_SERVICE_URL || "http://order-service:3005";
const PRODUCT_SERVICE_URL = process.env.PRODUCT_SERVICE_URL || "http://product-service:3002";
const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL || "http://auth-service:3001";

// Create axios instance with retry logic
const createServiceClient = (baseURL) => {
	const client = axios.create({
		baseURL,
		timeout: 5000,
		headers: {
			"Content-Type": "application/json",
		},
	});

	// Add retry logic
	client.interceptors.response.use(
		(response) => response,
		async (error) => {
			const config = error.config;
			if (!config || !config.retry) {
				config.retry = 0;
			}

			if (config.retry < 3 && error.response?.status >= 500) {
				config.retry += 1;
				const delay = Math.min(1000 * Math.pow(2, config.retry), 5000);
				await new Promise((resolve) => setTimeout(resolve, delay));
				return client(config);
			}

			return Promise.reject(error);
		}
	);

	return client;
};

export const orderServiceClient = createServiceClient(ORDER_SERVICE_URL);
export const productServiceClient = createServiceClient(PRODUCT_SERVICE_URL);
export const authServiceClient = createServiceClient(AUTH_SERVICE_URL);

// Validate token with Auth Service
export const validateToken = async (token) => {
	try {
		const response = await authServiceClient.get("/auth/validate-token", {
			headers: {
				Authorization: `Bearer ${token}`,
			},
		});
		return response.data;
	} catch (error) {
		console.error("Token validation error:", error.message);
		return null;
	}
};
