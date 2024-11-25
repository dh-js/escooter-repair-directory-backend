import fs from "fs/promises";
import path from "path";
import logger from "./logger.js";

const filepath = "utils/zipCoordinates.js";

// We'll use a simple ZIP code database (you'll need to add this)
// Format: { "12345": { "latitude": 42.123, "longitude": -71.456 }, ... }
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
  const coordinates = zipDatabase[zipCode];

  if (!coordinates) {
    throw new Error("Invalid ZIP code");
  }

  return coordinates;
};
