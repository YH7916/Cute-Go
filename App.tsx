
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { GameBoard } from './components/GameBoard';
import { BoardSize } from './types';
import {
    createBoard,
    attemptMove,
    getAIMove,
    checkGomokuWin,
    calculateScore,
    calculateModelScore,
    calculateWinRate,
    serializeGame,
    deserializeGame,
    generateSGF,
    parseSGF,
    getBoardHash,
    cleanBoardWithTerritory, // [New]
    calculateGomokuWinRate // [New]
} from './utils/goLogic';
import { getAIConfig } from './utils/aiConfig';
import { Settings, User as UserIcon, Trophy, Feather, Egg, Crown, Brain, Cpu, Home, Heart as HeartIcon, Check } from 'lucide-react';

// Hooks
import { useWebKataGo } from './hooks/useWebKataGo';
import { useCloudKataGo } from './hooks/useCloudKataGo';
import { useAchievements } from './hooks/useAchievements';
import { useAppSettings } from './hooks/useAppSettings';
import { useGameState } from './hooks/useGameState';
import { useAudio } from './hooks/useAudio';
import { useTsumego } from './domains/tsumego/useTsumego';

// Utils
import { supabase } from './utils/supabaseClient';
import {
    tapLogin, getTapPlayerId, submitTapTapElo, openTapTapLeaderboard, isTapTapEnv, getAccountInfo, getTapUserInfo, disconnectTap, tapRequirePrivacyAuthorize, tapGetSetting, tapOpenPrivacyContract, tapGetPrivacySetting, tapCreateUserInfoButton
} from './utils/tapTapBridge';
import { BoardState, Player, Stone, GameMode, GameType, Difficulty, AchievementDef, UserAchievement, SignalMessage } from './types';
import { WORKER_URL, DEFAULT_DOWNLOAD_LINK, CURRENT_VERSION } from './utils/constants';
import { compareVersions, calculateElo, calculateNewRating, getAiRating, getRankBadge } from './utils/helpers';
import { logEvent } from './utils/logger';

// Components
import { ScoreBoard } from './components/ScoreBoard';
import { GameControls } from './components/GameControls';
import { SettingsModal, GameSettingsData } from './components/SettingsModal';
import { UserPage } from './components/UserPage';
import { OnlineMenu } from './components/OnlineMenu';
import { ImportExportModal } from './components/ImportExportModal';
import { EndGameModal } from './components/EndGameModal';
import { TutorialModal } from './components/TutorialModal';
import { PassConfirmationModal } from './components/PassConfirmationModal';
import { AnalysisPanel } from './components/AnalysisPanel';
import { OfflineLoadingModal } from './components/OfflineLoadingModal';
import { LoginModal } from './components/LoginModal';
import { AchievementNotification } from './components/AchievementNotification';
import { AboutModal } from './components/AboutModal';
import { TsumegoListModal, TsumegoSet } from './components/TsumegoListModal';
import TsumegoResultModal from './components/TsumegoResultModal';
import { parseSGFToTree, SGFNode } from './utils/sgfParser';
import { StartScreen } from './components/StartScreen';
import { TopBar } from './components/common/TopBar';
import { TsumegoHub } from './components/Tsumego/TsumegoHub';
import { TsumegoLevel, TsumegoCategory, fetchProblemManifest, fetchProblemSGF, getLevelsFromCategory } from './utils/tsumegoData';

import { SkinShopModal } from './components/SkinShopModal';
import { BOARD_THEMES, BoardThemeId } from './utils/themes';

import { Session } from '@supabase/supabase-js';

