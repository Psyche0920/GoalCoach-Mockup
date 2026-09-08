import assert from 'node:assert/strict';
import test from 'node:test';
import { DAILY_GOAL_BLUEPRINTS, LEARNING_UNITS, SYSTEM_CURRICULUM_CONCEPTS } from '../data/curriculumEngine.ts';
import { ConceptProgress } from '../types.ts';
import { generateDailyPlan } from './planner.ts';

const now = '2026-09-08T10:00:00.000Z';
const baseInput = (progress: Record<string, ConceptProgress> = {}) => ({
  learnerId: 'test', date: now, budgetMinutes: 20,
  concepts: SYSTEM_CURRICULUM_CONCEPTS, units: LEARNING_UNITS, blueprints: DAILY_GOAL_BLUEPRINTS,
  progress, errors: [], interests: [], stateVersion: 1,
});

const dueProgress = (conceptId: string): ConceptProgress => ({
  learnerId: 'test', conceptId, learnedPercent: 100, masteryScore: 0.4,
  retentionAtReview: 0.8, decayLambda: 0.05, successfulSpacedRetrievals: 1,
  evidenceDays: 1, averageQuality: 0.8, status: 'almost_mastered',
  lastReviewedAt: '2026-09-01T10:00:00.000Z', nextReviewAt: '2026-09-07T10:00:00.000Z',
});

test('a 20 minute plan never exceeds its hard budget', () => {
  const plan = generateDailyPlan(baseInput());
  assert.ok(plan.items.reduce((sum, item) => sum + item.estimatedMinutes, 0) <= 20);
  assert.ok(plan.items.every((item) => item.conceptIds && item.unitIds));
});

test('review demand at 80 percent produces a review-only plan', () => {
  const ids = SYSTEM_CURRICULUM_CONCEPTS.slice(0, 6).map((concept) => concept.conceptId);
  const progress = Object.fromEntries(ids.map((id) => [id, dueProgress(id)]));
  const plan = generateDailyPlan(baseInput(progress));
  assert.ok(plan.items.length > 0);
  assert.ok(plan.items.every((item) => item.kind === 'review'));
});

test('the same curriculum stage preserves concepts across interests', () => {
  const travel = generateDailyPlan({ ...baseInput(), interests: ['travel_directions'] });
  const dining = generateDailyPlan({ ...baseInput(), interests: ['dining_food'] });
  assert.deepEqual(travel.items.flatMap((item) => item.conceptIds ?? []), dining.items.flatMap((item) => item.conceptIds ?? []));
});
