import React from 'react';

interface FaceProps {
  x: number;
  y: number;
  size: number;
  color: string;
  mood: 'happy' | 'neutral' | 'worried' | 'dead';
  lookOffset?: { x: number, y: number };
}

export const StoneFace: React.FC<FaceProps> = ({ x, y, size, color, mood, lookOffset }) => {
  const cx = x + size / 2;
  const cy = y + size / 2;
  const scale = size * 0.55; 

  // Calculate rotation angle based on lookOffset vector
  // Default face is upright (top at -y).
  // Math.atan2(y, x) gives angle from X-axis (Right).
  // (0, -1) [Up] -> -90 deg. We want 0 deg rotation. -> +90
  // (1, 0) [Right] -> 0 deg. We want 90 deg rotation. -> +90
  // (0, 1) [Down] -> 90 deg. We want 180 deg rotation. -> +90
  let rotation = 0;
  if (lookOffset && (lookOffset.x !== 0 || lookOffset.y !== 0)) {
      rotation = (Math.atan2(lookOffset.y, lookOffset.x) * 180 / Math.PI) + 90;
  }

  const featureColor = color; 

  const getFaceContent = () => {
    switch (mood) {
      case 'dead': // X X - Dead eyes don't move
        return (
            <g>
             <path d="M-8,-3 L-3,3 M-3,-3 L-8,3" stroke={featureColor} strokeWidth="2.5" strokeLinecap="round" />
             <path d="M3,-3 L8,3 M8,-3 L3,3" stroke={featureColor} strokeWidth="2.5" strokeLinecap="round" />
             <path d="M-4,8 Q0,6 4,8" fill="none" stroke={featureColor} strokeWidth="2" strokeLinecap="round" />
            </g>
        );
      case 'worried': 
        return (
          <g>
            {/* Left Eye > */}
            <path d="M-9.5,-4.5 L-4.5,-1 L-9.5,2.5" stroke={featureColor} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
            {/* Right Eye < */}
            <path d="M9.5,-4.5 L4.5,-1 L9.5,2.5" stroke={featureColor} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
            
            {/* Mouth: Wavy ~ */}
            <path d="M-5,9 Q-2.5,6 0,9 Q2.5,12 5,9" fill="none" stroke={featureColor} strokeWidth="2" strokeLinecap="round" />

            {/* Sweat Drop - adjusted for rotation context, maybe keep it simple */}
             <path 
              d="M12,-13 Q15,-9 15,-6 A3,3 0 1,1 9,-6 Q9,-9 12,-13 Z"
              fill="#5dade2" 
              stroke="#2e86c1" 
              strokeWidth="0.5" 
            />
          </g>
        );
      case 'neutral': // Determined
        return (
          <g>
            <circle cx="-6" cy="1" r="2.5" fill={featureColor} />
            <circle cx="6" cy="1" r="2.5" fill={featureColor} />
            {/* Eyebrows */}
            <path d="M-10,-6 L-3,-2" stroke={featureColor} strokeWidth="2.5" strokeLinecap="round" />
            <path d="M10,-6 L3,-2" stroke={featureColor} strokeWidth="2.5" strokeLinecap="round" />
            {/* Mouth */}
            <path d="M-3,9 Q0,7 3,9" fill="none" stroke={featureColor} strokeWidth="2" strokeLinecap="round" />
          </g>
        );
      case 'happy': // Default cute
      default:
        return (
          <g>
            {/* Eyes */}
            <circle cx="-6" cy="0" r="2.5" fill={featureColor} />
            <circle cx="6" cy="0" r="2.5" fill={featureColor} />
            
            {/* Mouth (w shape) */}
            <path d="M-5,5 Q-2.5,8 0,5 Q2.5,8 5,5" fill="none" stroke={featureColor} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
          </g>
        );
    }
  };

  return (
    <g 
        transform={`translate(${cx}, ${cy}) scale(${scale / 24}) rotate(${rotation})`}
        style={{ transition: 'transform 0.3s ease-out' }}
    >
      {getFaceContent()}
    </g>
  );
};