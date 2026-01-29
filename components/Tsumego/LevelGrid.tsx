import React, { useState, useMemo } from 'react';
import { ArrowLeft, Check, ChevronLeft, ChevronRight, Star, Folder } from 'lucide-react';
import { TsumegoCategory, TsumegoLevel, getLevelsFromCategory } from '../../utils/tsumegoData';

interface LevelGridProps {
    category: TsumegoCategory;
    groupName?: string;
    completedIds: string[];
    onSelectLevel: (level: TsumegoLevel) => void;
    onBack: () => void;
}

const ITEMS_PER_PAGE = 50;

export const LevelGrid: React.FC<LevelGridProps> = ({ category, groupName, completedIds, onSelectLevel, onBack }) => {
// --- New Folder Navigation Logic ---
    const [currentPath, setCurrentPath] = useState<string[]>([]);
    
    // Parse files into tree structure
    const fileTree = useMemo(() => {
        const root: any = { type: 'folder', name: 'root', children: {} };
        const levels = getLevelsFromCategory(category, groupName);

        levels.forEach(level => {
            // Get relative path from category/group base
            // Format: "Category/Group/SubFolder/File.sgf" or "Category/SubFolder/File.sgf"
            // We want path parts relative to the current View Root
            
            // Adjust based on how 'getLevelsFromCategory' returns filename
            // Typically absolute or relative to public/Problems?
            // "Tsumego/LifeDeath/FolderA/01.sgf"
            
            // Let's assume level.filename is full relative path from Problems root?
            // "Tsumego/Tesuji/Basic/01.sgf"
            // If groupName is set, we are inside that group.
            
            let relativePath = level.filename;
            
            // Trim expected prefixes
            if (relativePath.startsWith(category.dirName + '/')) { // "Tesuji/"
                relativePath = relativePath.slice(category.dirName.length + 1);
            }
            if (groupName && relativePath.startsWith(groupName + '/')) {
                relativePath = relativePath.slice(groupName.length + 1);
            }

            const parts = relativePath.split('/');
            let currentNode = root;

            for (let i = 0; i < parts.length; i++) {
                const part = parts[i];
                const isFile = i === parts.length - 1; // Assuming last part is file (SGF)
                
                if (isFile) {
                   if (!currentNode.children[part]) { // Avoid overwrite
                       currentNode.children[part] = { type: 'file', name: part, levelData: level };
                   }
                } else {
                    // Folder
                    if (!currentNode.children[part]) {
                        currentNode.children[part] = { type: 'folder', name: part, children: {} };
                    }
                    currentNode = currentNode.children[part];
                }
            }
        });
        return root;
    }, [category, groupName]);

    // Get current view items based on currentPath
    const currentViewItems = useMemo(() => {
        let node = fileTree;
        for (const p of currentPath) {
            if (node.children[p]) {
                node = node.children[p];
            } else {
                return []; // Invalid path
            }
        }
        
        // Convert map to array and Sort
        return Object.values(node.children).sort((a: any, b: any) => {
            if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
            // Numeric Sort for names
            const numA = parseInt(a.name);
            const numB = parseInt(b.name);
            if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
            return a.name.localeCompare(b.name, 'zh-CN', { numeric: true });
        });
    }, [fileTree, currentPath]);

    // Filter completed IDs for quick lookup
    const completedSet = useMemo(() => new Set(completedIds), [completedIds]);

    // --- Render ---
    return (
        <div className="flex flex-col h-full bg-[#fcf6ea] animate-in slide-in-from-right duration-300">
            {/* Breadcrumb / Back Navigation */}
            {(currentPath.length > 0) && (
                 <div className="flex items-center gap-2 p-4 border-b border-[#e3c086]/30 bg-white/40 sticky top-0 z-10 overflow-x-auto text-[#5c4033]">
                     <button 
                         onClick={() => setCurrentPath([])}
                         className="flex items-center hover:bg-[#e3c086]/20 p-1 rounded font-bold"
                     >
                         <ChevronLeft size={16} /> Home
                     </button>
                     {currentPath.map((p, idx) => (
                         <div key={idx} className="flex items-center gap-1 shrink-0">
                             <span className="opacity-40">/</span>
                             <button 
                                 onClick={() => setCurrentPath(prev => prev.slice(0, idx + 1))}
                                 className={`p-1 rounded font-bold hover:bg-[#e3c086]/20 ${idx === currentPath.length-1 ? 'text-[#8b5a2b]' : ''}`}
                             >
                                 {p}
                             </button>
                         </div>
                     ))}
                 </div>
            )}

            {/* Grid */}
            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 gap-3">
                    {/* Back Folder Button (if deep) */}
                    {currentPath.length > 0 && (
                        <button
                            onClick={() => setCurrentPath(prev => prev.slice(0, -1))}
                            className="aspect-square rounded-xl bg-[#e3c086]/10 border-2 border-[#e3c086]/30 flex flex-col items-center justify-center text-[#8b5a2b] hover:bg-[#e3c086]/30 transition-colors border-dashed"
                        >
                            <ArrowLeft size={32} strokeWidth={2.5} className="mb-1" />
                            <span className="text-xs font-bold">Back</span>
                        </button>
                    )}

                    {currentViewItems.map((item: any) => {
                         if (item.type === 'folder') {
                             return (
                                 <button
                                     key={item.name}
                                     onClick={() => setCurrentPath(prev => [...prev, item.name])}
                                     className="aspect-square rounded-xl bg-[#fff8e1] border-2 border-[#e3c086] flex flex-col items-center justify-center text-[#5c4033] hover:shadow-md hover:-translate-y-1 transition-all active:scale-95 group relative overflow-hidden"
                                 >
                                      {/* Folder visual */}
                                      <div className="absolute top-0 right-0 p-1 opacity-10 group-hover:opacity-20 transition-opacity">
                                          <Folder size={64} fill="currentColor" />
                                      </div>
                                      <Folder size={40} className="text-[#d4a04d] mb-2 drop-shadow-sm group-hover:scale-110 transition-transform" fill="currentColor" fillOpacity={0.2} />
                                      <span className="text-sm font-black line-clamp-2 px-1 text-center w-full leading-tight">{item.name}</span>
                                      <span className="text-[10px] bg-[#e3c086]/30 px-2 py-0.5 rounded-full mt-1 text-[#8b5a2b]/80 font-bold">Folder</span>
                                 </button>
                             );
                         } else {
                             const level = item.levelData;
                             const isCompleted = completedSet.has(level.id);
                             const displayName = item.name.replace('.sgf', ''); // Cleaner name

                             return (
                                <button
                                    key={level.id}
                                    onClick={() => onSelectLevel(level)}
                                    className={`
                                        aspect-square rounded-xl border-[3px] flex flex-col items-center justify-center relative shadow-sm
                                        transition-all duration-200 active:scale-95
                                        ${isCompleted 
                                            ? 'bg-[#81c784] border-[#2e7d32] text-white' 
                                            : 'bg-white border-[#e3c086] text-[#5c4033] hover:bg-[#fff8e1] hover:-translate-y-1 hover:shadow-md'
                                        }
                                    `}
                                >
                                    {isCompleted ? (
                                        <Check size={28} strokeWidth={3} className="drop-shadow-sm" />
                                    ) : (
                                        <span className="text-sm font-black line-clamp-2 leading-tight px-1 text-center">{displayName}</span>
                                    )}
                                </button>
                             );
                         }
                    })}
                </div>
                
                {currentViewItems.length === 0 && (
                    <div className="flex flex-col items-center justify-center p-12 text-[#8c6b38]/50">
                        <Folder size={48} className="mb-2" />
                        <span className="font-bold">Empty Folder</span>
                    </div>
                )}

                {/* Padding bottom */}
                <div className="h-20" />
            </div>
        </div>
    );
};
