import express from "express";
import config from "./config/config.js";
import logger from "./utils/logger.js";
import helmet from "helmet";
import cors from "cors";
// Add back the router import
import v1Router from "./routes/v1/index.js";

const app = express();

app.use(express.json());
app.use(helmet());
app.use(cors());

// Add back the router middleware
app.use("/api/v1", v1Router);

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error(err.stack);
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
      logger.info(`Server running on port ${config.port}`);
    });
  } catch (error) {
    logger.error("Failed to initialize application:", error);
    process.exit(1);
  }
};

init();
