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

  // Validate ZIP format (3-5 digits)
  if (!/^\d{3,5}$/.test(zipCode)) {
    throw new Error("ZIP code must be a number between 3-5 digits");
  }

  const coordinates = zipDatabase[zipCode];
  if (!coordinates) {
    throw new Error("ZIP code not found");
  }

  return coordinates;
};
