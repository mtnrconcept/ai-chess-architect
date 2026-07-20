import { MoveProcessingError } from "./protocol.ts";
import {
  STANDARD_PLATFORM_ENGINE_VERSION,
  STANDARD_VALIDATOR_ID,
} from "./standard-engine.ts";

const encoder = new TextEncoder();

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function standardRulesetHash(): Promise<string> {
  return await sha256Hex(`standard:engine:${STANDARD_PLATFORM_ENGINE_VERSION}`);
}

export async function assertStandardPositionHash(
  fen: string,
  positionHash: string,
): Promise<void> {
  if ((await sha256Hex(fen)) !== positionHash) {
    throw new MoveProcessingError("MATCH_STATE_INTEGRITY_FAILED");
  }
}

export async function createRuleStateHash(input: {
  rulesetHash: string;
  sharedSeed: number;
  revision: number;
  fen: string;
}): Promise<string> {
  return await sha256Hex(
    [
      "standard-rule-state-v1",
      input.rulesetHash,
      input.sharedSeed.toString(10),
      input.revision.toString(10),
      input.fen,
    ].join(":"),
  );
}

export async function createVerificationReference(input: {
  matchId: string;
  revision: number;
  fen: string;
  result: string;
  termination: string;
  rulesetHash: string;
}): Promise<string> {
  const evidenceHash = await sha256Hex(
    [
      "standard-terminal-v1",
      STANDARD_VALIDATOR_ID,
      input.matchId,
      input.revision.toString(10),
      input.fen,
      input.result,
      input.termination,
      input.rulesetHash,
    ].join(":"),
  );

  return `standard-terminal-v1:${evidenceHash}`;
}

export async function createTimeoutVerificationReference(input: {
  matchId: string;
  revision: number;
  fen: string;
  rulesetHash: string;
}): Promise<string> {
  const evidenceHash = await sha256Hex(
    [
      "standard-timeout-v1",
      STANDARD_VALIDATOR_ID,
      input.matchId,
      input.revision.toString(10),
      input.fen,
      input.rulesetHash,
    ].join(":"),
  );

  return `standard-timeout-v1:${evidenceHash}`;
}
