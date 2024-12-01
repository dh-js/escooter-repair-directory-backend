import { createClient } from "@supabase/supabase-js";
import fs from "fs/promises";
import config from "../src/config/config.js";

const supabase = createClient(config.supabase.url, config.supabase.key);

async function importZipCodes() {
  const data = JSON.parse(
    await fs.readFile("./data/zip_coordinates.json", "utf8")
  );

  const zipEntries = Object.entries(data).map(([zip_code, coords]) => ({
    zip_code,
    latitude: coords.latitude,
    longitude: coords.longitude,
  }));

  // Insert in batches of 1000
  for (let i = 0; i < zipEntries.length; i += 1000) {
    const batch = zipEntries.slice(i, i + 1000);
    const { error } = await supabase.from("zip_coordinates").insert(batch);

    if (error) console.error("Error inserting batch:", error);
    else console.log(`Inserted batch ${i / 1000 + 1}`);
  }
}

importZipCodes().catch(console.error);
