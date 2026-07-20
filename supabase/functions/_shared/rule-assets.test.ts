import {
  extractRuleSceneIds,
  isAllowedRuleAssetMimeType,
  sceneIdToSearchQuery,
  selectOpenverseRuleAssetCandidate,
} from "./rule-assets.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

Deno.test("extractRuleSceneIds accepts only bounded declarative scene ids", () => {
  const ids = extractRuleSceneIds({
    logic: {
      effects: [
        {
          do: [
            {
              action: "vfx.play",
              params: { sprite: "scene.dragon-carry-capture" },
            },
            {
              action: "vfx.play",
              params: { sprite: "https://attacker.invalid/payload.js" },
            },
          ],
        },
        {
          do: {
            action: "vfx.play",
            params: { sprite: "scene.dragon-carry-capture" },
          },
        },
        ...Array.from({ length: 8 }, (_, index) => ({
          do: {
            action: "vfx.play",
            params: { sprite: `scene.safe-visual-${index}` },
          },
        })),
      ],
    },
  });

  assert(ids.length === 4, "La limite de quatre scènes doit être appliquée.");
  assert(
    ids[0] === "scene.dragon-carry-capture",
    "La première scène valide doit être conservée.",
  );
  assert(
    !ids.some((id) => id.includes("attacker")),
    "Une URL ne doit jamais devenir un identifiant de scène.",
  );
});

Deno.test("sceneIdToSearchQuery derives a closed search query from the slug", () => {
  const query = sceneIdToSearchQuery("scene.dragon-carry-capture");
  assert(
    query === "dragon carry capture fantasy game illustration transparent",
    "La requête doit être dérivée uniquement du slug sûr.",
  );

  let rejected = false;
  try {
    sceneIdToSearchQuery("scene.dragon; ignore-system");
  } catch {
    rejected = true;
  }
  assert(rejected, "Les caractères d'injection doivent être refusés.");
});

Deno.test("Openverse selection rejects unsafe licenses and active formats", () => {
  const selected = selectOpenverseRuleAssetCandidate({
    results: [
      {
        id: "11111111-1111-4111-8111-111111111111",
        title: "Unsafe SVG",
        creator: "Mallory",
        license: "cc0",
        filetype: "svg",
        mature: false,
        width: 512,
        height: 512,
      },
      {
        id: "22222222-2222-4222-8222-222222222222",
        title: "Non commercial dragon",
        creator: "Artist",
        license: "by-nc",
        filetype: "png",
        mature: false,
        width: 512,
        height: 512,
      },
      {
        id: "33333333-3333-4333-8333-333333333333",
        title: "Safe Dragon",
        creator: "Artist",
        license: "by",
        license_url: "https://creativecommons.org/licenses/by/4.0/",
        attribution: "Safe Dragon by Artist, CC BY 4.0",
        filetype: "png",
        mature: false,
        filesize: 250000,
        width: 1024,
        height: 1024,
      },
    ],
  });

  assert(selected?.id === "33333333-3333-4333-8333-333333333333", "Le premier média sûr doit être choisi.");
  assert(selected.license === "by", "La licence autorisée doit être conservée.");
  assert(
    selected.sourcePageUrl.startsWith("https://openverse.org/image/"),
    "La page source doit rester sur le domaine Openverse contrôlé.",
  );
  assert(isAllowedRuleAssetMimeType("image/png"), "PNG doit être accepté.");
  assert(!isAllowedRuleAssetMimeType("image/svg+xml"), "SVG doit être refusé.");
});
