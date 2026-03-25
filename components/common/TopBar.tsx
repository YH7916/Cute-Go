import React from 'react';

interface TopBarProps {
    leftButtons: React.ReactNode;
    rightContent: React.ReactNode;
}

export const TopBar: React.FC<TopBarProps> = ({ leftButtons, rightContent }) => {
    return (
        <div className="w-full px-4 pt-safe-plus-4 bg-[#f7e7ce] shrink-0 border-b-2 border-[#e3c086] border-dashed md:border-none">
            <div className="flex justify-between items-center pt-2 pb-3">
                {/* Left: Action Buttons */}
                <div className="flex items-center gap-2">
                    {leftButtons}
                </div>

                {/* Right: Title / Badge */}
                <div className="flex flex-col items-end">
                    {rightContent}
                </div>
            </div>
        </div>
    );
};
