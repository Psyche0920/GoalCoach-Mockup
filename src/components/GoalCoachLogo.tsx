import React from 'react';

interface GoalCoachLogoProps {
  size?: 'sm' | 'md' | 'lg';
  showSubtitle?: boolean;
  className?: string;
}

export const GoalCoachLogo: React.FC<GoalCoachLogoProps> = ({
  size = 'md',
  showSubtitle = false,
  className = '',
}) => {
  const iconSizes = {
    sm: 'w-7 h-7',
    md: 'w-9 h-9',
    lg: 'w-11 h-11',
  };

  const textSizes = {
    sm: 'text-base',
    md: 'text-xl',
    lg: 'text-2xl',
  };

  return (
    <div className={`inline-flex items-center gap-2.5 select-none ${className}`}>
      {/* Official Panda Mascot Brand Icon */}
      <div className={`${iconSizes[size]} shrink-0 relative transition-transform hover:scale-105`}>
        <svg
          viewBox="0 0 48 48"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="w-full h-full drop-shadow-[0_2px_4px_rgba(0,0,0,0.1)]"
        >
          {/* Panda Left Ear */}
          <circle cx="12" cy="12" r="7" fill="#1e293b" />
          <circle cx="12" cy="12" r="4.5" fill="#0f172a" />
          {/* Panda Right Ear */}
          <circle cx="36" cy="12" r="7" fill="#1e293b" />
          <circle cx="36" cy="12" r="4.5" fill="#0f172a" />

          {/* Cute Little Bamboo Sprout on head */}
          <path
            d="M24 13C24 9 20 6 18 6C18 6 19 11 23 12Z"
            fill="#16a34a"
          />
          <path
            d="M24 13C24 9 28 6 30 6C30 6 29 11 25 12Z"
            fill="#22c55e"
          />

          {/* Head Base */}
          <ellipse cx="24" cy="26" rx="17" ry="15" fill="#ffffff" stroke="#0f172a" strokeWidth="2.5" />

          {/* Eye Patches */}
          <ellipse cx="17" cy="24" rx="4.5" ry="5.5" transform="rotate(-15 17 24)" fill="#1e293b" />
          <ellipse cx="31" cy="24" rx="4.5" ry="5.5" transform="rotate(15 31 24)" fill="#1e293b" />

          {/* Sparkly Pupils */}
          <circle cx="17.5" cy="23.5" r="1.8" fill="#ffffff" />
          <circle cx="16.5" cy="25.5" r="0.8" fill="#ffffff" />
          <circle cx="30.5" cy="23.5" r="1.8" fill="#ffffff" />
          <circle cx="31.5" cy="25.5" r="0.8" fill="#ffffff" />

          {/* Pink Cheeks */}
          <ellipse cx="12" cy="28" rx="2.5" ry="1.5" fill="#fbcfe8" />
          <ellipse cx="36" cy="28" rx="2.5" ry="1.5" fill="#fbcfe8" />

          {/* Nose & Smile */}
          <ellipse cx="24" cy="28.5" rx="2.5" ry="1.8" fill="#0f172a" />
          <path
            d="M21 31C22.5 33 25.5 33 27 31"
            stroke="#0f172a"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </div>

      <div className="flex flex-col">
        <div className={`font-black tracking-tight text-slate-900 ${textSizes[size]} leading-none flex items-center`}>
          Goal<span className="text-emerald-600">Coach</span>
        </div>
        {showSubtitle && (
          <span className="text-[10px] font-bold text-slate-400 tracking-normal mt-0.5">
            Learn Smarter. Chinese for Your Goals.
          </span>
        )}
      </div>
    </div>
  );
};
