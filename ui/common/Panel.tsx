import React from 'react';

interface PanelProps extends React.HTMLAttributes<HTMLDivElement> {
  appearance?: 'plain' | 'retro';
}

// Shared frame for board-side information and course cards.
export const Panel: React.FC<PanelProps> = ({ appearance = 'plain', className = '', ...props }) => (
  <div className={`rounded-2xl ${appearance === 'retro' ? 'panel-retro' : 'border-2 border-[#e3c086] bg-[#fcf6ea] text-[#5c4033]'} ${className}`} {...props} />
);
