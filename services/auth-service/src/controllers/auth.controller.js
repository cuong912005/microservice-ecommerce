import { redis } from "../lib/redis.js";
import User from "../models/user.model.js";
import jwt from "jsonwebtoken";
import { publishEvent, createEvent } from "../lib/kafka.js";

const generateTokens = (userId, role = "customer") => {
	const accessToken = jwt.sign(
		{ 
			userId, 
			role,
			iss: "e-commerce-issuer" // Kong JWT plugin key claim
		}, 
		process.env.ACCESS_TOKEN_SECRET, 
		{
			expiresIn: "15m",
		}
	);

	const refreshToken = jwt.sign({ userId }, process.env.REFRESH_TOKEN_SECRET, {
		expiresIn: "7d",
	});

	return { accessToken, refreshToken };
};

const storeRefreshToken = async (userId, refreshToken) => {
	await redis.set(`refresh_token:${userId}`, refreshToken, "EX", 7 * 24 * 60 * 60); // 7days
};

const setCookies = (res, accessToken, refreshToken) => {
	res.cookie("accessToken", accessToken, {
		httpOnly: true, // prevent XSS attacks
		secure: process.env.NODE_ENV === "production",
		sameSite: "strict", // prevents CSRF attack
		maxAge: 15 * 60 * 1000, // 15 minutes
	});
	res.cookie("refreshToken", refreshToken, {
		httpOnly: true,
		secure: process.env.NODE_ENV === "production",
		sameSite: "strict",
		maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
	});
};

export const signup = async (req, res) => {
	const { email, password, name } = req.body;
	try {
		// Validate input
		if (!email || !password || !name) {
			return res.status(400).json({ message: "All fields are required" });
		}

		const userExists = await User.findOne({ email });

		if (userExists) {
			return res.status(400).json({ message: "User already exists" });
		}

		const user = await User.create({ name, email, password });

		// Authenticate
		const { accessToken, refreshToken } = generateTokens(user._id, user.role);
		await storeRefreshToken(user._id, refreshToken);

		setCookies(res, accessToken, refreshToken);

		// Publish Kafka events
		try {
			// Email task for welcome email
			const emailEvent = createEvent('send-welcome-email', {
				userId: user._id.toString(),
				email: user.email,
				name: user.name,
			});
			await publishEvent('email-tasks', emailEvent);

			// Analytics event for user registration
			const analyticsEvent = createEvent('user-registered', {
				userId: user._id.toString(),
				email: user.email,
				name: user.name,
				timestamp: new Date().toISOString(),
			});
			await publishEvent('analytics-events', analyticsEvent);
		} catch (kafkaError) {
			console.error('Failed to publish Kafka events:', kafkaError);
			// Continue even if Kafka fails
		}

		res.status(201).json({
			_id: user._id,
			name: user.name,
			email: user.email,
			role: user.role,
		});
	} catch (error) {
		console.log("Error in signup controller", error.message);
		res.status(500).json({ message: error.message });
	}
};

export const login = async (req, res) => {
	try {
		const { email, password } = req.body;

		// Validate input
		if (!email || !password) {
			return res.status(400).json({ message: "Email and password are required" });
		}

		const user = await User.findOne({ email });

		if (!user) {
			return res.status(401).json({ message: "Invalid email or password" });
		}

		// Check if user has a password (OAuth users might not)
		if (!user.password) {
			return res.status(401).json({ message: "Please login with OAuth provider" });
		}

		const isPasswordValid = await user.comparePassword(password);

		if (!isPasswordValid) {
			return res.status(401).json({ message: "Invalid email or password" });
		}

		const { accessToken, refreshToken } = generateTokens(user._id, user.role);
		await storeRefreshToken(user._id, refreshToken);
		setCookies(res, accessToken, refreshToken);

		// Publish analytics event for user login
		try {
			const analyticsEvent = createEvent('user-login', {
				userId: user._id.toString(),
				email: user.email,
				timestamp: new Date().toISOString(),
			});
			await publishEvent('analytics-events', analyticsEvent);
		} catch (kafkaError) {
			console.error('Failed to publish login event:', kafkaError);
			// Continue even if Kafka fails
		}

		res.json({
			_id: user._id,
			name: user.name,
			email: user.email,
			role: user.role,
		});
	} catch (error) {
		console.log("Error in login controller", error.message);
		res.status(500).json({ message: error.message });
	}
};

