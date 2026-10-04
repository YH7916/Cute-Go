import React from 'react';
import { BookOpen, Cpu, Globe, MessageCircle, Users } from 'lucide-react';
import { Button } from '../ui/common';

export type TutorialDestination = 'learning' | 'local' | 'online' | 'ai' | 'coach';

const modes = [
    { id: 'learning', title: '进阶教学', description: '跟着教程，练习更深入的攻防。', icon: BookOpen },
    { id: 'local', title: '本地双人', description: '和身边的朋友轮流落子。', icon: Users },
    { id: 'online', title: '联机对战', description: '在 TapTap 小游戏里邀请朋友下棋。', icon: Globe },
    { id: 'ai', title: 'AI 对战', description: '选个合适的难度，自己下一盘。', icon: Cpu },
    { id: 'coach', title: 'AI 陪练', description: '边下边听讲解，需要时再要提示。', icon: MessageCircle },
] as const;

export function TutorialGuide({ onExplore }: { onExplore: (destination: TutorialDestination) => void }) {
    return (
        <div className="w-full max-w-md grid grid-cols-1 landscape:grid-cols-2 gap-2 text-[#5c4033]">
            {modes.map(({ id, title, description, icon: Icon }) => (
                <Button key={id} appearance="retro" variant="secondary" className="w-full flex items-center gap-3 text-left landscape:py-1 landscape:px-3"
                    onClick={() => onExplore(id)}>
                    <Icon size={20} className="shrink-0" />
                    <span>
                        <span className="block text-sm">{title}</span>
                        <span className="block mt-0.5 text-xs leading-relaxed landscape:text-[11px] landscape:leading-4 font-normal text-[#8c6b38]">{description}</span>
                    </span>
                </Button>
            ))}
        </div>
    );
}
