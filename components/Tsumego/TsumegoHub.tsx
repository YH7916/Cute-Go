import React, { useState, useEffect } from 'react';
import { X, Heart, Zap, Hexagon, Trophy, Folder, ArrowLeft, Loader2 } from 'lucide-react';
import { TsumegoCategory, TsumegoLevel, fetchProblemManifest } from '../../utils/tsumegoData';
import { LevelGrid } from './LevelGrid';

interface TsumegoHubProps {
    onClose: () => void;
    onSelectLevel: (level: TsumegoLevel) => void;
    completedLevelIds: string[];
}

export const TsumegoHub: React.FC<TsumegoHubProps> = ({ onClose, onSelectLevel, completedLevelIds }) => {
    const [categories, setCategories] = useState<TsumegoCategory[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedCategory, setSelectedCategory] = useState<TsumegoCategory | null>(null);
    const [selectedGroup, setSelectedGroup] = useState<string | null>(null);

    useEffect(() => {
        fetchProblemManifest().then(data => {
            // [Fix] Filter to ONLY Life & Death
            const filtered = data.filter(c => c.id === 'life_death');
            setCategories(filtered);
            setLoading(false);
            
            // [Fix] Auto-select first category (Life & Death)
            if (filtered.length > 0) {
                setSelectedCategory(filtered[0]);
            }
        });
    }, []);

    // Helper to get icon
    const getIcon = (id: string) => {
        switch (id) {
            case 'life_death': return <Heart size={32} className="text-rose-500" fill="currentColor" fillOpacity={0.2} />;
            default: return <Trophy size={32} className="text-[#5c4033]" />;
        }
    };

    const getBgColor = (id: string) => {
         switch (id) {
            case 'life_death': return 'from-rose-50 to-rose-100/50 border-rose-200';
            default: return 'from-gray-50 to-gray-100 border-gray-200';
        }
    };

    const handleBack = () => {
        if (selectedGroup) {
            setSelectedGroup(null);
        } else {
            // [Fix] Since we auto-select category, Back always closes the hub
            onClose();
        }
    };

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4 animate-in fade-in duration-200">
             {/* Main Modal Window - Retro Wood Style */}
             <div className="bg-[#fcf6ea] w-full max-w-5xl h-[85vh] rounded-3xl border-4 border-[#8c6b38] shadow-2xl flex flex-col overflow-hidden relative animate-scale-up">
                 
                 {/* Header */}
                 <div className="bg-[#e3c086] p-4 flex items-center justify-between shrink-0 border-b-4 border-[#cba367]">
                    <div className="flex items-center gap-3">
                        {(selectedCategory || selectedGroup) && (
                            <button 
                                onClick={handleBack}
                                className="w-10 h-10 rounded-xl bg-[#fcf6ea] border-b-4 border-[#cba367] flex items-center justify-center text-[#5c4033] hover:bg-white active:border-b-0 active:translate-y-1 transition-all"
                            >
                                <ArrowLeft size={24} strokeWidth={3} />
                            </button>
                        )}
                        <div className="flex flex-col">
                            <h1 className="text-xl font-black text-[#5c4033] flex items-center gap-2 drop-shadow-sm">
                                <Trophy size={24} className="text-[#8c6b38]" />
                                {selectedGroup || (selectedCategory ? selectedCategory.name : "死活闯关")}
                            </h1>
                            <span className="text-xs font-bold text-[#8c6b38] opacity-80 tracking-wider uppercase">
                                {loading ? 'Reading library...' : selectedGroup ? 'Select Level' : '题目来源于网络，可能存在错误，侵权请联系我删除'}
                            </span>
                        </div>
                    </div>

                    <button 
                        onClick={onClose}
                        className="w-10 h-10 rounded-xl bg-[#fcf6ea] border-b-4 border-[#cba367] flex items-center justify-center text-[#5c4033] hover:bg-white active:border-b-0 active:translate-y-1 transition-all"
                    >
                        <X size={24} strokeWidth={3} />
                    </button>
                </div>

                {/* Content Area */}
                <div className="flex-1 overflow-hidden relative bg-[#fcf6ea]"> 
                    {/* Background Pattern */}
                    <div className="absolute inset-0 opacity-10 pointer-events-none" 
                         style={{ backgroundImage: 'radial-gradient(#8c6b38 4%, transparent 4%)', backgroundSize: '24px 24px' }} 
                    />

                    <div className="relative h-full z-10">
                        {loading ? (
                             <div className="flex flex-col items-center justify-center h-full text-[#8c6b38] gap-4">
                                 <Loader2 size={48} className="animate-spin" />
                                 <p className="font-bold text-lg">正在读取棋谱库...</p>
                             </div>
                        ) : !selectedCategory ? (
                            /* Skip Category List - Auto-loading Life & Death */
                            <div className="flex flex-col items-center justify-center h-full text-[#8c6b38]">
                                <Loader2 size={48} className="animate-spin mb-4" />
                                <p className="font-bold">正在进入死活闯关...</p>
                            </div>
                        ) : (selectedCategory.children.some((c: any) => c.isGroup) && !selectedGroup) ? (
                            /* Group List */
                            <div className="h-full overflow-y-auto p-6 custom-scrollbar">
                                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 animate-fade-in-up">
                                    {selectedCategory.children.filter((c: any) => c.isGroup).map((child: any, idx) => (
                                        <button 
                                            key={child.name}
                                            onClick={() => setSelectedGroup(child.name)}
                                            className="btn-retro bg-[#fcf6ea] p-4 rounded-xl border border-[#cba367] 
                                                     hover:bg-white flex flex-col items-center justify-center gap-3 aspect-[4/3] group"
                                            style={{ animationDelay: `${idx * 30}ms` }}
                                        >
                                            <div className="p-3 rounded-full bg-[#f3e5d0] group-hover:bg-[#e3c086] transition-colors">
                                                <Folder className="w-8 h-8 text-[#8c6b38]" strokeWidth={2.5} />
                                            </div>
                                            <div className="flex flex-col items-center gap-1">
                                                <span className="text-[#5c4033] font-black text-lg text-center line-clamp-1">{child.name as string}</span>
                                                <span className="text-xs text-[#8c6b38] font-bold bg-[#e3c086]/20 px-2 py-0.5 rounded-full">
                                                    {(child as any).files.length} 题
                                                </span>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            /* Level Grid */
                            <div className="h-full p-4 overflow-hidden">
                                <LevelGrid 
                                    category={selectedCategory} 
                                    groupName={selectedGroup || undefined}
                                    completedIds={completedLevelIds} 
                                    onSelectLevel={onSelectLevel}
                                    onBack={handleBack}
                                />
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
