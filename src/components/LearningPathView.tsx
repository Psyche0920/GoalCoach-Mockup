import React from 'react';
import { 
  Check, 
  Star, 
  RotateCcw, 
  Sparkles, 
  BookOpen, 
  Target, 
  Zap, 
  Clock, 
  Edit3,
  Calendar,
  AlertCircle,
  ArrowRight
} from 'lucide-react';
import { PandaMascot } from './PandaMascot.tsx';
import { CurriculumConcept, DailyPlan, LearningGoal, LearnerState } from '../types.ts';
import { isConceptReviewDue } from '../domain/retention.ts';

interface LearningPathViewProps {
  concepts: CurriculumConcept[];
  plan: DailyPlan | null;
  goal: LearningGoal | null;
  learnerState: LearnerState | null;
  onStartStudy: (conceptId: string) => void;
  onUpdateGoal: (goal: Partial<LearningGoal>) => void;
}

export const LearningPathView: React.FC<LearningPathViewProps> = ({
  concepts,
  plan,
  goal,
  learnerState,
  onStartStudy,
  onUpdateGoal,
}) => {
  const [isEditingGoal, setIsEditingGoal] = React.useState(false);
  const [goalTitle, setGoalTitle] = React.useState(goal?.title || 'Master HSK 1 Core Grammar & Vocabulary');
  const [dailyMinutes, setDailyMinutes] = React.useState(goal?.dailyAvailableMinutes || 20);

  const now = new Date();

  const handleSaveGoal = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateGoal({
      title: goalTitle,
      dailyAvailableMinutes: dailyMinutes,
    });
    setIsEditingGoal(false);
  };

  // Group concepts into Units (Duolingo style)
  const unit1 = concepts.slice(0, 5); // Basic Greetings & Sentences
  const unit2 = concepts.slice(5, 10); // Question words & Negation
  const unit3 = concepts.slice(10, 15); // Descriptions & Numbers
  const unit4 = concepts.slice(15, 20); // Measures, Time, Modals

  const units = [
    {
      id: 1,
      title: 'Unit 1: Fundamentals & Identity',
      desc: 'Greetings, personal pronouns, and simple 是 sentences',
      concepts: unit1,
      accentColor: 'bg-emerald-600',
    },
    {
      id: 2,
      title: 'Unit 2: Interrogatives & Possession',
      desc: 'Forming questions with 吗/什么 and mastering 有/没有',
      concepts: unit2,
      accentColor: 'bg-zinc-900',
    },
    {
      id: 3,
      title: 'Unit 3: Descriptions & Counting',
      desc: 'Adjective predicates with 很, also/all, and 0–10',
      concepts: unit3,
      accentColor: 'bg-emerald-700',
    },
    {
      id: 4,
      title: 'Unit 4: Real-world Communication',
      desc: 'Locations, time markers, and modal verbs (想/会/能)',
      concepts: unit4,
      accentColor: 'bg-zinc-950',
    },
  ];

  // Alternating offsets for serpentine path layout: 0 -> 36px -> 0 -> -36px -> 0
  const getOffsetStyle = (index: number) => {
    const pattern = [0, 36, 0, -36];
    const offset = pattern[index % pattern.length];
    return { transform: `translateX(${offset}px)` };
  };

  return (
    <div className="max-w-2xl mx-auto space-y-10 pb-16 select-none">
      {/* Top Banner Matching Mockup Screen 3: "Your Learning Plan" & "Today's Goal" */}
      <div className="bg-white rounded-3xl p-6 sm:p-7 border-2 border-slate-900 shadow-[0_5px_0_#0f172a] space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
          {/* Circular Progress & Goal Title */}
          <div className="flex items-center gap-5">
            {/* Circular Ring Gauge */}
            <div className="relative w-20 h-20 shrink-0 flex items-center justify-center">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                <path
                  className="text-slate-100"
                  strokeWidth="3.5"
                  stroke="currentColor"
                  fill="none"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
                <path
                  className="text-emerald-500 transition-all duration-700 stroke-current"
                  strokeDasharray={`${
                    plan?.items.length
                      ? Math.round(
                          (plan.items.filter((i) => i.completed).length / plan.items.length) * 100
                        )
                      : 40
                  }, 100`}
                  strokeWidth="3.5"
                  strokeLinecap="round"
                  fill="none"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
              </svg>
              <div className="absolute text-center flex flex-col items-center">
                <span className="text-base font-black text-slate-900 leading-none">
                  {plan?.items.filter((i) => i.completed).length || 0}/
                  {plan?.items.length || 5}
                </span>
                <span className="text-[9px] font-bold text-slate-500 uppercase tracking-tighter mt-0.5">
                  done
                </span>
              </div>
            </div>

            <div className="space-y-1">
              <div className="text-[11px] font-black uppercase tracking-wider text-emerald-600 flex items-center gap-1.5">
                <Target className="w-3.5 h-3.5" />
                Today's Goal
              </div>
              <h2 className="text-base sm:text-lg font-black text-slate-900 tracking-tight">
                {goal?.title || 'Master HSK 1 Core Grammar & Vocabulary'}
              </h2>
              <div className="flex items-center gap-3 text-xs font-bold text-slate-500">
                <span className="flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-emerald-600" />
                  {goal?.dailyAvailableMinutes || 20} min/day
                </span>
                <button
                  onClick={() => setIsEditingGoal(!isEditingGoal)}
                  className="text-emerald-600 hover:text-emerald-700 underline flex items-center gap-1 cursor-pointer"
                >
                  <Edit3 className="w-3 h-3" />
                  Edit
                </button>
              </div>
            </div>
          </div>

          {/* Panda Coach Bǎobao with encouragement bubble from Mockup Screen 3 */}
          <div className="flex items-center gap-3 shrink-0">
            <PandaMascot
              mood="happy"
              size={76}
              speech="Keep going! 你可以的！💪"
              showNameBadge={true}
            />
          </div>
        </div>

        {/* Goal Edit Inline Form if open */}
        {isEditingGoal && (
          <form
            onSubmit={handleSaveGoal}
            className="p-4 bg-slate-50 rounded-2xl border-2 border-slate-200 space-y-3"
          >
            <div className="text-xs font-black uppercase tracking-wider text-slate-700">
              Customize Daily Objective
            </div>
            <input
              type="text"
              value={goalTitle}
              onChange={(e) => setGoalTitle(e.target.value)}
              className="w-full bg-white border-2 border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 focus:outline-none focus:border-slate-900"
            />
            <div className="flex items-center gap-3 text-xs">
              <label className="flex items-center gap-1.5 font-bold text-slate-700">
                Minutes per day:
                <input
                  type="number"
                  value={dailyMinutes}
                  onChange={(e) => setDailyMinutes(Number(e.target.value))}
                  className="w-16 bg-white border-2 border-slate-300 rounded-lg px-2 py-1 text-xs text-slate-900 font-bold"
                />
              </label>
              <button
                type="submit"
                className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-black rounded-xl text-xs uppercase shadow-[0_2px_0_#15803d]"
              >
                Save
              </button>
              <button
                type="button"
                onClick={() => setIsEditingGoal(false)}
                className="px-3 py-1.5 text-slate-500 font-bold text-xs"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {/* Today's Tasks Action List matching Screen 3 */}
        {plan && plan.items.length > 0 && (
          <div className="space-y-2 pt-2 border-t-2 border-slate-100">
            <div className="text-xs font-black uppercase tracking-wider text-slate-400 mb-2">
              Today's Step-by-step Modules
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {plan.items.map((item) => {
                const targetConcept = concepts.find((c) => c.conceptId === item.conceptId);
                const title = targetConcept?.titleZh || item.objective;
                const isReview = item.kind === 'review';

                return (
                  <button
                    key={item.id || item.conceptId}
                    onClick={() => onStartStudy(item.conceptId)}
                    className={`p-3 rounded-2xl border-2 text-left flex items-center justify-between gap-2.5 transition-all cursor-pointer ${
                      item.completed
                        ? 'bg-emerald-50/70 border-emerald-300 text-emerald-950'
                        : 'bg-slate-50 hover:bg-white border-slate-200 hover:border-slate-900 text-slate-800 shadow-[0_2px_0_#e2e8f0]'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${
                          item.completed
                            ? 'bg-emerald-600 text-white'
                            : 'border-2 border-slate-300 bg-white'
                        }`}
                      >
                        {item.completed && <Check className="w-3 h-3 stroke-[3]" />}
                      </div>
                      <div className="truncate">
                        <div className="text-xs font-bold truncate">
                          {isReview ? 'Review: ' : 'Learn: '}
                          {title}
                        </div>
                        <div className="text-[10px] text-slate-500 font-medium">
                          {item.estimatedMinutes} mins • {item.objective}
                        </div>
                      </div>
                    </div>
                    <ArrowRight className="w-4 h-4 text-slate-400 shrink-0" />
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Units & Duolingo Stepping Stones Path */}
      <div className="space-y-12">
        {units.map((unit) => (
          <div key={unit.id} className="space-y-6">
            {/* Unit Header Header Card */}
            <div className={`${unit.accentColor} text-white rounded-2xl p-5 border-2 border-zinc-950 shadow-[0_4px_0_#18181b] flex items-center justify-between`}>
              <div>
                <span className="text-xs font-black uppercase tracking-wider text-emerald-300 opacity-90 block">
                  HSK 1 Road
                </span>
                <h3 className="text-lg font-black">{unit.title}</h3>
                <p className="text-xs text-zinc-200 font-medium mt-0.5">{unit.desc}</p>
              </div>
              <BookOpen className="w-7 h-7 opacity-75 shrink-0" />
            </div>

            {/* Stepping Stones Path */}
            <div className="flex flex-col items-center gap-6 py-4 relative">
              {unit.concepts.map((concept, idx) => {
                const mastery = learnerState?.mastery?.[concept.conceptId];
                const isMastered = mastery && mastery.masteryScore >= 0.8;
                const isReviewDue = mastery && isConceptReviewDue(mastery.nextReviewAt, now);
                const isInDailyPlan = plan?.items.some((i) => i.conceptId === concept.conceptId);
                const planItem = plan?.items.find((i) => i.conceptId === concept.conceptId);
                const isCompletedToday = planItem?.completed;

                return (
                  <div
                    key={concept.conceptId}
                    style={getOffsetStyle(idx)}
                    className="flex flex-col items-center group transition-transform"
                  >
                    {/* Stepping Stone Button */}
                    <div className="relative">
                      {/* Active Beacon / Due Review Alert */}
                      {isReviewDue && (
                        <div
                          className="absolute -top-1.5 -right-1.5 z-10 bg-amber-400 text-slate-950 p-1 rounded-full border-2 border-slate-900 shadow-xs"
                          title="Review Due"
                        >
                          <RotateCcw className="w-3 h-3 stroke-[2.5]" />
                        </div>
                      )}

                      {isInDailyPlan && !isCompletedToday && (
                        <div className="absolute -top-2 -left-2 z-10 bg-emerald-600 text-white text-[9px] font-black uppercase px-2 py-0.5 rounded-full border-2 border-slate-900 shadow-xs">
                          TODAY
                        </div>
                      )}

                      <button
                        id={`stepping-stone-${concept.conceptId}`}
                        onClick={() => onStartStudy(concept.conceptId)}
                        className={`w-20 h-20 rounded-full flex flex-col items-center justify-center border-4 transition-all cursor-pointer ${
                          isMastered
                            ? 'bg-emerald-500 hover:bg-emerald-400 border-zinc-950 text-white shadow-[0_6px_0_#15803d] active:translate-y-1 active:shadow-[0_2px_0_#15803d]'
                            : isReviewDue
                            ? 'bg-amber-400 hover:bg-amber-300 border-zinc-950 text-zinc-950 shadow-[0_6px_0_#b45309] active:translate-y-1 active:shadow-[0_2px_0_#b45309]'
                            : isInDailyPlan
                            ? 'bg-zinc-900 hover:bg-zinc-800 border-emerald-500 text-white shadow-[0_6px_0_#18181b] active:translate-y-1 active:shadow-[0_2px_0_#18181b]'
                            : 'bg-zinc-100 hover:bg-zinc-200 border-zinc-300 text-zinc-700 shadow-[0_6px_0_#d4d4d8] active:translate-y-1 active:shadow-[0_2px_0_#d4d4d8]'
                        }`}
                      >
                        {isMastered ? (
                          <Star className="w-7 h-7 fill-white" />
                        ) : isReviewDue ? (
                          <RotateCcw className="w-7 h-7" />
                        ) : (
                          <span className="font-chinese text-xl font-black">
                            {concept.titleZh.slice(0, 2)}
                          </span>
                        )}
                      </button>
                    </div>

                    {/* Node Label Card */}
                    <div className="mt-2 text-center max-w-[140px]">
                      <div className="font-chinese text-xs font-black text-zinc-900">
                        {concept.titleZh}
                      </div>
                      <div className="text-[10px] font-bold text-zinc-500 truncate">
                        {concept.titleEn}
                      </div>
                      {mastery && (
                        <div className="text-[9px] font-black text-emerald-600 mt-0.5">
                          {Math.round(mastery.masteryScore * 100)}% Mastered
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
