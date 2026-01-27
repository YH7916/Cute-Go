import React from 'react';
import { X, User as UserIcon, Shield, LogOut, LogIn, Medal, Sword, Trophy, Disc, Utensils, Clover, Check, Heart, Crown, ListOrdered } from 'lucide-react';
import { isTapTapEnv } from '../utils/tapTapBridge';
import { Session } from '@supabase/supabase-js';
import { AchievementDef, UserAchievement } from '../types';
import { getRankBadge } from '../utils/helpers';

interface UserPageProps {
    isOpen: boolean;
    onClose: () => void;
    session: Session | null;
    userProfile: { nickname: string; elo: number; avatar_url?: string | null } | null;
    achievementsList: AchievementDef[];
    userAchievements: Record<string, any>; // using Record<string, any> to avoid strict type issues if UserAchievement structure varies slightly or use UserAchievement
    onLoginClick: () => void;
    onSignOutClick: () => void;
    onTapTapLeaderboardClick?: () => void;
    onUpdateNickname?: (newNickname: string) => void;
}

export const UserPage: React.FC<UserPageProps> = ({
    isOpen,
    onClose,
    session,
    userProfile,
    achievementsList,
    userAchievements,
    onLoginClick,
    onSignOutClick,
    onTapTapLeaderboardClick,
    onUpdateNickname
}) => {
    const [isEditing, setIsEditing] = React.useState(false);
    const [tempNickname, setTempNickname] = React.useState(userProfile?.nickname || '');

    React.useEffect(() => {
        if (userProfile?.nickname) {
            setTempNickname(userProfile.nickname);
        }
    }, [userProfile?.nickname]);

    if (!isOpen) return null;

    const handleSave = () => {
        if (tempNickname.trim() && onUpdateNickname) {
            onUpdateNickname(tempNickname.trim());
            setIsEditing(false);
        }
    };

    return (
        <div className="absolute inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-[#fcf6ea] rounded-[2rem] w-full max-w-sm landscape:max-w-3xl shadow-2xl border-[6px] border-[#8c6b38] flex flex-col max-h-[90vh] overflow-hidden relative">
            {/* Header */}
            <div className="bg-[#fcf6ea] border-b-2 border-[#e3c086] border-dashed p-4 landscape:p-3 flex justify-between items-center shrink-0">
                <h2 className="text-2xl font-black text-[#5c4033] tracking-wide">我的资料</h2>
                <button onClick={onClose} className="text-[#8c6b38] hover:text-[#5c4033] bg-[#fff] rounded-full p-2 border-2 border-[#e3c086] transition-colors"><X size={20}/></button>
            </div>

            <div className="p-6 landscape:p-4 overflow-y-auto custom-scrollbar flex flex-col landscape:grid landscape:grid-cols-2 landscape:gap-4 gap-6">
                
                {/* Left Column: Profile & Actions */}
                <div className="flex flex-col gap-6 landscape:gap-4">
                    <div className="bg-[#fff]/60 p-4 rounded-2xl border border-[#e3c086] flex items-center justify-between gap-4">
                        <div className="flex items-center gap-4">
                            <div className="w-14 h-14 bg-[#5c4033] rounded-full flex items-center justify-center text-[#fcf6ea] border-2 border-[#8c6b38] overflow-hidden">
                                {userProfile?.avatar_url ? (
                                    <img src={userProfile.avatar_url} alt="头像" className="w-full h-full object-cover" />
                                ) : (
                                    <UserIcon size={24} />
                                )}
                            </div>
                            <div className="flex flex-col flex-1">
                                <div className="flex items-center gap-2">
                                    {isEditing ? (
                                        <div className="flex items-center gap-1 w-full">
                                            <input 
                                                type="text" 
                                                value={tempNickname}
                                                onChange={(e) => setTempNickname(e.target.value)}
                                                className="bg-white border-2 border-[#e3c086] rounded px-2 py-0.5 text-xs font-bold text-[#5c4033] w-full focus:outline-none focus:border-[#8c6b38]"
                                                maxLength={20}
                                                autoFocus
                                            />
                                            <button onClick={handleSave} className="p-1 hover:bg-green-100 text-green-600 border-2 border-green-200 rounded transition-colors"><Check size={12} /></button>
                                            <button onClick={() => { setIsEditing(false); setTempNickname(userProfile?.nickname || ''); }} className="p-1 hover:bg-red-100 text-red-600 border-2 border-red-200 rounded transition-colors"><X size={12} /></button>
                                        </div>
                                    ) : (
                                        <span className="text-sm font-black text-[#5c4033]">{userProfile?.nickname || '未登录'}</span>
                                    )}
                                </div>
                                <span className="text-xs font-bold text-[#8c6b38] bg-[#e3c086]/20 px-2 py-0.5 rounded inline-flex items-center gap-1">
                                    <Shield size={12} /> Rating: {userProfile?.elo ?? '—'}
                                </span>
                            </div>
                        </div>
                        {(() => {
                            const badge = getRankBadge(userProfile?.elo ?? 0);
                            return (
                                <div className={`w-9 h-9 rounded-full bg-white border-2 border-[#e3c086] flex items-center justify-center ${badge.color}`} title={badge.label}>
                                    <badge.Icon size={18} />
                                </div>
                            );
                        })()}
                    </div>

                    <div className="bg-[#fff] p-4 rounded-2xl border-2 border-[#e3c086] flex flex-col gap-3">
                        <div className="flex items-center justify-between text-xs font-bold text-[#8c6b38]">
                            <span>账号状态</span>
                            <span className="text-[#5c4033]">{session ? '已登录' : '未登录'}</span>
                        </div>

                        {session ? (
                            <div className="flex flex-col gap-2">
                                <button onClick={() => setIsEditing(true)} className="btn-retro w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2 bg-[#ffcc66] border-[#e3b044] text-[#5c4033]">
                                    <UserIcon size={16}/> 修改昵称
                                </button>
                                <button onClick={onSignOutClick} className="btn-retro btn-brown w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2">
                                    <LogOut size={16}/> 退出登录
                                </button>
                                {isTapTapEnv() && (
                                    <button onClick={onTapTapLeaderboardClick} className="btn-retro w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2 bg-[#00cccc] border-[#009999] text-white">
                                        <ListOrdered size={16}/> TapTap 排行榜
                                    </button>
                                )}
                            </div>
                        ) : (
                            <button onClick={onLoginClick} className="btn-retro btn-brown w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2">
                                <LogIn size={16}/> 登录 / 注册
                            </button>
                        )}
                    </div>
                </div>

                {/* Right Column: Achievements */}
                <div className="bg-[#fff] p-4 rounded-2xl border-2 border-[#e3c086] flex flex-col gap-3 max-h-[300px] landscape:max-h-full overflow-y-auto custom-scrollbar">
                    <div className="flex items-center gap-2 mb-1 shrink-0">
                        <Medal size={16} className="text-[#8c6b38]" />
                        <span className="text-sm font-bold text-[#5c4033]">成就墙</span>
                        <span className="text-xs font-bold text-[#8c6b38] ml-auto">
                            {Object.values(userAchievements).filter((u: any) => u.is_unlocked).length} / {achievementsList.length}
                        </span>
                    </div>

                    <div className="grid grid-cols-1 gap-2">
                        {achievementsList.map((ach) => {
                            const unlocked = userAchievements[ach.code]?.is_unlocked;
                            return (
                                <div key={ach.code} className={`flex items-center gap-3 p-2 rounded-xl border-2 transition-all ${unlocked ? 'bg-[#fff8e1] border-[#ffca28]' : 'bg-gray-50 border-gray-200 opacity-60 grayscale'}`}>
                                    <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 ${unlocked ? 'bg-[#ffecb3] border-[#ffc107] text-[#5c4033]' : 'bg-gray-200 border-gray-300 text-gray-400'}`}>
                                        {ach.icon === 'Sword' && <Sword size={18}/>}
                                        {ach.icon === 'Trophy' && <Trophy size={18}/>}
                                        {ach.icon === 'Disc' && <Disc size={18}/>}
                                        {ach.icon === 'Utensils' && <Utensils size={18}/>}
                                        {ach.icon === 'Clover' && <Clover size={18}/>}
                                        {ach.icon === 'Heart' && <Heart size={18}/>}
                                        {ach.icon === 'Medal' && <Medal size={18}/>}
                                        {ach.icon === 'Crown' && <Crown size={18}/>}
                                        {!['Sword','Trophy','Disc','Utensils','Clover','Heart','Medal','Crown'].includes(ach.icon) && <Trophy size={18}/>}
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="text-sm font-black text-[#5c4033]">{ach.name}</span>
                                        <span className="text-[10px] text-[#8c6b38]">{ach.description}</span>
                                    </div>
                                    {unlocked && <Check size={16} className="ml-auto text-green-500" />}
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
          </div>
        </div>
    );
};
