/**
 * Gateway Authentication Middleware for Cart Service
 * Kong validates JWT and adds X-Gateway-Auth header
 */
import jwt from "jsonwebtoken";

const GATEWAY_SECRET = process.env.GATEWAY_SECRET || "KONG_INTERNAL_SECRET_2024";

export const protectRoute = async (req, res, next) => {
	try {
		// 1. Verify request comes from Kong Gateway
		const gatewayAuth = req.headers['x-gateway-auth'];
		
		if (gatewayAuth !== GATEWAY_SECRET) {
			return res.status(403).json({ 
				message: "Forbidden - Direct access not allowed" 
			});
		}

		// 2. Get token from cookie or Authorization header
		const token = req.cookies?.accessToken || req.headers.authorization?.split(" ")[1];
		
		if (!token) {
			return res.status(401).json({ message: "Unauthorized - No token provided" });
		}

		// 3. Decode JWT (no verification - Kong already validated)
		const decoded = jwt.decode(token);

		if (!decoded || !decoded.userId) {
			return res.status(401).json({ message: "Unauthorized - Invalid token" });
		}

		// 4. Attach user data to request
		req.user = {
			userId: decoded.userId,
			role: decoded.role || "customer",
		};
		req.token = token;

		next();
	} catch (error) {
		console.error("Error in protectRoute middleware:", error.message);
		res.status(500).json({ message: "Internal server error" });
	}
};
