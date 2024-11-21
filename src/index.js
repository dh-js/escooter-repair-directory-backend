import express from "express";
import config from "./config/config.js";
import logger from "./utils/logger.js";
import helmet from "helmet";
import cors from "cors";
import v1Router from "./routes/v1/index.js";

const filepath = "index.js";
const app = express();

app.use(express.json());
app.use(helmet());
app.use(cors());

// API key middleware
app.use("/api/v1", (req, res, next) => {
  // Skip auth for health check endpoint
  if (req.path === "/" || req.path === "/healthz") {
    return next();
  }

  const apiKey = req.headers["x-api-key"];
  if (!apiKey || apiKey !== process.env.API_KEY) {
    return res.status(401).json({
      error: { message: "Invalid or missing API key" },
    });
  }
  next();
});

app.use("/api/v1", v1Router);

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error("Unhandled error:", err, { filepath });
  res.status(err.status || 500).json({
    error: {
      message: err.message || "Internal server error",
      ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
    },
  });
});

// Initialize the app
const init = async () => {
  try {
    app.listen(config.port, () => {
      logger.info(`Server running on port ${config.port}`, { filepath });
    });
  } catch (error) {
    logger.error("Failed to initialize application:", error, { filepath });
    process.exit(1);
  }
};

init();
