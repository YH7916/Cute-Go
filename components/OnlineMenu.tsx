import React, { useState, useEffect } from 'react';
import { X, Globe, Check, Copy, Hash } from 'lucide-react';
import { BoardSize, GameType } from '../types';
import { supabase } from '../utils/supabaseClient';

interface OnlineMenuProps {
    isOpen: boolean;
    onClose: () => void;
    isMatching: boolean; 
    onCancelMatch: () => void;
    onStartMatch: (size: BoardSize) => void;
    matchBoardSize: BoardSize;
    matchTime: number;
    gameType: GameType;
    peerId: string;
    onCopyId: () => void;
    isCopied: boolean;
    remotePeerId: string;
    setRemotePeerId: (id: string) => void;
    onJoinRoom: (id: string) => void;
    onlineStatus: string;
}

export const OnlineMenu: React.FC<OnlineMenuProps> = ({
    isOpen,
    onClose,
    isMatching,
    onCancelMatch,
    onStartMatch,
    matchBoardSize,
    matchTime,
    gameType,
    peerId,
    onCopyId,
    isCopied,
    remotePeerId,
    setRemotePeerId,
    onJoinRoom,
    onlineStatus
}) => {
    const [queueCounts, setQueueCounts] = useState<{ [key: string]: number }>({});

    useEffect(() => {
        if (!isOpen) return;
        const updateCounts = async () => {
            const sizes: BoardSize[] = [9, 13, 19];
            const activeSince = new Date(Date.now() - 15000).toISOString();
            const results = await Promise.all(
                sizes.map(size =>
                    supabase.from('matchmaking_queue')
                        .select('*', { count: 'exact', head: true })
                        .eq('game_type', gameType)
                        .eq('board_size', size)
                        .gte('last_seen', activeSince)
                )
            );
            setQueueCounts(prev => {
                const next = { ...prev };
                sizes.forEach((size, idx) => {
                    const count = results[idx].count || 0;
                    next[`${gameType}-${size}`] = count;
                });
                return next;
            });
        };
        updateCounts();
        const timer = setInterval(updateCounts, 5000);
        return () => clearInterval(timer);
    }, [isOpen, gameType]);

    if (!isOpen) return null;

    return (
        <div className="absolute inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
             <div className="bg-[#fcf6ea] rounded-3xl p-6 w-full max-w-sm shadow-2xl border-[6px] border-[#5c4033] relative overflow-hidden text-center">
                <button onClick={() => { onClose(); if (isMatching) onCancelMatch(); }} className="absolute top-4 right-4 text-[#8c6b38] hover:text-[#5c4033]"><X size={24}/></button>
                <div className="w-16 h-16 bg-[#e3c086] rounded-full flex items-center justify-center text-[#5c4033] mx-auto mb-4 border-2 border-[#5c4033]">
                    <Globe size={32} />
                </div>
                <h2 className="text-2xl font-black text-[#5c4033] mb-6">联机对战</h2>
                <div className="w-full space-y-4">
                    <div className="bg-[#fff] p-4 rounded-xl border-2 border-[#e3c086]">
                        <div className="grid grid-cols-3 gap-2">
                            {[9, 13, 19].map((size) => (
                                <button
                                    key={size}
                                    onClick={() => onStartMatch(size as BoardSize)}
                                    disabled={isMatching || onlineStatus === 'connecting' || onlineStatus === 'connected'}
                                    className={`btn-retro py-2 rounded-xl font-bold text-xs ${matchBoardSize === size ? 'bg-[#8c6b38] text-[#fcf6ea] border-[#5c4033]' : 'bg-[#fff] text-[#8c6b38] border-[#e3c086]'}`}
                                >
                                    匹配 {size} 路
                                </button>
                            ))}
                        </div>
                        {isMatching && (
                            <button onClick={onCancelMatch} className="btn-retro btn-coffee w-full py-2 rounded-xl font-bold text-xs mt-3">
                                取消匹配 ({matchTime}s)
                            </button>
                        )}
                        <p className="text-[10px] text-[#8c6b38] text-center mt-2 font-bold">
                           {(() => {
                               const sizes: BoardSize[] = [9, 13, 19];
                               const best = sizes.reduce((acc, size) => {
                                   const count = queueCounts[`${gameType}-${size}`] || 0;
                                   return count > acc.count ? { size, count } : acc;
                               }, { size: 9 as BoardSize, count: queueCounts[`${gameType}-9`] || 0 });
                               return (
                                   <>当前匹配最快：<span className="text-[#d84315] text-sm">{best.size} 路（{best.count}人）</span></>
                               );
                           })()}
                        </p>
                    </div>
                    <div className="bg-[#fff] p-4 rounded-xl border-2 border-[#e3c086]">
                        <p className="text-xs font-bold text-[#8c6b38] uppercase mb-2">我的房间号</p>
                        <div className="flex items-center justify-center gap-2">
                            <span className="text-3xl font-black text-[#5c4033] tracking-widest font-mono">{peerId || '...'}</span>
                            <button onClick={onCopyId} className="p-2 hover:bg-[#fcf6ea] rounded-full transition-colors">
                                {isCopied ? <Check size={18} className="text-green-500"/> : <Copy size={18} className="text-[#8c6b38]"/>}
                            </button>
                        </div>
                    </div>
                    <div className="relative">
                        <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                            <Hash size={18} className="text-[#8c6b38]" />
                        </div>
                        <input type="text" placeholder="输入对方房间号" value={remotePeerId} onChange={(e) => setRemotePeerId(e.target.value.replace(/[^0-9]/g, '').slice(0,6))} className="w-full pl-10 pr-4 py-3 bg-[#fff] border-2 border-[#e3c086] rounded-xl focus:border-[#5c4033] focus:ring-0 font-mono text-lg font-bold text-center outline-none transition-all text-[#5c4033]"/>
                    </div>
                    <button onClick={() => onJoinRoom(remotePeerId)} disabled={remotePeerId.length < 6 || onlineStatus === 'connecting' || onlineStatus === 'connected'} className="btn-retro btn-brown w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2">
                        {onlineStatus === 'connecting' ? '连接中...' : '加入房间'}
                    </button>
                </div>
             </div>
        </div>
    );
};
