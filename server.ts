import express, { Request, Response } from 'express';
import cors from 'cors';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import { HSK1_TEACHING_CARDS, HSK1_EXERCISES, THEME_REGISTRY, GOAL_PRESETS } from './src/data/hsk1Curriculum.ts';
import { LearnerState, DailyPlan, PlanItem, ConceptMastery, ErrorRecord, AnswerSubmission, LearningGoal, CurriculumTheme, ConceptProgress, LearningEvent, GradingResult } from './src/types.ts';
import { gradeAnswer } from './src/domain/grader.ts';
import { calculateRetention, isConceptReviewDue } from './src/domain/retention.ts';
import { route, computeOverallProgress } from './src/domain/orchestrator.ts';
import { DAILY_GOAL_BLUEPRINTS, LEARNING_UNITS, SYSTEM_CURRICULUM_CONCEPTS } from './src/data/curriculumEngine.ts';
import { CurriculumCoverageValidator } from './src/domain/curriculumValidator.ts';
import { DAILY_PLANNER_VERSION, deriveDailyPlanStatus, generateDailyPlan } from './src/domain/planner.ts';
import { SqliteLearnerRepository } from './src/infrastructure/sqliteLearnerRepository.ts';
import { deriveStatus, normalizeUnitScore, projectProgress } from './src/domain/progress.ts';
import { applyLearningEvidence, completeLearningUnit, LEARNING_COMPLETION_VERSION } from './src/domain/learningCompletion.ts';
import { gradeFreeformAssessment } from './src/domain/freeformAssessment.ts';

const HSK1_CONCEPTS = SYSTEM_CURRICULUM_CONCEPTS;
const RETENTION_MODEL_VERSION = 2;

const PORT = Number(process.env.PORT || 3000);
const app = express();

app.use(cors());
app.use(express.json());

// In-Memory Audio Cache for standard high-quality female TTS
const ttsAudioCache = new Map<string, { buffer: Buffer; contentType: string }>();

// Standard High-Quality Natural Chinese Female Voice Endpoint
app.get('/api/tts', async (req: Request, res: Response) => {
  try {
    const rawText = (req.query.text as string || '').trim();
    if (!rawText) {
      return res.status(400).json({ error: 'Text query parameter is required' });
    }

    // Strictly strip all punctuation marks and symbols (标点符号跳过不读)
    const cleanText = rawText.replace(/[\p{P}\p{S}\s]+/gu, ' ').trim();
    if (!cleanText) {
      return res.status(400).json({ error: 'No speakable text remaining after punctuation stripping' });
    }

    // Serve from cache if available
    if (ttsAudioCache.has(cleanText)) {
      const cached = ttsAudioCache.get(cleanText)!;
      res.setHeader('Content-Type', cached.contentType);
      res.setHeader('Cache-Control', 'public, max-age=86400');
      return res.send(cached.buffer);
    }

    // Fetch from Google Neural/Standard Chinese Female Broadcaster Voice
    const gUrl = `https://translate.google.com/translate_tts?ie=UTF-8&tl=zh-CN&client=tw-ob&q=${encodeURIComponent(cleanText)}`;
    const response = await fetch(gUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://translate.google.com/',
      },
    });

    if (!response.ok) {
      return res.status(response.status).json({ error: 'Upstream TTS service error' });
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const contentType = response.headers.get('content-type') || 'audio/mpeg';

    if (ttsAudioCache.size >= 1000) {
      const firstKey = ttsAudioCache.keys().next().value;
      if (firstKey) ttsAudioCache.delete(firstKey);
    }
    ttsAudioCache.set(cleanText, { buffer, contentType });

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    return res.send(buffer);
  } catch (err: any) {
    console.error('TTS endpoint error:', err);
    res.status(500).json({ error: err.message || 'TTS generation failed' });
  }
});

new CurriculumCoverageValidator().validate(HSK1_CONCEPTS, LEARNING_UNITS, DAILY_GOAL_BLUEPRINTS);
const learnerRepository = new SqliteLearnerRepository(path.resolve(process.cwd(), 'data', 'goalcoach.sqlite'));
learnerRepository.saveCurriculum(LEARNING_UNITS, DAILY_GOAL_BLUEPRINTS);

function getOrCreateLearner(learnerId: string): LearnerState {
  const persisted = learnerRepository.findState(learnerId);
  if (persisted) {
    let migrated = false;
    if (!persisted.displayName) {
      persisted.displayName = 'Ann';
      migrated = true;
    }
    if (persisted.goal && persisted.goal.targetHskLevel !== 1) {
      persisted.goal.targetHskLevel = 1;
      persisted.goal.version += 1;
      migrated = true;
    }
    if (migrated) {
      persisted.updatedAt = new Date().toISOString();
      persisted.stateVersion = (persisted.stateVersion ?? 0) + 1;
      learnerRepository.saveState(persisted);
    }
    return persisted;
  }

  // Initialize fresh learner state for HSK 1
  const defaultGoal: LearningGoal = {
    id: `goal-${Date.now()}`,
    title: 'Master HSK 1 Core Grammar & Vocabulary',
    targetHskLevel: 1,
    dailyAvailableMinutes: 20,
    version: 1,
    createdAt: new Date().toISOString(),
  };

  // Seed with initial concepts (first 2 in progress, remainder available)
  const initialMastery: Record<string, ConceptMastery> = {
    hsk1_c01: {
      conceptId: 'hsk1_c01',
      masteryScore: 0.85,
      retentionScore: 0.9,
      decayLambda: 0.05,
      evidenceCount: 3,
      intervalDays: 2.0,
      lastReviewedAt: new Date(Date.now() - 3600 * 1000 * 36).toISOString(), // 1.5 days ago
      nextReviewAt: new Date(Date.now() + 3600 * 1000 * 12).toISOString(),
      weight: 1.0,
    },
    hsk1_c02: {
      conceptId: 'hsk1_c02',
      masteryScore: 0.6,
      retentionScore: 0.8,
      decayLambda: 0.05,
      evidenceCount: 2,
      intervalDays: 1.0,
      lastReviewedAt: new Date(Date.now() - 3600 * 1000 * 48).toISOString(), // 2 days ago, review due soon
      nextReviewAt: new Date(Date.now() - 3600 * 1000 * 2).toISOString(), // Due now
      weight: 1.0,
    },
    hsk1_c03: {
      conceptId: 'hsk1_c03',
      masteryScore: 0.4,
      retentionScore: 0.7,
      decayLambda: 0.05,
      evidenceCount: 1,
      intervalDays: 1.0,
      lastReviewedAt: new Date(Date.now() - 3600 * 1000 * 20).toISOString(),
      nextReviewAt: new Date(Date.now() + 3600 * 1000 * 28).toISOString(),
      weight: 1.0,
    },
  };

  const initialItems: PlanItem[] = [
    {
      id: `item-1`,
      conceptId: 'hsk1_p01',
      kind: 'new',
      objective: 'Master Pinyin syllable anatomy & basic initials (b, p, m, f)',
      estimatedMinutes: 5,
      completed: false,
    },
    {
      id: `item-2`,
      conceptId: 'hsk1_c02',
      kind: 'review',
      objective: 'Review self-introduction (我叫… / 我是…) to reinforce memory',
      estimatedMinutes: 6,
      completed: false,
    },
    {
      id: `item-3`,
      conceptId: 'hsk1_c03',
      kind: 'remedial',
      objective: 'Practice pronoun + 是 copula sentence patterns',
      estimatedMinutes: 6,
      completed: false,
    },
  ];

  const defaultPlan: DailyPlan = {
    id: `plan-${Date.now()}`,
    learnerId,
    date: new Date().toISOString(),
    status: 'active',
    items: initialItems,
    rationale: 'Balanced plan targeting 1 due review, 1 remedial pattern, and 1 new HSK 1 grammar concept.',
    generatedAt: new Date().toISOString(),
  };

  const newState: LearnerState = {
    learnerId,
    displayName: 'Ann',
    goal: defaultGoal,
    goalChanged: false,
    mastery: {},
    errorProfile: [
      {
        code: 'ERR_BU_YOU',
        conceptId: 'hsk1_c10',
        occurrences: 2,
        lastSeenAt: new Date(Date.now() - 3600 * 1000 * 24).toISOString(),
        examples: ['我不有钱 (incorrect) -> 我没有钱 (correct)'],
      },
    ],
    activePlan: null,
    sessions: [],
    updatedAt: new Date().toISOString(),
    stateVersion: 1,
    conceptProgress: {},
  };

  learnerRepository.saveState(newState);
  return newState;
}

