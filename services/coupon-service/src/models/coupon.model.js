import mongoose from "mongoose";

const couponSchema = new mongoose.Schema(
	{
		code: {
			type: String,
			required: true,
			unique: true,
			uppercase: true,
			trim: true,
			index: true,
		},
		type: {
			type: String,
			required: true,
			enum: ["percentage", "fixed"],
			default: "percentage",
		},
		value: {
			type: Number,
			required: true,
			min: 0,
		},
		minPurchase: {
			type: Number,
			default: 0,
			min: 0,
		},
		maxDiscount: {
			type: Number,
			min: 0,
		},
		expirationDate: {
			type: Date,
			required: true,
			index: true,
		},
		isActive: {
			type: Boolean,
			default: true,
			index: true,
		},
		userId: {
			type: String,
			index: true,
		},
		usageLimit: {
			type: Number,
			default: 1,
			min: 1,
		},
		usedCount: {
			type: Number,
			default: 0,
			min: 0,
		},
		createdBy: {
			type: String,
			enum: ["admin", "system"],
			default: "admin",
		},
		description: String,
	},
	{ timestamps: true }
);

// Indexes for queries
couponSchema.index({ code: 1, isActive: 1 });
couponSchema.index({ userId: 1, isActive: 1 });
couponSchema.index({ expirationDate: 1, isActive: 1 });

// Check if coupon is valid
couponSchema.methods.isValid = function () {
	return (
		this.isActive &&
		this.expirationDate > new Date() &&
		this.usedCount < this.usageLimit
	);
};

// Calculate discount amount
couponSchema.methods.calculateDiscount = function (purchaseAmount) {
	if (!this.isValid()) {
		return 0;
	}

	if (purchaseAmount < this.minPurchase) {
		return 0;
	}

	let discount = 0;
	if (this.type === "percentage") {
		discount = (purchaseAmount * this.value) / 100;
		if (this.maxDiscount && discount > this.maxDiscount) {
			discount = this.maxDiscount;
		}
	} else {
		// fixed
		discount = this.value;
	}

	return Math.min(discount, purchaseAmount);
};

const Coupon = mongoose.model("Coupon", couponSchema);

export default Coupon;
