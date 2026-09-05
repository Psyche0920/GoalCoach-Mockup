import React, { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar.tsx';
import { TopStatusBar } from './components/TopStatusBar.tsx';
import { BottomNav } from './components/BottomNav.tsx';
import { LearningPathView } from './components/LearningPathView.tsx';
import { MasteryDashboard } from './components/MasteryDashboard.tsx';
import { RetentionVisualizer } from './components/RetentionVisualizer.tsx';
import { DuolingoExerciseModal } from './components/DuolingoExerciseModal.tsx';
import { ModernChatDrawer } from './components/ModernChatDrawer.tsx';
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
  const [isChatOpen, setIsChatOpen] = useState(false);
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
        />

        {/* Main Content View */}
        <main className="flex-1 max-w-4xl w-full mx-auto px-4 sm:px-8 py-6">
          {activeTab === 'plan' && (
            <LearningPathView
              concepts={concepts}
              plan={learnerState?.activePlan || null}
              goal={learnerState?.goal || null}
              learnerState={learnerState}
              onStartStudy={(conceptId) => setSelectedStudyConceptId(conceptId)}
              onUpdateGoal={handleUpdateGoal}
            />
          )}

          {activeTab === 'curriculum' && (
            <MasteryDashboard
              concepts={concepts}
              learnerState={learnerState}
              onSelectConcept={(conceptId) => setSelectedStudyConceptId(conceptId)}
            />
          )}

          {activeTab === 'retention' && (
            <RetentionVisualizer
              learnerState={learnerState}
              concepts={concepts}
              onReviewConcept={(conceptId) => setSelectedStudyConceptId(conceptId)}
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

      {/* Duolingo Practice Modal */}
      {selectedStudyConceptId && (
        <DuolingoExerciseModal
          conceptId={selectedStudyConceptId}
          targetDomain={learnerState?.goal?.targetDomain || 'general'}
          onClose={() => setSelectedStudyConceptId(null)}
          onSubmitAnswer={handleSubmitAnswer}
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
    </div>
  );
}

export default App;