function getConceptProgress(state: LearnerState): Record<string, ConceptProgress> {
  const progress = state.conceptProgress ?? {};
  const needsProgressMigration = Object.values(progress).some((row) =>
    !row.learningEvidence
    || row.learningCompletionVersion !== LEARNING_COMPLETION_VERSION
    || row.retentionModelVersion !== RETENTION_MODEL_VERSION);
  const historicalEvents = needsProgressMigration ? learnerRepository.findEventsForLearner(state.learnerId) : [];
  for (const concept of HSK1_CONCEPTS) {
    const existing = progress[concept.conceptId];
    if (existing) {
      existing.masteryScore = normalizeUnitScore(existing.masteryScore);
      existing.retentionAtReview = normalizeUnitScore(existing.retentionAtReview);
      existing.averageQuality = normalizeUnitScore(existing.averageQuality);
      existing.learnedPercent = Math.max(0, Math.min(100, existing.learnedPercent));
      if (existing.retentionModelVersion !== RETENTION_MODEL_VERSION) {
        const latestValidEvidence = historicalEvents
          .filter((event) => event.conceptIds.includes(concept.conceptId))
          .filter((event) => !event.gradingResult || event.gradingResult.passedGates)
          .filter((event) => event.engagementScore >= 0.6)
          .at(-1);
        if (latestValidEvidence) {
          const evidenceQuality = latestValidEvidence.gradingResult
            ? (latestValidEvidence.gradingResult.scores.grammaticalCorrectness
              + latestValidEvidence.gradingResult.scores.semanticPrecision
              + latestValidEvidence.gradingResult.scores.pragmaticAppropriateness) / 3
            : latestValidEvidence.engagementScore;
          existing.retentionAtReview = Math.max(0.3, normalizeUnitScore(evidenceQuality));
          existing.lastReviewedAt = latestValidEvidence.createdAt;
        } else if (existing.masteryScore > 0 && existing.retentionAtReview <= 0) {
          existing.retentionAtReview = Math.max(0.3, normalizeUnitScore(existing.averageQuality));
        }
        existing.retentionModelVersion = RETENTION_MODEL_VERSION;
      }
      existing.status = deriveStatus(existing);
      if (existing.status === 'mastered') existing.masteryScore = 1;
      if (!existing.learningEvidence || existing.learningCompletionVersion !== LEARNING_COMPLETION_VERSION) {
        const conceptEvents = historicalEvents.filter((event) => event.conceptIds.includes(concept.conceptId));
        let reconstructed: ConceptProgress = { ...existing, learnedPercent: 0 };
        for (const event of conceptEvents) {
          // Older complete-unit endpoints persisted one attempt for the lesson and its practice.
          const legacyFullUnit = event.eventType === 'attempt'
            && (event.planItemId.startsWith('new_unit_') || event.planItemId.startsWith('item-spontaneous-'));
          reconstructed = {
            ...reconstructed,
            ...applyLearningEvidence(reconstructed, {
              cardCompletion: event.eventType === 'card' || event.eventType === 'audio' || legacyFullUnit ? 1 : 0,
              practiceCompletion: event.eventType === 'attempt' ? 1 : 0,
              outputCompletion: event.eventType === 'output' || legacyFullUnit ? 1 : 0,
            }),
          };
        }
        const migrated = conceptEvents.length > 0
          ? reconstructed
          : { ...existing, ...applyLearningEvidence(existing, {}) };
        migrated.status = deriveStatus(migrated);
        if (migrated.status === 'mastered') migrated.masteryScore = 1;
        progress[concept.conceptId] = migrated;
      }
      continue;
    }
    const legacy = state.mastery[concept.conceptId];
    const learnedPercent = legacy && legacy.evidenceCount > 0 ? 40 : 0;
    const row: ConceptProgress = {
      learnerId: state.learnerId,
      conceptId: concept.conceptId,
      learnedPercent,
      learningEvidence: {
        cardCompletion: 0,
        practiceCompletion: legacy && legacy.evidenceCount > 0 ? 1 : 0,
        outputCompletion: 0,
      },
      learningCompletionVersion: LEARNING_COMPLETION_VERSION,
      retentionModelVersion: RETENTION_MODEL_VERSION,
      masteryScore: normalizeUnitScore(legacy?.masteryScore ?? 0),
      retentionAtReview: normalizeUnitScore(legacy?.retentionScore ?? 0),
      decayLambda: legacy?.decayLambda ?? 0.05,
      successfulSpacedRetrievals: 0,
      evidenceDays: legacy ? 1 : 0,
      averageQuality: normalizeUnitScore(legacy?.masteryScore ?? 0),
      status: 'not_started',
      lastReviewedAt: legacy?.lastReviewedAt,
      nextReviewAt: legacy?.nextReviewAt,
    };
    row.status = deriveStatus(row);
    if (row.status === 'mastered') row.masteryScore = 1;
    progress[concept.conceptId] = row;
  }
  state.conceptProgress = progress;
  return progress;
}

function getGoalScopeProgress(state: LearnerState): Record<string, ConceptProgress> {
  const allProgress = getConceptProgress(state);
  return Object.fromEntries(HSK1_CONCEPTS.map((concept) => [
    concept.conceptId,
    allProgress[concept.conceptId],
  ]));
}

function createProjections(state: LearnerState, events: readonly LearningEvent[] = []) {
  const progress = Object.values(getGoalScopeProgress(state));
  const weights = Object.fromEntries(HSK1_CONCEPTS.map((concept) => [concept.conceptId, concept.weight ?? 1]));
  const progressSummary = projectProgress(progress, weights, events, new Date().toISOString(), state.stateVersion ?? 1);
  const curriculumTree = {
    stateVersion: state.stateVersion ?? 1,
    modules: ['module1_pinyin', 'module2_grammar', 'module3_thematic'].map((moduleId) => ({
      moduleId,
      concepts: HSK1_CONCEPTS.filter((concept) => concept.module === moduleId || concept.moduleId === moduleId).map((concept) => ({
        ...concept,
        progress: state.conceptProgress?.[concept.conceptId],
      })),
    })),
  };
  return { progressSummary, curriculumTree };
}

// 1. Health check (matches FastAPI /health)
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok' });
});

// 2. Curriculum endpoints
app.get('/api/v1/curriculum/concepts', (_req: Request, res: Response) => {
  res.json(HSK1_CONCEPTS);
});

app.get('/api/v1/curriculum/concepts/:id', (req: Request, res: Response) => {
  const concept = HSK1_CONCEPTS.find((c) => c.conceptId === req.params.id);
  if (!concept) {
    res.status(404).json({ error: 'Concept not found' });
    return;
  }
  const cards = HSK1_TEACHING_CARDS.filter((c) => c.conceptId === req.params.id);
  const exercises = HSK1_EXERCISES.filter((e) => e.conceptId === req.params.id);
  res.json({ concept, cards, exercises });
});

app.get('/api/v1/curriculum/exercises', (_req: Request, res: Response) => {
  res.json(HSK1_EXERCISES);
});

app.get('/api/v1/curriculum/themes', (_req: Request, res: Response) => {
  res.json({
    themes: THEME_REGISTRY,
    presets: GOAL_PRESETS,
  });
});

// 3. Learner state endpoints
app.get('/api/v1/learners/:learner_id', (req: Request, res: Response) => {
  const learnerId = req.params.learner_id;
  const state = getOrCreateLearner(learnerId);
  const nextAction = route(state);
  const projections = createProjections(state);
  learnerRepository.saveState(state);
  res.json({ state, nextAction, overallProgress: projections.progressSummary.goalCompletion, ...projections });
});

