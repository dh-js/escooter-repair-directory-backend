import winston from "winston";

// Custom format that will be used for both file and console output
// Creates logs in format: "2024-03-20 10:30:45 [info] : Message here {additional: 'metadata'}"
const customFormat = winston.format.combine(
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
  winston.format.printf(({ level, message, filepath, ...metadata }) => {
    // Remove filepath from metadata if it exists to avoid duplication
    const { filepath: _, ...cleanMetadata } = metadata;
    let msg = `[${level}]${filepath ? ` [${filepath}]` : ""} : ${message}`;
    if (Object.keys(cleanMetadata).length > 0) {
      msg += ` ${JSON.stringify(cleanMetadata, null, 2)}`;
    }
    return msg;
  })
);

const logger = winston.createLogger({
  // Add these options to handle concurrent writes better
  handleExceptions: true,
  handleRejections: true,
  exitOnError: false,

  level: process.env.LOG_LEVEL || "info",
  format: customFormat,
  transports: [
    // Console Transport
    new winston.transports.Console({
      format: winston.format.combine(winston.format.colorize(), customFormat),
      eol: "\n",
      sync: true,
    }),

    // File transports
    new winston.transports.File({
      filename: "logs/error.log",
      level: "error",
      maxsize: 5242880,
      maxFiles: 5,
      eol: "\n",
      tailable: true,
      zippedArchive: true,
      options: { flags: "a" },
    }),

    new winston.transports.File({
      filename: "logs/combined.log",
      maxsize: 5242880,
      maxFiles: 5,
      eol: "\n",
      tailable: true,
      zippedArchive: true,
      options: { flags: "a" },
    }),
  ],
  maxListeners: 15,
});

// Add a flush handler for clean shutdown
process.on("exit", () => {
  logger.end();
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
