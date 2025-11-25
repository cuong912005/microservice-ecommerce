import express from "express";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import cors from "cors";
import { connectDB } from "./lib/db.js";
import {
	connectKafkaConsumer,
	connectKafkaProducer,
	disconnectKafka,
	setOrderCompletedHandler,
} from "./lib/kafka.js";
import couponRoutes from "./routes/coupon.routes.js";
import { generateLoyaltyCoupon } from "./controllers/coupon.controller.js";

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3008;

// Set the Kafka event handler
setOrderCompletedHandler(generateLoyaltyCoupon);

// CORS configuration
app.use(cors({
	origin: ["http://localhost:5173", "http://localhost:3000", "http://localhost:5000", "http://localhost:8000"],
	credentials: true,
}));

// Body parsing middleware
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Health check endpoint
app.get("/health", (req, res) => {
	res.json({
		status: "healthy",
		service: "coupon-service",
		timestamp: new Date().toISOString(),
		uptime: process.uptime(),
	});
});

// Routes
app.use("/api/coupons", couponRoutes);

// Root endpoint
app.get("/", (req, res) => {
	res.json({
		service: "Coupon Service",
		version: "1.0.0",
		status: "running",
		description: "Coupon management and validation service",
	});
});

// Error handling middleware
app.use((err, req, res, next) => {
	console.error("Error:", err);
	res.status(500).json({
		message: "Internal server error",
		error: process.env.NODE_ENV === "development" ? err.message : undefined,
	});
});

// 404 handler
app.use((req, res) => {
	res.status(404).json({
		message: "Route not found",
	});
});

// Start server
const startServer = async () => {
	try {
		// Connect to MongoDB
		await connectDB();

		// Connect to Kafka producer
		await connectKafkaProducer();

		// Connect to Kafka consumer and start consuming
		await connectKafkaConsumer();

		// Start Express server
		app.listen(PORT, () => {
			console.log(`Coupon Service running on port ${PORT}`);
			console.log(`Environment: ${process.env.NODE_ENV}`);
			console.log("Listening for Kafka events on: analytics-events (order-completed)");
		});
	} catch (error) {
		console.error("Failed to start server:", error);
		process.exit(1);
	}
};

// Graceful shutdown
const gracefulShutdown = async () => {
	console.log("\nShutting down gracefully...");
	
	try {
		await disconnectKafka();
		process.exit(0);
	} catch (error) {
		console.error("Error during shutdown:", error);
		process.exit(1);
	}
};

process.on("SIGINT", gracefulShutdown);
process.on("SIGTERM", gracefulShutdown);

// Start the server
startServer();
