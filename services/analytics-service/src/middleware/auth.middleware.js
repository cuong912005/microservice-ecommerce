/**
 * Gateway Authentication Middleware for Analytics Service
 * Kong validates JWT and adds X-Gateway-Auth header
 */
import jwt from "jsonwebtoken";

const GATEWAY_SECRET = process.env.GATEWAY_SECRET || "KONG_INTERNAL_SECRET_2024";

// Verify admin role
export const verifyAdmin = async (req, res, next) => {
	try {
		// 1. Verify request comes from Kong Gateway
		const gatewayAuth = req.headers['x-gateway-auth'];
		
		if (gatewayAuth !== GATEWAY_SECRET) {
			return res.status(403).json({ 
				message: "Forbidden - Direct access not allowed" 
			});
		}

		// 2. Get token from cookie or Authorization header
		const token = req.cookies?.accessToken || req.headers.authorization?.replace("Bearer ", "");

		if (!token) {
			return res.status(401).json({
				message: "No token provided",
			});
		}

		// 3. Decode JWT (no verification - Kong already validated)
		const decoded = jwt.decode(token);

		if (!decoded || !decoded.userId) {
			return res.status(401).json({
				message: "Invalid token",
			});
		}

		// 4. Check if user is admin
		if (decoded.role !== "admin") {
			return res.status(403).json({
				message: "Admin access required",
			});
		}

		req.user = {
			userId: decoded.userId,
			email: decoded.email,
			role: decoded.role
		};
		req.token = token;
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
		// 1. Verify request comes from Kong Gateway
		const gatewayAuth = req.headers['x-gateway-auth'];
		
		if (gatewayAuth !== GATEWAY_SECRET) {
			return res.status(403).json({ 
				message: "Forbidden - Direct access not allowed" 
			});
		}

		// 2. Get token from cookie or Authorization header
		const token = req.cookies?.accessToken || req.headers.authorization?.replace("Bearer ", "");

		if (!token) {
			return res.status(401).json({
				message: "No token provided",
			});
		}

		// 3. Decode JWT (no verification - Kong already validated)
		const decoded = jwt.decode(token);

		if (!decoded || !decoded.userId) {
			return res.status(401).json({
				message: "Invalid token",
			});
		}

		req.user = {
			userId: decoded.userId,
			email: decoded.email,
			role: decoded.role || "customer"
		};
		req.token = token;
		next();
	} catch (error) {
		console.error("Auth verification error:", error);
		res.status(500).json({
			message: "Authentication error",
			error: error.message,
		});
	}
};
