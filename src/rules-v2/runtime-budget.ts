export class RuntimeBudgetExceededError extends Error {
  constructor(
    public readonly consumed: number,
    public readonly limit: number,
  ) {
    super(`Budget d'exécution dépassé (${consumed}/${limit}).`);
    this.name = "RuntimeBudgetExceededError";
  }
}

export class RuntimeBudget {
  private consumedUnits = 0;
  private currentDepth = 0;

  constructor(
    public readonly limit = 128,
    public readonly maxDepth = 8,
  ) {}

  charge(units = 1): void {
    const safeUnits = Number.isFinite(units)
      ? Math.max(1, Math.floor(units))
      : 1;
    this.consumedUnits += safeUnits;
    if (this.consumedUnits > this.limit) {
      throw new RuntimeBudgetExceededError(this.consumedUnits, this.limit);
    }
  }

  enter(): void {
    this.currentDepth += 1;
    if (this.currentDepth > this.maxDepth) {
      throw new RuntimeBudgetExceededError(this.consumedUnits, this.limit);
    }
  }

  leave(): void {
    this.currentDepth = Math.max(0, this.currentDepth - 1);
  }

  get consumed(): number {
    return this.consumedUnits;
  }

  get remaining(): number {
    return Math.max(0, this.limit - this.consumedUnits);
  }
}
