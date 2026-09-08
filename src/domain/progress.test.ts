import assert from 'node:assert/strict';
import test from 'node:test';
import { ConceptProgress } from '../types.ts';
import { deriveStatus, projectProgress } from './progress.ts';

const progress: ConceptProgress = {
  learnerId: 'test', conceptId: 'c1', learnedPercent: 100, masteryScore: 0.9,
  retentionAtReview: 1, decayLambda: 0.2, successfulSpacedRetrievals: 3,
  evidenceDays: 3, averageQuality: 0.9, status: 'almost_mastered',
  lastReviewedAt: '2026-09-01T00:00:00.000Z', nextReviewAt: '2026-09-08T00:00:00.000Z',
};

test('mastery requires four spaced retrievals, three evidence days, and quality', () => {
  assert.equal(deriveStatus(progress), 'almost_mastered');
  assert.equal(deriveStatus({ ...progress, successfulSpacedRetrievals: 4 }), 'mastered');
});

test('readiness decays while course coverage remains stable', () => {
  const early = projectProgress([progress], { c1: 1 }, [], '2026-09-02T00:00:00.000Z', 1);
  const late = projectProgress([progress], { c1: 1 }, [], '2026-10-01T00:00:00.000Z', 1);
  assert.equal(early.courseCoverage, late.courseCoverage);
  assert.ok(late.goalCompletion < early.goalCompletion);
});
