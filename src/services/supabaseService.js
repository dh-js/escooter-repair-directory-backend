import { createClient } from "@supabase/supabase-js";
import config from "../config/config.js";
import logger from "../utils/logger.js";

const filepath = "services/supabaseService.js";
const supabase = createClient(config.supabase.url, config.supabase.key);

/**
 * Writes Apify run metadata to the apify_runs table
 */
export const writeApifyRunDetails = async (runInfo) => {
  try {
    // Validate required fields
    if (!runInfo?.runId) {
      throw new Error("Missing required field: runId");
    }

    const { data, error } = await supabase
      .from("apify_runs")
      .insert({
        run_id: runInfo.runId,
        actor_id: runInfo.actorId,
        status: runInfo.status,
        status_message: runInfo.statusMessage,
        timing: runInfo.timing,
        data_ids: runInfo.data_ids,
        usage: runInfo.usage,
        search_params: runInfo.searchParams,
        results_count: runInfo.resultsCount,
      })
      .select();

    if (error) {
      // Log specific Supabase error details
      logger.error(`Supabase error storing run ${runInfo.runId}:`, {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
        filepath,
      });
      throw error;
    }

    if (!data?.length) {
      throw new Error(`No data returned after inserting run ${runInfo.runId}`);
    }

    logger.info(`Stored Apify run details for run ${runInfo.runId}`, {
      filepath,
      rowId: data[0].id, // Log the inserted row ID
    });
    return data[0];
  } catch (error) {
    const enhancedError = new Error(
      `Failed to store Apify run details: ${error.message}`
    );
    enhancedError.originalError = error;
    enhancedError.runId = runInfo?.runId;

    logger.error("Error storing Apify run details:", enhancedError, {
      filepath,
      context: {
        runId: runInfo?.runId,
        actorId: runInfo?.actorId,
      },
    });
    throw enhancedError;
  }
};
