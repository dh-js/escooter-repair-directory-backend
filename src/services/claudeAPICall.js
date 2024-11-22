import Anthropic from "@anthropic-ai/sdk";
import logger from "../utils/logger.js";
import { createRedactedStoreText } from "../utils/createRedactedStoreText.js";

const filepath = "services/claudeAPICall.js";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const CLAUDE_CONFIG = {
  MODEL: "claude-3-5-sonnet-20241022",
  MAX_TOKENS: 1000,
  MAX_RETRIES: 3,
  RETRY_DELAY: 10000,
};

const SYSTEM_PROMPT = `You are a specialized content analyzer for an e-scooter repair shop directory. Your role is to analyze business data and create concise, factual summaries that help users find e-scooter repair services. Your responses must be exactly one paragraph of no more than 75 words. Never include advice about calling ahead or checking availability. Provide only the summary paragraph with no additional text, prefacing, or commentary.`;

const USER_PROMPT = `Analyze the following business data from Google Maps and create a single paragraph (maximum 75 words) that:

Explicitly states if e-scooter repair services are confirmed, or estimates the likelihood if unclear
Lists specific e-scooter repair services offered (if known)
Includes relevant business highlights useful to e-scooter owners
Maintains a neutral, informative tone

Do not include:

Advice about calling ahead
Disclaimers or qualifications
Any text before or after the summary paragraph

Context data from Google Maps:`;

/**
 * Makes API calls to Claude with robust retry logic and error handling
 * @param {Object} storeData - Formatted store data object
 * @returns {Promise<Object>} Object containing AI-generated summary and token usage
 */
export const claudeAPICall = async (storeData) => {
  // Single comprehensive debug log at start
  logger.debug("Starting Claude API call", {
    filepath,
    storeId: storeData.place_id,
  });

  // Create redacted version for logging
  const redactedStoreText = createRedactedStoreText(storeData.storeTextForAI);

  console.log("\n=== Claude API Request ===");
  console.log("System Prompt:");
  console.log(SYSTEM_PROMPT);
  console.log("\nUser Prompt + Store Data (redacted):");
  console.log(`${USER_PROMPT}\n\nSTORE DATA:\n${redactedStoreText}`);
  console.log("=== End Request ===\n");

  for (let attempt = 0; attempt < CLAUDE_CONFIG.MAX_RETRIES; attempt++) {
    try {
      if (attempt > 0) {
        logger.info(
          `Retry attempt ${attempt + 1}/${CLAUDE_CONFIG.MAX_RETRIES}`,
          {
            filepath,
            storeId: storeData.place_id,
          }
        );
      }

      const response = await anthropic.messages.create({
        model: CLAUDE_CONFIG.MODEL,
        max_tokens: CLAUDE_CONFIG.MAX_TOKENS,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `${USER_PROMPT}\n\nSTORE DATA:\n${storeData.storeTextForAI}`,
              },
            ],
          },
        ],
      });

      // Validate response
      if (!response?.content?.[0]?.text) {
        throw new Error("Empty response from Anthropic");
      }

      // Create structured response object
      const aiSummary = {
        summary_text: response.content[0].text,
        token_usage: {
          input_tokens: response.usage.input_tokens,
          output_tokens: response.usage.output_tokens,
          total_tokens:
            response.usage.input_tokens + response.usage.output_tokens,
        },
      };

      // Single success log with complete information
      logger.info("Successfully generated AI summary", {
        filepath,
        storeId: storeData.place_id,
        attempt: attempt + 1,
        responseId: response.id,
        tokenUsage: aiSummary.token_usage,
        summary: aiSummary.summary_text,
      });

      return aiSummary;
    } catch (error) {
      logger.error("Claude API call failed", {
        filepath,
        storeId: storeData.place_id,
        attempt: attempt + 1,
        error: {
          name: error.name,
          message: error.message,
          stack: error.stack,
          type: error.type,
          status: error.status,
        },
        remainingRetries: CLAUDE_CONFIG.MAX_RETRIES - attempt - 1,
      });

      // If this was our last retry, throw the error
      if (attempt === CLAUDE_CONFIG.MAX_RETRIES - 1) {
        throw new Error(
          `Failed to generate AI summary after ${CLAUDE_CONFIG.MAX_RETRIES} attempts: ${error.message}`
        );
      }

      // Wait before retrying
      await new Promise((resolve) =>
        setTimeout(resolve, CLAUDE_CONFIG.RETRY_DELAY)
      );
    }
  }
};
