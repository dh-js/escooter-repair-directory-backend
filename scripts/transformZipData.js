/**
 * ZIP Code Data Transformation Script
 *
 * This script transforms ZIP code data from the OpenDataSoft format
 * (georef-united-states-of-america-zc-point.json) into a simplified format
 * used by the store locator application.
 * Data is from:
 * https://public.opendatasoft.com/explore/dataset/georef-united-states-of-america-zc-point/export/?location=2,40.5661,39.98938&basemap=jawg.light
 *
 * Input format (OpenDataSoft):
 * [{
 *   "zip_code": "31045",
 *   "geo_point_2d": { "lon": -82.78307, "lat": 33.28247 }
 *   // ... other fields
 * }]
 *
 * Output format:
 * {
 *   "31045": {
 *     "latitude": 33.28247,
 *     "longitude": -82.78307
 *   }
 * }
 *
 * Usage:
 * 1. Ensure input file exists at: data/georef-united-states-of-america-zc-point.json
 * 2. Run: node scripts/transformZipData.js
 * 3. Output will be saved to: data/zip_coordinates_new.json
 * 4. Verify the output and rename to zip_coordinates.json to use in the application
 */

import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function transformZipData() {
  try {
    // Read the OpenDataSoft ZIP data
    const rawData = await fs.readFile(
      path.join(
        __dirname,
        "../data/georef-united-states-of-america-zc-point.json"
      ),
      "utf8"
    );

    const zipData = JSON.parse(rawData);

    // Transform to required format
    const transformedData = zipData.reduce((acc, zip) => {
      acc[zip.zip_code] = {
        latitude: zip.geo_point_2d.lat,
        longitude: zip.geo_point_2d.lon,
      };
      return acc;
    }, {});

    // Write the transformed data
    await fs.writeFile(
      path.join(__dirname, "../data/zip_coordinates_new.json"),
      JSON.stringify(transformedData, null, 2)
    );

    console.log("ZIP code data transformed successfully!");
    console.log(
      `Total ZIP codes processed: ${Object.keys(transformedData).length}`
    );
  } catch (error) {
    console.error("Failed to transform ZIP data:", error);
  }
}

transformZipData();
