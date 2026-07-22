import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import { issueGuidanceToken, verifyGuidanceToken } from "./guidance-token.ts";

Deno.test(
  "guidance-token: authentifie le contrat, l’utilisateur et l’expiration",
  async () => {
    const previous = Deno.env.get("RULE_GUIDANCE_SIGNING_SECRET");
    Deno.env.set(
      "RULE_GUIDANCE_SIGNING_SECRET",
      "test-only-guidance-secret-with-enough-entropy",
    );

    try {
      const token = await issueGuidanceToken({
        userId: "user-a",
        originalPrompt: "Le fou gèle une cible ennemie pendant deux tours.",
        guidance: { requirements: [{ id: "freeze-target" }] },
        nowSeconds: 10_000,
      });
      const payload = await verifyGuidanceToken({
        token,
        userId: "user-a",
        nowSeconds: 10_001,
      });
      assertEquals(
        payload.originalPrompt,
        "Le fou gèle une cible ennemie pendant deux tours.",
      );

      const tampered = `${token.slice(0, -1)}${token.endsWith("a") ? "b" : "a"}`;
      await assertRejects(
        () =>
          verifyGuidanceToken({
            token: tampered,
            userId: "user-a",
            nowSeconds: 10_001,
          }),
        Error,
        "GUIDANCE_TOKEN_SIGNATURE_INVALID",
      );
      await assertRejects(
        () =>
          verifyGuidanceToken({
            token,
            userId: "user-b",
            nowSeconds: 10_001,
          }),
        Error,
        "GUIDANCE_TOKEN_CLAIMS_INVALID",
      );
      await assertRejects(
        () =>
          verifyGuidanceToken({
            token,
            userId: "user-a",
            nowSeconds: 13_600,
          }),
        Error,
        "GUIDANCE_TOKEN_CLAIMS_INVALID",
      );
    } finally {
      if (previous === undefined) {
        Deno.env.delete("RULE_GUIDANCE_SIGNING_SECRET");
      } else {
        Deno.env.set("RULE_GUIDANCE_SIGNING_SECRET", previous);
      }
    }
  },
);
