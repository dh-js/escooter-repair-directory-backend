import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function padZipCodes() {
  try {
    // Read the current transformed ZIP data
    const rawData = await fs.readFile(
      path.join(__dirname, "../data/zip_coordinates.json"),
      "utf8"
    );

    const zipData = JSON.parse(rawData);

    // Transform to pad all ZIP codes to 5 digits
    const paddedData = Object.entries(zipData).reduce((acc, [zip, coords]) => {
      const paddedZip = zip.padStart(5, "0");
      acc[paddedZip] = coords;
      return acc;
    }, {});

    // Write to a new file (for safety)
    await fs.writeFile(
      path.join(__dirname, "../data/zip_coordinates_padded.json"),
      JSON.stringify(paddedData, null, 2)
    );

    console.log("ZIP codes padded successfully!");
    console.log(`Total ZIP codes processed: ${Object.keys(paddedData).length}`);

    // Log some examples of the transformation
    const examples = Object.keys(zipData).slice(0, 5);
    console.log("\nExample transformations:");
    examples.forEach((zip) => {
      console.log(`${zip} -> ${zip.padStart(5, "0")}`);
    });
  } catch (error) {
    console.error("Failed to pad ZIP codes:", error);
  }
}

padZipCodes();
