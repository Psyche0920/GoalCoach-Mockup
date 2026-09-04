import React, { useState, useRef, useEffect } from 'react';
import { X, Send, Sparkles } from 'lucide-react';
import { PandaMascot } from './PandaMascot.tsx';

interface ModernChatDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  context?: any;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export const ModernChatDrawer: React.FC<ModernChatDrawerProps> = ({
  isOpen,
  onClose,
  context,
}) => {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content:
        '你好！I am Coach Bǎobao (宝包), your HSK 1 learning coach. I can help clarify grammar structures (like 是...的, 吗, 呢), pinyin tone rules, vocabulary contexts, and review recommendations. What would you like to explore today?',
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  if (!isOpen) return null;

  const handleSend = async (userText?: string) => {
    const textToSend = userText || input;
    if (!textToSend.trim() || isLoading) return;

    const newMessages: Message[] = [...messages, { role: 'user', content: textToSend }];
    setMessages(newMessages);
    setInput('');
    setIsLoading(true);

    try {
      const res = await fetch('/api/v1/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newMessages, context }),
      });

      if (res.ok) {
        const data = await res.json();
        setMessages([...newMessages, { role: 'assistant', content: data.reply }]);
      } else {
        setMessages([
          ...newMessages,
          {
            role: 'assistant',
            content: 'Sorry, I am reviewing notes right now! Please ask again in a moment.',
          },
        ]);
      }
    } catch (err) {
      setMessages([
        ...newMessages,
        {
          role: 'assistant',
          content: 'Network disconnect. Please check connection.',
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const quickPrompts = [
    'How do I use 吗 for questions?',
    'Why can I not say "我不有"?',
    'When should I use 很 before adjectives?',
  ];

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-zinc-950/50 backdrop-blur-xs select-none">
      <div className="bg-white w-full max-w-md h-full shadow-2xl flex flex-col border-l-2 border-zinc-950">
        {/* Header with Mascot */}
        <div className="px-5 py-4 border-b-2 border-zinc-200 bg-zinc-950 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <PandaMascot mood="cheering" size={44} />
            <div>
              <div className="text-base font-black flex items-center gap-1.5 text-white">
                Coach Bǎobao (宝包)
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              </div>
              <div className="text-[11px] font-bold uppercase tracking-wider text-emerald-400">
                HSK 1 Pedagogical AI Coach
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-zinc-400 hover:text-white rounded-xl transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Message Log */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-zinc-50">
          {messages.map((m, idx) => (
            <div
              key={idx}
              className={`flex items-start gap-2.5 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}
            >
              {m.role === 'assistant' && (
                <PandaMascot mood="idle" size={36} className="shrink-0 mt-0.5" />
              )}
              <div
                className={`p-3.5 rounded-2xl text-xs font-bold leading-relaxed max-w-[85%] border-2 ${
                  m.role === 'user'
                    ? 'bg-zinc-950 text-white border-zinc-950 rounded-tr-none shadow-[2px_2px_0_#3f3f46]'
                    : 'bg-white text-zinc-900 border-zinc-200 rounded-tl-none shadow-[2px_2px_0_#e4e4e7] whitespace-pre-wrap'
                }`}
              >
                {m.content}
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="flex items-start gap-2.5">
              <PandaMascot mood="thinking" size={36} className="shrink-0" />
              <div className="p-3 bg-white border-2 border-zinc-200 rounded-2xl rounded-tl-none flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-bounce" />
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-bounce [animation-delay:0.2s]" />
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-bounce [animation-delay:0.4s]" />
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Quick Prompts */}
        <div className="p-3 border-t-2 border-zinc-200 bg-white">
          <div className="flex flex-wrap gap-1.5">
            {quickPrompts.map((p) => (
              <button
                key={p}
                onClick={() => handleSend(p)}
                className="text-[11px] font-bold px-2.5 py-1 rounded-xl bg-zinc-100 hover:bg-emerald-50 text-zinc-700 hover:text-emerald-800 border border-zinc-200 transition-colors cursor-pointer"
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        {/* Input */}
        <div className="p-3 border-t-2 border-zinc-200 bg-white">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            className="flex items-center gap-2"
          >
            <input
              id="coach-drawer-input"
              type="text"
              placeholder="Ask Bao Bao about Chinese..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              className="flex-1 text-xs font-bold border-2 border-zinc-200 rounded-xl px-3.5 py-2.5 focus:outline-none focus:border-zinc-900"
            />
            <button
              type="submit"
              disabled={!input.trim() || isLoading}
              className="p-2.5 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-black rounded-xl border-2 border-zinc-950 shadow-[0_2px_0_#15803d] disabled:opacity-40 transition-all active:translate-y-0.5 active:shadow-none cursor-pointer"
            >
              <Send className="w-4 h-4 stroke-[2.5]" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
