import AnalyticsEvent from "../models/analyticsEvent.model.js";
import { orderServiceClient, productServiceClient } from "../lib/serviceClients.js";

// Get dashboard analytics 
export const getDashboardAnalytics = async (req, res) => {
	try {
		// Aggregate data from events
		const now = new Date();
		const last30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

		// Total users registered
		const totalUsers = await AnalyticsEvent.countDocuments({
			eventType: "user-registered",
		});

		// Total orders
		const totalOrders = await AnalyticsEvent.countDocuments({
			eventType: "order-completed",
		});

		// Total revenue (from order-completed events)
		const revenueData = await AnalyticsEvent.aggregate([
			{
				$match: {
					eventType: "order-completed",
					"metadata.totalAmount": { $exists: true },
				},
			},
			{
				$group: {
					_id: null,
					totalRevenue: { $sum: "$metadata.totalAmount" },
				},
			},
		]);

		const totalRevenue = revenueData[0]?.totalRevenue || 0;

		// Get products count from Product Service
		let totalProducts = 0;
		try {
			const productResponse = await productServiceClient.get("/products");
			totalProducts = productResponse.data?.products?.length || 0;
		} catch (error) {
			console.error("Error fetching products:", error.message);
		}

		// Sales analytics - daily breakdown for last 30 days
		const salesAnalytics = await AnalyticsEvent.aggregate([
			{
				$match: {
					eventType: "order-completed",
					timestamp: { $gte: last30Days },
				},
			},
			{
				$group: {
					_id: {
						$dateToString: { format: "%Y-%m-%d", date: "$timestamp" },
					},
					sales: { $sum: 1 },
					revenue: { $sum: "$metadata.totalAmount" },
				},
			},
			{
				$sort: { _id: 1 },
			},
			{
				$project: {
					_id: 0,
					date: "$_id",
					sales: 1,
					revenue: 1,
				},
			},
		]);

		// User growth - daily registrations for last 30 days
		const userGrowth = await AnalyticsEvent.aggregate([
			{
				$match: {
					eventType: "user-registered",
					timestamp: { $gte: last30Days },
				},
			},
			{
				$group: {
					_id: {
						$dateToString: { format: "%Y-%m-%d", date: "$timestamp" },
					},
					count: { $sum: 1 },
				},
			},
			{
				$sort: { _id: 1 },
			},
			{
				$project: {
					_id: 0,
					date: "$_id",
					count: 1,
				},
			},
		]);

		// Top products viewed
		const topProducts = await AnalyticsEvent.aggregate([
			{
				$match: {
					eventType: "product-viewed",
					timestamp: { $gte: last30Days },
				},
			},
			{
				$group: {
					_id: "$metadata.productId",
					views: { $sum: 1 },
					productName: { $first: "$metadata.productName" },
				},
			},
			{
				$sort: { views: -1 },
			},
			{
				$limit: 10,
			},
			{
				$project: {
					_id: 0,
					productId: "$_id",
					productName: 1,
					views: 1,
				},
			},
		]);

		res.json({
			summary: {
				totalUsers,
				totalProducts,
				totalOrders,
				totalRevenue: parseFloat(totalRevenue.toFixed(2)),
			},
			salesAnalytics,
			userGrowth,
			topProducts,
		});
	} catch (error) {
		console.error("Error fetching dashboard analytics:", error);
		res.status(500).json({
			message: "Error fetching analytics",
			error: error.message,
		});
	}
};

// Get user activity
export const getUserActivity = async (req, res) => {
	try {
		const { userId } = req.params;
		const { limit = 50, offset = 0 } = req.query;

		const events = await AnalyticsEvent.find({ userId })
			.sort({ timestamp: -1 })
			.skip(parseInt(offset))
			.limit(parseInt(limit))
			.lean();

		const total = await AnalyticsEvent.countDocuments({ userId });

		res.json({
			events,
			pagination: {
				limit: parseInt(limit),
				offset: parseInt(offset),
				total,
			},
		});
	} catch (error) {
		console.error("Error fetching user activity:", error);
		res.status(500).json({
			message: "Error fetching user activity",
			error: error.message,
		});
	}
};

// Get sales report
export const getSalesReport = async (req, res) => {
	try {
		const { startDate, endDate } = req.query;

		const matchStage = {
			eventType: "order-completed",
		};

		if (startDate || endDate) {
			matchStage.timestamp = {};
			if (startDate) {
				matchStage.timestamp.$gte = new Date(startDate);
			}
			if (endDate) {
				matchStage.timestamp.$lte = new Date(endDate);
			}
		}

		const salesReport = await AnalyticsEvent.aggregate([
			{ $match: matchStage },
			{
				$group: {
					_id: {
						$dateToString: { format: "%Y-%m-%d", date: "$timestamp" },
					},
					orders: { $sum: 1 },
					revenue: { $sum: "$metadata.totalAmount" },
					averageOrderValue: { $avg: "$metadata.totalAmount" },
				},
			},
			{
				$sort: { _id: 1 },
			},
			{
				$project: {
					_id: 0,
					date: "$_id",
					orders: 1,
					revenue: { $round: ["$revenue", 2] },
					averageOrderValue: { $round: ["$averageOrderValue", 2] },
				},
			},
		]);

		const totals = await AnalyticsEvent.aggregate([
			{ $match: matchStage },
			{
				$group: {
					_id: null,
					totalOrders: { $sum: 1 },
					totalRevenue: { $sum: "$metadata.totalAmount" },
					averageOrderValue: { $avg: "$metadata.totalAmount" },
				},
			},
		]);

		res.json({
			report: salesReport,
			summary: totals[0] || {
				totalOrders: 0,
				totalRevenue: 0,
				averageOrderValue: 0,
			},
		});
	} catch (error) {
		console.error("Error generating sales report:", error);
		res.status(500).json({
			message: "Error generating sales report",
			error: error.message,
		});
	}
};
