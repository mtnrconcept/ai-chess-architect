import { assert, assertEquals, assertThrows } from "jsr:@std/assert@1";
import {
  buildAssetModerationRequest,
  detectManagedCinematicMotion,
  extractAssetSearchQuery,
  inspectRasterImage,
  isAllowedAssetLicense,
  isAllowedCommonsAssetUrl,
  parseAssetModerationResponse,
} from "./rule-assets.ts";

const writeUint32BE = (bytes: Uint8Array, offset: number, value: number) => {
  bytes[offset] = (value >>> 24) & 0xff;
  bytes[offset + 1] = (value >>> 16) & 0xff;
  bytes[offset + 2] = (value >>> 8) & 0xff;
  bytes[offset + 3] = value & 0xff;
};

const pngBytes = (width: number, height: number, animated = false) => {
  const bytes = new Uint8Array(animated ? 32 : 24);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  bytes.set([0x49, 0x48, 0x44, 0x52], 12);
  writeUint32BE(bytes, 16, width);
  writeUint32BE(bytes, 20, height);
  if (animated) bytes.set([0x61, 0x63, 0x54, 0x4c], 28);
  return bytes;
};

const jpegBytes = (width: number, height: number) => {
  const bytes = new Uint8Array(23);
  bytes.set([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08]);
  bytes[7] = (height >>> 8) & 0xff;
  bytes[8] = height & 0xff;
  bytes[9] = (width >>> 8) & 0xff;
  bytes[10] = width & 0xff;
  bytes[21] = 0xff;
  bytes[22] = 0xd9;
  return bytes;
};

const webpBytes = (width: number, height: number, animated = false) => {
  const bytes = new Uint8Array(30);
  bytes.set(new TextEncoder().encode("RIFF"), 0);
  bytes.set(new TextEncoder().encode("WEBP"), 8);
  bytes.set(new TextEncoder().encode("VP8X"), 12);
  bytes[20] = animated ? 0x02 : 0;
  const w = width - 1;
  const h = height - 1;
  bytes[24] = w & 0xff;
  bytes[25] = (w >>> 8) & 0xff;
  bytes[26] = (w >>> 16) & 0xff;
  bytes[27] = h & 0xff;
  bytes[28] = (h >>> 8) & 0xff;
  bytes[29] = (h >>> 16) & 0xff;
  return bytes;
};

Deno.test("rule-assets: extrait une requête visuelle bornée", () => {
  const query = extractAssetSearchQuery(
    "Quand une pièce est capturée, un dragon rouge arrive et l'emporte.",
  );

  assert(query);
  assert(query.includes("dragon"));
  assert(query.endsWith("illustration transparent"));
  assert(query.length <= 96);
});

Deno.test("rule-assets: accepte un acteur visuel non prélisté", () => {
  const query = extractAssetSearchQuery(
    "Un dinosaure violet apparaît et emporte la tour capturée.",
  );

  assert(query?.includes("dinosaure"));
  assert(query?.includes("violet"));
});

Deno.test("rule-assets: ne lance aucune recherche pour une règle non visuelle", () => {
  assertEquals(
    extractAssetSearchQuery("Les cavaliers peuvent avancer de deux cases."),
    null,
  );
});

Deno.test("rule-assets: choisit un preset d'animation déclaratif", () => {
  assertEquals(
    detectManagedCinematicMotion("Un dragon emporte la pièce capturée"),
    "carry",
  );
  assertEquals(
    detectManagedCinematicMotion("Une explosion éclate sur la case"),
    "burst",
  );
  assertEquals(
    detectManagedCinematicMotion("Un aigle vole vers la case"),
    "swoop",
  );
});

Deno.test("rule-assets: n'autorise que le CDN Commons exact", () => {
  assert(
    isAllowedCommonsAssetUrl(
      "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a1/Dragon.png/1024px-Dragon.png",
    ),
  );
  assert(
    !isAllowedCommonsAssetUrl(
      "https://upload.wikimedia.org.evil.example/wikipedia/commons/dragon.png",
    ),
  );
  assert(
    !isAllowedCommonsAssetUrl(
      "https://upload.wikimedia.org/wikipedia/commons/dragon.svg?raw=1",
    ),
  );
  assert(!isAllowedCommonsAssetUrl("http://169.254.169.254/latest/meta-data"));
});

Deno.test("rule-assets: limite les licences à CC0 et domaine public", () => {
  assert(isAllowedAssetLicense("CC0"));
  assert(isAllowedAssetLicense("CC0 1.0"));
  assert(isAllowedAssetLicense("Public domain"));
  assert(!isAllowedAssetLicense("CC BY 4.0"));
  assert(!isAllowedAssetLicense("All rights reserved"));
});

Deno.test("rule-assets: inspecte les dimensions réelles des formats raster", () => {
  assertEquals(inspectRasterImage(pngBytes(512, 256)), {
    contentType: "image/png",
    extension: "png",
    width: 512,
    height: 256,
    animated: false,
  });
  assertEquals(inspectRasterImage(jpegBytes(640, 480)), {
    contentType: "image/jpeg",
    extension: "jpg",
    width: 640,
    height: 480,
    animated: false,
  });
  assertEquals(inspectRasterImage(webpBytes(1024, 768)), {
    contentType: "image/webp",
    extension: "webp",
    width: 1024,
    height: 768,
    animated: false,
  });
});

Deno.test("rule-assets: détecte les rasters animés et rejette les scripts", () => {
  assertEquals(inspectRasterImage(pngBytes(256, 256, true))?.animated, true);
  assertEquals(inspectRasterImage(webpBytes(256, 256, true))?.animated, true);
  assertEquals(
    inspectRasterImage(new TextEncoder().encode("<script>alert(1)</script>")),
    null,
  );
  assertEquals(
    inspectRasterImage(
      new TextEncoder().encode('<svg onload="fetch(\"https://evil\")"></svg>'),
    ),
    null,
  );
});

Deno.test("rule-assets: construit une modération multimodale uniquement pour Commons", () => {
  const url =
    "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a1/Dragon.png/1024px-Dragon.png";
  assertEquals(buildAssetModerationRequest("dragon illustration", url), {
    model: "omni-moderation-latest",
    input: [
      {
        type: "text",
        text: "Asset visuel candidat pour une règle de jeu d'échecs: dragon illustration",
      },
      {
        type: "image_url",
        image_url: { url },
      },
    ],
  });

  assertThrows(
    () => buildAssetModerationRequest("dragon", "https://evil.example/a.png"),
    Error,
    "ASSET_MODERATION_URL_REJECTED",
  );
});

Deno.test("rule-assets: accepte uniquement une réponse de modération non signalée", () => {
  assertEquals(
    parseAssetModerationResponse({
      id: "modr_safe",
      model: "omni-moderation-latest",
      results: [
        {
          flagged: false,
          categories: {
            sexual: false,
            violence: false,
          },
        },
      ],
    }),
    {
      approved: true,
      id: "modr_safe",
      model: "omni-moderation-latest",
      flagged: false,
      flaggedCategories: [],
    },
  );

  assertEquals(
    parseAssetModerationResponse({
      id: "modr_blocked",
      model: "omni-moderation-latest",
      results: [
        {
          flagged: true,
          categories: {
            sexual: true,
            violence: false,
          },
        },
      ],
    }),
    {
      approved: false,
      id: "modr_blocked",
      model: "omni-moderation-latest",
      flagged: true,
      flaggedCategories: ["sexual"],
    },
  );

  assertEquals(parseAssetModerationResponse({ results: [] }), null);
});
