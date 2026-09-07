import express, { Request, Response } from 'express';
import cors from 'cors';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import { HSK1_CONCEPTS, HSK1_TEACHING_CARDS, HSK1_EXERCISES, THEME_REGISTRY, GOAL_PRESETS } from './src/data/hsk1Curriculum.ts';
import { LearnerState, DailyPlan, PlanItem, ConceptMastery, ErrorRecord, AnswerSubmission, LearningGoal, CurriculumTheme } from './src/types.ts';
import { gradeAnswer } from './src/domain/grader.ts';
import { calculateRetention, isConceptReviewDue } from './src/domain/retention.ts';
import { route, computeOverallProgress } from './src/domain/orchestrator.ts';

const PORT = 3000;
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

// In-Memory store for Learner States (ephemeral or persistent per session)
const learnerStore = new Map<string, LearnerState>();

function getOrCreateLearner(learnerId: string): LearnerState {
  if (learnerStore.has(learnerId)) {
    return learnerStore.get(learnerId)!;
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
    goal: defaultGoal,
    goalChanged: false,
    mastery: initialMastery,
    errorProfile: [
      {
        code: 'ERR_BU_YOU',
        conceptId: 'hsk1_c10',
        occurrences: 2,
        lastSeenAt: new Date(Date.now() - 3600 * 1000 * 24).toISOString(),
        examples: ['我不有钱 (incorrect) -> 我没有钱 (correct)'],
      },
    ],
    activePlan: defaultPlan,
    sessions: [],
    updatedAt: new Date().toISOString(),
  };

  learnerStore.set(learnerId, newState);
  return newState;
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
  const overallProg = computeOverallProgress(state);
  res.json({ state, nextAction, overallProgress: overallProg });
});

app.post('/api/v1/learners/:learner_id/goal', (req: Request, res: Response) => {
  const learnerId = req.params.learner_id;
  const state = getOrCreateLearner(learnerId);
  const { title, dailyAvailableMinutes, targetHskLevel, interests, targetDomain } = req.body;

  state.goal = {
    id: `goal-${Date.now()}`,
    title: title || state.goal?.title || 'Master HSK 1',
    targetHskLevel: targetHskLevel || 1,
    dailyAvailableMinutes: dailyAvailableMinutes || 20,
    interests: interests !== undefined ? interests : state.goal?.interests,
    targetDomain: targetDomain || state.goal?.targetDomain || 'general',
    version: (state.goal?.version || 0) + 1,
    createdAt: new Date().toISOString(),
  };
  state.goalChanged = true;
  state.updatedAt = new Date().toISOString();

  res.json({ state, nextAction: route(state) });
});

