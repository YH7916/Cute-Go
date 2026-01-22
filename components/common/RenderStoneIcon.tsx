import React from 'react';

interface RenderStoneIconProps {
    color: 'black' | 'white';
}

export const RenderStoneIcon: React.FC<RenderStoneIconProps> = ({ color }) => {
    const filterId = color === 'black' ? 'url(#global-jelly-black)' : 'url(#global-jelly-white)';
    const fillColor = color === 'black' ? '#2a2a2a' : '#f0f0f0';
    return (
        <div className="w-8 h-8 flex items-center justify-center relative">
            <svg viewBox="0 0 24 24" className="w-full h-full overflow-visible">
                <circle cx="12" cy="12" r="10" fill={fillColor} filter={filterId} />
            </svg>
        </div>
    );
};
