import React from 'react';

// Keep the upper-left highlight without large light-to-pixel coordinates.
// Some X5 hardware renderers wash point-light highlights across the whole stone.
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
        <feDistantLight azimuth="225" elevation="20" />
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
        <feDistantLight azimuth="225" elevation="20" />
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

    {/* Skeuomorphic uses solid colors + shadow layers, no gradients needed */}

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

  </defs>
);
