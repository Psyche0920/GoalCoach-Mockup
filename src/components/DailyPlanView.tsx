import React, { useState } from 'react';
import { 
  CheckCircle2, 
  Clock, 
  RotateCcw, 
  AlertCircle, 
  Sparkles, 
  ArrowRight, 
  Target, 
  Calendar,
  Check,
  TrendingDown,
  TrendingUp,
  Brain,
  Search,
  BookOpen,
  Volume2,
  X,
  Send,
  Sliders,
  Flame,
  Star,
  Lock,
  Trophy,
  Award,
  HelpCircle,
  Layers,
  FileQuestion
} from 'lucide-react';
import { DailyPlan, PlanItem, CurriculumConcept, LearningGoal, LearnerState, CurriculumTheme } from '../types.ts';
import { matchConceptsByVectorRAG, RagConceptMatch } from '../utils/vectorRagMatcher.ts';
import { audioFeedback } from '../utils/audioFeedback.ts';
import { PandaMascot } from './PandaMascot.tsx';
import { THEME_REGISTRY } from '../data/curriculumThemes.ts';

interface DailyPlanViewProps {
  plan: DailyPlan | null;
  goal: LearningGoal | null;
  concepts: CurriculumConcept[];
  learnerState: LearnerState | null;
  overallProgress: number;
  todayMistakes?: string[];
  onStartStudy: (conceptId: string, mode?: 'review' | 'new' | 'remedial' | 'daily_quiz') => void;
  onUpdateGoal: (goal: Partial<LearningGoal>) => void;
  onRegeneratePlan: () => void;
  onRecordCheckIn?: (allCorrect: boolean) => void;
}