app.post('/api/v1/learners/:learner_id/goal', (req: Request, res: Response) => {
  const learnerId = req.params.learner_id;
  const state = getOrCreateLearner(learnerId);
  const { title, dailyAvailableMinutes, interests, targetDomain } = req.body;
  const requestedMinutes = dailyAvailableMinutes === undefined
    ? state.goal?.dailyAvailableMinutes ?? 20
    : Number(dailyAvailableMinutes);
  if (!Number.isInteger(requestedMinutes) || requestedMinutes < 5 || requestedMinutes > 120) {
    res.status(422).json({ error: 'dailyAvailableMinutes must be an integer from 5 to 120' });
    return;
  }

  state.goal = {
    id: `goal-${Date.now()}`,
    title: title || state.goal?.title || 'Master HSK 1',
    targetHskLevel: 1,
    dailyAvailableMinutes: requestedMinutes,
    interests: interests !== undefined ? interests : state.goal?.interests,
    targetDomain: targetDomain || state.goal?.targetDomain || 'general',
    version: (state.goal?.version || 0) + 1,
    createdAt: new Date().toISOString(),
  };
  state.goalChanged = true;
  state.updatedAt = new Date().toISOString();
  state.stateVersion = (state.stateVersion ?? 0) + 1;
  learnerRepository.saveState(state);

  res.json({ state, nextAction: route(state) });
});

// 4. Regenerate daily plan deterministically based on priority rules & learner goals/interests
app.post('/api/v1/learners/:learner_id/plan', (req: Request, res: Response) => {
  const learnerId = req.params.learner_id;
  const state = getOrCreateLearner(learnerId);

  const plannerNow = new Date().toISOString();
  const progress = getGoalScopeProgress(state);
  const plan = generateDailyPlan({
    learnerId,
    date: plannerNow,
    budgetMinutes: state.goal?.dailyAvailableMinutes ?? 20,
    concepts: HSK1_CONCEPTS,
    units: LEARNING_UNITS,
    blueprints: DAILY_GOAL_BLUEPRINTS,
    progress,
    errors: state.errorProfile,
    interests: state.goal?.interests ?? [],
    stateVersion: (state.stateVersion ?? 0) + 1,
  });
  state.activePlan = plan;
  state.goalChanged = false;
  state.updatedAt = plannerNow;
  state.stateVersion = plan.stateVersion ?? state.stateVersion;
  learnerRepository.saveState(state);
  res.json({ plan, state, nextAction: route(state) });
  return;

  const newItems: PlanItem[] = [];
  const now = new Date();

  // 1. Check review due items (SM-2 / Spaced repetition highest priority)
  for (const [conceptId, mastery] of Object.entries(state.mastery)) {
    if (isConceptReviewDue(mastery.nextReviewAt, now)) {
      const concept = HSK1_CONCEPTS.find((c) => c.conceptId === conceptId);
      newItems.push({
        id: `item-${Date.now()}-${conceptId}`,
        conceptId,
        kind: 'review',
        objective: `Review ${concept?.titleEn || conceptId} to reinforce retention`,
        estimatedMinutes: concept?.estimatedMinutes || 6,
        completed: false,
      });
    }
  }

  // 2. Check remedial items based on error profile
  for (const err of state.errorProfile) {
    if (newItems.length >= 4) break;
    if (!newItems.some((it) => it.conceptId === err.conceptId)) {
      const concept = HSK1_CONCEPTS.find((c) => c.conceptId === err.conceptId);
      if (concept) {
        newItems.push({
          id: `item-${Date.now()}-${err.conceptId}`,
          conceptId: err.conceptId,
          kind: 'remedial',
          objective: `Targeted remediation for recurring error: ${err.code}`,
          estimatedMinutes: concept.estimatedMinutes,
          completed: false,
        });
      }
    }
  }

  // 3. Find next unstudied or low-mastery concepts
  // Strict Pedagogical Rule: 70% Pinyin, 30% Vocabulary/Grammar for new cards in early phase.
  // Both Pinyin and Vocabulary must be scheduled if dedicated time allows >= 2 items!
  const userInterests: CurriculumTheme[] = state.goal?.interests || [];
  const targetDomain = state.goal?.targetDomain || 'general';
  const availableDailyMinutes = state.goal?.dailyAvailableMinutes || 15;

  const getPriorityWeight = (concept: typeof HSK1_CONCEPTS[0]): number => {
    let weight = 0;
    const isPriorityTheme = userInterests.includes(concept.theme) || (targetDomain !== 'general' && (concept.tags.includes(targetDomain) || concept.theme === `${targetDomain}_directions` || concept.theme === `${targetDomain}_food` || concept.theme === `${targetDomain}_study`));

    if (concept.category === 'pinyin') {
      weight += 1500;
    } else if (concept.isCoreGrammar || concept.category === 'grammar') {
      weight += 1000;
    }
    if (isPriorityTheme) {
      weight += 800;
    } else if (concept.category === 'general_knowledge') {
      weight += 400;
    } else {
      weight += 100;
    }
    return weight;
  };

  // Separate unmastered candidates into Pinyin vs Vocabulary/Grammar
  const unmasteredPinyin = HSK1_CONCEPTS.filter((c) => {
    if (c.category !== 'pinyin') return false;
    const m = state.mastery[c.conceptId];
    return !m || m.masteryScore < 0.7;
  }).sort((a, b) => a.sequenceNo - b.sequenceNo);

  const unmasteredVocabGrammar = HSK1_CONCEPTS.filter((c) => {
    if (c.category === 'pinyin') return false;
    const m = state.mastery[c.conceptId];
    return !m || m.masteryScore < 0.7;
  }).sort((a, b) => {
    const weightA = getPriorityWeight(a);
    const weightB = getPriorityWeight(b);
    return weightA !== weightB ? weightB - weightA : a.sequenceNo - b.sequenceNo;
  });

  // Calculate remaining slot capacity for new items (target 3-4 items total per routine)
  const maxTotalItems = Math.max(2, Math.min(4, Math.floor(availableDailyMinutes / 5)));
  const remainingSlots = Math.max(0, maxTotalItems - newItems.length);

  if (remainingSlots > 0) {
    if (remainingSlots === 1) {
      // If only 1 slot can fit, pick unmastered Pinyin first, then Vocab
      const pick = unmasteredPinyin[0] || unmasteredVocabGrammar[0];
      if (pick && !newItems.some((it) => it.conceptId === pick.conceptId)) {
        newItems.push({
          id: `item-${Date.now()}-${pick.conceptId}`,
          conceptId: pick.conceptId,
          kind: 'new',
          objective: `Learn ${pick.titleEn} (${pick.communicativeGoal})`,
          estimatedMinutes: pick.estimatedMinutes,
          completed: false,
        });
      }
    } else {
      // 2 or more slots available: Strict 70% Pinyin, 30% Vocabulary rule
      // Guarantee both Pinyin and Vocabulary are present if both pools have candidates!
      let targetPinyinCount = Math.round(remainingSlots * 0.7);
      let targetVocabCount = remainingSlots - targetPinyinCount;

      if (unmasteredPinyin.length > 0 && targetPinyinCount === 0) targetPinyinCount = 1;
      if (unmasteredVocabGrammar.length > 0 && targetVocabCount === 0) targetVocabCount = 1;

      // Adjust if pinyin has fewer available
      if (unmasteredPinyin.length < targetPinyinCount) {
        targetVocabCount += (targetPinyinCount - unmasteredPinyin.length);
        targetPinyinCount = unmasteredPinyin.length;
      }

      // Add Pinyin items
      let addedPinyin = 0;
      for (const p of unmasteredPinyin) {
        if (addedPinyin >= targetPinyinCount) break;
        if (!newItems.some((it) => it.conceptId === p.conceptId)) {
          newItems.push({
            id: `item-${Date.now()}-${p.conceptId}`,
            conceptId: p.conceptId,
            kind: 'new',
            objective: `Pinyin Foundation: ${p.titleEn}`,
            estimatedMinutes: p.estimatedMinutes,
            completed: false,
          });
          addedPinyin++;
        }
      }

      // Add Vocabulary/Grammar items
      let addedVocab = 0;
      for (const v of unmasteredVocabGrammar) {
        if (newItems.length >= maxTotalItems) break;
        if (!newItems.some((it) => it.conceptId === v.conceptId)) {
          newItems.push({
            id: `item-${Date.now()}-${v.conceptId}`,
            conceptId: v.conceptId,
            kind: 'new',
            objective: `Vocabulary & Grammar: ${v.titleEn}`,
            estimatedMinutes: v.estimatedMinutes,
            completed: false,
          });
          addedVocab++;
        }
      }
    }
  }

  // Fallback if still empty
  if (newItems.length === 0) {
    newItems.push({
      id: `item-${Date.now()}-c01`,
      conceptId: 'hsk1_c01',
      kind: 'review',
      objective: 'Practice greetings and core fundamentals',
      estimatedMinutes: 5,
      completed: false,
    });
  }

  const focusLabel = targetDomain !== 'general' ? ` [Focus: ${targetDomain.toUpperCase()}]` : '';
  state.activePlan = {
    id: `plan-${Date.now()}`,
    learnerId,
    date: now.toISOString(),
    status: 'active',
    items: newItems,
    rationale: `Adaptive schedule${focusLabel} generated with ${newItems.filter((i) => i.kind === 'review').length} due reviews, ${newItems.filter((i) => i.kind === 'remedial').length} remedial targets, and ${newItems.filter((i) => i.kind === 'new').length} priority concepts.`,
    generatedAt: now.toISOString(),
  };
  state.goalChanged = false;
  state.updatedAt = now.toISOString();
  state.stateVersion = (state.stateVersion ?? 0) + 1;
  state.activePlan.stateVersion = state.stateVersion;
  learnerRepository.saveState(state);

  res.json({ plan: state.activePlan, state, nextAction: route(state) });
});

