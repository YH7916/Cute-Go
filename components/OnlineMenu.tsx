import React, { useEffect, useState } from 'react';
import { Check, Copy, Hash, X, Globe } from 'lucide-react';
import { BoardSize } from '../types';
import { getPlatform } from '../services/platform';

interface OnlineMenuProps {
    isOpen: boolean;
    onClose: () => void;
    isMatching: boolean;
    onCancelMatch: () => void;
    onStartMatch: (size: BoardSize) => void;
    onCreateRoom: () => void;
    onJoinRoom: (roomId: string) => void;
    matchBoardSize: BoardSize;
    matchTime: number;
    onlineStatus: string;
    roomId: string | null;
    isCreatingRoom: boolean;
    isJoiningRoom: boolean;
}

export const OnlineMenu: React.FC<OnlineMenuProps> = ({
    isOpen,
    onClose,
    isMatching,
    onCancelMatch,
    onStartMatch,
    onCreateRoom,
    onJoinRoom,
    matchBoardSize,
    matchTime,
    onlineStatus,
    roomId,
    isCreatingRoom,
    isJoiningRoom,
}) => {
    const [joinRoomId, setJoinRoomId] = useState('');
    const [isCopied, setIsCopied] = useState(false);
    const platform = getPlatform();
    const canMatch = platform.isNative && platform.multiplayer.usesNativeMatchmaking;
    const isBusy = isMatching || isCreatingRoom || isJoiningRoom || onlineStatus === 'connecting' || onlineStatus === 'connected';

    useEffect(() => {
        if (!isCopied) return;
        const timer = window.setTimeout(() => setIsCopied(false), 1500);
        return () => window.clearTimeout(timer);
    }, [isCopied]);

    if (!isOpen) return null;

    return (
        <div className="absolute inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
             <div className="bg-[#fcf6ea] rounded-3xl p-6 w-full max-w-sm md:max-w-2xl shadow-2xl border-[6px] border-[#5c4033] relative overflow-hidden">
                <button onClick={() => { onClose(); if (isMatching) onCancelMatch(); }} className="absolute top-4 right-4 text-[#8c6b38] hover:text-[#5c4033] z-10"><X size={24}/></button>

                <div className="flex flex-col items-center mb-6">
                    <div className="w-16 h-16 bg-[#e3c086] rounded-full flex items-center justify-center text-[#5c4033] mb-3 border-2 border-[#5c4033]">
                        <Globe size={32} />
                    </div>
                    <h2 className="text-2xl font-black text-[#5c4033]">联机对战</h2>
                </div>

                {!canMatch && (
                    <p className="text-[11px] text-[#8c6b38] text-center mb-4 font-bold leading-5">
                        联机仅支持 TapTap 小游戏环境。
                    </p>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-4">
                        <p className="text-sm font-bold text-[#8c6b38] text-center md:text-left">快速匹配</p>
                        <div className="bg-[#fff] p-4 rounded-xl border-2 border-[#e3c086]">
                            <div className="grid grid-cols-3 gap-2">
                                {[9, 13, 19].map((size) => (
                                    <button
                                        key={size}
                                        onClick={() => onStartMatch(size as BoardSize)}
                                        disabled={!canMatch || isBusy}
                                        className={`btn-retro py-2 rounded-xl font-bold text-[10px] ${matchBoardSize === size ? 'bg-[#8c6b38] text-[#fcf6ea] border-[#5c4033]' : 'bg-[#fff] text-[#8c6b38] border-[#e3c086]'}`}
                                    >
                                        {size} 路
                                    </button>
                                ))}
                            </div>
                            {isMatching && (
                                <button onClick={onCancelMatch} className="btn-retro btn-coffee w-full py-2 rounded-xl font-bold text-xs mt-3">
                                    取消匹配 ({matchTime}s)
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="space-y-4">
                        <p className="text-sm font-bold text-[#8c6b38] text-center md:text-left">好友对战</p>
                        <div className="bg-[#fff] p-4 rounded-xl border-2 border-[#e3c086]">
                            <p className="text-[10px] font-bold text-[#8c6b38] uppercase mb-1">我的房间号</p>
                            <div className="flex items-center justify-center gap-2 mb-4">
                                {roomId ? (
                                    <>
                                        <span className="text-3xl font-black text-[#5c4033] tracking-widest font-mono">{roomId}</span>
                                        <button
                                            onClick={() => {
                                                void navigator.clipboard?.writeText(roomId);
                                                setIsCopied(true);
                                            }}
                                            className="p-2 hover:bg-[#fcf6ea] rounded-full transition-colors"
                                        >
                                            {isCopied ? <Check size={18} className="text-green-500"/> : <Copy size={18} className="text-[#8c6b38]"/>}
                                        </button>
                                    </>
                                ) : (
                                    <button
                                        onClick={onCreateRoom}
                                        disabled={!canMatch || isBusy}
                                        className="btn-retro btn-beige w-full py-3 rounded-xl font-bold text-sm"
                                    >
                                        {isCreatingRoom ? '创建中...' : '创建房间'}
                                    </button>
                                )}
                            </div>

                            <div className="relative mb-3">
                                <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                                    <Hash size={18} className="text-[#8c6b38]" />
                                </div>
                                <input
                                    type="text"
                                    placeholder="对方房间号"
                                    value={joinRoomId}
                                    onChange={(e) => setJoinRoomId(e.target.value.trim())}
                                    disabled={!canMatch || isBusy}
                                    className="w-full pl-10 pr-4 py-3 bg-[#fff] border-2 border-[#e3c086] rounded-xl focus:border-[#5c4033] focus:ring-0 font-mono text-lg font-bold text-center outline-none transition-all text-[#5c4033] placeholder:text-xs"
                                />
                            </div>
                            <button
                                onClick={() => onJoinRoom(joinRoomId)}
                                disabled={!canMatch || isBusy || !joinRoomId.trim()}
                                className="btn-retro btn-brown w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2 text-sm"
                            >
                                {isJoiningRoom || onlineStatus === 'connecting' ? '连接中...' : '加入房间'}
                            </button>
                        </div>
                    </div>
                </div>
             </div>
        </div>
    );
};
