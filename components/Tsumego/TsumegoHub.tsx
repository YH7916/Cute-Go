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
        <div className="fixed inset-0 bg-[#fcf6ea]/95 backdrop-blur-md z-[60] flex flex-col animate-in fade-in duration-300 overflow-hidden">
             {/* Header */}
             <div className="flex items-center justify-between p-6 border-b-4 border-[#e3c086] bg-white/50 relative z-10 shrink-0">
                <div className="flex items-center gap-4">
                    {(selectedCategory || selectedGroup) && (
                        <button 
                            onClick={handleBack}
                            className="p-2 -ml-2 rounded-full hover:bg-[#e3c086] transition-colors active:scale-95 text-[#5c4033]"
                        >
                            <ArrowLeft size={28} strokeWidth={2.5} />
                        </button>
                    )}
                    <div className="flex flex-col">
                        <h1 className="text-2xl font-black text-[#5c4033] flex items-center gap-2">
                             {selectedGroup || (selectedCategory ? selectedCategory.name : "死活闯关")}
                        </h1>
                        <span className="text-sm font-bold text-[#8c6b38] opacity-70 tracking-wider">
                            {loading ? 'Reading library...' : selectedGroup ? 'Select Level' : 'Life and Death Challenge'}
                        </span>
                    </div>
                </div>
                <button 
                    onClick={onClose}
                    className="w-12 h-12 rounded-2xl bg-white border-4 border-[#e3c086] flex items-center justify-center text-[#5c4033] hover:bg-[#e3c086] transition-colors active:scale-95 shadow-sm"
                >
                    <X size={24} />
                </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-hidden relative w-full max-w-6xl mx-auto">
                {loading ? (
                     <div className="flex flex-col items-center justify-center h-full text-[#8c6b38]">
                         <Loader2 size={48} className="animate-spin mb-4" />
                         <p className="font-bold">Loading Problems...</p>
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
                                    className="bg-[#f5e6d3] p-6 rounded-2xl border-2 border-[#dcc096] 
                                             hover:border-[#8b5a2b] hover:shadow-lg hover:-translate-y-1 transition-all active:scale-95
                                             flex flex-col items-center justify-center gap-4 aspect-[4/3] group"
                                    style={{ animationDelay: `${idx * 30}ms` }}
                                >
                                    <Folder className="w-12 h-12 text-[#d4a04d] group-hover:text-[#8b5a2b] transition-colors" fill="currentColor" fillOpacity={0.2} />
                                    <span className="text-[#5c4033] font-bold text-lg text-center line-clamp-2 md:text-xl">{child.name as string}</span>
                                    <span className="text-sm text-[#8b5a2b]/70 font-medium bg-[#e3c086]/30 px-3 py-1 rounded-full">
                                        {(child as any).files.length} 题
                                    </span>
                                </button>
                            ))}
                        </div>
                    </div>
                ) : (
                    /* Level Grid */
                    <LevelGrid 
                        category={selectedCategory} 
                        groupName={selectedGroup || undefined}
                        completedIds={completedLevelIds} 
                        onSelectLevel={onSelectLevel}
                        onBack={handleBack}
                    />
                )}
            </div>
            
            {/* Footer Decoration */}
            <div className="h-12 bg-gradient-to-t from-[#e3c086]/20 to-transparent pointer-events-none shrink-0" />
        </div>
    );
};
