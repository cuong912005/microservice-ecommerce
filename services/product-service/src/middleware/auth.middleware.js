import { validateToken } from '../lib/authClient.js';

export const protectRoute = async (req, res, next) => {
	try {
		const accessToken = req.cookies.accessToken || req.headers.authorization?.split(' ')[1];

		if (!accessToken) {
			return res.status(401).json({ message: "Unauthorized - No access token provided" });
		}

		try {
			// Validate token with Auth Service
			const validationResult = await validateToken(accessToken);

			if (!validationResult.valid) {
				return res.status(401).json({ message: "Unauthorized - Invalid token" });
			}

			// Attach user info to request
			req.user = {
				userId: validationResult.userId,
				email: validationResult.email,
				role: validationResult.role,
			};

			next();
		} catch (error) {
			return res.status(401).json({ message: error.message || "Unauthorized - Token validation failed" });
		}
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
