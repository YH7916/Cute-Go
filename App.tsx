
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { GameBoard } from './components/GameBoard';
import { BoardSize } from './types';
import { 
  createBoard,
  attemptMove, 
  getAIMove,
  checkGomokuWin, 
  calculateScore, 
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
import { Settings, User as UserIcon, Trophy, Feather, Egg, Crown, Brain, Cpu, Home } from 'lucide-react';

// Hooks
import { useKataGo, sliderToVisits, visitsToSlider } from './hooks/useKataGo';
import { useWebKataGo } from './hooks/useWebKataGo';
import { useCloudKataGo } from './hooks/useCloudKataGo';
import { useAchievements } from './hooks/useAchievements';
import { useAppSettings } from './hooks/useAppSettings';
import { useGameState } from './hooks/useGameState';
import { useAudio } from './hooks/useAudio';

// Utils
import { supabase } from './utils/supabaseClient';
import { tapLogin, getTapPlayerId, submitTapTapElo, openTapTapLeaderboard } from './utils/tapTapBridge';
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
    const [useCloud, setUseCloud] = useState(true); // [New] Cloud AI Toggle
    const [toastMsg, setToastMsg] = useState<string | null>(null);
    const [showStartScreen, setShowStartScreen] = useState(true);
    const [showSkinShop, setShowSkinShop] = useState(false);

    // --- Tsumego State ---
    const [tsumegoRoot, setTsumegoRoot] = useState<SGFNode | null>(null);
    const [tsumegoCurrentNode, setTsumegoCurrentNode] = useState<SGFNode | null>(null);
    const [tsumegoCollection, setTsumegoCollection] = useState<SGFNode[] | null>(null);
    const [tsumegoSetTitle, setTsumegoSetTitle] = useState<string>("");
    
    const [showTsumegoResult, setShowTsumegoResult] = useState(false);
    const [tsumegoIsCorrect, setTsumegoIsCorrect] = useState(false);
    const [tsumegoResultMsg, setTsumegoResultMsg] = useState("");
    const [tsumegoInstruction, setTsumegoInstruction] = useState<string | null>(null);

    // --- Tutorial Init Check ---
    useEffect(() => {
        const hasSeen = localStorage.getItem('cute_go_tutorial_seen');
        if (!hasSeen) {
            setShowTutorial(true);
        }
    }, []);

    // Auth & Profile
    const [session, setSession] = useState<Session | null>(null);
    const [userProfile, setUserProfile] = useState<{ nickname: string; elo: number } | null>(null);
    const [showLoginModal, setShowLoginModal] = useState(false);
    
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
    const [initialStones, setInitialStones] = useState<{x: number, y: number, color: Player}[]>([]); 

    // About/Update
    const [showAboutModal, setShowAboutModal] = useState(false);

    const [checkingUpdate, setCheckingUpdate] = useState(false);
    const [updateMsg, setUpdateMsg] = useState('');
    const [downloadUrl, setDownloadUrl] = useState<string>(DEFAULT_DOWNLOAD_LINK);
    const [newVersionFound, setNewVersionFound] = useState(false);

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
        const { data } = await supabase.from('profiles').select('*').eq('id', userId).single();
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
        const { data: profile } = await supabase.from('profiles').select('*').eq('taptap_id', tapId).single();
        if (profile) {
            setSession({
                user: { id: profile.id, email: '', app_metadata: {}, user_metadata: {}, aud: '', created_at: '' } as any,
                access_token: 'taptap-mock-token',
                refresh_token: '',
                expires_in: 3600,
                token_type: 'bearer'
            });
            setUserProfile({ nickname: profile.nickname, elo: profile.elo_rating });
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
        } catch {}
        setSession(null);
        setUserProfile(null);
    };

    const handleTapTapLogin = async () => {
        const tapRes = await tapLogin();
        console.log('[App] TapTap Login Result:', tapRes);

        // 1. Identify User
        let tapId: string | null = null;
        if (typeof tapRes === 'string' && tapRes.length > 0) {
            tapId = tapRes;
        } else if (tapRes && typeof tapRes === 'object') {
            tapId = tapRes.unionId || tapRes.union_id || tapRes.unionid ||
                    tapRes.openid || tapRes.openId || tapRes.open_id ||
                    tapRes.userId || tapRes.user_id || tapRes.id ||
                    tapRes.playerId || tapRes.player_id ||
                    tapRes.user?.unionId || tapRes.user?.openid || tapRes.user?.id ||
                    tapRes.code;
        }

        if (!tapId) {
            console.log('[App] No ID in login result, attempting getTapPlayerId fallback...');
            tapId = await getTapPlayerId();
        }

        if (!tapId) {
            const keys = (tapRes && typeof tapRes === 'object') ? Object.keys(tapRes).join(',') : (typeof tapRes);
            const msg = (tapRes as any)?.errMsg || (tapRes as any)?.message || 'none';
            setToastMsg(`TapTap 登录失败: 无法获取标识符 (${keys}, ${msg})`);
            setTimeout(() => setToastMsg(null), 8000);
            return;
        }

        // 2. Profile Lookup
        console.log('[App] Searching for profile with taptap_id:', tapId);
        let { data: profile, error: searchError } = await supabase
            .from('profiles')
            .select('*')
            .eq('taptap_id', tapId)
            .single();

        if (searchError && searchError.code !== 'PGRST116') {
            console.error('[App] Supabase profile search error:', searchError);
            setToastMsg(`查询账户失败: ${searchError.message}`);
            setTimeout(() => setToastMsg(null), 8000);
            return;
        }

        // 3. Profile Creation (if missing)
        if (!profile) {
            console.log('[App] No profile found, creating new one...');
            const newProfile = {
                id: (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : Math.random().toString(36).substring(2) + Date.now().toString(36),
                taptap_id: tapId,
                nickname: `玩家_${tapId.substring(0, 6)}`,
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
            setUserProfile({ nickname: profile.nickname, elo: profile.elo_rating });
            localStorage.setItem('is_taptap_user', 'true');
            localStorage.setItem('taptap_user_id', tapId);
            setToastMsg('TapTap 登录成功');
            setShowLoginModal(false);
        } else {
            setToastMsg('未知登录错误，请联系开发者');
            setTimeout(() => setToastMsg(null), 8000);
        }
    };

    const handleSignOut = async () => {
        if (isSigningOutRef.current) return;
        isSigningOutRef.current = true;
        try {
            supabase.auth.stopAutoRefresh?.();
            await supabase.auth.signOut();
            setSession(null);
            setUserProfile(null);
            localStorage.removeItem('is_taptap_user'); // Clear TapTap flag
            localStorage.removeItem('taptap_user_id');
        } finally {
            isSigningOutRef.current = false;
        }
    };

    // --- Achievements ---
    const { 
        newUnlocked, clearNewUnlocked, checkEndGameAchievements, checkMoveAchievements, achievementsList, userAchievements
    } = useAchievements(session?.user?.id);

    // --- AI Engines ---
    const electronAiEngine = useKataGo({
        boardSize: settings.boardSize,
        onAiMove: (x, y) => executeMove(x, y, false), 
        onAiPass: () => handlePass(false),
        onAiResign: () => endGame(settings.userColor, 'AI 认为差距过大，投子认输')
    });
    const { isAvailable: isElectronAvailable, aiWinRate: electronWinRate, isThinking: isElectronThinking, isInitializing, setIsInitializing } = electronAiEngine;

    const webAiEngine = useWebKataGo({
        boardSize: settings.boardSize,
        onAiMove: (x, y) => executeMove(x, y, false),
        onAiPass: () => handlePass(false),
        onAiResign: () => endGame(settings.userColor, 'AI 认为胜率过低，投子认输')
    });

    const cloudAiEngine = useCloudKataGo({
        onAiMove: (x, y) => executeMove(x, y, false),
        onAiPass: () => handlePass(false),
        onAiResign: () => endGame(settings.userColor, 'Cloud AI 认输')
    });
    const { 
        isThinking: isCloudThinking,
        aiWinRate: cloudWinRate,
        aiLead: cloudLead,
        requestCloudAiMove,
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
        initializeAI // New
    } = webAiEngine;

    const [isFirstRun] = useState(() => !localStorage.getItem('has_run_ai_before'));
    const [isPageVisible, setIsPageVisible] = useState(!document.hidden);
    const showThinkingStatus = isThinking || isElectronThinking || isWebThinking || isCloudThinking;

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
                     // Note: We don't stop electron/web engine here explicitly as they have their own handlers, 
                     // but we must unlock the App-level coordinator.
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
        for(let r=0; r<b.length; r++) for(let c=0; c<b.length; c++) str += b[r][c] ? (b[r][c]?.color==='black'?'B':'W') : '.';
        return str;
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

        if (isElectronAvailable && settings.gameType === 'Go') {
            electronAiEngine.resetAI(sizeToUse, 7.5);
        } else if (!isElectronAvailable) {
            webAiEngine.resetAI(); // [Fix] Clear WebAI state
        }

        if (keepOnline && shouldBroadcast && onlineStatusRef.current === 'connected' && dataChannelRef.current?.readyState === 'open') {
            dataChannelRef.current.send(JSON.stringify({ type: 'RESTART' }));
        }

        if (!keepOnline) { 
            isManualDisconnect.current = true;
            cleanupOnline(); 
            setMyColor(null); 
        }
    };

    const handleApplySettings = (newSettings: GameSettingsData) => {
        vibrate(20);
        stopWebThinking();
        aiTurnLock.current = false;
        if (aiTimerRef.current) { clearTimeout(aiTimerRef.current); aiTimerRef.current = null; }
        
        settings.setBoardSize(newSettings.boardSize);
        settings.setGameType(newSettings.gameType);
        settings.setDifficulty(newSettings.difficulty);
        settings.setGameMode(newSettings.gameMode);
        settings.setUserColor(newSettings.userColor);
        // maxVisits is updated immediately by slider in modal but we sync here just in case? 
        // No, modal updates temp state, we need to update global state.
        settings.setMaxVisits(newSettings.maxVisits);

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
        if (newSettings.gameMode === 'PvAI') {
            if (isElectronAvailable && newSettings.gameType === 'Go') {
                electronAiEngine.resetAI(newSettings.boardSize, 7.5);
                 if (newSettings.userColor === 'white') {
                   setTimeout(() => {
                        electronAiEngine.requestAiMove('black', newSettings.difficulty, newSettings.maxVisits, getResignThreshold(newSettings.difficulty)); 
                   }, 500);
                }
            } 
            else if (!isElectronAvailable && newSettings.gameType === 'Go') {
                // [Lazy Load] Trigger Initialization specific for H5
                // Check if this difficulty actually NEEDS the model
                const aiConfig = getAIConfig(newSettings.difficulty);
                
                if (aiConfig.useModel && !webAiEngine.isWorkerReady && !webAiEngine.isInitializing) {
                    const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
                    if (!isMobile) {
                        console.log("[App] Triggering Lazy AI Init (Model Required)...");
                        webAiEngine.initializeAI();
                    } else {
                        console.log("[App] Mobile: Deferring AI Init to first move.");
                    }
                    
                    // AI Move will be requested when init completes? 
                    // Or we just wait. The logic below checks locks.
                    // If we need AI to move FIRST (White), logic is usually in useEffect or manual trigger.
                    // For now, Init -> App waits.
                    // If user is White, AI should move. But AI is not ready. 
                    // We need a way to auto-start AI move after Init. 
                    // (Adding simple effect for this or trusting user to wait).
                    // Actually, if user is White, we need to trigger AI move once ready.
                    // Let's handle that in the `useEffect` that watches `isWorkerReady`.
                }
                
                // If AI is already ready, and user is White, trigger Logic?
                if (webAiEngine.isWorkerReady && newSettings.userColor === 'white') {
                    // Logic handled in AI Trigger Effect
                }
            }
        }
    };

    // [New] Effect: Auto-trigger Lazy Init on Startup/Settings Change if needed
    // This handles the case where user reloads page with "Hard" mode active
    useEffect(() => {
        if (showStartScreen || gameState.appMode !== 'playing') return; // [Fix] Defer AI load

        const isMobile = typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
        
        if (isMobile && settings.gameMode !== 'PvAI') {
            console.log("[App] Mobile detected (Non-AI Mode): Skipping Auto-Init.");
            return;
        }

        if (!isElectronAvailable && settings.gameMode === 'PvAI' && !useCloud && settings.gameType === 'Go') {
             const aiConfig = getAIConfig(settings.difficulty);
             if (aiConfig.useModel && !webAiEngine.isWorkerReady && !webAiEngine.isInitializing) {
                 console.log("[App] Auto-triggering AI Init (Playing Mode)...");
                 webAiEngine.initializeAI();
             }
        }
    }, [settings.gameMode, settings.difficulty, isElectronAvailable, webAiEngine.isWorkerReady, webAiEngine.isInitializing, showStartScreen, useCloud, gameState.appMode]);

    // --- Start Screen Handler ---
    const handleStartGame = (mode: 'PvP' | 'PvAI', aiType?: 'cloud' | 'local') => {
        settings.setGameMode(mode);
        
        // Reset Logic
        resetGame(false, undefined, false);

        if (mode === 'PvAI') {
             if (aiType === 'cloud') {
                 setUseCloud(true);
             } else {
                 setUseCloud(false);
                 // Auto Init Lazy AI if needed
                 if (!isElectronAvailable) {
                     const aiConfig = getAIConfig(settings.difficulty);
                     if (aiConfig.useModel && !webAiEngine.isWorkerReady && !webAiEngine.isInitializing) {
                         webAiEngine.initializeAI();
                     }
                 }
             }
             // Ensure User Color is respected or defaulted? 
             // Logic in resetGame uses defaults.
        } else {
             setUseCloud(false); // irrelevant for PvP but keep clean
        }
        
        setShowStartScreen(false);
        vibrate(20);
    };

    // --- Tsumego Logic ---
    const handleOpenTsumego = () => {
        setIsThinking(false);
        aiTurnLock.current = false;
        setShowMenu(false);
        setShowTsumegoList(true);
        setTsumegoCollection(null);
    };

    const handleSelectTsumegoSet = async (set: TsumegoSet) => {
        setToastMsg(`正在加载 ${set.title}...`);
        
        try {
            if (!set.filename) throw new Error("Filename is missing");

            const url = `/Tsumego/${set.filename}`;
            console.log(`[Tsumego] Fetching ${url}`);
            
            const res = await fetch(url);
            if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
            
            // Direct Text Load for SGF
            const text = await res.text();
            
            // Parse
            const roots = parseSGFToTree(text);
            if (roots.length > 0) {
                console.log(`[Tsumego] Parsed ${roots.length} problems.`);
                setTsumegoCollection(roots);
                setTsumegoSetTitle(set.title);
                setToastMsg(null);
            } else {
                throw new Error("Invalid SGF content or empty");
            }

        } catch (e: any) {
            console.error("Tsumego Load Error", e);
            setToastMsg(`加载失败: ${e.message}`);
            setTimeout(() => setToastMsg(null), 3000);
        }
    };

    const startTsumego = (root: SGFNode) => {
        resetGame(false, 19, false); 
        
        
        let currentNode: SGFNode = root;
        let combinedProps: { [key: string]: string[] } = { ...root.properties };
        
        // Accumulate Setup from sequence of nodes until a Move node occurs
        let depth = 0;
        while (depth < 10 && !currentNode.properties['B'] && !currentNode.properties['W'] && currentNode.children.length === 1) {
             const child = currentNode.children[0];
             
             if (child.properties['AB']) {
                 combinedProps['AB'] = [...(combinedProps['AB'] || []), ...child.properties['AB']];
             }
             if (child.properties['AW']) {
                 combinedProps['AW'] = [...(combinedProps['AW'] || []), ...child.properties['AW']];
             }
             if (child.properties['SZ']) combinedProps['SZ'] = child.properties['SZ'];
             if (child.properties['PL']) combinedProps['PL'] = child.properties['PL'];
             if (child.properties['C']) combinedProps['C'] = child.properties['C'];
             
             if (child.properties['B'] || child.properties['W']) {
                 break; // Child is a move, stop accumulation
             } else {
                 currentNode = child; // Advance
             }
             depth++;
        }

        // --- Apply Size ---
        let size = 19;
        if (combinedProps['SZ']) {
            size = parseInt(combinedProps['SZ'][0]);
        }
        if (size !== settings.boardSize) {
             settings.setBoardSize(size as BoardSize);
             boardSizeRef.current = size as BoardSize;
             gameState.setBoard(createBoard(size as BoardSize));
        }

        settings.setGameMode('Tsumego');
        settings.setGameType('Go');
        setTsumegoRoot(root); // Keep original root for reference
        setTsumegoCurrentNode(currentNode); // Set effective start node

        // --- Apply Stones ---
        const newBoard = createBoard(size as BoardSize);
        
        if (combinedProps['AB']) {
            combinedProps['AB'].forEach(val => {
                if (val.length < 2) return;
                const x = val.charCodeAt(0) - 97;
                const y = val.charCodeAt(1) - 97;
                if (x>=0 && x<size && y>=0 && y<size) {
                    newBoard[y][x] = { color: 'black', x, y, id: `setup-b-${x}-${y}` };
                }
            });
        }
        if (combinedProps['AW']) {
             combinedProps['AW'].forEach(val => {
                if (val.length < 2) return;
                const x = val.charCodeAt(0) - 97;
                const y = val.charCodeAt(1) - 97;
                if (x>=0 && x<size && y>=0 && y<size) {
                    newBoard[y][x] = { color: 'white', x, y, id: `setup-w-${x}-${y}` };
                }
            });
        }
        
        gameState.setBoard(newBoard);
        gameState.boardRef.current = newBoard;
        
        // --- Determine Turn ---
        let firstPlayer: Player = 'black';
        if (combinedProps['PL']) {
             const pl = combinedProps['PL'][0];
             firstPlayer = (pl.toLowerCase() === 'w' || pl === '2') ? 'white' : 'black';
        }
        
        gameState.setCurrentPlayer(firstPlayer);
        gameState.currentPlayerRef.current = firstPlayer;
        settings.setUserColor(firstPlayer); 

        // Show Comment & Player Info
        const turnMsg = firstPlayer === 'black' ? "执黑 (Black to Play)" : "执白 (White to Play)";
        let fullMsg = turnMsg;
        if (combinedProps['C']) {
            fullMsg += `\n${combinedProps['C'][0]}`;
        }
        setTsumegoInstruction(fullMsg);
        
        // Clear previous result modal
        setShowTsumegoResult(false);
    };

    const handleNextTsumego = () => {
        if (!tsumegoCollection || !tsumegoRoot) return;
        const idx = tsumegoCollection.findIndex((n: SGFNode) => n === tsumegoRoot);
        if (idx >= 0 && idx < tsumegoCollection.length - 1) {
             startTsumego(tsumegoCollection[idx + 1]);
        }
    };

    const handleRetryTsumego = () => {
        if (tsumegoRoot) startTsumego(tsumegoRoot);
    };

    const handleTsumegoMove = (x: number, y: number) => {
        if (!tsumegoCurrentNode) return false;

        const playerProp = gameState.currentPlayer === 'black' ? 'B' : 'W';
        const coordStr = String.fromCharCode(x + 97) + String.fromCharCode(y + 97);
        
        // Find if any child matches user move
        const nextNode = tsumegoCurrentNode.children.find((child: SGFNode) => {
            const prop = child.properties[playerProp];
            return prop && prop[0] === coordStr;
        });

        if (nextNode) {
            // Correct move
            setTsumegoCurrentNode(nextNode);
            
             if (nextNode.properties['C']) {
                setToastMsg(nextNode.properties['C'][0]);
                setTimeout(() => setToastMsg(null), 3000);
            }
            
            return true;
        } else {
            // Incorrect Move
            setToastMsg("答案错误 (Incorrect)");
            setTimeout(() => setToastMsg(null), 1500);
            vibrate(50);
            return false;
        }
    };

    // --- Tsumego End Check ---
    useEffect(() => {
        if (settings.gameMode === 'Tsumego' && tsumegoCurrentNode) {
            if (tsumegoCurrentNode.children.length === 0) {
                 // Check if it's "Correct" or "Incorrect" based on comments or context
                 // Simple heuristic: If comment contains positive words or if it's the only path?
                 // Usually SGF problems have "C[Right]" or "C[Correct]"
                 // Let's rely on simple presence of comment for now or default to "Ended".
                 // BUT: If the user just played and there is NO response, it might be correct.
                 // If the AI just played (which leads to leaf), it means user FAILED (usually).
                 
                 // Logic: 
                 // If currentPlayer is USER's color, it means AI just played and reached end -> User Failed.
                 // If currentPlayer is OPPONENT, it means USER just played and reached end -> User Solved (probably).
                 
                 // Wait, after User moves, we check `tsumegoCurrentNode.children`. If 0, User Solved.
                 // After AI moves, we check `tsumegoCurrentNode.children`. If 0, AI won -> User Failed.
                 
                 const userColor = settings.userColor;
                 const justPlayedColor = gameState.currentPlayer === 'black' ? 'white' : 'black'; // Previous player
                 
                 let isSuccess = false;
                 
                 if (justPlayedColor === userColor) {
                      // User just played the last move.
                      isSuccess = true;
                 } else {
                      // AI just played the last move (refutation).
                      isSuccess = false; 
                 }

                 // Override with comments if available
                 const comment = tsumegoCurrentNode.properties['C'] ? tsumegoCurrentNode.properties['C'][0] : "";
                 if (comment.toLowerCase().includes("right") || comment.includes("正解") || comment.includes("correct") || comment.includes("win")) isSuccess = true;
                 if (comment.toLowerCase().includes("wrong") || comment.includes("failure") || comment.includes("失败")) isSuccess = false;
                 
                  // Delay slightly to show the move
                 setTimeout(() => {
                      setTsumegoIsCorrect(isSuccess);
                      setTsumegoResultMsg(comment);
                      setShowTsumegoResult(true);
                      vibrate(isSuccess ? 100 : 200);
                      playSfx(isSuccess ? 'win' : 'lose');
                 }, 500);
            }
        }
    }, [tsumegoCurrentNode, settings.gameMode, gameState.currentPlayer, settings.userColor]);

    // --- Tsumego Auto-Move Effect ---
    useEffect(() => {
        if (settings.gameMode !== 'Tsumego' || gameState.gameOver || !tsumegoCurrentNode) return;

        // Auto-Play conditions:
        // 1. It is NOT the user's turn (AI turn).
        // 2. There is a valid move defined in the SGF for the current player.
        if (gameState.currentPlayer !== settings.userColor) {
             const playerProp = gameState.currentPlayer === 'black' ? 'B' : 'W';
             
             // Find response
             // Heuristic: Take the first child that matches the player color.
             const nextMove = tsumegoCurrentNode.children.find(c => c.properties[playerProp]);
             
             if (nextMove && nextMove.properties[playerProp]) {
                 const timer = setTimeout(() => {
                      const moveStr = nextMove.properties[playerProp][0];
                      if (moveStr && moveStr.length >= 2) {
                           const x = moveStr.charCodeAt(0) - 97;
                           const y = moveStr.charCodeAt(1) - 97;
                           executeMove(x, y, false);
                           
                           setTsumegoCurrentNode(nextMove); // Update node pointer

                           // Handle Comments on AI move
                           if (nextMove.properties['C']) {
                                setToastMsg(nextMove.properties['C'][0]);
                                setTimeout(() => setToastMsg(null), 3000);
                           }
                      }
                 }, 500);
                 return () => clearTimeout(timer);
             }
        }
    }, [tsumegoCurrentNode, gameState.currentPlayer, settings.gameMode, settings.userColor, gameState.gameOver]);

    const executeMove = (x: number, y: number, isRemote: boolean) => {
        const currentBoard = gameState.boardRef.current; 
        const activePlayer = gameState.currentPlayerRef.current; 
        const currentType = gameTypeRef.current;
        
        let prevHash = null;
        // Ko Rule Fix: We must check against the state *before* the opponent's last move.
        // History contains: [Move1, Move2, ... MoveN(Opponent)].
        // We are making Move N+1. State after our move cannot be same as State after Move N-1.
        // So we check history[length - 1].
        // Wait, array is 0-indexed. length is N. last is index N-1. 
        // We want index N-2. 
             // Ko Rule Fix: We must check against the state *before* the opponent's last move.
             // History contains: [Move1, Move2, ... MoveN(Opponent)].
             // We are making Move N+1. State after our move cannot be same as State after Move N-1.
             // Actually, history is 0-indexed.
             // history[N-1] is the item for Move N. it contains the board BEFORE Move N.
             // So history[length-1].board is the State Before Opponent Move.
             // This is what we want to check against (Simple Ko).
             if (gameState.history.length >= 1) {
                 prevHash = getBoardHash(gameState.history[gameState.history.length - 1].board);
             }
        
        // Tsumego Check
        if (settings.gameMode === 'Tsumego' && !isRemote) {
             const isValid = handleTsumegoMove(x, y);
             if (!isValid) return; // Block invalid moves in Tsumego
        }
        
        const result = attemptMove(currentBoard, x, y, activePlayer, currentType, prevHash);
        
        if (result) {
            // Audio & Vibrate
            try {
                if (result.captured > 0) {
                    playSfx('capture');
                    try { if(navigator.vibrate) navigator.vibrate([20, 30, 20]); } catch(e){}
                } else {
                    playSfx('move');
                    try { if(navigator.vibrate) navigator.vibrate(15); } catch(e){}
                }
            } catch(e) {}

            // Achievements
            if (!isRemote && session?.user?.id) {
               try {
                   checkMoveAchievements({
                     x, y, color: activePlayer, moveNumber: gameState.history.length + 1, boardSize: settings.boardSize 
                   });
               } catch (achError) { console.warn("Achievement Error:", achError); }
            }
            
            // State Update
            const newHistoryItem = { 
                board: currentBoard, 
                currentPlayer: activePlayer, 
                blackCaptures: gameState.blackCaptures, 
                whiteCaptures: gameState.whiteCaptures, 
                lastMove: { x, y }, // Correct: This state was produced by move (x,y)
                consecutivePasses: gameState.consecutivePasses 
            };
            
            if (!isRemote) {
                gameState.setHistory(prev => [...prev, newHistoryItem]);
            }
            
            // Critical Fix: Update Refs immediately to avoid AI reading stale state
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

            if (currentType === 'Gomoku' && checkGomokuWin(result.newBoard, {x, y})) { 
                setTimeout(() => endGame(activePlayer, '五子连珠！'), 0); 
                return; 
            }
            
            const nextPlayer = activePlayer === 'black' ? 'white' : 'black';
            gameState.currentPlayerRef.current = nextPlayer;
            gameState.setCurrentPlayer(nextPlayer);

        } else {
            if (!isRemote) try { playSfx('error'); } catch(e) {}
        }
    };

    const handlePass = useCallback((isRemote: boolean = false) => {
        console.log(`[App] handlePass Triggered. Remote: ${isRemote}, GameOver: ${gameState.gameOver}, Consecutive: ${gameState.consecutivePasses}, Current: ${gameState.currentPlayerRef.current}`);

        if (gameState.gameOver) return;
        vibrate(10);
        
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
            if (isElectronAvailable && isElectronThinking) electronAiEngine.stopThinking();
            setIsThinking(false);
            aiTurnLock.current = false;
        }

        gameState.setConsecutivePasses(prev => {
            const newPasses = prev + 1;
            console.log(`[App] Consecutive Passes: ${prev} -> ${newPasses}`);
            if (newPasses >= 2) { 
                console.log("[App] Game End via 2 passes.");
                setTimeout(() => { 
                    const score = calculateScore(gameState.boardRef.current); 
                    gameState.setFinalScore(score); 
                    setShowPassModal(false); 
                    if (score.black > score.white) endGame('black', `比分: 黑 ${score.black} - 白 ${score.white}`); 
                    else endGame('white', `比分: 白 ${score.white} - 黑 ${score.black}`); 
                }, 0); 
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
    }, [gameState.gameOver, settings.gameMode, settings.gameType, gameState.consecutivePasses, settings.userColor, isElectronAvailable, isElectronThinking, gameState.currentPlayer]);

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
         aiTurnLock.current = false;
         setIsThinking(false);
         if (aiTimerRef.current) { clearTimeout(aiTimerRef.current); aiTimerRef.current = null; }


         gameState.setHistory(prevHistory => {
             const newHist = prevHistory.slice(0, prevHistory.length - stepsToUndo);
             gameState.historyRef.current = newHist; // Sync Ref
             return newHist;
         });
    };

    const endGame = async (winnerColor: Player, reason: string) => { 
        gameState.setGameOver(true);
        // Ensure to unlock AI just in case
        aiTurnLock.current = false;
        setIsThinking(false);
        if (aiTimerRef.current) { clearTimeout(aiTimerRef.current); aiTimerRef.current = null; }

        gameState.setWinner(winnerColor);
        gameState.setWinReason(reason);
        vibrate([50, 50, 50, 50]);
        playSfx('win');

        if (session?.user?.id && (settings.gameMode === 'PvAI' || onlineStatus === 'connected')) {
            const myPlayerColor = onlineStatus === 'connected' ? myColor : settings.userColor;
            const currentScore = calculateScore(gameState.boardRef.current);
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
                
                // [TapTap Sync]
                if (localStorage.getItem('is_taptap_user') === 'true') {
                    submitTapTapElo(winnerNewElo);
                }

                fetchProfile(session.user.id);
            } else {
                // If I lost, the winnerNewElo already includes my loss from their perspective? 
                // No, my new Elo is calculated locally too.
                if (localStorage.getItem('is_taptap_user') === 'true') {
                    submitTapTapElo(newElo);
                }
                setTimeout(() => fetchProfile(session.user.id), 2000);
            }
        } 
        else if (settings.gameMode === 'PvAI' && session && userProfile) {
            const isWin = winnerColor === settings.userColor;
            const resultScore: 0 | 0.5 | 1 = isWin ? 1 : 0;
            const aiRating = getAiRating(settings.difficulty); // Use getAiRating from helpers
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
      
      // [TapTap Sync]
      if (localStorage.getItem('is_taptap_user') === 'true') {
        submitTapTapElo(newElo);
      }

      fetchProfile(session.user.id);
        }
    };

    // --- AI Turn Trigger ---
    useEffect(() => {
        if (!isPageVisible) return;
        if (gameState.appMode !== 'playing' || gameState.gameOver || showPassModal || settings.gameMode !== 'PvAI') return;
        const aiColor = settings.userColor === 'black' ? 'white' : 'black';
        
      if (gameState.currentPlayer === aiColor) {
          if (aiTurnLock.current) return;
          // [Fix] Correctly check if we should use the Neural Network (WebAI or Electron)
          const aiConfig = getAIConfig(settings.difficulty);
          // Now ALL ranks use Model for Go (except Gomoku)
          const shouldUseHighLevelAI = settings.gameType === 'Go' && (aiConfig.useModel || isElectronAvailable); 
    
          if (shouldUseHighLevelAI) {
              if (!aiTurnLock.current) {
                  aiTurnLock.current = true; 
                  
                  if (useCloud) {
                      // Cloud Mode - Optimized for Speed
                      // Use aiConfig simulations.
                      // [Fix] Minimum 15 visits to prevent KataGo from returning empty moves/passing due to low search.
                      // 15 visits is still instant (~20ms on GPU).
                      let sims = aiConfig.simulations;
                      sims = Math.max(15, sims * 2);
                      if (sims > 100) sims = 100; // Cap at 100 for Hard
                      
                      const komi = settings.boardSize === 9 ? 6.5 : 7.5;
                      requestCloudAiMove(
                          gameState.boardRef.current,
                          aiColor,
                          gameState.historyRef.current,
                          sims, 
                          komi
                      );
                  }
                  else if (isElectronAvailable) {
                      electronAiEngine.requestAiMove(aiColor, settings.difficulty, settings.maxVisits, getResignThreshold(settings.difficulty));
                  } else {
                      // Web AI Request
                      // Precise Rank Mode (18k-9d) Support 
                      // 18k-6k: 1 sim + Temperature
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
                          t // Pass Temperature
                      );
                  }
              }
          }
          else {
              // Local AI (Gomoku Only or Failsafe)
              if (!aiTurnLock.current) {
                  aiTurnLock.current = true;
                  setIsThinking(true);
                  if (aiTimerRef.current) clearTimeout(aiTimerRef.current);
    
                  aiTimerRef.current = setTimeout(() => {
                      try {
                          const currentRealBoard = gameState.boardRef.current;
                          // If remote/user moved before AI could, abort
                          if (gameState.currentPlayerRef.current !== aiColor) {
                              setIsThinking(false); aiTurnLock.current = false; return;
                          }
                          // Pass history logic for AI
                          let prevHash = null;
                          const currentHistory = gameState.historyRef.current;
                          if (currentHistory && currentHistory.length >= 1) {
                              prevHash = getBoardHash(currentHistory[currentHistory.length - 1].board);
                          } else {
                              prevHash = null;
                          }

                          const move = getAIMove(currentRealBoard, aiColor, settings.gameType, settings.difficulty, prevHash);
                          setIsThinking(false);
                          
                          if (move === 'RESIGN') endGame(settings.userColor, 'AI 认为差距过大，投子认输');
                          else if (move) executeMove(move.x, move.y, false);
                          else handlePass(false); // AI Passes
                      } catch (error: any) {
                          console.error("AI Error:", error);
                          setIsThinking(false);
                          setToastMsg(`AI 出错: ${error?.message || '未知错误'}`);
                          setTimeout(() => setToastMsg(null), 5000);
                      } finally {
                          aiTurnLock.current = false; aiTimerRef.current = null;
                      }
                  }, 500); 
              }
          }
        } else {
            // User turn, ensure lock is free
            if (gameState.currentPlayer === settings.userColor) aiTurnLock.current = false;
        }
    }, [gameState.currentPlayer, settings.gameMode, settings.userColor, gameState.board, gameState.gameOver, settings.gameType, settings.difficulty, showPassModal, gameState.appMode, isElectronAvailable, isPageVisible, useCloud, requestCloudAiMove]);

    /*
    // --- Web AI Turn (Worker) - REDUNDANT / MERGED ABOVE ---
    // Merged into the main AI Trigger effect to avoid race conditions and double-firing.
    useEffect(() => {
        if (gameState.appMode !== 'playing' || gameState.gameOver || showPassModal || settings.gameMode !== 'PvAI') return;
        const aiColor = settings.userColor === 'black' ? 'white' : 'black';

        if (gameState.currentPlayer === aiColor && !isElectronAvailable && isWorkerReady && !isThinking) {
            if (aiTurnLock.current) return; // Prevent re-triggering

            const aiConfig = getAIConfig(settings.difficulty);
            
            if (aiConfig.useModel) {
                // High Rank: Use Web Worker
                aiTurnLock.current = true;
                setIsThinking(true);
                // Determine Komi
                const komi = settings.boardSize === 9 ? 6.5 : 7.5;
                
                // Cap simulations for Web performance & Weaken for lower levels
                // b18 model with 1 sim is already strong (Dan level intuition).
                // To support "Easy" on H5, we must limit calculation to minimum.
                let sims = aiConfig.simulations;
                
                if (settings.difficulty === 'Easy' || settings.difficulty === 'Medium' || settings.difficulty === 'Hard') {
                    // Fallback for old settings values
                    sims = settings.difficulty === 'Easy' ? 1 : (settings.difficulty === 'Medium' ? 3 : 10);
                } else {
                    // Precise Rank Mode (18k-9d)
                    // We now use the aggressive low values from aiConfig directly.
                    // 5k=1 sim, 1d=5 sims, 9d=13 sims.
                    // This ensures "Instant Play" feel on mobile.
                    sims = aiConfig.simulations;
                    if (sims < 1) sims = 1;
                }

                requestWebAiMove(
                    gameState.boardRef.current, 
                    gameState.currentPlayerRef.current, 
                    gameState.historyRef.current,
                    sims,
                    komi,
                    settings.difficulty 
                );
            } else {
                // Low Rank: Logic handled by the "Computer Move" effect below
                // (which calls getAIMove directly)
            }
        }
    }, [gameState.currentPlayer, settings.gameMode, isElectronAvailable, isWorkerReady, isThinking, requestWebAiMove, settings.difficulty, showPassModal, gameState.appMode, settings.userColor, gameState.gameOver]);
    */


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
    };

    const getIceServers = async () => {
        const publicStunServers = ["stun:stun.qq.com:3478", "stun:stun.miwifi.com:3478", "stun:stun.chat.bilibili.com:3478"];
        let turnServers = [];
        try { const res = await fetch(`${WORKER_URL}/ice-servers`, { method: 'POST' }); const data = await res.json(); if (data && data.iceServers) turnServers = data.iceServers; } catch (e) {}
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
        try { await supabase.channel(`room_${roomId}`).send({ type: 'broadcast', event: 'signal', payload }); } catch (error) {}
    };

    const setupDataChannel = (dc: RTCDataChannel, isHost: boolean) => {
        dataChannelRef.current = dc;
        dc.onopen = () => {
            setOnlineStatus('connected'); setIsMatching(false); setShowOnlineMenu(false); setShowMenu(false); settings.setGameMode('PvP');
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
             const { data: opponents } = await supabase.from('matchmaking_queue').select('*').eq('game_type', settings.gameType).eq('board_size', sizeToMatch).neq('user_id', session.user.id).limit(1);
             // ...
             // Actually, I should just copy the logic.
             // But wait, the previous code block logic is good. I will reuse it.
             initMatchmaking(sizeToMatch, myTempPeerId, myElo);
        } catch(e) { cancelMatchmaking(); }
    };
    
    // Split initMatchmaking to keep cleaner
    const initMatchmaking = async (sizeToMatch: number, myTempPeerId: string, myElo: number) => {
         const findOpponent = async (attempt: number): Promise<any> => {
           const range = attempt === 1 ? 100 : (attempt === 2 ? 300 : 9999);
           const activeSince = new Date(Date.now() - 15000).toISOString();
           const { data: opponents } = await supabase.from('matchmaking_queue').select('*').eq('game_type', settings.gameType).eq('board_size', sizeToMatch).neq('user_id', session!.user.id).gte('last_seen', activeSince).lte('elo_rating', myElo + range).limit(1);
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
        }).subscribe();
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
        if (isElectronAvailable && settings.gameType === 'Go') electronAiEngine.syncHumanMove(gameState.currentPlayer, x, y);
        executeMove(x, y, false);
    }, [gameState.gameOver, settings.gameMode, gameState.currentPlayer, onlineStatus, myColor, isThinking, gameState.appMode, gameState.setupTool, gameState.board, settings.userColor, isElectronAvailable, electronAiEngine, settings.gameType]);
    
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
    
    // Win Rate Calculation for Display
    // Win Rate Calculation for Display (Normalized to Black Win %)
    let displayWinRate = calculateWinRate(gameState.board); // Default Heuristic (Already Black%)

     if (settings.showWinRate && !gameState.gameOver && gameState.appMode === 'playing' && settings.gameType === 'Go') {
          const aiColor = settings.userColor === 'black' ? 'white' : 'black';
          
          if (useCloud && cloudWinRate !== 50) {
              displayWinRate = (aiColor === 'white') ? (100 - cloudWinRate) : cloudWinRate;
          }
          else if (isElectronAvailable && electronWinRate !== 50) {
              // Electron AI (Assume relative to AI color)
              displayWinRate = (aiColor === 'white') ? (100 - electronWinRate) : electronWinRate;
          } 
          else if (!isElectronAvailable && isWorkerReady && settings.gameMode === 'PvAI' && webWinRate !== 50) {
              // Web AI (Returns WinRate for Current AI Mover)
              // If AI is White, it returns White%. We convert to Black%.
              displayWinRate = (aiColor === 'white') ? (100 - webWinRate) : webWinRate;
          }
    }

    // [Fix] Gomoku Win Rate
     if (settings.showWinRate && !gameState.gameOver && gameState.appMode === 'playing' && settings.gameType === 'Gomoku') {
         // Use strict heuristic win rate
         displayWinRate = calculateGomokuWinRate(gameState.board);
     }


    // Lead Calculation (Normalized to Black Lead)
    let displayLead: number | null = null;
    const aiColor = settings.userColor === 'black' ? 'white' : 'black';
    
    if (settings.gameMode === 'PvAI') {
         if (useCloud && cloudLead !== null) {
              displayLead = (aiColor === 'white') ? -cloudLead : cloudLead;
         }
         else if (!isElectronAvailable && webLead !== null && isWorkerReady) {
              // Web Lead is relative to Mover (AI).
              // If AI is White, Lead +5 means White leads by 5. Black Lead = -5.
              displayLead = (aiColor === 'white') ? -webLead : webLead;
         }
    }




    // --- Persist AI Run Flag ---
    useEffect(() => {
        if (isWorkerReady && !isWebLoading) {
            localStorage.setItem('has_run_ai_before', 'true');
        }
    }, [isWorkerReady, isWebLoading]);

    return (
        <div className="h-full w-full bg-[#f7e7ce] flex flex-col landscape:flex-row items-center relative select-none overflow-y-auto landscape:overflow-hidden text-[#5c4033]">
           
           {toastMsg && (
               <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[80] bg-[#5c4033] text-[#fcf6ea] px-4 py-2 rounded-full text-xs font-bold shadow-lg border-2 border-[#8c6b38] animate-in fade-in">
                   {toastMsg}
               </div>
           )}

           {showStartScreen && (
               <StartScreen 
                   onStartGame={handleStartGame}
                   onOpenTsumego={handleOpenTsumego}
                   onOpenTutorial={() => setShowTutorial(true)}
                   onOpenOnline={() => setShowOnlineMenu(true)}
                   onOpenImport={() => setShowImportModal(true)}
                   onOpenSettings={() => setShowMenu(true)}
                   onOpenAbout={() => setShowAboutModal(true)}
                   onStartSetup={() => { setShowStartScreen(false); resetGame(false); gameState.setAppMode('setup'); }}
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
                           territory={settings.gameMode === 'PvAI' ? webTerritory : null}
                           showTerritory={showTerritory}
                           stoneSkin={settings.stoneSkin}
                           boardSkin={settings.boardSkin}
                        />
                    </div>
                </div>
               {showThinkingStatus && (
                   <div className="absolute top-4 left-4 bg-white/80 px-4 py-2 rounded-full text-xs font-bold text-[#5c4033] animate-pulse border-2 border-[#e3c086] shadow-sm z-20">
                       {isElectronAvailable ? 'KataGo 正在计算...' : 'AI 正在思考...'}
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
           <div className="w-full landscape:w-96 flex flex-col gap-4 p-4 z-20 shrink-0 bg-[#f7e7ce] landscape:bg-[#f2e6d6] landscape:h-full landscape:border-l-4 landscape:border-[#e3c086] order-1 landscape:order-2 shadow-xl landscape:shadow-none">
                <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                        <button onClick={() => { setShowStartScreen(true); vibrate(10); }} className="btn-retro btn-brown p-3 rounded-xl"><Home size={20} /></button>
                        <button onClick={() => { setShowUserPage(true); vibrate(10); }} className="btn-retro btn-brown p-3 rounded-xl"><UserIcon size={20} /></button>
                        <button onClick={() => { setShowMenu(true); vibrate(10); }} className="btn-retro btn-brown p-3 rounded-xl"><Settings size={20} /></button>
                    </div>

                    <div className="flex flex-col items-end">
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
                    </div>
                </div>

                <ScoreBoard 
                    currentPlayer={gameState.currentPlayer}
                    blackCaptures={gameState.blackCaptures}
                    whiteCaptures={gameState.whiteCaptures}
                    gameType={settings.gameType}
                    isThinking={isThinking}
                    showWinRate={settings.showWinRate && (settings.gameMode !== 'PvAI' || settings.gameType === 'Gomoku' || settings.difficulty === 'Easy')}
                    appMode={gameState.appMode}
                    gameOver={gameState.gameOver}
                    userColor={settings.userColor}
                    displayWinRate={displayWinRate}
                />

                {gameState.appMode === 'playing' && settings.gameMode === 'PvAI' && settings.showWinRate && settings.gameType === 'Go' && settings.difficulty !== 'Easy' && (
                    <AnalysisPanel 
                        winRate={displayWinRate}
                        lead={displayLead}
                        isThinking={isThinking}
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
                    isThinking={isThinking}
                    gameOver={gameState.gameOver}
                    onlineStatus={onlineStatus}
                    currentPlayer={gameState.currentPlayer}
                    myColor={myColor}
                    consecutivePasses={gameState.consecutivePasses}
                    
                    // Tsumego Props
                    isTsumego={settings.gameMode === 'Tsumego'}
                    hasPrevProblem={tsumegoCollection && tsumegoRoot && tsumegoCollection.indexOf(tsumegoRoot) > 0}
                    hasNextProblem={tsumegoCollection && tsumegoRoot && tsumegoCollection.indexOf(tsumegoRoot) < tsumegoCollection.length - 1}
                    handlePrevProblem={() => {
                         if (!tsumegoCollection || !tsumegoRoot) return;
                         const idx = tsumegoCollection.indexOf(tsumegoRoot);
                         if (idx > 0) startTsumego(tsumegoCollection[idx - 1]);
                    }}
                    handleNextProblem={() => {
                         if (!tsumegoCollection || !tsumegoRoot) return;
                         const idx = tsumegoCollection.indexOf(tsumegoRoot);
                         if (idx < tsumegoCollection.length - 1) startTsumego(tsumegoCollection[idx + 1]);
                    }}
                    handleHint={() => {
                         if (!tsumegoCurrentNode) return;
                         // Find the correct next move (Child node that has B or W property matching player color is NOT what we want if we want the SOLUTION)
                         // Actually, in Tsumego SGFs, the 'correct' branch usually continues.
                         // But often there are multiple branches. We need to find the one marked with 'Correct' or just the first one?
                         // Usually the main branch or one with 'C' containing 'Correct'/'Right'.
                         // Simple heuristic: Take the first child that represents a move for the current player.
                         
                         const playerProp = gameState.currentPlayer === 'black' ? 'B' : 'W';
                         
                         const correctChild = tsumegoCurrentNode.children.find(c => {
                             // Check if it's a move for current player
                             return c.properties[playerProp];
                             // In a real robust solver we'd check if this path leads to 'success'
                         });

                         if (correctChild && correctChild.properties[playerProp]) {
                             const moveStr = correctChild.properties[playerProp][0];
                             if (moveStr && moveStr.length >= 2) {
                                  const x = moveStr.charCodeAt(0) - 97;
                                  const y = moveStr.charCodeAt(1) - 97;
                                  
                                  // Directly execute move
                                  executeMove(x, y, false);
                             }
                         } else {
                             setToastMsg("无更多提示 / 已是最后一步");
                             setTimeout(() => setToastMsg(null), 1500);
                         }
                    }}
                />
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
                    difficulty: settings.difficulty, maxVisits: settings.maxVisits, userColor: settings.userColor
                }), [settings.boardSize, settings.gameType, settings.gameMode, settings.difficulty, settings.maxVisits, settings.userColor])}
                onApplyGameSettings={handleApplySettings}
                showQi={settings.showQi} setShowQi={settings.setShowQi}
                showWinRate={settings.showWinRate} setShowWinRate={settings.setShowWinRate}
                showCoordinates={settings.showCoordinates} setShowCoordinates={settings.setShowCoordinates}
                musicVolume={settings.musicVolume} setMusicVolume={settings.setMusicVolume}
                hapticEnabled={settings.hapticEnabled} setHapticEnabled={settings.setHapticEnabled}
                vibrate={vibrate}
                onStartSetup={() => { resetGame(false); gameState.setAppMode('setup'); setShowMenu(false); }}
                onOpenImport={() => { setShowImportModal(true); setShowMenu(false); }}
                onOpenOnline={() => setShowOnlineMenu(true)}
                onOpenAbout={() => { setShowAboutModal(true); setShowMenu(false); }}
                onOpenTutorial={() => { setShowTutorial(true); setShowMenu(false); }}
                onOpenTsumego={handleOpenTsumego}
                onOpenSkinShop={() => setShowSkinShop(true)}
                isElectronAvailable={isElectronAvailable}
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
               onTapTapLeaderboardClick={openTapTapLeaderboard}
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
               isInitializing={isInitializing}
               isElectronAvailable={isElectronAvailable}
               isFirstRun={isFirstRun}
               onClose={() => { setIsInitializing(false); localStorage.setItem('has_run_ai_before', 'true'); }}
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

           {/* Web AI Loading Modal - Optimized UI */}
            {/* Loading Modal (Shared for Electron & Web Lazy Load) */}
            <OfflineLoadingModal 
                isInitializing={isInitializing || isWebInitializing} 
                isElectronAvailable={isElectronAvailable || isWebInitializing} // Force show if web init
                isFirstRun={isFirstRun && isElectronAvailable} // Only show "First Run" hardware text for Local KataGo
                onClose={() => {
                     // For web, maybe allow closing? 
                     // But initialization is heavy. Better wait.
                }}
                message={isWebInitializing ? webInitStatus : undefined}
            />

            {/* Tsumego Result Modal */}
             <TsumegoResultModal 
                isOpen={showTsumegoResult}
                isCorrect={tsumegoIsCorrect}
                message={tsumegoResultMsg}
                onNext={handleNextTsumego}
                onRetry={handleRetryTsumego}
                onClose={() => setShowTsumegoResult(false)}
                hasNext={!!(tsumegoCollection && tsumegoRoot && tsumegoCollection.findIndex(n => n === tsumegoRoot) < tsumegoCollection.length - 1)}
             />

        </div>
    );
};

export default App;