import Stripe from "stripe";

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
	apiVersion: "2024-10-28.acacia",
});

// Helper function to create Stripe coupon
export const createStripeCoupon = async (discountPercentage) => {
	try {
		const coupon = await stripe.coupons.create({
			percent_off: discountPercentage,
			duration: "once",
		});
		return coupon.id;
	} catch (error) {
		console.error("Error creating Stripe coupon:", error);
		throw error;
	}
};