export const logout = async (req, res) => {
	try {
		const refreshToken = req.cookies.refreshToken;
		if (refreshToken) {
			const decoded = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET);
			await redis.del(`refresh_token:${decoded.userId}`);
		}

		res.clearCookie("accessToken");
		res.clearCookie("refreshToken");
		res.json({ message: "Logged out successfully" });
	} catch (error) {
		console.log("Error in logout controller", error.message);
		res.status(500).json({ message: "Server error", error: error.message });
	}
};

// Refresh the access token
export const refreshToken = async (req, res) => {
	try {
		const refreshToken = req.cookies.refreshToken;

		if (!refreshToken) {
			return res.status(401).json({ message: "No refresh token provided" });
		}

		const decoded = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET);
		const storedToken = await redis.get(`refresh_token:${decoded.userId}`);

		if (storedToken !== refreshToken) {
			return res.status(401).json({ message: "Invalid refresh token" });
		}

		// Get user to include role in new token
		const user = await User.findById(decoded.userId);
		if (!user) {
			return res.status(401).json({ message: "User not found" });
		}

		const accessToken = jwt.sign(
			{ 
				userId: decoded.userId,
				role: user.role,
				iss: "e-commerce-issuer"
			}, 
			process.env.ACCESS_TOKEN_SECRET, 
			{ expiresIn: "15m" }
		);

		res.cookie("accessToken", accessToken, {
			httpOnly: true,
			secure: process.env.NODE_ENV === "production",
			sameSite: "strict",
			maxAge: 15 * 60 * 1000,
		});

		res.json({ message: "Token refreshed successfully" });
	} catch (error) {
		console.log("Error in refreshToken controller", error.message);
		res.status(500).json({ message: "Server error", error: error.message });
	}
};

export const getProfile = async (req, res) => {
	try {
		res.json(req.user);
	} catch (error) {
		res.status(500).json({ message: "Server error", error: error.message });
	}
};

// OAuth Success Handler
export const oauthSuccess = async (req, res) => {
	try {
		// Generate tokens for OAuth user
		const { accessToken, refreshToken } = generateTokens(req.user._id, req.user.role);
		await storeRefreshToken(req.user._id, refreshToken);
		setCookies(res, accessToken, refreshToken);

		// Redirect to frontend with success
		const frontendURL = process.env.FRONTEND_URL || "http://localhost:5173";
		res.redirect(`${frontendURL}/oauth/success`);
	} catch (error) {
		console.log("Error in oauthSuccess controller", error.message);
		const frontendURL = process.env.FRONTEND_URL || "http://localhost:5173";
		res.redirect(`${frontendURL}/oauth/error`);
	}
};

// OAuth Failure Handler
export const oauthFailure = (req, res) => {
	const frontendURL = process.env.FRONTEND_URL || "http://localhost:5173";
	res.redirect(`${frontendURL}/oauth/error`);
};

// Token validation endpoint for other services
export const validateToken = async (req, res) => {
	try {
		const token = req.headers.authorization?.split(' ')[1] || req.cookies.accessToken;

		if (!token) {
			return res.status(401).json({ valid: false, message: "No token provided" });
		}

		// Check Redis cache first
		const cacheKey = `token_validation:${token}`;
		const cachedResult = await redis.get(cacheKey);

		if (cachedResult) {
			return res.json(JSON.parse(cachedResult));
		}

		// Verify token
		const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
		const user = await User.findById(decoded.userId).select("-password");

		if (!user) {
			return res.status(401).json({ valid: false, message: "User not found" });
		}

		const result = {
			valid: true,
			userId: user._id.toString(),
			email: user.email,
			role: user.role,
		};

		// Cache result for 1 minute
		await redis.setex(cacheKey, 60, JSON.stringify(result));

		res.json(result);
	} catch (error) {
		if (error.name === 'TokenExpiredError') {
			return res.status(401).json({ valid: false, message: "Token expired" });
		}
		if (error.name === 'JsonWebTokenError') {
			return res.status(401).json({ valid: false, message: "Invalid token" });
		}
		console.log("Error in validateToken controller", error.message);
		res.status(500).json({ valid: false, message: "Server error" });
	}
};
