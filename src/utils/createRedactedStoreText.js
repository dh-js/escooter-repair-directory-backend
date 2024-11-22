/**
 * Creates a redacted version of store data for logging, showing only the first review and Q&A
 * @param {string} storeText - Full store text
 * @returns {string} Redacted store text with truncated reviews and Q&As
 */
export const createRedactedStoreText = (storeText) => {
  const sections = storeText.split("=== ").filter(Boolean);
  const redactedSections = sections.map((section) => {
    // Handle Reviews section
    if (section.startsWith("CUSTOMER REVIEWS")) {
      const lines = section.split("\n");
      const statsLines = lines.filter(
        (line) => line.includes("Total Reviews:") || line.includes("Showing")
      );

      // Find first review
      const reviewStart = lines.findIndex((line) =>
        line.includes("Review from")
      );
      if (reviewStart !== -1) {
        const firstReview = lines.slice(reviewStart, reviewStart + 4);
        return (
          "CUSTOMER REVIEWS ===\n" +
          statsLines.join("\n") +
          "\n\n" +
          firstReview.join("\n") +
          "\n[Additional reviews redacted for logging]"
        );
      }
      return "CUSTOMER REVIEWS ===\n" + statsLines.join("\n");
    }

    // Handle Q&A section
    if (section.startsWith("FREQUENTLY ASKED QUESTIONS")) {
      const lines = section.split("\n");
      const statsLines = lines.filter((line) => line.includes("Showing"));

      // Find first Q&A
      const qaStart = lines.findIndex((line) => line.startsWith("Q:"));
      if (qaStart !== -1) {
        // Include Q, date, A, and answerer
        const firstQA = lines.slice(qaStart, qaStart + 4);
        return (
          "FREQUENTLY ASKED QUESTIONS ===\n" +
          statsLines.join("\n") +
          "\n\n" +
          firstQA.join("\n") +
          "\n[Additional Q&As redacted for logging]"
        );
      }
      return "FREQUENTLY ASKED QUESTIONS ===\n" + statsLines.join("\n");
    }

    // Return other sections unchanged with their header
    return "=== " + section;
  });

  return redactedSections.join("\n\n");
};