// 5. Submit answer & Structured Grading Loop
app.post('/api/v1/answers', (req: Request, res: Response) => {
  const { learner_id, exercise_id, answer } = req.body;
  const learnerId = learner_id || 'default-learner';
  const state = getOrCreateLearner(learnerId);

  const exercise = HSK1_EXERCISES.find((e) => e.id === exercise_id);
  if (!exercise) {
    res.status(404).json({ error: 'Exercise not found' });
    return;
  }

  const gradingResult = gradeAnswer(exercise, answer);

  // Update learner mastery state deterministically
  const conceptId = exercise.conceptId;
  const existingMastery = state.mastery[conceptId] || {
    conceptId,
    masteryScore: 0.0,
    retentionScore: 1.0,
    decayLambda: 0.05,
    evidenceCount: 0,
    intervalDays: 1.0,
    lastReviewedAt: new Date().toISOString(),
    nextReviewAt: new Date(Date.now() + 86400 * 1000).toISOString(),
    weight: 1.0,
  };

  const deltaScore = gradingResult.passedGates ? 0.25 : -0.1;
  const newMasteryScore = Math.max(0.0, Math.min(1.0, existingMastery.masteryScore + deltaScore));
  const newIntervalDays = gradingResult.passedGates ? existingMastery.intervalDays * 1.8 : 1.0;
  const nextReviewTime = new Date(Date.now() + newIntervalDays * 86400 * 1000).toISOString();

  state.mastery[conceptId] = {
    ...existingMastery,
    masteryScore: Number(newMasteryScore.toFixed(2)),
    retentionScore: gradingResult.passedGates ? 1.0 : Math.max(0.3, existingMastery.retentionScore - 0.2),
    evidenceCount: existingMastery.evidenceCount + 1,
    intervalDays: Number(newIntervalDays.toFixed(1)),
    lastReviewedAt: new Date().toISOString(),
    nextReviewAt: nextReviewTime,
  };

  // Record detected errors in error profile
  for (const errCode of gradingResult.detectedErrors) {
    const existingErr = state.errorProfile.find((e) => e.code === errCode && e.conceptId === conceptId);
    if (existingErr) {
      existingErr.occurrences += 1;
      existingErr.lastSeenAt = new Date().toISOString();
      if (!existingErr.examples.includes(answer)) {
        existingErr.examples.push(answer);
      }
    } else {
      state.errorProfile.push({
        code: errCode,
        conceptId,
        occurrences: 1,
        lastSeenAt: new Date().toISOString(),
        examples: [answer],
      });
    }
  }

  const answerPlanItem = state.activePlan?.items.find((candidate) =>
    (candidate.conceptIds ?? (candidate.conceptId ? [candidate.conceptId] : [])).includes(conceptId));
  const isSpacedReview = answerPlanItem?.kind === 'review';

  // Mark item completed in activePlan if applicable, or add spontaneous curriculum learning
  if (state.activePlan) {
    const item = answerPlanItem;
    if (item) {
      if (gradingResult.passedGates) {
        item.completed = true;
      }
    } else if (gradingResult.passedGates) {
      // User spontaneously completed exercises for an extra curriculum concept
      const conceptObj = HSK1_CONCEPTS.find((c) => c.conceptId === conceptId);
      state.activePlan.items.push({
        id: `item-spontaneous-${Date.now()}-${conceptId}`,
        conceptId,
        kind: 'new',
        objective: `Extra Study: ${conceptObj?.titleEn || conceptId}`,
        estimatedMinutes: conceptObj?.estimatedMinutes || 5,
        completed: true,
      });
    }
  }

  // Record real learner session for today upon completing exercises
  if (!state.sessions) {
    state.sessions = [];
  }
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  const todaySession = state.sessions.find((s) => s.startedAt && s.startedAt.startsWith(todayStr));
  if (todaySession) {
    if (!todaySession.conceptsCovered.includes(conceptId)) {
      todaySession.conceptsCovered.push(conceptId);
    }
    const currentEnd = new Date(todaySession.endedAt).getTime();
    todaySession.endedAt = new Date(Math.max(now.getTime(), currentEnd + 3 * 60 * 1000)).toISOString();
  } else {
    state.sessions.push({
      sessionId: `sess-${Date.now()}`,
      startedAt: new Date(now.getTime() - 5 * 60 * 1000).toISOString(),
      endedAt: now.toISOString(),
      conceptsCovered: [conceptId],
      summary: `Practice session covering ${conceptId}`,
    });
  }

  const evidenceAt = new Date().toISOString();
  const progressRows = getConceptProgress(state);
  const currentProgress = progressRows[conceptId];
  const completesAtomicUnit = answerPlanItem?.kind === 'new'
    && Boolean(answerPlanItem.unitIds?.length)
    && gradingResult.passedGates;
  const learningCompletion = completesAtomicUnit
    ? completeLearningUnit(currentProgress)
    : applyLearningEvidence(currentProgress, { practiceCompletion: isSpacedReview ? 0 : 1 });
  const learnedPercent = learningCompletion.learnedPercent;
  const evidenceDays = currentProgress.lastReviewedAt?.slice(0, 10) === evidenceAt.slice(0, 10)
    ? currentProgress.evidenceDays : currentProgress.evidenceDays + 1;
  const successfulReview = isSpacedReview && gradingResult.passedGates
    && (!currentProgress.nextReviewAt || currentProgress.nextReviewAt <= evidenceAt)
    && (!currentProgress.lastReviewedAt || currentProgress.lastReviewedAt.slice(0, 10) !== evidenceAt.slice(0, 10));
  const successfulSpacedRetrievals = currentProgress.successfulSpacedRetrievals + (successfulReview ? 1 : 0);
  const quality = gradingResult.passedGates ? 1 : 0.75;
  const qualityEvidenceCount = currentProgress.qualityEvidenceCount
    ?? (currentProgress.averageQuality > 0 ? Math.max(1, currentProgress.evidenceDays) : 0);
  const refreshesRetention = isSpacedReview || completesAtomicUnit || gradingResult.passedGates;
  const updatedProgress: ConceptProgress = {
    ...currentProgress,
    ...learningCompletion,
    learnedPercent,
    masteryScore: isSpacedReview
      ? Math.min(1, currentProgress.masteryScore + (successfulReview ? 0.15 : 0))
      : Math.max(currentProgress.masteryScore, Math.min(0.35, 0.35 * (learnedPercent / 100) * quality)),
    retentionAtReview: refreshesRetention
      ? (isSpacedReview
        ? gradingResult.passedGates
          ? quality
          : Math.max(0.3, currentProgress.retentionAtReview - 0.2)
        : Math.max(currentProgress.retentionAtReview, quality))
      : currentProgress.retentionAtReview,
    retentionModelVersion: RETENTION_MODEL_VERSION,
    successfulSpacedRetrievals,
    evidenceDays,
    averageQuality: ((currentProgress.averageQuality * qualityEvidenceCount) + quality) / (qualityEvidenceCount + 1),
    qualityEvidenceCount: qualityEvidenceCount + 1,
    lastReviewedAt: refreshesRetention ? evidenceAt : currentProgress.lastReviewedAt,
    nextReviewAt: refreshesRetention
      ? new Date(Date.now() + Math.max(1, successfulSpacedRetrievals * 2) * 86_400_000).toISOString()
      : currentProgress.nextReviewAt,
  };
  updatedProgress.status = deriveStatus(updatedProgress);
  if (updatedProgress.status === 'mastered') updatedProgress.masteryScore = 1;
  progressRows[conceptId] = updatedProgress;
  state.updatedAt = evidenceAt;
  state.stateVersion = (state.stateVersion ?? 0) + 1;
  if (state.activePlan) {
    state.activePlan.stateVersion = state.stateVersion;
    state.activePlan.status = deriveDailyPlanStatus(state.activePlan);
  }
  const answerEvent: LearningEvent = {
    id: `event_answer_${Date.now()}`,
    learnerId,
    planItemId: answerPlanItem?.id ?? `practice_${conceptId}`,
    conceptIds: [conceptId],
    eventType: isSpacedReview ? 'review' : 'attempt',
    startedAt: evidenceAt,
    lastActiveAt: evidenceAt,
    activeSeconds: 60,
    estimatedMinutes: answerPlanItem?.estimatedMinutes ?? 1,
    engagementScore: gradingResult.passedGates ? 1 : 0.75,
    gradingResult,
    createdAt: evidenceAt,
  };
  learnerRepository.appendEventAndProgress(answerEvent, [updatedProgress], state);
  const answerProjections = createProjections(state, [answerEvent]);

  res.json({
    gradingResult,
    state,
    overallProgress: answerProjections.progressSummary.goalCompletion,
    nextAction: route(state),
    stateVersion: state.stateVersion,
    plan: state.activePlan,
    affectedConcepts: [updatedProgress],
    ...answerProjections,
  });
});

