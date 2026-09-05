import React from 'react';
import { 
  Compass, 
  RotateCcw, 
  TrendingUp,
  BookOpen, 
  MessageSquare, 
  Flame, 
  ShieldCheck, 
  Zap,
  Target
} from 'lucide-react';
import { PandaMascot } from './PandaMascot.tsx';
import { GoalCoachLogo } from './GoalCoachLogo.tsx';
import { LearnerState, NextAction } from '../types.ts';

interface SidebarProps {
  activeTab: 'plan' | 'curriculum' | 'retention';
  setActiveTab: (tab: 'plan' | 'curriculum' | 'retention') => void;
  onOpenChat: () => void;
  learnerState: LearnerState | null;
  overallProgress: number;
  nextAction: NextAction;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  onOpenChat,
  learnerState,
  overallProgress,
  nextAction,
}) => {
  return (
    <aside className="w-68 shrink-0 hidden lg:flex flex-col border-r-2 border-zinc-200 bg-white min-h-screen px-5 py-6 select-none">
      {/* Brand Header with Sprout Logo */}
      <div className="px-2 mb-8">
        <GoalCoachLogo size="md" showSubtitle={true} />
      </div>

      {/* Main Navigation Links (Duolingo Style 3D Action Buttons) */}
      <nav className="space-y-2.5 flex-1">
        <button
          id="sidebar-btn-learn"
          onClick={() => setActiveTab('plan')}
          className={`w-full flex items-center gap-3.5 px-4 py-3 rounded-2xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
            activeTab === 'plan'
              ? 'bg-emerald-50 text-emerald-800 border-2 border-emerald-600 shadow-[0_3px_0_#16a34a]'
              : 'text-zinc-600 hover:bg-zinc-100 border-2 border-transparent'
          }`}
        >
          <Compass className="w-5 h-5" />
          <span>Daily Plan</span>
        </button>

        <button
          id="sidebar-btn-curriculum"
          onClick={() => setActiveTab('curriculum')}
          className={`w-full flex items-center gap-3.5 px-4 py-3 rounded-2xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
            activeTab === 'curriculum'
              ? 'bg-emerald-50 text-emerald-800 border-2 border-emerald-600 shadow-[0_3px_0_#16a34a]'
              : 'text-zinc-600 hover:bg-zinc-100 border-2 border-transparent'
          }`}
        >
          <BookOpen className="w-5 h-5" />
          <span>Curriculum</span>
        </button>

        <button
          id="sidebar-btn-retention"
          onClick={() => setActiveTab('retention')}
          className={`w-full flex items-center gap-3.5 px-4 py-3 rounded-2xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
            activeTab === 'retention'
              ? 'bg-emerald-50 text-emerald-800 border-2 border-emerald-600 shadow-[0_3px_0_#16a34a]'
              : 'text-zinc-600 hover:bg-zinc-100 border-2 border-transparent'
          }`}
        >
          <TrendingUp className="w-5 h-5" />
          <span>Progress 进度</span>
        </button>

        <button
          id="sidebar-btn-coach"
          onClick={onOpenChat}
          className="w-full flex items-center gap-3.5 px-4 py-3 rounded-2xl text-xs font-black uppercase tracking-wider text-zinc-900 hover:bg-zinc-100 border-2 border-zinc-200 transition-all shadow-[0_3px_0_#e4e4e7] active:translate-y-0.5 active:shadow-none cursor-pointer"
        >
          <MessageSquare className="w-5 h-5 text-emerald-600" />
          <span>Coach Bǎobao</span>
        </button>
      </nav>

      {/* Mini Mascot Card at Sidebar Bottom */}
      <div className="bg-slate-900 rounded-3xl p-4 text-white space-y-3 shadow-[0_4px_0_#0f172a] border border-slate-800">
        <div className="flex items-center gap-3">
          <PandaMascot mood="cheering" size={54} />
          <div>
            <div className="text-xs font-black text-emerald-400 uppercase tracking-wider">Coach Bǎobao (宝包)</div>
            <div className="text-[11px] text-zinc-300 font-medium leading-tight mt-0.5">
              {nextAction === 'plan_review'
                ? 'Time to review! Strengthen your memory.'
                : 'Keep going! 你可以的！💪'}
            </div>
          </div>
        </div>

        {/* Progress bar inside card */}
        <div className="space-y-1 pt-2 border-t border-slate-800">
          <div className="flex justify-between text-[10px] font-black text-slate-400">
            <span>Overall Retention</span>
            <span className="text-emerald-400">{Math.round(overallProgress * 100)}%</span>
          </div>
          <div className="h-2 bg-slate-800 rounded-full overflow-hidden p-0.5 border border-slate-700">
            <div
              className="h-full bg-emerald-500 rounded-full transition-all duration-500"
              style={{ width: `${Math.round(overallProgress * 100)}%` }}
            />
          </div>
        </div>
      </div>
    </aside>
  );
};