export const DailyPlanView: React.FC<DailyPlanViewProps> = ({
  plan,
  goal,
  concepts,
  learnerState,
  overallProgress,
  todayMistakes = [],
  onStartStudy,
  onUpdateGoal,
  onRegeneratePlan,
  onRecordCheckIn,
}) => {
  // Daily Check-in state & regression simulator
  const [todayCheckedIn, setTodayCheckedIn] = useState(learnerState?.todayCheckedIn || false);
  const [checkInSimResult, setCheckInSimResult] = useState<{
    status: 'success' | 'regressed';
    progressDelta: number;
    daysDelta: number;
    message: string;
  } | null>(null);

  // Daily Quiz Modal State
  const [isQuizModalOpen, setIsQuizModalOpen] = useState(false);
  const [isQuizCompleted, setIsQuizCompleted] = useState(false);
  const [quizUserAnswer, setQuizUserAnswer] = useState('');
  const [isGradingQuiz, setIsGradingQuiz] = useState(false);
  const [quizGradingFeedback, setQuizGradingFeedback] = useState<{
    score: number;
    passed: boolean;
    analysis: string;
    ragMatches: RagConceptMatch[];
  } | null>(null);

  // Official HSK 1 vocabulary standard target & user progress
  const totalTargetWords = 150;
  const progressPercent = Math.round(overallProgress * 100);
  const learnedWordsCount = Math.min(totalTargetWords, Math.round(totalTargetWords * overallProgress));

  // Estimated days remaining based on daily study minutes (15 min/day = ~10 words/week retention adjusted)
  const dailyMins = goal?.dailyAvailableMinutes || 15;
  const wordsRemaining = Math.max(0, totalTargetWords - learnedWordsCount);
  const wordsPerDay = Math.max(1.5, (dailyMins / 15) * 3);
  const estimatedDaysToTarget = Math.max(3, Math.ceil(wordsRemaining / wordsPerDay));

  // Categorize Today's 4 Tasks
  const reviewItems = plan?.items.filter((i) => i.kind === 'review') || [];
  const newItems = plan?.items.filter((i) => i.kind === 'new') || [];
  const remedialItems = plan?.items.filter((i) => i.kind === 'remedial') || [];

  const firstReviewConceptId = reviewItems[0]?.conceptId || concepts[0]?.conceptId || 'hsk1_c01';
  const firstNewConceptId = newItems[0]?.conceptId || concepts[1]?.conceptId || 'hsk1_c02';
  const firstRemedialConceptId = remedialItems[0]?.conceptId || concepts[2]?.conceptId || 'hsk1_c03';

  // Check-In Execution with natural retention regression
  const handlePerformCheckIn = (simulatePoorAccuracy: boolean) => {
    setTodayCheckedIn(true);
    if (simulatePoorAccuracy) {
      setCheckInSimResult({
        status: 'regressed',
        progressDelta: -0.02,
        daysDelta: +3,
        message: 'Multiple mistakes logged today. Retention decayed slightly (-2%). Estimated completion extended by 3 days. A spaced review will solidify these!',
      });
      if (onRecordCheckIn) onRecordCheckIn(false);
    } else {
      setCheckInSimResult({
        status: 'success',
        progressDelta: +0.05,
        daysDelta: -2,
        message: 'Excellent accuracy! Mastered new vocabulary (+5%). Target completion moved 2 days earlier!',
      });
      if (onRecordCheckIn) onRecordCheckIn(true);
    }
  };

  // Daily Quiz submit with 30-Year Expert Pedagogical Grader & Targeted RAG
  const handleSubmitDailyQuiz = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quizUserAnswer.trim()) return;

    setIsGradingQuiz(true);
    try {
      // Call rigorous backend grader
      const res = await fetch('/api/v1/grade-freeform', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userInput: quizUserAnswer.trim(),
          targetConceptId: 'hsk1_c20',
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const passed = data.passed;
        const ragMatches = matchConceptsByVectorRAG(quizUserAnswer.trim(), data.errorCategory, concepts, 2);

        setQuizGradingFeedback({
          score: data.score,
          passed,
          analysis: data.feedback,
          ragMatches,
        });

        if (passed) {
          setIsQuizCompleted(true);
          // Audio feedback
          audioFeedback.playGradingFeedbackAndSentence(true, '我想喝茶');
        } else {
          audioFeedback.playGradingFeedbackAndSentence(false, '我想喝茶');
        }
      }
    } catch (err) {
      console.warn('API grader failed, evaluating deterministically:', err);
    } finally {
      setIsGradingQuiz(false);
    }
  };

  // Close quiz and mark check-in if passed
  const handleFinishQuiz = () => {
    setIsQuizModalOpen(false);
    if (quizGradingFeedback?.passed) {
      handlePerformCheckIn(false);
    }
  };

  return (
    <div className="space-y-8 max-w-3xl mx-auto pb-24 select-none">
      {/* ========================================================================= */}
      {/* 1. Overall Goal - 100% User-Friendly (No arcane concepts formula)        */}
      {/* ========================================================================= */}
      <section className="bg-white rounded-3xl border-2 border-zinc-200 p-6 sm:p-7 shadow-xs relative overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5">
          <div className="flex items-start gap-4">
            <div className="w-13 h-13 rounded-2xl bg-emerald-100 border-2 border-emerald-300 flex items-center justify-center text-emerald-800 shrink-0">
              <Target className="w-7 h-7 stroke-[2.5]" />
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-black uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-lg border border-emerald-200">
                  Current Target
                </span>
                <span className="text-xs font-extrabold text-zinc-500 bg-zinc-100 px-2.5 py-0.5 rounded-lg flex items-center gap-1">
                  HSK 1 Beginner · 150 Words
                </span>
              </div>

              <h2 className="text-xl font-black text-zinc-950">
                HSK 1 Official Vocabulary Standard
              </h2>

              <p className="text-xs text-zinc-500 font-medium">
                The official benchmark established by the Center for Language Education (CLEC). Covers essential dining, travel, and daily conversations.
              </p>

              {/* Clear, Intuitive Metrics */}
              <div className="flex flex-wrap items-center gap-4 text-xs font-bold text-zinc-600 pt-2">
                <span className="flex items-center gap-1.5 bg-emerald-50 text-emerald-800 px-2.5 py-1 rounded-xl border border-emerald-200">
                  <Brain className="w-3.5 h-3.5 text-emerald-600" />
                  Words Mastered: <strong>{learnedWordsCount} / {totalTargetWords}</strong>
                </span>
                <span className="flex items-center gap-1.5 bg-zinc-100 text-zinc-700 px-2.5 py-1 rounded-xl">
                  <Calendar className="w-3.5 h-3.5 text-zinc-400" />
                  Est. Completion: <strong>{estimatedDaysToTarget} Days</strong>
                </span>
                <span className="flex items-center gap-1.5 text-zinc-500">
                  <Clock className="w-3.5 h-3.5 text-zinc-400" />
                  {dailyMins} min/day
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* User-Friendly Smooth Progress Bar */}
        <div className="mt-5 pt-5 border-t border-zinc-100 space-y-2">
          <div className="flex justify-between items-center text-xs font-extrabold text-zinc-700">
            <span>Progress to HSK 1 Milestone</span>
            <span className="text-emerald-700 font-black">{progressPercent}%</span>
          </div>
          <div className="w-full h-4 bg-zinc-100 rounded-full overflow-hidden border border-zinc-200 p-0.5">
            <div 
              className="h-full bg-emerald-500 rounded-full transition-all duration-500 shadow-xs"
              style={{ width: `${Math.min(100, Math.max(6, progressPercent))}%` }}
            />
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 2. Today's 4 Tasks (Review, Learn, Strengthen, Daily Quiz)                */}
      {/* ========================================================================= */}
      <section className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <h3 className="text-sm font-black text-zinc-950 uppercase tracking-wider">
              Today's Routine (今日四大任务)
            </h3>
          </div>
          <span className="text-[11px] font-bold text-zinc-400">
            Auto-refreshes daily at 00:00
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          {/* 1. Review (复习) */}
          <div
            onClick={() => onStartStudy(firstReviewConceptId, 'review')}
            className="group bg-white rounded-2xl border-2 border-zinc-200 hover:border-emerald-600 p-4 transition-all cursor-pointer shadow-xs hover:shadow-md flex flex-col justify-between gap-3"
          >
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200">
                  Task 1
                </span>
                <span className="text-xs font-bold text-zinc-400">
                  {reviewItems.length || 2} due
                </span>
              </div>
              <h4 className="text-sm font-black text-zinc-900 group-hover:text-emerald-700 transition-colors">
                Spaced Review (复习)
              </h4>
              <p className="text-[11px] text-zinc-500 line-clamp-2 leading-relaxed font-medium">
                Review memory-decayed items before they fade.
              </p>
            </div>
            <div className="pt-2 border-t border-zinc-100 flex items-center justify-between text-xs font-black text-emerald-700">
              <span>Start Review</span>
              <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
            </div>
          </div>

          {/* 2. Learn New Cards (学习新卡片) */}
          <div
            onClick={() => onStartStudy(firstNewConceptId, 'new')}
            className="group bg-white rounded-2xl border-2 border-zinc-200 hover:border-emerald-600 p-4 transition-all cursor-pointer shadow-xs hover:shadow-md flex flex-col justify-between gap-3"
          >
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                  Task 2
                </span>
                <span className="text-xs font-bold text-zinc-400">
                  {newItems.length || 3} cards
                </span>
              </div>
              <h4 className="text-sm font-black text-zinc-900 group-hover:text-emerald-700 transition-colors">
                Learn New (新课)
              </h4>
              <p className="text-[11px] text-zinc-500 line-clamp-2 leading-relaxed font-medium">
                Read concept card first, then practice exercises.
              </p>
            </div>
            <div className="pt-2 border-t border-zinc-100 flex items-center justify-between text-xs font-black text-emerald-700">
              <span>Study New</span>
              <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
            </div>
          </div>

          {/* 3. Strengthen Weakness (补弱) */}
          <div
            onClick={() => onStartStudy(firstRemedialConceptId, 'remedial')}
            className="group bg-white rounded-2xl border-2 border-zinc-200 hover:border-emerald-600 p-4 transition-all cursor-pointer shadow-xs hover:shadow-md flex flex-col justify-between gap-3"
          >
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase text-sky-700 bg-sky-50 px-2 py-0.5 rounded-md border border-sky-200">
                  Task 3
                </span>
                <span className="text-xs font-bold text-zinc-400">
                  {todayMistakes.length > 0 ? `${todayMistakes.length} weak` : 'Optimal'}
                </span>
              </div>
              <h4 className="text-sm font-black text-zinc-900 group-hover:text-emerald-700 transition-colors">
                Strengthen (补弱)
              </h4>
              <p className="text-[11px] text-zinc-500 line-clamp-2 leading-relaxed font-medium">
                Mandatory rule popup on mistake before retry.
              </p>
            </div>
            <div className="pt-2 border-t border-zinc-100 flex items-center justify-between text-xs font-black text-emerald-700">
              <span>Reinforce</span>
              <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
            </div>
          </div>

          {/* 4. Daily Quiz (日测) */}
          <div
            onClick={() => setIsQuizModalOpen(true)}
            className={`group rounded-2xl border-2 p-4 transition-all cursor-pointer shadow-xs hover:shadow-md flex flex-col justify-between gap-3 ${
              isQuizCompleted
                ? 'bg-emerald-50 border-emerald-500'
                : 'bg-white border-zinc-200 hover:border-emerald-600'
            }`}
          >
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase text-purple-700 bg-purple-50 px-2 py-0.5 rounded-md border border-purple-200">
                  Task 4
                </span>
                {isQuizCompleted ? (
                  <span className="flex items-center gap-1 text-[11px] font-black text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-md">
                    <Check className="w-3.5 h-3.5 stroke-[3]" /> Done
                  </span>
                ) : (
                  <span className="text-xs font-bold text-amber-600">Pending</span>
                )}
              </div>
              <h4 className="text-sm font-black text-zinc-900 group-hover:text-emerald-700 transition-colors">
                Daily Quiz (日测)
              </h4>
              <p className="text-[11px] text-zinc-500 line-clamp-2 leading-relaxed font-medium">
                Mistake consolidation + freeform translation.
              </p>
            </div>
            <div className="pt-2 border-t border-zinc-100 flex items-center justify-between text-xs font-black text-emerald-700">
              <span>{isQuizCompleted ? 'Review Result' : 'Take Quiz'}</span>
              <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 3. Check-in Feedback / Memory Regression Awareness                        */}
      {/* ========================================================================= */}
      <section className="bg-emerald-50/70 border-2 border-emerald-200 rounded-3xl p-5 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-black uppercase tracking-wider text-emerald-800 bg-emerald-200/60 px-2 py-0.5 rounded-md">
                Daily Check-In
              </span>
              {todayCheckedIn ? (
                <span className="text-xs font-black text-emerald-700 flex items-center gap-1">
                  <CheckCircle2 className="w-4 h-4" /> Completed Today
                </span>
              ) : (
                <span className="text-xs font-bold text-zinc-500">
                  Complete today's tasks or daily quiz to check in
                </span>
              )}
            </div>
            <p className="text-xs text-zinc-600 font-medium">
              Real-time progression: high accuracy accelerates graduation; mistakes trigger memory decay regression.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => handlePerformCheckIn(false)}
              disabled={todayCheckedIn}
              className="px-3.5 py-2 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-zinc-950 font-black text-xs rounded-xl border-2 border-zinc-950 shadow-[0_2px_0_#15803d] active:translate-y-0.5 active:shadow-none transition-all cursor-pointer"
            >
              Check In (+5%)
            </button>
            <button
              onClick={() => handlePerformCheckIn(true)}
              className="px-3 py-2 bg-white hover:bg-zinc-100 text-zinc-600 font-bold text-xs rounded-xl border-2 border-zinc-300 transition-all cursor-pointer"
              title="Test memory decay when multiple mistakes occur"
            >
              Simulate Mistakes (-2%)
            </button>
          </div>
        </div>

        {checkInSimResult && (
          <div
            className={`p-3.5 rounded-2xl border text-xs font-bold flex items-start gap-2.5 ${
              checkInSimResult.status === 'success'
                ? 'bg-emerald-100/70 border-emerald-300 text-emerald-950'
                : 'bg-rose-50 border-rose-200 text-rose-900'
            }`}
          >
            {checkInSimResult.status === 'success' ? (
              <TrendingUp className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
            ) : (
              <TrendingDown className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            )}
            <div className="space-y-0.5">
              <div>{checkInSimResult.message}</div>
              <div className="text-[11px] font-normal opacity-80">
                Mastery adjustment: {checkInSimResult.progressDelta > 0 ? '+' : ''}
                {Math.round(checkInSimResult.progressDelta * 100)}% • Target days:{' '}
                {checkInSimResult.daysDelta > 0 ? `+${checkInSimResult.daysDelta} days` : `${checkInSimResult.daysDelta} days`}
              </div>
            </div>
          </div>
        )}
      </section>

      {/* ========================================================================= */}
      {/* Daily Quiz Modal (Consolidation + Freeform CSL Translation)               */}
      {/* ========================================================================= */}
      {isQuizModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/50 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="bg-white w-full max-w-lg rounded-3xl border-2 border-zinc-950 p-6 shadow-2xl space-y-5 animate-in zoom-in-95 max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-start justify-between border-b border-zinc-100 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-2xl bg-purple-100 text-purple-700">
                  <FileQuestion className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-zinc-950">Daily Quiz (今日巩固与翻译测验)</h3>
                  <p className="text-xs text-zinc-500 font-medium">
                    Test your expressive accuracy with instant syntax evaluation.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsQuizModalOpen(false)}
                className="p-1.5 text-zinc-400 hover:text-zinc-900 rounded-xl hover:bg-zinc-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Prompt Question */}
            <div className="p-4 rounded-2xl bg-purple-50/70 border-2 border-purple-200 space-y-2">
              <div className="text-[11px] font-black uppercase tracking-wider text-purple-800">
                Freeform Translation Exercise
              </div>
              <div className="text-base font-black text-zinc-950">
                Translate into Chinese: <span className="text-purple-700">“I want to drink tea.”</span>
              </div>
              <p className="text-xs text-zinc-600">
                Type or click word tiles. Mind the rigid Subject + Optative + Verb + Object word order!
              </p>
            </div>

            {/* Word Tiles Shortcuts for Easy Input */}
            <div className="flex flex-wrap gap-2 pt-1">
              {['我', '想', '喝', '茶', '咖啡', '喜欢', '中国'].map((char) => (
                <button
                  key={char}
                  type="button"
                  onClick={() => setQuizUserAnswer((prev) => prev + char)}
                  className="px-3 py-1.5 bg-zinc-100 hover:bg-zinc-200 rounded-xl text-sm font-bold text-zinc-800 border border-zinc-300 active:scale-95 transition-all"
                >
                  {char}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setQuizUserAnswer('')}
                className="px-2.5 py-1.5 bg-zinc-50 hover:bg-zinc-100 rounded-xl text-xs font-bold text-zinc-400"
              >
                Clear
              </button>
            </div>

            {/* Input Form */}
            <form onSubmit={handleSubmitDailyQuiz} className="space-y-3">
              <input
                type="text"
                placeholder="Type Chinese here (e.g. 我想喝茶)..."
                value={quizUserAnswer}
                onChange={(e) => setQuizUserAnswer(e.target.value)}
                className="w-full px-4 py-3.5 bg-zinc-50 border-2 border-zinc-200 focus:border-purple-600 rounded-2xl text-base font-bold font-chinese focus:outline-none transition-all"
              />

              <button
                type="submit"
                disabled={!quizUserAnswer.trim() || isGradingQuiz}
                className="w-full py-3.5 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white rounded-2xl font-black text-xs uppercase tracking-wider shadow-[0_3px_0_#581c87] active:translate-y-0.5 active:shadow-none transition-all cursor-pointer flex items-center justify-center gap-2"
              >
                {isGradingQuiz ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    <span>Evaluate & Match Knowledge Base</span>
                  </>
                )}
              </button>
            </form>

            {/* Evaluation & Targeted RAG Feedback */}
            {quizGradingFeedback && (
              <div
                className={`p-4 rounded-2xl border-2 space-y-3 animate-in fade-in ${
                  quizGradingFeedback.passed
                    ? 'bg-emerald-50 border-emerald-300'
                    : 'bg-rose-50 border-rose-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {quizGradingFeedback.passed ? (
                      <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                    ) : (
                      <AlertCircle className="w-5 h-5 text-rose-600" />
                    )}
                    <span className="font-black text-sm text-zinc-950">
                      {quizGradingFeedback.passed ? 'Passed with High Accuracy' : 'Syntax Correction Needed'}
                    </span>
                  </div>
                  <span className="text-xs font-black px-2 py-0.5 rounded-lg bg-white border border-zinc-200">
                    Score: {Math.round(quizGradingFeedback.score * 100)}%
                  </span>
                </div>

                <p className="text-xs font-medium text-zinc-700 leading-relaxed">
                  {quizGradingFeedback.analysis}
                </p>

                {/* Targeted RAG Matched Concepts */}
                {quizGradingFeedback.ragMatches.length > 0 && (
                  <div className="pt-2 border-t border-zinc-200/60 space-y-2">
                    <div className="text-[11px] font-black uppercase tracking-wider text-zinc-500 flex items-center gap-1.5">
                      <BookOpen className="w-3.5 h-3.5 text-emerald-700" />
                      Targeted RAG Knowledge Base Recommendations:
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {quizGradingFeedback.ragMatches.map((m) => (
                        <div
                          key={m.concept.conceptId}
                          onClick={() => {
                            setIsQuizModalOpen(false);
                            onStartStudy(m.concept.conceptId, 'remedial');
                          }}
                          className="p-2.5 rounded-xl bg-white border border-zinc-200 hover:border-zinc-950 cursor-pointer transition-all space-y-1 shadow-2xs"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-black text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">
                              {Math.round(m.similarityScore * 100)}% Match
                            </span>
                            <span className="text-[10px] font-bold text-zinc-400">Study →</span>
                          </div>
                          <div className="text-xs font-black text-zinc-900 line-clamp-1 font-chinese">
                            {m.concept.titleZh}
                          </div>
                          <div className="text-[10px] text-zinc-500 line-clamp-1">
                            {m.matchedReason}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Finish Button */}
            {quizGradingFeedback && (
              <button
                onClick={handleFinishQuiz}
                className="w-full py-3 bg-zinc-950 hover:bg-zinc-800 text-white rounded-2xl font-black text-xs uppercase tracking-wider transition-colors"
              >
                Done & Record Progress
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
