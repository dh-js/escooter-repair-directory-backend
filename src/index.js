import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import config from "./config/config.js";
import logger from "./utils/logger.js";
import helmet from "helmet";
import v1Router from "./routes/v1/index.js";
import crypto from "crypto";

const filepath = "index.js";
const app = express();

// Enable trust proxy to properly handle client IPs when running behind a proxy (like Render)
// This ensures rate limiting and logging show the actual client IP instead of the proxy's IP
app.set("trust proxy", 1);

// Rate limiting specifically for health endpoint
const healthCheckLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 20, // max 20 requests per minute per IP
  message: { error: { message: "Too many health check requests" } },
  standardHeaders: true,
  trustProxy: true,
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

// Basic security for health endpoint
app.use("/api/health/healthz", healthCheckLimiter, (req, res, next) => {
  // Only allow GET requests
  if (req.method !== "GET") {
    return res.status(405).json({ error: { message: "Method not allowed" } });
  }
  next();
});

// Health check endpoint
app.get("/api/health/healthz", (req, res) => {
  res.status(200).json({ status: "OK" });
});

// CORS configuration
const allowedOrigins = [
  "https://www.togetherweride.life",
  "https://togetherweride.life",
  ...(process.env.NODE_ENV === "development" ? ["http://localhost:3000"] : []),
];

// Toggle this to temporarily allow no-origin requests in production
const ALLOW_NO_ORIGIN = false;

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin in development mode or when ALLOW_NO_ORIGIN is true
      if (process.env.NODE_ENV === "development" || ALLOW_NO_ORIGIN) {
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

// Helper function to get the real client IP
const getClientIp = (req) => {
  return (
    req.headers["x-forwarded-for"]?.split(",")[0] ||
    req.headers["x-real-ip"] ||
    req.ip ||
    req.connection.remoteAddress
  );
};

// Rate limiting for search endpoint
const searchLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: { error: { message: "Too many requests from this IP" } },
  standardHeaders: true,
  trustProxy: true,
  keyGenerator: (req) => {
    const clientIp = getClientIp(req);
    logger.info("IP info for rate limiting:", {
      filepath,
      clientIp,
      "x-forwarded-for": req.headers["x-forwarded-for"],
      "req.ip": req.ip,
    });
    return clientIp;
  },
  handler: (req, res) => {
    logger.warn("Rate limit exceeded", {
      filepath,
      clientIp: getClientIp(req),
      forwardedFor: req.headers["x-forwarded-for"],
      path: req.path,
    });
    res.status(429).json({
      error: { message: "Too many requests, please try again later" },
    });
  },
});

app.use(express.json());
app.use(helmet());

// API key validation
const validateApiKey = (apiKey, requiredLevel) => {
  const keys = {
    public: process.env.PUBLIC_API_KEY,
    admin: process.env.ADMIN_API_KEY,
  };

  // Compare API keys in a timing-safe manner - prevents timing attacks
  try {
    return crypto.timingSafeEqual(
      Buffer.from(apiKey),
      Buffer.from(keys[requiredLevel])
    );
  } catch {
    return false;
  }
};

// Public endpoints (with rate limiting)
app.use(
  "/api/v1/search",
  (req, res, next) => {
    logger.info("Received search request", {
      filepath,
      clientIp: getClientIp(req),
      forwardedFor: req.headers["x-forwarded-for"],
      path: req.path,
      query: req.query,
    });
    next();
  },
  searchLimiter
);

// API key validation middleware should come after rate limiting
app.use("/api/v1/search", (req, res, next) => {
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
