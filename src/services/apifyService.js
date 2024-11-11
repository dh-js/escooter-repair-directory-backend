import { ApifyClient } from "apify-client";
import config from "../config/config.js";
import logger from "../utils/logger.js";

const apifyClient = new ApifyClient({
  token: config.apify.apiToken,
});

export const crawlerGooglePlaces = async (searchQuery) => {
  try {
    logger.info("Starting shop data scraping");

    // Run the Google Places Scraper actor
    const run = await apifyClient.actor("drobnikj/crawler-google-places").call({
      searchStrings: [searchQuery],
      maxCrawledPlaces: 100,
      language: "en",
      maxImages: 0, // We don't need images for now
      countryCode: "US",
    });

    // Get dataset items
    const { items } = await apifyClient
      .dataset(run.defaultDatasetId)
      .listItems();

    // Transform the data to match the database schema
    const shops = items.map((item) => ({
      google_place_id: item.placeId,
      name: item.name,
      address: item.address,
      latitude: item.location.lat,
      longitude: item.location.lng,
      phone: item.phone,
      website: item.website,
      rating: item.rating,
      review_count: item.reviewsCount,
      raw_data: item,
    }));

    return shops;
  } catch (error) {
    logger.error("Error scraping shop data:", error);
    throw error;
  }
};
