import React, { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar.tsx';
import { TopStatusBar } from './components/TopStatusBar.tsx';
import { BottomNav } from './components/BottomNav.tsx';
import { DailyPlanView } from './components/DailyPlanView.tsx';
import { CurriculumRoadmapView } from './components/CurriculumRoadmapView.tsx';
import { RetentionVisualizer } from './components/RetentionVisualizer.tsx';
import { DuolingoExerciseModal } from './components/DuolingoExerciseModal.tsx';
import { PinyinLessonModal } from './components/PinyinLessonModal.tsx';
import { ModernChatDrawer } from './components/ModernChatDrawer.tsx';
import { LearnerProfileDrawer } from './components/LearnerProfileDrawer.tsx';
import { LearnerState, NextAction, CurriculumConcept, GradingResult, LearningGoal } from './types.ts';
import { HSK1_CONCEPTS } from './data/hsk1Curriculum.ts';

export function App() {
  const [learnerId] = useState('learner_001');
  const [learnerState, setLearnerState] = useState<LearnerState | null>(null);
  const [overallProgress, setOverallProgress] = useState(0.0);
  const [nextAction, setNextAction] = useState<NextAction>('teach');
  const [concepts, setConcepts] = useState<CurriculumConcept[]>(HSK1_CONCEPTS);
  const [activeTab, setActiveTab] = useState<'plan' | 'curriculum' | 'retention'>('plan');

  const [selectedStudyConceptId, setSelectedStudyConceptId] = useState<string | null>(null);
  const [selectedPinyinConceptId, setSelectedPinyinConceptId] = useState<string | null>(null);
  const [studyMode, setStudyMode] = useState<'review' | 'new' | 'remedial' | 'daily_quiz'>('new');
  const [todayMistakes, setTodayMistakes] = useState<string[]>([]);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isProfileDrawerOpen, setIsProfileDrawerOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  // Fetch initial learner state and curriculum
  useEffect(() => {
    async function init() {
      try {
        const res = await fetch(`/api/v1/learners/${learnerId}`);
        if (res.ok) {
          const data = await res.json();
          setLearnerState(data.state);
          setNextAction(data.nextAction);
          setOverallProgress(data.overallProgress);
        }

        const conceptsRes = await fetch('/api/v1/curriculum/concepts');
        if (conceptsRes.ok) {
          const data = await conceptsRes.json();
          if (Array.isArray(data) && data.length > 0) {
            setConcepts(data);
          }
        }
      } catch (err) {
        console.error('Failed to initialize learner state:', err);
      } finally {
        setLoading(false);
      }
    }
    init();
  }, [learnerId]);

  // Handle plan regeneration
  const handleRegeneratePlan = async () => {
    try {
      const res = await fetch(`/api/v1/learners/${learnerId}/plan`, {
        method: 'POST',
      });
      if (res.ok) {
        const data = await res.json();
        setLearnerState(data.state);
        setNextAction(data.nextAction);
      }
    } catch (err) {
      console.error('Failed to regenerate plan:', err);
    }
  };

  // Handle goal update
  const handleUpdateGoal = async (updatedGoal: Partial<LearningGoal>) => {
    try {
      const res = await fetch(`/api/v1/learners/${learnerId}/goal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedGoal),
      });
      if (res.ok) {
        const data = await res.json();
        setLearnerState(data.state);
        setNextAction(data.nextAction);
        // Immediately regenerate plan to adapt to new target domain / interests
        const planRes = await fetch(`/api/v1/learners/${learnerId}/plan`, { method: 'POST' });
        if (planRes.ok) {
          const planData = await planRes.json();
          setLearnerState(planData.state);
          setNextAction(planData.nextAction);
        }
      }
    } catch (err) {
      console.error('Failed to update goal:', err);
    }
  };

  // Handle submitting answer to structured rubric grader
  const handleSubmitAnswer = async (exerciseId: string, answer: string): Promise<GradingResult | null> => {
    try {
      const res = await fetch('/api/v1/answers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          learner_id: learnerId,
          exercise_id: exerciseId,
          answer,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setLearnerState(data.state);
        setOverallProgress(data.overallProgress);
        setNextAction(data.nextAction);
        return data.gradingResult;
      }
    } catch (err) {
      console.error('Failed to submit answer:', err);
    }
    return null;
  };

  // Handle completing pinyin interactive lesson with audio demonstration & practice
  const handleCompletePinyinLesson = async (conceptId: string, score: number) => {
    try {
      const res = await fetch(`/api/v1/learners/${learnerId}/complete-concept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ concept_id: conceptId, score }),
      });
      if (res.ok) {
        const data = await res.json();
        setLearnerState(data.state);
        setOverallProgress(data.overallProgress);
        setNextAction(data.nextAction);
      }
    } catch (err) {
      console.error('Failed to complete pinyin concept:', err);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center p-4 select-none">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 border-4 border-zinc-950 border-t-emerald-500 rounded-full animate-spin mx-auto" />
          <h2 className="text-lg font-black text-zinc-950 tracking-tight">Starting GoalCoach...</h2>
          <p className="text-xs text-zinc-500 font-bold">Loading HSK 1 curriculum & spaced repetition path</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-950 flex select-none">
      {/* Desktop Sidebar (Duolingo Style) */}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onOpenChat={() => setIsChatOpen(true)}
        onOpenProfile={() => setIsProfileDrawerOpen(true)}
        learnerState={learnerState}
        overallProgress={overallProgress}
        nextAction={nextAction}
      />

      {/* Main Layout Area */}
      <div className="flex-1 flex flex-col min-w-0 pb-20 lg:pb-0">
        {/* Top Status Bar (Duolingo Streak / Energy / Daily Quota) */}
        <TopStatusBar
          learnerState={learnerState}
          overallProgress={overallProgress}
          nextAction={nextAction}
          onRegeneratePlan={handleRegeneratePlan}
          onOpenChat={() => setIsChatOpen(true)}
          onOpenProfile={() => setIsProfileDrawerOpen(true)}
        />

        {/* Main Content View */}
        <main className="flex-1 max-w-4xl w-full mx-auto px-4 sm:px-8 py-6">
          {activeTab === 'plan' && (
            <DailyPlanView
              plan={learnerState?.activePlan || null}
              goal={learnerState?.goal || null}
              concepts={concepts}
              learnerState={learnerState}
              overallProgress={overallProgress}
              todayMistakes={todayMistakes}
              onStartStudy={(conceptId, mode = 'new') => {
                if (conceptId.startsWith('hsk1_p')) {
                  setSelectedPinyinConceptId(conceptId);
                } else {
                  setStudyMode(mode);
                  setSelectedStudyConceptId(conceptId);
                }
              }}
              onUpdateGoal={handleUpdateGoal}
              onRegeneratePlan={handleRegeneratePlan}
              onRecordCheckIn={(success) => {
                if (learnerState) {
                  const delta = success ? 0.04 : -0.02;
                  const newProgress = Math.max(0, Math.min(1, overallProgress + delta));
                  setOverallProgress(newProgress);
                  setLearnerState({
                    ...learnerState,
                    todayCheckedIn: true,
                  });
                }
              }}
            />
          )}

          {activeTab === 'curriculum' && (
            <CurriculumRoadmapView
              concepts={concepts}
              learnerState={learnerState}
              goal={learnerState?.goal || null}
              onStartStudy={(conceptId, isPinyin) => {
                if (isPinyin || conceptId.startsWith('hsk1_p')) {
                  setSelectedPinyinConceptId(conceptId);
                } else {
                  setStudyMode('new');
                  setSelectedStudyConceptId(conceptId);
                }
              }}
              onUpdateGoal={handleUpdateGoal}
              onOpenProfile={() => setIsProfileDrawerOpen(true)}
            />
          )}

          {activeTab === 'retention' && (
            <RetentionVisualizer
              learnerState={learnerState}
              concepts={concepts}
              onReviewConcept={(conceptId) => {
                if (conceptId.startsWith('hsk1_p')) {
                  setSelectedPinyinConceptId(conceptId);
                } else {
                  setStudyMode('review');
                  setSelectedStudyConceptId(conceptId);
                }
              }}
            />
          )}
        </main>
      </div>

      {/* Mobile Bottom Navigation */}
      <BottomNav
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onOpenChat={() => setIsChatOpen(true)}
      />

      {/* Pinyin Interactive Lab Modal with Native Fluent Audio Demonstrations & Practice */}
      {selectedPinyinConceptId && (
        <PinyinLessonModal
          conceptId={selectedPinyinConceptId}
          onClose={() => setSelectedPinyinConceptId(null)}
          onComplete={(score) => {
            handleCompletePinyinLesson(selectedPinyinConceptId, score);
          }}
          learnerState={learnerState}
          concepts={concepts}
          onUpdateLearnerState={setLearnerState}
        />
      )}

      {/* Duolingo Practice Modal */}
      {selectedStudyConceptId && (
        <DuolingoExerciseModal
          conceptId={selectedStudyConceptId}
          targetDomain={learnerState?.goal?.targetDomain || 'general'}
          mode={studyMode}
          onClose={() => setSelectedStudyConceptId(null)}
          onSubmitAnswer={handleSubmitAnswer}
          onRecordMistake={(exerciseId) => {
            setTodayMistakes((prev) => Array.from(new Set([...prev, exerciseId])));
          }}
        />
      )}

      {/* Modern Panda Coach Chat Drawer */}
      <ModernChatDrawer
        isOpen={isChatOpen}
        onClose={() => setIsChatOpen(false)}
        context={{
          currentGoal: learnerState?.goal?.title,
          activePlanItems: learnerState?.activePlan?.items?.map((i) => i.objective),
          errorCount: learnerState?.errorProfile?.length,
        }}
      />

      {/* Learner Profile Drawer (Triggered by clicking Panda Logo/Name) */}
      <LearnerProfileDrawer
        isOpen={isProfileDrawerOpen}
        onClose={() => setIsProfileDrawerOpen(false)}
        goal={learnerState?.goal || null}
        onUpdateGoal={handleUpdateGoal}
        onRegeneratePlan={handleRegeneratePlan}
      />
    </div>
  );
}

export default App;
