import Coupon from "../models/coupon.model.js";
import redis from "../lib/redis.js";
import { produceEvent } from "../lib/kafka.js";
import { v4 as uuidv4 } from "uuid";

// Generate random coupon code
const generateCouponCode = () => {
	const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
	let code = "";
	for (let i = 0; i < 8; i++) {
		code += chars.charAt(Math.floor(Math.random() * chars.length));
	}
	return code;
};

// Create coupon (Admin) - Story 8.2
export const createCoupon = async (req, res) => {
	try {
		const {
			code,
			type,
			value,
			minPurchase,
			maxDiscount,
			expirationDate,
			userId,
			usageLimit,
			description,
		} = req.body;

		// Validate required fields
		if (!type || !value || !expirationDate) {
			return res.status(400).json({
				message: "Type, value, and expiration date are required",
			});
		}

		// Generate code if not provided
		const couponCode = code || generateCouponCode();

		// Create coupon
		const coupon = new Coupon({
			code: couponCode,
			type,
			value,
			minPurchase: minPurchase || 0,
			maxDiscount,
			expirationDate: new Date(expirationDate),
			userId,
			usageLimit: usageLimit || 1,
			createdBy: "admin",
			description,
		});

		await coupon.save();

		// Cache in Redis
		await redis.setex(
			`coupon:${couponCode}`,
			7 * 24 * 60 * 60, // 7 days
			JSON.stringify(coupon)
		);

		// Produce Kafka event
		await produceEvent("analytics-events", {
			eventId: uuidv4(),
			eventType: "coupon-created",
			timestamp: new Date().toISOString(),
			payload: {
				couponId: coupon._id.toString(),
				code: coupon.code,
				type: coupon.type,
				value: coupon.value,
				userId: coupon.userId,
			},
		});

		res.status(201).json({
			success: true,
			message: "Coupon created successfully",
			coupon,
		});
	} catch (error) {
		console.error("Error creating coupon:", error);
		
		if (error.code === 11000) {
			return res.status(400).json({
				message: "Coupon code already exists",
			});
		}

		res.status(500).json({
			message: "Error creating coupon",
			error: error.message,
		});
	}
};

// Validate coupon - Story 8.2
export const validateCoupon = async (req, res) => {
	try {
		const { code, purchaseAmount } = req.body;
		const userId = req.user?.userId;

		if (!code) {
			return res.status(400).json({
				message: "Coupon code is required",
			});
		}

		// Try to get from Redis first
		let coupon;
		const cached = await redis.get(`coupon:${code.toUpperCase()}`);
		
		if (cached) {
			coupon = JSON.parse(cached);
			// Convert to Mongoose document for methods
			coupon = await Coupon.findById(coupon._id);
		} else {
			coupon = await Coupon.findOne({
				code: code.toUpperCase(),
			});

			if (coupon) {
				// Cache it
				await redis.setex(
					`coupon:${code.toUpperCase()}`,
					7 * 24 * 60 * 60,
					JSON.stringify(coupon)
				);
			}
		}

		if (!coupon) {
			return res.status(404).json({
				message: "Coupon not found",
			});
		}

		// Check if coupon is valid
		if (!coupon.isValid()) {
			return res.status(400).json({
				message: "Coupon is no longer valid or has been fully used",
				coupon: {
					code: coupon.code,
					isActive: coupon.isActive,
					expirationDate: coupon.expirationDate,
					usedCount: coupon.usedCount,
					usageLimit: coupon.usageLimit,
				},
			});
		}

		// Check if user-specific coupon belongs to user
		if (coupon.userId && coupon.userId !== userId) {
			return res.status(403).json({
				message: "This coupon is not valid for your account",
			});
		}

		// Calculate discount
		const discount = purchaseAmount
			? coupon.calculateDiscount(purchaseAmount)
			: 0;

		res.json({
			valid: true,
			coupon: {
				code: coupon.code,
				type: coupon.type,
				value: coupon.value,
				minPurchase: coupon.minPurchase,
				maxDiscount: coupon.maxDiscount,
				description: coupon.description,
			},
			discount: parseFloat(discount.toFixed(2)),
			message: "Coupon is valid",
		});
	} catch (error) {
		console.error("Error validating coupon:", error);
		res.status(500).json({
			message: "Error validating coupon",
			error: error.message,
		});
	}
};

// Get user coupons - Story 8.2
export const getUserCoupons = async (req, res) => {
	try {
		const { userId } = req.params;

		const coupons = await Coupon.find({
			userId,
			isActive: true,
			expirationDate: { $gt: new Date() },
		}).sort({ createdAt: -1 });

		// Filter out fully used coupons
		const availableCoupons = coupons.filter(
			(coupon) => coupon.usedCount < coupon.usageLimit
		);

		res.json({
			coupons: availableCoupons,
			count: availableCoupons.length,
		});
	} catch (error) {
		console.error("Error fetching user coupons:", error);
		res.status(500).json({
			message: "Error fetching coupons",
			error: error.message,
		});
	}
};

