import React from 'react';
import { Bot, Mic, Sparkles } from 'lucide-react';
import { useApp } from '../../context/AppContext';

export const FloatingAiTutorButton: React.FC = () => {
  const { isAiModalOpen, setIsAiModalOpen, activeQuiz, activeNote, activePremiumNote } = useApp();

  // Strictly hide floating action button while AI chat modal is active, during an active exam, or in reader mode
  // This completely eliminates button collision with quiz questions, answer options, and Next/Finish buttons.
  if (isAiModalOpen || activeQuiz || activeNote || activePremiumNote) {
    return null;
  }

  return (
    <aside 
      aria-label="Floating AI Tutor Action"
      className="fixed bottom-20 right-3 sm:bottom-6 sm:right-6 z-30 flex items-center select-none"
    >
      <button
        type="button"
        id="floating-ai-tutor-fab"
        onClick={() => setIsAiModalOpen(true)}
        aria-label="AI Tutor Chat & Voice Assistant खोल्नुहोस्"
        title="AI Tutor - बोलेर वा लेखेर प्रश्न सोध्नुहोस्"
        className="relative group flex items-center gap-1.5 sm:gap-2 px-3 py-2 sm:pl-3.5 sm:pr-4.5 sm:py-3 rounded-full bg-gradient-to-r from-amber-500 via-orange-500 to-emerald-600 text-white shadow-xl hover:shadow-2xl hover:shadow-orange-500/30 hover:scale-105 active:scale-95 transition-all duration-200 border-2 border-white/60 dark:border-slate-800 cursor-pointer"
      >
        {/* Subtle breathing glow ring */}
        <span className="absolute -inset-1 rounded-full bg-gradient-to-r from-amber-500 via-orange-500 to-emerald-600 opacity-40 group-hover:opacity-75 blur-sm transition duration-500 animate-pulse" />

        {/* Bot Icon with active mic dot */}
        <div className="relative w-6 h-6 sm:w-8 sm:h-8 rounded-full bg-white/20 backdrop-blur-xs flex items-center justify-center shrink-0">
          <Bot className="w-3.5 h-3.5 sm:w-5 sm:h-5 text-white" />
          <span className="absolute -top-0.5 -right-0.5 w-2 h-2 sm:w-2.5 sm:h-2.5 bg-emerald-400 border-2 border-[#0B2046] rounded-full animate-ping" />
          <span className="absolute -top-0.5 -right-0.5 w-2 h-2 sm:w-2.5 sm:h-2.5 bg-emerald-400 border-2 border-[#0B2046] rounded-full" />
        </div>

        {/* Text Details */}
        <div className="flex flex-col items-start leading-none relative">
          <div className="flex items-center gap-1">
            <span className="text-xs sm:text-sm font-black tracking-tight text-white drop-shadow-xs">
              AI Tutor
            </span>
            <Sparkles className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-amber-200 animate-spin-slow" />
          </div>
          <span className="hidden xs:inline-flex text-[9px] text-amber-100/90 font-bold mt-0.5 items-center gap-0.5">
            <Mic className="w-2.5 h-2.5 inline" /> बोलेर सोध्नुहोस्
          </span>
        </div>
      </button>
    </aside>
  );
};
