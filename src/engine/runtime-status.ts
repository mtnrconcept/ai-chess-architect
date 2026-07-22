export function isRuntimeStatusActive(
  statuses: Record<string, unknown> | undefined,
  key: string,
): boolean {
  if (!statuses || !key) return false;

  const status = statuses[key];
  if (status === null || status === undefined || status === false) return false;
  if (typeof status !== "object") return Boolean(status);
  if (Array.isArray(status)) return false;

  const record = status as { active?: unknown; duration?: unknown };
  if (
    typeof record.duration === "number" &&
    Number.isFinite(record.duration) &&
    record.duration === 0
  ) {
    return false;
  }
  if (Object.prototype.hasOwnProperty.call(record, "active")) {
    return record.active === true;
  }
  return true;
}
