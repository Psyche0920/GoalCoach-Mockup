import React, { useState } from 'react';
import { 
  X, 
  Target, 
  Clock, 
  Sparkles, 
  Check, 
  Save, 
  Compass, 
  HelpCircle,
  Award
} from 'lucide-react';
import { LearningGoal } from '../types.ts';
import { PandaMascot } from './PandaMascot.tsx';
import { GOAL_PRESETS } from '../data/curriculumThemes.ts';

interface LearnerProfileDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  goal: LearningGoal | null;
  onUpdateGoal: (updated: Partial<LearningGoal>) => void;
  onRegeneratePlan?: () => void;
}

export const LearnerProfileDrawer: React.FC<LearnerProfileDrawerProps> = ({
  isOpen,
  onClose,
  goal,
  onUpdateGoal,
  onRegeneratePlan,
}) => {
  const [minutes, setMinutes] = useState<number>(goal?.dailyAvailableMinutes || 15);
  const [selectedInterests, setSelectedInterests] = useState<string[]>(
    goal?.interests || ['dining_food', 'travel_directions', 'daily_life']
  );
  const [targetDomain, setTargetDomain] = useState<string>(goal?.targetDomain || 'general');

  if (!isOpen) return null;

  const handleSave = () => {
    onUpdateGoal({
      dailyAvailableMinutes: minutes,
      interests: selectedInterests as any,
      targetDomain: targetDomain as any,
    });
    if (onRegeneratePlan) onRegeneratePlan();
    onClose();
  };

  const toggleInterest = (id: string) => {
    if (selectedInterests.includes(id)) {
      if (selectedInterests.length > 1) {
        setSelectedInterests(selectedInterests.filter(i => i !== id));
      }
    } else {
      setSelectedInterests([...selectedInterests, id]);
    }
  };

  const interestOptions = [
    { id: 'dining_food', label: '☕ Coffee & Food (餐饮与咖啡)', icon: '🍜' },
    { id: 'travel_directions', label: '✈️ Travel & Directions (旅行问路)', icon: '🧭' },
    { id: 'daily_life', label: '💬 Daily Chat & Friends (日常聊天)', icon: '🤝' },
    { id: 'work_study', label: '💼 Work & Campus (职场学习)', icon: '📚' },
    { id: 'shopping_prices', label: '🏷️ Shopping & Prices (购物买单)', icon: '🛒' },
    { id: 'numbers_time', label: '📅 Numbers & Time (数字时间)', icon: '⏰' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-zinc-950/40 backdrop-blur-xs select-none animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-md h-full shadow-2xl flex flex-col border-l-2 border-zinc-950 animate-in slide-in-from-right duration-300">
        {/* Header */}
        <div className="px-6 py-5 border-b-2 border-zinc-200 bg-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <PandaMascot mood="happy" size={44} />
            <div>
              <h3 className="text-base font-black text-zinc-950">Learner Profile</h3>
              <p className="text-xs font-bold text-emerald-600">Goal & Study Routine</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-zinc-400 hover:text-zinc-900 rounded-xl hover:bg-zinc-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Target Milestone */}
          <div className="space-y-2">
            <label className="text-xs font-black uppercase tracking-wider text-zinc-500 flex items-center gap-1.5">
              <Target className="w-3.5 h-3.5 text-emerald-600" />
              Target Standard
            </label>
            <div className="p-4 rounded-2xl bg-emerald-50 border-2 border-emerald-300 flex items-start gap-3">
              <div className="p-2 rounded-xl bg-emerald-600 text-white font-black text-xs">
                HSK 1
              </div>
              <div className="space-y-0.5">
                <div className="text-xs font-black text-zinc-950">150 Core Words & Foundational Grammar</div>
                <p className="text-[11px] text-zinc-600 leading-relaxed font-medium">
                  Official standard by CLEC (Ministry of Education). Focuses on practical daily communication.
                </p>
              </div>
            </div>
          </div>

          {/* Daily Study Commitment */}
          <div className="space-y-2.5">
            <label className="text-xs font-black uppercase tracking-wider text-zinc-500 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-emerald-600" />
              Daily Study Goal
            </label>
            <div className="grid grid-cols-5 gap-2">
              {[5, 10, 15, 20, 30].map(mins => (
                <button
                  key={mins}
                  type="button"
                  onClick={() => setMinutes(mins)}
                  className={`py-3 rounded-2xl border-2 text-xs font-black transition-all flex flex-col items-center gap-1 cursor-pointer ${
                    minutes === mins
                      ? 'bg-emerald-500 border-zinc-950 text-zinc-950 shadow-[0_3px_0_#15803d]'
                      : 'bg-zinc-50 border-zinc-200 text-zinc-600 hover:bg-zinc-100'
                  }`}
                >
                  <span className="text-sm font-black">{mins}</span>
                  <span className="text-[9px] uppercase tracking-tighter">min</span>
                </button>
              ))}
            </div>
          </div>

          {/* Target Domain & Priority Themes */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-black uppercase tracking-wider text-zinc-500 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                Tailored Priority Interests
              </label>
              <span className="text-[10px] font-bold text-zinc-400">Select 1 or more</span>
            </div>

            <div className="space-y-2">
              {interestOptions.map(opt => {
                const isSelected = selectedInterests.includes(opt.id);
                return (
                  <div
                    key={opt.id}
                    onClick={() => toggleInterest(opt.id)}
                    className={`p-3.5 rounded-2xl border-2 transition-all cursor-pointer flex items-center justify-between ${
                      isSelected
                        ? 'bg-emerald-50 border-emerald-500 text-emerald-950 shadow-xs'
                        : 'bg-zinc-50 border-zinc-200 text-zinc-600 hover:bg-zinc-100'
                    }`}
                  >
                    <span className="text-xs font-bold">{opt.label}</span>
                    <div
                      className={`w-5 h-5 rounded-full flex items-center justify-center transition-colors ${
                        isSelected ? 'bg-emerald-600 text-white' : 'border border-zinc-300'
                      }`}
                    >
                      {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-5 border-t-2 border-zinc-200 bg-zinc-50 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 text-xs font-black text-zinc-600 hover:text-zinc-900 rounded-xl transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="flex items-center gap-2 px-6 py-3 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 rounded-2xl border-2 border-zinc-950 font-black text-xs uppercase tracking-wider shadow-[0_3px_0_#15803d] active:translate-y-0.5 active:shadow-none transition-all cursor-pointer"
          >
            <Save className="w-4 h-4" />
            <span>Apply & Recalibrate</span>
          </button>
        </div>
      </div>
    </div>
  );
};
