const US_STATES = ["Florida"]; // Will be expanded later to include all states

export const scrapeConfig = {
  searchQueries: [
    "electric scooter repair",
    "stand-up electric scooter",
    "bicycle Repair",
  ],
  states: US_STATES,
  maxResults: 100, //9999999, // Max results per search term. Use 9999999 for all available. <200 disables deeperCityScrape
};
