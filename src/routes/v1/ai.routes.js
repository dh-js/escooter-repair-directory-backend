import { Router } from "express";
import logger from "../../utils/logger.js";
import {
  fetchUnprocessedStoresDb,
  writeAISummariesToDb,
} from "../../services/supabaseServicesAI.js";
import { claudeAPICall } from "../../services/claudeAPICall.js";

const filepath = "routes/v1/ai.routes.js";
const router = Router();

// Extract the AI processing logic into a separate function
export async function runAIProcessing() {
  try {
    logger.info("Starting AI processing job...", { filepath });

    // Fetch stores that need AI processing
    const unprocessedStores = await fetchUnprocessedStoresDb();

    const processedStores = [];
    const BATCH_SIZE = 10;

    // Process stores in batches
    for (let i = 0; i < unprocessedStores.length; i += BATCH_SIZE) {
      const batch = unprocessedStores.slice(i, i + BATCH_SIZE);

      for (const store of batch) {
        try {
          // Generate AI summary using Claude
          const aiSummary = await claudeAPICall(store);

          processedStores.push({
            place_id: store.place_id,
            ai_summary: aiSummary,
          });

          logger.info(`Successfully processed store`, {
            filepath,
            storeId: store.place_id,
            progress: `${processedStores.length}/${unprocessedStores.length}`,
          });
        } catch (error) {
          logger.error(`Failed to process store`, {
            filepath,
            storeId: store.place_id,
            error: error.message,
          });
        }
      }

      // Write batch results to database
      if (processedStores.length > 0) {
        await writeAISummariesToDb(processedStores);
      }
    }

    logger.info("AI processing job completed", {
      filepath,
      totalProcessed: processedStores.length,
      totalStores: unprocessedStores.length,
    });

    return true;
  } catch (error) {
    logger.error("AI processing job failed:", error, { filepath });
    throw error;
  }
}

// Simplified route handler that calls the extracted function
router.post("/process", async (req, res, next) => {
  try {
    logger.info("Triggering new AI processing job...", { filepath });

    // Send immediate response
    res.json({
      success: true,
      message: "AI processing job triggered successfully",
      startedAt: new Date().toISOString(),
    });

    // Run the AI processing job
    await runAIProcessing();
  } catch (error) {
    logger.error("AI processing job failed:", error, { filepath });
    // Since we already sent the response, we just log the error
  }
});

export default router;
