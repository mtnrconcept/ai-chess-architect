import { Router } from "express";

import {
  getTournamentById,
  getTournamentLeaderboard,
  listTournaments,
  recordMatchResult,
  seedTournaments,
  updateTournamentStatus,
} from "../services/tournamentService";

const router = Router();

router.get("/", (_req, res) => {
  const tournaments = listTournaments();
  res.json(tournaments);
});

router.post("/seed", (_req, res) => {
  const tournaments = seedTournaments(10);
  res.status(201).json(tournaments);
});

router.get("/:id", (req, res) => {
  const tournament = getTournamentById(req.params.id);
  if (!tournament) {
    res.status(404).json({ message: "Tournoi introuvable" });
    return;
  }

  res.json(tournament);
});

router.post("/:id/status", (req, res) => {
  const { status } = req.body as { status?: string };

  if (!status || (status !== "scheduled" && status !== "ongoing" && status !== "completed")) {
    res.status(400).json({ message: "Statut invalide" });
    return;
  }

  try {
    const updated = updateTournamentStatus(req.params.id, status);
    res.json(updated);
  } catch (error) {
    res.status(404).json({ message: error instanceof Error ? error.message : "Tournoi introuvable" });
  }
});

router.post("/:id/matches", (req, res) => {
  const { player1Id, player2Id, player1Name, player2Name, result } = req.body as {
    player1Id?: string;
    player2Id?: string;
    player1Name?: string;
    player2Name?: string;
    result?: "player1" | "player2" | "draw";
  };

  if (!player1Id || !player2Id || !result) {
    res.status(400).json({ message: "Paramètres de match manquants" });
    return;
  }

  try {
    const tournament = recordMatchResult(req.params.id, {
      player1Id,
      player2Id,
      player1Name,
      player2Name,
      result,
    });
    res.status(201).json(tournament);
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : "Impossible d'enregistrer le match" });
  }
});

router.get("/:id/leaderboard", (req, res) => {
  try {
    const leaderboard = getTournamentLeaderboard(req.params.id);
    res.json(leaderboard);
  } catch (error) {
    res.status(404).json({ message: error instanceof Error ? error.message : "Tournoi introuvable" });
  }
});

export default router;
