/**
 * Formats store data into a store object containing formatted text for AI processing
 * @param {Object} store - Raw store data from database
 * @param {Object} options - Options for formatting
 * @param {number} options.maxReviews - Maximum number of reviews to include
 * @param {number} options.maxQAs - Maximum number of Q&As to include
 * @returns {Object} Formatted store object containing text for AI and metadata
 */
export function formatStoreDataForAI(
  store,
  { maxReviews = 10, maxQAs = 5 } = {}
) {
  const parts = [];

  // Add context header
  parts.push(`=== STORE INFORMATION ===`);

  // Basic store information with more structured metadata
  parts.push(`Name: ${store.name}`);
  if (store.subtitle) {
    parts.push(`Business Type: ${store.subtitle}`);
  }

  if (store.description) {
    parts.push(`\nOfficial Description:\n${store.description}`);
  }

  // Categories with better formatting
  if (store.categories && store.categories.length > 0) {
    parts.push(`\nBusiness Categories:\n- ${store.categories.join("\n- ")}`);
  }

  // Reviews section with configurable limit
  if (store.reviews && store.reviews.length > 0) {
    parts.push("\n=== CUSTOMER REVIEWS ===");
    parts.push(`Total Reviews: ${store.reviews.length}`);
    if (store.total_score) {
      parts.push(`Overall Rating: ${store.total_score}/5 stars`);
    }

    const sortedReviews = [...store.reviews]
      .sort((a, b) => new Date(b.publishAt) - new Date(a.publishAt))
      .slice(0, maxReviews);

    parts.push(`Showing ${sortedReviews.length} most recent reviews:`);

    sortedReviews.forEach((review) => {
      parts.push(`\nReview from ${review.publishAt}:`);
      parts.push(`Rating: ${review.stars}/5 stars`);
      parts.push(`Customer Feedback: "${review.text}"`);

      if (review.responseFromOwnerText) {
        parts.push(`Owner's Response: "${review.responseFromOwnerText}"`);
      }
    });
  }

  // Q&A section with configurable limit
  if (store.questions_and_answers && store.questions_and_answers.length > 0) {
    parts.push("\n=== FREQUENTLY ASKED QUESTIONS ===");

    const limitedQAs = store.questions_and_answers.slice(0, maxQAs);

    parts.push(`Showing ${limitedQAs.length} questions:`);

    limitedQAs.forEach((qa) => {
      parts.push(`\nQ: ${qa.question}`);
      parts.push(`Asked on: ${qa.askDate}`);

      if (qa.answers && qa.answers.length > 0) {
        qa.answers.forEach((answer) => {
          parts.push(`A: ${answer.answer}`);
          parts.push(
            `Answered by: ${answer.answeredBy.name} on ${answer.answerDate}`
          );
        });
      } else {
        parts.push("(No answers provided yet)");
      }
    });
  }

  // Return structured object
  return {
    place_id: store.place_id,
    storeTextForAI: parts.join("\n"),
    ai_summary: null,
  };
}
