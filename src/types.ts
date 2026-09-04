export type Score = number; // 0.0 to 1.0

export type PlanItemKind = 'review' | 'remedial' | 'new';
export type PlanStatus = 'active' | 'exhausted' | 'invalid';
export type NextAction = 'plan_goal' | 'plan_review' | 'regenerate_plan' | 'teach';

export interface LearningGoal {
  id: string;
  title: string;
  targetHskLevel: number; // 1 to 6
  targetDate?: string;
  dailyAvailableMinutes: number;
  version: number;
  createdAt: string;
}

export interface ConceptMastery {
  conceptId: string;
  masteryScore: Score;
  retentionScore: Score;
  decayLambda: number;
  evidenceCount: number;
  intervalDays: number;
  lastReviewedAt: string;
  nextReviewAt?: string;
  weight: number;
}

export interface ErrorRecord {
  code: string;
  conceptId: string;
  occurrences: number;
  lastSeenAt: string;
  examples: string[];
}

export interface PlanItem {
  id: string;
  conceptId: string;
  kind: PlanItemKind;
  objective: string;
  estimatedMinutes: number;
  completed: boolean;
}

export interface DailyPlan {
  id: string;
  learnerId: string;
  date: string;
  status: PlanStatus;
  items: PlanItem[];
  rationale: string;
  generatedAt: string;
}

export type ExerciseType = 
  | 'meaning_mcq'
  | 'zh_to_en_mcq'
  | 'en_to_zh_mcq'
  | 'fill_blank'
  | 'reorder'
  | 'translate_to_zh'
  | 'dialogue_choice';

export interface Exercise {
  id: string;
  conceptId: string;
  exerciseOrder: number;
  exerciseType: ExerciseType;
  prompt: string;
  promptPinyin?: string;
  instruction: string;
  answer: string; // JSON string or plain text
  options?: string[];
  acceptedAnswers: string[];
  explanation: string;
  targetTokens: string[];
  errorTags: string[];
  difficulty: number;
  points?: number;
}

export interface TeachingCard {
  id: number;
  conceptId: string;
  cardOrder: number;
  cardType: 'goal' | 'vocab' | 'grammar' | 'example' | 'tip' | 'mini_dialogue';
  promptZh?: string;
  pinyin?: string;
  meaningEn?: string;
  explanationEn?: string;
  exampleZh?: string;
  examplePinyin?: string;
  exampleEn?: string;
  payload?: Record<string, any>;
}

export interface CurriculumConcept {
  conceptId: string;
  hskLevel: number;
  sequenceNo: number;
  slug: string;
  titleZh: string;
  titleEn: string;
  conceptType: 'communication' | 'grammar' | 'vocabulary' | 'mixed';
  communicativeGoal: string;
  grammarFocus: string[];
  vocabularyFocus: string[];
  difficulty: number;
  estimatedMinutes: number;
}

export interface AnswerSubmission {
  learnerId: string;
  exerciseId: string;
  answer: string;
  submittedAt: string;
}

export interface RubricScores {
  grammaticalCorrectness: Score;
  semanticPrecision: Score;
  pragmaticAppropriateness: Score;
}

export interface GradingResult {
  exerciseId: string;
  scores: RubricScores;
  passedGates: boolean;
  confidence: Score;
  feedback: string;
  detectedErrors: string[];
  evidence?: string;
  graderVersion: string;
}

export interface SessionSummary {
  sessionId: string;
  startedAt: string;
  endedAt: string;
  conceptsCovered: string[];
  summary: string;
}

export interface LearnerState {
  learnerId: string;
  goal: LearningGoal | null;
  goalChanged: boolean;
  mastery: Record<string, ConceptMastery>;
  errorProfile: ErrorRecord[];
  activePlan: DailyPlan | null;
  sessions: SessionSummary[];
  updatedAt: string;
}
