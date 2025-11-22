import axios from 'axios';

// Create axios instance for auth service calls
const authServiceClient = axios.create({
	baseURL: process.env.AUTH_SERVICE_URL,
	timeout: 5000,
	headers: {
		'Content-Type': 'application/json',
	},
});

// Validate user token with Auth Service
export const validateToken = async (token) => {
	try {
		const response = await authServiceClient.get('/auth/validate-token', {
			headers: {
				Authorization: `Bearer ${token}`,
			},
		});
		return response.data;
	} catch (error) {
		if (error.response) {
			throw new Error(error.response.data.message || 'Token validation failed');
		}
		throw new Error('Auth service unavailable');
	}
};
