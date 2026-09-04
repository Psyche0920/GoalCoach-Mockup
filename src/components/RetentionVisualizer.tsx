import React, { useState } from 'react';
import { Activity, Clock, RotateCcw, Info, Brain, Zap } from 'lucide-react';
import { LearnerState, CurriculumConcept } from '../types.ts';
import { calculateRetention, isConceptReviewDue } from '../domain/retention.ts';

interface RetentionVisualizerProps {
  learnerState: LearnerState | null;
  concepts: CurriculumConcept[];
  onReviewConcept: (conceptId: string) => void;
}

export const RetentionVisualizer: React.FC<RetentionVisualizerProps> = ({
  learnerState,
  concepts,
  onReviewConcept,
}) => {
  const [simulatedDays, setSimulatedDays] = useState(2);
  const [customLambda, setCustomLambda] = useState(0.05);

  const now = new Date();

  // Generate curve points for 0 to 14 days
  const curvePoints = Array.from({ length: 15 }, (_, i) => {
    const ret = Math.exp(-customLambda * i);
    return { day: i, retention: ret };
  });

  const simulatedRetention = Math.exp(-customLambda * simulatedDays);

  return (
    <div className="space-y-6 select-none">
      {/* Mathematical Explanation Card */}
      <div className="bg-white rounded-3xl border-2 border-zinc-950 p-6 shadow-[0_4px_0_#18181b] space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-2xl bg-zinc-950 text-emerald-400 border-2 border-zinc-950 shadow-[0_2px_0_#27272a]">
              <Brain className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-black uppercase tracking-wider text-emerald-600">
                  Deterministic Forgetting Curve Math
                </span>
              </div>
              <h2 className="text-lg font-black text-zinc-950 mt-0.5">
                Ebbinghaus Spaced Repetition Retention Model
              </h2>
              <p className="text-xs text-zinc-600 mt-1 max-w-2xl leading-relaxed font-bold">
                GoalCoach measures retention using exponential decay:
                <code className="mx-1.5 px-2 py-0.5 rounded-lg bg-zinc-100 text-zinc-950 font-mono font-black text-xs border border-zinc-200">
                  R(t) = R₀ · e^(-λ · Δt)
                </code>
                where <span className="text-zinc-900 font-black">Δt</span> is elapsed time since last review, and
                <span className="text-zinc-900 font-black"> λ</span> is the decay constant. When retention drops below threshold,
                the deterministic orchestrator schedules a spaced review.
              </p>
            </div>
          </div>
        </div>

        {/* Interactive Simulator */}
        <div className="bg-zinc-50 rounded-2xl p-5 border-2 border-zinc-200 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <span className="text-xs font-black text-zinc-900 uppercase tracking-wider flex items-center gap-1.5">
              <Zap className="w-4 h-4 text-emerald-500 fill-emerald-500" />
              Retention Decay Simulator
            </span>

            <div className="flex items-center gap-4 text-xs font-bold">
              <label className="text-zinc-600 flex items-center gap-1.5 font-bold">
                Decay Rate (λ):
                <select
                  value={customLambda}
                  onChange={(e) => setCustomLambda(Number(e.target.value))}
                  className="bg-white border-2 border-zinc-200 rounded-xl px-2.5 py-1 text-xs font-bold text-zinc-900 focus:outline-none focus:border-zinc-900"
                >
                  <option value="0.03">0.03 (High Stability / Review 4+)</option>
                  <option value="0.05">0.05 (Standard HSK 1 Default)</option>
                  <option value="0.10">0.10 (Rapid Decay / New Concept)</option>
                </select>
              </label>
            </div>
          </div>

          {/* Slider */}
          <div className="space-y-2">
            <div className="flex justify-between text-xs font-bold text-zinc-700">
              <span>Elapsed Time: <b className="text-zinc-950 font-black">{simulatedDays} Days</b></span>
              <span>
                Estimated Retention: <b className="text-emerald-600 font-black">{Math.round(simulatedRetention * 100)}%</b>
              </span>
            </div>
            <input
              id="slider-simulated-days"
              type="range"
              min="0"
              max="14"
              step="0.5"
              value={simulatedDays}
              onChange={(e) => setSimulatedDays(Number(e.target.value))}
              className="w-full accent-emerald-500 cursor-pointer"
            />
          </div>

          {/* Mini Bar Graph Visualizer */}
          <div className="grid grid-cols-15 gap-1 items-end h-24 pt-4 border-b border-zinc-200">
            {curvePoints.map((pt) => {
              const isSelected = Math.abs(pt.day - simulatedDays) < 0.5;
              const heightPct = Math.round(pt.retention * 100);

              return (
                <div key={pt.day} className="flex flex-col items-center h-full justify-end group">
                  <div
                    className={`w-full rounded-t transition-all ${
                      isSelected
                        ? 'bg-emerald-500 ring-2 ring-emerald-500/40'
                        : pt.retention < 0.6
                        ? 'bg-rose-300 group-hover:bg-rose-400'
                        : 'bg-zinc-300 group-hover:bg-zinc-400'
                    }`}
                    style={{ height: `${heightPct}%` }}
                  />
                  <span className="text-[9px] text-zinc-400 font-mono mt-1">{pt.day}d</span>
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-between text-[11px] text-zinc-500 font-bold">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-rose-300" /> Retention &lt; 60% (Review Recommended)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" /> Current Selected Day
            </span>
          </div>
        </div>
      </div>

      {/* Active Concept Retention Table */}
      <div className="bg-white rounded-3xl border-2 border-zinc-950 p-6 shadow-[0_4px_0_#18181b] space-y-4">
        <h3 className="text-base font-black text-zinc-950">Active Spaced Repetition Profiles</h3>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b-2 border-zinc-200 text-zinc-400 font-black uppercase tracking-wider text-[10px]">
                <th className="pb-3">Concept</th>
                <th className="pb-3">Mastery</th>
                <th className="pb-3">Current Decayed Retention</th>
                <th className="pb-3">Last Reviewed</th>
                <th className="pb-3">Next Due</th>
                <th className="pb-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 font-bold">
              {Object.entries(learnerState?.mastery || {}).map(([conceptId, mastery]) => {
                const concept = concepts.find((c) => c.conceptId === conceptId);
                const currentRet = calculateRetention(
                  mastery.retentionScore,
                  mastery.lastReviewedAt,
                  now,
                  mastery.decayLambda
                );
                const reviewDue = isConceptReviewDue(mastery.nextReviewAt, now);

                return (
                  <tr key={conceptId} className="hover:bg-zinc-50/80 transition-colors">
                    <td className="py-3.5 font-bold text-zinc-950">
                      <div className="flex items-center gap-2">
                        <span className="font-chinese text-sm font-black">{concept?.titleZh || conceptId}</span>
                        <span className="text-zinc-500 font-bold">({concept?.titleEn})</span>
                      </div>
                    </td>
                    <td className="py-3.5 font-black text-zinc-900">
                      {Math.round(mastery.masteryScore * 100)}%
                    </td>
                    <td className="py-3.5">
                      <div className="flex items-center gap-2">
                        <span className="font-black text-zinc-900">
                          {Math.round(currentRet * 100)}%
                        </span>
                        <div className="w-16 bg-zinc-200 rounded-full h-2 overflow-hidden p-0.5">
                          <div
                            className={`h-full rounded-full ${
                              currentRet < 0.6 ? 'bg-rose-500' : 'bg-emerald-500'
                            }`}
                            style={{ width: `${Math.round(currentRet * 100)}%` }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="py-3.5 text-zinc-500">
                      {new Date(mastery.lastReviewedAt).toLocaleDateString()}
                    </td>
                    <td className="py-3.5">
                      {reviewDue ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-300">
                          <RotateCcw className="w-2.5 h-2.5" />
                          Review Due
                        </span>
                      ) : (
                        <span className="text-zinc-500">
                          {mastery.nextReviewAt
                            ? new Date(mastery.nextReviewAt).toLocaleDateString()
                            : 'Pending'}
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 text-right">
                      <button
                        onClick={() => onReviewConcept(conceptId)}
                        className="px-3.5 py-1.5 text-xs font-black bg-zinc-950 text-white hover:bg-zinc-800 rounded-xl transition-all shadow-[0_2px_0_#3f3f46] active:translate-y-0.5 active:shadow-none cursor-pointer"
                      >
                        Review
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
