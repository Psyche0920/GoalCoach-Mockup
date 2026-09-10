import assert from 'node:assert/strict';
import test from 'node:test';
import { ConceptProgress } from '../types.ts';
import { deriveStatus, masteredProgressScore, normalizeUnitScore, projectProgress } from './progress.ts';

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

test('initial learning exposes retained mastery before the first spaced review', () => {
  const initial: ConceptProgress = {
    ...progress,
    masteryScore: 0.35,
    retentionAtReview: 1,
    successfulSpacedRetrievals: 0,
    evidenceDays: 1,
    averageQuality: 1,
    lastReviewedAt: '2026-09-01T00:00:00.000Z',
  };
  assert.equal(masteredProgressScore(initial, '2026-09-01T00:00:00.000Z'), 0.35);
});

test('legacy percent mastery values are normalized to unit scores', () => {
  assert.equal(normalizeUnitScore(100), 1);
  assert.equal(normalizeUnitScore(85), 0.85);
  assert.equal(normalizeUnitScore(0.85), 0.85);
  assert.equal(normalizeUnitScore(250), 1);
});

test('readiness decays while course coverage remains stable', () => {
  const early = projectProgress([progress], { c1: 1 }, [], '2026-09-02T00:00:00.000Z', 1);
  const late = projectProgress([progress], { c1: 1 }, [], '2026-10-01T00:00:00.000Z', 1);
  assert.equal(early.courseCoverage, late.courseCoverage);
  assert.equal(early.learnedProgress, 1);
  assert.equal(early.learnedProgress, late.learnedProgress);
  assert.ok(late.masteredProgress < early.masteredProgress);
  assert.equal(early.masteredProgress, early.goalCompletion);
  assert.equal(late.masteredProgress, late.goalCompletion);
  assert.ok(late.goalCompletion < early.goalCompletion);
});
