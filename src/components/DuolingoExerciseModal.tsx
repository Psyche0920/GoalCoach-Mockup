import React, { useState, useEffect } from 'react';
import { 
  X, 
  Check, 
  ArrowRight, 
  Volume2, 
  Sparkles, 
  HelpCircle,
  ShieldCheck,
  AlertTriangle
} from 'lucide-react';
import { PandaMascot } from './PandaMascot.tsx';
import { GoalCoachLogo } from './GoalCoachLogo.tsx';
import { CurriculumConcept, TeachingCard, Exercise, GradingResult } from '../types.ts';

interface DuolingoExerciseModalProps {
  conceptId: string;
  onClose: () => void;
  onSubmitAnswer: (exerciseId: string, answer: string) => Promise<GradingResult | null>;
}

export const DuolingoExerciseModal: React.FC<DuolingoExerciseModalProps> = ({
  conceptId,
  onClose,
  onSubmitAnswer,
}) => {
  const [loading, setLoading] = useState(true);
  const [concept, setConcept] = useState<CurriculumConcept | null>(null);
  const [cards, setCards] = useState<TeachingCard[]>([]);
  const [exercises, setExercises] = useState<Exercise[]>([]);

  // Flow: 'card' (teaching) -> 'practice' (exercises)
  const [phase, setPhase] = useState<'card' | 'practice'>('card');
  const [currentCardIndex, setCurrentCardIndex] = useState(0);
  const [currentExerciseIndex, setCurrentExerciseIndex] = useState(0);

  // Input states
  const [selectedOption, setSelectedOption] = useState<string>('');
  const [textInput, setTextInput] = useState<string>('');
  const [reorderTokens, setReorderTokens] = useState<string[]>([]);
  const [availableTokens, setAvailableTokens] = useState<string[]>([]);

  // Evaluation
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [gradingResult, setGradingResult] = useState<GradingResult | null>(null);

  // Audio Pronunciation using Web Speech API
  const playAudio = (text: string) => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'zh-CN';
      utterance.rate = 0.85;
      window.speechSynthesis.speak(utterance);
    }
  };

  useEffect(() => {
    async function loadData() {
      try {
        const res = await fetch(`/api/v1/curriculum/concepts/${conceptId}`);
        if (res.ok) {
          const data = await res.json();
          setConcept(data.concept);
          setCards(data.cards || []);
          setExercises(data.exercises || []);
        }
      } catch (err) {
        console.error('Failed to load concept exercises:', err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [conceptId]);

  const currentExercise = exercises[currentExerciseIndex];

  useEffect(() => {
    setSelectedOption('');
    setTextInput('');
    setGradingResult(null);

    if (currentExercise && currentExercise.exerciseType === 'reorder') {
      const tokens = currentExercise.options || currentExercise.prompt.split('/').map((s) => s.trim());
      setAvailableTokens([...tokens]);
      setReorderTokens([]);
    }
  }, [currentExerciseIndex, currentExercise]);

  const handleAddToken = (token: string, index: number) => {
    setReorderTokens([...reorderTokens, token]);
    const newAvail = [...availableTokens];
    newAvail.splice(index, 1);
    setAvailableTokens(newAvail);
  };

  const handleRemoveToken = (token: string, index: number) => {
    setAvailableTokens([...availableTokens, token]);
    const newReorder = [...reorderTokens];
    newReorder.splice(index, 1);
    setReorderTokens(newReorder);
  };

  const handleSubmit = async () => {
    if (!currentExercise) return;
    let answerToSubmit = '';

    if (currentExercise.exerciseType === 'reorder') {
      answerToSubmit = reorderTokens.join('');
    } else if (currentExercise.options && currentExercise.options.length > 0) {
      answerToSubmit = selectedOption;
    } else {
      answerToSubmit = textInput.trim();
    }

    if (!answerToSubmit) return;

    setIsSubmitting(true);
    try {
      const result = await onSubmitAnswer(currentExercise.id, answerToSubmit);
      if (result) {
        setGradingResult(result);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleNextExercise = () => {
    setGradingResult(null);
    if (currentExerciseIndex < exercises.length - 1) {
      setCurrentExerciseIndex(currentExerciseIndex + 1);
    } else {
      onClose();
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/60 backdrop-blur-xs p-4">
        <div className="bg-white rounded-3xl p-8 max-w-sm w-full text-center border-4 border-zinc-950 shadow-[0_8px_0_#18181b]">
          <PandaMascot mood="thinking" size={80} className="mx-auto mb-4" />
          <div className="text-base font-black text-zinc-950">Getting lesson ready...</div>
        </div>
      </div>
    );
  }

  // Calculate progress percentage
  const totalSteps = exercises.length || 1;
  const progressPercent = Math.round(((currentExerciseIndex + (gradingResult ? 1 : 0)) / totalSteps) * 100);

  const activeCard = cards[currentCardIndex];

  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col justify-between select-none overflow-y-auto">
      {/* Top Header with Duolingo-style Green Progress Bar */}
      <header className="px-4 sm:px-8 py-3.5 border-b-2 border-zinc-200 flex items-center gap-4 max-w-3xl mx-auto w-full">
        <button
          onClick={onClose}
          className="text-zinc-400 hover:text-zinc-800 p-1.5 rounded-xl transition-colors cursor-pointer"
        >
          <X className="w-5 h-5 stroke-[3]" />
        </button>

        <GoalCoachLogo size="sm" showSubtitle={false} className="shrink-0" />

        {/* Progress Bar Container */}
        <div className="flex-1 bg-zinc-100 h-3.5 rounded-full overflow-hidden p-0.5 border border-zinc-200">
          <div
            className="bg-emerald-500 h-full rounded-full transition-all duration-300"
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        <div className="text-xs font-black uppercase text-zinc-500 tracking-wider">
          {currentExerciseIndex + 1}/{totalSteps}
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-2xl mx-auto w-full p-4 sm:p-8 flex flex-col justify-center">
        {phase === 'card' && activeCard ? (
          /* Teaching Cards Phase (Matching Screen 4: New Word / Grammar) */
          <div className="space-y-6">
            <div className="flex items-center gap-4">
              <PandaMascot mood="idle" size={72} />
              <div>
                <span className="text-xs font-black uppercase tracking-wider text-emerald-600">
                  Concept Guide • Card {currentCardIndex + 1} of {cards.length}
                </span>
                <div className="flex items-center gap-3">
                  <h2 className="text-2xl sm:text-3xl font-black text-zinc-950 font-chinese">
                    {activeCard.promptZh || concept?.titleZh}
                  </h2>
                  <button
                    onClick={() => playAudio(activeCard.promptZh || concept?.titleZh || '')}
                    className="p-2 rounded-full bg-emerald-100 hover:bg-emerald-200 text-emerald-800 transition-colors cursor-pointer"
                    title="Pronounce Chinese"
                  >
                    <Volume2 className="w-4 h-4 stroke-[2.5]" />
                  </button>
                </div>
                {activeCard.pinyin && (
                  <p className="text-sm font-mono font-bold text-emerald-600 mt-0.5">
                    {activeCard.pinyin}
                  </p>
                )}
              </div>
            </div>

            {/* Explanation box */}
            <div className="bg-zinc-50 rounded-3xl p-6 border-2 border-zinc-900 shadow-[0_4px_0_#18181b] space-y-4">
              <div className="text-sm font-bold text-zinc-800 leading-relaxed">
                {activeCard.explanationEn}
              </div>

              {activeCard.exampleZh && (
                <div className="bg-emerald-50 rounded-2xl p-4 border-2 border-emerald-500 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black uppercase text-emerald-800">Example</span>
                    <button
                      onClick={() => playAudio(activeCard.exampleZh || '')}
                      className="text-emerald-700 hover:text-emerald-900 flex items-center gap-1 text-xs font-bold cursor-pointer"
                    >
                      <Volume2 className="w-3.5 h-3.5" />
                      Listen
                    </button>
                  </div>
                  <div className="font-chinese text-lg font-black text-zinc-950">
                    {activeCard.exampleZh}
                  </div>
                  {activeCard.examplePinyin && (
                    <div className="text-xs font-mono text-emerald-700 font-bold">
                      {activeCard.examplePinyin}
                    </div>
                  )}
                  <div className="text-xs font-bold text-zinc-600 italic">
                    {activeCard.exampleEn}
                  </div>
                </div>
              )}
            </div>

            {/* Card Navigation */}
            <div className="flex justify-end pt-4">
              {currentCardIndex < cards.length - 1 ? (
                <button
                  onClick={() => setCurrentCardIndex(currentCardIndex + 1)}
                  className="px-6 py-3 bg-zinc-900 hover:bg-zinc-800 text-white rounded-2xl font-black text-sm uppercase tracking-wide border-2 border-zinc-950 shadow-[0_4px_0_#09090b] active:translate-y-0.5 active:shadow-none transition-all cursor-pointer"
                >
                  Next Card
                </button>
              ) : (
                <button
                  onClick={() => setPhase('practice')}
                  className="px-8 py-3.5 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 rounded-2xl font-black text-sm uppercase tracking-wide border-2 border-zinc-950 shadow-[0_4px_0_#15803d] active:translate-y-0.5 active:shadow-none transition-all flex items-center gap-2 cursor-pointer"
                >
                  <span>Start Practice</span>
                  <ArrowRight className="w-4 h-4 stroke-[3]" />
                </button>
              )}
            </div>
          </div>
        ) : (
          /* Practice Exercise Phase */
          currentExercise && (
            <div className="space-y-6">
              <div className="flex items-start gap-4">
                <PandaMascot mood={gradingResult ? (gradingResult.passedGates ? 'happy' : 'thinking') : 'idle'} size={72} />
                <div className="space-y-1 flex-1">
                  <h3 className="text-base sm:text-lg font-black text-zinc-950">
                    {currentExercise.instruction}
                  </h3>
                  {currentExercise.promptPinyin && (
                    <div className="text-xs font-mono font-bold text-emerald-600">
                      {currentExercise.promptPinyin}
                    </div>
                  )}
                  <div className="flex items-center gap-3">
                    <div className="font-chinese text-2xl font-black text-zinc-900">
                      {currentExercise.prompt}
                    </div>
                    {/* Speaker button if prompt has Chinese */}
                    {/[\u4e00-\u9fa5]/.test(currentExercise.prompt) && (
                      <button
                        onClick={() => playAudio(currentExercise.prompt)}
                        className="p-1.5 rounded-full bg-emerald-100 hover:bg-emerald-200 text-emerald-800 cursor-pointer transition-colors"
                        title="Pronounce"
                      >
                        <Volume2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Interaction Modes */}
              {!gradingResult && (
                <div className="space-y-4 pt-4">
                  {/* Multiple Choice Cards */}
                  {currentExercise.options && currentExercise.options.length > 0 && currentExercise.exerciseType !== 'reorder' && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {currentExercise.options.map((opt) => {
                        const isSelected = selectedOption === opt;
                        return (
                          <button
                            key={opt}
                            id={`btn-opt-${opt}`}
                            onClick={() => setSelectedOption(opt)}
                            className={`p-4 rounded-2xl border-2 text-left font-black transition-all flex items-center justify-between cursor-pointer ${
                              isSelected
                                ? 'bg-emerald-50 border-emerald-500 text-emerald-950 shadow-[0_4px_0_#15803d] translate-y-0'
                                : 'bg-white border-zinc-200 text-zinc-900 hover:bg-zinc-50 shadow-[0_4px_0_#e4e4e7] active:translate-y-1 active:shadow-none'
                            }`}
                          >
                            <span className="font-chinese text-base">{opt}</span>
                            <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                              isSelected ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-zinc-300'
                            }`}>
                              {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* Sentence Reordering Interaction */}
                  {currentExercise.exerciseType === 'reorder' && (
                    <div className="space-y-4">
                      {/* Target Drop Zone */}
                      <div className="min-h-[72px] p-3 rounded-2xl border-2 border-dashed border-zinc-300 bg-zinc-50 flex flex-wrap gap-2 items-center">
                        {reorderTokens.length === 0 ? (
                          <span className="text-xs font-bold text-zinc-400 pl-2">
                            Tap words below in correct sentence order...
                          </span>
                        ) : (
                          reorderTokens.map((tok, idx) => (
                            <button
                              key={`${tok}-${idx}`}
                              onClick={() => handleRemoveToken(tok, idx)}
                              className="px-4 py-2.5 rounded-xl bg-zinc-950 text-white font-chinese text-base font-black border-2 border-zinc-950 shadow-[0_3px_0_#27272a] active:translate-y-0.5 cursor-pointer"
                            >
                              {tok}
                            </button>
                          ))
                        )}
                      </div>

                      {/* Available Word Bank */}
                      <div className="flex flex-wrap gap-2.5 pt-2">
                        {availableTokens.map((tok, idx) => (
                          <button
                            key={`${tok}-${idx}`}
                            onClick={() => handleAddToken(tok, idx)}
                            className="px-4 py-2.5 rounded-xl bg-white border-2 border-zinc-300 hover:border-zinc-900 font-chinese text-base font-black text-zinc-900 shadow-[0_3px_0_#d4d4d8] active:translate-y-1 active:shadow-none transition-all cursor-pointer"
                          >
                            {tok}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Free Text Input */}
                  {(!currentExercise.options || currentExercise.options.length === 0) && currentExercise.exerciseType !== 'reorder' && (
                    <div>
                      <input
                        id="duo-text-input"
                        type="text"
                        placeholder="Type answer in Chinese or English..."
                        value={textInput}
                        onChange={(e) => setTextInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSubmit();
                        }}
                        className="w-full text-lg font-chinese font-bold border-2 border-zinc-900 rounded-2xl px-4 py-3 focus:outline-none focus:ring-4 focus:ring-emerald-500/20 shadow-[0_4px_0_#18181b]"
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        )}
      </main>

      {/* Duolingo-style Bottom Drawer for Evaluation Feedback & Actions */}
      <footer
        className={`px-4 sm:px-8 py-5 border-t-2 transition-colors ${
          gradingResult
            ? gradingResult.passedGates
              ? 'bg-emerald-100 border-emerald-300 text-emerald-950'
              : 'bg-rose-100 border-rose-300 text-rose-950'
            : 'bg-white border-zinc-200'
        }`}
      >
        <div className="max-w-2xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-5">
          {gradingResult ? (
            <div className="space-y-1.5 flex-1">
              <div className="flex items-center gap-2">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center font-black ${
                  gradingResult.passedGates ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'
                }`}>
                  {gradingResult.passedGates ? <Check className="w-4 h-4 stroke-[3]" /> : <X className="w-4 h-4 stroke-[3]" />}
                </div>
                <span className={`font-black text-base ${gradingResult.passedGates ? 'text-emerald-900' : 'text-rose-900'}`}>
                  {gradingResult.passedGates ? 'Correct!' : 'Correct solution:'}
                </span>
              </div>

              {/* Target answer pronunciation if Chinese */}
              {currentExercise && (
                <div className="flex items-center gap-2 pt-0.5">
                  <span className="font-chinese text-sm font-black text-slate-900">
                    {currentExercise.acceptedAnswers?.[0] || currentExercise.prompt}
                  </span>
                  <button
                    onClick={() => playAudio(currentExercise.acceptedAnswers?.[0] || currentExercise.prompt)}
                    className="p-1 rounded-full bg-emerald-200/70 hover:bg-emerald-300 text-emerald-900 cursor-pointer"
                    title="Pronounce"
                  >
                    <Volume2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              <p className="text-xs font-semibold leading-relaxed text-slate-700 bg-white/60 p-2.5 rounded-xl border border-emerald-200/60 max-w-lg">
                <strong className="text-slate-900">Explanation: </strong>
                {gradingResult.feedback}
              </p>
            </div>
          ) : (
            <div className="hidden sm:block text-xs font-bold text-zinc-400">
              Select or construct the correct answer, then verify.
            </div>
          )}

          {/* Action Button */}
          {gradingResult ? (
            <button
              id="btn-duo-continue"
              onClick={handleNextExercise}
              className={`px-8 py-3.5 rounded-2xl font-black text-sm uppercase tracking-wide border-2 border-slate-900 transition-all shrink-0 cursor-pointer ${
                gradingResult.passedGates
                  ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-[0_4px_0_#15803d]'
                  : 'bg-rose-600 hover:bg-rose-500 text-white shadow-[0_4px_0_#9f1239]'
              } active:translate-y-1 active:shadow-none`}
            >
              Next Exercise
            </button>
          ) : (
            <button
              id="btn-duo-check"
              disabled={
                isSubmitting ||
                (currentExercise?.exerciseType === 'reorder'
                  ? reorderTokens.length === 0
                  : currentExercise?.options && currentExercise.options.length > 0
                  ? !selectedOption
                  : !textInput.trim())
              }
              onClick={handleSubmit}
              className="px-8 py-3.5 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-black text-sm uppercase tracking-wide border-2 border-zinc-950 shadow-[0_4px_0_#15803d] disabled:opacity-40 active:translate-y-1 active:shadow-none transition-all cursor-pointer"
            >
              {isSubmitting ? 'Evaluating...' : 'Check'}
            </button>
          )}
        </div>
      </footer>
    </div>
  );
};
