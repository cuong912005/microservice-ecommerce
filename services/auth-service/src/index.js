import express from "express";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import cors from "cors";
import { connectDB } from "./lib/db.js";
import { redis } from "./lib/redis.js";
import { connectKafkaProducer, disconnectKafkaProducer } from "./lib/kafka.js";
import authRoutes from "./routes/auth.routes.js";
import passport from "./lib/passport.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
	origin: process.env.FRONTEND_URL || "http://localhost:5173",
	credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(passport.initialize());

// Routes
app.use("/api/auth", authRoutes);

// Health check endpoint
app.get("/health", (req, res) => {
	res.status(200).json({ 
		status: "healthy", 
		service: "auth-service",
		timestamp: new Date().toISOString()
	});
});

// Root endpoint
app.get("/", (req, res) => {
	res.json({ 
		message: "Auth Service API",
		version: "1.0.0",
		endpoints: {
			health: "/health",
			auth: "/auth/*"
		}
	});
});

// Error handling middleware
app.use((err, req, res, next) => {
	console.error('Error:', err);
	res.status(err.status || 500).json({
		message: err.message || 'Internal Server Error',
		...(process.env.NODE_ENV === 'development' && { stack: err.stack })
	});
});

// 404 handler
app.use((req, res) => {
	res.status(404).json({ message: 'Route not found' });
});

// Graceful shutdown
const gracefulShutdown = async () => {
	console.log('\nShutting down gracefully...');
	
	try {
		await disconnectKafkaProducer();
		await redis.quit();
		process.exit(0);
	} catch (error) {
		console.error('Error during shutdown:', error);
		process.exit(1);
	}
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// Start server
const startServer = async () => {
	try {
		// Connect to databases
		await connectDB();
		
		// Connect to Kafka
		await connectKafkaProducer();
		
		// Start HTTP server
		app.listen(PORT, () => {
			console.log(`Auth Service running on port ${PORT}`);
			console.log(`Environment: ${process.env.NODE_ENV}`);
		});
	} catch (error) {
		console.error('Failed to start server:', error);
		process.exit(1);
	}
};

startServer();