// 5b. Direct Concept Completion Endpoint (e.g. for Pinyin Lab completion or milestone check-ins)
app.post('/api/v1/learners/:learner_id/complete-concept', (req: Request, res: Response) => {
  const learnerId = req.params.learner_id || 'default-learner';
  const { concept_id, score = 0.85, mode = 'new' } = req.body;
  const state = getOrCreateLearner(learnerId);

  const conceptId = concept_id;
  const existingMastery = state.mastery[conceptId] || {
    conceptId,
    masteryScore: 0.0,
    retentionScore: 1.0,
    decayLambda: 0.05,
    evidenceCount: 0,
    intervalDays: 1.0,
    lastReviewedAt: new Date().toISOString(),
    nextReviewAt: new Date(Date.now() + 86400 * 1000).toISOString(),
    weight: 1.0,
  };

  const normalizedScore = Math.max(0, Math.min(1, Number(score) > 1 ? Number(score) / 100 : Number(score)));
  const passedUnit = normalizedScore >= 0.6;
  const isSpacedReview = mode === 'review';
  const earnedMastery = Math.max(normalizeUnitScore(existingMastery.masteryScore), Math.min(0.35, normalizedScore * 0.35));
  state.mastery[conceptId] = {
    ...existingMastery,
    masteryScore: earnedMastery,
    retentionScore: 1.0,
    evidenceCount: existingMastery.evidenceCount + 1,
    intervalDays: 2.0,
    lastReviewedAt: new Date().toISOString(),
    nextReviewAt: new Date(Date.now() + 2 * 86400 * 1000).toISOString(),
  };

  // Mark in active plan if present, or dynamically append as completed spontaneous learning
  if (state.activePlan) {
    const item = state.activePlan.items.find((candidate) =>
      (candidate.conceptIds ?? (candidate.conceptId ? [candidate.conceptId] : [])).includes(conceptId));
    if (item) {
      item.completed = passedUnit;
    } else if (passedUnit) {
      const conceptObj = HSK1_CONCEPTS.find((c) => c.conceptId === conceptId);
      state.activePlan.items.push({
        id: `item-spontaneous-${Date.now()}-${conceptId}`,
        conceptId,
        kind: 'new',
        objective: `Extra Study: ${conceptObj?.titleEn || conceptId}`,
        estimatedMinutes: conceptObj?.estimatedMinutes || 5,
        completed: true,
      });
    }
  }

  // Record session
  if (!state.sessions) {
    state.sessions = [];
  }
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  const todaySession = state.sessions.find((s) => s.startedAt && s.startedAt.startsWith(todayStr));
  if (todaySession) {
    if (!todaySession.conceptsCovered.includes(conceptId)) {
      todaySession.conceptsCovered.push(conceptId);
    }
  } else {
    state.sessions.push({
      sessionId: `sess-${Date.now()}`,
      startedAt: new Date(now.getTime() - 5 * 60 * 1000).toISOString(),
      endedAt: now.toISOString(),
      conceptsCovered: [conceptId],
      summary: `Completed concept study ${conceptId}`,
    });
  }

  const completedAt = new Date().toISOString();
  const progressRows = getConceptProgress(state);
  const currentProgress = progressRows[conceptId];
  const learningCompletion = !isSpacedReview && passedUnit
    ? completeLearningUnit(currentProgress)
    : applyLearningEvidence(currentProgress, isSpacedReview ? {} : {
      cardCompletion: 1,
      practiceCompletion: 1,
    });
  const successfulReview = isSpacedReview && normalizedScore >= 0.8
    && (!currentProgress.nextReviewAt || currentProgress.nextReviewAt <= completedAt)
    && (!currentProgress.lastReviewedAt || currentProgress.lastReviewedAt.slice(0, 10) !== completedAt.slice(0, 10));
  const successfulSpacedRetrievals = currentProgress.successfulSpacedRetrievals + (successfulReview ? 1 : 0);
  const qualityEvidenceCount = currentProgress.qualityEvidenceCount
    ?? (currentProgress.averageQuality > 0 ? Math.max(1, currentProgress.evidenceDays) : 0);
  const refreshesRetention = isSpacedReview || passedUnit;
  const updatedProgress: ConceptProgress = {
    ...currentProgress,
    ...learningCompletion,
    masteryScore: isSpacedReview
      ? Math.min(1, currentProgress.masteryScore + (successfulReview ? 0.15 : 0))
      : Math.max(currentProgress.masteryScore, earnedMastery),
    retentionAtReview: refreshesRetention
      ? (isSpacedReview
        ? normalizedScore >= 0.8
          ? normalizedScore
          : Math.max(0.3, currentProgress.retentionAtReview - 0.2)
        : Math.max(currentProgress.retentionAtReview, normalizedScore))
      : currentProgress.retentionAtReview,
    retentionModelVersion: RETENTION_MODEL_VERSION,
    successfulSpacedRetrievals,
    evidenceDays: currentProgress.lastReviewedAt?.slice(0, 10) === completedAt.slice(0, 10) ? currentProgress.evidenceDays : currentProgress.evidenceDays + 1,
    averageQuality: ((currentProgress.averageQuality * qualityEvidenceCount) + normalizedScore) / (qualityEvidenceCount + 1),
    qualityEvidenceCount: qualityEvidenceCount + 1,
    lastReviewedAt: refreshesRetention ? completedAt : currentProgress.lastReviewedAt,
    nextReviewAt: refreshesRetention
      ? new Date(Date.now() + Math.max(1, successfulSpacedRetrievals * 2) * 86_400_000).toISOString()
      : currentProgress.nextReviewAt,
  };
  updatedProgress.status = deriveStatus(updatedProgress);
  if (updatedProgress.status === 'mastered') updatedProgress.masteryScore = 1;
  progressRows[conceptId] = updatedProgress;
  state.updatedAt = completedAt;
  state.stateVersion = (state.stateVersion ?? 0) + 1;
  if (state.activePlan) {
    state.activePlan.stateVersion = state.stateVersion;
    state.activePlan.status = deriveDailyPlanStatus(state.activePlan);
  }
  const completedItem = state.activePlan?.items.find((candidate) => (candidate.conceptIds ?? [candidate.conceptId]).includes(conceptId));
  const completionEvent: LearningEvent = {
    id: `event_pinyin_${Date.now()}`,
    learnerId,
    planItemId: completedItem?.id ?? `pinyin_${conceptId}`,
    conceptIds: [conceptId],
    eventType: isSpacedReview ? 'review' : 'attempt',
    startedAt: completedAt,
    lastActiveAt: completedAt,
    activeSeconds: Math.round((completedItem?.estimatedMinutes ?? 1) * 60),
    estimatedMinutes: completedItem?.estimatedMinutes ?? 1,
    engagementScore: normalizedScore >= 0.75 ? 1 : 0.75,
    createdAt: completedAt,
  };
  learnerRepository.appendEventAndProgress(completionEvent, [updatedProgress], state);
  const completionProjections = createProjections(state, [completionEvent]);

  res.json({
    state,
    overallProgress: completionProjections.progressSummary.goalCompletion,
    nextAction: route(state),
    stateVersion: state.stateVersion,
    plan: state.activePlan,
    affectedConcepts: [updatedProgress],
    ...completionProjections,
  });
});

