import { createClient } from "@supabase/supabase-js";
import config from "../config/config.js";

const supabase = createClient(config.supabase.url, config.supabase.key);

export const getZipCoordinates = async (zipCode) => {
  // Validate input ZIP format (must be exactly 5 digits)
  if (!/^[0-9]{5}$/.test(zipCode)) {
    throw new Error("ZIP code must be exactly 5 digits");
  }

  const { data, error } = await supabase
    .from("zip_coordinates")
    .select("latitude, longitude")
    .eq("zip_code", zipCode)
    .single();

  if (error || !data) {
    throw new Error("ZIP code not found");
  }

  return {
    latitude: data.latitude,
    longitude: data.longitude,
  };
};
