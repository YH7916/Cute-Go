
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { GameBoard } from './components/GameBoard';
import { BoardSize, Player, GameMode, GameType } from './types';
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
  getBoardHash
} from './utils/goLogic';
import { getAIConfig } from './utils/aiConfig';
import { Settings, User as UserIcon, Trophy, Feather, Egg, Crown, Brain, Cpu } from 'lucide-react';

// Hooks
import { useKataGo, sliderToVisits, visitsToSlider } from './hooks/useKataGo';
import { useWebKataGo } from './hooks/useWebKataGo';
import { useAchievements } from './hooks/useAchievements';
import { useAppSettings } from './hooks/useAppSettings';
import { useGameState } from './hooks/useGameState';
import { useAudio } from './hooks/useAudio';

// Utils
import { supabase } from './utils/supabaseClient';
import { SignalMessage } from './types';
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
import { OfflineLoadingModal } from './components/OfflineLoadingModal';
import { LoginModal } from './components/LoginModal';
import { AchievementNotification } from './components/AchievementNotification';
import { AboutModal } from './components/AboutModal';

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
    const [showTutorial, setShowTutorial] = useState(false); // Tutorial State
    const [isThinking, setIsThinking] = useState(false); 
    const [toastMsg, setToastMsg] = useState<string | null>(null);

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
            setSession(session);
            if (session) fetchProfile(session.user.id);
        });

        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            setSession(session);
            if (session) {
                fetchProfile(session.user.id);
                setShowLoginModal(false);
            } else {
                setUserProfile(null);
            }
        });
        return () => subscription.unsubscribe();
    }, []);

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

    const handleSignOut = async () => {
        if (isSigningOutRef.current) return;
        isSigningOutRef.current = true;
        try {
            supabase.auth.stopAutoRefresh?.();
            clearSupabaseLocalSession();
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
    const { 
        isWorkerReady, 
        isLoading: isWebLoading, // Legacy loading state (internal)
        isThinking: isWebThinking, 
        aiWinRate: webWinRate, 
        stopThinking: stopWebThinking, 
        requestWebAiMove,
        isInitializing: isWebInitializing, // New
        initStatus: webInitStatus, // New
        initializeAI // New
    } = webAiEngine;

    const [isFirstRun] = useState(() => !localStorage.getItem('has_run_ai_before'));
    const [isPageVisible, setIsPageVisible] = useState(!document.hidden);
    const showThinkingStatus = isThinking || isElectronThinking || isWebThinking;

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
        gameState.setAppMode('playing');
        setEloDiffText(null);
        setEloDiffStyle(null);

        if (isElectronAvailable && settings.gameType === 'Go') {
            electronAiEngine.resetAI(sizeToUse, 7.5);
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
                    console.log("[App] Triggering Lazy AI Init (Model Required)...");
                    webAiEngine.initializeAI();
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
        if (!isElectronAvailable && settings.gameMode === 'PvAI') {
             const aiConfig = getAIConfig(settings.difficulty);
             if (aiConfig.useModel && !webAiEngine.isWorkerReady && !webAiEngine.isInitializing) {
                 console.log("[App] Auto-triggering AI Init (Startup/Reload)...");
                 webAiEngine.initializeAI();
             }
        }
    }, [settings.gameMode, settings.difficulty, isElectronAvailable, webAiEngine.isWorkerReady, webAiEngine.isInitializing]);

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
        if (gameState.history && gameState.history.length >= 1) {
             // For standard Ko (retake immediately), checking N-1 (previous state) is redundant (impossible to encompass same space).
             // But actually, checking against 'current board' is useless.
             // We need to check against the board state 'before the last move resulted in current state'. 
             // Yes, history[len - 2].
             // If history has 1 element (Open -> B1), White moves. len=1. index -1 is invalid.
             // If history has 2 elements (B1 -> W1), Black moves. 
             // If Black captures and causes Ko, board looks like B1.
             // B1 is history[0]. length=2. We want index 0 -> len-2.
             if (gameState.history.length >= 2) {
                 prevHash = getBoardHash(gameState.history[gameState.history.length - 2].board);
             }
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
        if (gameState.gameOver) return;
        vibrate(10);
        
        // Fix: Reset AI state if it passed
        if (isRemote) {
            aiTurnLock.current = false;
            setIsThinking(false);
        }

        if (!isRemote) {
            // For a pass, lastMove is arguably null or a special pass marker?
            // Existing logic used gameState.lastMove which was the PREVIOUS move.
            // If we want to record "Pass", usually coordinates are outside board or special.
            // But let's check existing usage. lastMove is {x,y} or null.
            // If I pass, the state changes (currentPlayer swaps), but board is same.
            // The "move that led to this" is a Pass.
            // The worker filters `item.lastMove`. If I put null, it skips it.
            // If I skip it, OnnxEngine sees no move?
            // Pass needs to be recorded for "Pass History" (Ch 0-4 global inputs).
            // KataGo expects Pass as {x: -1, y: -1} or similar?
            // App doesn't seem to track "Pass" as a coordinator in lastMove ({x,y}).
            // Let's stick to null for now, or check how to represent Pass.
            // If I use null, worker skips adding the move to History.
            // Then OnnxEngine doesn't see the pass in history array.
            // Then it won't set "Pass History" global feature.
            // This might be minor for now.
            // Let's keep it as is (previous logic), or set lastMove: null?
            // Actually, if lastMove was previous move, State N (Pass) -> lastMove (Move N-1).
            // That was also wrong. It linked State N to Move N-1.
            // It should be State N (Pass) -> Move N (Pass).
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
            
            // Allow flow to fall through to increment counters below.
            // If AI passes, we just let it be a pass.
            // If User passes, same.
            // Game ends when consecutive passes >= 2 (handled below).
        }

        gameState.setConsecutivePasses(prev => {
            const newPasses = prev + 1;
            if (newPasses >= 2) { 
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
        if (gameState.consecutivePasses < 1) { 
             const next = gameState.currentPlayer === 'black' ? 'white' : 'black';
             gameState.setCurrentPlayer(next);
             gameState.currentPlayerRef.current = next;
             gameState.setLastMove(null); 
        }
    }, [gameState.gameOver, settings.gameMode, settings.gameType, gameState.consecutivePasses, settings.userColor, isElectronAvailable, isElectronThinking]);

    const handleUndo = () => {
         if (gameState.history.length === 0 || isThinking || gameState.gameOver || onlineStatus === 'connected') return;
         vibrate(10);
         let stepsToUndo = 1;
         if (settings.gameMode === 'PvAI' && settings.userColor === gameState.currentPlayer && gameState.history.length >= 2) stepsToUndo = 2; 
         else if (settings.gameMode === 'PvAI' && settings.userColor !== gameState.currentPlayer && gameState.history.length >= 1) stepsToUndo = 1;
 
         const prev = gameState.history[gameState.history.length - stepsToUndo];
         gameState.setBoard(prev.board); 
         gameState.setCurrentPlayer(prev.currentPlayer); 
         gameState.setBlackCaptures(prev.blackCaptures); 
         gameState.setWhiteCaptures(prev.whiteCaptures); 
         gameState.setLastMove(prev.lastMove); 
         gameState.setConsecutivePasses(prev.consecutivePasses); 
         gameState.setPassNotificationDismissed(false); 
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
                fetchProfile(session.user.id);
            } else {
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
          const shouldUseHighLevelAI = settings.gameType === 'Go' && (aiConfig.useModel || isElectronAvailable); 
    
          if (shouldUseHighLevelAI) {
              if (!aiTurnLock.current) {
                  aiTurnLock.current = true; 
                  if (isElectronAvailable) {
                      electronAiEngine.requestAiMove(aiColor, settings.difficulty, settings.maxVisits, getResignThreshold(settings.difficulty));
                  } else {
                      // Web AI Request
                      // Precise Rank Mode (18k-9d) Support & Speed Optimization
                      // "Easy" = 1 sim (Instant, pure intuition)
                      // "Medium" = 3 sims
                      // "Hard" = 10 sims
                      // 5k-1k = 1-3 sims
                      // 1d-9d = 5-13 sims
                      let sims = aiConfig.simulations;
                      
                      if (settings.difficulty === 'Easy' || settings.difficulty === 'Medium' || settings.difficulty === 'Hard') {
                          sims = settings.difficulty === 'Easy' ? 1 : (settings.difficulty === 'Medium' ? 3 : 10);
                      } else {
                          // Precise Rank Mode
                          sims = aiConfig.simulations;
                          if (sims < 1) sims = 1;
                      }

                       // Determine Komi based on board size
                      const komi = settings.boardSize === 9 ? 6.5 : 7.5;
                      
                      webAiEngine.requestWebAiMove(gameState.boardRef.current, aiColor, gameState.historyRef.current, sims, komi, settings.difficulty);
                  }
              }
          }
          else {
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
                          // Ko Check logic:
                          // We check if the NEW board (after AI moves) is identical to a previous state.
                          // Specifically for Simple Ko, we forbid returning to the state immediately before the opponent's move.
                          // currentHistory[last] = State_Before_Opponent_Move.
                          if (currentHistory && currentHistory.length >= 1) {
                              prevHash = getBoardHash(currentHistory[currentHistory.length - 1].board);
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
                          if (gameState.currentPlayerRef.current === aiColor && !gameState.gameOver) {
                               // If AI move failed or finished, unlock.
                               // Note: executeMove unlocks logic by switching player, but we ensure it here.
                               // Actually executeMove switches player, so the useEffect dependency 'currentPlayer' will change, 
                               // triggering this effect again (but failing the if check), which is correct.
                               // However, if AI passed (handlePass), we need to ensure lock is freed.
                          }
                          aiTurnLock.current = false; aiTimerRef.current = null;
                      }
                  }, 500); 
              }
          }
        } else {
            // User turn, ensure lock is free
            if (gameState.currentPlayer === settings.userColor) aiTurnLock.current = false;
        }
    }, [gameState.currentPlayer, settings.gameMode, settings.userColor, gameState.board, gameState.gameOver, settings.gameType, settings.difficulty, showPassModal, gameState.appMode, isElectronAvailable, isPageVisible]);

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
           const { data: opponents } = await supabase.from('matchmaking_queue').select('*').eq('game_type', settings.gameType).eq('board_size', sizeToMatch).neq('user_id', session!.user.id).gte('last_seen', activeSince).gte('elo_rating', myElo - range).lte('elo_rating', myElo + range).limit(1);
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
        if (gameState.appMode === 'review') return; 
        if (gameState.appMode === 'setup') {
            const newBoard = gameState.board.map(row => row.map(s => s));
            if (gameState.setupTool === 'erase') { if (newBoard[y][x]) { newBoard[y][x] = null; playSfx('capture'); vibrate(10); } } 
            else { newBoard[y][x] = { color: gameState.setupTool, x, y, id: `setup-${gameState.setupTool}-${Date.now()}` }; playSfx('move'); vibrate(15); }
            gameState.setBoard(newBoard); return;
        }
        if (gameState.gameOver || isThinking) return;
        
        const aiColor = settings.userColor === 'black' ? 'white' : 'black';
        if (onlineStatus !== 'connected' && settings.gameMode === 'PvAI' && gameState.currentPlayer === aiColor) return;
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
    const currentRawWinRate = isElectronAvailable ? electronWinRate : (settings.difficulty === 'Hard' && isWorkerReady ? webWinRate : calculateWinRate(gameState.board));
    const validWinRate = (currentRawWinRate !== 50) ? currentRawWinRate : calculateWinRate(gameState.board);
    let displayWinRate = 50;
    if (settings.showWinRate && !gameState.gameOver && gameState.appMode === 'playing' && settings.gameType === 'Go') {
         if (!isElectronAvailable && settings.difficulty === 'Hard' && isWorkerReady) displayWinRate = 100 - validWinRate;
         else if (isElectronAvailable) displayWinRate = settings.userColor === 'white' ? (100 - validWinRate) : validWinRate;
         else displayWinRate = settings.userColor === 'white' ? (100 - validWinRate) : validWinRate;
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

           <AchievementNotification newUnlocked={newUnlocked} clearNewUnlocked={clearNewUnlocked} />

           {/* --- BOARD AREA --- */}
           <div className="relative flex-grow h-[60%] landscape:h-full w-full landscape:w-auto landscape:flex-1 flex items-center justify-center p-2 order-2 landscape:order-1 min-h-0 min-w-0">
               <div className="w-full h-full max-w-full max-h-full aspect-square flex items-center justify-center">
                   <div className="transform transition-transform w-full h-full">
                       <GameBoard 
                           board={gameState.appMode === 'review' && gameState.history[gameState.reviewIndex] ? gameState.history[gameState.reviewIndex].board : gameState.board} 
                           onIntersectionClick={handleIntersectionClick}
                           currentPlayer={gameState.currentPlayer}
                           lastMove={gameState.appMode === 'review' && gameState.history[gameState.reviewIndex] ? gameState.history[gameState.reviewIndex].lastMove : gameState.lastMove}
                           showQi={settings.showQi}
                           gameType={settings.gameType}
                           showCoordinates={settings.showCoordinates}
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
                       aiTurnLock.current = false;
                   }}
                   onPass={() => handlePass(false)}
               />
           </div>

           {/* --- SIDEBAR --- */}
           <div className="w-full landscape:w-96 flex flex-col gap-4 p-4 z-20 shrink-0 bg-[#f7e7ce] landscape:bg-[#f2e6d6] landscape:h-full landscape:border-l-4 landscape:border-[#e3c086] order-1 landscape:order-2 shadow-xl landscape:shadow-none">
                <div className="flex justify-between items-center">
                    <div className="flex flex-col">
                        <span className="font-black text-[#5c4033] text-xl leading-tight flex items-center gap-2 tracking-wide">
                        {gameState.appMode === 'setup' ? '电子挂盘' : gameState.appMode === 'review' ? '复盘模式' : (settings.gameType === 'Go' ? '围棋' : '五子棋')}
                        {gameState.appMode === 'playing' && (
                            <span className="text-[10px] font-bold text-[#8c6b38] bg-[#e3c086]/30 px-2 py-1 rounded-full border border-[#e3c086]">
                                {settings.boardSize}路 • {settings.gameMode === 'PvP' ? '双人' : settings.difficulty} • {onlineStatus === 'connected' ? '在线' : (settings.gameMode === 'PvAI' ? '人机' : '本地')}
                            </span>
                        )}
                        {onlineStatus === 'connected' && (
                                <span className="relative flex h-2 w-2">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                                </span>
                        )}
                        </span>
                    </div>
                    
                    <div className="flex items-center gap-2">
                        <button onClick={() => { setShowUserPage(true); vibrate(10); }} className="btn-retro btn-brown p-3 rounded-xl"><UserIcon size={20} /></button>
                        <button onClick={() => { setShowMenu(true); vibrate(10); }} className="btn-retro btn-brown p-3 rounded-xl"><Settings size={20} /></button>
                    </div>
                </div>

                <ScoreBoard 
                    currentPlayer={gameState.currentPlayer}
                    blackCaptures={gameState.blackCaptures}
                    whiteCaptures={gameState.whiteCaptures}
                    gameType={settings.gameType}
                    isThinking={isThinking}
                    showWinRate={settings.showWinRate}
                    appMode={gameState.appMode}
                    gameOver={gameState.gameOver}
                    userColor={settings.userColor}
                    displayWinRate={displayWinRate}
                />

                <GameControls 
                    appMode={gameState.appMode}
                    setupTool={gameState.setupTool}
                    setSetupTool={gameState.setSetupTool}
                    finishSetup={() => { gameState.setAppMode('playing'); gameState.setHistory([]); }}
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
                currentGameSettings={{
                    boardSize: settings.boardSize, gameType: settings.gameType, gameMode: settings.gameMode,
                    difficulty: settings.difficulty, maxVisits: settings.maxVisits, userColor: settings.userColor
                }}
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
                isElectronAvailable={isElectronAvailable}
           />

           <UserPage 
               isOpen={showUserPage}
               onClose={() => setShowUserPage(false)}
               session={session}
               userProfile={userProfile}
               achievementsList={achievementsList}
               userAchievements={userAchievements}
               onLoginClick={() => { setShowLoginModal(true); setShowUserPage(false); }}
               onSignOutClick={handleSignOut}
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

        </div>
    );
};

export default App;