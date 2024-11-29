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
  RETRY_DELAY: 65000,
};

const SYSTEM_PROMPT = `You are a specialized e-scooter repair shop analyzer. Your role is to evaluate business data and determine their e-scooter repair capabilities across three service tiers:

1. Basic: Tire repairs, brake adjustments
2. Electrical: Battery service, electrical components, diagnostics
3. Advanced: Structural repairs, accident damage, aftermarket modifications

For each business, you must:
- Clearly state if they offer confirmed e-scooter repairs
- Specify which service tiers they cover (if known)
- Note if they're primarily a bike/e-bike shop that happens to service e-scooters
- Provide a summary in exactly one paragraph (maximum 75 words)
- Maintain a factual, neutral tone
- Never include advice about calling ahead or checking availability`;

const USER_PROMPT = `Analyze this business data and create a single paragraph summary (maximum 75 words) that:

1. States whether e-scooter repairs are:
   - Confirmed (explicitly mentioned)
   - Probable (based on related services)
   - Not offered

2. If repairs are offered, specify which service tiers:
   - Basic (tires, brakes)
   - Electrical (battery, components)
   - Advanced (structural, modifications)

3. Include relevant business characteristics (experience, specialization, etc.)

Do not include:
Advice about calling ahead
Disclaimers or qualifications
Any text before or after the summary paragraph

Business data from Google Maps:`;

const RATE_LIMITS = {
  REQUESTS_PER_MINUTE: 45,
  TOKENS_PER_MINUTE: 35000, // minus 5000 for buffer
};

let requestsThisMinute = 0;
let tokensThisMinute = 0;
let lastResetTime = Date.now();

async function checkRateLimits(estimatedInputTokens) {
  const now = Date.now();
  const timeElapsed = now - lastResetTime;

  // Log current usage before potential reset
  logger.debug("Rate limit status check", {
    filepath,
    currentUsage: {
      requestsThisMinute,
      tokensThisMinute,
      timeElapsedMs: timeElapsed,
    },
  });

  // Reset counters if a minute has passed
  if (timeElapsed >= 60000) {
    logger.info("Resetting rate limit counters", {
      filepath,
      previousUsage: {
        requests: requestsThisMinute,
        tokens: tokensThisMinute,
      },
    });
    requestsThisMinute = 0;
    tokensThisMinute = 0;
    lastResetTime = now;
    return; // No need to wait if we just reset
  }

  // Check if we would exceed limits
  if (
    requestsThisMinute >= RATE_LIMITS.REQUESTS_PER_MINUTE ||
    tokensThisMinute + estimatedInputTokens >= RATE_LIMITS.TOKENS_PER_MINUTE
  ) {
    const waitTime = 60000 - timeElapsed;
    logger.info("Rate limit threshold reached - enforcing wait", {
      filepath,
      currentUsage: {
        requests: requestsThisMinute,
        tokens: tokensThisMinute,
      },
      limits: RATE_LIMITS,
      waitTimeMs: waitTime,
    });
    await new Promise((resolve) => setTimeout(resolve, waitTime));
    requestsThisMinute = 0;
    tokensThisMinute = 0;
    lastResetTime = Date.now();
  }

  // Update counters BEFORE the API call
  requestsThisMinute++;
  tokensThisMinute += estimatedInputTokens;

  logger.debug("Updated rate limit counters", {
    filepath,
    updatedUsage: {
      requests: requestsThisMinute,
      tokens: tokensThisMinute,
      estimatedNewTokens: estimatedInputTokens,
    },
  });
}

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

  // Log the actual input that Claude received
  // logger.info("Claude conversation details", {
  //   filepath,
  //   storeId: storeData.place_id,
  //   conversation: JSON.stringify(
  //     {
  //       StoreText: `${storeData.storeTextForAI}`,
  //     },
  //     null,
  //     2
  //   ),
  // });

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

      // Estimate input tokens (rough estimate: 4 chars = 1 token)
      const estimatedInputTokens = Math.ceil(
        (SYSTEM_PROMPT.length +
          USER_PROMPT.length +
          storeData.storeTextForAI.length) /
          4
      );

      // Check rate limits before making request
      await checkRateLimits(estimatedInputTokens);

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
