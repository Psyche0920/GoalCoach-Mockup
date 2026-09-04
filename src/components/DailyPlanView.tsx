import React, { useState } from 'react';
import { 
  CheckCircle2, 
  Clock, 
  RotateCcw, 
  AlertCircle, 
  Sparkles, 
  ArrowRight, 
  Target, 
  Edit3, 
  Calendar,
  Flame,
  Check
} from 'lucide-react';
import { DailyPlan, PlanItem, CurriculumConcept, LearningGoal } from '../types.ts';

interface DailyPlanViewProps {
  plan: DailyPlan | null;
  goal: LearningGoal | null;
  concepts: CurriculumConcept[];
  onStartStudy: (conceptId: string) => void;
  onUpdateGoal: (goal: Partial<LearningGoal>) => void;
  onRegeneratePlan: () => void;
}

export const DailyPlanView: React.FC<DailyPlanViewProps> = ({
  plan,
  goal,
  concepts,
  onStartStudy,
  onUpdateGoal,
  onRegeneratePlan,
}) => {
  const [isEditingGoal, setIsEditingGoal] = useState(false);
  const [goalTitle, setGoalTitle] = useState(goal?.title || 'Master HSK 1 Core Grammar & Vocabulary');
  const [dailyMinutes, setDailyMinutes] = useState(goal?.dailyAvailableMinutes || 20);

  const getConceptInfo = (conceptId: string) => {
    return concepts.find((c) => c.conceptId === conceptId);
  };

  const handleSaveGoal = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateGoal({
      title: goalTitle,
      dailyAvailableMinutes: dailyMinutes,
    });
    setIsEditingGoal(false);
  };

  const getItemBadge = (kind: PlanItem['kind']) => {
    switch (kind) {
      case 'review':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
            <RotateCcw className="w-3 h-3" />
            Spaced Review
          </span>
        );
      case 'remedial':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
            <AlertCircle className="w-3 h-3" />
            Targeted Remedial
          </span>
        );
      case 'new':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-sky-50 text-sky-700 border border-sky-200">
            <Sparkles className="w-3 h-3" />
            New Concept
          </span>
        );
    }
  };

  const totalMinutes = plan?.items.reduce((acc, it) => acc + it.estimatedMinutes, 0) || 0;
  const completedItems = plan?.items.filter((it) => it.completed).length || 0;
  const totalItems = plan?.items.length || 0;

  return (
    <div className="space-y-6">
      {/* Target Goal Card */}
      <div className="bg-white rounded-2xl border border-stone-200 p-6 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-xl bg-amber-50 text-amber-700 border border-amber-100">
              <Target className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-amber-700">Active Learning Goal</span>
                <span className="text-xs px-2 py-0.5 bg-stone-100 rounded text-stone-600 font-medium">HSK Level 1</span>
              </div>
              {isEditingGoal ? (
                <form onSubmit={handleSaveGoal} className="mt-2 space-y-3">
                  <div>
                    <input
                      id="input-goal-title"
                      type="text"
                      value={goalTitle}
                      onChange={(e) => setGoalTitle(e.target.value)}
                      className="w-full text-base font-semibold border border-stone-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                  </div>
                  <div className="flex items-center gap-4">
                    <label className="text-xs text-stone-600 flex items-center gap-2">
                      Daily Study Time:
                      <input
                        id="input-daily-minutes"
                        type="number"
                        min="5"
                        max="120"
                        value={dailyMinutes}
                        onChange={(e) => setDailyMinutes(Number(e.target.value))}
                        className="w-16 border border-stone-300 rounded px-2 py-1 text-xs"
                      />
                      mins/day
                    </label>
                    <button
                      type="submit"
                      className="text-xs px-3 py-1 bg-amber-600 text-white rounded font-medium hover:bg-amber-700"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsEditingGoal(false)}
                      className="text-xs px-3 py-1 bg-stone-100 text-stone-600 rounded font-medium hover:bg-stone-200"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <>
                  <h2 className="text-lg font-bold text-stone-900 mt-0.5">{goal?.title || 'Master HSK 1 Core Grammar & Vocabulary'}</h2>
                  <div className="flex items-center gap-4 mt-2 text-xs text-stone-500">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" />
                      Target: {goal?.dailyAvailableMinutes || 20} mins/day
                    </span>
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5" />
                      Goal Version {goal?.version || 1}
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>

          {!isEditingGoal && (
            <button
              id="btn-edit-goal"
              onClick={() => setIsEditingGoal(true)}
              className="self-start sm:self-center flex items-center gap-1.5 text-xs text-stone-600 hover:text-stone-900 px-3 py-1.5 rounded-lg border border-stone-200 hover:bg-stone-50 font-medium transition-colors"
            >
              <Edit3 className="w-3.5 h-3.5" />
              Adjust Goal
            </button>
          )}
        </div>
      </div>

      {/* Today's Adaptive Plan Header */}
      <div className="bg-white rounded-2xl border border-stone-200 p-6 shadow-xs space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-stone-100">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-stone-900">Today’s Generated Study Roadmap</h3>
              <span className="text-xs px-2 py-0.5 bg-amber-50 text-amber-800 border border-amber-200 rounded-full font-semibold">
                {completedItems}/{totalItems} Completed
              </span>
            </div>
            <p className="text-xs text-stone-500 mt-1 max-w-2xl">
              {plan?.rationale || 'Adaptive schedule balancing spaced review, error remediation, and next curriculum concepts.'}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-right">
              <span className="text-xs text-stone-400 block">Total Est. Time</span>
              <span className="text-sm font-bold text-stone-800">{totalMinutes} Minutes</span>
            </div>
            <button
              onClick={onRegeneratePlan}
              className="text-xs text-stone-600 hover:text-stone-900 px-3 py-1.5 border border-stone-200 rounded-xl hover:bg-stone-50 transition-colors font-medium"
            >
              Re-Plan Today
            </button>
          </div>
        </div>

        {/* Plan Items List */}
        <div className="space-y-3">
          {plan?.items.map((item, index) => {
            const concept = getConceptInfo(item.conceptId);

            return (
              <div
                key={item.id}
                id={`plan-item-${item.conceptId}`}
                className={`p-4 rounded-xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                  item.completed
                    ? 'bg-stone-50/60 border-stone-200 opacity-80'
                    : 'bg-white border-stone-200 hover:border-amber-300 hover:shadow-xs'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="mt-0.5">
                    {item.completed ? (
                      <div className="w-5 h-5 rounded-full bg-emerald-500 text-white flex items-center justify-center">
                        <Check className="w-3.5 h-3.5" />
                      </div>
                    ) : (
                      <div className="w-5 h-5 rounded-full border-2 border-stone-300 flex items-center justify-center text-[10px] font-bold text-stone-500">
                        {index + 1}
                      </div>
                    )}
                  </div>

                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {getItemBadge(item.kind)}
                      <span className="font-chinese text-sm font-bold text-stone-900">
                        {concept?.titleZh || item.conceptId}
                      </span>
                      <span className="text-xs text-stone-500">
                        ({concept?.titleEn || 'Concept'})
                      </span>
                    </div>
                    <p className="text-xs text-stone-600 font-medium">
                      {item.objective}
                    </p>
                    {concept?.communicativeGoal && (
                      <p className="text-[11px] text-stone-400">
                        Target ability: {concept.communicativeGoal}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3 self-end sm:self-center">
                  <span className="text-xs text-stone-400 flex items-center gap-1 font-medium">
                    <Clock className="w-3 h-3" />
                    {item.estimatedMinutes}m
                  </span>
                  <button
                    id={`btn-practice-${item.conceptId}`}
                    onClick={() => onStartStudy(item.conceptId)}
                    className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all shadow-xs ${
                      item.completed
                        ? 'bg-stone-100 text-stone-700 hover:bg-stone-200'
                        : 'bg-amber-600 text-white hover:bg-amber-700'
                    }`}
                  >
                    <span>{item.completed ? 'Practice Again' : 'Study & Practice'}</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
