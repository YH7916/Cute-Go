import React from 'react';
import { X, FileUp, Check, Copy } from 'lucide-react';

interface ImportExportModalProps {
    isOpen: boolean;
    onClose: () => void;
    importKey: string;
    setImportKey: (key: string) => void;
    onImport: () => void;
    onCopy: () => void;
    onExportSGF: () => void;
    isCopied: boolean;
}

export const ImportExportModal: React.FC<ImportExportModalProps> = ({
    isOpen,
    onClose,
    importKey,
    setImportKey,
    onImport,
    onCopy,
    onExportSGF,
    isCopied
}) => {
    if (!isOpen) return null;

    return (
        <div className="absolute inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="bg-[#fcf6ea] rounded-3xl p-6 landscape:p-6 w-full max-w-sm landscape:max-w-2xl shadow-2xl border-[6px] border-[#5c4033] relative">
                <button onClick={onClose} className="absolute top-4 right-4 text-[#8c6b38] hover:text-[#5c4033]"><X size={24}/></button>
                <h2 className="text-xl font-black text-[#5c4033] mb-4 flex items-center gap-2"><FileUp className="text-[#5c4033]"/> 导入/导出棋局</h2>
                <div className="space-y-4 landscape:space-y-0 landscape:grid landscape:grid-cols-2 landscape:gap-4">
                    <div className="bg-[#fff] p-3 rounded-xl border-2 border-[#e3c086] flex flex-col justify-between">
                        <p className="text-xs font-bold text-[#8c6b38] uppercase mb-2">导出 SGF</p>
                        <div className="space-y-2">
                            <button onClick={onCopy} className="w-full py-2 bg-[#fcf6ea] border border-[#e3c086] text-[#5c4033] font-bold rounded-lg hover:bg-[#e3c086] hover:text-white flex items-center justify-center gap-2 transition-all">
                                 {isCopied ? <Check size={16}/> : <Copy size={16}/>}
                                 {isCopied ? '已复制 SGF' : '复制 SGF 文本'}
                            </button>
                            <button onClick={onExportSGF} className="w-full py-2 bg-[#fcf6ea] border border-[#e3c086] text-[#5c4033] font-bold rounded-lg hover:bg-[#e3c086] hover:text-white flex items-center justify-center gap-2 transition-all">
                                 <FileUp size={16}/> 导出 SGF 文件
                            </button>
                        </div>
                    </div>
                    <div className="bg-[#fff] p-3 rounded-xl border-2 border-[#e3c086] flex flex-col">
                        <p className="text-xs font-bold text-[#8c6b38] uppercase mb-2">导入 SGF</p>
                        <textarea className="w-full p-2 text-xs font-mono bg-[#fcf6ea] border border-[#e3c086] rounded-lg h-20 landscape:h-full resize-none outline-none focus:border-[#5c4033] text-[#5c4033] flex-1" placeholder="请粘贴 SGF 文本内容..." value={importKey} onChange={(e) => setImportKey(e.target.value)}/>
                        <button onClick={onImport} disabled={!importKey} className="btn-retro btn-brown w-full mt-2 py-2 rounded-lg">解析并加载</button>
                    </div>
                </div>
            </div>
        </div>
    );
};
