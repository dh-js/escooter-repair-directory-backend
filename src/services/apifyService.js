import { ApifyClient } from "apify-client";
import config from "../config/config.js";
import { getActorConfig } from "../config/actorConfig.js";
import logger from "../utils/logger.js";

const filepath = "services/apifyService.js";
const apifyClient = new ApifyClient({
  token: config.apify.apiToken,
});

/**
 * Transforms raw Apify data into our stores schema format
 */
const transformStoreData = (item) => {
  try {
    // Add validation for required fields
    const requiredFields = ["placeId", "title"];
    const missingRequired = requiredFields.filter((field) => !item[field]);

    if (missingRequired.length > 0) {
      throw new Error(`Missing required fields: ${missingRequired.join(", ")}`);
    }

    // Validate location.lat and location.lng exist
    if (item.location && (!item.location.lat || !item.location.lng)) {
      throw new Error(
        `Missing required latitude or longitude fields: ${item.location}`
      );
    }

    return {
      // Core Identifiers
      place_id: item.placeId,
      search_string: item.searchString,
      search_page_url: item.searchPageUrl,
      maps_url: item.url,

      // Basic Store Information
      name: item.title,
      subtitle: item.subTitle,
      description: item.description,
      category_name: item.categoryName,
      categories: item.categories || [],
      website: item.website,
      phone: item.phone,
      permanently_closed: item.permanentlyClosed || false,
      temporarily_closed: item.temporarilyClosed || false,

      // Location Data
      address: item.address,
      street: item.street,
      city: item.city,
      state: item.state,
      postal_code: item.postalCode,
      country_code: item.countryCode,
      neighborhood: item.neighborhood,
      located_in: item.locatedIn,
      plus_code: item.plusCode,
      latitude: item.location?.lat,
      longitude: item.location?.lng,

      // Operating Hours
      opening_hours: item.openingHours,

      // Review & Rating Data
      total_score: item.totalScore,
      reviews_count: item.reviewsCount,
      reviews_distribution: item.reviewsDistribution,
      reviews_tags: item.reviewsTags,
      reviews: item.reviews,
      places_tags: item.placesTags,

      // Additional Context Data
      additional_info: item.additionalInfo,
      questions_and_answers: item.questionsAndAnswers,
      owner_updates: item.ownerUpdates,
      people_also_search: item.peopleAlsoSearch,

      // Timestamps
      scraped_at: new Date().toISOString(),
      last_updated: new Date().toISOString(),
    };
  } catch (error) {
    logger.error(`Data transformation error`, {
      filepath,
      placeId: item?.placeId || "unknown",
      error: error.message,
      stack: error.stack,
      rawData: item ? JSON.stringify(item).slice(0, 500) : "null", // Increased limit but still truncated
      timestamp: new Date().toISOString(),
    });

    // Return a more detailed error record
    return null;
  }
};

