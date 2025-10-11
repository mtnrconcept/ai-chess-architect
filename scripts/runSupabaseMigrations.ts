import process from "node:process";

import { applySupabaseMigrations } from "../src/integrations/supabase/migrations/applySupabaseMigrations";

const main = async () => {
  try {
    const result = await applySupabaseMigrations();
    if (result.total === 0) {
      return;
    }
  } catch (error) {
    if (error instanceof Error) {
      console.error("Failed to apply Supabase migrations:", error.message);
    } else {
      console.error("Failed to apply Supabase migrations:", error);
    }
    process.exitCode = 1;
  }
};

main();
