import React from 'react';
import { Play, Cloud, Cpu, BookOpen, Globe, Download, Settings, Heart, Zap, Info, HelpCircle, PenTool, User as UserIcon, Palette } from 'lucide-react';

interface StartScreenProps {
  onStartGame: (mode: 'PvP' | 'PvAI', aiType?: 'cloud' | 'local') => void;
  onOpenTsumego: () => void;
  onOpenTutorial: () => void;
  onOpenOnline: () => void;
  onOpenImport: () => void;
  onOpenSettings: () => void;
  onOpenAbout: () => void;
  onStartSetup: () => void;
  onOpenUserPage: () => void;
  onOpenSkinShop: () => void; // New
}

export const StartScreen: React.FC<StartScreenProps> = ({
  onStartGame,
  onOpenTsumego,
  onOpenTutorial,
  onOpenOnline,
  onOpenImport,
  onOpenSettings,
  onOpenAbout,
  onStartSetup,
  onOpenUserPage,
  onOpenSkinShop
}) => {

  return (
    <div className="absolute inset-0 z-30 bg-[#f7e7ce] flex flex-col items-center justify-start overflow-hidden animate-in fade-in duration-500">
      
      {/* ... Top Bar ... */}
      <div className="w-full p-4 flex justify-between items-center bg-[#f7e7ce] shrink-0 border-b-2 border-[#e3c086] border-dashed md:border-none">
           {/* Left: Buttons */}
           <div className="flex items-center gap-2">
                <button onClick={onOpenSettings} className="btn-retro btn-brown p-3 rounded-xl"><Settings size={20} /></button>
                <button onClick={onOpenAbout} className="btn-retro btn-brown p-3 rounded-xl"><Info size={20} /></button>
            </div>

            {/* Right: Title */}
            <div className="flex flex-col items-end">
                <span className="font-black text-[#5c4033] text-xl leading-tight flex items-center gap-2 tracking-wide font-['GenSenRounded']">
                    CuteGo
                </span>
                <span className="text-[10px] font-bold text-[#8c6b38] bg-[#e3c086]/30 px-2 py-1 rounded-full border border-[#e3c086] mt-1">
                    首页
                </span>
            </div>
      </div>

      {/* Main Scrollable Content */}
      <div className="w-full flex-1 overflow-y-auto custom-scrollbar flex flex-col items-center p-6 md:p-12">
        <div className="max-w-4xl w-full flex flex-col items-center gap-6 my-auto">
            
            {/* Main Game Modes (Responsive Grid) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 w-full lg:w-4/5">
            
            <button 
                onClick={() => onStartGame('PvP')}
                className="btn-retro bg-[#997c55] border-[#5c4033] text-[#fcf6ea] hover:bg-[#8a6f4c] hover:border-[#6d4c41] h-16 rounded-xl flex flex-row items-center justify-center gap-4 transition-transform hover:-translate-y-1 group px-4"
            >
                <div className="p-2 rounded-full bg-[#fcf6ea]/20 text-[#fcf6ea] group-hover:scale-110 transition-transform shrink-0">
                    <Play size={20} strokeWidth={2.5} />
                </div>
                <span className="text-lg font-black tracking-wide">本地双人</span>
            </button>

             <button 
                onClick={onOpenOnline}
                className="btn-retro bg-[#aecbeb] border-[#8cacd6] text-[#3e5c76] hover:bg-[#9dbddb] hover:border-[#7b9bc4] h-16 rounded-xl flex flex-row items-center justify-center gap-4 transition-transform hover:-translate-y-1 group px-4"
            >
                <div className="p-2 rounded-full bg-[#3e5c76]/10 text-[#3e5c76] group-hover:scale-110 transition-transform shrink-0">
                    <Globe size={20} strokeWidth={2.5} />
                </div>
                <span className="text-lg font-black tracking-wide">联机对战</span>
            </button>

            <button 
                onClick={() => onStartGame('PvAI', 'cloud')}
                className="btn-retro bg-[#92cdf7] border-[#63b3ed] text-[#1e40af] hover:bg-[#7bc0f5] hover:border-[#4299e1] h-16 rounded-xl flex flex-row items-center justify-center gap-4 transition-transform hover:-translate-y-1 group px-4"
            >
                <div className="p-2 rounded-full bg-[#1e40af]/10 text-[#1e40af] group-hover:scale-110 transition-transform shrink-0">
                    <Cloud size={20} strokeWidth={2.5} />
                </div>
                <span className="text-lg font-black tracking-wide">云端 AI（试运行至1.29）</span>
            </button>

            <button 
                onClick={() => onStartGame('PvAI', 'local')}
                className="btn-retro bg-[#e3c086] border-[#d4a866] text-[#5c4033] hover:text-[#4e342e] hover:border-[#bfa15f] h-16 rounded-xl flex flex-row items-center justify-center gap-4 transition-transform hover:-translate-y-1 group px-4"
            >
                <div className="p-2 rounded-full bg-[#5c4033]/10 text-[#5c4033] group-hover:scale-110 transition-transform shrink-0">
                    <Cpu size={20} strokeWidth={2.5} />
                </div>
                <span className="text-lg font-black tracking-wide">本地 AI</span>
            </button>

            </div>

            {/* Features & Tools Grid */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 w-full lg:w-4/5">
                <FeatureButton icon={Palette} label="外观商店" onClick={onOpenSkinShop} delay={50} color="btn-beige" />
                <FeatureButton icon={Zap} label="死活题闯关(暂未开放）" onClick={onOpenTsumego} delay={100} color="btn-beige" />
                <FeatureButton icon={PenTool} label="电子挂盘" onClick={onStartSetup} delay={200} color="btn-beige" />
                <FeatureButton icon={BookOpen} label="新手教程" onClick={onOpenTutorial} delay={250} color="btn-beige" />
                <FeatureButton icon={Download} label="导入导出" onClick={onOpenImport} delay={300} color="btn-beige" />
                <FeatureButton icon={UserIcon} label="个人中心" onClick={onOpenUserPage} delay={350} color="btn-beige" />
            </div>

            <div className="mt-4 md:mt-8 text-[#8c6b38]/60 text-xs md:text-sm font-medium pb-4">
                v2.3.0 • Designed with <Heart size={12} className="inline text-red-400 fill-current" /> by Yokaku
            </div>
        </div>
      </div>
    </div>
  );
};

const FeatureButton: React.FC<{ icon: any, label: string, onClick: () => void, delay: number, color: string }> = ({ icon: Icon, label, onClick, delay, color }) => {
    return (
        <button 
            onClick={onClick}
            style={{ animationDelay: `${delay}ms` }}
            className={`btn-retro ${color} animate-in fade-in slide-in-from-bottom-4 fill-mode-backwards h-14 rounded-xl flex flex-row items-center justify-center px-3 gap-2 transition-transform hover:-translate-y-1 group`}
        >
            <div className="p-1.5 rounded-full bg-[#5c4033]/5 group-hover:bg-[#5c4033]/10 transition-colors shrink-0">
               <Icon size={16} className="text-[#5c4033] group-hover:scale-110 transition-transform md:w-5 md:h-5" />
            </div>
            <span className="text-sm font-bold text-[#5c4033]">{label}</span>
        </button>
    )
}
