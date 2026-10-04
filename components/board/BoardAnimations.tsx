import React from 'react';

export const BoardAnimations = () => (
  <style>{`
        @keyframes pulseSlow {
            0%, 100% { opacity: 0.3; transform: scale(0.95); }
            50% { opacity: 0.6; transform: scale(1.05); }
        }
        .animate-pulse-slow {
            animation: pulseSlow 4s ease-in-out infinite;
            transform-origin: center;
        }
        /* [Perf] Animate opacity instead of stroke-width.
           stroke-width changes force SVG filter re-rasterization at 60fps.
           opacity is GPU-composited and essentially free. */
        @keyframes liquidFlow {
            0%, 100% { opacity: 0.5; }
            50% { opacity: 1; }
        }
        .animate-liquid-flow line {
            animation: liquidFlow 2.5s ease-in-out infinite;
        }

        /* [新增] 气流动动画 */
        @keyframes dashFlow {
            to { stroke-dashoffset: -20; }
        }
        .animate-dash-flow {
            stroke-dasharray: 4, 6;
            animation: dashFlow 1s linear infinite;
        }
      `}</style>
);
