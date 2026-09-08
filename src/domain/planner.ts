import {
  ConceptProgress,
  CurriculumConcept,
  DailyGoalBlueprint,
  DailyPlan,
  ErrorRecord,
  LearningUnit,
  PlanItem,
} from '../types.ts';

export interface PlannerInput {
  learnerId: string;
  date: string;
  budgetMinutes: number;
  concepts: readonly CurriculumConcept[];
  units: readonly LearningUnit[];
  blueprints: readonly DailyGoalBlueprint[];
  progress: Readonly<Record<string, ConceptProgress>>;
  errors: readonly ErrorRecord[];
  interests: readonly string[];
  stateVersion: number;
}

const hasSatisfiedPrerequisites = (
  prerequisiteIds: readonly string[],
  progress: Readonly<Record<string, ConceptProgress>>,
): boolean => prerequisiteIds.every((id) => (progress[id]?.learnedPercent ?? 0) >= 100);

const createItem = (
  id: string,
  kind: PlanItem['kind'],
  conceptIds: string[],
  unitIds: string[],
  outcome: string,
  minutes: number,
): PlanItem => ({
  id,
  conceptId: conceptIds[0],
  conceptIds,
  unitIds,
  kind,
  outcome,
  objective: outcome,
  estimatedMinutes: minutes,
  completedMinutes: 0,
  completionCredit: 0,
  completionRules: conceptIds.map((conceptId) => ({
    evidenceType: kind === 'free_play' ? 'output' : kind === 'review' ? 'retrieval' : 'controlled_practice',
    conceptId,
    requiredCount: 1,
    minimumQuality: kind === 'new' ? 0.6 : 0.75,
  })),
  completed: false,
});

export function generateDailyPlan(input: PlannerInput): DailyPlan {
  if (!Number.isFinite(input.budgetMinutes) || input.budgetMinutes <= 0) throw new RangeError('budgetMinutes must be positive');
  let remaining = input.budgetMinutes;
  const items: PlanItem[] = [];
  const due = Object.values(input.progress)
    .filter((item) => item.nextReviewAt && item.nextReviewAt <= input.date)
    .sort((left, right) => left.nextReviewAt!.localeCompare(right.nextReviewAt!));
  const dueDemand = due.reduce((sum) => sum + 3, 0);
  const reviewOnly = dueDemand >= input.budgetMinutes * 0.8;

  for (const progress of due) {
    if (remaining < 3) break;
    items.push(createItem(`review_${progress.conceptId}`, 'review', [progress.conceptId], [], `Retrieve ${progress.conceptId} from memory`, 3));
    remaining -= 3;
  }

  if (reviewOnly) return buildPlan(input, items, undefined, 'Review backlog uses at least 80% of the daily budget.');

  const unitById = new Map(input.units.map((unit) => [unit.id, unit]));
  const eligibleBlueprints = input.blueprints.filter((blueprint) =>
    hasSatisfiedPrerequisites(blueprint.prerequisiteConceptIds, input.progress)
    && blueprint.estimatedMinutes <= remaining
    && blueprint.requiredConceptIds.some((id) => (input.progress[id]?.learnedPercent ?? 0) < 100),
  );
  const scored = eligibleBlueprints.map((blueprint) => {
    const sequence = Math.min(...blueprint.requiredConceptIds.map((id) => input.concepts.find((c) => c.conceptId === id)?.sequenceNo ?? 999));
    const uncovered = blueprint.requiredConceptIds.filter((id) => (input.progress[id]?.learnedPercent ?? 0) < 100).length / blueprint.requiredConceptIds.length;
    const themeMatch = blueprint.supportedThemes.some((theme) => input.interests.includes(theme)) ? 1 : 0;
    const novelty = blueprint.requiredConceptIds.every((id) => !input.progress[id]) ? 1 : 0;
    return { blueprint, score: 0.45 * (1 / sequence) + 0.25 * uncovered + 0.15 * themeMatch + 0.15 * novelty };
  }).sort((left, right) => right.score - left.score || left.blueprint.id.localeCompare(right.blueprint.id));
  const anchor = scored[0]?.blueprint;

  const remedialCap = Math.min(Math.floor(input.budgetMinutes * 0.25), remaining);
  let remedialMinutes = 0;
  for (const error of [...input.errors].sort((a, b) => b.occurrences - a.occurrences)) {
    if (!anchor?.requiredConceptIds.includes(error.conceptId)) continue;
    const minutes = Math.min(3, remedialCap - remedialMinutes);
    if (minutes < 2 || minutes > remaining) break;
    items.push(createItem(`remedial_${error.conceptId}`, 'remedial', [error.conceptId], [], `Correct recurring ${error.code} error`, minutes));
    remedialMinutes += minutes;
    remaining -= minutes;
  }

  if (anchor) {
    for (const unitId of anchor.requiredUnitIds) {
      const unit = unitById.get(unitId);
      if (!unit || unit.estimatedMinutes > remaining) continue;
      items.push(createItem(`new_${unit.id}`, 'new', unit.conceptIds, [unit.id], unit.functionId, unit.estimatedMinutes));
      remaining -= unit.estimatedMinutes;
    }
    const freePlayMinutes = Math.min(4, remaining);
    if (freePlayMinutes >= 2 && anchor.requiredConceptIds.every((id) =>
      items.some((item) => item.conceptIds.includes(id)) || (input.progress[id]?.learnedPercent ?? 0) > 0)) {
      items.push(createItem(`free_play_${anchor.id}`, 'free_play', anchor.requiredConceptIds, anchor.requiredUnitIds, anchor.outcome, freePlayMinutes));
    }
  }
  return buildPlan(input, items, anchor, 'Review, remedial, complete learning units, then gated free play.');
}

function buildPlan(
  input: PlannerInput,
  items: PlanItem[],
  blueprint: DailyGoalBlueprint | undefined,
  rationale: string,
): DailyPlan {
  return {
    id: `plan_${input.learnerId}_${input.date.slice(0, 10)}`,
    learnerId: input.learnerId,
    date: input.date,
    status: 'active',
    items,
    rationale,
    blueprintId: blueprint?.id,
    outcome: blueprint?.outcome,
    freeformCompleted: false,
    stateVersion: input.stateVersion,
    generatedAt: input.date,
  };
}
