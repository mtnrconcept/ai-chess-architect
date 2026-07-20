import {
  createRuleStateHash,
  createTimeoutVerificationReference,
  createVerificationReference,
  standardRulesetHash,
} from "./integrity.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

Deno.test("les empreintes STANDARD sont déterministes et bornées", async () => {
  const ruleset = await standardRulesetHash();
  const input = {
    rulesetHash: ruleset,
    sharedSeed: 42,
    revision: 1,
    fen: "8/8/8/8/8/8/4K3/7k b - - 1 1",
  };
  const first = await createRuleStateHash(input);
  const second = await createRuleStateHash(input);

  assert(/^[0-9a-f]{64}$/.test(ruleset), "Le ruleset doit être un SHA-256.");
  assert(first === second, "Le hash d'état doit être déterministe.");

  const reference = await createVerificationReference({
    matchId: "11111111-1111-4111-8111-111111111111",
    revision: 1,
    fen: input.fen,
    result: "1/2-1/2",
    termination: "insufficient-material",
    rulesetHash: ruleset,
  });
  assert(
    /^standard-terminal-v1:[0-9a-f]{64}$/.test(reference),
    "La référence terminale doit être vérifiable et stable.",
  );

  const timeoutReference = await createTimeoutVerificationReference({
    matchId: "11111111-1111-4111-8111-111111111111",
    revision: 1,
    fen: input.fen,
    rulesetHash: ruleset,
  });
  assert(
    /^standard-timeout-v1:[0-9a-f]{64}$/.test(timeoutReference),
    "La preuve de timeout ne doit pas présumer du verdict matériel de la base.",
  );
});