// Apply coupon (mark as used)
export const applyCoupon = async (req, res) => {
	try {
		const { code } = req.body;
		const userId = req.user?.userId;

		if (!code) {
			return res.status(400).json({
				message: "Coupon code is required",
			});
		}

		const coupon = await Coupon.findOne({
			code: code.toUpperCase(),
		});

		if (!coupon) {
			return res.status(404).json({
				message: "Coupon not found",
			});
		}

		if (!coupon.isValid()) {
			return res.status(400).json({
				message: "Coupon is not valid",
			});
		}

		if (coupon.userId && coupon.userId !== userId) {
			return res.status(403).json({
				message: "This coupon is not valid for your account",
			});
		}

		// Increment used count
		coupon.usedCount += 1;
		await coupon.save();

		// Invalidate cache
		await redis.del(`coupon:${code.toUpperCase()}`);

		// Produce Kafka event
		await produceEvent("analytics-events", {
			eventId: uuidv4(),
			eventType: "coupon-used",
			timestamp: new Date().toISOString(),
			payload: {
				couponId: coupon._id.toString(),
				code: coupon.code,
				userId,
				usedCount: coupon.usedCount,
			},
		});

		res.json({
			success: true,
			message: "Coupon applied successfully",
			coupon: {
				code: coupon.code,
				type: coupon.type,
				value: coupon.value,
				usedCount: coupon.usedCount,
				usageLimit: coupon.usageLimit,
			},
		});
	} catch (error) {
		console.error("Error applying coupon:", error);
		res.status(500).json({
			message: "Error applying coupon",
			error: error.message,
		});
	}
};

// Get all coupons (Admin)
export const getAllCoupons = async (req, res) => {
	try {
		const { active, expired } = req.query;

		const query = {};

		if (active === "true") {
			query.isActive = true;
			query.expirationDate = { $gt: new Date() };
		} else if (expired === "true") {
			query.expirationDate = { $lte: new Date() };
		}

		const coupons = await Coupon.find(query).sort({ createdAt: -1 });

		res.json({
			coupons,
			count: coupons.length,
		});
	} catch (error) {
		console.error("Error fetching coupons:", error);
		res.status(500).json({
			message: "Error fetching coupons",
			error: error.message,
		});
	}
};

// Delete coupon (Admin)
export const deleteCoupon = async (req, res) => {
	try {
		const { id } = req.params;

		const coupon = await Coupon.findByIdAndDelete(id);

		if (!coupon) {
			return res.status(404).json({
				message: "Coupon not found",
			});
		}

		// Remove from cache
		await redis.del(`coupon:${coupon.code}`);

		res.json({
			success: true,
			message: "Coupon deleted successfully",
		});
	} catch (error) {
		console.error("Error deleting coupon:", error);
		res.status(500).json({
			message: "Error deleting coupon",
			error: error.message,
		});
	}
};

// Generate loyalty coupon after order completion (Kafka consumer handler)
export const generateLoyaltyCoupon = async (event) => {
	try {
		const { userId, totalAmount, orderId } = event.payload;

		if (!userId || !totalAmount) {
			console.log("Missing userId or totalAmount in event payload");
			return;
		}

		// Generate 10% discount coupon for next purchase
		const expirationDate = new Date();
		expirationDate.setDate(expirationDate.getDate() + 30); // 30 days validity

		const coupon = new Coupon({
			code: generateCouponCode(),
			type: "percentage",
			value: 10,
			minPurchase: 0,
			expirationDate,
			userId,
			usageLimit: 1,
			createdBy: "system",
			description: `Thank you for your purchase! Enjoy 10% off your next order.`,
		});

		await coupon.save();

		// Cache in Redis
		await redis.setex(
			`coupon:${coupon.code}`,
			30 * 24 * 60 * 60, // 30 days
			JSON.stringify(coupon)
		);

		console.log(`Loyalty coupon ${coupon.code} generated for user ${userId}`);

		// Produce event to send email with coupon
		await produceEvent("email-tasks", {
			eventId: uuidv4(),
			eventType: "send-loyalty-coupon-email",
			timestamp: new Date().toISOString(),
			payload: {
				userId,
				couponCode: coupon.code,
				discount: coupon.value,
				expirationDate: coupon.expirationDate,
				orderId,
			},
		});
	} catch (error) {
		console.error("Error generating loyalty coupon:", error);
	}
};
