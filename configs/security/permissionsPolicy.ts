const BLOCKED_DIRECTIVES = new Set(["vr", "battery", "ambient-light-sensor"]);

export type PermissionsPolicyDirectives = Record<string, ReadonlyArray<string>>;

const sanitiseAllowList = (allowlist: ReadonlyArray<string> | undefined) => {
  if (!allowlist) return [] as string[];

  const unique = new Set<string>();

  for (const entry of allowlist) {
    if (typeof entry !== "string") {
      continue;
    }

    const token = entry.trim();
    if (!token) {
      continue;
    }

    unique.add(token);
  }

  return Array.from(unique);
};

export const buildPermissionsPolicyHeader = (
  directives: PermissionsPolicyDirectives,
): string => {
  const serialized: string[] = [];

  for (const [feature, allowlist] of Object.entries(directives)) {
    if (BLOCKED_DIRECTIVES.has(feature)) {
      throw new Error(
        `Permissions-Policy directive "${feature}" is deprecated or unsupported in modern browsers. ` +
          "Remove it from the configuration or replace it with a supported directive.",
      );
    }

    const tokens = sanitiseAllowList(allowlist);
    const value = tokens.length > 0 ? tokens.join(" ") : "";
    serialized.push(`${feature}=(${value})`);
  }

  return serialized.join(", ");
};

export const defaultPermissionsPolicyDirectives = {
  camera: [],
  microphone: [],
  geolocation: [],
  fullscreen: ["self"],
  "xr-spatial-tracking": [],
  autoplay: [],
  gamepad: [],
} as const satisfies PermissionsPolicyDirectives;

export const defaultPermissionsPolicyHeader = buildPermissionsPolicyHeader(
  defaultPermissionsPolicyDirectives,
);

export const blockedPermissionsPolicyDirectives = Array.from(
  BLOCKED_DIRECTIVES,
) as ReadonlyArray<string>;
