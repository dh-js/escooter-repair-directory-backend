import winston from "winston";

// Custom format that will be used for both file and console output
// Creates logs in format: "2024-03-20 10:30:45 [info] : Message here {additional: 'metadata'}"
const customFormat = winston.format.combine(
  winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
  winston.format.errors({ stack: true }), // Includes stack traces for errors
  winston.format.splat(), // Enables string interpolation
  // Add module/filename information
  winston.format((info) => {
    const splat = info[Symbol.for("splat")];
    // If a filepath is provided in metadata, use it
    if (splat && splat[0]?.filepath) {
      info.filepath = splat[0].filepath;
    }
    return info;
  })(),
  winston.format.printf(
    ({ level, message, timestamp, filepath, ...metadata }) => {
      // Remove filepath from metadata if it exists to avoid duplication
      const { filepath: _, ...cleanMetadata } = metadata;
      let msg = `${timestamp} [${level}]${
        filepath ? ` [${filepath}]` : ""
      } : ${message}`;
      if (Object.keys(cleanMetadata).length > 0) {
        msg += ` ${JSON.stringify(cleanMetadata)}`;
      }
      return msg;
    }
  )
);

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info", // Default to 'info' if not specified
  format: customFormat,
  defaultMeta: { service: "escooter-repair-directory" }, // Added to all log entries
  transports: [
    // Console Transport: All logs will be output to console with colors
    new winston.transports.Console({
      format: winston.format.combine(winston.format.colorize(), customFormat),
    }),

    // Error Log File: Only error-level logs
    // Location: logs/error.log
    new winston.transports.File({
      filename: "logs/error.log",
      level: "error",
      maxsize: 5242880, // 5MB
      maxFiles: 5, // Keep 5 rotated files maximum
    }),

    // Combined Log File: All logs regardless of level (debug, info, warn, error)
    // Location: logs/combined.log
    new winston.transports.File({
      filename: "logs/combined.log",
      maxsize: 5242880, // 5MB
      maxFiles: 5, // Keep 5 rotated files maximum
    }),
  ],
});

// Exception & Rejection Handling
// These logs go to both console and a dedicated exceptions.log file
const exceptionHandlers = [
  // Exceptions Log File: Uncaught exceptions and unhandled promise rejections
  // Location: logs/exceptions.log
  new winston.transports.File({ filename: "logs/exceptions.log" }),

  // Also output exceptions to console with colors
  new winston.transports.Console({
    format: winston.format.combine(winston.format.colorize(), customFormat),
  }),
];

// Handle both uncaught exceptions and unhandled promise rejections
logger.exceptions.handle(...exceptionHandlers);
logger.rejections.handle(...exceptionHandlers);

export default logger;

/* Usage Examples:
 * logger.debug('Detailed information for debugging')  -> console + combined.log
 * logger.info('Normal application behavior')          -> console + combined.log
 * logger.warn('Warning messages')                     -> console + combined.log
 * logger.error('Error messages')                      -> console + combined.log + error.log
 * throw new Error('Uncaught exception')              -> console + exceptions.log
 * Promise.reject('Unhandled rejection')              -> console + exceptions.log
 */
