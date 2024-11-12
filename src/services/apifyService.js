import { ApifyClient } from "apify-client";
import config from "../config/config.js";
import logger from "../utils/logger.js";

const apifyClient = new ApifyClient({
  token: config.apify.apiToken,
});

export const crawlerGooglePlaces = async (
  searchQuery,
  state,
  city = "", // Make city explicitly optional with default empty string
  maxResults = 5 // Default to 5 for safety if not specified
) => {
  try {
    // Input validation
    if (!searchQuery) throw new Error("Search query is required");
    if (!state) throw new Error("State is required");

    logger.info(
      `Starting shop data scraping for query: ${searchQuery} in ${
        city ? city + ", " : ""
      }${state} (max results: ${maxResults})`
    );

    const run = await apifyClient.actor("compass/crawler-google-places").call({
      // Search Parameters
      searchStringsArray: [searchQuery], // Array of search terms
      //locationQuery: "", // Free text location (e.g., "New York, USA").Takes precedence over other location params
      maxCrawledPlacesPerSearch: maxResults, // Max results per search term. Use 9999999 for all available. <200 disables deeperCityScrape

      // Language
      //language: "en",

      // Image Settings
      maxImages: 0, // 0 = no images, 99999 = all images.
      //scrapeImageAuthors: false,

      // Data Scraping Options
      //onlyDataFromSearchPage: false, // true = basic data only (faster), false = full details including website/phone
      //includeWebResults: false, // true = include "Web results" section
      scrapeDirectories: true, // true = include places inside other places (e.g., stores in malls)
      deeperCityScrape: true, // true = more thorough search in populated areas (slower but more results)

      // Review Settings
      maxReviews: 400, // 0 = no reviews, 99999 = all reviews. Max 5000 per place item
      //reviewsStartDate: "", // YYYY-MM-DD or ISO date or relative (e.g., "3 months")
      reviewsSort: "newest", // "newest", "mostRelevant", "highestRanking", "lowestRanking"
      //reviewsFilterString: "", // Only include reviews containing these keywords
      scrapeReviewsPersonalData: false, // true = include reviewer details

      // Questions
      maxQuestions: 999, // 0 = first Q&A only, 999 = all questions

      // Location Settings
      countryCode: "us",
      city: city, // Now using the city parameter
      state: state, // Now using the state parameter
      //county: "", // US county name
      //postalCode: "", // Single postal code (use with country, not city)
      //customGeolocation: {}, // Custom area using [longitude, latitude] coordinates

      // Filtering Options
      //categoryFilterWords: [], // Filter by place categories (e.g., ["restaurant", "cafe"])
      //searchMatching: "all", // "all", "only_includes", "only_exact" - how strictly title must match search
      //placeMinimumStars: "", // Minimum rating: "two", "twoAndHalf", "three", "threeAndHalf", "four", "fourAndHalf"
      skipClosedPlaces: true, // true = skip temporarily/permanently closed places
      //website: "allPlaces", // "allPlaces", "withWebsite", "withoutWebsite"

      // Additional Options
      //startUrls: [], // Direct Google Maps URLs (max 300 results per URL)
      //allPlacesNoSearchAction: "", // "all_places_no_search_ocr" or "all_places_no_search_mouse" to scrape all visible places
    });

    // Get dataset items
    const { items } = await apifyClient
      .dataset(run.defaultDatasetId)
      .listItems();

    logger.info(`Scraped ${items.length} places`);
    console.log(JSON.stringify(items, null, 2)); // Pretty print results for testing

    return items;
  } catch (error) {
    logger.error("Error scraping shop data:", error);
    throw error;
  }
};
