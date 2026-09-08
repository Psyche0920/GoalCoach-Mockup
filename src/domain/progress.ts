import { ConceptProgress, LearningEvent, ProgressSummary } from '../types.ts';
import { calculateRetention } from './retention.ts';

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
  const goalCompletion = progress.reduce((sum, item) => {
    const retention = item.lastReviewedAt
      ? calculateRetention(item.retentionAtReview, item.lastReviewedAt, at, item.decayLambda)
      : 0;
    return sum + (weights[item.conceptId] ?? 1) * item.masteryScore * retention;
  }, 0) / denominator;
  return {
    stateVersion,
    courseCoverage,
    goalCompletion,
    dailyEffectiveMinutes: events.reduce((sum, event) => sum + effectiveMinutes(event), 0),
  };
}
