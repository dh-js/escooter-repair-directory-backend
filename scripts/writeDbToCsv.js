import { createClient } from "@supabase/supabase-js";
import config from "../src/config/config.js";
import { parse } from "json2csv";
import fs from "fs";

const supabase = createClient(config.supabase.url, config.supabase.key);

async function logAllRows() {
  const tableName = "stores";
  const batchSize = 100;
  let offset = 0;
  let totalCount = 0;

  try {
    fs.writeFileSync("all_stores.csv", "", "utf-8");

    while (true) {
      try {
        const { data, error, count } = await supabase
          .from(tableName)
          .select("*", { count: "exact" })
          .range(offset, offset + batchSize - 1);

        if (error) throw error;

        if (data.length === 0) break;

        const flattenedData = data.map((store) => ({
          id: store.id,
          place_id: store.place_id,
          search_string: store.search_string,
          search_page_url: store.search_page_url,
          name: store.name,
          subtitle: store.subtitle,
          description: store.description,
          category_name: store.category_name,
          categories: store.categories?.join(";"),
          website: store.website,
          phone: store.phone,
          permanently_closed: store.permanently_closed,
          temporarily_closed: store.temporarily_closed,
          address: store.address,
          street: store.street,
          city: store.city,
          state: store.state,
          postal_code: store.postal_code,
          country_code: store.country_code,
          neighborhood: store.neighborhood,
          located_in: store.located_in,
          plus_code: store.plus_code,
          latitude: store.latitude,
          longitude: store.longitude,
          opening_hours: JSON.stringify(store.opening_hours),
          total_score: store.total_score,
          reviews_count: store.reviews_count,
          reviews_distribution: JSON.stringify(store.reviews_distribution),
          reviews_tags: JSON.stringify(store.reviews_tags),
          places_tags: store.places_tags?.join(";"),
          additional_info: JSON.stringify(store.additional_info),
          owner_updates: JSON.stringify(store.owner_updates),
          people_also_search: JSON.stringify(store.people_also_search),
          escooter_repair_confirmed: store.escooter_repair_confirmed,
          repair_tier: store.repair_tier,
          service_tiers: JSON.stringify(store.service_tiers),
          ai_summary: store.ai_summary,
          ai_summary_updated_at: store.ai_summary_updated_at,
          confidence_score: store.confidence_score,
          verified_by_call: store.verified_by_call,
          verified_date: store.verified_date,
          owner_verified: store.owner_verified,
          supported_brands: store.supported_brands?.join(";"),
          scraped_at: store.scraped_at,
          last_updated: store.last_updated,
          maps_url: store.maps_url,
        }));

        const csvOptions = {
          quote: '"',
          escape: '"',
          delimiter: ",",
          header: true,
          quotedString: true,
          nullValue: "",
        };

        const csv = parse(flattenedData, csvOptions);
        fs.appendFileSync("all_stores.csv", csv, "utf-8");

        totalCount += data.length;
        console.log(
          `Processed batch: ${
            offset / batchSize + 1
          }, Total count: ${totalCount}`
        );

        offset += batchSize;

        await new Promise((resolve) => setTimeout(resolve, 1000));
      } catch (error) {
        console.error(`Error processing batch at offset ${offset}:`, error);
        offset += batchSize;
        continue;
      }
    }

    console.log(`Total stores written: ${totalCount}`);
  } catch (error) {
    console.error("Fatal error:", error);
  }
}

logAllRows();
