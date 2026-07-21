import { authenticateRequest } from "../_shared/auth-v2.ts";
import { handlePreflight, jsonResponse } from "../_shared/cors-v2.ts";

const TWO_HOURS_MS = 2 * 60 * 60 * 1000;
const SLOT_COUNT = 10;
const MATCH_TOLERANCE_MS = 60_000;

const variants = [
  "Classique",
  "Blitz",
  "Échecs 960",
  "Variantes Voltus",
] as const;

const floorToTwoHourSlot = (value: Date): Date => {
  const result = new Date(value);
  result.setUTCMinutes(0, 0, 0);
  result.setUTCHours(Math.floor(result.getUTCHours() / 2) * 2);
  return result;
};

const formatSlotName = (value: Date): string => {
  const stamp = value
    .toISOString()
    .slice(0, 13)
    .replaceAll("-", "")
    .replace("T", "-");
  return `Voltus Arena #${stamp}`;
};

const authorizedMaintenanceUser = (
  userId: string,
  appMetadata: Record<string, unknown>,
): boolean => {
  const configuredUsers = new Set(
    (Deno.env.get("TOURNAMENT_MAINTENANCE_USER_IDS") ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );

  return (
    appMetadata.role === "admin" ||
    appMetadata.role === "owner" ||
    appMetadata.is_admin === true ||
    configuredUsers.has(userId)
  );
};

Deno.serve(async (request) => {
  const preflight = handlePreflight(request);
  if (preflight) return preflight;

  if (request.method !== "POST") {
    return jsonResponse(request, 405, {
      success: false,
      error: "Méthode non autorisée.",
    });
  }

  try {
    const { user, serviceClient } = await authenticateRequest(request);
    const appMetadata = user.app_metadata as Record<string, unknown>;

    if (!authorizedMaintenanceUser(user.id, appMetadata)) {
      return jsonResponse(request, 403, {
        success: false,
        error: "Accès administrateur requis.",
      });
    }

    const now = new Date();
    const firstSlot = floorToTwoHourSlot(now);
    const desiredSlots = Array.from({ length: SLOT_COUNT }, (_, index) => {
      const start = new Date(firstSlot.getTime() + index * TWO_HOURS_MS);
      const end = new Date(start.getTime() + TWO_HOURS_MS);
      return {
        start,
        end,
        name: formatSlotName(start),
        variantName: variants[index % variants.length],
      };
    });

    const searchStart = new Date(
      desiredSlots[0].start.getTime() - MATCH_TOLERANCE_MS,
    ).toISOString();
    const searchEnd = new Date(
      desiredSlots[desiredSlots.length - 1].end.getTime() +
        MATCH_TOLERANCE_MS,
    ).toISOString();

    const { data: existingRows, error: existingError } = await serviceClient
      .from("tournaments")
      .select("id,name,status,start_time,end_time,variant_name")
      .gte("start_time", searchStart)
      .lt("start_time", searchEnd)
      .order("start_time", { ascending: true });

    if (existingError) throw new Error("TOURNAMENT_READ_FAILED");

    const existing = existingRows ?? [];
    const missing = desiredSlots.filter(
      (slot) =>
        !existing.some((row) => {
          const timestamp = new Date(String(row.start_time)).getTime();
          return Math.abs(timestamp - slot.start.getTime()) <= MATCH_TOLERANCE_MS;
        }),
    );

    let created = 0;
    if (missing.length > 0) {
      const { data: inserted, error: insertError } = await serviceClient
        .from("tournaments")
        .insert(
          missing.map((slot) => ({
            name: slot.name,
            description:
              "Tournoi automatique Voltus de deux heures, ouvert aux joueurs connectés.",
            status:
              slot.start.getTime() <= now.getTime() &&
              now.getTime() < slot.end.getTime()
                ? "running"
                : "scheduled",
            start_time: slot.start.toISOString(),
            end_time: slot.end.toISOString(),
            variant_name: slot.variantName,
            variant_source: "builtin",
            variant_rules: [],
          })),
        )
        .select("id");

      if (insertError) throw new Error("TOURNAMENT_INSERT_FAILED");
      created = inserted?.length ?? 0;
    }

    const nowIso = now.toISOString();
    const { error: completeError } = await serviceClient
      .from("tournaments")
      .update({ status: "completed", updated_at: nowIso })
      .in("status", ["scheduled", "running"])
      .lte("end_time", nowIso);
    if (completeError) throw new Error("TOURNAMENT_COMPLETE_FAILED");

    const { error: runningError } = await serviceClient
      .from("tournaments")
      .update({ status: "running", updated_at: nowIso })
      .eq("status", "scheduled")
      .lte("start_time", nowIso)
      .gt("end_time", nowIso);
    if (runningError) throw new Error("TOURNAMENT_ACTIVATION_FAILED");

    const { data: overview, error: overviewError } = await serviceClient
      .from("tournaments")
      .select("id,name,status,start_time,end_time,variant_name")
      .gte("end_time", nowIso)
      .order("start_time", { ascending: true })
      .limit(SLOT_COUNT);
    if (overviewError) throw new Error("TOURNAMENT_OVERVIEW_FAILED");

    return jsonResponse(request, 200, {
      success: true,
      data: {
        created,
        maintained: overview?.length ?? 0,
        tournaments: overview ?? [],
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    const authFailure = message === "AUTH_REQUIRED" || message === "AUTH_INVALID";

    console.error("[ensure-ten-tournaments]", {
      code: authFailure ? "AUTHENTICATION_FAILED" : message,
    });

    return jsonResponse(request, authFailure ? 401 : 500, {
      success: false,
      code: authFailure ? "AUTHENTICATION_FAILED" : "TOURNAMENT_MAINTENANCE_FAILED",
      error: authFailure
        ? "Authentification requise."
        : "La maintenance des tournois a échoué.",
    });
  }
});
