import React from 'react';

interface ProgressBarProps {
  value: number;
  max?: number;
  label: string;
  className?: string;
}

// The analysis panel and course directory share the existing themed ratio bar.
export const ProgressBar: React.FC<ProgressBarProps> = ({ value, max = 100, label, className = '' }) => {
  const limit = Math.max(0, max);
  const current = Math.max(0, Math.min(limit, value));
  return <div className={`winrate-track relative h-2.5 min-w-0 overflow-hidden rounded-full border ${className}`}
    role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={limit} aria-valuenow={current}>
    <div className="winrate-fill-dark absolute inset-y-[1px] left-[1px] rounded-full transition-all duration-500 ease-out"
      style={{ width: `${limit ? current / limit * 100 : 0}%` }} />
  </div>;
};
