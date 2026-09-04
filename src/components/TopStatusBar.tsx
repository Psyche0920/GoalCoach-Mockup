import React from 'react';
import { Flame, ShieldCheck, Zap, RefreshCw, MessageSquare, Target } from 'lucide-react';
import { GoalCoachLogo } from './GoalCoachLogo.tsx';
import { LearnerState, NextAction } from '../types.ts';

interface TopStatusBarProps {
  learnerState: LearnerState | null;
  overallProgress: number;
  nextAction: NextAction;
  onRegeneratePlan: () => void;
  onOpenChat: () => void;
}

export const TopStatusBar: React.FC<TopStatusBarProps> = ({
  learnerState,
  overallProgress,
  nextAction,
  onRegeneratePlan,
  onOpenChat,
}) => {
  const completedCount = learnerState?.activePlan?.items.filter((i) => i.completed).length || 0;
  const totalCount = learnerState?.activePlan?.items.length || 0;

  return (
    <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b-2 border-zinc-200 px-4 sm:px-8 py-3 select-none">
      <div className="max-w-5xl mx-auto flex items-center justify-between">
        {/* Mobile Brand */}
        <div className="flex items-center gap-2 lg:hidden">
          <GoalCoachLogo size="sm" showSubtitle={false} />
        </div>

        {/* Status Badges in Duolingo Style (Streak / Mastery Points / Retention) */}
        <div className="flex items-center gap-3 sm:gap-6">
          {/* Streak indicator */}
          <div
            className="flex items-center gap-1.5 text-zinc-900 font-extrabold text-sm hover:bg-zinc-100 px-2.5 py-1 rounded-xl transition-colors cursor-pointer"
            title="Current Daily Streak"
          >
            <Flame className="w-5 h-5 text-orange-500 fill-orange-500" />
            <span>3</span>
          </div>

          {/* Retention Energy */}
          <div
            className="flex items-center gap-1.5 text-zinc-900 font-extrabold text-sm hover:bg-zinc-100 px-2.5 py-1 rounded-xl transition-colors cursor-pointer"
            title="Spaced Memory Retention"
          >
            <Zap className="w-5 h-5 text-emerald-500 fill-emerald-500" />
            <span>{Math.round(overallProgress * 100)}%</span>
          </div>

          {/* Today's Tasks */}
          <div
            className="flex items-center gap-1.5 text-zinc-900 font-extrabold text-sm hover:bg-zinc-100 px-2.5 py-1 rounded-xl transition-colors"
            title="Completed items today"
          >
            <ShieldCheck className="w-5 h-5 text-sky-500 fill-sky-500" />
            <span>{completedCount}/{totalCount}</span>
          </div>
        </div>

        {/* Right side controls */}
        <div className="flex items-center gap-2">
          <button
            id="btn-top-regenerate"
            onClick={onRegeneratePlan}
            className="p-2 text-zinc-600 hover:text-zinc-950 hover:bg-zinc-100 rounded-xl transition-colors border-2 border-zinc-200 shadow-[0_2px_0_#e4e4e7] active:translate-y-0.5 active:shadow-none"
            title="Re-plan today based on memory decay & error profile"
          >
            <RefreshCw className="w-4 h-4" />
          </button>

          <button
            id="btn-top-coach"
            onClick={onOpenChat}
            className="lg:hidden flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-extrabold uppercase shadow-[0_2px_0_#15803d]"
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>Coach</span>
          </button>
        </div>
      </div>
    </header>
  );
};
