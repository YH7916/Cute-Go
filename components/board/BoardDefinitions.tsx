import React from 'react';

export const StoneFilters = ({ CELL_SIZE, filterIdPrefix = '' }: {
  CELL_SIZE: number;
  filterIdPrefix?: string;
}) => (
  <>
    <filter id={`${filterIdPrefix}jelly-black`} x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur in="SourceGraphic" stdDeviation={CELL_SIZE * 0.1} result="blur" />
      <feColorMatrix
        in="blur"
        mode="matrix"
        values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 19 -9"
        result="blob"
      />
      <feGaussianBlur in="blob" stdDeviation="2" result="blurBlob" />
      <feSpecularLighting
        in="blurBlob"
        surfaceScale="5"
        specularConstant="0.8"
        specularExponent="20"
        lightingColor="#ffffff"
        result="specular"
      >
        <fePointLight x="-500" y="-500" z="300" />
      </feSpecularLighting>
      <feComposite in="specular" in2="blob" operator="in" result="specularInBlob" />
      <feDropShadow
        dx="0"
        dy={CELL_SIZE * 0.1}
        stdDeviation={CELL_SIZE * 0.05}
        floodColor="#000000"
        floodOpacity="0.5"
        in="blob"
        result="shadow"
      />
      <feComposite in="shadow" in2="blob" operator="over" result="shadowedBlob" />
      <feComposite in="specularInBlob" in2="shadowedBlob" operator="over" />
    </filter>

    <filter id={`${filterIdPrefix}jelly-white`} x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur in="SourceGraphic" stdDeviation={CELL_SIZE * 0.1} result="blur" />
      <feColorMatrix
        in="blur"
        mode="matrix"
        values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 19 -9"
        result="blob"
      />
      <feGaussianBlur in="blob" stdDeviation="2" result="blurBlob" />
      <feSpecularLighting
        in="blurBlob"
        surfaceScale="5"
        specularConstant="1.2"
        specularExponent="15"
        lightingColor="#ffffff"
        result="specular"
      >
        <fePointLight x="-500" y="-500" z="300" />
      </feSpecularLighting>
      <feComposite in="specular" in2="blob" operator="in" result="specularInBlob" />
      <feDropShadow
        dx="0"
        dy={CELL_SIZE * 0.1}
        stdDeviation={CELL_SIZE * 0.05}
        floodColor="#5c4033"
        floodOpacity="0.3"
        in="blob"
        result="shadow"
      />
      <feComposite in="shadow" in2="blob" operator="over" result="shadowedBlob" />
      <feComposite in="specularInBlob" in2="shadowedBlob" operator="over" />
    </filter>

  </>
);

export const BoardDefinitions = ({ CELL_SIZE }: { CELL_SIZE: number }) => (
  <defs>
    <StoneFilters CELL_SIZE={CELL_SIZE} />

    {/* [Optimized] Tighter Jelly filters for Separate/Gomoku mode */}
    <filter id="jelly-separate-black" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur in="SourceGraphic" stdDeviation={CELL_SIZE * 0.04} result="blur" />
      <feColorMatrix
        in="blur"
        mode="matrix"
        values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 19 -9"
        result="blob"
      />
      <feGaussianBlur in="blob" stdDeviation="1.5" result="blurBlob" />
      <feSpecularLighting
        in="blurBlob"
        surfaceScale="5"
        specularConstant="0.8"
        specularExponent="20"
        lightingColor="#ffffff"
        result="specular"
      >
        <fePointLight x="-500" y="-500" z="300" />
      </feSpecularLighting>
      <feComposite in="specular" in2="blob" operator="in" result="specularInBlob" />
      <feDropShadow
        dx="0"
        dy={CELL_SIZE * 0.1}
        stdDeviation={CELL_SIZE * 0.05}
        floodColor="#000000"
        floodOpacity="0.5"
        in="blob"
        result="shadow"
      />
      <feComposite in="shadow" in2="blob" operator="over" result="shadowedBlob" />
      <feComposite in="specularInBlob" in2="shadowedBlob" operator="over" />
    </filter>

    <filter id="jelly-separate-white" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur in="SourceGraphic" stdDeviation={CELL_SIZE * 0.04} result="blur" />
      <feColorMatrix
        in="blur"
        mode="matrix"
        values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 19 -9"
        result="blob"
      />
      <feGaussianBlur in="blob" stdDeviation="1.5" result="blurBlob" />
      <feSpecularLighting
        in="blurBlob"
        surfaceScale="5"
        specularConstant="1.2"
        specularExponent="15"
        lightingColor="#ffffff"
        result="specular"
      >
        <fePointLight x="-500" y="-500" z="300" />
      </feSpecularLighting>
      <feComposite in="specular" in2="blob" operator="in" result="specularInBlob" />
      <feDropShadow
        dx="0"
        dy={CELL_SIZE * 0.1}
        stdDeviation={CELL_SIZE * 0.05}
        floodColor="#5c4033"
        floodOpacity="0.3"
        in="blob"
        result="shadow"
      />
      <feComposite in="shadow" in2="blob" operator="over" result="shadowedBlob" />
      <feComposite in="specularInBlob" in2="shadowedBlob" operator="over" />
    </filter>

    {/* [Optimized] Gradients for Separate/Gomoku mode (Zero Performance Cost) */}
    <radialGradient id="grad-separate-black" cx="30%" cy="30%" r="50%" fx="30%" fy="30%">
      <stop offset="0%" stopColor="#666666" />
      <stop offset="100%" stopColor="#000000" />
    </radialGradient>
    <radialGradient id="grad-separate-white" cx="35%" cy="35%" r="50%" fx="35%" fy="35%">
      <stop offset="0%" stopColor="#ffffff" />
      <stop offset="100%" stopColor="#e0e0e0" />
    </radialGradient>

    {/* Skeuomorphic uses solid colors + shadow layers, no gradients needed */}

    <filter id="qi-blur">
      <feGaussianBlur in="SourceGraphic" stdDeviation={CELL_SIZE * 0.3} />
    </filter>

    {/* [新增] 气流发光滤镜 */}
    <filter id="glow-flow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="2" result="coloredBlur" />
      <feMerge>
        <feMergeNode in="coloredBlur" />
        <feMergeNode in="SourceGraphic" />
      </feMerge>
    </filter>

    {/* [新增] 气流渐变色 */}
    <linearGradient id="qi-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stopColor="#4fc3f7" stopOpacity="0.6" />
      <stop offset="50%" stopColor="#e1f5fe" stopOpacity="1" />
      <stop offset="100%" stopColor="#4fc3f7" stopOpacity="0.6" />
    </linearGradient>

    {/* [新增] 兼容模式(简约)的高光渐变 - 黑色棋子 (叠加层) */}
    <radialGradient id="compat-black-gradient" cx="35%" cy="35%" r="60%">
      <stop offset="0%" stopColor="#ffffff" stopOpacity="0.15" />
      <stop offset="100%" stopColor="#000000" stopOpacity="0" />
    </radialGradient>

    {/* [新增] 兼容模式(简约)的高光渐变 - 白色棋子 (叠加层) */}
    <radialGradient id="compat-white-gradient" cx="70%" cy="70%" r="65%">
      <stop offset="0%" stopColor="#000000" stopOpacity="0.1" />
      <stop offset="100%" stopColor="#000000" stopOpacity="0" />
    </radialGradient>
  </defs>
);
