import cors from "cors";
import express from "express";

import tournamentRoutes from "./tournamentRoutes";
import { initializeTournaments } from "../services/tournamentService";
import {
  applySupabaseMigrations,
  MissingSupabaseConnectionStringError,
} from "../integrations/supabase/migrations/applySupabaseMigrations";

const app = express();

app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/tournaments", tournamentRoutes);

const port = Number(process.env.PORT) || 4000;

const startServer = async () => {
  if (process.env.NODE_ENV === "test") {
    return;
  }

  try {
    await applySupabaseMigrations({
      logger: {
        info: (message) => console.log(`[supabase:migrate] ${message}`),
        warn: (message) => console.warn(`[supabase:migrate] ${message}`),
        error: (message) => console.error(`[supabase:migrate] ${message}`),
      },
    });
  } catch (error) {
    if (error instanceof MissingSupabaseConnectionStringError) {
      console.warn(
        "Supabase connection string not configured. Skipping automatic migrations. Set SUPABASE_DB_URL (or SUPABASE_DB_CONNECTION_STRING/DATABASE_URL) if you want the server to run them at startup.",
      );
    } else {
      console.error("Failed to apply Supabase migrations during startup:", error);
    }
  }

  initializeTournaments();
  app.listen(port, () => {
    console.log(`Tournament service listening on http://localhost:${port}`);
  });
};

void startServer();

export default app;
