import React, { useState } from 'react';
import { 
  X, 
  Table, 
  CheckCircle2, 
  Sparkles,
  ArrowRight,
  BookOpen
} from 'lucide-react';
import { PINYIN_CURRICULUM_UNITS, PinyinUnit } from '../data/pinyinData.ts';
import { PinyinUnitVisualDiagram } from './PinyinUnitVisualDiagram.tsx';
import { PinyinUnitPracticeView } from './PinyinUnitPracticeView.tsx';
import { PinyinChartTable } from './PinyinChartTable.tsx';
import { CurriculumConcept, LearnerState } from '../types.ts';

interface PinyinLessonModalProps {
  conceptId: string;
  onClose: () => void;
  onComplete: (score: number) => void;
  learnerState?: LearnerState | null;
  concepts?: CurriculumConcept[];
}

export const PinyinLessonModal: React.FC<PinyinLessonModalProps> = ({
  conceptId,
  onClose,
  onComplete,
  learnerState,
  concepts = [],
}) => {
  // Find initial unit by conceptId or fallback to unit 1
  const initialUnit = PINYIN_CURRICULUM_UNITS.find((u) => u.conceptId === conceptId) || PINYIN_CURRICULUM_UNITS[0];
  const [selectedUnit, setSelectedUnit] = useState<PinyinUnit>(initialUnit);
  const [showChartOverlay, setShowChartOverlay] = useState(false);

  // Check if a unit is learned
  const isUnitCompleted = (u: PinyinUnit) => {
    if (!learnerState?.mastery) return false;
    const m = learnerState.mastery[u.conceptId];
    return Boolean(m && (m.masteryScore >= 0.65 || (m.evidenceCount || 0) > 0));
  };

  const handleCompleteUnit = (score: number) => {
    onComplete(score);
    // Advance to next unit if available
    const currentIndex = PINYIN_CURRICULUM_UNITS.findIndex((u) => u.id === selectedUnit.id);
    if (currentIndex + 1 < PINYIN_CURRICULUM_UNITS.length) {
      setSelectedUnit(PINYIN_CURRICULUM_UNITS[currentIndex + 1]);
    } else {
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-zinc-950/70 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 md:p-6 select-none animate-in fade-in duration-200">
      <div className="bg-zinc-100 border-2 border-zinc-950 rounded-3xl w-full max-w-5xl h-[92vh] max-h-[900px] flex flex-col overflow-hidden shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
        
        {/* Top Header Bar */}
        <div className="bg-white border-b-2 border-zinc-950 px-5 py-3.5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-500 text-zinc-950 rounded-xl border-2 border-zinc-950 flex items-center justify-center font-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] text-sm">
              Py
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-100 text-emerald-900 border border-emerald-300">
                  Module 1 · Pinyin Foundation
                </span>
                <span className="text-xs font-bold text-zinc-400">
                  Unit {selectedUnit.unitNumber} of {PINYIN_CURRICULUM_UNITS.length}
                </span>
              </div>
              <h2 className="text-base sm:text-lg font-black text-zinc-950 tracking-tight">
                {selectedUnit.titleEn}
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowChartOverlay((prev) => !prev)}
              className={`px-3 py-1.5 rounded-xl border-2 border-zinc-950 font-black text-xs flex items-center gap-1.5 transition-all cursor-pointer shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:scale-95 ${
                showChartOverlay
                  ? 'bg-zinc-950 text-white'
                  : 'bg-white hover:bg-zinc-50 text-zinc-900'
              }`}
            >
              <Table className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Pinyin Chart</span>
            </button>

            <button
              onClick={onClose}
              className="w-9 h-9 rounded-xl border-2 border-zinc-950 flex items-center justify-center hover:bg-zinc-100 active:scale-95 transition-all text-zinc-700 hover:text-zinc-950 cursor-pointer shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
              title="Close modal"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Horizontal Unit Stepper Bar */}
        <div className="bg-white border-b-2 border-zinc-200 px-4 py-2 flex items-center gap-2 overflow-x-auto shrink-0 scrollbar-none">
          {PINYIN_CURRICULUM_UNITS.map((u) => {
            const isActive = selectedUnit.id === u.id;
            const isDone = isUnitCompleted(u);

            return (
              <button
                key={u.id}
                onClick={() => {
                  setSelectedUnit(u);
                  setShowChartOverlay(false);
                }}
                className={`px-3 py-2 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-2 whitespace-nowrap shrink-0 ${
                  isActive
                    ? 'bg-zinc-950 text-white shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] border-2 border-zinc-950'
                    : isDone
                    ? 'bg-emerald-50 text-emerald-900 border-2 border-emerald-300 hover:bg-emerald-100'
                    : 'bg-zinc-50 text-zinc-600 border-2 border-zinc-200 hover:border-zinc-400'
                }`}
              >
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black ${
                  isActive
                    ? 'bg-emerald-400 text-zinc-950'
                    : isDone
                    ? 'bg-emerald-500 text-white'
                    : 'bg-zinc-200 text-zinc-600'
                }`}>
                  {isDone ? <CheckCircle2 className="w-3 h-3" /> : u.unitNumber}
                </span>
                <span>Unit {u.unitNumber}</span>
              </button>
            );
          })}
        </div>

        {/* Main Content Area */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
          {showChartOverlay ? (
            /* Reference Pinyin Chart Overlay */
            <div className="space-y-3 animate-in fade-in duration-150">
              <div className="flex items-center justify-between bg-white p-3 rounded-2xl border-2 border-zinc-950 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
                <div>
                  <h3 className="text-sm font-black text-zinc-950">
                    Mandarin Syllables Reference Chart (Yoyo Chinese Style)
                  </h3>
                  <p className="text-xs text-zinc-500 font-medium">
                    Click any cell to audition native audio across all 4 tones.
                  </p>
                </div>
                <button
                  onClick={() => setShowChartOverlay(false)}
                  className="px-3 py-1.5 bg-zinc-950 text-white text-xs font-black rounded-xl cursor-pointer hover:bg-zinc-800"
                >
                  Return to Unit {selectedUnit.unitNumber}
                </button>
              </div>
              <PinyinChartTable />
            </div>
          ) : (
            /* Unit Content: Concept + Visual Diagram + Bundled Practice */
            <>
              {/* Unit Header Card */}
              <div className="bg-white border-2 border-zinc-950 rounded-2xl p-5 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-black uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded border border-emerald-200">
                    Pedagogical Objective
                  </span>
                  <span className="text-xs font-bold text-zinc-400">
                    ~{selectedUnit.estimatedMinutes} Minutes
                  </span>
                </div>
                <p className="text-sm text-zinc-700 font-medium leading-relaxed">
                  {selectedUnit.objectiveEn}
                </p>
              </div>

              {/* 1. Visual Intuitive Diagram */}
              <PinyinUnitVisualDiagram unitNumber={selectedUnit.unitNumber} />

              {/* 2. Bundled Practice with Real-Time Vocabulary Matching */}
              <PinyinUnitPracticeView
                unit={selectedUnit}
                learnerState={learnerState || null}
                concepts={concepts}
                onCompleteUnit={handleCompleteUnit}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
};
