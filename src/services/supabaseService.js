import { createClient } from "@supabase/supabase-js";
import config from "../config/config.js";
import logger from "../utils/logger.js";

// Initialize Supabase client
const supabase = createClient(config.supabase.url, config.supabase.key);

/**
 * Add db operations here
 */

// Export the supabase client for use in other modules
export default supabase;