app.get('/api/v1/learners/:learnerId/today-plan', (req: Request, res: Response) => {
  const state = getOrCreateLearner(req.params.learnerId);
  const now = new Date().toISOString();
  const activeBlueprint = DAILY_GOAL_BLUEPRINTS.find((blueprint) => blueprint.id === state.activePlan?.blueprintId);
  const activePlanIsCurrent = state.activePlan?.date.slice(0, 10) === now.slice(0, 10)
    && state.activePlan.plannerVersion === DAILY_PLANNER_VERSION
    && state.activePlan.budgetMinutes === (state.goal?.dailyAvailableMinutes ?? 20)
    && !state.goalChanged
    && Boolean(activeBlueprint && activeBlueprint.planningEnabled !== false);
  if (activePlanIsCurrent) {
    res.json(state.activePlan);
    return;
  }
  const plan = generateDailyPlan({
    learnerId: state.learnerId,
    date: now,
    budgetMinutes: state.goal?.dailyAvailableMinutes ?? 20,
    concepts: HSK1_CONCEPTS,
    units: LEARNING_UNITS,
    blueprints: DAILY_GOAL_BLUEPRINTS,
    progress: getGoalScopeProgress(state),
    errors: state.errorProfile,
    interests: state.goal?.interests ?? [],
    stateVersion: state.stateVersion ?? 1,
  });
  state.activePlan = plan;
  state.updatedAt = now;
  learnerRepository.saveState(state);
  res.json(plan);
});

app.get('/api/v1/learners/:learnerId/progress-summary', (req: Request, res: Response) => {
  const state = getOrCreateLearner(req.params.learnerId);
  res.json(createProjections(state).progressSummary);
});

app.get('/api/v1/learners/:learnerId/curriculum-tree', (req: Request, res: Response) => {
  const state = getOrCreateLearner(req.params.learnerId);
  res.json(createProjections(state).curriculumTree);
});

app.post('/api/v1/learning-events', (req: Request, res: Response) => {
  const body = req.body as Partial<LearningEvent> & { learnerId?: string };
  if (!body.learnerId || !body.planItemId || !body.eventType || !Array.isArray(body.conceptIds)) {
    res.status(400).json({ error: 'learnerId, planItemId, eventType and conceptIds are required' });
    return;
  }
  const state = getOrCreateLearner(body.learnerId);
  const item = state.activePlan?.items.find((candidate) => candidate.id === body.planItemId);
  if (!item) {
    res.status(404).json({ error: 'Plan item not found' });
    return;
  }
  const declaredIds = new Set(item.conceptIds ?? (item.conceptId ? [item.conceptId] : []));
  if (body.conceptIds.some((id) => !declaredIds.has(id))) {
    res.status(422).json({ error: 'Event references concepts outside the plan item boundary' });
    return;
  }
  const allowedEngagement = new Set([0.25, 0.6, 0.75, 1]);
  if (!allowedEngagement.has(body.engagementScore ?? -1)) {
    res.status(422).json({ error: 'engagementScore must be one of 0.25, 0.60, 0.75 or 1.00' });
    return;
  }
  const now = new Date().toISOString();
  const startedAt = body.startedAt ?? now;
  const lastActiveAt = body.lastActiveAt ?? now;
  const elapsedSeconds = Math.max(0, (Date.parse(lastActiveAt) - Date.parse(startedAt)) / 1000);
  const event: LearningEvent = {
    id: body.id ?? `event_${Date.now()}`,
    learnerId: state.learnerId,
    planItemId: item.id,
    conceptIds: body.conceptIds,
    eventType: body.eventType,
    startedAt,
    lastActiveAt,
    activeSeconds: Math.min(body.activeSeconds ?? 0, elapsedSeconds, item.estimatedMinutes * 60),
    estimatedMinutes: item.estimatedMinutes,
    engagementScore: body.engagementScore!,
    gradingResult: body.gradingResult,
    createdAt: now,
  };
  const quality = body.gradingResult
    ? (body.gradingResult.scores.grammaticalCorrectness + body.gradingResult.scores.semanticPrecision + body.gradingResult.scores.pragmaticAppropriateness) / 3
    : body.engagementScore!;
  const rulesPassed = (item.completionRules ?? []).every((rule) =>
    body.conceptIds!.includes(rule.conceptId)
    && quality >= (rule.minimumQuality ?? 0)
    && (rule.evidenceType !== 'output' || event.gradingResult?.passedGates === true)
    && learnerRepository.countEventsForPlanItem(item.id, rule.evidenceType === 'output' ? 'output' : rule.evidenceType === 'retrieval' ? 'review' : undefined) + 1 >= rule.requiredCount);
  const completesNewUnit = rulesPassed && item.kind === 'new' && Boolean(item.unitIds?.length);
  const passedOutput = event.eventType === 'output' && event.gradingResult?.passedGates === true;
  const progress = getConceptProgress(state);
  const affected = body.conceptIds.map((conceptId) => {
    const current = progress[conceptId];
    const learningCompletion = applyLearningEvidence(current, {
      cardCompletion: event.eventType === 'card' || event.eventType === 'audio' ? 1 : 0,
      practiceCompletion: event.eventType === 'attempt' ? 1 : 0,
      outputCompletion: event.eventType === 'output' && event.gradingResult?.passedGates ? 1 : 0,
    });
    const learnedPercent = learningCompletion.learnedPercent;
    const successfulReview = event.eventType === 'review' && quality >= 0.8
      && (!event.gradingResult || event.gradingResult.passedGates)
      && (!current.nextReviewAt || current.nextReviewAt <= now)
      && (!current.lastReviewedAt || current.lastReviewedAt.slice(0, 10) !== now.slice(0, 10));
    const failedReview = event.eventType === 'review'
      && (quality < 0.8 || event.gradingResult?.passedGates === false);
    const refreshesRetention = successfulReview || failedReview || completesNewUnit || passedOutput;
    const evidenceDays = current.lastReviewedAt?.slice(0, 10) === now.slice(0, 10) ? current.evidenceDays : current.evidenceDays + 1;
    const evidenceCount = current.successfulSpacedRetrievals + (successfulReview ? 1 : 0);
    const qualityEvidenceCount = current.qualityEvidenceCount
      ?? (current.averageQuality > 0 ? Math.max(1, current.evidenceDays) : 0);
    const updated: ConceptProgress = {
      ...current,
      ...learningCompletion,
      learnedPercent: Math.min(100, learnedPercent),
      masteryScore: event.eventType === 'review'
        ? Math.min(1, current.masteryScore + (successfulReview ? 0.15 : 0))
        : Math.max(current.masteryScore, Math.min(0.35, 0.35 * (learnedPercent / 100) * quality)),
      retentionAtReview: successfulReview
        ? quality
        : failedReview
          ? Math.max(0.3, current.retentionAtReview - 0.2)
          : refreshesRetention
            ? Math.max(current.retentionAtReview, quality)
            : current.retentionAtReview,
      retentionModelVersion: RETENTION_MODEL_VERSION,
      successfulSpacedRetrievals: evidenceCount,
      evidenceDays,
      averageQuality: ((current.averageQuality * qualityEvidenceCount) + quality) / (qualityEvidenceCount + 1),
      qualityEvidenceCount: qualityEvidenceCount + 1,
      lastReviewedAt: refreshesRetention ? now : current.lastReviewedAt,
      nextReviewAt: refreshesRetention
        ? new Date(Date.now() + Math.max(1, evidenceCount * 2) * 86_400_000).toISOString()
        : current.nextReviewAt,
    };
    updated.status = deriveStatus(updated);
    if (updated.status === 'mastered') updated.masteryScore = 1;
    progress[conceptId] = updated;
    return updated;
  });
  for (const conceptError of event.gradingResult?.conceptErrors ?? []) {
    if (!declaredIds.has(conceptError.conceptId)) continue;
    const existingError = state.errorProfile.find((candidate) =>
      candidate.code === conceptError.code && candidate.conceptId === conceptError.conceptId);
    if (existingError) {
      existingError.occurrences += 1;
      existingError.lastSeenAt = now;
      existingError.examples = [conceptError.explanation, ...existingError.examples].slice(0, 3);
    } else {
      state.errorProfile.push({
        code: conceptError.code,
        conceptId: conceptError.conceptId,
        occurrences: 1,
        lastSeenAt: now,
        examples: [conceptError.explanation],
      });
    }
  }
  if (completesNewUnit) {
    for (const row of affected) {
      Object.assign(row, completeLearningUnit(row));
      row.masteryScore = Math.max(row.masteryScore, Math.min(0.35, 0.35 * quality));
      row.status = deriveStatus(row);
      if (row.status === 'mastered') row.masteryScore = 1;
      progress[row.conceptId] = row;
    }
  }
  if (rulesPassed) {
    item.completed = true;
    item.completionCredit = 1;
    item.completedMinutes = event.activeSeconds / 60;
  }
  if (state.activePlan) {
    state.activePlan.effectiveMinutes = Number(((state.activePlan.effectiveMinutes ?? 0)
      + Math.min(event.activeSeconds / 60, event.estimatedMinutes) * event.engagementScore).toFixed(2));
  }
  if (item.kind === 'free_play' && rulesPassed && state.activePlan) state.activePlan.freeformCompleted = true;
  if (state.activePlan && state.activePlan.items.every((candidate) => candidate.completed)) {
    state.activePlan.status = deriveDailyPlanStatus(state.activePlan);
    if (state.activePlan.status === 'completed') state.activePlan.completedAt = now;
  }
  state.stateVersion = (state.stateVersion ?? 0) + 1;
  if (state.activePlan) state.activePlan.stateVersion = state.stateVersion;
  state.updatedAt = now;
  learnerRepository.appendEventAndProgress(event, affected, state);
  const projections = createProjections(state, [event]);
  res.json({
    stateVersion: state.stateVersion,
    plan: state.activePlan,
    affectedConcepts: affected,
    progressSummary: projections.progressSummary,
    curriculumTree: projections.curriculumTree,
  });
});

