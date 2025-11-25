import { validateToken } from "../lib/authClient.js";

export const protectRoute = async (req, res, next) => {
	try {
		// Get token from cookie or Authorization header
		const token = req.cookies?.accessToken || req.headers.authorization?.split(" ")[1];
		
		if (!token) {
			return res.status(401).json({ message: "Unauthorized - No token provided" });
		}

		// Validate token with Auth Service
		const userData = await validateToken(token);

		if (!userData || !userData.userId) {
			return res.status(401).json({ message: "Unauthorized - Invalid token" });
		}

		// Attach user data to request
		req.user = {
			userId: userData.userId,
			role: userData.role,
		};

		next();
	} catch (error) {
		console.error("Error in protectRoute middleware:", error.message);
		
		if (error.response?.status === 401) {
			return res.status(401).json({ message: "Unauthorized - Token validation failed" });
		}

		res.status(500).json({ message: "Internal server error" });
	}
};
