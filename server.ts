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
      conceptId: 'hsk1_c02',
      kind: 'review',
      objective: 'Review self-introduction (我叫… / 我是…) to reinforce decayed memory',
      estimatedMinutes: 6,
      completed: false,
    },
    {
      id: `item-2`,
      conceptId: 'hsk1_c03',
      kind: 'remedial',
      objective: 'Practice pronoun + 是 copula sentence patterns',
      estimatedMinutes: 6,
      completed: false,
    },
    {
      id: `item-3`,
      conceptId: 'hsk1_c04',
      kind: 'new',
      objective: 'Learn yes/no question formation using the particle 吗',
      estimatedMinutes: 7,
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

    if (concept.isCoreGrammar || concept.category === 'grammar') {
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

// 6. AI Coach Chat endpoint (with Gemini & intelligent fallback)
app.post('/api/v1/chat', async (req: Request, res: Response) => {
  const { messages, context } = req.body;
  const userMessage = messages?.[messages.length - 1]?.content || '';

  try {
    if (process.env.GEMINI_API_KEY) {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const systemInstruction = `You are GoalCoach, an adaptive AI Chinese language coach specializing in HSK 1. 
You guide learners with concise, warm, encouraging explanations of grammar, pinyin, tones, and vocabulary.
When learners make mistakes, explain the exact rule (e.g. why 吗 goes at the end, why 有 is negated with 没有, not 不有).
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
          temperature: 0.7,
        },
      });

      res.json({ reply: response.text || 'I am ready to help you learn Chinese!' });
      return;
    }
  } catch (err: any) {
    console.warn('Gemini call failed, falling back to local coach rules:', err?.message);
  }

  // Intelligent deterministic Chinese coaching fallback
  let fallbackReply = '你好！I am your GoalCoach. I am here to help you master HSK 1 Chinese.';
  const lower = userMessage.toLowerCase();

  if (lower.includes('吗') || lower.includes('ma')) {
    fallbackReply = 'In Chinese, “吗” (ma) turns any declarative statement into a yes/no question! For example:\n- 陈述句: 你是学生。(You are a student.)\n- 疑问句: 你是学生吗？(Are you a student?)';
  } else if (lower.includes('没有') || lower.includes('不有') || lower.includes('have')) {
    fallbackReply = 'Key rule: The verb “有” (yǒu - to have) is NEVER negated with “不”. You must always use “没” or “没有” (méiyǒu). For instance: “我没有钱” (I do not have money), NOT “我不有钱”.';
  } else if (lower.includes('是') || lower.includes('很') || lower.includes('shi')) {
    fallbackReply = 'When describing qualities with adjectives (like 好, 大, 高兴), Chinese uses “很” instead of “是”! Say “天气很好” (The weather is good), NOT “天气是好”.';
  } else if (lower.includes('呢') || lower.includes('ne')) {
    fallbackReply = '“呢” (ne) is a conversational particle used to bounce questions back: “我是老师。你呢？” (I am a teacher. What about you?)';
  } else if (lower.includes('plan') || lower.includes('schedule') || lower.includes('review')) {
    fallbackReply = 'GoalCoach calculates your forgetting curve using R = R_0 * exp(-lambda * delta_t). When retention drops below threshold, your daily plan automatically schedules a spaced review!';
  } else {
    fallbackReply = `Great question about “${userMessage}”. In HSK 1 Chinese, practicing in context with immediate feedback is the fastest way to build intuitive mastery. What concept would you like to practice today?`;
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
