import { validateToken } from "../lib/serviceClients.js";

// Verify admin role
export const verifyAdmin = async (req, res, next) => {
	try {
		// Get token from cookie or Authorization header
		const token = req.cookies?.accessToken || req.headers.authorization?.replace("Bearer ", "");

		if (!token) {
			return res.status(401).json({
				message: "No token provided",
			});
		}

		const validationResult = await validateToken(token);

		if (!validationResult || !validationResult.valid) {
			return res.status(401).json({
				message: "Invalid token",
			});
		}

		
		if (validationResult.role !== "admin") {
			return res.status(403).json({
				message: "Admin access required",
			});
		}

		req.user = {
			userId: validationResult.userId,
			email: validationResult.email,
			role: validationResult.role
		};
		next();
	} catch (error) {
		console.error("Admin verification error:", error);
		res.status(500).json({
			message: "Authentication error",
			error: error.message,
		});
	}
};

// Verify authenticated user
export const verifyAuth = async (req, res, next) => {
	try {
		// Get token from cookie or Authorization header
		const token = req.cookies?.accessToken || req.headers.authorization?.replace("Bearer ", "");

		if (!token) {
			return res.status(401).json({
				message: "No token provided",
			});
		}

		const validationResult = await validateToken(token);

		if (!validationResult || !validationResult.valid) {
			return res.status(401).json({
				message: "Invalid token",
			});
		}

		req.user = {
			userId: validationResult.userId,
			email: validationResult.email,
			role: validationResult.role
		};
		next();
	} catch (error) {
		console.error("Auth verification error:", error);
		res.status(500).json({
			message: "Authentication error",
			error: error.message,
		});
	}
};
