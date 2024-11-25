import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import config from "./config/config.js";
import logger from "./utils/logger.js";
import helmet from "helmet";
import v1Router from "./routes/v1/index.js";

const filepath = "index.js";
const app = express();

// Rate limiting specifically for health endpoint
const healthCheckLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 20, // max 20 requests per minute per IP
  message: { error: { message: "Too many health check requests" } },
  standardHeaders: true,
  handler: (req, res) => {
    logger.warn("Health check rate limit exceeded", {
      filepath,
      ip: req.ip,
    });
    res.status(429).json({
      error: { message: "Too many requests, please try again later" },
    });
  },
});

// Add a separate CORS configuration for health checks that allows no origin
const healthCheckCors = cors({
  origin: true, // Allow all origins for health checks
  methods: ["GET"],
  optionsSuccessStatus: 200,
});

// Health check endpoint with its own CORS and rate limiting
app.use(
  "/api/health/healthz",
  healthCheckCors,
  healthCheckLimiter,
  (req, res, next) => {
    if (req.method !== "GET") {
      return res.status(405).json({ error: { message: "Method not allowed" } });
    }
    next();
  }
);

// Health check endpoint
app.get("/api/health/healthz", (req, res) => {
  res.status(200).json({ status: "OK" });
});

// Main CORS configuration for other endpoints (remains strict)
const allowedOrigins = [
  "https://your-wordpress-domain.com",
  ...(process.env.NODE_ENV === "development" ? ["http://localhost:3000"] : []),
];

app.use(
  "/api/v1",
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin in development mode only
      if (process.env.NODE_ENV === "development") {
        return callback(null, true);
      }

      // Production mode: require an origin
      if (!origin || !allowedOrigins.includes(origin)) {
        logger.warn("CORS blocked request from origin:", {
          filepath,
          origin: origin || "no origin",
        });
        return callback(new Error("CORS error"));
      }
      callback(null, true);
    },
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "x-api-key"],
    credentials: true,
    optionsSuccessStatus: 200,
  })
);

// Rate limiting for search endpoint
const searchLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Adjust based on your needs
  message: { error: { message: "Too many requests from this IP" } },
  standardHeaders: true,
  handler: (req, res) => {
    logger.warn("Rate limit exceeded", {
      filepath,
      ip: req.ip,
      path: req.path,
    });
    res.status(429).json({
      error: { message: "Too many requests, please try again later" },
    });
  },
});

app.use(express.json());
app.use(helmet());

// Simplified API key validation
const validateApiKey = (apiKey, requiredLevel) => {
  const keys = {
    public: process.env.PUBLIC_API_KEY,
    admin: process.env.ADMIN_API_KEY,
  };
  return apiKey === keys[requiredLevel];
};

// Public endpoints (with rate limiting)
app.use("/api/v1/search", searchLimiter, (req, res, next) => {
  const apiKey = req.headers["x-api-key"];
  if (!apiKey || !validateApiKey(apiKey, "public")) {
    logger.warn("Invalid public API key", {
      filepath,
      ip: req.ip,
      path: req.path,
    });
    return res.status(401).json({
      error: { message: "Invalid API key" },
    });
  }
  next();
});

// Admin endpoints
app.use(["/api/v1/scrape", "/api/v1/ai"], (req, res, next) => {
  const apiKey = req.headers["x-api-key"];
  if (!apiKey || !validateApiKey(apiKey, "admin")) {
    logger.warn("Invalid admin API key attempt", {
      filepath,
      ip: req.ip,
      path: req.path,
    });
    return res.status(401).json({
      error: { message: "Invalid admin API key" },
    });
  }
  next();
});

// Main router
app.use("/api/v1", v1Router);

// Error handling
app.use((err, req, res, next) => {
  if (err.message === "CORS error") {
    return res.status(403).json({
      error: { message: "CORS error" },
    });
  }

  logger.error("Unhandled error:", err.message, {
    filepath,
    path: req.path,
    method: req.method,
  });

  res.status(err.status || 500).json({
    error: {
      message: err.message || "Internal server error",
      // Only include stack in development, but don't log it
      ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
    },
  });
});

// Initialize the app
const init = async () => {
  try {
    // Validate required environment variables
    const requiredVars = ["PUBLIC_API_KEY", "ADMIN_API_KEY"];
    const missingVars = requiredVars.filter((varName) => !process.env[varName]);

    if (missingVars.length > 0) {
      throw new Error(
        `Missing required environment variables: ${missingVars.join(", ")}`
      );
    }

    app.listen(config.port, () => {
      logger.info(`Server running on port ${config.port}`, { filepath });
    });
  } catch (error) {
    logger.error("Failed to initialize application:", error, { filepath });
    process.exit(1);
  }
};

init();
