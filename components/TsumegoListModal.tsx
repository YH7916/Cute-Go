import React, { useState } from 'react';
import { X, BookOpen, ChevronRight, Play } from 'lucide-react';
import { SGFNode } from '../utils/sgfParser';

export interface TsumegoSet {
    title: string;
    filename: string;
    difficulty: string;
}

interface TsumegoListModalProps {
    onClose: () => void;
    onSelectSet: (set: TsumegoSet) => void;
    collection: SGFNode[] | null;
    currentSetTitle: string;
    onBackToSets: () => void;
    onSelectProblem: (node: SGFNode) => void;
}

// Temporary Hardcoded Sets
const TSUMEGO_SETS: TsumegoSet[] = [
    { title: "棋经众妙", filename: "qjzm.sgf", difficulty: "Easy" },
    { title: "玄玄棋经", filename: "xxqj.sgf", difficulty: "Medium" }
];

export const TsumegoListModal: React.FC<TsumegoListModalProps> = ({
    onClose,
    onSelectSet,
    collection,
    currentSetTitle,
    onBackToSets,
    onSelectProblem
}) => {
    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm animate-fade-in">
            <div className="bg-[#fcf6ea] w-full max-w-md rounded-[32px] shadow-2xl border-4 border-[#8c6b38] overflow-hidden flex flex-col max-h-[80vh]">
                
                {/* Header */}
                <div className="bg-[#e3c086] p-4 flex items-center justify-between border-b-2 border-[#c4ae88]">
                    <div className="flex items-center gap-2 text-[#5c4033] font-black text-lg">
                        <BookOpen className="w-6 h-6" />
                        <span>{collection ? currentSetTitle : "死活题练习"}</span>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-[#c4ae88] rounded-full transition-colors">
                        <X className="w-6 h-6 text-[#5c4033]" />
                    </button>
                </div>

                {/* Content */}
                <div className="overflow-y-auto p-4 flex-1 custom-scrollbar">
                    {!collection ? (
                        // --- Set List ---
                        <div className="grid gap-3">
                            {TSUMEGO_SETS.map((set) => (
                                <button 
                                    key={set.filename}
                                    onClick={() => onSelectSet(set)}
                                    className="group relative bg-white p-4 rounded-2xl border-2 border-[#e3c086] hover:border-[#8c6b38] hover:bg-[#fff9e6] transition-all flex items-center justify-between shadow-sm active:scale-95"
                                >
                                    <div className="flex flex-col items-start gap-1">
                                        <span className="font-bold text-[#5c4033] text-lg">{set.title}</span>
                                        <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-[#e3c086] text-white">
                                            {set.difficulty}
                                        </span>
                                    </div>
                                    <div className="bg-[#fcf6ea] p-2 rounded-full border border-[#e3c086] group-hover:bg-[#8c6b38] group-hover:text-white transition-colors">
                                        <ChevronRight size={20} />
                                    </div>
                                </button>
                            ))}
                        </div>
                    ) : (
                        // --- Problem List ---
                        <div className="flex flex-col gap-3">
                            <button onClick={onBackToSets} className="text-sm font-bold text-[#8c6b38] flex items-center gap-1 mb-2 hover:underline">
                                <ChevronRight className="rotate-180 w-4 h-4" /> 返回题集列表
                            </button>
                            
                            <div className="grid grid-cols-4 gap-2">
                                {collection.map((node, index) => (
                                    <button 
                                        key={index}
                                        onClick={() => onSelectProblem(node)}
                                        className="aspect-square bg-white border-2 border-[#e3c086] rounded-xl flex items-center justify-center text-[#5c4033] font-black hover:bg-[#8c6b38] hover:text-white hover:border-[#8c6b38] transition-all shadow-sm active:scale-90"
                                    >
                                        {index + 1}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
