import axios from "axios";

const productClient = axios.create({
	baseURL: process.env.PRODUCT_SERVICE_URL,
	timeout: 5000,
	headers: {
		"Content-Type": "application/json",
	},
});

// Retry logic for failed requests
productClient.interceptors.response.use(
	(response) => response,
	async (error) => {
		const config = error.config;

		// Retry  3 times
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

		return productClient(config);
	}
);

// Get product by ID
export const getProductById = async (productId) => {
	try {
		const response = await productClient.get(`/api/products/${productId}`);
		return response.data;
	} catch (error) {
		console.error(`Error fetching product ${productId}:`, error.message);
		throw error;
	}
};

// Get multiple products by IDs
export const getProductsByIds = async (productIds) => {
	try {
		
		const promises = productIds.map(id => getProductById(id));
		const products = await Promise.allSettled(promises);
		
		return products
			.filter(result => result.status === 'fulfilled')
			.map(result => result.value);
	} catch (error) {
		console.error("Error fetching multiple products:", error.message);
		throw error;
	}
};

// Validate product exists and get details
export const validateProduct = async (productId) => {
	try {
		const product = await getProductById(productId);
		return {
			exists: true,
			product,
		};
	} catch (error) {
		if (error.response?.status === 404) {
			return {
				exists: false,
				product: null,
			};
		}
		throw error;
	}
};
