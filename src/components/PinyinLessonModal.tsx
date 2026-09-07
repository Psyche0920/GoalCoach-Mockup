import React, { useState, useMemo } from 'react';
import {
  X,
  Table,
  CheckCircle2,
  Sparkles,
  ArrowRight,
  BookOpen,
  Mic,
  Volume2,
  Layers,
  Award,
  ChevronRight,
  GraduationCap,
} from 'lucide-react';
import {
  FIVE_PINYIN_UNITS,
  PinyinCurriculumUnitDef,
  PinyinPhonemeCard,
} from '../data/pinyinUnitsData';
import { PinyinInteractiveChart } from './PinyinInteractiveChart';
import { PinyinPhonemeCardModal } from './PinyinPhonemeCardModal';
import { CurriculumConcept, LearnerState } from '../types';
import { PINYIN_CURRICULUM_UNITS } from '../data/pinyinData';
import { PinyinUnitPracticeView } from './PinyinUnitPracticeView';

interface PinyinLessonModalProps {
  conceptId: string;
  onClose: () => void;
  onComplete: (score: number) => void;
  learnerState?: LearnerState | null;
  concepts?: CurriculumConcept[];
  onUpdateLearnerState?: (updater: (prev: LearnerState) => LearnerState) => void;
}

export const PinyinLessonModal: React.FC<PinyinLessonModalProps> = ({
  conceptId,
  onClose,
  onComplete,
  learnerState,
  concepts = [],
  onUpdateLearnerState,
}) => {
  // Find initial unit matching the conceptId or default to unit 1
  const initialUnitDef =
    FIVE_PINYIN_UNITS.find((u) => u.conceptId === conceptId) || FIVE_PINYIN_UNITS[0];

  const [currentUnit, setCurrentUnit] = useState<PinyinCurriculumUnitDef>(initialUnitDef);
  const [activePhonemeModal, setActivePhonemeModal] = useState<{
    card: PinyinPhonemeCard;
    tab: 'knowledge' | 'practice';
  } | null>(null);
  const [selectedSubCategory, setSelectedSubCategory] = useState<string>('all');
  const [showUnitQuiz, setShowUnitQuiz] = useState<boolean>(false);

  // Local state for phonemes marked mastered in this session
  const [masteredPhonemeIds, setMasteredPhonemeIds] = useState<Set<string>>(() => {
    const saved = learnerState?.coachPreferences?.masteredPinyinIds;
    return new Set(Array.isArray(saved) ? saved : []);
  });

  // Check if a unit is completed in learnerState
  const isUnitCompleted = (unitDef: PinyinCurriculumUnitDef) => {
    if (!learnerState?.mastery) return false;
    const m = learnerState.mastery[unitDef.conceptId];
    return Boolean(m && (m.masteryScore >= 0.7 || (m.evidenceCount || 0) > 0));
  };

  // Audio trigger
  const playAudio = (text: string, rate: number = 0.88) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'zh-CN';
      utterance.rate = rate;
      window.speechSynthesis.speak(utterance);
    }
  };

  // Mark phoneme as mastered and sync with learnerState / newcards
  const handleMarkMastered = (phonemeId: string) => {
    setMasteredPhonemeIds((prev) => {
      const next = new Set(prev);
      next.add(phonemeId);

      // Sync into learnerState if callback provided
      if (onUpdateLearnerState) {
        onUpdateLearnerState((oldState) => {
          const currentConceptId = currentUnit.conceptId;
          const oldMastery = oldState.mastery[currentConceptId] || {
            conceptId: currentConceptId,
            masteryScore: 0.5,
            retentionScore: 0.7,
            decayLambda: 0.05,
            evidenceCount: 0,
            intervalDays: 1,
            lastReviewedAt: new Date().toISOString(),
            weight: 1.0,
          };

          const newScore = Math.min(1.0, (oldMastery.masteryScore || 0.5) + 0.1);
          const newEvidence = (oldMastery.evidenceCount || 0) + 1;

          return {
            ...oldState,
            mastery: {
              ...oldState.mastery,
              [currentConceptId]: {
                ...oldMastery,
                masteryScore: newScore,
                retentionScore: Math.min(1.0, (oldMastery.retentionScore || 0.7) + 0.05),
                evidenceCount: newEvidence,
                lastReviewedAt: new Date().toISOString(),
              },
            },
            coachPreferences: {
              ...oldState.coachPreferences,
              masteredPinyinIds: Array.from(next),
            },
            todayStudiedConceptIds: Array.from(
              new Set([...(oldState.todayStudiedConceptIds || []), currentConceptId])
            ),
          };
        });
      }

      return next;
    });
  };

  // Subcategories in current unit
  const subCategories = useMemo(() => {
    const set = new Set<string>();
    currentUnit.items.forEach((item) => {
      if (item.subCategory) set.add(item.subCategory);
    });
    return Array.from(set);
  }, [currentUnit]);

  // Filtered phoneme items
  const filteredItems = useMemo(() => {
    if (selectedSubCategory === 'all') return currentUnit.items;
    return currentUnit.items.filter((item) => item.subCategory === selectedSubCategory);
  }, [currentUnit, selectedSubCategory]);

  // Handle unit quiz completion
  const handleCompleteUnitPractice = (score: number) => {
    onComplete(score);
    setShowUnitQuiz(false);
    const nextIdx = FIVE_PINYIN_UNITS.findIndex((u) => u.id === currentUnit.id) + 1;
    if (nextIdx < FIVE_PINYIN_UNITS.length) {
      setCurrentUnit(FIVE_PINYIN_UNITS[nextIdx]);
    }
  };

  // Find corresponding legacy unit for quiz if available
  const legacyUnit = PINYIN_CURRICULUM_UNITS.find((u) => u.unitNumber === currentUnit.unitNumber) || PINYIN_CURRICULUM_UNITS[0];

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 md:p-6 select-none animate-in fade-in duration-200">
      <div className="bg-slate-50 border border-slate-300 rounded-3xl w-full max-w-6xl h-[94vh] max-h-[950px] flex flex-col overflow-hidden shadow-2xl">
        
        {/* Top Header Bar */}
        <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 bg-gradient-to-br from-indigo-600 to-indigo-800 text-white rounded-2xl flex items-center justify-center font-black shadow-md text-sm">
              拼
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                  HSK 1 Pinyin Foundation
                </span>
                <span className="text-xs font-medium text-slate-500">
                  Unit {currentUnit.unitNumber} of 5
                </span>
              </div>
              <h1 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">
                {currentUnit.titleZh} · {currentUnit.titleEn}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowUnitQuiz((prev) => !prev)}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm ${
                showUnitQuiz
                  ? 'bg-slate-900 text-white'
                  : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200'
              }`}
            >
              <GraduationCap className="w-4 h-4 text-indigo-600" />
              <span>{showUnitQuiz ? 'Back to Cards' : 'Unit Quiz & Vocab'}</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="w-10 h-10 rounded-xl hover:bg-slate-100 flex items-center justify-center text-slate-500 hover:text-slate-900 transition-colors"
              title="Close modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* 5-Unit Horizontal Navigation Bar */}
        <div className="bg-white border-b border-slate-200 px-5 py-2.5 flex items-center gap-2 overflow-x-auto shrink-0 scrollbar-none">
          {FIVE_PINYIN_UNITS.map((u) => {
            const isActive = currentUnit.id === u.id;
            const isDone = isUnitCompleted(u);

            return (
              <button
                key={u.id}
                type="button"
                onClick={() => {
                  setCurrentUnit(u);
                  setShowUnitQuiz(false);
                  setSelectedSubCategory('all');
                }}
                className={`px-3.5 py-2 rounded-2xl text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap shrink-0 ${
                  isActive
                    ? 'bg-indigo-600 text-white shadow-md'
                    : isDone
                    ? 'bg-emerald-50 text-emerald-900 border border-emerald-200 hover:bg-emerald-100'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                }`}
              >
                <span
                  className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black ${
                    isActive
                      ? 'bg-white text-indigo-600'
                      : isDone
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-300 text-slate-700'
                  }`}
                >
                  {isDone ? <CheckCircle2 className="w-3.5 h-3.5" /> : u.unitNumber}
                </span>
                <span>
                  {u.unitNumber === 1 && 'Unit 1: 全拼音图表'}
                  {u.unitNumber === 2 && 'Unit 2: 声调与音节'}
                  {u.unitNumber === 3 && 'Unit 3: 23个声母'}
                  {u.unitNumber === 4 && 'Unit 4: 韵母系统'}
                  {u.unitNumber === 5 && 'Unit 5: 变调与轻声'}
                </span>
              </button>
            );
          })}
        </div>

        {/* Main Body Area */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          {showUnitQuiz ? (
            /* Cumulative Unit Practice View with Real-Time Vocab Match */
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
              <PinyinUnitPracticeView
                unit={legacyUnit}
                learnerState={learnerState || null}
                concepts={concepts}
                onCompleteUnit={handleCompleteUnitPractice}
              />
            </div>
          ) : currentUnit.unitNumber === 1 ? (
            /* UNIT 1: Full Interactive Pinyin Chart inspired by AllSet Learning */
            <PinyinInteractiveChart
              onSelectCardForPractice={(card, mode) => {
                setActivePhonemeModal({ card, tab: mode });
              }}
            />
          ) : (
            /* UNITS 2, 3, 4, 5: Knowledge Cards + Practice Cards + Coach Engine */
            <div className="space-y-6">
              {/* Unit Intro Card (Friendly, Non-Academic Tone) */}
              <div className="bg-gradient-to-br from-indigo-50 via-white to-sky-50 border border-indigo-100 rounded-2xl p-6 shadow-sm space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-100 text-indigo-800">
                      {currentUnit.titleEn}
                    </span>
                    <span className="text-xs text-slate-500 font-medium flex items-center gap-1">
                      <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                      {currentUnit.items.length} Knowledge & Practice Cards
                    </span>
                  </div>
                  <p className="text-sm text-slate-700 leading-relaxed font-medium">
                    {currentUnit.introEn}
                  </p>
                </div>

                {/* Practical Mental Models & Tips */}
                <div className="bg-white/80 border border-indigo-100/80 rounded-xl p-4 space-y-1.5">
                  <div className="text-xs font-bold text-indigo-900 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                    Coach Bǎobao’s 30-Year Practical Insights:
                  </div>
                  <ul className="text-xs text-slate-600 space-y-1 pl-4 list-disc">
                    {currentUnit.coachTips.map((tip, idx) => (
                      <li key={idx}>{tip}</li>
                    ))}
                  </ul>
                </div>

                {/* Subcategory Filter Pills if multiple groups exist */}
                {subCategories.length > 1 && (
                  <div className="pt-2 flex flex-wrap items-center gap-2">
                    <span className="text-xs font-semibold text-slate-600 mr-1">Categories:</span>
                    <button
                      type="button"
                      onClick={() => setSelectedSubCategory('all')}
                      className={`px-3 py-1 rounded-xl text-xs font-medium transition-all ${
                        selectedSubCategory === 'all'
                          ? 'bg-slate-900 text-white shadow-sm'
                          : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                      }`}
                    >
                      All ({currentUnit.items.length})
                    </button>
                    {subCategories.map((cat) => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setSelectedSubCategory(cat)}
                        className={`px-3 py-1 rounded-xl text-xs font-medium transition-all ${
                          selectedSubCategory === cat
                            ? 'bg-indigo-600 text-white shadow-sm'
                            : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                        }`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Grid of Individual Phoneme Knowledge & Practice Cards */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-slate-600 uppercase tracking-wider">
                    Phoneme Cards in this Unit (每个拼音单独知识与练习卡片)
                  </h3>
                  <div className="text-xs text-slate-500">
                    Mastered in Session: {masteredPhonemeIds.size} phonemes
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredItems.map((item) => {
                    const isMastered = masteredPhonemeIds.has(item.id);

                    return (
                      <div
                        key={item.id}
                        className="bg-white border border-slate-200 hover:border-indigo-300 rounded-2xl p-5 shadow-sm transition-all duration-200 flex flex-col justify-between group space-y-4 hover:shadow-md"
                      >
                        {/* Top Card Row */}
                        <div className="space-y-2">
                          <div className="flex items-start justify-between">
                            <div className="space-y-0.5">
                              <div className="text-2xl font-black text-slate-900 font-serif tracking-tight">
                                {item.pinyin}
                              </div>
                              <div className="flex items-center gap-1.5 text-xs text-indigo-600 font-semibold">
                                <span>{item.anchorHanzi}</span>
                                <span className="text-slate-400">·</span>
                                <span className="text-slate-500 font-normal">{item.meaningEn}</span>
                              </div>
                            </div>

                            <button
                              type="button"
                              onClick={() => playAudio(item.audioTarget || item.anchorHanzi)}
                              className="p-2.5 rounded-xl bg-slate-100 hover:bg-indigo-50 text-slate-700 hover:text-indigo-600 transition-colors shadow-sm"
                              title="Play audio"
                            >
                              <Volume2 className="w-4 h-4" />
                            </button>
                          </div>

                          {/* Acoustic Tip snippet */}
                          <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed">
                            {item.acousticTip}
                          </p>
                        </div>

                        {/* Card Bottom Actions */}
                        <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                          <button
                            type="button"
                            onClick={() => setActivePhonemeModal({ card: item, tab: 'knowledge' })}
                            className="flex-1 py-2 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
                          >
                            <BookOpen className="w-3.5 h-3.5 text-sky-600" />
                            知识卡片
                          </button>

                          <button
                            type="button"
                            onClick={() => setActivePhonemeModal({ card: item, tab: 'practice' })}
                            className="flex-1 py-2 px-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-all shadow-sm"
                          >
                            <Mic className="w-3.5 h-3.5" />
                            练习卡片
                          </button>

                          {isMastered && (
                            <span
                              className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0"
                              title="Mastered"
                            >
                              <CheckCircle2 className="w-4 h-4" />
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Dedicated Phoneme Knowledge & Practice Modal */}
        {activePhonemeModal && (
          <PinyinPhonemeCardModal
            card={activePhonemeModal.card}
            initialTab={activePhonemeModal.tab}
            onClose={() => setActivePhonemeModal(null)}
            onMastered={(cardId) => handleMarkMastered(cardId)}
            onNext={() => {
              const currentIdx = currentUnit.items.findIndex(
                (i) => i.id === activePhonemeModal.card.id
              );
              if (currentIdx + 1 < currentUnit.items.length) {
                setActivePhonemeModal({
                  card: currentUnit.items[currentIdx + 1],
                  tab: activePhonemeModal.tab,
                });
              }
            }}
            onPrev={() => {
              const currentIdx = currentUnit.items.findIndex(
                (i) => i.id === activePhonemeModal.card.id
              );
              if (currentIdx > 0) {
                setActivePhonemeModal({
                  card: currentUnit.items[currentIdx - 1],
                  tab: activePhonemeModal.tab,
                });
              }
            }}
            hasNext={
              currentUnit.items.findIndex((i) => i.id === activePhonemeModal.card.id) + 1 <
              currentUnit.items.length
            }
            hasPrev={
              currentUnit.items.findIndex((i) => i.id === activePhonemeModal.card.id) > 0
            }
          />
        )}
      </div>
    </div>
  );
};
