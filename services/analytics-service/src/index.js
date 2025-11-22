import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import { connectDB } from "./lib/db.js";
import { connectKafkaConsumer, disconnectKafka } from "./lib/kafka.js";
import analyticsRoutes from "./routes/analytics.routes.js";

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3007;

// CORS configuration
app.use(cors({
	origin: ["http://localhost:5173", "http://localhost:3000", "http://localhost:5000", "http://localhost:8000"],
	credentials: true,
}));

// Body parsing middleware
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// Health check endpoint
app.get("/health", (req, res) => {
	res.json({
		status: "healthy",
		service: "analytics-service",
		timestamp: new Date().toISOString(),
		uptime: process.uptime(),
	});
});

// Routes
app.use("/api/analytics", analyticsRoutes);

// Root endpoint
app.get("/", (req, res) => {
	res.json({
		service: "Analytics Service",
		version: "1.0.0",
		status: "running",
		description: "Analytics and reporting service for e-commerce platform",
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

		// Connect to Kafka and start consuming
		await connectKafkaConsumer();

		// Start Express server
		app.listen(PORT, () => {
			console.log(`Analytics Service running on port ${PORT}`);
			console.log(`Environment: ${process.env.NODE_ENV}`);
			console.log("Listening for Kafka events on: analytics-events");
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
