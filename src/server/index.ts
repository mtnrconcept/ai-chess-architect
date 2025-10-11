import cors from "cors";
import express from "express";

import tournamentRoutes from "./tournamentRoutes";
import { initializeTournaments } from "../services/tournamentService";

const app = express();

app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/tournaments", tournamentRoutes);

const port = Number(process.env.PORT) || 4000;

if (process.env.NODE_ENV !== "test") {
  initializeTournaments();
  app.listen(port, () => {
    console.log(`Tournament service listening on http://localhost:${port}`);
  });
}

export default app;
