/**
 * Gateway Authentication Middleware for Product Service
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

		// 2. Extract JWT
		const accessToken = req.cookies.accessToken || req.headers.authorization?.split(' ')[1];

		if (!accessToken) {
			return res.status(401).json({ message: "Unauthorized - No access token provided" });
		}

		// 3. Decode JWT (no verification - Kong already validated)
		const decoded = jwt.decode(accessToken);
		
		if (!decoded || !decoded.userId) {
			return res.status(401).json({ message: "Unauthorized - Invalid token format" });
		}

		// 4. Attach user data
		req.user = {
			userId: decoded.userId,
			email: decoded.email,
			role: decoded.role || "customer",
		};
		req.token = accessToken;

		next();
	} catch (error) {
		console.log("Error in protectRoute middleware", error.message);
		return res.status(401).json({ message: "Unauthorized - Invalid access token" });
	}
};

export const adminRoute = (req, res, next) => {
	if (req.user && req.user.role === "admin") {
		next();
	} else {
		return res.status(403).json({ message: "Access denied - Admin only" });
	}
};
