import fs from "fs/promises";
import path from "path";
import logger from "./logger.js";

const filepath = "utils/zipCoordinates.js";

// ZIP code database Format: { "12345": { "latitude": 42.123, "longitude": -71.456 }, ... }
let zipDatabase = null;

const initZipDatabase = async () => {
  try {
    if (!zipDatabase) {
      const data = await fs.readFile(
        path.join(process.cwd(), "data/zip_coordinates.json"),
        "utf8"
      );
      zipDatabase = JSON.parse(data);
    }
  } catch (error) {
    logger.error("Failed to load ZIP database:", error, { filepath });
    throw new Error("ZIP code service unavailable");
  }
};

export const getZipCoordinates = async (zipCode) => {
  await initZipDatabase();

  // Validate input ZIP format (must be exactly 5 digits)
  if (!/^[0-9]{5}$/.test(zipCode)) {
    throw new Error("ZIP code must be exactly 5 digits");
  }

  const coordinates = zipDatabase[zipCode]; // Direct lookup with 5-digit ZIP
  if (!coordinates) {
    throw new Error("ZIP code not found");
  }

  return coordinates;
};