app.post('/api/v1/plan-items/:planItemId/complete', (req: Request, res: Response) => {
  const learnerId = typeof req.body?.learnerId === 'string' ? req.body.learnerId : 'learner_001';
  const state = getOrCreateLearner(learnerId);
  const item = state.activePlan?.items.find((candidate) => candidate.id === req.params.planItemId);
  if (!item) {
    res.status(404).json({ error: 'Plan item not found', planItemId: req.params.planItemId });
    return;
  }
  if (!item.completed) {
    res.status(409).json({ error: 'Plan item evidence rules have not passed.', planItemId: item.id });
    return;
  }
  if (state.activePlan && state.activePlan.items.every((candidate) => candidate.completed)) {
    state.activePlan.status = deriveDailyPlanStatus(state.activePlan);
    if (state.activePlan.status === 'completed' && !state.activePlan.completedAt) state.activePlan.completedAt = new Date().toISOString();
    state.updatedAt = new Date().toISOString();
    learnerRepository.saveState(state);
  }
  const projections = createProjections(state);
  res.json({ stateVersion: state.stateVersion ?? 1, plan: state.activePlan, progressSummary: projections.progressSummary, curriculumTree: projections.curriculumTree });
});

// 6. Freeform CSL Grading Endpoint with 30-Year Expert Rubric
app.post('/api/v1/grade-freeform', async (req: Request, res: Response) => {
  const { userInput, blueprintId } = req.body;
  const cleanInput = (userInput || '').trim();

  const blueprint = DAILY_GOAL_BLUEPRINTS.find((candidate) => candidate.id === blueprintId);
  if (!blueprint) {
    res.status(404).json({ error: 'Daily goal blueprint not found' });
    return;
  }
  const specification = blueprint.freeformAssessment;
  const deterministicResult = gradeFreeformAssessment(cleanInput, specification);
  if (!cleanInput) {
    res.json(deterministicResult);
    return;
  }

  // The hosted grader evaluates valid alternatives; the deterministic grader remains the safe fallback.
  try {
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOALCOACH_LLM_API_KEY;
    if (apiKey) {
      const ai = new GoogleGenAI({ apiKey });
      const targetConcepts = specification.targetConceptIds.map((conceptId) => {
        const concept = HSK1_CONCEPTS.find((candidate) => candidate.conceptId === conceptId);
        return {
          conceptId,
          name: concept?.titleEn,
          function: concept?.communicativeGoal,
          requiredPattern: concept?.requiredOutputPattern,
          allowedVocabulary: concept?.vocabularyFocus,
        };
      });
      const prompt = `You grade an early HSK 1 learner's freeform Chinese response.
Task type: ${specification.mode}
Task: ${specification.prompt ?? blueprint.outcome}
Communication outcome: ${blueprint.outcome}
Reference example (one valid answer, not the only answer): ${specification.example}
Allowed language: ${JSON.stringify(specification.allowedLanguage)}
Curriculum targets: ${JSON.stringify(targetConcepts)}
Allowed scripts: ${specification.allowedInputScripts.join(', ')}
Student response: ${JSON.stringify(cleanInput)}

Accept multiple semantically correct answers and Hanzi, tone-mark Pinyin, or numbered-tone Pinyin. Do not require an exact string match. Grade only the declared curriculum targets. Explain the most important error in short beginner-friendly English, give a corrected example, and invite one retry. Do not introduce language above the supplied target or vocabulary.

Output only valid JSON:
{
  "scores": {
    "grammaticalCorrectness": number from 0 to 1,
    "semanticPrecision": number from 0 to 1,
    "pragmaticAppropriateness": number from 0 to 1
  },
  "confidence": number from 0 to 1,
  "feedback": "short correction, one reason, corrected example, retry invitation",
  "detectedErrors": ["stable English error code"],
  "conceptErrors": [{ "code": "stable English error code", "conceptId": "one supplied target conceptId", "explanation": "short reason" }]
}`;

      const response = await ai.models.generateContent({
        model: process.env.GOALCOACH_GRADER_MODEL || 'gemini-2.5-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          temperature: 0.1,
        },
      });

      const parsed = JSON.parse(response.text || '{}') as {
        scores?: Partial<GradingResult['scores']>;
        confidence?: number;
        feedback?: string;
        detectedErrors?: unknown[];
        conceptErrors?: Array<{ code?: unknown; conceptId?: unknown; explanation?: unknown }>;
      };
      const clampScore = (value: unknown): number => typeof value === 'number' && Number.isFinite(value)
        ? Math.max(0, Math.min(1, value)) : 0;
      const scores = {
        grammaticalCorrectness: clampScore(parsed.scores?.grammaticalCorrectness),
        semanticPrecision: clampScore(parsed.scores?.semanticPrecision),
        pragmaticAppropriateness: clampScore(parsed.scores?.pragmaticAppropriateness),
      };
      const passed = scores.semanticPrecision >= specification.completionGate.targetConceptScore
        && scores.pragmaticAppropriateness >= specification.completionGate.taskAchievementScore
        && scores.grammaticalCorrectness >= 0.6;
      const detectedErrors = (parsed.detectedErrors ?? [])
        .filter((value): value is string => typeof value === 'string')
        .map((value) => value.toUpperCase().replace(/[^A-Z0-9_]/g, '_').slice(0, 64))
        .filter(Boolean)
        .slice(0, 4);
      const feedback = typeof parsed.feedback === 'string' && parsed.feedback.trim()
        ? parsed.feedback.trim().slice(0, 500)
        : deterministicResult.feedback;
      const parsedConceptErrors = (parsed.conceptErrors ?? []).flatMap((item) => {
        if (typeof item.code !== 'string' || typeof item.conceptId !== 'string'
          || !specification.targetConceptIds.includes(item.conceptId)) return [];
        const code = item.code.toUpperCase().replace(/[^A-Z0-9_]/g, '_').slice(0, 64);
        if (!code) return [];
        return [{
          code,
          conceptId: item.conceptId,
          explanation: typeof item.explanation === 'string' ? item.explanation.slice(0, 300) : feedback,
        }];
      });
      const conceptErrors = parsedConceptErrors.length > 0 || passed
        ? parsedConceptErrors
        : specification.targetConceptIds.map((conceptId) => ({
          code: detectedErrors[0] ?? 'ERR_TARGET_STRUCTURE',
          conceptId,
          explanation: feedback,
        }));
      const gradingResult: GradingResult = {
        exerciseId: `freeform_${blueprint.id}`,
        scores,
        passedGates: passed,
        confidence: clampScore(parsed.confidence),
        feedback,
        detectedErrors,
        conceptErrors,
        evidence: `Blueprint ${blueprint.id}; concepts ${specification.targetConceptIds.join(', ')}`,
        graderVersion: `llm-rubric-v2:${process.env.GOALCOACH_GRADER_MODEL || 'gemini-2.5-flash'}`,
      };
      const score = (scores.grammaticalCorrectness + scores.semanticPrecision + scores.pragmaticAppropriateness) / 3;
      return res.json({
        score,
        passed,
        feedback,
        scores,
        detectedErrors,
        targetConceptIds: specification.targetConceptIds,
        gradingResult,
      });
    }
  } catch (error) {
    console.warn('Hosted freeform grader unavailable; deterministic fallback used.', error);
  }

  res.json(deterministicResult);
});

