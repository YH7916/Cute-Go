import React, { useId } from 'react';
import { STONE_THEMES, StoneThemeId } from '../../utils/themes';

interface StoneSkinPreviewProps {
    stoneSkin: string;
    className?: string;
}

const STONE_RADIUS = 18;

const PreviewStone: React.FC<{
    color: 'black' | 'white';
    themeId: StoneThemeId;
    cx: number;
    cy: number;
    ids: {
        jellyBlack: string;
        jellyWhite: string;
    };
}> = ({ color, themeId, cx, cy, ids }) => {
    const theme = STONE_THEMES[themeId] || STONE_THEMES.classic;
    const isBlack = color === 'black';
    const mainColor = isBlack ? theme.blackColor : theme.whiteColor;

    if (theme.id === 'minimal') {
        const bodyShadowColor = isBlack ? '#000000' : '#999999';
        const dropShadowColor = '#000000';
        const mainStroke = 'none';
        return (
            <g>
                <circle cx={cx + 1.5} cy={cy + 1.5} r={STONE_RADIUS} fill={dropShadowColor} opacity={0.2} />
                <circle cx={cx + 0.8} cy={cy + 0.8} r={STONE_RADIUS} fill={bodyShadowColor} opacity={0.5} />
                <circle cx={cx} cy={cy} r={STONE_RADIUS} fill={mainColor} stroke={mainStroke} />
            </g>
        );
    }

    if (theme.id === 'skeuomorphic') {
        const shadowStyle = isBlack
            ? { filter: 'drop-shadow(1.5px 1.5px 1px rgba(0,0,0,0.4)) drop-shadow(2.5px 2.5px 2px rgba(0,0,0,0.2))' }
            : { filter: 'drop-shadow(1.5px 1.5px 1px rgba(80,60,40,0.25)) drop-shadow(2.5px 2.5px 2px rgba(50,30,10,0.12))' };

        return (
            <g style={shadowStyle}>
                <circle
                    cx={cx}
                    cy={cy}
                    r={STONE_RADIUS}
                    fill={isBlack ? '#2d2d30' : '#f5f5f2'}
                    stroke={isBlack ? theme.blackBorder : theme.whiteBorder}
                    strokeWidth="0"
                />
            </g>
        );
    }

    return (
        <circle
            cx={cx}
            cy={cy}
            r={STONE_RADIUS}
            fill={mainColor}
            filter={`url(#${isBlack ? ids.jellyBlack : ids.jellyWhite})`}
            stroke={isBlack ? theme.blackBorder : theme.whiteBorder}
            strokeWidth="0"
        />
    );
};

export const StoneSkinPreview: React.FC<StoneSkinPreviewProps> = ({ stoneSkin, className = '' }) => {
    const themeId = (stoneSkin in STONE_THEMES ? stoneSkin : 'classic') as StoneThemeId;
    const uid = useId().replace(/:/g, '');
    const jellyBlack = `preview-jelly-black-${uid}`;
    const jellyWhite = `preview-jelly-white-${uid}`;

    return (
        <div className={`h-20 w-full rounded-xl border-2 border-[#e3c086] bg-[#f5e6d3]/60 ${className}`}>
            <svg viewBox="0 0 180 80" className="h-full w-full">
                <defs>
                    <filter id={jellyBlack} x="-50%" y="-50%" width="200%" height="200%">
                        <feGaussianBlur in="SourceGraphic" stdDeviation="2.4" result="blur" />
                        <feColorMatrix in="blur" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 19 -9" result="blob" />
                        <feGaussianBlur in="blob" stdDeviation="2" result="blurBlob" />
                        <feSpecularLighting in="blurBlob" surfaceScale="5" specularConstant="0.8" specularExponent="20" lightingColor="#ffffff" result="specular">
                            <fePointLight x="-500" y="-500" z="300" />
                        </feSpecularLighting>
                        <feComposite in="specular" in2="blob" operator="in" result="specularInBlob" />
                        <feDropShadow dx="0" dy="2" stdDeviation="1.2" floodColor="#000000" floodOpacity="0.5" in="blob" result="shadow" />
                        <feComposite in="shadow" in2="blob" operator="over" result="shadowedBlob" />
                        <feComposite in="specularInBlob" in2="shadowedBlob" operator="over" />
                    </filter>

                    <filter id={jellyWhite} x="-50%" y="-50%" width="200%" height="200%">
                        <feGaussianBlur in="SourceGraphic" stdDeviation="2.4" result="blur" />
                        <feColorMatrix in="blur" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 19 -9" result="blob" />
                        <feGaussianBlur in="blob" stdDeviation="2" result="blurBlob" />
                        <feSpecularLighting in="blurBlob" surfaceScale="5" specularConstant="1.2" specularExponent="15" lightingColor="#ffffff" result="specular">
                            <fePointLight x="-500" y="-500" z="300" />
                        </feSpecularLighting>
                        <feComposite in="specular" in2="blob" operator="in" result="specularInBlob" />
                        <feDropShadow dx="0" dy="2" stdDeviation="1.2" floodColor="#5c4033" floodOpacity="0.3" in="blob" result="shadow" />
                        <feComposite in="shadow" in2="blob" operator="over" result="shadowedBlob" />
                        <feComposite in="specularInBlob" in2="shadowedBlob" operator="over" />
                    </filter>
                </defs>

                <PreviewStone color="black" themeId={themeId} cx={58} cy={40} ids={{ jellyBlack, jellyWhite }} />
                <PreviewStone color="white" themeId={themeId} cx={122} cy={40} ids={{ jellyBlack, jellyWhite }} />
            </svg>
        </div>
    );
};