export const crawlerGooglePlaces = async (
  searchQueries,
  state,
  city = "", // Make city explicitly optional with default empty string
  maxResults = 5 // Default to 5 for safety if not specified
) => {
  try {
    // Input validation
    if (!searchQueries || !searchQueries.length)
      throw new Error("Search queries are required");
    if (!state) throw new Error("State is required");

    logger.info(
      `Starting shop data scraping for queries: ${searchQueries.join(
        ", "
      )} in ${city ? city + ", " : ""}${state} (max results: ${maxResults})`,
      { filepath }
    );

    const run = await apifyClient
      .actor("compass/crawler-google-places")
      .call(getActorConfig(searchQueries, state, city, maxResults));

    // Collect run information
    const runDetails = {
      runId: run.id,
      actorId: run.actId,
      status: run.status,
      statusMessage: run.statusMessage,
      timing: {
        startedAt: run.startedAt,
        finishedAt: run.finishedAt,
        runTimeSecs: run.stats.runTimeSecs,
      },
      data_ids: {
        defaultDatasetId: run.defaultDatasetId,
        defaultKeyValueStoreId: run.defaultKeyValueStoreId,
        defaultRequestQueueId: run.defaultRequestQueueId,
      },
      usage: {
        computeUnits: run.usage.ACTOR_COMPUTE_UNITS,
        datasetReads: run.usage.DATASET_READS,
        datasetWrites: run.usage.DATASET_WRITES,
        totalCostUsd: run.usageTotalUsd,
      },
      searchParams: {
        queries: searchQueries,
        state,
        city,
        maxResults,
      },
      resultsCount: 0, // Will be updated after getting items
    };

    // Get dataset items
    const { items } = await apifyClient
      .dataset(run.defaultDatasetId)
      .listItems();

    // Add counters for filtered stores
    let walmartCount = 0;
    let targetCount = 0;

    // Transform items into our schema format
    // Add counter for validation failures
    let validationFailures = 0;
    const stores = items
      .map((item) => {
        const result = transformStoreData(item);
        if (result === null) validationFailures++;
        return result;
      })
      // Filter out null results from transformStoreData
      .filter((store) => store !== null)
      // Additional filter to exclude Walmart and Target stores (case-insensitive)
      .filter((store) => {
        const storeName = store.name.toLowerCase();
        if (storeName.includes("walmart")) {
          walmartCount++;
          return false;
        }
        if (storeName.includes("target")) {
          targetCount++;
          return false;
        }
        return true;
      });

    // Update results count
    runDetails.resultsCount = items.length;

    logger.info(`Scraped and transformed ${items.length} places`, {
      filepath,
      validationFailures,
    });

    logger.info(
      `Filtered out ${walmartCount} Walmart and ${targetCount} Target stores`,
      {
        filepath,
      }
    );

    logger.info(`Total stores after filtering: ${stores.length}`, {
      filepath,
    });

    // Return both the transformed items, run info, and raw items in development
    return {
      stores,
      runDetails,
      rawItems: config.nodeEnv === "development" ? items : undefined,
      validationFailures,
    };
  } catch (error) {
    logger.error("Error scraping shop data:", error, { filepath });
    throw error;
  }
};

// Fetch and transform a specific dataset
export const fetchAndTransformDataset = async (datasetId) => {
  try {
    if (!datasetId) {
      throw new Error("Dataset ID is required");
    }

    logger.info(`Fetching dataset: ${datasetId}`, { filepath });

    // Get dataset items - using clean: true to get just the data without metadata
    const { items } = await apifyClient.dataset(datasetId).listItems({
      clean: true,
    });

    logger.info(`Retrieved ${items.length} items from dataset`, {
      filepath,
      datasetId,
    });

    // Log the first raw item from dataset
    if (items.length > 0) {
      logger.info("First raw item from dataset:", {
        filepath,
        firstItem: JSON.stringify(items[0], null, 2),
      });
    }

    // Log the first store before transformation
    if (items.length > 0) {
      logger.info("First store before transformation:", {
        filepath,
        rawStore: items[0],
      });
    }

    // Use the exact same transformation logic as the original scrape
    let validationFailures = 0;
    const stores = items
      .map((item) => {
        const result = transformStoreData(item);
        if (result === null) validationFailures++;
        return result;
      })
      .filter((store) => store !== null)
      .filter((store) => {
        const storeName = store.name.toLowerCase();
        return !storeName.includes("walmart") && !storeName.includes("target");
      });

    // Log the first transformed store
    if (stores.length > 0) {
      logger.info("First transformed store:", {
        filepath,
        firstStore: JSON.stringify(stores[0], null, 2),
      });
    }

    logger.info(`Dataset transformation complete`, {
      filepath,
      datasetId,
      totalItems: items.length,
      validStores: stores.length,
      validationFailures,
    });

    return {
      stores,
      validationFailures,
      totalProcessed: items.length,
    };
  } catch (error) {
    logger.error("Error processing dataset:", {
      filepath,
      datasetId,
      error: error.message,
      stack: error.stack,
    });
    throw error;
  }
};
