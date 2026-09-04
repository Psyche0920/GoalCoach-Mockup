import React, { useState } from 'react';
import { 
  CheckCircle2, 
  Clock, 
  AlertTriangle, 
  RotateCcw, 
  Sparkles, 
  Search, 
  Filter,
  ArrowUpRight,
  BookOpen,
  Activity
} from 'lucide-react';
import { CurriculumConcept, LearnerState, ConceptMastery } from '../types.ts';
import { calculateRetention, isConceptReviewDue } from '../domain/retention.ts';

interface MasteryDashboardProps {
  concepts: CurriculumConcept[];
  learnerState: LearnerState | null;
  onSelectConcept: (conceptId: string) => void;
}

export const MasteryDashboard: React.FC<MasteryDashboardProps> = ({
  concepts,
  learnerState,
  onSelectConcept,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'due' | 'mastered' | 'unstarted'>('all');

  const now = new Date();

  const filteredConcepts = concepts.filter((c) => {
    const matchesSearch =
      c.titleZh.includes(searchQuery) ||
      c.titleEn.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.communicativeGoal.toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesSearch) return false;

    const mastery = learnerState?.mastery?.[c.conceptId];

    if (filterType === 'due') {
      return mastery && isConceptReviewDue(mastery.nextReviewAt, now);
    }
    if (filterType === 'mastered') {
      return mastery && mastery.masteryScore >= 0.8;
    }
    if (filterType === 'unstarted') {
      return !mastery || mastery.evidenceCount === 0;
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Error Profile Catalog if errors exist */}
      {learnerState?.errorProfile && learnerState.errorProfile.length > 0 && (
        <div className="bg-white rounded-2xl border border-rose-200 p-5 shadow-xs">
          <div className="flex items-center gap-2 mb-3">
            <div className="p-1.5 rounded-lg bg-rose-50 text-rose-700">
              <AlertTriangle className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-stone-900">Cataloged Recurring Error Patterns</h3>
              <p className="text-xs text-stone-500">
                GoalCoach automatically routes targeted remedial practice for persistent mistakes.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {learnerState.errorProfile.map((err) => (
              <div
                key={err.code}
                className="bg-stone-50/80 rounded-xl p-3.5 border border-stone-200 space-y-1.5 text-xs"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                    {err.code}
                  </span>
                  <span className="text-stone-500 font-medium">
                    {err.occurrences} {err.occurrences === 1 ? 'occurrence' : 'occurrences'}
                  </span>
                </div>
                <div className="text-stone-600">
                  Concept:{' '}
                  <span className="font-semibold text-stone-900">
                    {concepts.find((c) => c.conceptId === err.conceptId)?.titleEn || err.conceptId}
                  </span>
                </div>
                {err.examples.length > 0 && (
                  <div className="bg-white rounded-lg p-2 border border-stone-200/60 text-[11px] text-stone-500 italic">
                    Example: “{err.examples[0]}”
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Curriculum Grid */}
      <div className="bg-white rounded-2xl border border-stone-200 p-6 shadow-xs space-y-6">
        {/* Controls */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-bold text-stone-900">
              HSK 1 Complete Curriculum Matrix (20 Concepts)
            </h3>
            <p className="text-xs text-stone-500 mt-0.5">
              Concept-level mastery, memory stability, and decayed retention tracking.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Search */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
              <input
                id="input-curriculum-search"
                type="text"
                placeholder="Search concepts..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 pr-3 py-1.5 text-xs border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 w-40 sm:w-48"
              />
            </div>

            {/* Filter pills */}
            <div className="flex items-center gap-1 bg-stone-100 p-1 rounded-xl text-xs font-medium text-stone-600">
              <button
                onClick={() => setFilterType('all')}
                className={`px-2.5 py-1 rounded-lg transition-all ${
                  filterType === 'all' ? 'bg-white text-stone-900 shadow-xs font-semibold' : ''
                }`}
              >
                All
              </button>
              <button
                onClick={() => setFilterType('due')}
                className={`px-2.5 py-1 rounded-lg transition-all ${
                  filterType === 'due' ? 'bg-white text-amber-800 shadow-xs font-semibold' : ''
                }`}
              >
                Due Review
              </button>
              <button
                onClick={() => setFilterType('mastered')}
                className={`px-2.5 py-1 rounded-lg transition-all ${
                  filterType === 'mastered' ? 'bg-white text-emerald-800 shadow-xs font-semibold' : ''
                }`}
              >
                Mastered
              </button>
              <button
                onClick={() => setFilterType('unstarted')}
                className={`px-2.5 py-1 rounded-lg transition-all ${
                  filterType === 'unstarted' ? 'bg-white text-stone-900 shadow-xs font-semibold' : ''
                }`}
              >
                New
              </button>
            </div>
          </div>
        </div>

        {/* Concept Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredConcepts.map((concept) => {
            const mastery: ConceptMastery | undefined = learnerState?.mastery?.[concept.conceptId];
            const currentRetention = mastery
              ? calculateRetention(
                  mastery.retentionScore,
                  mastery.lastReviewedAt,
                  now,
                  mastery.decayLambda
                )
              : 0;
            const reviewDue = mastery && isConceptReviewDue(mastery.nextReviewAt, now);

            return (
              <div
                key={concept.conceptId}
                id={`concept-card-${concept.conceptId}`}
                onClick={() => onSelectConcept(concept.conceptId)}
                className={`p-5 rounded-2xl border-2 transition-all cursor-pointer flex flex-col justify-between space-y-4 ${
                  reviewDue
                    ? 'bg-amber-50/50 border-zinc-950 shadow-[0_4px_0_#b45309]'
                    : mastery && mastery.masteryScore >= 0.8
                    ? 'bg-white border-zinc-950 shadow-[0_4px_0_#15803d]'
                    : 'bg-white border-zinc-200 hover:border-zinc-950 shadow-[0_3px_0_#e4e4e7] hover:shadow-[0_4px_0_#18181b]'
                } active:translate-y-0.5 active:shadow-none`}
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black text-zinc-500 font-mono tracking-wider uppercase">
                      #{concept.sequenceNo.toString().padStart(2, '0')} • {concept.conceptType}
                    </span>
                    {reviewDue && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 font-bold border border-amber-300 flex items-center gap-1">
                        <RotateCcw className="w-2.5 h-2.5" />
                        Review Due
                      </span>
                    )}
                  </div>

                  <div>
                    <div className="font-chinese text-lg font-black text-zinc-950">
                      {concept.titleZh}
                    </div>
                    <div className="text-xs text-zinc-600 font-bold">
                      {concept.titleEn}
                    </div>
                  </div>

                  <p className="text-xs text-zinc-500 font-medium line-clamp-2 leading-relaxed">
                    {concept.communicativeGoal}
                  </p>

                  {concept.vocabularyFocus.length > 0 && (
                    <div className="flex flex-wrap gap-1 pt-1">
                      {concept.vocabularyFocus.slice(0, 4).map((vocab) => (
                        <span
                          key={vocab}
                          className="font-chinese text-[11px] font-black px-2 py-0.5 rounded-lg bg-zinc-100 text-zinc-900 border border-zinc-200"
                        >
                          {vocab}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Mastery & Retention Footer */}
                <div className="pt-3 border-t-2 border-zinc-100 space-y-2 text-xs">
                  <div className="space-y-1">
                    <div className="flex justify-between text-[11px] font-bold text-zinc-500">
                      <span>Concept Mastery</span>
                      <span className="font-black text-zinc-950">
                        {mastery ? Math.round(mastery.masteryScore * 100) : 0}%
                      </span>
                    </div>
                    <div className="h-2 bg-zinc-200 rounded-full overflow-hidden p-0.5">
                      <div
                        className="h-full bg-emerald-500 rounded-full transition-all"
                        style={{
                          width: `${mastery ? Math.round(mastery.masteryScore * 100) : 0}%`,
                        }}
                      />
                    </div>
                  </div>

                  {mastery && (
                    <div className="flex items-center justify-between text-[10px] font-bold text-zinc-500">
                      <span className="flex items-center gap-1">
                        <Activity className="w-3 h-3 text-emerald-600" />
                        Retention: {Math.round(currentRetention * 100)}%
                      </span>
                      <span>Evidence: {mastery.evidenceCount} answers</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
