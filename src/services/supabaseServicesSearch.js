import { createClient } from "@supabase/supabase-js";
import config from "../config/config.js";
import logger from "../utils/logger.js";

const filepath = "services/supabaseServicesSearch.js";
const supabase = createClient(config.supabase.url, config.supabase.key);

export const searchStores = async ({ latitude, longitude, radius }) => {
  try {
    const radiusInMeters = radius * 1609.34;

    const { data, error } = await supabase.rpc("nearby_stores", {
      lat: latitude,
      lng: longitude,
      radius_meters: radiusInMeters,
    });

    if (error) throw error;

    const storesWithMiles = data.map((store) => ({
      id: store.id,
      name: store.name,
      address: store.address,
      description: store.description,
      category_name: store.category_name,
      website: store.website,
      phone: store.phone,
      opening_hours: store.opening_hours,
      total_score: store.total_score,
      reviews_count: store.reviews_count,
      additional_info: store.additional_info,
      ai_summary: store.ai_summary,
      last_updated: store.last_updated,
      maps_url: store.maps_url,
      distance_miles: +(store.distance_meters / 1609.34).toFixed(1),
    }));

    return {
      stores: storesWithMiles,
      metadata: {
        count: data.length,
        radius,
      },
    };
  } catch (error) {
    logger.error("Store search failed:", error, { filepath });
    throw error;
  }
};
