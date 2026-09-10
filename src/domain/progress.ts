import { ConceptProgress, LearningEvent, ProgressSummary } from '../types.ts';
import { calculateRetention } from './retention.ts';

export const normalizeUnitScore = (value: number): number => {
  if (!Number.isFinite(value) || value <= 0) return 0;
  const normalized = value > 1 ? value / 100 : value;
  return Math.max(0, Math.min(1, normalized));
};

export const currentMasteryScore = (progress: ConceptProgress, at: string): number => {
  const retention = progress.lastReviewedAt
    ? calculateRetention(normalizeUnitScore(progress.retentionAtReview), progress.lastReviewedAt, at, progress.decayLambda)
    : 0;
  return normalizeUnitScore(progress.masteryScore) * retention;
};

/** Current retained mastery shown in Curriculum and aggregated into Goal Completion. */
export const masteredProgressScore = (
  progress: ConceptProgress,
  at: string = new Date().toISOString(),
): number => currentMasteryScore(progress, at);

export const effectiveMinutes = (event: LearningEvent): number =>
  Math.min(event.activeSeconds / 60, event.estimatedMinutes) * event.engagementScore;

export const deriveStatus = (progress: ConceptProgress): ConceptProgress['status'] => {
  if (progress.learnedPercent === 0) return 'not_started';
  if (progress.learnedPercent < 100) return 'learning';
  if (progress.successfulSpacedRetrievals >= 4 && progress.evidenceDays >= 3 && progress.averageQuality >= 0.8) return 'mastered';
  return 'almost_mastered';
};

export function projectProgress(
  progress: readonly ConceptProgress[],
  weights: Readonly<Record<string, number>>,
  events: readonly LearningEvent[],
  at: string,
  stateVersion: number,
): ProgressSummary {
  const denominator = progress.reduce((sum, item) => sum + (weights[item.conceptId] ?? 1), 0) || 1;
  const courseCoverage = progress.reduce((sum, item) =>
    sum + (item.learnedPercent > 0 ? weights[item.conceptId] ?? 1 : 0), 0) / denominator;
  const learnedProgress = progress.reduce((sum, item) =>
    sum + (weights[item.conceptId] ?? 1) * Math.max(0, Math.min(100, item.learnedPercent)) / 100, 0) / denominator;
  const goalCompletion = progress.reduce((sum, item) => {
    return sum + (weights[item.conceptId] ?? 1) * currentMasteryScore(item, at);
  }, 0) / denominator;
  const masteredProgress = progress.reduce((sum, item) =>
    sum + (weights[item.conceptId] ?? 1) * masteredProgressScore(item, at), 0) / denominator;
  return {
    stateVersion,
    courseCoverage,
    learnedProgress,
    masteredProgress,
    goalCompletion,
    dailyEffectiveMinutes: events.reduce((sum, event) => sum + effectiveMinutes(event), 0),
  };
}