// 4. Regenerate daily plan deterministically based on priority rules & learner goals/interests
app.post('/api/v1/learners/:learner_id/plan', (req: Request, res: Response) => {
  const learnerId = req.params.learner_id;
  const state = getOrCreateLearner(learnerId);

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
  // Strict Pedagogical Priority Mandate:
  // MUST (Core Grammar) + Priority Themes (matching user targetDomain & interests) > General Knowledge > Other Themes
  const userInterests: CurriculumTheme[] = state.goal?.interests || [];
  const targetDomain = state.goal?.targetDomain || 'general';

  const getPriorityWeight = (concept: typeof HSK1_CONCEPTS[0]): number => {
    let weight = 0;
    const isPriorityTheme = userInterests.includes(concept.theme) || (targetDomain !== 'general' && (concept.tags.includes(targetDomain) || concept.theme === `${targetDomain}_directions` || concept.theme === `${targetDomain}_food` || concept.theme === `${targetDomain}_study`));

    if (concept.category === 'pinyin') {
      // Pinyin phonetics foundation has top priority for unmastered concepts
      weight += 1500;
    } else if (concept.isCoreGrammar || concept.category === 'grammar') {
      // Must-have foundation
      weight += 1000;
    }
    if (isPriorityTheme) {
      // User's specific scenario interest (e.g. Travel, Work, Dining)
      weight += 800;
    } else if (concept.category === 'general_knowledge') {
      // Useful everyday tools (dates, numbers, clock time, money, measure words)
      weight += 400;
    } else {
      // Other non-priority scenarios
      weight += 100;
    }
    return weight;
  };

  const candidateConcepts = [...HSK1_CONCEPTS].sort((a, b) => {
    const weightA = getPriorityWeight(a);
    const weightB = getPriorityWeight(b);

    if (weightA !== weightB) {
      return weightB - weightA; // Higher weight first
    }

    // Within same priority tier, maintain pedagogical sequence
    return a.sequenceNo - b.sequenceNo;
  });

  for (const concept of candidateConcepts) {
    if (newItems.length >= 4) break;
    const mastery = state.mastery[concept.conceptId];
    if (!mastery || mastery.masteryScore < 0.7) {
      if (!newItems.some((it) => it.conceptId === concept.conceptId)) {
        const isInterestMatch = userInterests.includes(concept.theme) || (targetDomain !== 'general' && concept.tags.includes(targetDomain));
        newItems.push({
          id: `item-${Date.now()}-${concept.conceptId}`,
          conceptId: concept.conceptId,
          kind: mastery ? 'remedial' : 'new',
          objective: `${isInterestMatch ? '🎯 ' : ''}${mastery ? 'Strengthen' : 'Learn'} ${concept.titleEn} (${concept.communicativeGoal})`,
          estimatedMinutes: concept.estimatedMinutes,
          completed: false,
        });
      }
    }
  }

  // If still empty, add next concepts
  if (newItems.length === 0) {
    newItems.push({
      id: `item-${Date.now()}-c01`,
      conceptId: 'hsk1_c01',
      kind: 'review',
      objective: 'Practice greetings and fundamentals',
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

  // Mark item completed in activePlan if applicable
  if (state.activePlan) {
    const item = state.activePlan.items.find((i) => i.conceptId === conceptId);
    if (item && gradingResult.passedGates) {
      item.completed = true;
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

  state.updatedAt = new Date().toISOString();
  const overallProg = computeOverallProgress(state);

  res.json({
    gradingResult,
    state,
    overallProgress: overallProg,
    nextAction: route(state),
  });
});

// 5b. Direct Concept Completion Endpoint (e.g. for Pinyin Lab completion or milestone check-ins)
app.post('/api/v1/learners/:learner_id/complete-concept', (req: Request, res: Response) => {
  const learnerId = req.params.learner_id || 'default-learner';
  const { concept_id, score = 0.85 } = req.body;
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

  const earnedMastery = Math.max(existingMastery.masteryScore, Number(score.toFixed(2)));
  state.mastery[conceptId] = {
    ...existingMastery,
    masteryScore: earnedMastery,
    retentionScore: 1.0,
    evidenceCount: existingMastery.evidenceCount + 1,
    intervalDays: 2.0,
    lastReviewedAt: new Date().toISOString(),
    nextReviewAt: new Date(Date.now() + 2 * 86400 * 1000).toISOString(),
  };

  // Mark in active plan if present
  if (state.activePlan) {
    const item = state.activePlan.items.find((i) => i.conceptId === conceptId);
    if (item) {
      item.completed = true;
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

  state.updatedAt = new Date().toISOString();
  const overallProg = computeOverallProgress(state);

  res.json({
    state,
    overallProgress: overallProg,
    nextAction: route(state),
  });
});

// 6. Freeform CSL Grading Endpoint with 30-Year Expert Rubric
app.post('/api/v1/grade-freeform', async (req: Request, res: Response) => {
  const { userInput, targetConceptId = 'hsk1_c20' } = req.body;
  const cleanInput = (userInput || '').trim();

  // 1. First run deterministic pedagogical syntax evaluation
  // (Prevents naive substring flaws like "茶想我喝茶")
  const { evaluateFreeformChineseAnswer } = await import('./src/utils/vectorRagMatcher.ts');
  const localEval = evaluateFreeformChineseAnswer(cleanInput, targetConceptId);

  // If local evaluation caught a severe syntax error (like inverted word order or redundancy)
  if (!localEval.isValid && (localEval.errorCategory === 'word_order_inversion' || localEval.errorCategory === 'redundant_tokens')) {
    return res.json({
      score: localEval.score,
      passed: false,
      errorCategory: localEval.errorCategory,
      feedback: localEval.detailedFeedback,
      recommendedConceptIds: localEval.recommendedConceptIds,
    });
  }

  // 2. If Gemini API is configured, augment with comprehensive LLM rubrics
  try {
    if (process.env.GEMINI_API_KEY) {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const prompt = `You are a Chief Examination Grader and 30-Year Master Teacher of Chinese as a Second Language (HSK 1 standard).
Target task: The student was asked to express "I want to drink tea" in Chinese (target: 我想喝茶).
Student answer: "${cleanInput}"

Grading Criteria:
1. RIGID WORD ORDER (SVO + Optative Auxiliary):
   - Correct order: Subject (我) + Optative (想) + Verb (喝) + Object (茶).
   - "茶想我喝茶", "喝茶我想", "茶我想喝" are FATAL WORD ORDER INVERSIONS. MUST FAIL (score <= 0.3).
   - Dropping the subject "想喝茶" is acceptable colloquial Chinese (score 0.9).
   - Missing "想" like "我喝茶" means "I drink tea", not expressing desire (score 0.6, needs note).
2. CONCISE & CONSTRUCTIVE FEEDBACK:
   - Clearly state the rule: Subject + Auxiliary (想) + Verb (喝) + Object (茶).

Output ONLY valid JSON in this exact structure:
{
  "score": number between 0 and 1,
  "passed": boolean (true only if score >= 0.75),
  "errorCategory": "none" | "word_order_inversion" | "redundant_tokens" | "missing_optative" | "other",
  "feedback": "Concise, expert explanation of the rule and correction"
}`;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          temperature: 0.1,
        },
      });

      const parsed = JSON.parse(response.text || '{}');
      return res.json({
        score: typeof parsed.score === 'number' ? parsed.score : localEval.score,
        passed: Boolean(parsed.passed),
        errorCategory: parsed.errorCategory || localEval.errorCategory,
        feedback: parsed.feedback || localEval.detailedFeedback,
        recommendedConceptIds: localEval.recommendedConceptIds,
      });
    }
  } catch (err) {
    console.warn('Gemini grading fallback triggered:', err);
  }

  // Return rigorous deterministic result
  return res.json({
    score: localEval.score,
    passed: localEval.isValid,
    errorCategory: localEval.errorCategory,
    feedback: localEval.detailedFeedback,
    recommendedConceptIds: localEval.recommendedConceptIds,
  });
});

// 7. AI Coach Chat endpoint (with Gemini & intelligent fallback)
app.post('/api/v1/chat', async (req: Request, res: Response) => {
  const { messages, context } = req.body;
  const userMessage = messages?.[messages.length - 1]?.content || '';

  try {
    if (process.env.GEMINI_API_KEY) {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
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