const App: React.FC = () => {
    // --- Hooks ---
    const settings = useAppSettings();
    const gameState = useGameState(settings.boardSize);
    const { playSfx, vibrate } = useAudio(settings.musicVolume, settings.hapticEnabled);

    // --- Local UI State ---
    const [showMenu, setShowMenu] = useState(false);
    const [showUserPage, setShowUserPage] = useState(false);
    const [showPassModal, setShowPassModal] = useState(false);
    const [showTutorial, setShowTutorial] = useState(false);
    const [showTsumegoList, setShowTsumegoList] = useState(false); // [New] Tsumego Modal
    const [isThinking, setIsThinking] = useState(false);
    const [useCloud, setUseCloud] = useState(false); // [New] Cloud AI Toggle (Changed default to Local)
    const [toastMsg, setToastMsg] = useState<string | null>(null);

    // Auto-dismiss toast after 3 seconds
    useEffect(() => {
        if (toastMsg) {
            const timer = setTimeout(() => {
                setToastMsg(null);
            }, 3000);
            return () => clearTimeout(timer);
        }
    }, [toastMsg]);

    // --- [New] Tsumego Refactor States ---
    const [tsumegoLives, setTsumegoLives] = useState(2);
    const [unlockedLevelIds, setUnlockedLevelIds] = useState<string[]>(() => {
        const saved = localStorage.getItem('unlocked_tsumego_levels');
        return saved ? JSON.parse(saved) : ['1-1'];
    });
    const [completedLevelIds, setCompletedLevelIds] = useState<string[]>(() => {
        const saved = localStorage.getItem('completed_tsumego_levels');
        return saved ? JSON.parse(saved) : [];
    });
    const [showTsumegoLevelSelector, setShowTsumegoLevelSelector] = useState(false);
    const [currentTsumegoLevel, setCurrentTsumegoLevel] = useState<TsumegoLevel | null>(null);
    const [showStartScreen, setShowStartScreen] = useState(!settings.skipStartScreen);
    const [showSkinShop, setShowSkinShop] = useState(false);

    // --- Tsumego State ---
    const [tsumegoRoot, setTsumegoRoot] = useState<SGFNode | null>(null);
    const [tsumegoCurrentNode, setTsumegoCurrentNode] = useState<SGFNode | null>(null);
    const [tsumegoCollection, setTsumegoCollection] = useState<SGFNode[] | null>(null);
    const [tsumegoSetTitle, setTsumegoSetTitle] = useState<string>('');
    const [tsumegoCategories, setTsumegoCategories] = useState<TsumegoCategory[]>([]);

    useEffect(() => {
        fetchProblemManifest().then(data => {
            setTsumegoCategories(data.filter((c: TsumegoCategory) => c.id === 'life_death'));
        }).catch(() => {});
    }, []);

    const [showTsumegoResult, setShowTsumegoResult] = useState(false);
    const [tsumegoIsCorrect, setTsumegoIsCorrect] = useState(false);
    const [tsumegoResultMsg, setTsumegoResultMsg] = useState('');
    const [tsumegoInstruction, setTsumegoInstruction] = useState<string | null>(null);

    // Ref to break circular dependency between executeMove and handleTsumegoMove
    const handleTsumegoMoveRef = useRef<(x: number, y: number) => boolean>(() => false);
    const executeMoveRef = useRef<(x: number, y: number, isRemote: boolean) => void>(() => {});

    // --- Tutorial Init Check ---
    useEffect(() => {
        const hasSeen = localStorage.getItem('cute_go_tutorial_seen');
        if (!hasSeen) {
            setShowTutorial(true);
        }
    }, []);

    // [DEBUG] Monitor showStartScreen changes
    useEffect(() => {
        console.log('[App] showStartScreen changed to:', showStartScreen);
    }, [showStartScreen]);

    // Auth & Profile
    const [session, setSession] = useState<Session | null>(null);
    const [userProfile, setUserProfile] = useState<{ nickname: string; elo: number; avatar_url?: string | null } | null>(null);
    const [showLoginModal, setShowLoginModal] = useState(false);
    const [isSyncing, setIsSyncing] = useState(false);

    // Online State
    const [showOnlineMenu, setShowOnlineMenu] = useState(false);
    const [isMatching, setIsMatching] = useState(false);
    const [matchTime, setMatchTime] = useState(0);
    const [matchBoardSize, setMatchBoardSize] = useState<BoardSize>(() => ([9, 13, 19].includes(settings.boardSize) ? settings.boardSize : 9));
    const [peerId, setPeerId] = useState<string>('');
    const [remotePeerId, setRemotePeerId] = useState<string>('');
    const [onlineStatus, setOnlineStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
    const [myColor, setMyColor] = useState<Player | null>(null);
    const [opponentProfile, setOpponentProfile] = useState<{ id: string; elo: number } | null>(null);
    const [copied, setCopied] = useState(false);
    const [gameCopied, setGameCopied] = useState(false);
    const [showTerritory, setShowTerritory] = useState(false); // [New] Territory Toggle

    // Import/Export
    const [showImportModal, setShowImportModal] = useState(false);
    const [importKey, setImportKey] = useState('');

    // [Fix SGF Export] Track initial setup stones (Handicap/AB/AW)
    const [initialStones, setInitialStones] = useState<{ x: number, y: number, color: Player }[]>([]);

    // About/Update
    const [showAboutModal, setShowAboutModal] = useState(false);

    const [checkingUpdate, setCheckingUpdate] = useState(false);
    const [updateMsg, setUpdateMsg] = useState('');
    const [downloadUrl, setDownloadUrl] = useState<string>(DEFAULT_DOWNLOAD_LINK);
    const [newVersionFound, setNewVersionFound] = useState(false);

    // Online Host State [New]
    const [isHostReady, setIsHostReady] = useState(false);

    // ELO Diff display
    const [eloDiffText, setEloDiffText] = useState<string | null>(null);
    const [eloDiffStyle, setEloDiffStyle] = useState<'gold' | 'normal' | 'negative' | null>(null);

    // --- Refs for Wrappers ---
    // Needed for WebRTC and Timeouts to access fresh state
    const boardSizeRef = useRef(settings.boardSize);
    const gameTypeRef = useRef(settings.gameType);
    const onlineStatusRef = useRef(onlineStatus);
    const myColorRef = useRef(myColor);

    // Sync Refs
    useEffect(() => { boardSizeRef.current = settings.boardSize; }, [settings.boardSize]);
    useEffect(() => { gameTypeRef.current = settings.gameType; }, [settings.gameType]);
    useEffect(() => { onlineStatusRef.current = onlineStatus; }, [onlineStatus]);
    useEffect(() => { myColorRef.current = myColor; }, [myColor]);

    // Other Refs
    const aiTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const aiTurnLock = useRef(false);
    const pendingEndGameRef = useRef(false); // [New] Waiting for KataGo endgame analysis
    const connectionTimeoutRef = useRef<number | null>(null);
    const matchTimerRef = useRef<number | null>(null);
    const heartbeatRef = useRef<number | null>(null);
    const pcRef = useRef<RTCPeerConnection | null>(null);
    const dataChannelRef = useRef<RTCDataChannel | null>(null);
    const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
    const isManualDisconnect = useRef<boolean>(false);
    const isSigningOutRef = useRef<boolean>(false);

    // --- Auth Logic ---
    const fetchProfile = async (userId: string) => {
        const { data } = await supabase
            .from('profiles')
            .select('nickname, elo_rating, avatar_url')
            .eq('id', userId)
            .single();
        if (data) setUserProfile({ nickname: data.nickname, elo: data.elo_rating });
    };

    useEffect(() => {
        // [New] 埋点：App 启动
        logEvent('app_start');

        supabase.auth.getSession().then(({ data: { session } }) => {
            if (session) {
                setSession(session);
                fetchProfile(session.user.id);
            } else {
                // [New] Check TapTap Persistence
                const savedTapId = localStorage.getItem('taptap_user_id');
                if (savedTapId) {
                    restoreTapTapSession(savedTapId);
                }
            }
        });

        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            if (session) {
                setSession(session);
                fetchProfile(session.user.id);
                setShowLoginModal(false);
            } else {
                // Only clear if not in TapTap mode
                if (localStorage.getItem('is_taptap_user') !== 'true') {
                    setSession(null);
                    setUserProfile(null);
                }
            }
        });
        return () => subscription.unsubscribe();
    }, []);

    const restoreTapTapSession = async (tapId: string) => {
        const { data: profile } = await supabase
            .from('profiles')
            .select('id, nickname, elo_rating, avatar_url')
            .eq('taptap_id', tapId)
            .single();
        if (profile) {
            setSession({
                user: { id: profile.id, email: '', app_metadata: {}, user_metadata: {}, aud: '', created_at: '' } as any,
                access_token: 'taptap-mock-token',
                refresh_token: '',
                expires_in: 3600,
                token_type: 'bearer'
            });
            setUserProfile({
                nickname: profile.nickname,
                elo: profile.elo_rating,
                avatar_url: profile.avatar_url
            });
        }
    };

    const normalizeEmail = (email: string) => email.trim().toLowerCase();

    const handleLogin = async (email: string, pass: string) => {
        const cleanEmail = normalizeEmail(email);
        const { error } = await supabase.auth.signInWithPassword({ email: cleanEmail, password: pass });
        if (error) {
            console.error('登录失败', { message: error.message, status: error.status, code: (error as any)?.code });
            const hint = error.message === 'Invalid login credentials'
                ? '账号不存在 / 密码错误 / 账号未确认或已被禁用'
                : error.message;
            alert('登录失败: ' + hint);
        }
    };

    const handleRegister = async (email: string, pass: string, nickname: string) => {
        const cleanEmail = normalizeEmail(email);
        const safeNickname = nickname?.trim() || '棋手';
        const { data, error } = await supabase.auth.signUp({
            email: cleanEmail, password: pass, options: { data: { nickname: safeNickname } }
        });
        if (error) alert('注册失败: ' + error.message);
        else {
            if (data?.session) {
                alert('注册成功！已自动登录。');
            } else {
                alert('注册成功！如仍无法登录，请检查该账号是否已确认或被禁用。');
            }
        }
    };

    const clearSupabaseLocalSession = () => {
        try {
            const keys = Object.keys(localStorage);
            for (const key of keys) {
                if (key.startsWith('sb-') && key.endsWith('-auth-token')) {
                    localStorage.removeItem(key);
                }
            }
            const sessionKeys = Object.keys(sessionStorage);
            for (const key of sessionKeys) {
                if (key.startsWith('sb-') && key.endsWith('-auth-token')) {
                    sessionStorage.removeItem(key);
                }
            }
        } catch { }
        setSession(null);
        setUserProfile(null);
    };
    const handleTapTapLogin = async () => {
        const tap = (window as any).tap;
        if (tap) {
            console.log('[App] tap object keys:', Object.keys(tap).join(', '));
            // Trigger privacy authorization check/prompt before login
            await tapRequirePrivacyAuthorize();
            const privacySetting = await tapGetPrivacySetting();
            console.log('[App] Privacy Settings:', JSON.stringify(privacySetting));
            const settings = await tapGetSetting();
            console.log('[App] Current Tap Settings:', JSON.stringify(settings));
        }

        const tapRes = await tapLogin();
        console.log('[App] TapTap Login Full Result:', JSON.stringify(tapRes, null, 2));

        // Attempt to get profile info (this might now trigger authorize via the bridge)
        const profileInfo = await getTapUserInfo();
        console.log('[App] Extra Profile Info:', JSON.stringify(profileInfo));

        // 1. Identify User & Basic Profile Info
        let tapId: string | null = null;
        let tapNickname: string | null = null;
        let tapAvatar: string | null = null;

        if (typeof tapRes === 'string' && tapRes.length > 0) {
            tapId = tapRes;
        } else if (tapRes && typeof tapRes === 'object') {
            tapId = tapRes.unionId || tapRes.union_id || tapRes.unionid ||
                tapRes.openid || tapRes.openId || tapRes.open_id ||
                tapRes.playerId || tapRes.player_id ||
                tapRes.user?.unionId || tapRes.user?.openid || tapRes.user?.id;

            tapNickname = tapRes.nickName || tapRes.nickname || tapRes.user?.nickName || tapRes.user?.nickname;
            tapAvatar = tapRes.avatarUrl || tapRes.avatar_url || tapRes.user?.avatarUrl || tapRes.user?.avatar_url;
        }

        // Merge extra profile info (e.g. from getUserInfo or getAccountInfoSync)
        if (profileInfo) {
            tapNickname = tapNickname || profileInfo.nickName || profileInfo.nickname;
            tapAvatar = tapAvatar || profileInfo.avatarUrl || profileInfo.avatar_url;
            tapId = tapId || profileInfo.openid || profileInfo.unionid || profileInfo.playerId;
        }

        // 2. High Priority Fallback: OnlineBattleManager (stable playerId)
        if (!tapId || tapId.length > 50) {
            console.log('[App] No stable ID in login result, fetching playerId via connect()...');
            const stableId = await getTapPlayerId();
            if (stableId) tapId = stableId;
        }

        if (!tapId) {
            console.log('[App] Still no ID, trying getAccountInfoSync or transient fields...');
            const acctInfo = getAccountInfo();
            if (acctInfo) {
                console.log('[App] getAccountInfoSync result:', JSON.stringify(acctInfo));
                tapId = acctInfo.openid || acctInfo.unionid || acctInfo.playerId;
            }

            // If REALLY nothing else, use the OAuth code (temporary session)
            if (!tapId && tapRes && typeof tapRes === 'object' && tapRes.code) {
                console.warn('[App] Falling back to transient OAuth code. This ID WILL change every login!');
                tapId = tapRes.code;
            }
        }

        console.log('[App] Final Identification - tapId:', tapId, 'Nickname:', tapNickname, 'Avatar:', tapAvatar ? 'Yes' : 'No');

        if (!tapId) {
            const keys = (tapRes && typeof tapRes === 'object') ? Object.keys(tapRes).join(',') : (typeof tapRes);
            const msg = (tapRes as any)?.errMsg || (tapRes as any)?.message || 'none';
            setToastMsg(`TapTap 登录失败: 无法获取任何标识符 (${keys}, ${msg})`);
            setTimeout(() => setToastMsg(null), 8000);
            return;
        }

        // 2. Profile Lookup
        console.log('[App] Searching for profile with taptap_id:', tapId);
        let { data: profile, error: searchError } = await supabase
            .from('profiles')
            .select('id, nickname, avatar_url, elo_rating')
            .eq('taptap_id', tapId)
            .single();

        if (searchError && searchError.code !== 'PGRST116') {
            console.error('[App] Supabase profile search error:', searchError);
            setToastMsg(`查询账户失败: ${searchError.message}`);
            setTimeout(() => setToastMsg(null), 8000);
            return;
        }

        // 3. Profile Creation or Incremental Update
        if (!profile) {
            console.log('[App] No profile found, creating new one...');
            const newProfile = {
                id: (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : Math.random().toString(36).substring(2) + Date.now().toString(36),
                taptap_id: tapId,
                nickname: tapNickname || `玩家_${tapId.substring(0, 6)}`,
                avatar_url: tapAvatar || null,
                elo_rating: 1200
            };
            const { data, error: insertError } = await supabase.from('profiles').insert([newProfile]).select().single();
            if (insertError) {
                console.error('[App] Failed to create TapTap profile:', insertError);
                setToastMsg(`档案创建失败: ${insertError.message}`);
                setTimeout(() => setToastMsg(null), 8000);
                return;
            }
            profile = data;
            setToastMsg('欢迎来到 Cute-Go！');
        } else {
            // [Incremental Sync] Update nickname/avatar if they changed in TapTap
            const needsUpdate = (tapNickname && profile.nickname !== tapNickname) || (tapAvatar && profile.avatar_url !== tapAvatar);
            if (needsUpdate) {
                const { data: updatedProfile } = await supabase
                    .from('profiles')
                    .update({
                        nickname: tapNickname || profile.nickname,
                        avatar_url: tapAvatar || profile.avatar_url
                    })
                    .eq('id', profile.id)
                    .select()
                    .single();
                if (updatedProfile) profile = updatedProfile;
            }
        }

        // 4. Finalized Session
        if (profile) {
            setSession({
                user: { id: profile.id, email: '', app_metadata: {}, user_metadata: {}, aud: '', created_at: '' } as any,
                access_token: 'taptap-mock-token',
                refresh_token: '',
                expires_in: 3600,
                token_type: 'bearer'
            });
            setUserProfile({
                nickname: profile.nickname,
                elo: profile.elo_rating,
                avatar_url: profile.avatar_url // Pass the avatar URL to the profile state
            });
            localStorage.setItem('is_taptap_user', 'true');
            localStorage.setItem('taptap_user_id', tapId);
            setToastMsg('TapTap 登录成功');
            setShowLoginModal(false);
        } else {
            setToastMsg('未知登录错误，请联系开发者');
            setTimeout(() => setToastMsg(null), 8000);
        }
    };

    const handleUpdateNickname = async (newNickname: string) => {
        if (!session?.user?.id) return;

        setToastMsg('正在更新昵称...');
        const { data: updated, error } = await supabase
            .from('profiles')
            .update({ nickname: newNickname })
            .eq('id', session.user.id)
            .select()
            .single();

        if (error) {
            console.error('[App] Nickname update failed:', error);
            setToastMsg(`更新失败: ${error.message}`);
        } else if (updated) {
            setUserProfile({
                nickname: updated.nickname,
                elo: updated.elo_rating,
                avatar_url: updated.avatar_url
            });
            setToastMsg('昵称修改成功！');
        }
        setTimeout(() => setToastMsg(null), 3000);
    };

    const handleSignOut = async () => {
        if (isSigningOutRef.current) return;
        isSigningOutRef.current = true;
        try {
            supabase.auth.stopAutoRefresh?.();
            await supabase.auth.signOut();
            setSession(null);
            setUserProfile(null);
            localStorage.removeItem('is_taptap_user');
            localStorage.removeItem('taptap_user_id');
            disconnectTap();
        } finally {
            isSigningOutRef.current = false;
        }
    };

    // --- Achievements ---
    const {
        newUnlocked, clearNewUnlocked, checkEndGameAchievements, checkMoveAchievements, achievementsList, userAchievements
    } = useAchievements(session?.user?.id);

    // --- AI Error Handler ---
    const handleAiError = useCallback((err: string) => {
        console.error("AI Error:", err);
        aiTurnLock.current = false;
        setIsThinking(false);
        setToastMsg(`AI 出错: ${err}`);
        setTimeout(() => setToastMsg(null), 5000);
    }, []);

    // --- AI Engines ---
    const webAiEngine = useWebKataGo({
        boardSize: settings.boardSize,
        onAiMove: (x, y) => {
            setTimeout(() => {
                if (aiTurnLock.current && !gameState.gameOver) executeMove(x, y, false);
            }, 200);
        },
        onAiPass: () => handlePass(false),
        onAiResign: () => endGame(settings.userColor, 'AI 认为胜率过低，投子认输'),
        onAiError: handleAiError,
        onAnalysisComplete: (data) => {
            if (!pendingEndGameRef.current) return;
            pendingEndGameRef.current = false;
            console.log('[App] KataGo Endgame Analysis:', data);
            const komi = settings.boardSize === 9 ? 6.5 : 7.5;
            const finalBoard = gameState.boardRef.current;
            const cleanedBoard = data.ownership ? cleanBoardWithTerritory(finalBoard, data.ownership) : finalBoard;
            const score = data.ownership
                ? calculateModelScore(finalBoard, data.ownership, komi)
                : calculateScore(cleanedBoard, undefined, komi);
            const lead = score.black - score.white;
            gameState.setBoard(cleanedBoard);
            gameState.setFinalScore(score);
            setShowPassModal(false);
            if (lead > 0) {
                endGame('black', `AI判定：黑领先 ${lead.toFixed(1)} 目`);
            } else {
                endGame('white', `AI判定：白领先 ${Math.abs(lead).toFixed(1)} 目`);
            }
        }
    });

    const cloudAiEngine = useCloudKataGo({
        onAiMove: (x, y) => {
            setTimeout(() => {
                if (aiTurnLock.current && !gameState.gameOver) executeMove(x, y, false);
            }, 200);
        },
        onAiPass: () => handlePass(false),
        onAiResign: () => endGame(settings.userColor, 'Cloud AI 认输'),
        onAiError: handleAiError
    });
    const {
        isThinking: isCloudThinking,
        aiWinRate: cloudWinRate,
        aiLead: cloudLead,
        aiTerritory: cloudTerritory, // Extract territory from cloud engine
        requestCloudAiMove,
        stopThinking: stopCloudThinking,
        errorMsg: cloudErrorMsg
    } = cloudAiEngine;

    const {
        isWorkerReady,
        isLoading: isWebLoading, // Legacy loading state (internal)
        isThinking: isWebThinking,
        aiWinRate: webWinRate,
        stopThinking: stopWebThinking,
        requestWebAiMove,
        isInitializing: isWebInitializing, // New
        initStatus: webInitStatus, // New
        aiLead: webLead,
        aiTerritory: webTerritory,
        initializeAI, requestAnalysis // New
    } = webAiEngine;

    const [isFirstRun] = useState(() => !localStorage.getItem('has_run_ai_before'));
    const [hideOfflineLoading, setHideOfflineLoading] = useState(false);
    const [isPageVisible, setIsPageVisible] = useState(!document.hidden);
    const showThinkingStatus = isThinking || isWebThinking || isCloudThinking;

    useEffect(() => {
        if (isWebInitializing) setHideOfflineLoading(false);
    }, [isWebInitializing]);

    // --- Visibility Handler (App Level) ---
    // Resets AI lock when going to background to prevent stuck state
    useEffect(() => {
        const handleAppVisibility = () => {
            const visible = !document.hidden;
            setIsPageVisible(visible);
            if (!visible) {
                // Reset AI lock if we go to background
                if (aiTurnLock.current) {
                    console.log("[App] App hidden, resetting AI lock");
                    aiTurnLock.current = false;
                    setIsThinking(false);
                    stopWebThinking(); // [Fix] Ensure WebAI is also stopped to prevent state mismatch
                }
                if (aiTimerRef.current) {
                    clearTimeout(aiTimerRef.current);
                    aiTimerRef.current = null;
                }
            }
        };
        document.addEventListener("visibilitychange", handleAppVisibility);
        return () => document.removeEventListener("visibilitychange", handleAppVisibility);
    }, []);

    // --- Cleanup ---
    useEffect(() => {
        return () => { if (aiTimerRef.current) clearTimeout(aiTimerRef.current); };
    }, []);

    // --- Helper Functions ---
    const getResignThreshold = (diff: typeof settings.difficulty) => {
        if (diff === 'Easy') return 0.02;
        if (diff === 'Medium') return 0.03;
        if (diff === 'Hard') return 0.05;
        return 0.05;
    };

    const getBoardHash = (b: typeof gameState.board) => {
        let str = '';
        for (let r = 0; r < b.length; r++) for (let c = 0; c < b.length; c++) str += b[r][c] ? (b[r][c]?.color === 'black' ? 'B' : 'W') : '.';
        return str;
    };

    const exitTsumegoMode = (nextGameMode: GameMode = 'PvP') => {
        if (settings.gameMode === 'Tsumego') {
            settings.setGameMode(nextGameMode);
        }
        setTsumegoRoot(null);
        setTsumegoCurrentNode(null);
        setShowTsumegoResult(false);
        setTsumegoInstruction(null);
        setShowTsumegoList(false);
        setShowTsumegoLevelSelector(false);
    };


    // --- Game Logic ---
    const resetGame = (keepOnline: boolean = false, explicitSize?: number, shouldBroadcast: boolean = true) => {
        const sizeToUse = explicitSize !== undefined ? explicitSize : settings.boardSize;
        if (explicitSize !== undefined) {
            settings.setBoardSize(sizeToUse);
            boardSizeRef.current = sizeToUse;
        }

        gameState.setBoard(createBoard(sizeToUse));
        gameState.setCurrentPlayer('black');
        gameState.setBlackCaptures(0);
        gameState.setWhiteCaptures(0);
        gameState.setLastMove(null);
        gameState.setGameOver(false);
        gameState.setWinner(null);
        gameState.setWinReason('');
        gameState.setConsecutivePasses(0);
        gameState.setPassNotificationDismissed(false);
        gameState.setFinalScore(null);
        gameState.setHistory([]);
        gameState.historyRef.current = []; // Sync Ref
        setInitialStones([]); // Clear setup
        setShowMenu(false);
        setShowPassModal(false);
        setIsThinking(false);
        aiTurnLock.current = false;
        gameState.setAppMode('playing');
        setEloDiffText(null);
        setEloDiffStyle(null);
        setTsumegoRoot(null);
        setTsumegoCurrentNode(null); // [Fix] Clear tsumego state on reset
        setShowTsumegoResult(false);
        setTsumegoInstruction(null);

        webAiEngine.resetAI();
        cloudAiEngine.resetAI();

        if (keepOnline && shouldBroadcast && onlineStatusRef.current === 'connected' && dataChannelRef.current?.readyState === 'open') {
            dataChannelRef.current.send(JSON.stringify({ type: 'RESTART' }));
        }

        if (!keepOnline) {
            isManualDisconnect.current = true;
            cleanupOnline();
            setMyColor(null);
        }
    };

    // --- Tsumego Logic (extracted to useTsumego hook) ---
    const {
        startTsumego,
        handleOpenTsumego,
        handleSelectTsumegoSet,
        handleNextTsumego,
        handleRetryTsumego,
        handleTsumegoMove,
        checkTsumegoStatus,
    } = useTsumego({
        state: {
            tsumegoRoot,
            tsumegoCurrentNode,
            tsumegoCategories,
            currentTsumegoLevel,
            showTsumegoResult,
        },
        setters: {
            setTsumegoRoot,
            setTsumegoCurrentNode,
            setTsumegoCollection,
            setTsumegoSetTitle,
            setShowTsumegoResult,
            setTsumegoIsCorrect,
            setTsumegoResultMsg,
            setTsumegoInstruction,
            setShowTsumegoLevelSelector,
            setCurrentTsumegoLevel,
            setCompletedLevelIds,
        },
        gameMode: settings.gameMode,
        userColor: settings.userColor,
        boardSize: settings.boardSize,
        currentPlayer: gameState.currentPlayer,
        gameOver: gameState.gameOver,
        boardRef: gameState.boardRef,
        currentPlayerRef: gameState.currentPlayerRef,
        setBoardSize: settings.setBoardSize,
        setBoard: gameState.setBoard,
        setCurrentPlayer: gameState.setCurrentPlayer,
        setLastMove: gameState.setLastMove,
        setGameMode: settings.setGameMode,
        setGameType: settings.setGameType,
        setUserColor: settings.setUserColor,
        resetGame,
        executeMove: (x, y, isRemote) => executeMoveRef.current(x, y, isRemote),
        setToastMsg,
        vibrate,
        playSfx,
    });

    // Keep ref in sync so executeMove can call handleTsumegoMove without circular dep
    handleTsumegoMoveRef.current = handleTsumegoMove;

    const handleApplySettings = (newSettings: GameSettingsData) => {
        vibrate(20);
        stopWebThinking();
        aiTurnLock.current = false;
        if (aiTimerRef.current) { clearTimeout(aiTimerRef.current); aiTimerRef.current = null; }

        exitTsumegoMode(newSettings.gameMode);
        settings.setBoardSize(newSettings.boardSize);
        settings.setGameType(newSettings.gameType);
        settings.setDifficulty(newSettings.difficulty);
        settings.setGameMode(newSettings.gameMode);
        settings.setUserColor(newSettings.userColor);

        if (newSettings.gameMode === 'PvAI' && userProfile?.elo !== undefined) {
            const lowAi = newSettings.difficulty === 'Easy' || newSettings.difficulty === 'Medium';
            if (userProfile.elo >= 1450 && lowAi) {
                setToastMsg('以你现在的实力，战胜这个难度的 AI 将无法获得积分，建议挑战更高级别或联机对战！');
                setTimeout(() => setToastMsg(null), 3500);
            }
        }

        // Logic reset
        resetGame(false, newSettings.boardSize); // This handles board creation

        // AI specific init
        if (newSettings.gameMode === 'PvAI' && newSettings.gameType === 'Go') {
            const aiConfig = getAIConfig(newSettings.difficulty);

            if (aiConfig.useModel && !webAiEngine.isWorkerReady && !webAiEngine.isInitializing) {
                const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
                if (!isMobile) {
                    console.log("[App] Triggering Lazy AI Init (Model Required)...");
                    webAiEngine.initializeAI({ needModel: true });
                } else {
                    console.log("[App] Mobile: Deferring AI Init to first move.");
                }
            } else if (!aiConfig.useModel && !webAiEngine.isWorkerReady && !webAiEngine.isInitializing) {
                console.log("[App] Triggering AI Init (Thin config, but loading model for safety)...");
                webAiEngine.initializeAI({ needModel: true });
            }
        }
    };

    // [New] Effect: Auto-trigger Lazy Init on Startup/Settings Change if needed
    // This handles the case where user reloads page with "Hard" mode active
    useEffect(() => {
        if (showStartScreen || gameState.appMode !== 'playing') return; // [Fix] Defer AI load

        if (settings.gameMode !== 'PvAI') {
            console.log("[App] Non-AI Mode detected: Terminating AI engines to save power.");
            webAiEngine.terminateAI();
            return;
        }

        // [Fix] Auto-trigger Local AI for Easy mode even if Cloud is enabled (since Cloud Easy now redirects to Local)
        if ((!useCloud || settings.difficulty === 'Easy') && settings.gameType === 'Go') {
            const aiConfig = getAIConfig(settings.difficulty);
            if (!webAiEngine.isWorkerReady && !webAiEngine.isInitializing) {
                const needModel = aiConfig.useModel;
                console.log(`[App] Auto-triggering AI Init (Playing Mode, needModel=${needModel})...`);
                webAiEngine.initializeAI({ needModel });
            }
        }
    }, [settings.gameMode, settings.difficulty, webAiEngine.isWorkerReady, webAiEngine.isInitializing, showStartScreen, useCloud, gameState.appMode]);

    // --- Start Screen Handler ---
    const handleStartGame = (mode: 'PvP' | 'PvAI', aiType?: 'cloud' | 'local') => {
        console.log('[handleStartGame] Called with mode:', mode, 'aiType:', aiType);
        console.log('[handleStartGame] Before: showStartScreen =', showStartScreen);

        // [FIX] Hide StartScreen FIRST to prevent UI blocking
        setShowStartScreen(false);
        exitTsumegoMode(mode);

        settings.setGameMode(mode);

        // Reset Logic
        resetGame(false, undefined, false);

        if (mode === 'PvAI') {
            if (aiType === 'cloud') {
                setUseCloud(true);
                // [Fix] If Easy, we use Local AI, so we must init it.
                if (settings.difficulty === 'Easy') {
                    const aiConfigLocal = getAIConfig(settings.difficulty);
                    if (!webAiEngine.isWorkerReady && !webAiEngine.isInitializing) {
                        const needModel = aiConfigLocal.useModel && settings.gameType === 'Go';
                        console.log(`[handleStartGame] Initializing Local AI for Cloud-Easy override...`);
                        webAiEngine.initializeAI({ needModel });
                    }
                }
            } else {
                setUseCloud(false);
                // Auto Init Lazy AI if needed
                const aiConfigLocal = getAIConfig(settings.difficulty);
                if (!webAiEngine.isWorkerReady && !webAiEngine.isInitializing) {
                    const needModel = aiConfigLocal.useModel;
                    console.log(`[handleStartGame] Initializing AI (needModel=${needModel})...`);
                    webAiEngine.initializeAI({ needModel });
                }
            }
            // Ensure User Color is respected or defaulted? 
            // Logic in resetGame uses defaults.
        } else {
            setUseCloud(false); // irrelevant for PvP but keep clean
            webAiEngine.terminateAI();
        }

        console.log('[handleStartGame] showStartScreen set to false');
        vibrate(20);
    };


    // --- Display Metrics Hooks (Moved Up to avoid TDZ in endGame) ---
    // Persist AI Run Flag
    useEffect(() => {
        if (isWorkerReady && !isWebLoading) {
            localStorage.setItem('has_run_ai_before', 'true');
        }
    }, [isWorkerReady, isWebLoading]);

    // Win Rate Calculation with Performance Optimization
    const displayWinRate = useMemo(() => {
        // [Optimized] Default to 50 if disabled or not applicable, preventing heavy calculation on every render
        if (!settings.showWinRate || gameState.gameOver || gameState.appMode !== 'playing') {
            return 50;
        }

        // Priority 1: Cloud AI
        if (useCloud && cloudWinRate !== 50) {
            const aiColor = settings.userColor === 'black' ? 'white' : 'black';
            return (aiColor === 'white') ? (100 - cloudWinRate) : cloudWinRate;
        }

        // Priority 2: Web Worker AI
        // Local worker values are already normalized to black's perspective.
        if (isWorkerReady && settings.gameMode === 'PvAI' && webWinRate !== 50) {
            return webWinRate;
        }

        // [Perf] Local heuristic removed — was calling heavy flood-fill on every board change
        return 50;
    }, [settings.showWinRate, gameState.gameOver, gameState.appMode, settings.gameType, settings.userColor, useCloud, cloudWinRate, isWorkerReady, settings.gameMode, webWinRate]);

    // Lead Calculation
    const displayLead = useMemo(() => {
        let lead: number | null = null;
        if (settings.gameMode === 'PvAI') {
            if (useCloud && cloudLead !== null) {
                const aiColor = settings.userColor === 'black' ? 'white' : 'black';
                lead = (aiColor === 'white') ? -cloudLead : cloudLead;
            }
            else if (webLead !== null && isWorkerReady) {
                lead = webLead;
            }
        }
        return lead;
    }, [settings.gameMode, useCloud, cloudLead, settings.userColor, webLead, isWorkerReady]);

    // Territory (Ownership)
    const displayTerritory = useMemo(() => {
        // [Optimized] Only calculate if enabled and in valid mode
        if (settings.gameType !== 'Go') return null;
        const aiColor = settings.userColor === 'black' ? 'white' : 'black';

        if (useCloud && cloudTerritory) {
            if (aiColor === 'white') {
                const flipped = new Float32Array(cloudTerritory.length);
                for (let i = 0; i < cloudTerritory.length; i++) {
                    flipped[i] = -cloudTerritory[i];
                }
                return flipped;
            }
            return cloudTerritory;
        }
        return webTerritory;
    }, [settings.gameMode, settings.userColor, useCloud, cloudTerritory, webTerritory, gameState.appMode]);

    // --- Tsumego End Check ---

    const endGame = useCallback(async (winnerColor: Player, reason: string) => {
        gameState.setGameOver(true);
        aiTurnLock.current = false;
        setIsThinking(false);
        if (aiTimerRef.current) { clearTimeout(aiTimerRef.current); aiTimerRef.current = null; }

        gameState.setWinner(winnerColor);
        gameState.setWinReason(reason);
        vibrate([50, 50, 50, 50]);
        playSfx('win');

        if (session?.user?.id && (settings.gameMode === 'PvAI' || onlineStatus === 'connected')) {
            const myPlayerColor = onlineStatus === 'connected' ? myColor : settings.userColor;

            // [Optimized] AI-Assisted Scoring: Remove Dead Stones
            let finalBoard = gameState.boardRef.current;
            if (settings.gameMode === 'PvAI' && displayTerritory && displayTerritory.length === settings.boardSize * settings.boardSize) {
                console.log("[EndGame] Applying AI Dead Stone Removal...");
                finalBoard = cleanBoardWithTerritory(finalBoard, displayTerritory);
                gameState.setBoard(finalBoard); // Visual Update for user
            }

            const komi = settings.boardSize === 9 ? 6.5 : 7.5;
            const currentScore = calculateScore(finalBoard, undefined, komi);
            checkEndGameAchievements({
                winner: winnerColor, myColor: myPlayerColor || 'black',
                score: currentScore, captures: { black: gameState.blackCaptures, white: gameState.whiteCaptures },
                boardSize: settings.boardSize
            });
        }

        if (onlineStatus === 'connected' && session && userProfile && opponentProfile && myColor) {
            const isWin = myColor === winnerColor;
            const result = isWin ? 'win' : 'loss';
            const newElo = calculateElo(userProfile.elo, opponentProfile.elo, result);
            const eloDiff = newElo - userProfile.elo;
            const diffText = eloDiff > 0 ? `+${eloDiff}` : `${eloDiff}`;
            gameState.setWinReason(`${reason} (积分 ${diffText})`);
            setEloDiffText(diffText);
            setEloDiffStyle(eloDiff > 0 ? 'normal' : 'negative');

            if (isWin) {
                const winnerNewElo = calculateElo(userProfile.elo, opponentProfile.elo, 'win');
                const loserNewElo = calculateElo(opponentProfile.elo, userProfile.elo, 'loss');
                await supabase.rpc('update_game_elo', { winner_id: session.user.id, loser_id: opponentProfile.id, winner_new_elo: winnerNewElo, loser_new_elo: loserNewElo });

                if (localStorage.getItem('is_taptap_user') === 'true') {
                    submitTapTapElo(winnerNewElo);
                }

                fetchProfile(session.user.id);
            } else {
                if (localStorage.getItem('is_taptap_user') === 'true') {
                    submitTapTapElo(newElo);
                }
                setTimeout(() => fetchProfile(session.user.id), 2000);
            }
        }
        else if (settings.gameMode === 'PvAI' && session && userProfile) {
            const isWin = winnerColor === settings.userColor;
            const resultScore: 0 | 0.5 | 1 = isWin ? 1 : 0;
            const aiRating = getAiRating(settings.difficulty);
            const newElo = calculateNewRating(userProfile.elo, aiRating, resultScore, 16);
            const eloDiff = newElo - userProfile.elo;
            const diffText = eloDiff > 0 ? `+${eloDiff}` : `${eloDiff}`;

            if (isWin && userProfile.elo <= 1200 && aiRating >= 1800) {
                gameState.setWinReason(`史诗级胜利！战胜了强敌！ (积分 ${diffText})`);
                setEloDiffStyle('gold');
            } else {
                gameState.setWinReason(`${reason} (积分 ${diffText})`);
                setEloDiffStyle(eloDiff > 0 ? 'normal' : 'negative');
            }
            setEloDiffText(diffText);
            await supabase.from('profiles').update({ elo_rating: newElo }).eq('id', session.user.id);

            if (localStorage.getItem('is_taptap_user') === 'true') {
                submitTapTapElo(newElo);
            }

            fetchProfile(session.user.id);
        }
    }, [gameState.blackCaptures, gameState.whiteCaptures, settings.boardSize, settings.difficulty, settings.gameMode, settings.userColor, session, userProfile, opponentProfile, myColor, onlineStatus, gameState.setGameOver, gameState.setWinner, gameState.setWinReason, vibrate, playSfx, gameState.boardRef, checkEndGameAchievements, calculateScore, calculateElo, setEloDiffText, setEloDiffStyle, supabase, calculateNewRating, fetchProfile, displayTerritory]);

    const executeMove = useCallback((x: number, y: number, isRemote: boolean) => {
        const currentBoard = gameState.boardRef.current;
        const activePlayer = gameState.currentPlayerRef.current;
        const currentType = gameTypeRef.current;

        let prevHash = null;
        if (gameState.history.length >= 1) {
            prevHash = getBoardHash(gameState.history[gameState.history.length - 1].board);
        }

        if (settings.gameMode === 'Tsumego' && !isRemote && tsumegoCurrentNode) {
            const isValid = handleTsumegoMoveRef.current(x, y);
            if (!isValid) return;
        }

        const result = attemptMove(currentBoard, x, y, activePlayer, currentType, prevHash);

        if (result) {
            try {
                if (result.captured > 0) {
                    playSfx('capture');
                    vibrate([20, 30, 20]);
                } else {
                    playSfx('move');
                    vibrate(15);
                }
            } catch (e) { }

            if (!isRemote && session?.user?.id) {
                try {
                    checkMoveAchievements({
                        x, y, color: activePlayer, moveNumber: gameState.history.length + 1, boardSize: settings.boardSize
                    });
                } catch (achError) { console.warn("Achievement Error:", achError); }
            }

            const newHistoryItem = {
                board: currentBoard,
                currentPlayer: activePlayer,
                blackCaptures: gameState.blackCaptures,
                whiteCaptures: gameState.whiteCaptures,
                lastMove: { x, y },
                consecutivePasses: gameState.consecutivePasses
            };

            if (!isRemote) {
                gameState.setHistory(prev => [...prev, newHistoryItem]);
            }

            gameState.boardRef.current = result.newBoard;
            gameState.historyRef.current = [...gameState.historyRef.current, newHistoryItem];

            gameState.setBoard(result.newBoard);
            gameState.setLastMove({ x, y });
            gameState.setConsecutivePasses(0);
            gameState.setPassNotificationDismissed(false);

            if (result.captured > 0) {
                if (activePlayer === 'black') gameState.setBlackCaptures(prev => prev + result.captured);
                else gameState.setWhiteCaptures(prev => prev + result.captured);
            }

            if (currentType === 'Gomoku' && checkGomokuWin(result.newBoard, { x, y })) {
                setTimeout(() => endGame(activePlayer, '五子连珠！'), 0);
                return;
            }

            const nextPlayer = activePlayer === 'black' ? 'white' : 'black';
            gameState.currentPlayerRef.current = nextPlayer;
            gameState.setCurrentPlayer(nextPlayer);

        } else {
            if (!isRemote) try { playSfx('error'); } catch (e) { }
        }
    }, [gameState.history, settings.gameMode, settings.gameType, settings.boardSize, gameState.blackCaptures, gameState.whiteCaptures, gameState.consecutivePasses, endGame, session?.user?.id, gameState.boardRef, gameState.currentPlayerRef, gameTypeRef, getBoardHash, attemptMove, playSfx, vibrate, checkMoveAchievements, gameState.setHistory, gameState.setBoard, gameState.setLastMove, gameState.setConsecutivePasses, gameState.setPassNotificationDismissed, checkGomokuWin, gameState.setCurrentPlayer, gameState.setBlackCaptures, gameState.setWhiteCaptures]);

    // Keep refs in sync after executeMove is defined
    executeMoveRef.current = executeMove;

    const triggerGoScoring = useCallback(() => {
        if (settings.gameType !== 'Go' || gameState.gameOver) return;

        if (isWebThinking) stopWebThinking();
        if (isCloudThinking) stopCloudThinking();
        setIsThinking(false);
        aiTurnLock.current = false;
        setShowPassModal(false);

        if (settings.gameMode === 'PvAI' && isWorkerReady) {
            console.log('[App] Requesting KataGo endgame analysis...');
            pendingEndGameRef.current = true;
            requestAnalysis(gameState.boardRef.current, gameState.currentPlayerRef.current, gameState.historyRef.current, settings.boardSize === 9 ? 6.5 : 7.5, 'Go');
            return;
        }

        setTimeout(() => {
            const komi = settings.boardSize === 9 ? 6.5 : 7.5;
            const score = displayTerritory
                ? calculateModelScore(gameState.boardRef.current, displayTerritory, komi)
                : calculateScore(gameState.boardRef.current, undefined, komi);
            const lead = score.black - score.white;
            gameState.setFinalScore(score);
            setShowPassModal(false);
            if (lead > 0) endGame('black', `计算机计分：黑领先 ${lead.toFixed(1)} 目`);
            else endGame('white', `计算机计分：白领先 ${Math.abs(lead).toFixed(1)} 目`);
        }, 0);
    }, [settings.gameType, gameState.gameOver, isWebThinking, isCloudThinking, settings.gameMode, isWorkerReady, requestAnalysis, settings.boardSize, displayTerritory, endGame]);

    const handlePass = useCallback((isRemote: boolean = false) => {
        console.log(`[App] handlePass Triggered. Remote: ${isRemote}, GameOver: ${gameState.gameOver}, Consecutive: ${gameState.consecutivePasses}, Current: ${gameState.currentPlayerRef.current}`);

        if (gameState.gameOver) return;
        vibrate(10);

        const isUserForceScoreInPvAI = !isRemote && settings.gameMode === 'PvAI' && settings.gameType === 'Go' && gameState.currentPlayerRef.current === settings.userColor;
        if (isUserForceScoreInPvAI) {
            triggerGoScoring();
            return;
        }

        // Fix: Reset AI state if it passed
        if (isRemote) {
            console.log("[App] AI Passed. Unlocking...");
            aiTurnLock.current = false;
            setIsThinking(false);
        }

        if (!isRemote) {
            const newItem = { board: gameState.boardRef.current, currentPlayer: gameState.currentPlayerRef.current, blackCaptures: gameState.blackCaptures, whiteCaptures: gameState.whiteCaptures, lastMove: null, consecutivePasses: gameState.consecutivePasses };
            gameState.setHistory(prev => [...prev, newItem]);
            gameState.historyRef.current = [...gameState.historyRef.current, newItem];
        }

        if (onlineStatusRef.current === 'connected' && !isRemote) {
            if (gameState.currentPlayerRef.current !== myColorRef.current) return;
            sendData({ type: 'PASS' });
        }

        const isUserPassInPvAI = !isRemote && settings.gameMode === 'PvAI' && settings.gameType === 'Go' && gameState.currentPlayerRef.current === settings.userColor;
        const isAIPassInPvAI = !isRemote && settings.gameMode === 'PvAI' && settings.gameType === 'Go' && gameState.currentPlayerRef.current !== settings.userColor;

        if (isUserPassInPvAI || isAIPassInPvAI) {
            // [Fix] Change to Standard 2-Pass Rule
            // Unlock AI thinking state
            if (isWebThinking) stopWebThinking(); // [Fix] Stop Web AI too
            setIsThinking(false);
            aiTurnLock.current = false;
        }

        gameState.setConsecutivePasses(prev => {
            const newPasses = prev + 1;
            console.log(`[App] Consecutive Passes: ${prev} -> ${newPasses}`);
            if (newPasses >= 2) {
                console.log("[App] Game End via 2 passes.");
                triggerGoScoring();
            }
            return newPasses;
        });
        gameState.setPassNotificationDismissed(false);

        // Check using CURRENT state value, not the one just scheduled to update.
        // If consecutivePasses was 0, it means the OTHER player (or previous turn) wasn't a pass.
        // So this is the 1st pass. We should switch turn.
        // If consecutivePasses was 1, it means the previous turn WAS a pass. 
        // This is the 2nd pass. Game ends (handled above).
        if (gameState.consecutivePasses < 1) {
            // [Fix] Use Ref to ensure we switch from the ACTUAL current player. 
            // (Or just use the closure variable if added to deps, but Ref is safer in async callbacks)
            const current = gameState.currentPlayerRef.current;
            const next = current === 'black' ? 'white' : 'black';
            console.log(`[App] Switching Player: ${current} -> ${next}`);
            gameState.setCurrentPlayer(next);
            gameState.currentPlayerRef.current = next;
            gameState.setLastMove(null);
        }
    }, [gameState.gameOver, settings.gameMode, settings.gameType, gameState.consecutivePasses, settings.userColor, isWebThinking, gameState.currentPlayer, triggerGoScoring]);

    const handleUndo = () => {
        if (gameState.history.length === 0 || isThinking || gameState.gameOver || onlineStatus === 'connected') return;
        vibrate(10);
        let stepsToUndo = 1;

        const isTsumego = settings.gameMode === 'Tsumego';

        // In PvAI, if it's user's turn (meaning AI just moved), undo 2 steps (AI + User).
        // In Tsumego, often we want to undo the AI response + our move if we made a mistake and AI punished.
        // If Tsumego is active, and the current player is the USER (meaning AI finished its response), we should undo 2 steps?
        // Or if we just made a move and AI hasn't responded yet (unlikely due to sync?), 1 step.

        if (settings.gameMode === 'PvAI' && settings.userColor === gameState.currentPlayer && gameState.history.length >= 2) stepsToUndo = 2;
        else if (settings.gameMode === 'PvAI' && settings.userColor !== gameState.currentPlayer && gameState.history.length >= 1) stepsToUndo = 1;
        // Tsumego Undo Logic:
        else if (isTsumego && gameState.history.length >= 2 && gameState.currentPlayer === settings.userColor) {
            // If it's my turn again, it means AI probably moved last. Undo 2 steps (My move + AI move).
            // But wait, if I made a WRONG move, and AI didn't move (toast says "Wrong"), then I'm still the current player (if incorrect move doesn't switch turn? handleTsumegoMove checks `nextNode`).
            // If `nextNode` is found, `setTsumegoCurrentNode` happens.
            // `executeMove` is called for AI.

            // If I made a valid move, AI responds. Turn goes Me -> AI -> Me. So 2 steps.
            stepsToUndo = 2;
        } else if (isTsumego) {
            stepsToUndo = 1;
        }

        // Safety
        if (gameState.history.length < stepsToUndo) stepsToUndo = gameState.history.length;

        const prev = gameState.history[gameState.history.length - stepsToUndo];
        gameState.setBoard(prev.board);
        gameState.setCurrentPlayer(prev.currentPlayer);
        gameState.setBlackCaptures(prev.blackCaptures);
        gameState.setWhiteCaptures(prev.whiteCaptures);
        gameState.setLastMove(prev.lastMove);
        gameState.setConsecutivePasses(prev.consecutivePasses);
        gameState.setPassNotificationDismissed(false);

        // [Fix] Revert Tsumego Node
        if (isTsumego && tsumegoCurrentNode) {
            let node = tsumegoCurrentNode;
            for (let i = 0; i < stepsToUndo; i++) {
                if (node.parent) node = node.parent;
            }
            setTsumegoCurrentNode(node);
        }

        // Reset AI Lock on Undo
        if (isWebThinking) stopWebThinking(); // [Fix] Abort current calculation
        aiTurnLock.current = false;
        setIsThinking(false);
        if (aiTimerRef.current) { clearTimeout(aiTimerRef.current); aiTimerRef.current = null; }


        gameState.setHistory(prevHistory => {
            const newHist = prevHistory.slice(0, prevHistory.length - stepsToUndo);
            gameState.historyRef.current = newHist; // Sync Ref
            return newHist;
        });
    };



    // --- AI Turn Trigger ---
    useEffect(() => {
        if (!isPageVisible || showStartScreen) return;
        if (gameState.appMode !== 'playing' || gameState.gameOver || showPassModal || settings.gameMode !== 'PvAI') return;
        const aiColor = settings.userColor === 'black' ? 'white' : 'black';
        const isLocalAi = !(settings.gameType === 'Go' && useCloud && settings.difficulty !== 'Easy');

        if (gameState.currentPlayer === aiColor) {
            if (aiTurnLock.current) {
                // Dev StrictMode or an interrupted init can leave the lock set while the worker is gone.
                // In that case, release the lock so this effect can resubmit the AI turn request.
                if (isLocalAi && !isWorkerReady && !isWebInitializing && !isWebThinking) {
                    console.warn("[App] AI turn lock was stale. Resetting and retrying local AI request.");
                    aiTurnLock.current = false;
                } else {
                    return;
                }
            }

            // [New Fix] Wait for AI to be ready if in Go mode
            // This prevents "AI requested but not ready" errors and missed moves on startup
            if (settings.gameType === 'Go' && !useCloud) {
                // [Modification] Allow falling through even if !isWorkerReady, so requestWebAiMove can trigger Lazy Init
            }
            // [Fix] All Go games now use the high-level path for robust Ko handling
            // Gomoku implementation moved to Worker -> Also High Level.
            const shouldUseHighLevelAI = true;

            if (shouldUseHighLevelAI) {
                const aiConfig = getAIConfig(settings.difficulty);
                if (!aiTurnLock.current) {
                    aiTurnLock.current = true;

                    const isEasyMode = settings.difficulty === 'Easy';

                    // Cloud is GO Only
                    if (settings.gameType === 'Go' && useCloud && !isEasyMode) {
                        // Cloud Mode - Optimized for Speed
                        // Use aiConfig simulations.
                        // [Fix] Reduce visits to lower difficulty as requested.
                        let sims = aiConfig.simulations;

                        if (isEasyMode) {
                            sims = 1; // Explicit 1 iteration for Easy + Cloud
                        } else {
                            // Medium/Hard
                            sims = Math.max(8, Math.floor(sims * 1.2));
                            if (sims > 100) sims = 100; // Cap at 100 for Hard
                        }

                        const komi = settings.boardSize === 9 ? 6.5 : 7.5;
                        requestCloudAiMove(
                            gameState.boardRef.current,
                            aiColor,
                            gameState.historyRef.current,
                            sims,
                            komi
                        );
                    } else {
                        // Web AI Request (Go or Gomoku)
                        let sims = aiConfig.simulations;

                        // Safety Check for Mobile? (Already handled in aiConfig)
                        if (sims < 1) sims = 1;

                        // Determine Komi based on board size
                        const komi = settings.boardSize === 9 ? 6.5 : 7.5;

                        const t = aiConfig.temperature ?? 0;

                        webAiEngine.requestWebAiMove(
                            gameState.boardRef.current,
                            aiColor,
                            gameState.historyRef.current,
                            sims,
                            komi,
                            settings.difficulty,
                            t, // Pass Temperature
                            settings.gameType as any // [New] Pass Game Type
                        );
                    }
                }
            }
        } else {
            // User turn, ensure lock is free
            if (gameState.currentPlayer === settings.userColor) aiTurnLock.current = false;
        }
    }, [gameState.currentPlayer, settings.gameMode, settings.userColor, gameState.board, gameState.gameOver, settings.gameType, settings.difficulty, showPassModal, gameState.appMode, isPageVisible, useCloud, requestCloudAiMove, isWorkerReady, isWebInitializing, isWebThinking, showStartScreen]);



    // --- Online Logic (Simplified & kept in App) ---
    // (Moving full online logic to separate file would be ideal but referencing refs and state setters is tricky)
    // We already moved UI to OnlineMenu. Here we keep the networking logic.

    const sendData = (msg: any) => { if (dataChannelRef.current?.readyState === 'open') dataChannelRef.current.send(JSON.stringify(msg)); };
    const cancelMatchmaking = async () => {
        if (matchTimerRef.current) { clearInterval(matchTimerRef.current); matchTimerRef.current = null; }
        if (heartbeatRef.current) { clearInterval(heartbeatRef.current); heartbeatRef.current = null; }
        setIsMatching(false); setMatchTime(0);
        if (peerId) await supabase.from('matchmaking_queue').delete().eq('peer_id', peerId);
        cleanupOnline();
    };

    const cleanupOnline = () => {
        if (channelRef.current) { supabase.removeChannel(channelRef.current); channelRef.current = null; }
        if (pcRef.current) { pcRef.current.close(); pcRef.current = null; }
        if (connectionTimeoutRef.current) { clearTimeout(connectionTimeoutRef.current); connectionTimeoutRef.current = null; }
        setOnlineStatus('disconnected');
        setOpponentProfile(null);
        setPeerId('');
        setRemotePeerId('');
        setIsHostReady(false);
    };

    const getIceServers = async () => {
        const publicStunServers = ["stun:stun.qq.com:3478", "stun:stun.miwifi.com:3478", "stun:stun.chat.bilibili.com:3478"];
        let turnServers = [];
        try { const res = await fetch(`${WORKER_URL}/ice-servers`, { method: 'POST' }); const data = await res.json(); if (data && data.iceServers) turnServers = data.iceServers; } catch (e) { }
        return [{ urls: publicStunServers }, ...turnServers];
    };

    const setupPeerConnection = async (roomId: string, isHost: boolean, shouldCreateDataChannel: boolean) => {
        if (pcRef.current) pcRef.current.close();
        const iceServers = await getIceServers();
        const pc = new RTCPeerConnection({ iceServers, iceTransportPolicy: 'all', bundlePolicy: 'max-bundle' });
        pcRef.current = pc;
        pc.oniceconnectionstatechange = () => {
            if (pc.iceConnectionState === 'connected') { if (connectionTimeoutRef.current) clearTimeout(connectionTimeoutRef.current); }
            else if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed') {
                setOnlineStatus('disconnected');
                if (!isManualDisconnect.current) alert("连接异常中断 (对方可能已离开)");
            }
        };
        pc.onicecandidate = (event) => { if (event.candidate) sendSignal(roomId, { type: 'ice', candidate: event.candidate.toJSON() }); };
        if (shouldCreateDataChannel) { const dc = pc.createDataChannel("game-channel"); setupDataChannel(dc, isHost); }
        else { pc.ondatachannel = (event) => setupDataChannel(event.channel, isHost); }
        return pc;
    };

    const sendSignal = async (roomId: string, payload: SignalMessage) => {
        try { await supabase.channel(`room_${roomId}`).send({ type: 'broadcast', event: 'signal', payload }); } catch (error) { }
    };

    const setupDataChannel = (dc: RTCDataChannel, isHost: boolean) => {
        dataChannelRef.current = dc;
        dc.onopen = () => {
            setOnlineStatus('connected'); setIsMatching(false); setShowOnlineMenu(false); setShowMenu(false); setShowStartScreen(false); settings.setGameMode('PvP');
            if (isHost) {
                setMyColor('white');
                resetGame(true, boardSizeRef.current, false);
                const syncPayload: any = { type: 'SYNC', boardSize: boardSizeRef.current, gameType: gameTypeRef.current, startColor: 'black' };
                if (session && userProfile) syncPayload.opponentInfo = { id: session.user.id, elo: userProfile.elo };
                dc.send(JSON.stringify(syncPayload));
            }
        };
        dc.onmessage = (e) => {
            const msg = JSON.parse(e.data);
            if (msg.type === 'MOVE') executeMove(msg.x, msg.y, true);
            else if (msg.type === 'PASS') handlePass(true);
            else if (msg.type === 'SYNC') {
                settings.setBoardSize(msg.boardSize);
                boardSizeRef.current = msg.boardSize;
                settings.setGameType(msg.gameType);
                setMyColor(msg.startColor);
                if (msg.opponentInfo) {
                    setOpponentProfile(msg.opponentInfo);
                    if (session && userProfile) dc.send(JSON.stringify({ type: 'SYNC_REPLY', opponentInfo: { id: session.user.id, elo: userProfile.elo } }));
                }
                resetGame(true, msg.boardSize, false);
                vibrate(20);
            }
            else if (msg.type === 'SYNC_REPLY') { if (msg.opponentInfo) setOpponentProfile(msg.opponentInfo); }
            else if (msg.type === 'RESTART') resetGame(true, undefined, false);
        };
        dc.onclose = () => {
            setOnlineStatus('disconnected'); setMyColor(null);
            if (!isManualDisconnect.current) alert("与对方的连接已断开");
        };
    };

    const startMatchmaking = async (sizeOverride?: BoardSize) => {
        if (!session || !userProfile) { setShowLoginModal(true); return; }
        const sizeToMatch = sizeOverride ?? matchBoardSize;
        if (onlineStatus === 'connected') return;
        if (isMatching) { if (sizeToMatch === matchBoardSize) return; await cancelMatchmaking(); }

        setMatchBoardSize(sizeToMatch); settings.setBoardSize(sizeToMatch); boardSizeRef.current = sizeToMatch;
        setIsMatching(true); setMatchTime(0);

        const myTempPeerId = Math.floor(100000 + Math.random() * 900000).toString();
        setPeerId(myTempPeerId);
        matchTimerRef.current = window.setInterval(() => setMatchTime(prev => prev + 1), 1000);

        // ... findOpponent Logic condensed ...
        // (Full logic omitted for brevity in this thought trace but will be in actual output)
        // Re-implementing simplified version:
        const myElo = userProfile.elo;
        try {
            // Mocking finding logic for simplicity here, assuming Supabase calls mostly identical
            const { data: opponents } = await supabase
                .from('matchmaking_queue')
                .select('id')
                .eq('game_type', settings.gameType)
                .eq('board_size', sizeToMatch)
                .neq('user_id', session.user.id)
                .limit(1);
            // ...
            // Actually, I should just copy the logic.
            // But wait, the previous code block logic is good. I will reuse it.
            initMatchmaking(sizeToMatch, myTempPeerId, myElo);
        } catch (e) { cancelMatchmaking(); }
    };

    // Split initMatchmaking to keep cleaner
    const initMatchmaking = async (sizeToMatch: number, myTempPeerId: string, myElo: number) => {
        const findOpponent = async (attempt: number): Promise<any> => {
            const range = attempt === 1 ? 100 : (attempt === 2 ? 300 : 9999);
            const activeSince = new Date(Date.now() - 15000).toISOString();
            const { data: opponents } = await supabase
                .from('matchmaking_queue')
                .select('id, user_id, elo_rating, peer_id')
                .eq('game_type', settings.gameType)
                .eq('board_size', sizeToMatch)
                .neq('user_id', session!.user.id)
                .gte('last_seen', activeSince)
                .lte('elo_rating', myElo + range)
                .limit(1);
            return opponents && opponents.length > 0 ? opponents[0] : null;
        };
        let opponent = await findOpponent(1);
        if (!opponent) { await new Promise(r => setTimeout(r, 1000)); opponent = await findOpponent(2); }

        if (opponent) {
            const { error } = await supabase.from('matchmaking_queue').delete().eq('id', opponent.id);
            if (!error) {
                setOpponentProfile({ id: opponent.user_id, elo: opponent.elo_rating });
                if (matchTimerRef.current) clearInterval(matchTimerRef.current);
                if (heartbeatRef.current) clearInterval(heartbeatRef.current); heartbeatRef.current = null;
                setIsMatching(false); setRemotePeerId(opponent.peer_id); setOnlineStatus('connecting');
                await joinRoom(opponent.peer_id, 'black');
                return;
            }
        }

        isManualDisconnect.current = false; cleanupOnline(); setOnlineStatus('connecting');
        const channel = supabase.channel(`room_${myTempPeerId}`);
        channelRef.current = channel;
        channel.on('broadcast', { event: 'signal' }, async ({ payload }: { payload: SignalMessage }) => {
            const pc = pcRef.current;
            if (payload.type === 'offer' && payload.sdp) {
                supabase.from('matchmaking_queue').delete().eq('peer_id', myTempPeerId).then();
                if (matchTimerRef.current) clearInterval(matchTimerRef.current);
                if (heartbeatRef.current) clearInterval(heartbeatRef.current); heartbeatRef.current = null;
                setIsMatching(false); setOnlineStatus('connecting');
                let hostPc = pc;
                if (!hostPc) hostPc = await setupPeerConnection(myTempPeerId, true, false);
                await hostPc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
                const answer = await hostPc.createAnswer();
                await hostPc.setLocalDescription(answer);
                await sendSignal(myTempPeerId, { type: 'answer', sdp: hostPc.localDescription! });
            }
            else if (payload.type === 'ice' && payload.candidate && pc) await pc.addIceCandidate(new RTCIceCandidate(payload.candidate));
        }).subscribe(async (status) => {
            if (status === 'SUBSCRIBED') {
                await supabase.from('matchmaking_queue').insert({ peer_id: myTempPeerId, game_type: settings.gameType, board_size: sizeToMatch, elo_rating: myElo, user_id: session!.user.id, last_seen: new Date().toISOString() });
                if (heartbeatRef.current) clearInterval(heartbeatRef.current);
                heartbeatRef.current = window.setInterval(async () => { await supabase.from('matchmaking_queue').update({ last_seen: new Date().toISOString() }).eq('peer_id', myTempPeerId); }, 5000);
                setOnlineStatus('disconnected'); // Waiting for offer
            }
        });
    };

    // --- Create Room (Restored) ---
    const createRoom = async () => {
        // 1. Clean up old connection
        isManualDisconnect.current = false;
        if (heartbeatRef.current) { clearInterval(heartbeatRef.current); heartbeatRef.current = null; }
        cleanupOnline();

        // 2. Generate new Room ID
        const id = Math.floor(100000 + Math.random() * 900000).toString();
        setPeerId(id);
        setIsHostReady(false);

        // 3. Subscribe to channel and wait for offer
        const channel = supabase.channel(`room_${id}`);
        channelRef.current = channel;

        channel.on('broadcast', { event: 'signal' }, async ({ payload }: { payload: SignalMessage }) => {
            let pc = pcRef.current;

            // As host, we receive 'offer'
            if (payload.type === 'offer' && payload.sdp) {
                if (!pc) pc = await setupPeerConnection(id, true, false); // true = I am host

                await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);

                // Reply with 'answer'
                await sendSignal(id, { type: 'answer', sdp: pc.localDescription! });
            }
            else if (payload.type === 'answer' && payload.sdp && pc) {
                await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
            }
            else if (payload.type === 'ice' && payload.candidate && pc) {
                await pc.addIceCandidate(new RTCIceCandidate(payload.candidate));
            }
        }).subscribe(status => {
            if (status === 'SUBSCRIBED') {
                setIsHostReady(true);
            }
        });
    };

    // Auto-create room when menu opens
    useEffect(() => {
        if (showOnlineMenu && !peerId && onlineStatus === 'disconnected') {
            createRoom();
        }
    }, [showOnlineMenu, peerId, onlineStatus]);

    const joinRoom = async (roomId?: string, forcedColor?: Player) => {
        const targetId = roomId || remotePeerId;
        if (!targetId) return;
        isManualDisconnect.current = false;
        if (heartbeatRef.current) { clearInterval(heartbeatRef.current); heartbeatRef.current = null; }
        cleanupOnline();
        setOnlineStatus('connecting');

        connectionTimeoutRef.current = window.setTimeout(() => {
            if (onlineStatusRef.current !== 'connected') {
                isManualDisconnect.current = true; cleanupOnline(); alert("连接超时：房间可能不存在或对方离线"); setOnlineStatus('disconnected');
            }
        }, 15000);

        const channel = supabase.channel(`room_${targetId}`);
        channelRef.current = channel;
        channel.on('broadcast', { event: 'signal' }, async ({ payload }: { payload: SignalMessage }) => {
            let pc = pcRef.current;
            if (payload.type === 'answer' && payload.sdp && pc) await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
            else if (payload.type === 'ice' && payload.candidate && pc) await pc.addIceCandidate(new RTCIceCandidate(payload.candidate));
        }).subscribe(async (status) => {
            if (status === 'SUBSCRIBED') {
                if (forcedColor) setMyColor(forcedColor);
                const newPc = await setupPeerConnection(targetId, false, true);
                const offer = await newPc.createOffer();
                await newPc.setLocalDescription(offer);
                await sendSignal(targetId, { type: 'offer', sdp: newPc.localDescription! });
            }
        });
    };

    // --- UI Interactions ---
    const handleIntersectionClick = useCallback((x: number, y: number) => {
        // [Debug] Click Logging
        console.log(`[Click] (${x}, ${y}) Mode: ${gameState.appMode}, Current: ${gameState.currentPlayer}, User: ${settings.userColor}, Lock: ${aiTurnLock.current}, Thinking: ${isThinking}`);

        if (gameState.appMode === 'review') return;
        if (gameState.appMode === 'setup') {
            const newBoard = gameState.board.map(row => row.map(s => s));
            if (gameState.setupTool === 'erase') { if (newBoard[y][x]) { newBoard[y][x] = null; playSfx('capture'); vibrate(10); } }
            else { newBoard[y][x] = { color: gameState.setupTool, x, y, id: `setup-${gameState.setupTool}-${Date.now()}` }; playSfx('move'); vibrate(15); }
            gameState.setBoard(newBoard); return;
        }

        if (gameState.gameOver) { console.log("Click ignored: Game Over"); return; }
        if (isThinking) { console.log("Click ignored: AI Thinking"); return; }

        const aiColor = settings.userColor === 'black' ? 'white' : 'black';

        if (onlineStatus !== 'connected' && settings.gameMode === 'PvAI' && gameState.currentPlayer === aiColor) {
            console.log("Click ignored: AI Turn", gameState.currentPlayer, aiColor);
            return;
        }

        if (onlineStatus === 'connected') { if (gameState.currentPlayer !== myColor) return; sendData({ type: 'MOVE', x, y }); }
        executeMove(x, y, false);
    }, [gameState.gameOver, settings.gameMode, gameState.currentPlayer, onlineStatus, myColor, isThinking, gameState.appMode, gameState.setupTool, gameState.board, settings.userColor, settings.gameType]);

    // --- Update Checker ---
    const handleCheckUpdate = async () => {
        setCheckingUpdate(true); setUpdateMsg(''); setNewVersionFound(false);
        try {
            const { data, error } = await supabase.from('app_config').select('value').eq('key', 'latest_release').single();
            if (error) { if (error.code === 'PGRST116') setUpdateMsg('未找到版本信息'); return; }
            if (data && data.value) {
                const remoteVersion = data.value.version;
                if (compareVersions(remoteVersion, CURRENT_VERSION) > 0) {
                    setUpdateMsg(`发现新版本: v${remoteVersion}`); setDownloadUrl(data.value.downloadUrl || DEFAULT_DOWNLOAD_LINK); setNewVersionFound(true);
                } else { setUpdateMsg('当前已是最新版本'); }
            }
        } catch (e) { setUpdateMsg('检查失败'); } finally { setCheckingUpdate(false); }
    };



    return (
        <div className="h-full w-full bg-[#f7e7ce] flex flex-col landscape:flex-row items-center relative select-none overflow-y-auto landscape:overflow-hidden text-[#5c4033] pb-safe">

            {toastMsg && (
                <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[80] bg-[#5c4033] text-[#fcf6ea] px-4 py-2 rounded-full text-xs font-bold shadow-lg border-2 border-[#8c6b38] animate-in fade-in">
                    {toastMsg}
                </div>
            )}

            {showStartScreen && (
                <StartScreen
                    onStartGame={handleStartGame}
                    onOpenTsumego={() => setShowTsumegoLevelSelector(true)}
                    onOpenTutorial={() => setShowTutorial(true)}
                    onOpenOnline={() => setShowOnlineMenu(true)}
                    onOpenImport={() => setShowImportModal(true)}
                    onOpenSettings={() => setShowMenu(true)}
                    onOpenAbout={() => setShowAboutModal(true)}
                    onStartSetup={() => {
                        setShowStartScreen(false);
                        exitTsumegoMode('PvP');
                        resetGame(false);
                        gameState.setAppMode('setup');
                    }}
                    onOpenUserPage={() => setShowUserPage(true)}
                    onOpenSkinShop={() => setShowSkinShop(true)}
                />
            )}

            <AchievementNotification newUnlocked={newUnlocked} clearNewUnlocked={clearNewUnlocked} />

            {/* --- BOARD AREA --- */}
            <div className="relative flex-grow h-[60%] landscape:h-full w-full landscape:w-auto landscape:flex-1 flex items-center justify-center p-2 order-2 landscape:order-1 min-h-0 min-w-0">
                <div className="w-full h-full max-w-full max-h-full aspect-square flex items-center justify-center">
                    <div
                        className="transform transition-transform w-full h-full relative"
                    >
                        <GameBoard
                            board={gameState.appMode === 'review' && gameState.history[gameState.reviewIndex] ? gameState.history[gameState.reviewIndex].board : gameState.board}
                            onIntersectionClick={handleIntersectionClick}
                            currentPlayer={gameState.currentPlayer}
                            lastMove={gameState.appMode === 'review' && gameState.history[gameState.reviewIndex] ? gameState.history[gameState.reviewIndex].lastMove : gameState.lastMove}
                            showQi={settings.showQi}
                            gameType={settings.gameType}
                            gameMode={settings.gameMode}
                            showCoordinates={settings.showCoordinates}
                            territory={displayTerritory}
                            showTerritory={showTerritory}
                            stoneSkin={settings.stoneSkin}
                            boardSkin={settings.boardSkin}
                            separatePieces={settings.separatePieces}
                        />
                    </div>
                </div>
                {(showThinkingStatus || webInitStatus) && (
                    <div className="absolute top-4 left-4 bg-white/80 px-4 py-2 rounded-full text-xs font-bold text-[#5c4033] animate-pulse border-2 border-[#e3c086] shadow-sm z-20">
                        {webInitStatus ? webInitStatus : (useCloud ? '云端 AI 正在计算...' : 'AI 正在思考...')}
                    </div>
                )}
                <PassConfirmationModal
                    consecutivePasses={gameState.consecutivePasses}
                    gameOver={gameState.gameOver}
                    passNotificationDismissed={gameState.passNotificationDismissed}
                    onDismiss={() => {
                        gameState.setPassNotificationDismissed(true);
                        // Force unlock state in case AI logic didn't clear it correctly
                        setIsThinking(false);
                        stopWebThinking(); // [Fix] Ensure WebAI is also stopped
                        aiTurnLock.current = false;
                    }}
                    onPass={() => handlePass(false)}
                />
            </div>

            {/* --- SIDEBAR --- */}
            <div
                className="w-full landscape:w-96 flex flex-col gap-4 pb-4 z-20 shrink-0 bg-[#f7e7ce] landscape:bg-[#f2e6d6] landscape:h-full landscape:border-l-4 landscape:border-[#e3c086] order-1 landscape:order-2 shadow-xl landscape:shadow-none"
            >
                <TopBar
                    leftButtons={<>
                        <button onClick={() => { exitTsumegoMode('PvP'); setShowStartScreen(true); vibrate(10); }} className="btn-retro btn-brown p-3 rounded-xl"><Home size={20} /></button>
                        <button onClick={() => { setShowUserPage(true); vibrate(10); }} className="btn-retro btn-brown p-3 rounded-xl"><UserIcon size={20} /></button>
                        <button onClick={() => { setShowMenu(true); vibrate(10); }} className="btn-retro btn-brown p-3 rounded-xl"><Settings size={20} /></button>
                    </>}
                    rightContent={<>
                        <span className="font-black text-[#5c4033] text-xl leading-tight flex items-center gap-2 tracking-wide">
                            {onlineStatus === 'connected' && (
                                <span className="relative flex h-2 w-2">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                                </span>
                            )}
                            {gameState.appMode === 'setup' ? '电子挂盘' : gameState.appMode === 'review' ? '复盘模式' : (settings.gameType === 'Go' ? '围棋' : '五子棋')}
                        </span>
                        {gameState.appMode === 'playing' && (
                            <span className="text-[10px] font-bold text-[#8c6b38] bg-[#e3c086]/30 px-2 py-1 rounded-full border border-[#e3c086] mt-1">
                                {settings.boardSize}路 • {settings.gameMode === 'PvP' ? '双人' : settings.difficulty} •
                                <button onClick={() => setUseCloud(!useCloud)} className="hover:underline ml-1">
                                    {onlineStatus === 'connected' ? '在线' : (settings.gameMode === 'PvAI' ? (useCloud ? '云端 AI' : '本地 AI') : '本地')}
                                </button>
                            </span>
                        )}
                    </>}
                />

                <div className="flex flex-col gap-4 px-4">
                    <ScoreBoard
                        currentPlayer={gameState.currentPlayer}
                        blackCaptures={gameState.blackCaptures}
                        whiteCaptures={gameState.whiteCaptures}
                        gameType={settings.gameType}
                        isThinking={showThinkingStatus}
                        showWinRate={settings.showWinRate && (settings.gameType === 'Gomoku' || settings.gameMode === 'PvP')} // [Updated] Only show simpler winrate for Gomoku or Local PvP
                        appMode={gameState.appMode}
                        gameOver={gameState.gameOver}
                        userColor={settings.userColor}
                        displayWinRate={displayWinRate}
                    />

                    {gameState.appMode === 'playing' && settings.gameMode === 'PvAI' && settings.showWinRate && settings.gameType === 'Go' && ( // [Updated] Show Analysis for ALL Go PvAI games
                        <AnalysisPanel
                            winRate={displayWinRate}
                            lead={displayLead}
                            isThinking={showThinkingStatus}
                            showTerritory={showTerritory}
                            onToggleTerritory={() => setShowTerritory(prev => !prev)}
                            userColor={settings.userColor}
                        />
                    )}

                    <GameControls
                        appMode={gameState.appMode}
                        setupTool={gameState.setupTool}
                        setSetupTool={gameState.setSetupTool}
                        finishSetup={() => {
                            gameState.setAppMode('playing');
                            gameState.setHistory([]);
                            gameState.historyRef.current = [];
                            aiTurnLock.current = false;
                            setIsThinking(false);
                        }}
                        reviewIndex={gameState.reviewIndex}
                        history={gameState.history}
                        setReviewIndex={gameState.setReviewIndex}
                        setAppMode={gameState.setAppMode}
                        setGameOver={gameState.setGameOver}
                        handleUndo={handleUndo}
                        handlePass={handlePass}
                        resetGame={(k) => resetGame(k)}
                        isThinking={showThinkingStatus}
                        gameOver={gameState.gameOver}
                        onlineStatus={onlineStatus}
                        currentPlayer={gameState.currentPlayer}
                        myColor={myColor}
                        consecutivePasses={gameState.consecutivePasses}

                        // Tsumego Props
                        isTsumego={settings.gameMode === 'Tsumego'}
                        hasPrevProblem={useMemo(() => {
                            if (!currentTsumegoLevel) return false;
                            const cat = tsumegoCategories.find(c => c.id === currentTsumegoLevel.category);
                            if (!cat) return false;
                            const currentFilename = currentTsumegoLevel.filename.replace(/\\/g, '/');
                            let fileList: string[] = [];
                            if (currentTsumegoLevel.groupName) {
                                const group = cat.children.find(c => (c as any).isGroup && c.name === currentTsumegoLevel.groupName);
                                if (group && (group as any).files) fileList = (group as any).files;
                            } else {
                                fileList = cat.children.filter(c => !(c as any).isGroup).map(c => (c as any).file);
                            }
                            const cleanCurrent = currentFilename.startsWith(cat.dirName + '/')
                                ? currentFilename.slice(cat.dirName.length + 1)
                                : currentFilename;
                            const idx = fileList.indexOf(cleanCurrent);
                            return idx > 0;
                        }, [currentTsumegoLevel, tsumegoCategories])}

                        hasNextProblem={useMemo(() => {
                            if (!currentTsumegoLevel) return false;
                            const cat = tsumegoCategories.find(c => c.id === currentTsumegoLevel.category);
                            if (!cat) return false;
                            const currentFilename = currentTsumegoLevel.filename.replace(/\\/g, '/');
                            let fileList: string[] = [];
                            if (currentTsumegoLevel.groupName) {
                                const group = cat.children.find(c => (c as any).isGroup && c.name === currentTsumegoLevel.groupName);
                                if (group && (group as any).files) fileList = (group as any).files;
                            } else {
                                fileList = cat.children.filter(c => !(c as any).isGroup).map(c => (c as any).file);
                            }
                            const cleanCurrent = currentFilename.startsWith(cat.dirName + '/')
                                ? currentFilename.slice(cat.dirName.length + 1)
                                : currentFilename;
                            const idx = fileList.indexOf(cleanCurrent);
                            return idx !== -1 && idx < fileList.length - 1;
                        }, [currentTsumegoLevel, tsumegoCategories])}

                        handlePrevProblem={() => {
                            // Logic similar to Next but index - 1
                            if (!currentTsumegoLevel) return;
                            const cat = tsumegoCategories.find(c => c.id === currentTsumegoLevel.category);
                            if (!cat) return;
                            const currentFilename = currentTsumegoLevel.filename.replace(/\\/g, '/');
                            let fileList: string[] = [];
                            if (currentTsumegoLevel.groupName) {
                                const group = cat.children.find(c => (c as any).isGroup && c.name === currentTsumegoLevel.groupName);
                                if (group) fileList = (group as any).files;
                            } else {
                                fileList = cat.children.filter(c => !(c as any).isGroup).map(c => (c as any).file);
                            }
                            const cleanCurrent = currentFilename.startsWith(cat.dirName + '/')
                                ? currentFilename.slice(cat.dirName.length + 1)
                                : currentFilename;
                            const idx = fileList.indexOf(cleanCurrent);

                            if (idx > 0) {
                                const prevFile = fileList[idx - 1];
                                const prevFull = `${cat.dirName}/${prevFile}`;
                                const prevLevel: TsumegoLevel = {
                                    id: `${cat.id}/${prevFile}`,
                                    title: `Problem ${idx}`, // idx + 1 - 1
                                    category: cat.id,
                                    groupName: currentTsumegoLevel.groupName,
                                    filename: prevFull,
                                    difficulty: 1,
                                };
                                setToastMsg("加载上一关...");
                                fetchProblemSGF(prevLevel.filename).then(sgf => {
                                    setCurrentTsumegoLevel(prevLevel);
                                    const nodes = parseSGFToTree(sgf);
                                    if (nodes && nodes.length > 0) startTsumego(nodes[0]);
                                    setToastMsg(null);
                                }).catch(() => setToastMsg("加载失败"));
                            }
                        }}
                        handleNextProblem={handleNextTsumego}
                        handleHint={() => {
                            if (!tsumegoCurrentNode) return;
                            const playerProp = gameState.currentPlayer === 'black' ? 'B' : 'W';
                            const playerColor = gameState.currentPlayer;

                            const hintKeywords = {
                                correct: ['正解', 'correct', 'right', 'success', 'succeed', '活', 'win', '手筋', '官子', '优'],
                                wrong: ['错', 'wrong', 'fail', 'failure', 'die', 'dead', '失败'],
                            };
                            const hasSuccess = (node: SGFNode): boolean => {
                                const c = node.properties['C']?.[0]?.toLowerCase() ?? '';
                                if (hintKeywords.correct.some(k => c.includes(k)) && !hintKeywords.wrong.some(k => c.includes(k))) return true;
                                if (hintKeywords.wrong.some(k => c.includes(k))) return false;
                                return node.children.some(child => hasSuccess(child));
                            };

                            // 1. First, look for immediate nodes marked "Correct"
                            let hintChild = tsumegoCurrentNode.children.find(c => {
                                const comment = c.properties['C'] ? c.properties['C'][0].toLowerCase() : '';
                                return hintKeywords.correct.some(k => comment.includes(k));
                            });

                            // 2. Recursive Search: Does any branch lead to success?
                            if (!hintChild) {
                                hintChild = tsumegoCurrentNode.children.find(c => hasSuccess(c));
                            }

                            // Fallback Logic:
                            if (!hintChild) {
                                const candidates = tsumegoCurrentNode.children.filter(c => {
                                    if (!c.properties[playerProp]) return false;
                                    const comment = c.properties['C'] ? c.properties['C'][0].toLowerCase() : '';
                                    const isWrong = hintKeywords.wrong.some(k => comment.includes(k));
                                    return !isWrong;
                                });

                                if (candidates.length > 0) {
                                    hintChild = candidates[0];
                                } else {
                                    hintChild = tsumegoCurrentNode.children.find(c => c.properties[playerProp]);
                                }
                            }

                            if (hintChild && hintChild.properties[playerProp]) {
                                const moveStr = hintChild.properties[playerProp][0];
                                if (moveStr && moveStr.length >= 2) {
                                    // Trim strictly to avoid issues
                                    const trimmed = moveStr.trim();
                                    const x = trimmed.charCodeAt(0) - 97;
                                    const y = trimmed.charCodeAt(1) - 97;

                                    // 1. Place Stone (Visual)
                                    const attempt = attemptMove(gameState.boardRef.current, x, y, playerColor);
                                    if (attempt) {
                                        gameState.setBoard(attempt.newBoard);
                                        gameState.setLastMove({ x, y });
                                        gameState.setCurrentPlayer(playerColor === 'black' ? 'white' : 'black');
                                        playSfx('move');

                                        // 2. Trigger Tsumego Logic
                                        handleTsumegoMove(x, y);
                                    }
                                }
                            } else {
                                setToastMsg("无更多提示 / 已是最后一步");
                                setTimeout(() => setToastMsg(null), 1500);
                            }
                        }}
                        showTerritory={showTerritory}
                        onToggleTerritory={() => {
                            const nextState = !showTerritory;
                            setShowTerritory(nextState);
                            if (nextState && gameState.appMode === 'review') {
                                const historySlice = gameState.history.slice(0, gameState.reviewIndex + 1);
                                const currentItem = gameState.history[gameState.reviewIndex];
                                const boardToAnalyze = currentItem ? currentItem.board : gameState.board;
                                // Make sure to determine the correct next player
                                const playerToAnalyze = currentItem
                                    ? (currentItem.currentPlayer === 'black' ? 'white' : 'black')
                                    : gameState.currentPlayer;

                                webAiEngine.requestAnalysis(
                                    boardToAnalyze,
                                    playerToAnalyze,
                                    historySlice,
                                    7.5, // Default Komi
                                    settings.gameType
                                );
                            }
                        }}
                    />
                </div>
            </div>

            {/* --- Modals --- */}
            <TutorialModal
                isOpen={showTutorial}
                onClose={() => {
                    setShowTutorial(false);
                    localStorage.setItem('cute_go_tutorial_seen', 'true');
                }}
            />

            <SettingsModal
                isOpen={showMenu}
                onClose={() => setShowMenu(false)}
                currentGameSettings={useMemo(() => ({
                    boardSize: settings.boardSize, gameType: settings.gameType, gameMode: settings.gameMode,
                    difficulty: settings.difficulty, userColor: settings.userColor
                }), [settings.boardSize, settings.gameType, settings.gameMode, settings.difficulty, settings.userColor])}
                onApplyGameSettings={handleApplySettings}
                showQi={settings.showQi} setShowQi={settings.setShowQi}
                showWinRate={settings.showWinRate} setShowWinRate={settings.setShowWinRate}
                showCoordinates={settings.showCoordinates} setShowCoordinates={settings.setShowCoordinates}
                musicVolume={settings.musicVolume} setMusicVolume={settings.setMusicVolume}
                hapticEnabled={settings.hapticEnabled} setHapticEnabled={settings.setHapticEnabled}
                vibrate={vibrate}
                skipStartScreen={settings.skipStartScreen} setSkipStartScreen={settings.setSkipStartScreen}
                onStartSetup={() => { exitTsumegoMode('PvP'); resetGame(false); gameState.setAppMode('setup'); setShowMenu(false); }}
                onOpenImport={() => { setShowImportModal(true); setShowMenu(false); }}
                onOpenOnline={() => setShowOnlineMenu(true)}
                onOpenAbout={() => { setShowAboutModal(true); setShowMenu(false); }}
                onOpenTutorial={() => { setShowTutorial(true); setShowMenu(false); }}
                onOpenTsumego={() => setShowTsumegoLevelSelector(true)}
                onOpenSkinShop={() => setShowSkinShop(true)}
                separatePieces={settings.separatePieces}
                setSeparatePieces={settings.setSeparatePieces}
            />

            <SkinShopModal
                isOpen={showSkinShop}
                onClose={() => setShowSkinShop(false)}
                currentBoardSkin={settings.boardSkin}
                currentStoneSkin={settings.stoneSkin}
                onSetBoardSkin={settings.setBoardSkin}
                onSetStoneSkin={settings.setStoneSkin}
            />

            {showTsumegoList && (
                <TsumegoListModal
                    onClose={() => setShowTsumegoList(false)}
                    onSelectSet={handleSelectTsumegoSet}
                    collection={tsumegoCollection}
                    currentSetTitle={tsumegoSetTitle}
                    onBackToSets={() => setTsumegoCollection(null)}
                    onSelectProblem={(node) => {
                        startTsumego(node);
                        setShowTsumegoList(false);
                    }}
                />
            )}

            <UserPage
                isOpen={showUserPage}
                onClose={() => setShowUserPage(false)}
                session={session}
                userProfile={userProfile}
                achievementsList={achievementsList}
                userAchievements={userAchievements}
                onLoginClick={() => { setShowLoginModal(true); setShowUserPage(false); }}
                onSignOutClick={handleSignOut}
                onTapTapLeaderboardClick={() => {
                    if (userProfile?.elo) {
                        submitTapTapElo(userProfile.elo);
                    }
                    openTapTapLeaderboard();
                }}
                onUpdateNickname={handleUpdateNickname}
            />

            <SkinShopModal
                isOpen={showSkinShop}
                onClose={() => setShowSkinShop(false)}
                currentBoardSkin={settings.boardSkin}
                currentStoneSkin={settings.stoneSkin}
                onSetBoardSkin={settings.setBoardSkin}
                onSetStoneSkin={settings.setStoneSkin}
            />

            <OnlineMenu
                isOpen={showOnlineMenu}
                onClose={() => setShowOnlineMenu(false)}
                isMatching={isMatching}
                onCancelMatch={cancelMatchmaking}
                onStartMatch={startMatchmaking}
                matchBoardSize={matchBoardSize}
                matchTime={matchTime}
                gameType={settings.gameType}
                peerId={peerId}
                isHostReady={isHostReady}
                onCopyId={() => { navigator.clipboard.writeText(peerId); setCopied(true); setTimeout(() => setCopied(false), 2000); vibrate(10); }}
                isCopied={copied}
                remotePeerId={remotePeerId}
                setRemotePeerId={setRemotePeerId}
                onJoinRoom={joinRoom}
                onlineStatus={onlineStatus}
            />

            <ImportExportModal
                isOpen={showImportModal}
                onClose={() => setShowImportModal(false)}
                importKey={importKey}
                setImportKey={setImportKey}
                onImport={() => {
                    // Try SGF first
                    if (importKey.trim().startsWith('(;')) {
                        const sgfState = parseSGF(importKey);
                        if (sgfState) {
                            exitTsumegoMode('PvP');
                            gameState.setBoard(sgfState.board);
                            gameState.setCurrentPlayer(sgfState.currentPlayer);
                            settings.setGameType(sgfState.gameType);
                            settings.setBoardSize(sgfState.boardSize);
                            gameState.setBlackCaptures(sgfState.blackCaptures);
                            gameState.setWhiteCaptures(sgfState.whiteCaptures);
                            // HISTORY & SETUP
                            gameState.setHistory(sgfState.history);
                            setInitialStones(sgfState.initialStones); // Restore initial stones

                            gameState.setGameOver(false);
                            gameState.setWinner(null);
                            gameState.setConsecutivePasses(0);
                            gameState.setAppMode('playing');
                            // If history exists, maybe jump to Review mode? Or stay in Playing?
                            // User usually wants to continue or review. Let's stay in Playing at end state.
                            setShowImportModal(false); playSfx('move'); vibrate(20);
                            return;
                        }
                    }

                    // Fallback to Legacy JSON
                    const gs = deserializeGame(importKey);
                    if (gs) {
                        exitTsumegoMode('PvP');
                        gameState.setBoard(gs.board); gameState.setCurrentPlayer(gs.currentPlayer); settings.setGameType(gs.gameType); settings.setBoardSize(gs.boardSize);
                        gameState.setBlackCaptures(gs.blackCaptures); gameState.setWhiteCaptures(gs.whiteCaptures); gameState.setHistory([]); gameState.setGameOver(false); gameState.setWinner(null);
                        setInitialStones([]);
                        gameState.setConsecutivePasses(0); gameState.setAppMode('playing'); setShowImportModal(false); playSfx('move'); vibrate(20);
                    } else alert('无效的棋谱格式 (支持 SGF 或 CuteGo 代码)');
                }}
                onCopy={() => {
                    // Changed to SGF Copy
                    // [Fix] Append current state to history for export (history lags by 1 move)
                    const fullHistory = [...gameState.history];
                    if (gameState.lastMove) {
                        fullHistory.push({ board: gameState.board, currentPlayer: gameState.currentPlayer, lastMove: gameState.lastMove } as any);
                    }
                    const s = generateSGF(fullHistory, settings.boardSize, 7.5, initialStones);

                    if (navigator.clipboard && navigator.clipboard.writeText) {
                        navigator.clipboard.writeText(s).then(() => {
                            setGameCopied(true); setTimeout(() => setGameCopied(false), 2000); vibrate(10);
                        }).catch(err => {
                            console.error('Clipboard failed', err);
                            alert("复制失败，请手动导出 SGF");
                        });
                    } else {
                        // Fallback
                        alert("浏览器限制，请使用下方‘导出 SGF’按钮");
                    }
                }}
                onExportSGF={() => {
                    // [Fix] Append current state
                    const fullHistory = [...gameState.history];
                    if (gameState.lastMove) {
                        fullHistory.push({ board: gameState.board, currentPlayer: gameState.currentPlayer, lastMove: gameState.lastMove } as any);
                    }
                    const sgf = generateSGF(fullHistory, settings.boardSize, 7.5, initialStones);

                    const blob = new Blob([sgf], { type: 'application/x-go-sgf' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `cutego_${new Date().getTime()}.sgf`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                    vibrate(10);
                }}
                isCopied={gameCopied}
            />

            <EndGameModal
                isOpen={gameState.gameOver && !showMenu}
                winner={gameState.winner}
                winReason={gameState.winReason}
                eloDiffText={eloDiffText}
                eloDiffStyle={eloDiffStyle}
                finalScore={gameState.finalScore}
                onRestart={() => resetGame(true)}
                onReview={() => { gameState.setAppMode('review'); gameState.setReviewIndex(gameState.history.length - 1); gameState.setGameOver(false); }}
            />

            <OfflineLoadingModal
                isInitializing={isWebInitializing && !hideOfflineLoading}
                isFirstRun={isFirstRun}
                onClose={() => { setHideOfflineLoading(true); localStorage.setItem('has_run_ai_before', 'true'); }}
            />

            <LoginModal
                isOpen={showLoginModal}
                onClose={() => setShowLoginModal(false)}
                onLogin={handleLogin}
                onRegister={handleRegister}
                onTapTapLogin={handleTapTapLogin}
            />

            <AboutModal
                isOpen={showAboutModal}
                onClose={() => setShowAboutModal(false)}
                checkingUpdate={checkingUpdate}
                updateMsg={updateMsg}
                newVersionFound={newVersionFound}
                downloadUrl={downloadUrl}
                onCheckUpdate={handleCheckUpdate}
                vibrate={vibrate}
            />

            {/* Tsumego Result Modal */}
            <TsumegoResultModal
                isOpen={showTsumegoResult}
                isCorrect={tsumegoIsCorrect}
                message={tsumegoResultMsg}
                onNext={handleNextTsumego}
                onRetry={handleRetryTsumego}
                onClose={() => setShowTsumegoResult(false)}
                hasNext={useMemo(() => {
                    if (!currentTsumegoLevel) return false;
                    const cat = tsumegoCategories.find(c => c.id === currentTsumegoLevel.category);
                    if (!cat) return false;

                    let fileList: string[] = [];
                    const currentFilename = currentTsumegoLevel.filename.replace(/\\/g, '/');

                    if (currentTsumegoLevel.groupName) {
                        const group = cat.children.find(c => (c as any).isGroup && c.name === currentTsumegoLevel.groupName);
                        if (group && (group as any).files) {
                            fileList = (group as any).files;
                        }
                    } else {
                        fileList = cat.children.filter(c => !(c as any).isGroup).map(c => (c as any).file);
                    }

                    const cleanCurrent = currentFilename.startsWith(cat.dirName + '/')
                        ? currentFilename.slice(cat.dirName.length + 1)
                        : currentFilename;

                    const idx = fileList.indexOf(cleanCurrent);
                    return idx !== -1 && idx < fileList.length - 1;
                }, [currentTsumegoLevel, tsumegoCategories])}
            />

            {/* Tsumego Hub (New) */}
            {showTsumegoLevelSelector && (
                <TsumegoHub
                    onClose={() => setShowTsumegoLevelSelector(false)}
                    completedLevelIds={completedLevelIds}
                    onSelectLevel={async (level) => {
                        try {
                            setToastMsg("正在加载...");
                            const sgf = await fetchProblemSGF(level.filename);

                            setCurrentTsumegoLevel(level);
                            setShowTsumegoLevelSelector(false);
                            setShowStartScreen(false);
                            settings.setGameMode('Tsumego');

                            const nodes = parseSGFToTree(sgf);
                            if (!nodes || nodes.length === 0) throw new Error("Invalid SGF");
                            const root = nodes[0];

                            // setTsumegoLives(level.category === 'life_death' ? 2 : 99); // Remove lives
                            startTsumego(root);

                            vibrate(20);
                            setToastMsg(null);
                        } catch (e) {
                            console.error(e);
                            setToastMsg("加载失败");
                            setTimeout(() => setToastMsg(null), 2000);
                        }
                    }}
                />
            )}

        </div>
    );
};

export default App;