// 7. AI Coach Chat endpoint (with Gemini & intelligent fallback)
app.post('/api/v1/chat', async (req: Request, res: Response) => {
  const { messages, context } = req.body;
  const userMessage = messages?.[messages.length - 1]?.content || '';

  try {
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOALCOACH_LLM_API_KEY;
    if (apiKey) {
      const ai = new GoogleGenAI({ apiKey });
      const systemInstruction = `你叫宝宝 (Coach BaoBao)，是一位有30年对外汉语教学经验的“国民中文私教”。
你最核心的特质：【说真正的人话，绝不打官腔，绝不用冷冰冰的AI套话和机器人腔调】！
你就像学生身边最懂他、最风趣、最温暖的中文搭子老朋友。

【核心人设与语言风格】：
1. 真实人情味与口吻：
   - 语气自然亲切，带点幽默与生活气息，多用口语连接词（“哈喽呀！”、“哈哈这个地方太经典了”、“别急，听老师给你打个比方”、“赞！完全说到点子上了”）。
   - 严禁背诵任何数学公式（比如绝对不要提什么 R = R0 * exp(-lambda*t)）！把抽象的记忆和语法用生活大白话解释（“大脑就像个小沙漏，学完三天不碰就会漏光，咱们每天像喝杯咖啡一样轻松温习两分钟，就彻底焊死在脑子里了”）。
2. 纠错的艺术（30年老教师温情）：
   - 如果学生中文说错了（比如把“我想喝茶”说成“茶想我喝茶”，或者漏了“很”）：
     千万不要冷冰冰判错！像朋友一样打趣引导：“哈哈，听到这句我忍不住笑了，感觉热腾腾的茶长了腿在追着你想喝你呢！其实中文里我们先说‘人’，再说‘想做什么’：‘我想喝茶’。来，跟我一起念一遍：我想喝茶～”
3. 双语配合与新手友好：
   - 如果学生打英文，用中英自然夹杂的亲切语言回答，解释清晰好懂；
   - 举例子必须紧扣最基础的 HSK 1 生活场景（喝茶、咖啡、朋友、猫咪、买东西、问路），句子短促、押韵、朗朗上口。
4. 每次回复篇幅适中（1-2个温热的小段落），最后一定要抛出一个轻松有趣的小互动或提问，让学生毫无压力地回你一句！
Context: ${context ? JSON.stringify(context) : 'HSK 1 Chinese practice'}.`;

      const contents = (messages || []).map((m: any) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents,
        config: {
          systemInstruction,
          temperature: 0.75,
        },
      });

      res.json({ reply: response.text || '哈喽呀！我是你的中文学习搭子宝宝，今天咱们想聊点什么好玩的？' });
      return;
    }
  } catch (err: any) {
    console.warn('Gemini call failed, falling back to humanized coach rules:', err?.message);
  }

  // Intelligent, warm, human-like deterministic fallback
  let fallbackReply = '哈喽呀！我是你的中文私教搭子宝宝～学中文其实就跟玩拼图一样，放轻松，有我在随时罩着你！想聊点什么呀？';
  const lower = userMessage.toLowerCase();

  if (lower.includes('吗') || lower.includes('ma')) {
    fallbackReply = '哈哈，“吗”可是中文里最神奇的“一键变问句”魔法棒！✨\n你在任何一句话屁股后面加上“吗”，它立刻就变成了问句，语序一点都不用改！比如：\n• “你是学生。” (You are a student.)\n• 变！“你是学生吗？” (Are you a student?)\n怎么样，是不是比英文倒装句简单多啦？你来试着给我提个问呗？';
  } else if (lower.includes('没有') || lower.includes('不有') || lower.includes('have')) {
    fallbackReply = '哎呀，注意这里有个超级经典的“避坑指南”！⚠️\n在中文里，动词“有”是个特别傲娇的字，它【一辈子都不跟“不”谈恋爱】！所以千万别说“我不有”。\n想要表达“没有”，直接用“没”或者“没有”：\n• “我没有钱” (I don\'t have money)\n• “今天我没有课” (I don\'t have class today)\n记住了嘛～大声念两遍“没有、没有”，顺口极了！';
  } else if (lower.includes('是') || lower.includes('很') || lower.includes('shi')) {
    fallbackReply = '敲黑板啦！很多学中文的外国朋友一上来都爱说“我是好”或者“天气是好”，这其实是被英文的“is”带偏啦～\n在中文里，形容词（像好、大、漂亮、高兴）自己就能当主角！不过为了听起来更动听圆润，我们习惯用“很”来给它搭桥：\n• “天气很好” (The weather is nice)\n• “我很高兴” (I am happy)\n以后夸人或者形容东西，大胆用“很”就对了！';
  } else if (lower.includes('呢') || lower.includes('ne')) {
    fallbackReply = '哈哈，“呢”就像是打乒乓球时把球啪地一下打回给对方！🏓\n聊天时别人问了你，你想礼貌地反问回去，只要名字加个“呢”就搞定：\n• “我是老师，你呢？” (I am a teacher, what about you?)\n• “我想喝茶，他呢？” (I want tea, what about him?)\n超级地道又好用，不信你现在反问我一句试试？';
  } else if (lower.includes('拼音') || lower.includes('pinyin') || lower.includes('tone') || lower.includes('发音')) {
    fallbackReply = '拼音其实就是中文的“发音导航仪”！尤其是四个声调，就像坐过山车：\n一声平平稳稳拉长音（mā 妈），\n二声像吃惊问“啊？真的吗？”（má 麻），\n三声先低头沉下去再扬起来（mǎ 马），\n四声干脆利落地摔下来（mà 骂）！\n在课程的 Module 1 拼音专区里，我给每个音标都配了真人发音和慢速示范，点一下小喇叭，跟我一起张大嘴巴练几遍！';
  } else if (lower.includes('plan') || lower.includes('schedule') || lower.includes('review') || lower.includes('复习')) {
    fallbackReply = '人的记忆就像沙滩上的脚印，浪花一冲就淡了，这太正常啦！所以别硬背～\n我每天都会悄悄帮你看一眼你的“记忆保鲜期”。只要哪个词快要模糊了，我就把它放进你今天的温习清单里，刷两分钟立刻满血复活！这就是轻轻松松搞定中文的秘诀～';
  } else {
    fallbackReply = `你说到“${userMessage}”，让我想起我以前教过的学生也经常好奇这个！中文其实处处都是生动的小故事。\n今天在学哪个单元呀？是拼音、语法还是好玩的生活场景？告诉我，我教你个秒记的小绝招！`;
  }

  res.json({ reply: fallbackReply });
});

// Vite Middleware for Development / Static for Production
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`GoalCoach server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
