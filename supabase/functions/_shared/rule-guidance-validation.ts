const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const NON_DIRECT_FEASIBILITIES = new Set(["adaptable", "unsupported"]);

/**
 * Deterministic validation for the model-produced guidance contract.
 * Structured Outputs constrains the shape, while this pass enforces the
 * cross-field invariants that JSON Schema cannot express.
 */
export const validateGuidance = (value: unknown): Record<string, unknown> => {
  if (!isRecord(value)) throw new Error("GUIDANCE_INVALID");
  if (!Array.isArray(value.requirements) || value.requirements.length < 1) {
    throw new Error("GUIDANCE_REQUIREMENTS_MISSING");
  }
  if (!Array.isArray(value.questions) || value.questions.length < 2) {
    throw new Error("GUIDANCE_QUESTIONS_MISSING");
  }
  if (!Array.isArray(value.adjustments)) {
    throw new Error("GUIDANCE_ADJUSTMENTS_INVALID");
  }

  const requirementIds = new Set<string>();
  const nonDirectRequirementIds = new Set<string>();
  for (const requirement of value.requirements) {
    if (!isRecord(requirement) || typeof requirement.id !== "string") {
      throw new Error("GUIDANCE_REQUIREMENT_INVALID");
    }
    if (requirementIds.has(requirement.id)) {
      throw new Error("GUIDANCE_REQUIREMENT_DUPLICATED");
    }

    const feasibility = requirement.feasibility;
    if (
      feasibility !== "direct" &&
      feasibility !== "adaptable" &&
      feasibility !== "unsupported"
    ) {
      throw new Error("GUIDANCE_REQUIREMENT_INVALID");
    }

    requirementIds.add(requirement.id);
    if (NON_DIRECT_FEASIBILITIES.has(feasibility)) {
      if (
        typeof requirement.adaptation !== "string" ||
        requirement.adaptation.trim().length < 3
      ) {
        throw new Error("GUIDANCE_ADAPTATION_MISSING");
      }
      nonDirectRequirementIds.add(requirement.id);
    } else if (
      typeof requirement.adaptation !== "string" ||
      requirement.adaptation.trim().length > 0
    ) {
      throw new Error("GUIDANCE_DIRECT_ADAPTATION_INVALID");
    }
  }

  const expectedFeasibility = [...nonDirectRequirementIds].some(
    (requirementId) =>
      (value.requirements as Array<Record<string, unknown>>).some(
        (requirement) =>
          requirement.id === requirementId &&
          requirement.feasibility === "unsupported",
      ),
  )
    ? "unsupported"
    : nonDirectRequirementIds.size > 0
      ? "adaptable"
      : "direct";
  if (value.feasibility !== expectedFeasibility) {
    throw new Error("GUIDANCE_FEASIBILITY_MISMATCH");
  }

  const questionIds = new Set<string>();
  for (const questionValue of value.questions) {
    if (!isRecord(questionValue) || !Array.isArray(questionValue.choices)) {
      throw new Error("GUIDANCE_QUESTION_INVALID");
    }
    if (
      typeof questionValue.id !== "string" ||
      questionIds.has(questionValue.id)
    ) {
      throw new Error("GUIDANCE_QUESTION_DUPLICATED");
    }
    questionIds.add(questionValue.id);
    const min = Number(questionValue.minSelections);
    const max = Number(questionValue.maxSelections);
    if (
      !Number.isInteger(min) ||
      !Number.isInteger(max) ||
      min < 1 ||
      max < min ||
      max > questionValue.choices.length
    ) {
      throw new Error("GUIDANCE_SELECTION_BOUNDS_INVALID");
    }
    if (questionValue.selectionMode === "single" && (min !== 1 || max !== 1)) {
      throw new Error("GUIDANCE_SINGLE_SELECTION_BOUNDS_INVALID");
    }

    const choiceIds = new Set<string>();
    for (const choice of questionValue.choices) {
      if (!isRecord(choice) || typeof choice.id !== "string") {
        throw new Error("GUIDANCE_CHOICE_INVALID");
      }
      if (choiceIds.has(choice.id)) {
        throw new Error("GUIDANCE_CHOICE_DUPLICATED");
      }
      choiceIds.add(choice.id);
    }
  }

  const adjustmentIds = new Set<string>();
  const coveredNonDirectRequirementIds = new Set<string>();
  for (const adjustment of value.adjustments) {
    if (!isRecord(adjustment) || !Array.isArray(adjustment.requirementIds)) {
      throw new Error("GUIDANCE_ADJUSTMENT_INVALID");
    }
    if (
      typeof adjustment.id !== "string" ||
      adjustmentIds.has(adjustment.id) ||
      typeof adjustment.description !== "string" ||
      adjustment.description.trim().length < 3 ||
      adjustment.requirementIds.length < 1
    ) {
      throw new Error("GUIDANCE_ADJUSTMENT_INVALID");
    }
    adjustmentIds.add(adjustment.id);

    const linkedRequirementIds = new Set<string>();
    for (const requirementId of adjustment.requirementIds) {
      if (
        typeof requirementId !== "string" ||
        linkedRequirementIds.has(requirementId) ||
        !requirementIds.has(requirementId)
      ) {
        throw new Error("GUIDANCE_ADJUSTMENT_REQUIREMENT_UNKNOWN");
      }
      linkedRequirementIds.add(requirementId);
      if (!nonDirectRequirementIds.has(requirementId)) {
        throw new Error("GUIDANCE_ADJUSTMENT_REQUIREMENT_DIRECT");
      }
      if (nonDirectRequirementIds.has(requirementId)) {
        coveredNonDirectRequirementIds.add(requirementId);
      }
    }
  }

  if (
    [...nonDirectRequirementIds].some(
      (requirementId) => !coveredNonDirectRequirementIds.has(requirementId),
    )
  ) {
    throw new Error("GUIDANCE_ADJUSTMENT_REQUIRED");
  }

  return value;
};
