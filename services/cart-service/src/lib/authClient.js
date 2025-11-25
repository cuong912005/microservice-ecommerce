import axios from "axios";

const authClient = axios.create({
	baseURL: process.env.AUTH_SERVICE_URL,
	timeout: 5000,
	headers: {
		"Content-Type": "application/json",
	},
});

// Validate token with Auth Service
export const validateToken = async (token) => {
	try {
		const response = await authClient.get("/api/auth/validate-token", {
			headers: {
				Authorization: `Bearer ${token}`,
			},
		});
		return response.data;
	} catch (error) {
		console.error("Error validating token:", error.message);
		throw error;
	}
};
