import React, { useState } from 'react';
import { 
  X, 
  Volume2, 
  Play, 
  Check, 
  Sparkles, 
  Flame, 
  Award, 
  RotateCcw, 
  ArrowRight,
  HelpCircle,
  Ear
} from 'lucide-react';
import { PandaMascot } from './PandaMascot.tsx';
import { 
  PINYIN_INITIALS, 
  PINYIN_FINALS, 
  PINYIN_TONES, 
  TONE_SANDHI_RULES, 
  playMandarinAudio,
  PinyinPhonemeItem
} from '../utils/pinyinAudio.ts';
import { audioFeedback } from '../utils/audioFeedback.ts';

interface PinyinLessonModalProps {
  conceptId: string;
  onClose: () => void;
  onComplete: (score: number) => void;
}

export const PinyinLessonModal: React.FC<PinyinLessonModalProps> = ({
  conceptId,
  onClose,
  onComplete,
}) => {
  // Determine mode based on conceptId
  // hsk1_p01: Initials & Finals
  // hsk1_p02: 4 Tones
  // hsk1_p03: Sandhi & Compound Finals
  // hsk1_p04: High-frequency greetings pronunciation
  const [activeTab, setActiveTab] = useState<'learn' | 'practice'>('learn');
  const [selectedItemIndex, setSelectedItemIndex] = useState(0);
  const [audioSpeed, setAudioSpeed] = useState<'normal' | 'slow'>('normal');

  // Practice state
  const [practiceQuestionIndex, setPracticeQuestionIndex] = useState(0);
  const [selectedPracticeOption, setSelectedPracticeOption] = useState<string | null>(null);
  const [practiceFeedback, setPracticeFeedback] = useState<{ isCorrect: boolean; explanation: string } | null>(null);
  const [practiceCorrectCount, setPracticeCorrectCount] = useState(0);
  const [isFinished, setIsFinished] = useState(false);

  // Define Pinyin lesson data based on concept
  const isTonesLesson = conceptId === 'hsk1_p02';
  const isSandhiLesson = conceptId === 'hsk1_p03';
  const isInitialsLesson = conceptId === 'hsk1_p01';
  const isGreetingLesson = conceptId === 'hsk1_p04';

  const toneItems = PINYIN_TONES;
  const initialItems = PINYIN_INITIALS.slice(0, 10);
  const sandhiItems = TONE_SANDHI_RULES;

  // Sound playback helpers
  const handlePlayTone = (toneMark: string, iconChar: string, slow = false) => {
    const rate = slow ? 0.65 : 0.88;
    playMandarinAudio(`${iconChar}，${toneMark}`, { rate });
  };

  const handlePlayPhoneme = (item: PinyinPhonemeItem, slow = false) => {
    const rate = slow ? 0.65 : 0.88;
    playMandarinAudio(item.audioSpeechText, { rate });
  };

  const handlePlaySentence = (text: string, slow = false) => {
    const rate = slow ? 0.65 : 0.9;
    playMandarinAudio(text, { rate });
  };

  // Dynamic practice questions per concept
  interface PracticeQ {
    id: string;
    promptZh: string;
    audioTarget: string;
    question: string;
    options: string[];
    correctAnswer: string;
    explanation: string;
  }

  const practiceQuestions: PracticeQ[] = isTonesLesson
    ? [
        {
          id: 'q_tone_1',
          promptZh: 'mā',
          audioTarget: '妈，第一声',
          question: '听发音，这是第几声？(mā)',
          options: ['第一声 (High Flat —)', '第二声 (Rising /)', '第三声 (Dipping ˇ)', '第四声 (Falling \\)'],
          correctAnswer: '第一声 (High Flat —)',
          explanation: '“mā” 是第一声，音高保持在最高的5度（55调值），平稳悠长。',
        },
        {
          id: 'q_tone_2',
          promptZh: 'chá (茶)',
          audioTarget: '茶，第二声',
          question: '“茶” (chá) 的声调曲线是怎样的？',
          options: ['从中间升到最高 (35 阳平)', '从高往下摔 (51 去声)', '平直不拐弯 (55 阴平)', '先低后高 (214 上声)'],
          correctAnswer: '从中间升到最高 (35 阳平)',
          explanation: '“茶”是第二声（阳平），调值35，像惊讶地问“真的吗？”一样向上扬！',
        },
        {
          id: 'q_tone_3',
          promptZh: 'hǎo (好)',
          audioTarget: '好，第三声',
          question: '第三声 (如“好 hǎo”) 在单独念时的关键是什么？',
          options: ['低沉下去到最低点再微升', '像命令一样快速摔下', '声音越高越好', '完全没有音调变化'],
          correctAnswer: '低沉下去到最低点再微升',
          explanation: '第三声（上声，调值214）精髓在“沉到底”，把声音压到最低谷。',
        },
        {
          id: 'q_tone_4',
          promptZh: 'xièxie (谢谢)',
          audioTarget: '谢谢，第四声加轻声',
          question: '“谢谢”的第二个“谢”应该怎么念？',
          options: ['轻声 (又轻又短)', '重读第四声', '变成第二声', '变成第一声拉长'],
          correctAnswer: '轻声 (又轻又短)',
          explanation: '在日常口语叠词中（如妈妈、谢谢），第二个字自然弱化读作“轻声”。',
        },
      ]
    : isSandhiLesson
    ? [
        {
          id: 'q_sandhi_1',
          promptZh: '你好 (nǐ hǎo)',
          audioTarget: '你好，拼写是三声，实际念二声加三声',
          question: '两个第三声连读时（如“你好”），前一个字应该怎么变调？',
          options: ['变成第二声 (ní hǎo)', '变成第四声 (nì hǎo)', '变成第一声 (nī hǎo)', '不变调保持原样'],
          correctAnswer: '变成第二声 (ní hǎo)',
          explanation: '这是30年教学中最重要的变调法则：3声 + 3声 → 2声 + 3声！所以“你好”口语念“ní hǎo”。',
        },
        {
          id: 'q_sandhi_2',
          promptZh: '不是 (bù shì)',
          audioTarget: '不是，不变成第二声：bú shì',
          question: '“不”字在第四声字（如“是 shì”）前面，读作什么调？',
          options: ['第二声 (bú shì)', '第四声 (bù shì)', '第一声 (bū shì)', '轻声 (bu shi)'],
          correctAnswer: '第二声 (bú shì)',
          explanation: '“不”遇四声变二声！当后面跟着另一个四声字时，为了顺口必须念“bú shì”。',
        },
        {
          id: 'q_sandhi_3',
          promptZh: '不喝 (bù hē)',
          audioTarget: '不喝，后面是一声，保持第四声',
          question: '如果“不”后面是第一声（如“不喝 bù hē”），“不”变调吗？',
          options: ['不变，保持第四声 (bù hē)', '变成第二声 (bú hē)', '变成第三声 (bǔ hē)', '变成轻声'],
          correctAnswer: '不变，保持第四声 (bù hē)',
          explanation: '“不”只有在第四声字前才变成第二声；在第一、二、三声前一律保持本调第四声（bù）。',
        },
      ]
    : [
        {
          id: 'q_init_1',
          promptZh: 'b vs p',
          audioTarget: '坡，送气的坡；玻，不送气的玻',
          question: '声母“b”和“p”最核心的区别是什么？',
          options: ['p是强送气，b是不送气', 'b发音更靠后', 'p是鼻音从鼻子出气', '两者发音完全相同'],
          correctAnswer: 'p是强送气，b是不送气',
          explanation: '在嘴前放一张纸巾：发“p”时纸巾会被气流吹飞，发“b”时纸巾几乎不动。',
        },
        {
          id: 'q_init_2',
          promptZh: 'z/c/s vs zh/ch/sh',
          audioTarget: '四，平舌音；十，翘舌音',
          question: '发“zh, ch, sh”翘舌音时，舌头的位置是？',
          options: ['舌尖向上翘起接触硬腭前部', '舌尖抵住下齿背', '嘴唇向前嘟圆', '舌头放平完全不动'],
          correctAnswer: '舌尖向上翘起接触硬腭前部',
          explanation: 'zh/ch/sh是舌尖后音（翘舌音），舌头必须自然向上翘起；而z/c/s是平舌音。',
        },
      ];

  const currentQ = practiceQuestions[practiceQuestionIndex];

  // Submit practice choice
  const handleSelectPracticeOption = (option: string) => {
    if (practiceFeedback) return;
    setSelectedPracticeOption(option);
    const isCorrect = option === currentQ.correctAnswer;
    if (isCorrect) {
      audioFeedback.playSuccessSound();
      setPracticeCorrectCount((prev) => prev + 1);
    } else {
      audioFeedback.playFailureSound();
    }
    setPracticeFeedback({
      isCorrect,
      explanation: currentQ.explanation,
    });
  };

  const handleNextPracticeQuestion = () => {
    setSelectedPracticeOption(null);
    setPracticeFeedback(null);
    if (practiceQuestionIndex + 1 < practiceQuestions.length) {
      setPracticeQuestionIndex((prev) => prev + 1);
    } else {
      setIsFinished(true);
    }
  };

  const handleFinishLesson = () => {
    const score = Math.max(0.8, practiceCorrectCount / practiceQuestions.length);
    onComplete(score);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/60 backdrop-blur-xs p-3 sm:p-4 select-none animate-in fade-in">
      <div className="bg-white w-full max-w-2xl rounded-3xl border-2 border-zinc-950 shadow-2xl flex flex-col max-h-[92vh] overflow-hidden animate-in zoom-in-95">
        {/* Header */}
        <div className="px-5 py-4 border-b-2 border-zinc-100 flex items-center justify-between bg-zinc-50/80">
          <div className="flex items-center gap-3">
            <PandaMascot mood="studying" size={44} />
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-wider bg-sky-100 text-sky-800 px-2 py-0.5 rounded-full border border-sky-200">
                  Module 1 · 拼音发音示范库
                </span>
                <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                  30年教学示范
                </span>
              </div>
              <h3 className="text-base sm:text-lg font-black text-zinc-950">
                {isTonesLesson
                  ? '汉语四声声调与轻声 (The 4 Tones & Neutral)'
                  : isSandhiLesson
                  ? '核心变调与连读规则 (Tone Sandhi Rules)'
                  : '声母与韵母纯正发音 (Initials & Finals)'}
              </h3>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-zinc-400 hover:text-zinc-900 rounded-2xl hover:bg-zinc-200/60 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab switcher: Learn (示范库) vs Practice (实战测验) */}
        <div className="px-5 pt-3 pb-2 border-b border-zinc-200 bg-white flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('learn')}
              className={`px-4 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
                activeTab === 'learn'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-zinc-600 hover:bg-zinc-100'
              }`}
            >
              📚 发音教学与真人示范
            </button>
            <button
              onClick={() => setActiveTab('practice')}
              className={`px-4 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
                activeTab === 'practice'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-zinc-600 hover:bg-zinc-100'
              }`}
            >
              🎯 听音互动实战练习 ({practiceQuestions.length} 题)
            </button>
          </div>

          {/* Speed Toggle */}
          <div className="hidden sm:flex items-center gap-1.5 text-xs font-bold text-zinc-500">
            <span>示范语速:</span>
            <button
              onClick={() => setAudioSpeed('normal')}
              className={`px-2 py-0.5 rounded-lg text-[11px] ${
                audioSpeed === 'normal'
                  ? 'bg-zinc-900 text-white font-black'
                  : 'bg-zinc-100 text-zinc-600'
              }`}
            >
              标准 0.9x
            </button>
            <button
              onClick={() => setAudioSpeed('slow')}
              className={`px-2 py-0.5 rounded-lg text-[11px] ${
                audioSpeed === 'slow'
                  ? 'bg-zinc-900 text-white font-black'
                  : 'bg-zinc-100 text-zinc-600'
              }`}
            >
              慢速 0.6x
            </button>
          </div>
        </div>

        {/* Body Container */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {activeTab === 'learn' ? (
            /* ========================================================= */
            /* TAB 1: LEARN (示范与口型秘诀)                            */
            /* ========================================================= */
            <div className="space-y-6">
              {isTonesLesson ? (
                /* FOUR TONES INTERACTIVE LAB */
                <div className="space-y-5">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {toneItems.map((item, idx) => {
                      const isSelected = selectedItemIndex === idx;
                      return (
                        <button
                          key={item.toneIndex}
                          onClick={() => {
                            setSelectedItemIndex(idx);
                            handlePlayTone(item.toneMark, item.iconChar, audioSpeed === 'slow');
                          }}
                          style={{
                            borderColor: isSelected ? item.color : '#e2e8f0',
                            backgroundColor: isSelected ? `${item.color}15` : '#ffffff',
                          }}
                          className={`p-3.5 rounded-2xl border-2 text-center transition-all cursor-pointer flex flex-col items-center gap-1.5 hover:scale-102 ${
                            isSelected ? 'shadow-md ring-2 ring-emerald-500/20' : 'hover:border-zinc-300'
                          }`}
                        >
                          <span className="text-[11px] font-black text-zinc-500">
                            第 {item.toneIndex} 声
                          </span>
                          <span className="text-2xl font-black text-zinc-950 font-chinese">
                            {item.toneMark}
                          </span>
                          <span
                            style={{ color: item.color }}
                            className="text-xs font-black"
                          >
                            {item.pitchName} ({item.pitchValue})
                          </span>
                          <div className="mt-1 w-7 h-7 rounded-full bg-zinc-100 flex items-center justify-center text-zinc-700">
                            <Volume2 className="w-3.5 h-3.5" />
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  {/* Detailed inspector for selected Tone */}
                  {toneItems[selectedItemIndex] && (
                    <div className="p-5 rounded-3xl bg-zinc-50 border-2 border-zinc-200 space-y-4 animate-in fade-in">
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="text-xs font-black text-emerald-700 uppercase tracking-wider">
                            音调透视 · Pitch Contour
                          </div>
                          <h4 className="text-lg font-black text-zinc-900 mt-0.5">
                            {toneItems[selectedItemIndex].toneNameZh}
                          </h4>
                          <p className="text-xs font-semibold text-zinc-600">
                            {toneItems[selectedItemIndex].audioGuideEn}
                          </p>
                        </div>

                        {/* Pronounce Demo Button */}
                        <button
                          onClick={() =>
                            handlePlayTone(
                              toneItems[selectedItemIndex].toneMark,
                              toneItems[selectedItemIndex].iconChar,
                              audioSpeed === 'slow'
                            )
                          }
                          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs rounded-xl shadow-xs flex items-center gap-2 cursor-pointer transition-all active:scale-95"
                        >
                          <Volume2 className="w-4 h-4" />
                          <span>播放示范音</span>
                        </button>
                      </div>

                      {/* 30-Year Expert Tip Box */}
                      <div className="p-4 rounded-2xl bg-amber-50/80 border border-amber-200 text-xs text-amber-950 leading-relaxed flex items-start gap-3">
                        <div className="text-base shrink-0">💡</div>
                        <div>
                          <span className="font-black text-amber-900">
                            宝宝老师 30年经验秘诀：
                          </span>{' '}
                          {toneItems[selectedItemIndex].teacherTipZh}
                        </div>
                      </div>

                      {/* Contrast Pairs Audio */}
                      <div className="space-y-1.5">
                        <div className="text-[11px] font-black text-zinc-500 uppercase tracking-wider">
                          常用对比词示范 (点击发音)：
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {toneItems[selectedItemIndex].contrastPairs.map((pair, pIdx) => (
                            <button
                              key={pIdx}
                              onClick={() => handlePlaySentence(pair, audioSpeed === 'slow')}
                              className="px-3 py-1.5 bg-white rounded-xl border border-zinc-200 text-xs font-black text-zinc-800 hover:border-emerald-500 hover:bg-emerald-50 transition-all flex items-center gap-1.5 cursor-pointer"
                            >
                              <Volume2 className="w-3.5 h-3.5 text-emerald-600" />
                              <span>{pair}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ) : isSandhiLesson ? (
                /* TONE SANDHI LAB */
                <div className="space-y-4">
                  {sandhiItems.map((sandhi) => (
                    <div
                      key={sandhi.id}
                      className="p-4 sm:p-5 rounded-3xl bg-zinc-50 border-2 border-zinc-200 space-y-3"
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <span className="text-[10px] font-black uppercase tracking-wider bg-purple-100 text-purple-800 px-2.5 py-0.5 rounded-md border border-purple-200">
                            {sandhi.ruleFormula}
                          </span>
                          <h4 className="text-base font-black text-zinc-950 mt-1">
                            {sandhi.titleZh}
                          </h4>
                          <p className="text-xs text-zinc-500">{sandhi.explanationEn}</p>
                        </div>

                        <button
                          onClick={() => handlePlaySentence(sandhi.audioText, audioSpeed === 'slow')}
                          className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs rounded-xl shadow-xs flex items-center gap-1.5 cursor-pointer transition-all active:scale-95"
                        >
                          <Volume2 className="w-4 h-4" />
                          <span>听对比</span>
                        </button>
                      </div>

                      {/* Examples Comparison Grid */}
                      <div className="grid grid-cols-2 gap-3 p-3 bg-white rounded-2xl border border-zinc-200">
                        <div>
                          <div className="text-[10px] font-bold text-zinc-400">词典规范拼写:</div>
                          <div className="text-sm font-black text-zinc-700 font-mono">
                            {sandhi.writtenPinyin}
                          </div>
                        </div>
                        <div>
                          <div className="text-[10px] font-bold text-emerald-600">口语实际发音:</div>
                          <div className="text-sm font-black text-emerald-700 font-mono">
                            {sandhi.actualPinyin} ({sandhi.exampleZh})
                          </div>
                        </div>
                      </div>

                      <p className="text-xs text-zinc-700 leading-relaxed">
                        {sandhi.explanationZh}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                /* INITIALS & FINALS LAB */
                <div className="space-y-4">
                  <div className="grid grid-cols-3 sm:grid-cols-5 gap-2.5">
                    {initialItems.map((item, idx) => {
                      const isSelected = selectedItemIndex === idx;
                      return (
                        <button
                          key={item.id}
                          onClick={() => {
                            setSelectedItemIndex(idx);
                            handlePlayPhoneme(item, audioSpeed === 'slow');
                          }}
                          className={`p-3 rounded-2xl border-2 text-center transition-all cursor-pointer flex flex-col items-center gap-1 hover:scale-102 ${
                            isSelected
                              ? 'border-emerald-600 bg-emerald-50/80 shadow-md ring-2 ring-emerald-500/20'
                              : 'border-zinc-200 bg-white hover:border-zinc-300'
                          }`}
                        >
                          <span className="text-2xl font-black text-zinc-950 font-mono">
                            {item.symbol}
                          </span>
                          <span className="text-[11px] font-bold text-zinc-500">
                            {item.pinyin}
                          </span>
                          <div className="w-6 h-6 rounded-full bg-zinc-100 flex items-center justify-center text-zinc-600 mt-0.5">
                            <Volume2 className="w-3 h-3" />
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  {/* Selected Initial Inspector */}
                  {initialItems[selectedItemIndex] && (
                    <div className="p-5 rounded-3xl bg-zinc-50 border-2 border-zinc-200 space-y-4 animate-in fade-in">
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="text-xs font-black text-emerald-700 uppercase tracking-wider">
                            声母口型透析
                          </div>
                          <h4 className="text-xl font-black text-zinc-900 mt-0.5 flex items-center gap-2">
                            <span>{initialItems[selectedItemIndex].symbol}</span>
                            <span className="text-xs font-normal text-zinc-500 font-sans">
                              {initialItems[selectedItemIndex].nameZh}
                            </span>
                          </h4>
                          <p className="text-xs text-zinc-600">
                            {initialItems[selectedItemIndex].audioGuideEn}
                          </p>
                        </div>

                        <button
                          onClick={() =>
                            handlePlayPhoneme(
                              initialItems[selectedItemIndex],
                              audioSpeed === 'slow'
                            )
                          }
                          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs rounded-xl shadow-xs flex items-center gap-2 cursor-pointer transition-all active:scale-95"
                        >
                          <Volume2 className="w-4 h-4" />
                          <span>示范发音</span>
                        </button>
                      </div>

                      <div className="p-4 rounded-2xl bg-white border border-zinc-200 space-y-2 text-xs">
                        <div className="font-black text-zinc-800">🗣️ 发音口型秘诀：</div>
                        <p className="text-zinc-600 leading-relaxed">
                          {initialItems[selectedItemIndex].mouthGuideZh}
                        </p>
                        <div className="pt-2 border-t border-zinc-100 flex items-center gap-2">
                          <span className="text-zinc-400">代表字示例:</span>
                          <span className="font-bold text-zinc-900 font-chinese">
                            {initialItems[selectedItemIndex].anchorWord}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            /* ========================================================= */
            /* TAB 2: PRACTICE (实战互动测验)                            */
            /* ========================================================= */
            <div className="space-y-6">
              {!isFinished ? (
                <div className="space-y-5">
                  {/* Progress Indicator */}
                  <div className="flex items-center justify-between text-xs font-bold text-zinc-400">
                    <span>
                      第 {practiceQuestionIndex + 1} / {practiceQuestions.length} 题
                    </span>
                    <span className="text-emerald-700">
                      已答对: {practiceCorrectCount}
                    </span>
                  </div>

                  <div className="w-full h-2 rounded-full bg-zinc-100 overflow-hidden">
                    <div
                      style={{
                        width: `${((practiceQuestionIndex + 1) / practiceQuestions.length) * 100}%`,
                      }}
                      className="h-full bg-emerald-500 transition-all duration-300"
                    />
                  </div>

                  {/* Question Prompt */}
                  <div className="p-5 rounded-3xl bg-zinc-50 border-2 border-zinc-200 text-center space-y-3">
                    <button
                      onClick={() =>
                        handlePlaySentence(currentQ.audioTarget, audioSpeed === 'slow')
                      }
                      className="w-16 h-16 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white mx-auto flex items-center justify-center shadow-lg transition-transform hover:scale-105 active:scale-95 cursor-pointer"
                      title="点击听标准真人发音"
                    >
                      <Volume2 className="w-8 h-8" />
                    </button>
                    <div className="text-xs font-black uppercase text-emerald-700 tracking-wider">
                      点击小喇叭听发音
                    </div>
                    <h4 className="text-lg font-black text-zinc-900">
                      {currentQ.question}
                    </h4>
                  </div>

                  {/* Options */}
                  <div className="space-y-2.5">
                    {currentQ.options.map((opt, oIdx) => {
                      const isSelected = selectedPracticeOption === opt;
                      const isCorrect = opt === currentQ.correctAnswer;
                      let btnStyle = 'bg-white border-zinc-200 hover:border-emerald-400 text-zinc-800';

                      if (practiceFeedback) {
                        if (isCorrect) {
                          btnStyle = 'bg-emerald-100 border-emerald-500 text-emerald-950 font-black';
                        } else if (isSelected && !isCorrect) {
                          btnStyle = 'bg-rose-100 border-rose-500 text-rose-950';
                        } else {
                          btnStyle = 'opacity-40 bg-zinc-50 border-zinc-200 text-zinc-400';
                        }
                      }

                      return (
                        <button
                          key={oIdx}
                          disabled={!!practiceFeedback}
                          onClick={() => handleSelectPracticeOption(opt)}
                          className={`w-full p-4 rounded-2xl border-2 text-left text-sm font-bold transition-all cursor-pointer flex items-center justify-between ${btnStyle}`}
                        >
                          <span>{opt}</span>
                          {practiceFeedback && isCorrect && (
                            <Check className="w-5 h-5 text-emerald-600 shrink-0" />
                          )}
                        </button>
                      );
                    })}
                  </div>

                  {/* Feedback Box & Next Button */}
                  {practiceFeedback && (
                    <div
                      className={`p-4 rounded-2xl border-2 animate-in fade-in space-y-3 ${
                        practiceFeedback.isCorrect
                          ? 'bg-emerald-50 border-emerald-300 text-emerald-950'
                          : 'bg-rose-50 border-rose-300 text-rose-950'
                      }`}
                    >
                      <div className="flex items-center gap-2 font-black text-sm">
                        <span>{practiceFeedback.isCorrect ? '🎉 答对啦！' : '💡 别灰心，老师教你记忆法：'}</span>
                      </div>
                      <p className="text-xs leading-relaxed">
                        {practiceFeedback.explanation}
                      </p>
                      <button
                        onClick={handleNextPracticeQuestion}
                        className="w-full py-3 bg-zinc-950 hover:bg-zinc-800 text-white font-black text-xs rounded-xl flex items-center justify-center gap-2 cursor-pointer"
                      >
                        <span>继续下一题</span>
                        <ArrowRight className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                /* FINISHED CELEBRATION */
                <div className="text-center py-6 space-y-5 animate-in zoom-in-95">
                  <div className="w-20 h-20 rounded-full bg-emerald-100 border-2 border-emerald-400 mx-auto flex items-center justify-center text-emerald-600">
                    <Award className="w-10 h-10" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-2xl font-black text-zinc-950">
                      太棒了！拼音打卡完成！
                    </h3>
                    <p className="text-xs text-zinc-500 font-medium">
                      准确率: {Math.round((practiceCorrectCount / practiceQuestions.length) * 100)}% · 已为你点亮此关卡！
                    </p>
                  </div>

                  <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-xs text-amber-900 max-w-md mx-auto">
                    <span className="font-black">宝宝老师点评：</span>
                    “发音是中文的地基，地基打稳了，后面的词汇和句子自然流利自如！继续保持这股冲劲～”
                  </div>

                  <button
                    onClick={handleFinishLesson}
                    className="w-full max-w-xs py-3.5 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-sm rounded-2xl shadow-[0_4px_0_#065f46] active:translate-y-1 active:shadow-none transition-all cursor-pointer mx-auto block"
                  >
                    完成并点亮路线 (Save Progress)
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer info */}
        <div className="px-5 py-3 border-t border-zinc-100 bg-zinc-50 flex items-center justify-between text-xs text-zinc-400">
          <span>HSK 1 Standardized Phonetics Engine</span>
          <span className="font-bold text-zinc-600">GoalCoach • 对外汉语专业标准</span>
        </div>
      </div>
    </div>
  );
};
