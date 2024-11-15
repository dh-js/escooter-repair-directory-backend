import { ApifyClient } from "apify-client";
import config from "../config/config.js";
import { getGooglePlacesCrawlerConfig } from "../config/actorConfig.js";
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
    return {
      // Core Identifiers
      place_id: item.placeId,
      search_string: item.searchString,
      search_page_url: item.searchPageUrl,

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
      images_count: item.imagesCount,
      image_categories: item.imageCategories,
      people_also_search: item.peopleAlsoSearch,

      // Set default values for AI fields (will be updated later)
      escooter_repair_confirmed: null,
      repair_tier: null,
      service_tiers: null,
      ai_summary: null,
      confidence_score: null,

      // Timestamps
      scraped_at: new Date().toISOString(),
      last_updated: new Date().toISOString(),
    };
  } catch (error) {
    logger.error(`Error transforming store data for ${item?.placeId}:`, error, {
      filepath,
    });
    throw error;
  }
};

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
      }${state} (max results: ${maxResults})`,
      { filepath }
    );

    const run = await apifyClient
      .actor("compass/crawler-google-places")
      .call(getGooglePlacesCrawlerConfig(searchQuery, state, city, maxResults));

    // Collect run information
    const runInfo = {
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
        query: searchQuery,
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

    // Transform items into our schema format
    const transformedItems = items.map(transformStoreData);

    // Update results count
    runInfo.resultsCount = items.length;

    logger.info(`Scraped and transformed ${items.length} places`, { filepath });

    // Return both the transformed items and run info
    return {
      items: transformedItems,
      runInfo,
    };
  } catch (error) {
    logger.error("Error scraping shop data:", error, { filepath });
    throw error;
  }
};
