import { describe, expect, it } from "vitest";
import { generateUIActions } from "./enrichment";

describe("generateUIActions - special action id", () => {
  it("builds a sanitized id when effect id is present", () => {
    const actions = generateUIActions({
      effects: [
        {
          id: "Royal Guard!",
          when: "ui.activate",
          do: { action: "piece.capture" },
        },
      ],
    });

    expect(actions[0]?.id).toBe("special_royal_guard");
  });

  it("falls back to indexed id when effect id is missing", () => {
    const actions = generateUIActions({
      effects: [
        {
          when: "ui.activate",
          do: { action: "piece.capture" },
        },
      ],
    });

    expect(actions[0]?.id).toBe("special_action_0");
  });
});
