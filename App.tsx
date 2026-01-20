import React, { useState, useEffect, useCallback, useRef } from 'react';
import { GameBoard } from './components/GameBoard';
import { BoardState, Player, GameMode, GameType, BoardSize, Difficulty } from './types';
import { createBoard, attemptMove, getAIMove, checkGomokuWin, calculateScore, calculateWinRate, serializeGame, deserializeGame } from './utils/goLogic';
import { RotateCcw, Users, Cpu, Trophy, Settings, SkipForward, Play, Frown, Globe, Copy, Check, Wind, Volume2, VolumeX, BarChart3, Skull, Undo2, AlertCircle, X, Eye, FileUp, Hash, Eraser, PenTool, LayoutGrid, Zap, Smartphone, Info, Heart, Download, RefreshCw, ExternalLink, QrCode, LogIn, LogOut, User as UserIcon, Shield, Egg, Feather, Crown, Medal, Sword, Disc, Utensils, Clover } from 'lucide-react';

// [新增] 引入 AI Hook
import { useKataGo, sliderToVisits, visitsToSlider, ExtendedDifficulty } from './hooks/useKataGo'; 
import { useAchievements } from './hooks/useAchievements';

// --- 1. 引入 Supabase ---
import { Session } from '@supabase/supabase-js';
import { supabase } from './utils/supabaseClient';

// --- 3. 定义信令消息类型 ---
type SignalMessage = 
  | { type: 'join' } 
  | { type: 'offer'; sdp: RTCSessionDescriptionInit }
  | { type: 'answer'; sdp: RTCSessionDescriptionInit }
  | { type: 'ice'; candidate: RTCIceCandidateInit };

// 原有的 Worker URL 可以保留用于获取额外 TURN (可选)，或者直接删掉
const WORKER_URL = 'https://api.yesterhaze.codes';

// Undo History Item
interface HistoryItem {
    board: BoardState;
    currentPlayer: Player;
    blackCaptures: number;
    whiteCaptures: number;
    lastMove: { x: number, y: number } | null;
    consecutivePasses: number;
}

type AppMode = 'playing' | 'review' | 'setup';

// --- 常量配置 ---
const CURRENT_VERSION = '1.8.0';
// 默认下载链接（官网或Fallback）
const DEFAULT_DOWNLOAD_LINK = 'https://yesterhaze.codes'; 

// 简单的语义化版本比较函数
// 返回 1 (v1 > v2), -1 (v1 < v2), 0 (相等)
const compareVersions = (v1: string, v2: string) => {
  const parts1 = v1.split('.').map(Number);
  const parts2 = v2.split('.').map(Number);
  const len = Math.max(parts1.length, parts2.length);

  for (let i = 0; i < len; i++) {
    const num1 = parts1[i] || 0;
    const num2 = parts2[i] || 0;
    if (num1 > num2) return 1;
    if (num1 < num2) return -1;
  }
  return 0;
};

// --- ELO 计算逻辑 ---
const calculateElo = (myRating: number, opponentRating: number, result: 'win' | 'loss'): number => {
        const kFactor = 32; // 权重系数
        const expectedScore = 1 / (1 + Math.pow(10, (opponentRating - myRating) / 400));
        const actualScore = result === 'win' ? 1 : 0;
        return Math.round(myRating + kFactor * (actualScore - expectedScore));
};

const calculateNewRating = (
    playerRating: number,
    opponentRating: number,
    result: 0 | 0.5 | 1,
    kFactor: number = 16
): number => {
    const expectedScore = 1 / (1 + Math.pow(10, (opponentRating - playerRating) / 400));
    const newRating = Math.round(playerRating + kFactor * (result - expectedScore));
    return Math.max(0, newRating);
};

const getAiRating = (diff: ExtendedDifficulty): number => {
    switch (diff) {
            case 'Easy':
                    return 850;
            case 'Medium':
                    return 1350;
            case 'Hard':
                    return 1800;
            case 'Custom':
                    return 1800;
            default:
                    return 1350;
    }
};

const getRankBadge = (elo: number) => {
  if (elo >= 1800) return { Icon: Crown, color: 'text-yellow-500', label: '皇冠' };
  if (elo >= 1500) return { Icon: Trophy, color: 'text-gray-500', label: '奖杯' };
  if (elo >= 1200) return { Icon: Feather, color: 'text-[#8c6b38]', label: '羽毛' };
  return { Icon: Egg, color: 'text-[#c4ae88]', label: '蛋' };
};

// 在 App 组件外部定义扩展类型
// ExtendedDifficulty type imported from useKataGo

const App: React.FC = () => {
  // --- 1. 定义一个读取本地存储的辅助函数 ---
  const loadState = <T,>(key: string, fallback: T): T => {
    try {
      const saved = localStorage.getItem(key);
      return saved !== null ? JSON.parse(saved) : fallback;
    } catch (e) {
      return fallback;
    }
  };

    // --- Auth & Profile State ---
    const [session, setSession] = useState<Session | null>(null);
    const [userProfile, setUserProfile] = useState<{ nickname: string; elo: number } | null>(null);
    const [showLoginModal, setShowLoginModal] = useState(false);
    const [loginMode, setLoginMode] = useState<'signin' | 'signup'>('signin');
    const [authEmail, setAuthEmail] = useState('');
    const [authPassword, setAuthPassword] = useState('');
    const [authNickname, setAuthNickname] = useState('');

    // --- Matchmaking State ---
    const [isMatching, setIsMatching] = useState(false);
    const [matchTime, setMatchTime] = useState(0);
    const [queueCounts, setQueueCounts] = useState<{ [key: string]: number }>({});
    const [opponentProfile, setOpponentProfile] = useState<{ id: string; elo: number } | null>(null);

    const matchTimerRef = useRef<number | null>(null);

  // --- 2. Global App State (使用 loadState 初始化) ---
  const [boardSize, setBoardSize] = useState<BoardSize>(() => loadState('boardSize', 9));
  const [gameType, setGameType] = useState<GameType>(() => loadState('gameType', 'Go'));
  const [gameMode, setGameMode] = useState<GameMode>(() => loadState('gameMode', 'PvP'));
  const [difficulty, setDifficulty] = useState<ExtendedDifficulty>(() => loadState('difficulty', 'Medium'));
  
  // [新增] 思考量状态 (默认 5)
  const [maxVisits, setMaxVisits] = useState<number>(() => loadState('maxVisits', 5));

  // New: Player Color Preference (vs AI)
  const [userColor, setUserColor] = useState<Player>(() => loadState('userColor', 'black'));
  
  // Visual/Audio Settings (同样持久化)
  const [showQi, setShowQi] = useState<boolean>(() => loadState('showQi', false));
  const [showWinRate, setShowWinRate] = useState<boolean>(() => loadState('showWinRate', true));
  const [showCoordinates, setShowCoordinates] = useState<boolean>(() => loadState('showCoordinates', false));
  const [musicVolume, setMusicVolume] = useState<number>(() => loadState('musicVolume', 0.3));
  const [hapticEnabled, setHapticEnabled] = useState<boolean>(() => loadState('hapticEnabled', true));

  // --- 3. 监听状态变化并自动保存 ---
  useEffect(() => {
    localStorage.setItem('boardSize', JSON.stringify(boardSize));
    localStorage.setItem('gameType', JSON.stringify(gameType));
    localStorage.setItem('gameMode', JSON.stringify(gameMode));
    localStorage.setItem('difficulty', JSON.stringify(difficulty));
    localStorage.setItem('maxVisits', JSON.stringify(maxVisits));
    localStorage.setItem('userColor', JSON.stringify(userColor));
    
    localStorage.setItem('showQi', JSON.stringify(showQi));
    localStorage.setItem('showWinRate', JSON.stringify(showWinRate));
    localStorage.setItem('showCoordinates', JSON.stringify(showCoordinates));
    localStorage.setItem('musicVolume', JSON.stringify(musicVolume));
    localStorage.setItem('hapticEnabled', JSON.stringify(hapticEnabled));
  }, [boardSize, gameType, gameMode, difficulty, maxVisits, userColor, showQi, showWinRate, showCoordinates, musicVolume, hapticEnabled]);

  // Settings Modal Local State (这些不需要持久化，因为每次打开菜单都会从上面的主状态同步)
  const [tempBoardSize, setTempBoardSize] = useState<BoardSize>(9);
  const [tempGameType, setTempGameType] = useState<GameType>('Go');
  const [tempGameMode, setTempGameMode] = useState<GameMode>('PvP');
  const [tempDifficulty, setTempDifficulty] = useState<ExtendedDifficulty>('Medium');
  // [新增] 临时思考量状态
  const [tempMaxVisits, setTempMaxVisits] = useState<number>(1000);
  const [tempUserColor, setTempUserColor] = useState<Player>('black'); // Temp state for settings

  const fetchProfile = async (userId: string) => {
      const { data } = await supabase.from('profiles').select('*').eq('id', userId).single();
      if (data) setUserProfile({ nickname: data.nickname, elo: data.elo_rating });
  };

  const handleAuth = async () => {
      if (loginMode === 'signin') {
          const { error } = await supabase.auth.signInWithPassword({ email: authEmail, password: authPassword });
          if (error) alert('登录失败: ' + error.message);
      } else {
          const { error } = await supabase.auth.signUp({
              email: authEmail,
              password: authPassword,
              options: { data: { nickname: authNickname || '棋手' } }
          });
          if (error) alert('注册失败: ' + error.message);
          else alert('注册成功！请直接登录。');
      }
  };

  // --- Auth Initialization ---
  useEffect(() => {
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

  // Game State
  const [board, setBoard] = useState<BoardState>(createBoard(9));
  const [currentPlayer, setCurrentPlayer] = useState<Player>('black');
  const [blackCaptures, setBlackCaptures] = useState(0);
  const [whiteCaptures, setWhiteCaptures] = useState(0);
  const [lastMove, setLastMove] = useState<{ x: number; y: number } | null>(null);
  const [gameOver, setGameOver] = useState(false);
  const [winner, setWinner] = useState<Player | null>(null);
  const [winReason, setWinReason] = useState<string>('');
  const [consecutivePasses, setConsecutivePasses] = useState(0);
  const [passNotificationDismissed, setPassNotificationDismissed] = useState(false); 
  const [finalScore, setFinalScore] = useState<{black: number, white: number} | null>(null);
  
  // App Modes
  const [appMode, setAppMode] = useState<AppMode>('playing');
  const [reviewIndex, setReviewIndex] = useState(0); 
  const [setupTool, setSetupTool] = useState<'black' | 'white' | 'erase'>('black'); 

  // Import/Export
  const [showImportModal, setShowImportModal] = useState(false);
  const [importKey, setImportKey] = useState('');

  // About & Support
  const [showAboutModal, setShowAboutModal] = useState(false);
  const [donationMethod, setDonationMethod] = useState<'wechat' | 'alipay'>('wechat');
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [updateMsg, setUpdateMsg] = useState('');
  const [downloadUrl, setDownloadUrl] = useState<string>(DEFAULT_DOWNLOAD_LINK);
  const [newVersionFound, setNewVersionFound] = useState(false);
  const [socialTip, setSocialTip] = useState('');
  
  // Undo Stack
  const [history, setHistory] = useState<HistoryItem[]>([]);
  
  // UI State
  const [showMenu, setShowMenu] = useState(false);
    const [showUserPage, setShowUserPage] = useState(false);
  const [showPassModal, setShowPassModal] = useState(false); 
  const [isThinking, setIsThinking] = useState(false); 
    const [eloDiffText, setEloDiffText] = useState<string | null>(null);
    const [eloDiffStyle, setEloDiffStyle] = useState<'gold' | 'normal' | 'negative' | null>(null);
    const [toastMsg, setToastMsg] = useState<string | null>(null);

  // [新增] --- 初始化 PC 端 AI 引擎 ---
    // [新增] 初始化成就系统
  const { 
    newUnlocked, 
    clearNewUnlocked, 
    checkEndGameAchievements, 
    checkMoveAchievements,
    achievementsList,
    userAchievements
  } = useAchievements(session?.user?.id);

  const aiEngine = useKataGo({
    boardSize,
    // AI 落子时的回调（复用现有的 executeMove，视为非远程操作以记录历史）
    onAiMove: (x, y) => executeMove(x, y, false), 
    // AI 停着时的回调
    onAiPass: () => handlePass(false) 
  });
  
  // 解构出我们需要用到的状态
  // isAvailable: 判断当前是否在 PC 端 (有 electronAPI)
  const { isAvailable: isPcAiAvailable, aiWinRate: pcAiWinRate, isThinking: isPcAiThinking, isInitializing, setIsInitializing } = aiEngine;

  // 记录是否首次运行 (用于显示不同的加载提示)
  const [isFirstRun] = useState(() => !localStorage.getItem('has_run_ai_before'));
  
  // [修改] 统一的思考状态：本地 JS 思考中 或 PC KataGo 思考中
  const showThinkingStatus = isThinking || isPcAiThinking;

  // --- [新增] 辅助函数：处理非线性滑块逻辑 ---
  // sliderToVisits 和 visitsToSlider 已移至 useKataGo hooks 中引用

  const handleDifficultySelect = (diff: ExtendedDifficulty) => {
      setTempDifficulty(diff);
      switch (diff) {
          case 'Easy': setTempMaxVisits(1); break;
          case 'Medium': setTempMaxVisits(10); break;
          case 'Hard': setTempMaxVisits(100); break;
      }
  };

  const handleCustomChange = (val: number) => {
      setTempMaxVisits(val);
      if (val !== 1 && val !== 10 && val !== 100) {
          setTempDifficulty('Custom');
      }
  };

  const getCalculatedVisits = (diff: ExtendedDifficulty, customVal: number) => {
      switch (diff) {
          case 'Easy': return 1;    
          case 'Medium': return 10; 
          case 'Hard': return 100;  
          case 'Custom': return customVal; 
          default: return 10;
      }
  };

  // Online State
  const [showOnlineMenu, setShowOnlineMenu] = useState(false);
    const [matchBoardSize, setMatchBoardSize] = useState<BoardSize>(() => ([9, 13, 19].includes(boardSize) ? boardSize : 9));
  const [peerId, setPeerId] = useState<string>('');
  const [remotePeerId, setRemotePeerId] = useState<string>('');
  const [onlineStatus, setOnlineStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
  const [myColor, setMyColor] = useState<Player | null>(null);
  const [copied, setCopied] = useState(false);
  const [gameCopied, setGameCopied] = useState(false);

  // WebRTC Refs
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const connectionTimeoutRef = useRef<number | null>(null);
  const isManualDisconnect = useRef<boolean>(false);

  // Audio Refs
  const bgmRef = useRef<HTMLAudioElement | null>(null);
  const sfxMove = useRef<HTMLAudioElement | null>(null);
  const sfxCapture = useRef<HTMLAudioElement | null>(null);
  const sfxError = useRef<HTMLAudioElement | null>(null);
  const sfxWin = useRef<HTMLAudioElement | null>(null);
  const sfxLose = useRef<HTMLAudioElement | null>(null);

  const [hasInteracted, setHasInteracted] = useState(false);

  // Refs for State
  const boardRef = useRef(board);
  const currentPlayerRef = useRef(currentPlayer);
  const gameTypeRef = useRef(gameType);
  const myColorRef = useRef(myColor);
  const onlineStatusRef = useRef(onlineStatus);

  useEffect(() => { boardRef.current = board; }, [board]);
  useEffect(() => { currentPlayerRef.current = currentPlayer; }, [currentPlayer]);
  useEffect(() => { gameTypeRef.current = gameType; }, [gameType]);
  useEffect(() => { myColorRef.current = myColor; }, [myColor]);
  useEffect(() => { onlineStatusRef.current = onlineStatus; }, [onlineStatus]);

  const getSfxVolume = useCallback(() => Math.min(1, Math.max(0, musicVolume + 0.2)), [musicVolume]);

  const setAllSfxVolume = useCallback((volume: number) => {
      [sfxMove, sfxCapture, sfxError, sfxWin, sfxLose].forEach((ref) => {
          if (ref.current) ref.current.volume = volume;
      });
  }, []);

  // Handle Audio Initialization
  useEffect(() => {
     const initSfx = (ref: React.MutableRefObject<HTMLAudioElement | null>, src: string) => {
         const audio = new Audio(src);
         audio.preload = 'auto';
         ref.current = audio;
     };
     initSfx(sfxMove, '/move.wav');
     initSfx(sfxCapture, '/capture.wav');
     initSfx(sfxError, '/error.wav');
     initSfx(sfxWin, '/win.wav');
     initSfx(sfxLose, '/lose.wav');
  }, []);

  // Haptic Helper
  const vibrate = useCallback((pattern: number | number[]) => {
      if (hapticEnabled && navigator.vibrate) {
          navigator.vibrate(pattern);
      }
  }, [hapticEnabled]);

  const playSfx = (type: 'move' | 'capture' | 'error' | 'win' | 'lose') => {
      if (musicVolume === 0) return; 
      
      const play = (ref: React.MutableRefObject<HTMLAudioElement | null>) => {
          if (ref.current) {
              ref.current.currentTime = 0;
              ref.current.play().catch(() => {});
          }
      };

      switch(type) {
          case 'move': play(sfxMove); break;
          case 'capture': play(sfxCapture); break;
          case 'error': play(sfxError); break;
          case 'win': play(sfxWin); break;
          case 'lose': play(sfxLose); break;
      }
  };

  useEffect(() => {
    const startAudio = () => {
        if (!hasInteracted) {
            setHasInteracted(true);
            if (bgmRef.current && musicVolume > 0 && bgmRef.current.paused) {
                bgmRef.current.play().catch(e => console.log('Autoplay deferred:', e));
            }
        }
    };
    
    document.addEventListener('click', startAudio);
    return () => document.removeEventListener('click', startAudio);
  }, [hasInteracted, musicVolume]);

  useEffect(() => {
    if (bgmRef.current) {
        bgmRef.current.volume = musicVolume;
        if (musicVolume > 0 && bgmRef.current.paused && hasInteracted) {
             bgmRef.current.play().catch(e => console.log("Play blocked", e));
        } else if (musicVolume === 0) {
            bgmRef.current.pause();
        }
    }
  }, [musicVolume, hasInteracted]);

  useEffect(() => {
      const handleVisibilityChange = () => {
          if (!bgmRef.current) return;
          if (document.hidden) {
              bgmRef.current.pause();
          } else if (musicVolume > 0 && hasInteracted) {
              bgmRef.current.play().catch(() => {});
          }
      };

      document.addEventListener('visibilitychange', handleVisibilityChange);
      return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [musicVolume, hasInteracted]);

    useEffect(() => {
            setAllSfxVolume(getSfxVolume());
    }, [getSfxVolume, setAllSfxVolume]);

  // Sync temp settings when menu opens
  useEffect(() => {
      if (showMenu) {
          setTempBoardSize(boardSize);
          setTempGameType(gameType);
          setTempDifficulty(difficulty);
          setTempGameMode(gameMode);
          setTempUserColor(userColor);
      }
  }, [showMenu, boardSize, gameType, difficulty, gameMode, userColor]);

  const applySettingsAndRestart = () => {
      vibrate(20);
      setBoardSize(tempBoardSize);
      setGameType(tempGameType);
      setDifficulty(tempDifficulty);
      setGameMode(tempGameMode);
      setUserColor(tempUserColor);

      if (tempGameMode === 'PvAI' && userProfile?.elo !== undefined) {
          const lowAi = tempDifficulty === 'Easy' || tempDifficulty === 'Medium';
          if (userProfile.elo >= 1450 && lowAi) {
              setToastMsg('以你现在的实力，战胜这个难度的 AI 将无法获得积分，建议挑战更高级别或联机对战！');
              setTimeout(() => setToastMsg(null), 3500);
          }
      }
      
      // Reset logic
      setBoard(createBoard(tempBoardSize));
      setCurrentPlayer('black'); // Always start with black turn internally
      setBlackCaptures(0);
      setWhiteCaptures(0);
      setLastMove(null);
      setGameOver(false);
      setWinner(null);
      setWinReason('');
      setConsecutivePasses(0);
      setPassNotificationDismissed(false);
      setFinalScore(null);
      setHistory([]);
      setShowMenu(false);
      setShowPassModal(false);
      setIsThinking(false);
      setAppMode('playing');
    setEloDiffText(null);
    setEloDiffStyle(null);
      
      cleanupOnline();

      // [新增] PC 端重置 AI
      if (isPcAiAvailable && tempGameType === 'Go') {
          // 重置 KataGo，默认贴目 7.5
          aiEngine.resetAI(tempBoardSize, 7.5);
          
          // 特殊情况：如果是人机对战，且玩家选白棋（AI执黑），需要让 AI 先行
          if (tempGameMode === 'PvAI' && tempUserColor === 'white') {
              setTimeout(() => {
                   // 1000 是 maxVisits，这里的 1000 是默认上限，也可以传 difficulty
                   aiEngine.requestAiMove('black', tempDifficulty, 1000); 
              }, 500);
          }
      }
  };

  // Check Version Logic - Using Supabase
  const handleCheckUpdate = async () => {
      setCheckingUpdate(true);
      setUpdateMsg('');
      setNewVersionFound(false); // Reset on check
      try {
          // 从 Supabase 的 app_config 表中获取 key 为 'latest_release' 的数据
          const { data, error } = await supabase
              .from('app_config')
              .select('value')
              .eq('key', 'latest_release')
              .single();

          if (error) {
            console.error('Supabase query error:', error);
            if (error.code === 'PGRST116') {
                setUpdateMsg('未找到版本信息');
            } else {
                throw error;
            }
            return;
          }

          if (data && data.value) {
              const remoteVersion = data.value.version;
              const remoteUrl = data.value.downloadUrl;
              const releaseNote = data.value.message;

              // 如果 Supabase 里的版本 > 当前代码里的版本
              if (compareVersions(remoteVersion, CURRENT_VERSION) > 0) {
                  setUpdateMsg(`发现新版本: v${remoteVersion} ${releaseNote ? `(${releaseNote})` : ''}`);
                  if (remoteUrl) setDownloadUrl(remoteUrl);
                  setNewVersionFound(true); // Only show button if update found
              } else {
                  setUpdateMsg('当前已是最新版本');
                  setNewVersionFound(false);
              }
          }
      } catch (e) {
          console.error(e);
          setUpdateMsg('检查失败，请检查网络');
      } finally {
          setCheckingUpdate(false);
      }
  };

  const copySocial = (id: string, platform: string) => {
    navigator.clipboard.writeText(id);
    vibrate(10);
    setSocialTip(`已复制 ${platform} ID`);
    setTimeout(() => setSocialTip(''), 2000);
  };

  // --- AI Turn Trigger Update ---
  useEffect(() => {
    // 基本检查保持不变
    if (appMode !== 'playing' || gameMode !== 'PvAI' || gameOver || showPassModal) return;

    const aiColor = userColor === 'black' ? 'white' : 'black';
    
    if (currentPlayer === aiColor) {
      // [新增] 分支判断
      if (isPcAiAvailable && gameType === 'Go') {
          // --- 分支 A: PC 端 (Electron + KataGo) ---
          // 如果 AI 目前没有在思考，则发送请求
          if (!isPcAiThinking) {
              // 这里传入 difficulty，hooks 内部会决定 visits
              // [修改] 传入 maxVisits
              aiEngine.requestAiMove(aiColor, difficulty, maxVisits); 
          }
      } else {
          // --- 分支 B: 安卓/Web 端 (纯 JS 算法) ---
          // 保持你原有的逻辑不变
          setIsThinking(true);
          const timer = setTimeout(() => {
            let prevHash = null; if (history.length > 0) prevHash = getBoardHash(history[history.length-1].board);
            const move = getAIMove(board, aiColor, gameType, difficulty, prevHash);
            
            if (move === 'RESIGN') {
                 setIsThinking(false);
                 endGame(userColor, 'AI 认为差距过大，投子认输');
            } else if (move) {
                 executeMove(move.x, move.y, false);
                 setIsThinking(false);
            } else {
                 handlePass();
                 setIsThinking(false);
            }
          }, 700);
          return () => clearTimeout(timer);
      }
    } else {
        // 轮到玩家落子时，确保 PC AI 停止思考状态（安全阀）
        if (isPcAiAvailable && isPcAiThinking) {
            aiEngine.stopThinking();
        }
    }
  }, [currentPlayer, gameMode, board, gameOver, gameType, difficulty, showPassModal, appMode, userColor, history, isPcAiAvailable, isPcAiThinking, aiEngine]);


  // --- Helper: Board Stringify for Ko ---
  const getBoardHash = (b: BoardState) => {
      let str = '';
      for(let r=0; r<b.length; r++) for(let c=0; c<b.length; c++) str += b[r][c] ? (b[r][c]?.color==='black'?'B':'W') : '.';
      return str;
  };

  // --- Online Logic (Simplified for this update context) ---
  const getIceServers = async () => {
    const publicStunServers = ["stun:stun.qq.com:3478", "stun:stun.miwifi.com:3478", "stun:stun.chat.bilibili.com:3478"];
    let turnServers = [];
    try { const res = await fetch(`${WORKER_URL}/ice-servers`, { method: 'POST' }); const data = await res.json(); if (data && data.iceServers) turnServers = data.iceServers; } catch (e) {}
    return [{ urls: publicStunServers }, ...turnServers];
  };

  const sendSignal = async (roomId: string, payload: SignalMessage) => {
    try { await supabase.channel(`room_${roomId}`).send({ type: 'broadcast', event: 'signal', payload }); } catch (error) {}
  };

    const setupPeerConnection = async (roomId: string, isHost: boolean, shouldCreateDataChannel: boolean) => {
      if (pcRef.current) pcRef.current.close();
      const iceServers = await getIceServers();
      const pc = new RTCPeerConnection({ iceServers, iceTransportPolicy: 'all', bundlePolicy: 'max-bundle' });
      pcRef.current = pc;
      pc.oniceconnectionstatechange = () => {
          if (pc.iceConnectionState === 'connected') {
              setOnlineStatus('connected');
              if (connectionTimeoutRef.current) clearTimeout(connectionTimeoutRef.current);
          } else if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed') {
              setOnlineStatus('disconnected');
              if (!isManualDisconnect.current) {
                  alert("连接异常中断 (对方可能已离开)");
              }
          }
      };
      pc.onicecandidate = (event) => { if (event.candidate) sendSignal(roomId, { type: 'ice', candidate: event.candidate.toJSON() }); };
      if (shouldCreateDataChannel) { const dc = pc.createDataChannel("game-channel"); setupDataChannel(dc, isHost); } 
      else { pc.ondatachannel = (event) => setupDataChannel(event.channel, isHost); }
      return pc;
  };

  const setupDataChannel = (dc: RTCDataChannel, isHost: boolean) => {
      dataChannelRef.current = dc;
      dc.onopen = () => {
          setOnlineStatus('connected'); setIsMatching(false); setShowOnlineMenu(false); setShowMenu(false); setGameMode('PvP');

          if (isHost) {
              // Host (白棋) 发送 Sync（使用房主的棋盘大小）
              setMyColor('white');
              resetGame(true);

              const syncPayload: any = {
                  type: 'SYNC',
                  boardSize,
                  gameType: gameTypeRef.current,
                  startColor: 'black'
              };
              if (session && userProfile) {
                  syncPayload.opponentInfo = { id: session.user.id, elo: userProfile.elo };
              }
              dc.send(JSON.stringify(syncPayload));
          } else {
              // Joiner (黑棋) 等待 Sync
          }
      };
      dc.onmessage = (e) => {
          const msg = JSON.parse(e.data);
          if (msg.type === 'MOVE') executeMove(msg.x, msg.y, true);
          else if (msg.type === 'PASS') handlePass(true);
          else if (msg.type === 'SYNC') { 
              setBoardSize(msg.boardSize); 
              setTempBoardSize(msg.boardSize);
              setGameType(msg.gameType); 
              setTempGameType(msg.gameType);
              setMyColor(msg.startColor);

              if (msg.opponentInfo) {
                  setOpponentProfile(msg.opponentInfo);
                  if (session && userProfile) {
                      dc.send(JSON.stringify({
                          type: 'SYNC_REPLY',
                          opponentInfo: { id: session.user.id, elo: userProfile.elo }
                      }));
                  }
              }
              resetGame(true, msg.boardSize);
              vibrate(20);
          }
          else if (msg.type === 'SYNC_REPLY') {
              if (msg.opponentInfo) {
                  setOpponentProfile(msg.opponentInfo);
              }
          }
          else if (msg.type === 'RESTART') resetGame(true);
      };
      dc.onclose = () => { 
          setOnlineStatus('disconnected'); 
          setMyColor(null); 
          if (!isManualDisconnect.current) {
              alert("与对方的连接已断开");
          }
      };
  };

  const cleanupOnline = () => {
      if (channelRef.current) { supabase.removeChannel(channelRef.current); channelRef.current = null; }
      if (pcRef.current) { pcRef.current.close(); pcRef.current = null; }
      if (connectionTimeoutRef.current) { clearTimeout(connectionTimeoutRef.current); connectionTimeoutRef.current = null; }
      setOnlineStatus('disconnected');
      setOpponentProfile(null);
  };

  useEffect(() => { return () => cleanupOnline(); }, []);

  const cancelMatchmaking = async () => {
      if (matchTimerRef.current) {
          clearInterval(matchTimerRef.current);
          matchTimerRef.current = null;
      }
      setIsMatching(false);
      setMatchTime(0);
      if (peerId) {
          await supabase.from('matchmaking_queue').delete().eq('peer_id', peerId);
      }
      cleanupOnline();
  };

  const startMatchmaking = async (sizeOverride?: BoardSize) => {
      if (!session || !userProfile) {
          setShowLoginModal(true);
          return;
      }

      const validSizes: BoardSize[] = [9, 13, 19];
      const sizeToMatch = sizeOverride ?? matchBoardSize;
      if (!validSizes.includes(sizeToMatch)) {
          alert("排位匹配仅支持 9路、13路 或 19路 棋盘。\n请在设置中调整棋盘大小。");
          setShowMenu(true);
          return;
      }

      if (onlineStatus === 'connected') return;

      if (isMatching) {
          if (sizeToMatch === matchBoardSize) return;
          await cancelMatchmaking();
      }

      setMatchBoardSize(sizeToMatch);
      setBoardSize(sizeToMatch);
      setTempBoardSize(sizeToMatch);
      setIsMatching(true);
      setMatchTime(0);

      const myTempPeerId = Math.floor(100000 + Math.random() * 900000).toString();
      setPeerId(myTempPeerId);

      matchTimerRef.current = window.setInterval(() => setMatchTime(prev => prev + 1), 1000);

    const myElo = userProfile.elo;

      const findOpponent = async (attempt: number): Promise<any> => {
          const range = attempt === 1 ? 100 : (attempt === 2 ? 300 : 9999);

          const { data: opponents } = await supabase
              .from('matchmaking_queue')
              .select('*')
              .eq('game_type', gameType)
              .eq('board_size', sizeToMatch)
              .neq('user_id', session.user.id)
              .gte('elo_rating', myElo - range)
              .lte('elo_rating', myElo + range)
              .limit(1);

          return opponents && opponents.length > 0 ? opponents[0] : null;
      };

      try {
          let opponent = await findOpponent(1);
          if (!opponent) {
               await new Promise(r => setTimeout(r, 1000));
               opponent = await findOpponent(2);
          }

          if (opponent) {
              const { error } = await supabase.from('matchmaking_queue').delete().eq('id', opponent.id);

              if (!error) {
                  setOpponentProfile({ id: opponent.user_id, elo: opponent.elo_rating });
                  if (matchTimerRef.current) clearInterval(matchTimerRef.current);
                  setIsMatching(false);

                  setRemotePeerId(opponent.peer_id);
                  setOnlineStatus('connecting');
                  await joinRoom(opponent.peer_id, 'black');
                  return;
              }
          }

          isManualDisconnect.current = false;
          cleanupOnline();
          setOnlineStatus('connecting');
          const channel = supabase.channel(`room_${myTempPeerId}`);
          channelRef.current = channel;

          channel.on('broadcast', { event: 'signal' }, async ({ payload }: { payload: SignalMessage }) => {
               const pc = pcRef.current;
               if (payload.type === 'offer' && payload.sdp) {
                   supabase.from('matchmaking_queue').delete().eq('peer_id', myTempPeerId).then();
                   if (matchTimerRef.current) clearInterval(matchTimerRef.current);
                   setIsMatching(false);
                   setOnlineStatus('connecting');
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
                   await supabase.from('matchmaking_queue').insert({
                       peer_id: myTempPeerId,
                       game_type: gameType,
                       board_size: sizeToMatch,
                       elo_rating: myElo,
                       user_id: session.user.id
                   });
                   setOnlineStatus('disconnected');
               }
          });

      } catch (e) {
          console.error(e);
          cancelMatchmaking();
      }
  };

  const createRoom = async () => {
      isManualDisconnect.current = false;
      cleanupOnline();
      const id = Math.floor(100000 + Math.random() * 900000).toString();
      setPeerId(id);
      const channel = supabase.channel(`room_${id}`);
      channelRef.current = channel;
      channel.on('broadcast', { event: 'signal' }, async ({ payload }: { payload: SignalMessage }) => {
          let pc = pcRef.current;
          if (payload.type === 'offer' && payload.sdp) {
              if (!pc) pc = await setupPeerConnection(id, true, false);
              await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
              const answer = await pc.createAnswer();
              await pc.setLocalDescription(answer);
              await sendSignal(id, { type: 'answer', sdp: pc.localDescription! });
          }
          else if (payload.type === 'answer' && payload.sdp && pc) await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
          else if (payload.type === 'ice' && payload.candidate && pc) await pc.addIceCandidate(new RTCIceCandidate(payload.candidate));
      }).subscribe();
  };

  const joinRoom = async (roomId?: string, forcedColor?: Player) => {
      const targetId = roomId || remotePeerId;
      if (!targetId) return;
      isManualDisconnect.current = false;
      cleanupOnline();
      setOnlineStatus('connecting');
      
      // Connection Timeout Logic
      connectionTimeoutRef.current = window.setTimeout(() => {
          if (onlineStatusRef.current !== 'connected') {
              isManualDisconnect.current = true; // prevent double alert
              cleanupOnline();
              alert("连接超时：房间可能不存在或对方离线");
              setOnlineStatus('disconnected');
          }
      }, 15000); // 15s timeout

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

  useEffect(() => { if (showOnlineMenu && !peerId && onlineStatus === 'disconnected') createRoom(); }, [showOnlineMenu, peerId, onlineStatus]);

  useEffect(() => {
      if (!showOnlineMenu) return;
      const updateCounts = async () => {
          const sizes: BoardSize[] = [9, 13, 19];
          const results = await Promise.all(
              sizes.map(size =>
                  supabase.from('matchmaking_queue')
                      .select('*', { count: 'exact', head: true })
                      .eq('game_type', gameType)
                      .eq('board_size', size)
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
  }, [showOnlineMenu, gameType]);

  const resetGame = (keepOnline: boolean = false, explicitSize?: number) => {
    // 优先使用传入的 explicitSize，否则使用当前的 state
    const sizeToUse = explicitSize !== undefined ? explicitSize : boardSize;
    
    setBoard(createBoard(sizeToUse)); 
    setCurrentPlayer('black'); setBlackCaptures(0); setWhiteCaptures(0); setLastMove(null); setGameOver(false); setWinner(null); setWinReason(''); setConsecutivePasses(0); setPassNotificationDismissed(false); setFinalScore(null); setHistory([]); setShowMenu(false); setShowPassModal(false); setIsThinking(false); setAppMode('playing');
    
    // [新增] PC 端简单的重置 (保持当前规则)
    if (isPcAiAvailable && gameType === 'Go') {
        aiEngine.resetAI(sizeToUse, 7.5);
    }
    
    // Always send RESTART if connected, so opponent resets too
    if (onlineStatusRef.current === 'connected' && dataChannelRef.current?.readyState === 'open') {
        dataChannelRef.current.send(JSON.stringify({ type: 'RESTART' }));
    }
    
    // Only disconnect if explicitly told NOT to keep online
    if (!keepOnline) { 
        isManualDisconnect.current = true;
        cleanupOnline(); 
        setMyColor(null); 
    }
  };

  const sendData = (msg: any) => { if (dataChannelRef.current?.readyState === 'open') dataChannelRef.current.send(JSON.stringify(msg)); };
  
  const copyId = () => { navigator.clipboard.writeText(peerId); setCopied(true); setTimeout(() => setCopied(false), 2000); vibrate(10); };
  const copyGameState = () => { const stateStr = serializeGame(board, currentPlayer, gameType, blackCaptures, whiteCaptures); navigator.clipboard.writeText(stateStr); setGameCopied(true); setTimeout(() => setGameCopied(false), 2000); vibrate(10); };

  const handleImportGame = () => {
      const gameState = deserializeGame(importKey);
      if (gameState) {
          setBoard(gameState.board); setCurrentPlayer(gameState.currentPlayer); setGameType(gameState.gameType); setBoardSize(gameState.boardSize); setBlackCaptures(gameState.blackCaptures); setWhiteCaptures(gameState.whiteCaptures);
          setHistory([]); setGameOver(false); setWinner(null); setConsecutivePasses(0); setAppMode('playing'); setShowImportModal(false); setShowMenu(false); playSfx('move'); vibrate(20);
      } else { alert('无效的棋局密钥'); }
  };
  
  const handleUndo = () => {
      if (history.length === 0 || isThinking || gameOver || onlineStatus === 'connected') return;
      vibrate(10);
      let stepsToUndo = 1;
      if (gameMode === 'PvAI' && userColor === currentPlayer && history.length >= 2) stepsToUndo = 2; // Normal case: Undo user's move + AI's move
      else if (gameMode === 'PvAI' && userColor !== currentPlayer && history.length >= 1) stepsToUndo = 1; // Special case: Undo during AI thinking or odd state

      const prev = history[history.length - stepsToUndo];
      setBoard(prev.board); setCurrentPlayer(prev.currentPlayer); setBlackCaptures(prev.blackCaptures); setWhiteCaptures(prev.whiteCaptures); setLastMove(prev.lastMove); setConsecutivePasses(prev.consecutivePasses); setPassNotificationDismissed(false); 
      setHistory(prevHistory => prevHistory.slice(0, prevHistory.length - stepsToUndo));
  };

  const executeMove = (x: number, y: number, isRemote: boolean) => {
      const currentBoard = boardRef.current; const activePlayer = currentPlayerRef.current; const currentType = gameTypeRef.current;
      let prevHash = null;
      if (history.length > 0) prevHash = getBoardHash(history[history.length - 1].board);
      const result = attemptMove(currentBoard, x, y, activePlayer, currentType, prevHash);
      if (result) {
          // [新增] 成就检测：每一步落子
          if (!isRemote && session?.user?.id) {
             checkMoveAchievements({
               x, y, 
               color: activePlayer, 
               moveNumber: history.length + 1, 
               boardSize 
             });
          }

          if (result.captured > 0) { playSfx('capture'); vibrate([20, 30, 20]); } 
          else { playSfx('move'); vibrate(15); }
          
          if (!isRemote) setHistory(prev => [...prev, { board: currentBoard, currentPlayer: activePlayer, blackCaptures, whiteCaptures, lastMove, consecutivePasses }]);
          setBoard(result.newBoard); setLastMove({ x, y }); setConsecutivePasses(0); setPassNotificationDismissed(false); 
          if (result.captured > 0) { if (activePlayer === 'black') setBlackCaptures(prev => prev + result.captured); else setWhiteCaptures(prev => prev + result.captured); }
          if (currentType === 'Gomoku' && checkGomokuWin(result.newBoard, {x, y})) { setTimeout(() => endGame(activePlayer, '五子连珠！'), 0); return; }
          setCurrentPlayer(prev => prev === 'black' ? 'white' : 'black');
      } else { if (!isRemote) { playSfx('error'); vibrate([10, 50]); } }
  };

  const handleIntersectionClick = useCallback((x: number, y: number) => {
    if (appMode === 'review') return; 
    if (appMode === 'setup') {
        const newBoard = board.map(row => row.map(s => s));
        if (setupTool === 'erase') { if (newBoard[y][x]) { newBoard[y][x] = null; playSfx('capture'); vibrate(10); } } 
        else { newBoard[y][x] = { color: setupTool, x, y, id: `setup-${setupTool}-${Date.now()}` }; playSfx('move'); vibrate(15); }
        setBoard(newBoard); return;
    }
    if (gameOver || isThinking) return;
    
    // PvAI check: if it's AI's turn, block user
    const aiColor = userColor === 'black' ? 'white' : 'black';
    if (gameMode === 'PvAI' && currentPlayer === aiColor) return;

    if (onlineStatus === 'connected') { if (currentPlayer !== myColor) return; sendData({ type: 'MOVE', x, y }); }
    
    // [新增] 如果是 PC 端且是围棋模式，同步人类的一手棋给 KataGo
    if (isPcAiAvailable && gameType === 'Go') {
        aiEngine.syncHumanMove(currentPlayer, x, y);
    }

    executeMove(x, y, false);
  }, [gameOver, gameMode, currentPlayer, onlineStatus, myColor, isThinking, appMode, setupTool, board, userColor, isPcAiAvailable, aiEngine, gameType]);

  const handlePass = useCallback((isRemote: boolean = false) => {
    if (gameOver) return;
    vibrate(10);
    if (!isRemote) setHistory(prev => [...prev, { board: boardRef.current, currentPlayer: currentPlayerRef.current, blackCaptures, whiteCaptures, lastMove, consecutivePasses }]);
    if (onlineStatusRef.current === 'connected' && !isRemote) { if (currentPlayerRef.current !== myColorRef.current) return; sendData({ type: 'PASS' }); }
    const isUserPassInPvAI = !isRemote && gameMode === 'PvAI' && gameType === 'Go' && currentPlayerRef.current === userColor;
    if (isUserPassInPvAI) {
        if (isPcAiAvailable && isPcAiThinking) {
            aiEngine.stopThinking();
        }
        setIsThinking(false);
        const score = calculateScore(boardRef.current);
        setFinalScore(score);
        setShowPassModal(false);
        setConsecutivePasses(2);
        if (score.black > score.white) endGame('black', `比分: 黑 ${score.black} - 白 ${score.white}`);
        else endGame('white', `比分: 白 ${score.white} - 黑 ${score.black}`);
        return;
    }
    setConsecutivePasses(prev => {
        const newPasses = prev + 1;
        if (newPasses >= 2) { setTimeout(() => { const score = calculateScore(boardRef.current); setFinalScore(score); setShowPassModal(false); if (score.black > score.white) endGame('black', `比分: 黑 ${score.black} - 白 ${score.white}`); else endGame('white', `比分: 白 ${score.white} - 黑 ${score.black}`); }, 0); }
        return newPasses;
    });
    setPassNotificationDismissed(false); 
    if (consecutivePasses < 1) { setCurrentPlayer(prev => prev === 'black' ? 'white' : 'black'); setLastMove(null); }
  }, [gameOver, gameMode, gameType, consecutivePasses, blackCaptures, whiteCaptures, lastMove, userColor, isPcAiAvailable, isPcAiThinking, aiEngine]); 

  const endGame = async (winnerColor: Player, reason: string) => { 
      setGameOver(true);
      setWinner(winnerColor);
      setWinReason(reason);
      vibrate([50, 50, 50, 50]);
      playSfx('win');

      // [新增] 成就检测
      if (session?.user?.id && (gameMode === 'PvAI' || onlineStatus === 'connected')) {
          const myPlayerColor = onlineStatus === 'connected' ? myColor : userColor;
          const currentScore = calculateScore(boardRef.current);

          checkEndGameAchievements({
             winner: winnerColor,
             myColor: myPlayerColor || 'black', 
             score: currentScore,
             captures: { black: blackCaptures, white: whiteCaptures },
             boardSize
          });
      }

      if (onlineStatus === 'connected' && session && userProfile && opponentProfile && myColor) {
          const isWin = myColor === winnerColor;
          const result = isWin ? 'win' : 'loss';

          const newElo = calculateElo(userProfile.elo, opponentProfile.elo, result);
          const eloDiff = newElo - userProfile.elo;
          const diffText = eloDiff > 0 ? `+${eloDiff}` : `${eloDiff}`;

          setWinReason(`${reason} (积分 ${diffText})`);
          setEloDiffText(diffText);
          setEloDiffStyle(eloDiff > 0 ? 'normal' : 'negative');

          if (isWin) {
              const winnerNewElo = calculateElo(userProfile.elo, opponentProfile.elo, 'win');
              const loserNewElo = calculateElo(opponentProfile.elo, userProfile.elo, 'loss');

              await supabase.rpc('update_game_elo', {
                  winner_id: session.user.id,
                  loser_id: opponentProfile.id,
                  winner_new_elo: winnerNewElo,
                  loser_new_elo: loserNewElo
              });

              fetchProfile(session.user.id);
          } else {
              setTimeout(() => fetchProfile(session.user.id), 2000);
          }
      } else if (gameMode === 'PvAI' && session && userProfile) {
          const isWin = winnerColor === userColor;
          const resultScore: 0 | 0.5 | 1 = isWin ? 1 : 0;
          const aiRating = getAiRating(difficulty);
          const kFactor = 16;
          const newElo = calculateNewRating(userProfile.elo, aiRating, resultScore, kFactor);
          const eloDiff = newElo - userProfile.elo;
          const diffText = eloDiff > 0 ? `+${eloDiff}` : `${eloDiff}`;

          if (isWin && userProfile.elo <= 1200 && aiRating >= 1800) {
              setWinReason(`史诗级胜利！战胜了强敌！ (积分 ${diffText})`);
              setEloDiffStyle('gold');
          } else {
              setWinReason(`${reason} (积分 ${diffText})`);
              setEloDiffStyle(eloDiff > 0 ? 'normal' : 'negative');
          }
          setEloDiffText(diffText);

          await supabase.from('profiles')
              .update({ elo_rating: newElo })
              .eq('id', session.user.id);

          fetchProfile(session.user.id);
      }
  };

  const startReview = () => { setAppMode('review'); setReviewIndex(history.length - 1); setGameOver(false); };
  const startSetup = () => { resetGame(false); setAppMode('setup'); setShowMenu(false); };
  const finishSetup = () => { setAppMode('playing'); setHistory([]); };

  const currentDisplayBoard = appMode === 'review' && history[reviewIndex] ? history[reviewIndex].board : board;
  const currentDisplayLastMove = appMode === 'review' && history[reviewIndex] ? history[reviewIndex].lastMove : lastMove;
  
  // Win Rate Logic with Color Flip
  const rawWinRate = showWinRate && !gameOver && appMode === 'playing' && gameType === 'Go' 
      ? (isPcAiAvailable && pcAiWinRate !== 50 ? pcAiWinRate : calculateWinRate(board)) 
      : 50;
  // If user is White, show White's win rate (which is 100 - Black's win rate)
  const displayWinRate = userColor === 'white' ? (100 - rawWinRate) : rawWinRate;
  
  const getSliderBackground = (val: number, min: number, max: number) => { const percentage = ((val - min) / (max - min)) * 100; return `linear-gradient(to right, #5d4037 ${percentage}%, #d4b483 ${percentage}%)`; };

  const RenderStoneIcon = ({ color }: { color: 'black' | 'white' }) => {
    const filterId = color === 'black' ? 'url(#global-jelly-black)' : 'url(#global-jelly-white)';
    const fillColor = color === 'black' ? '#2a2a2a' : '#f0f0f0';
    return (
        <div className="w-8 h-8 flex items-center justify-center relative">
            <svg viewBox="0 0 24 24" className="w-full h-full overflow-visible">
                <circle cx="12" cy="12" r="10" fill={fillColor} filter={filterId} />
            </svg>
        </div>
    );
  };

  return (
    <div className="h-full w-full bg-[#f7e7ce] flex flex-col md:flex-row items-center relative select-none overflow-hidden text-[#5c4033]">
      
      <audio ref={bgmRef} loop src="/bgm.mp3" />

      {toastMsg && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[80] bg-[#5c4033] text-[#fcf6ea] px-4 py-2 rounded-full text-xs font-bold shadow-lg border-2 border-[#8c6b38] animate-in fade-in">
              {toastMsg}
          </div>
      )}

      {/* 成就解锁通知 */}
      {/* 动画效果：从顶部滑入，带有弹性和模糊背景 */}
      <div className={`fixed top-8 left-1/2 -translate-x-1/2 z-[100] transition-all duration-500 ease-spring ${newUnlocked ? 'translate-y-0 opacity-100' : '-translate-y-20 opacity-0 pointer-events-none'}`}>
        {newUnlocked && (
            <div className="relative group cursor-pointer" onClick={clearNewUnlocked}>
                {/* 外部光晕动画 */}
                <div className="absolute -inset-1 bg-gradient-to-r from-[#ffd700] via-[#ffecb3] to-[#ffd700] rounded-2xl blur opacity-75 group-hover:opacity-100 transition duration-1000 group-hover:duration-200 animate-tilt"></div>
                
                {/* 主体卡片 */}
                <div className="relative bg-[#fff] bg-opacity-95 backdrop-blur-md rounded-2xl p-4 shadow-2xl border border-[#ffd700]/50 flex items-center gap-4 min-w-[320px] overflow-hidden">
                    
                    {/* 左侧图标区 */}
                    <div className="relative shrink-0">
                        <div className="absolute inset-0 bg-[#ffd700] rounded-full blur opacity-40 animate-pulse"></div>
                        <div className="relative bg-gradient-to-br from-[#fff9c4] to-[#ffecb3] p-3 rounded-full border-2 border-[#ffc107] text-[#5c4033] shadow-md">
                            {newUnlocked.icon === 'Heart' && <Heart size={24} fill="#f44336" className="text-[#f44336] animate-heartbeat" />}
                            {newUnlocked.icon === 'Crown' && <Crown size={24} className="text-[#ff9800] animate-bounce-slow" />}
                            {newUnlocked.icon === 'Medal' && <Medal size={24} className="text-[#ff9800] animate-pulse" />}
                            {!['Heart', 'Crown', 'Medal'].includes(newUnlocked.icon) && <Trophy size={24} className="animate-bounce-slow" />}
                        </div>
                    </div>

                    {/* 中间文字区 */}
                    <div className="flex flex-col flex-grow">
                        <div className="flex items-center gap-2 mb-0.5">
                            <span className="text-[10px] font-black text-[#ff6f00] uppercase tracking-widest bg-[#ffecb3]/50 px-1.5 rounded border border-[#ffe082]">
                                Achievement Unlocked
                            </span>
                        </div>
                        <span className="text-lg font-black text-[#5c4033] leading-tight group-hover:text-[#ff6f00] transition-colors">{newUnlocked.name}</span>
                        <span className="text-xs font-medium text-[#8c6b38] line-clamp-1">{newUnlocked.description}</span>
                    </div>

                    {/* 右侧流光装饰 */}
                    <div className="absolute top-0 right-0 w-16 h-full bg-gradient-to-l from-white/40 to-transparent skew-x-[-20deg] translate-x-full animate-shimmer-fast"></div>
                </div>
            </div>
        )}
      </div>

      {/* --- BOARD AREA --- */}
       <div className="relative flex-grow h-[60%] md:h-full w-full flex items-center justify-center p-2 order-2 md:order-1 min-h-0">
          <div className="w-full h-full max-w-full max-h-full aspect-square flex items-center justify-center">
             <div className="transform transition-transform w-full h-full">
                <GameBoard 
                    board={currentDisplayBoard} 
                    onIntersectionClick={handleIntersectionClick}
                    currentPlayer={currentPlayer}
                    lastMove={currentDisplayLastMove}
                    showQi={showQi}
                    gameType={gameType}
                    showCoordinates={showCoordinates}
                />
             </div>
          </div>
          
          {showThinkingStatus && (
              <div className="absolute top-4 left-4 bg-white/80 px-4 py-2 rounded-full text-xs font-bold text-[#5c4033] animate-pulse border-2 border-[#e3c086] shadow-sm z-20">
                  {isPcAiAvailable ? 'KataGo 正在计算...' : 'AI 正在思考...'}
              </div>
          )}
          
          {consecutivePasses === 1 && !gameOver && !passNotificationDismissed && (
               <div className="absolute inset-0 z-30 flex items-center justify-center pointer-events-none">
                    <div className="bg-[#fff8e1] border-4 border-[#cba367] text-[#5c4033] px-6 py-6 rounded-3xl shadow-2xl flex flex-col items-center animate-in zoom-in duration-300 w-64 pointer-events-auto">
                        <div className="flex items-center gap-2 mb-4">
                            <AlertCircle size={28} className="text-[#cba367]" />
                            <span className="text-xl font-black">对手停着</span>
                        </div>
                        <p className="text-xs font-bold text-gray-500 text-center mb-6 leading-relaxed">对手认为无需再落子。<br/>点击空白处可继续。</p>
                        <div className="flex flex-col gap-3 w-full">
                            <button onClick={() => setPassNotificationDismissed(true)} className="btn-retro btn-brown w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2">
                                <Play size={16} fill="currentColor" /> 继续
                            </button>
                            <button onClick={() => handlePass(false)} className="btn-retro btn-coffee w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2">
                                <SkipForward size={16} fill="currentColor" /> 结算
                            </button>
                        </div>
                    </div>
                </div>
          )}
      </div>

      {/* --- SIDEBAR --- */}
      <div className="w-full md:w-80 lg:w-96 flex flex-col gap-4 p-4 z-20 shrink-0 bg-[#f7e7ce] md:bg-[#f2e6d6] md:h-full md:border-l-4 md:border-[#e3c086] order-1 md:order-2 shadow-xl md:shadow-none">
        {/* Header */}
        <div className="flex justify-between items-center">
            <div className="flex flex-col">
                <span className="font-black text-[#5c4033] text-xl leading-tight flex items-center gap-2 tracking-wide">
                {appMode === 'setup' ? '电子挂盘' : appMode === 'review' ? '复盘模式' : (gameType === 'Go' ? '围棋' : '五子棋')}
                {appMode === 'playing' && (
                    <span className="text-[10px] font-bold text-[#8c6b38] bg-[#e3c086]/30 px-2 py-1 rounded-full border border-[#e3c086]">
                        {boardSize}路 • {gameMode === 'PvP' ? '双人' : (difficulty === 'Hard' ? '困难' : difficulty === 'Medium' ? '中等' : '简单')} • {onlineStatus === 'connected' ? '在线' : (gameMode === 'PvAI' ? '人机' : '本地')}
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
                <button 
                    onClick={() => { setShowUserPage(true); vibrate(10); }}
                    className="btn-retro btn-brown p-3 rounded-xl"
                >
                    <UserIcon size={20} />
                </button>
                <button 
                    onClick={() => { setShowMenu(true); vibrate(10); }}
                    className="btn-retro btn-brown p-3 rounded-xl"
                >
                    <Settings size={20} />
                </button>
            </div>
        </div>

        {/* Score Card */}
        <div className="flex flex-col gap-2">
            <div className="grid grid-cols-2 gap-3">
                <div className={`flex items-center gap-3 px-4 py-3 rounded-2xl border-2 transition-all duration-300 ${currentPlayer === 'black' ? 'bg-[#5c4033] border-[#3e2b22] text-[#f7e7ce] shadow-md scale-105' : 'border-[#e3c086] bg-transparent opacity-60'}`}>
                    <div className="relative">
                        <RenderStoneIcon color="black" />
                        {currentPlayer === 'black' && isThinking && <div className="absolute -top-1 -right-1 w-3 h-3 bg-yellow-400 rounded-full animate-ping"></div>}
                    </div>
                    <div className="flex flex-col">
                        <span className="font-bold text-sm">黑子</span>
                        {gameType === 'Go' && <span className="text-[10px] font-bold opacity-80">提子: {blackCaptures}</span>}
                    </div>
                </div>

                <div className={`flex items-center justify-end gap-3 px-4 py-3 rounded-2xl border-2 transition-all duration-300 ${currentPlayer === 'white' ? 'bg-[#fcf6ea] border-[#e3c086] text-[#5c4033] shadow-md scale-105' : 'border-[#e3c086] bg-transparent opacity-60'}`}>
                    <div className="flex flex-col items-end">
                        <span className="font-bold text-sm">白子</span>
                        {gameType === 'Go' && <span className="text-[10px] font-bold opacity-80">提子: {whiteCaptures}</span>}
                    </div>
                    <div className="relative">
                        <RenderStoneIcon color="white" />
                        {currentPlayer === 'white' && isThinking && <div className="absolute -top-1 -right-1 w-3 h-3 bg-yellow-400 rounded-full animate-ping"></div>}
                    </div>
                </div>
            </div>

            {showWinRate && gameType === 'Go' && appMode === 'playing' && (
                <div className="relative w-full h-5 rounded-full overflow-hidden flex shadow-inner mt-2 border border-[#5c4033]/30">
                     {/* Win Rate Bar Visuals adapted for User Color */}
                    <div className="h-full bg-gradient-to-r from-[#2a2a2a] to-[#5c4033] transition-all duration-1000 ease-in-out relative flex items-center" style={{ width: `${userColor === 'white' ? (100 - displayWinRate) : displayWinRate}%` }}>
                         {userColor === 'black' && <span className="absolute right-2 text-[10px] font-bold text-white/90 whitespace-nowrap">{Math.round(displayWinRate)}%</span>}
                    </div>
                    <div className="h-full bg-gradient-to-r from-[#f0f0f0] to-[#ffffff] transition-all duration-1000 ease-in-out relative flex items-center justify-end" style={{ width: `${userColor === 'white' ? displayWinRate : (100 - displayWinRate)}%` }}>
                        {userColor === 'white' && <span className="absolute left-2 text-[10px] font-bold text-gray-600 whitespace-nowrap">{Math.round(displayWinRate)}%</span>}
                    </div>
                </div>
            )}
        </div>

         {/* Action Controls */}
        <div className="mt-auto">
            {/* SETUP MODE CONTROLS */}
            {appMode === 'setup' && (
                <div className="grid grid-cols-4 gap-2 mb-2">
                    <button onClick={() => setSetupTool('black')} className={`btn-retro flex flex-col items-center justify-center p-2 rounded-2xl border-2 ${setupTool === 'black' ? 'bg-[#2a2a2a] text-[#f7e7ce] border-[#000]' : 'bg-[#e3c086] text-[#5c4033] border-[#c4ae88]'}`}>
                        <div className="w-4 h-4 rounded-full bg-black border border-gray-600 mb-1"></div>
                        <span className="text-[10px] font-bold">黑子</span>
                    </button>
                    <button onClick={() => setSetupTool('white')} className={`btn-retro flex flex-col items-center justify-center p-2 rounded-2xl border-2 ${setupTool === 'white' ? 'bg-[#fcf6ea] text-[#5c4033] border-[#e3c086]' : 'bg-[#e3c086] text-[#5c4033] border-[#c4ae88]'}`}>
                        <div className="w-4 h-4 rounded-full bg-white border border-gray-300 mb-1"></div>
                        <span className="text-[10px] font-bold">白子</span>
                    </button>
                    <button onClick={() => setSetupTool('erase')} className={`btn-retro flex flex-col items-center justify-center p-2 rounded-2xl border-2 ${setupTool === 'erase' ? 'bg-[#e57373] text-white border-[#d32f2f]' : 'bg-[#e3c086] text-[#5c4033] border-[#c4ae88]'}`}>
                        <Eraser size={16} className="mb-1" />
                        <span className="text-[10px] font-bold">擦除</span>
                    </button>
                     <button onClick={finishSetup} className="btn-retro flex flex-col items-center justify-center p-2 rounded-2xl border-2 bg-[#81c784] text-white border-[#388e3c]">
                        <Play size={16} className="mb-1" fill="currentColor"/>
                        <span className="text-[10px] font-bold">开始</span>
                    </button>
                </div>
            )}

            {/* REVIEW MODE CONTROLS */}
            {appMode === 'review' && (
                <div className="flex flex-col gap-3 mb-2 bg-[#fcf6ea] p-4 rounded-2xl border-2 border-[#e3c086] shadow-sm">
                     <div className="flex justify-between items-center text-xs font-bold text-[#8c6b38]">
                        <span>第 {reviewIndex} 手</span>
                        <span>共 {history.length} 手</span>
                     </div>
                     <input 
                        type="range" min="0" max={history.length > 0 ? history.length - 1 : 0} 
                        value={reviewIndex} onChange={(e) => setReviewIndex(parseInt(e.target.value))}
                        className="cute-range"
                        style={{ background: getSliderBackground(reviewIndex, 0, history.length > 0 ? history.length - 1 : 1) }}
                     />
                     <div className="flex gap-2">
                        <button onClick={() => setReviewIndex(Math.max(0, reviewIndex - 1))} className="btn-retro btn-beige flex-1 py-2 rounded-xl font-bold">上一步</button>
                        <button onClick={() => setReviewIndex(Math.min(history.length - 1, reviewIndex + 1))} className="btn-retro btn-beige flex-1 py-2 rounded-xl font-bold">下一步</button>
                        <button onClick={() => { setAppMode('playing'); setGameOver(true); }} className="btn-retro px-4 bg-[#e3c086] text-[#5c4033] border-[#c4ae88] rounded-xl py-2 font-bold">退出</button>
                     </div>
                </div>
            )}

            {/* PLAYING MODE CONTROLS */}
            {appMode === 'playing' && (
                <div className="grid grid-cols-3 gap-3">
                    <button onClick={handleUndo} disabled={history.length === 0 || isThinking || gameOver || onlineStatus === 'connected'} className="btn-retro btn-sand flex flex-col items-center justify-center gap-1 p-3 rounded-2xl font-bold disabled:opacity-50">
                        <Undo2 size={20} /> <span className="text-xs">悔棋</span>
                    </button>
                    <button onClick={() => handlePass(false)} disabled={gameOver || (onlineStatus === 'connected' && currentPlayer !== myColor)} className={`btn-retro btn-coffee flex flex-col items-center justify-center gap-1 p-3 rounded-2xl font-bold disabled:opacity-50 ${consecutivePasses === 1 ? 'animate-pulse' : ''}`}>
                        <SkipForward size={20} /> <span className="text-xs">{consecutivePasses === 1 ? '结算' : '停着'}</span>
                    </button>
                    <button onClick={() => resetGame(onlineStatus === 'connected')} className="btn-retro btn-beige flex flex-col items-center justify-center gap-1 p-3 rounded-2xl font-bold">
                        <RotateCcw size={20} /> <span className="text-xs">重开</span>
                    </button>
                </div>
            )}
        </div>
        
        <div className="hidden md:block flex-grow"></div>
      </div>

      {/* --- SETTINGS MENU --- */}
      {showMenu && (
        <div className="absolute inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-[#fcf6ea] rounded-[2rem] w-full max-w-sm shadow-2xl border-[6px] border-[#8c6b38] flex flex-col max-h-[90vh] overflow-hidden relative">
            
            {/* Header */}
            <div className="bg-[#fcf6ea] border-b-2 border-[#e3c086] border-dashed p-4 flex justify-between items-center shrink-0">
                <h2 className="text-2xl font-black text-[#5c4033] tracking-wide">游戏设置</h2>
                <button onClick={() => setShowMenu(false)} className="text-[#8c6b38] hover:text-[#5c4033] bg-[#fff] rounded-full p-2 border-2 border-[#e3c086] transition-colors"><X size={20}/></button>
            </div>
            
            <div className="p-6 overflow-y-auto custom-scrollbar flex flex-col gap-6">
                
                {/* 1. Game Config */}
                <div className="space-y-4">
                    <h3 className="text-sm font-bold text-[#8c6b38] uppercase tracking-widest mb-1">游戏模式</h3>
                    
                    {/* Game Type & Mode Toggles */}
                    <div className="space-y-4">
                        <div className="inset-track rounded-xl p-1 relative h-12 flex items-center">
                            <div className={`absolute top-1 bottom-1 w-1/2 bg-[#fcf6ea] rounded-lg shadow-md transition-all duration-300 ease-out z-0 ${tempGameType === 'Gomoku' ? 'translate-x-full left-[-2px]' : 'left-1'}`} />
                            <button onClick={() => setTempGameType('Go')} className={`flex-1 relative z-10 font-bold text-sm transition-colors duration-200 ${tempGameType === 'Go' ? 'text-[#5c4033]' : 'text-[#8c6b38]/70 hover:text-[#5c4033]'}`}>围棋</button>
                            <button onClick={() => setTempGameType('Gomoku')} className={`flex-1 relative z-10 font-bold text-sm transition-colors duration-200 ${tempGameType === 'Gomoku' ? 'text-[#5c4033]' : 'text-[#8c6b38]/70 hover:text-[#5c4033]'}`}>五子棋</button>
                        </div>

                        <div className="inset-track rounded-xl p-1 relative h-12 flex items-center">
                             <div className={`absolute top-1 bottom-1 w-1/2 bg-[#fcf6ea] rounded-lg shadow-md transition-all duration-300 ease-out z-0 ${tempGameMode === 'PvAI' ? 'translate-x-full left-[-2px]' : 'left-1'}`} />
                            <button onClick={() => setTempGameMode('PvP')} className={`flex-1 relative z-10 font-bold text-sm transition-colors duration-200 ${tempGameMode === 'PvP' ? 'text-[#5c4033]' : 'text-[#8c6b38]/70 hover:text-[#5c4033]'}`}>双人对战</button>
                            <button onClick={() => setTempGameMode('PvAI')} className={`flex-1 relative z-10 font-bold text-sm transition-colors duration-200 ${tempGameMode === 'PvAI' ? 'text-[#5c4033]' : 'text-[#8c6b38]/70 hover:text-[#5c4033]'}`}>挑战 AI</button>
                        </div>
                    </div>

                    {/* NEW: Player Color Selection (PvAI only) */}
                    {tempGameMode === 'PvAI' && (
                        <div className="flex gap-2 items-center bg-[#fff] p-2 rounded-xl border-2 border-[#e3c086] animate-in fade-in slide-in-from-top-2">
                            <span className="text-xs font-bold text-[#8c6b38] px-2 shrink-0">我执:</span>
                            <div className="flex-1 flex gap-2">
                                <button onClick={() => setTempUserColor('black')} className={`flex-1 py-1.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1 transition-all ${tempUserColor === 'black' ? 'bg-[#5c4033] text-[#fcf6ea]' : 'bg-[#fcf6ea] text-[#5c4033]'}`}>
                                    <div className="w-3 h-3 rounded-full bg-black border border-gray-500"></div> 黑子
                                </button>
                                <button onClick={() => setTempUserColor('white')} className={`flex-1 py-1.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1 transition-all ${tempUserColor === 'white' ? 'bg-[#5c4033] text-[#fcf6ea]' : 'bg-[#fcf6ea] text-[#5c4033]'}`}>
                                    <div className="w-3 h-3 rounded-full bg-white border border-gray-400"></div> 白子
                                </button>
                            </div>
                        </div>
                    )}

                        {/* Difficulty */}
                    {tempGameMode === 'PvAI' && (
                        <div className="space-y-4 animate-in fade-in slide-in-from-top-2">
                             {/* 原有的 Difficulty 按钮 */}
                            <div className="grid grid-cols-3 gap-2">
                                {(['Easy', 'Medium', 'Hard'] as const).map((level) => (
                                    <button 
                                        key={level} 
                                        onClick={() => handleDifficultySelect(level)} 
                                        className={`btn-retro py-2 rounded-xl font-bold text-sm transition-all ${tempDifficulty === level ? 'bg-[#8c6b38] text-[#fcf6ea] border-[#5c4033]' : 'bg-[#fff] text-[#8c6b38] border-[#e3c086]'}`}
                                    >
                                        {level === 'Easy' ? '简单' : level === 'Medium' ? '中等' : '困难'}
                                    </button>
                                ))}
                            </div>

                            {/* [新增] 思考量滑块 (仅对 PC 围棋模式有效) */}
                            {isPcAiAvailable && tempGameType === 'Go' && (
                                <div className="bg-[#fff]/50 p-2 rounded-xl border border-[#e3c086] flex flex-col gap-2">
                                    <div className="flex justify-between items-center px-1">
                                        <span className="text-xs font-bold text-[#5c4033] flex items-center gap-1">
                                            <Cpu size={14} className="text-[#8c6b38]"/> 思考量
                                        </span>
                                        <span className="text-[10px] font-black text-[#fcf6ea] bg-[#8c6b38] px-1.5 py-0.5 rounded shadow-sm">
                                            {tempDifficulty === 'Custom' ? `${tempMaxVisits} Visits` : `${getCalculatedVisits(tempDifficulty, tempMaxVisits)} Visits`}
                                        </span>
                                    </div>
                                    <div className="relative h-6 flex items-center px-1">
                                        <input 
                                            type="range" min="0" max="100" step="1"
                                            value={visitsToSlider(tempMaxVisits)} 
                                            onChange={(e) => handleCustomChange(sliderToVisits(parseInt(e.target.value)))}
                                            className="cute-range w-full"
                                            style={{ 
                                                background: getSliderBackground(visitsToSlider(tempMaxVisits), 0, 100),
                                                touchAction: 'none'
                                            }}
                                        />
                                    </div>
                                    {tempDifficulty === 'Custom' && (
                                        <p className="text-[9px] text-[#8c6b38] text-center font-bold opacity-75">自定义模式</p>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </div>
                
                {/* --- REDESIGNED SLIDER 1: BOARD SIZE --- */}
                <div className="bg-[#fff]/50 p-3 rounded-2xl border border-[#e3c086] flex flex-col gap-3">
                    <div className="flex justify-between items-center px-1">
                        <span className="text-sm font-bold text-[#5c4033] flex items-center gap-2">
                            <LayoutGrid size={16} className="text-[#8c6b38]"/> 棋盘大小
                        </span>
                        <span className="text-xs font-black text-[#fcf6ea] bg-[#8c6b38] px-2 py-0.5 rounded-md shadow-sm">
                            {tempBoardSize} 路
                        </span>
                    </div>
                    
                    <div className="relative h-8 flex items-center px-2">
                         {/* Custom Tooltip Logic would go here, but for simplicity we rely on the visual bubble above */}
                         <input 
                            type="range" min="4" max="19" step="1"
                            value={tempBoardSize} 
                            onChange={(e) => setTempBoardSize(parseInt(e.target.value))}
                            className="cute-range w-full"
                            style={{ 
                                background: getSliderBackground(tempBoardSize, 4, 19),
                                touchAction: 'none'
                            }}
                        />
                    </div>
                </div>

                <div className="h-px bg-[#e3c086] border-dashed border-b border-[#e3c086]/50"></div>

                {/* 2. Visual & Audio */}
                <div className="space-y-4">
                    <h3 className="text-sm font-bold text-[#8c6b38] uppercase tracking-widest mb-1">辅助与音效</h3>
                    
                    <div className="flex gap-2 justify-between">
                        <button onClick={() => setShowWinRate(!showWinRate)} className={`btn-retro flex-1 flex flex-col items-center justify-center gap-1 px-1 py-2 rounded-xl h-16 ${showWinRate ? 'bg-[#8c6b38] border-[#5c4033] text-[#fcf6ea]' : 'bg-[#fff] border-[#e3c086] text-[#8c6b38]'}`}>
                            <BarChart3 size={18} />
                            <span className="text-xs font-bold">胜率</span>
                        </button>
                        <button onClick={() => setShowCoordinates(!showCoordinates)} className={`btn-retro flex-1 flex flex-col items-center justify-center gap-1 px-1 py-2 rounded-xl h-16 ${showCoordinates ? 'bg-[#8c6b38] border-[#5c4033] text-[#fcf6ea]' : 'bg-[#fff] border-[#e3c086] text-[#8c6b38]'}`}>
                            <LayoutGrid size={18} />
                            <span className="text-xs font-bold">坐标</span>
                        </button>
                        <button onClick={() => setShowQi(!showQi)} className={`btn-retro flex-1 flex flex-col items-center justify-center gap-1 px-1 py-2 rounded-xl h-16 ${showQi ? 'bg-[#8c6b38] border-[#5c4033] text-[#fcf6ea]' : 'bg-[#fff] border-[#e3c086] text-[#8c6b38]'}`}>
                            <Wind size={18} />
                            <span className="text-xs font-bold">气</span>
                        </button>
                    </div>

                    {/* REDESIGNED SLIDER 2: VOLUME (Shorter, safer) & HAPTIC */}
                    <div className="flex gap-3">
                         {/* Volume Control */}
                        <div className="flex-[2] flex items-center gap-3 bg-[#fff] px-3 py-2 rounded-2xl border-2 border-[#e3c086]">
                            <button onClick={() => setMusicVolume(musicVolume > 0 ? 0 : 0.3)} className="text-[#8c6b38] shrink-0">
                                {musicVolume > 0 ? <Volume2 size={20}/> : <VolumeX size={20}/>}
                            </button>
                            <div className="flex-grow max-w-[120px]">
                                <input 
                                    type="range" min="0" max="1" step="0.1" 
                                    value={musicVolume} 
                                    onChange={(e) => setMusicVolume(parseFloat(e.target.value))}
                                    className="cute-range w-full"
                                    style={{ 
                                        background: getSliderBackground(musicVolume, 0, 1),
                                        touchAction: 'none'
                                    }}
                                />
                            </div>
                        </div>

                        {/* Haptic Toggle */}
                        <button 
                            onClick={() => { setHapticEnabled(!hapticEnabled); vibrate(10); }}
                            className={`flex-1 btn-retro rounded-xl border-2 flex items-center justify-center gap-2 ${hapticEnabled ? 'bg-[#e3c086] text-[#5c4033] border-[#c4ae88]' : 'bg-[#fff] text-[#d7ccc8] border-[#e0e0e0]'}`}
                        >
                            <Smartphone size={18} className={hapticEnabled ? 'animate-pulse' : ''}/>
                            <span className="text-xs font-bold">振动</span>
                        </button>
                    </div>
                </div>

                <div className="h-px bg-[#e3c086] border-dashed border-b border-[#e3c086]/50"></div>

                {/* 3. Tools */}
                <div className="grid grid-cols-2 gap-2">
                    <button onClick={startSetup} className="btn-retro btn-beige flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm">
                        <PenTool size={16}/> 电子挂盘
                    </button>
                    <button onClick={() => { setShowImportModal(true); setShowMenu(false); }} className="btn-retro btn-beige flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm">
                        <FileUp size={16}/> 导入/导出
                    </button>
                    <button onClick={() => setShowOnlineMenu(true)} className="btn-retro col-span-2 flex items-center justify-center gap-2 bg-[#90caf9] text-[#1565c0] border-[#64b5f6] py-3 rounded-xl font-bold text-sm">
                        <Globe size={18}/> 联机对战
                    </button>
                    
                    {/* Add About & Support Button */}
                    <button onClick={() => { setShowAboutModal(true); setShowMenu(false); }} className="btn-retro col-span-2 flex items-center justify-center gap-2 bg-[#ffccbc] text-[#d84315] border-[#ffab91] py-3 rounded-xl font-bold text-sm">
                        <Heart size={18} fill="#ff5722" className="animate-pulse" /> 关于与赞赏
                    </button>
                </div>

            </div>

            {/* Footer Action */}
            <div className="p-4 bg-[#fcf6ea] border-t-2 border-[#e3c086] flex flex-col gap-2 shrink-0">
                 <button 
                    onClick={applySettingsAndRestart}
                    className="btn-retro btn-brown w-full py-3 rounded-xl font-black tracking-wider flex items-center justify-center gap-2 text-base"
                >
                    <RotateCcw size={18} /> 应用设置并重新开始
                </button>
            </div>

          </div>
        </div>
      )}

      {/* --- USER PAGE --- */}
      {showUserPage && (
        <div className="absolute inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-[#fcf6ea] rounded-[2rem] w-full max-w-sm shadow-2xl border-[6px] border-[#8c6b38] flex flex-col max-h-[90vh] overflow-hidden relative">
            {/* Header */}
            <div className="bg-[#fcf6ea] border-b-2 border-[#e3c086] border-dashed p-4 flex justify-between items-center shrink-0">
                <h2 className="text-2xl font-black text-[#5c4033] tracking-wide">我的资料</h2>
                <button onClick={() => setShowUserPage(false)} className="text-[#8c6b38] hover:text-[#5c4033] bg-[#fff] rounded-full p-2 border-2 border-[#e3c086] transition-colors"><X size={20}/></button>
            </div>

            <div className="p-6 overflow-y-auto custom-scrollbar flex flex-col gap-6">
                <div className="bg-[#fff]/60 p-4 rounded-2xl border border-[#e3c086] flex items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                        <div className="w-14 h-14 bg-[#5c4033] rounded-full flex items-center justify-center text-[#fcf6ea] border-2 border-[#8c6b38]">
                            <UserIcon size={24} />
                        </div>
                        <div className="flex flex-col">
                            <span className="text-sm font-black text-[#5c4033]">{userProfile?.nickname || '未登录'}</span>
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
                        <button onClick={() => supabase.auth.signOut()} className="btn-retro btn-brown w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2">
                            <LogOut size={16}/> 退出登录
                        </button>
                    ) : (
                        <button onClick={() => { setShowLoginModal(true); setShowUserPage(false); }} className="btn-retro btn-brown w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2">
                            <LogIn size={16}/> 登录 / 注册
                        </button>
                    )}
                </div>

                <div className="bg-[#fff] p-4 rounded-2xl border-2 border-[#e3c086] flex flex-col gap-3 max-h-[300px] overflow-y-auto custom-scrollbar">
                    <div className="flex items-center gap-2 mb-1">
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
      )}

      {/* --- ABOUT & SUPPORT MODAL --- */}
      {showAboutModal && (
        <div className="absolute inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200" onClick={(e) => { if(e.target === e.currentTarget) setShowAboutModal(false) }}>
          <div className="bg-[#fcf6ea] rounded-[2rem] w-full max-w-sm shadow-2xl border-[6px] border-[#8c6b38] flex flex-col max-h-[85vh] relative overflow-hidden">
            
            {/* Fixed Close Button Layer */}
            <div className="absolute top-0 left-0 right-0 p-4 flex justify-end z-20 pointer-events-none bg-gradient-to-b from-[#fcf6ea] via-[#fcf6ea]/80 to-transparent h-20">
                <button onClick={() => setShowAboutModal(false)} className="pointer-events-auto text-[#8c6b38] hover:text-[#5c4033] bg-[#fff] rounded-full w-10 h-10 flex items-center justify-center border-2 border-[#e3c086] transition-colors shadow-sm"><X size={20}/></button>
            </div>
            
            {/* Scrollable Content */}
            <div className="p-6 pt-16 flex flex-col gap-5 text-center overflow-y-auto custom-scrollbar overscroll-contain">
                
                {/* --- 修改开始：应用图标区域 --- */}
                <div className="flex flex-col items-center gap-2 mt-2">
                    {/* 原本是 <div ...><Info size={40}/></div>，现在替换为图片 */}
                    <div className="w-20 h-20 bg-[#5c4033] rounded-3xl shadow-lg border-4 border-[#8c6b38] overflow-hidden">
                        {/* 请确保 public 文件夹中有 logo.png */}
                        <img 
                            src="./logo.png" 
                            alt="App Icon" 
                            className="w-full h-full object-cover"
                        />
                    </div>
                    <h2 className="text-2xl font-black text-[#5c4033] tracking-wide">Cute-Go</h2>
                    <p className="text-xs font-bold text-[#8c6b38] opacity-80">可爱的围棋/五子棋对战助手<br/>Made with ❤️ by Yohaku</p>
                </div>
                {/* --- 修改结束 --- */}

                <div className="h-px bg-[#e3c086] border-dashed border-b border-[#e3c086]/50"></div>

                {/* Version & Update */}
                <div className="bg-[#fff]/50 p-4 rounded-2xl border border-[#e3c086]">
                    <div className="flex justify-between items-center mb-2">
                        <span className="text-sm font-bold text-[#5c4033]">当前版本</span>
                        <span className="bg-[#8c6b38] text-[#fcf6ea] text-xs font-bold px-2 py-1 rounded-lg">v{CURRENT_VERSION}</span>
                    </div>
                    <button 
                        onClick={handleCheckUpdate}
                        disabled={checkingUpdate}
                        className="w-full btn-retro btn-beige py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-2"
                    >
                        {checkingUpdate ? <RefreshCw size={14} className="animate-spin"/> : <RefreshCw size={14}/>}
                        {checkingUpdate ? '检查中...' : '检查更新'}
                    </button>
                    {updateMsg && (
                        <p className={`text-xs font-bold mt-2 ${updateMsg.includes('新版本') ? 'text-green-600' : 'text-[#8c6b38]'}`}>
                            {updateMsg}
                        </p>
                    )}
                </div>

                 {/* Download Link */}
                 {newVersionFound && (
                     <a 
                        href={downloadUrl} 
                        target="_blank" 
                        rel="noreferrer"
                        className="btn-retro bg-[#81c784] border-[#388e3c] text-white py-3 rounded-2xl font-black text-sm flex items-center justify-center gap-2 shadow-lg animate-in fade-in slide-in-from-top-2"
                     >
                        <Download size={18} /> 
                        {updateMsg.includes('发现新版本') ? '下载更新' : '访问官网 / 下载'}
                    </a>
                 )}

                <div className="h-px bg-[#e3c086] border-dashed border-b border-[#e3c086]/50"></div>

                {/* Social Media (已更新本地图片和ID) */}
                <div className="bg-[#fff] p-4 rounded-2xl border-2 border-[#e3c086] relative">
                    {socialTip && (
                        <div className="absolute inset-0 bg-black/60 backdrop-blur-[1px] rounded-2xl flex items-center justify-center z-10 animate-in fade-in duration-200">
                            <div className="bg-white px-3 py-1 rounded-full flex items-center gap-2">
                                <Check size={12} className="text-green-500"/>
                                <span className="text-xs font-bold text-[#5c4033]">{socialTip}</span>
                            </div>
                        </div>
                    )}
                    <div className="flex items-center justify-center gap-2 mb-3">
                         <div className="h-px bg-[#e3c086]/50 flex-1"></div>
                         <span className="text-xs font-bold text-[#8c6b38]">点击图标复制 ID</span>
                         <div className="h-px bg-[#e3c086]/50 flex-1"></div>
                    </div>
                    
                    <div className="flex justify-around px-2">
                         {/* Bilibili: 1245921330 */}
                         <button onClick={() => copySocial('1245921330', 'B站')} className="flex flex-col items-center gap-2 group">
                             <div className="w-12 h-12 rounded-full border-2 border-[#fff] shadow-[0_0_0_2px_#23ade5] flex items-center justify-center overflow-hidden group-active:scale-95 transition-transform bg-[#f0f0f0]">
                                 {/* 请确保 public 文件夹中有 bili.png */}
                                 <img src="./bili.jpg" alt="Bili" className="w-full h-full object-cover" />
                             </div>
                             <span className="text-[10px] font-bold text-[#5c4033]">Bilibili</span>
                         </button>

                         {/* 小红书: 7848618811 */}
                         <button onClick={() => copySocial('7848618811', '小红书')} className="flex flex-col items-center gap-2 group">
                             <div className="w-12 h-12 rounded-full border-2 border-[#fff] shadow-[0_0_0_2px_#ff2442] flex items-center justify-center overflow-hidden group-active:scale-95 transition-transform bg-[#f0f0f0]">
                                 {/* 请确保 public 文件夹中有 rednote.png */}
                                 <img src="./rednote.jpg" alt="RedNote" className="w-full h-full object-cover" />
                             </div>
                             <span className="text-[10px] font-bold text-[#5c4033]">小红书</span>
                         </button>

                         {/* 抖音: 47891107161 */}
                         <button onClick={() => copySocial('47891107161', '抖音')} className="flex flex-col items-center gap-2 group">
                             <div className="w-12 h-12 rounded-full border-2 border-[#fff] shadow-[0_0_0_2px_#1c1c1c] flex items-center justify-center overflow-hidden group-active:scale-95 transition-transform bg-[#f0f0f0]">
                                  {/* 请确保 public 文件夹中有 douyin.png */}
                                  <img src="./douyin.jpg" alt="Douyin" className="w-full h-full object-cover" />
                             </div>
                             <span className="text-[10px] font-bold text-[#5c4033]">抖音</span>
                         </button>
                    </div>
                </div>

                <div className="h-px bg-[#e3c086] border-dashed border-b border-[#e3c086]/50"></div>

                {/* Donation / Support (已更新本地二维码) */}
                <div className="flex flex-col gap-3 pb-4">
                    <div className="flex items-center justify-center gap-2">
                         <Heart size={16} fill="#e57373" className="text-[#e57373] animate-pulse"/>
                         <h3 className="text-sm font-bold text-[#5c4033] uppercase">支持开发者</h3>
                         <Heart size={16} fill="#e57373" className="text-[#e57373] animate-pulse"/>
                    </div>
                    <p className="text-[10px] font-bold text-[#8c6b38] leading-tight">如果喜欢这个应用，<br/>欢迎投喂一杯奶茶☕️！<br/>你们的支持是我更新的动力🤗 </p>

                    <div className="bg-[#fff] p-4 rounded-2xl border-2 border-[#e3c086]">
                        {/* Toggle */}
                        <div className="inset-track rounded-xl p-1 relative h-10 flex items-center mb-4">
                            <div className={`absolute top-1 bottom-1 w-1/2 bg-[#fcf6ea] rounded-lg shadow-md transition-all duration-300 ease-out z-0 ${donationMethod === 'alipay' ? 'translate-x-full left-[-2px]' : 'left-1'}`} />
                            <button onClick={() => setDonationMethod('wechat')} className={`flex-1 relative z-10 font-bold text-xs transition-colors duration-200 flex items-center justify-center gap-1 ${donationMethod === 'wechat' ? 'text-[#07c160]' : 'text-[#8c6b38]/60'}`}>
                                微信支付
                            </button>
                            <button onClick={() => setDonationMethod('alipay')} className={`flex-1 relative z-10 font-bold text-xs transition-colors duration-200 flex items-center justify-center gap-1 ${donationMethod === 'alipay' ? 'text-[#1677ff]' : 'text-[#8c6b38]/60'}`}>
                                支付宝
                            </button>
                        </div>

                        {/* QR Code Area - 使用本地图片 */}
                        <div className="w-full aspect-square bg-[#fcf6ea] rounded-xl border-2 border-dashed border-[#e3c086] flex items-center justify-center relative overflow-hidden group">
                             {/* 请确保 public 文件夹中有 wechat_pay.png 和 alipay_pay.png */}
                             <img 
                                src={donationMethod === 'wechat' 
                                    ? './wechat_pay.jpg' 
                                    : './alipay_pay.jpg'
                                } 
                                alt={donationMethod === 'wechat' ? "WeChat QR" : "Alipay QR"}
                                className="w-full h-full object-contain p-2" 
                             />
                             {/* 扫光特效 */}
                             <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/20 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000 pointer-events-none"></div>
                        </div>
                        <p className="text-[10px] text-[#8c6b38] mt-2 font-bold opacity-75">
                            (个人收款码不支持直接跳转，请截图或长按保存扫码)
                        </p>
                    </div>
                </div>

            </div>
          </div>
        </div>
      )}

      {/* ... (Online Menu, Import Modal, Game Over Modal - Keeping existing code structure implied) ... */}
      {/* ONLINE MENU */}
      {showOnlineMenu && (
        <div className="absolute inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
             <div className="bg-[#fcf6ea] rounded-3xl p-6 w-full max-w-sm shadow-2xl border-[6px] border-[#5c4033] relative overflow-hidden text-center">
                <button onClick={() => { setShowOnlineMenu(false); if (isMatching) cancelMatchmaking(); }} className="absolute top-4 right-4 text-[#8c6b38] hover:text-[#5c4033]"><X size={24}/></button>
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
                                    onClick={() => startMatchmaking(size as BoardSize)}
                                    disabled={isMatching || onlineStatus === 'connecting' || onlineStatus === 'connected'}
                                    className={`btn-retro py-2 rounded-xl font-bold text-xs ${matchBoardSize === size ? 'bg-[#8c6b38] text-[#fcf6ea] border-[#5c4033]' : 'bg-[#fff] text-[#8c6b38] border-[#e3c086]'}`}
                                >
                                    匹配 {size} 路
                                </button>
                            ))}
                        </div>
                        {isMatching && (
                            <button onClick={cancelMatchmaking} className="btn-retro btn-coffee w-full py-2 rounded-xl font-bold text-xs mt-3">
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
                            <button onClick={copyId} className="p-2 hover:bg-[#fcf6ea] rounded-full transition-colors">
                                {copied ? <Check size={18} className="text-green-500"/> : <Copy size={18} className="text-[#8c6b38]"/>}
                            </button>
                        </div>
                    </div>
                    <div className="relative">
                        <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                            <Hash size={18} className="text-[#8c6b38]" />
                        </div>
                        <input type="text" placeholder="输入对方房间号" value={remotePeerId} onChange={(e) => setRemotePeerId(e.target.value.replace(/[^0-9]/g, '').slice(0,6))} className="w-full pl-10 pr-4 py-3 bg-[#fff] border-2 border-[#e3c086] rounded-xl focus:border-[#5c4033] focus:ring-0 font-mono text-lg font-bold text-center outline-none transition-all text-[#5c4033]"/>
                    </div>
                    <button onClick={() => joinRoom(remotePeerId)} disabled={remotePeerId.length < 6 || onlineStatus === 'connecting' || onlineStatus === 'connected'} className="btn-retro btn-brown w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2">
                        {onlineStatus === 'connecting' ? '连接中...' : '加入房间'}
                    </button>
                </div>
             </div>
        </div>
      )}

      {/* IMPORT / EXPORT MODAL */}
      {showImportModal && (
        <div className="absolute inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="bg-[#fcf6ea] rounded-3xl p-6 w-full max-w-sm shadow-2xl border-[6px] border-[#5c4033] relative">
                <button onClick={() => setShowImportModal(false)} className="absolute top-4 right-4 text-[#8c6b38] hover:text-[#5c4033]"><X size={24}/></button>
                <h2 className="text-xl font-black text-[#5c4033] mb-4 flex items-center gap-2"><FileUp className="text-[#5c4033]"/> 导入/导出棋局</h2>
                <div className="space-y-4">
                    <div className="bg-[#fff] p-3 rounded-xl border-2 border-[#e3c086]">
                        <p className="text-xs font-bold text-[#8c6b38] uppercase mb-2">导出当前棋局</p>
                        <button onClick={copyGameState} className="w-full py-2 bg-[#fcf6ea] border border-[#e3c086] text-[#5c4033] font-bold rounded-lg hover:bg-[#e3c086] hover:text-white flex items-center justify-center gap-2 transition-all">
                             {gameCopied ? <Check size={16}/> : <Copy size={16}/>}
                             {gameCopied ? '已复制' : '复制棋局代码'}
                        </button>
                    </div>
                    <div className="bg-[#fff] p-3 rounded-xl border-2 border-[#e3c086]">
                        <p className="text-xs font-bold text-[#8c6b38] uppercase mb-2">导入棋局</p>
                        <textarea className="w-full p-2 text-xs font-mono bg-[#fcf6ea] border border-[#e3c086] rounded-lg h-20 resize-none outline-none focus:border-[#5c4033] text-[#5c4033]" placeholder="在此粘贴棋局代码..." value={importKey} onChange={(e) => setImportKey(e.target.value)}/>
                        <button onClick={handleImportGame} disabled={!importKey} className="btn-retro btn-brown w-full mt-2 py-2 rounded-lg">加载棋局</button>
                    </div>
                </div>
            </div>
        </div>
      )}

      {/* GAME OVER MODAL */}
      {gameOver && !showMenu && (
        <div className="absolute inset-0 z-40 flex items-center justify-center p-4 pointer-events-auto">
            <div className="absolute inset-0 bg-black/20 backdrop-blur-[2px]" onClick={() => {}} />
            <div className="bg-[#fcf6ea] rounded-3xl p-8 w-full max-w-sm shadow-2xl border-[6px] border-[#5c4033] flex flex-col items-center text-center animate-in zoom-in duration-300 relative z-50">
                <div className="mb-4">
                    {winner === 'black' ? (
                        <div className="w-20 h-20 bg-black rounded-full flex items-center justify-center shadow-lg border-4 border-gray-700">
                             <Trophy size={40} className="text-yellow-400" />
                        </div>
                    ) : (
                        <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center shadow-lg border-4 border-gray-200">
                             <Trophy size={40} className="text-yellow-500" />
                        </div>
                    )}
                </div>
                <h2 className="text-3xl font-black text-[#5c4033] mb-2">{winner === 'black' ? '黑方获胜!' : '白方获胜!'}</h2>
                <p className="text-[#8c6b38] font-bold mb-6 bg-[#e3c086]/30 px-3 py-1 rounded-full text-sm">{winReason}</p>
                {eloDiffText && (
                    <div className={`mb-4 text-lg font-black ${
                        eloDiffStyle === 'gold' ? 'text-yellow-500 animate-bounce' :
                        eloDiffStyle === 'negative' ? 'text-red-500' :
                        'text-[#2e7d32]'
                    } transition-all duration-300`}>积分 {eloDiffText}</div>
                )}
                {finalScore && (
                     <div className="flex gap-8 mb-6 text-sm font-bold text-[#5c4033]">
                        <div className="flex flex-col items-center">
                            <span className="text-xs text-[#8c6b38] uppercase">黑方得分</span>
                            <span className="text-xl text-black">{finalScore.black}</span>
                        </div>
                        <div className="w-px bg-[#e3c086]"></div>
                        <div className="flex flex-col items-center">
                            <span className="text-xs text-[#8c6b38] uppercase">白方得分</span>
                            <span className="text-xl text-gray-500">{finalScore.white}</span>
                        </div>
                     </div>
                )}
                <div className="flex flex-col gap-3 w-full">
                    <button onClick={() => resetGame(true)} className="btn-retro btn-brown w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2">
                        <RotateCcw size={18} /> 再来一局
                    </button>
                    <button onClick={startReview} className="btn-retro btn-beige w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2">
                        <Eye size={18} /> 复盘
                    </button>
                </div>
            </div>
        </div>
      )}

      {/* [新增] AI 初始化弹窗 (复刻 App copy.tsx 样式) */}
      {isInitializing && isPcAiAvailable && (
        <div className="absolute inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-500">
            <div className="bg-[#fcf6ea] rounded-3xl p-8 w-full max-w-sm shadow-2xl border-[6px] border-[#8c6b38] flex flex-col items-center text-center relative">
                
                {/* 加载图标 */}
                <div className="mb-6 relative">
                    <div className="w-16 h-16 border-4 border-[#e3c086] border-t-[#5c4033] rounded-full animate-spin"></div>
                    <Cpu size={24} className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[#5c4033]" />
                </div>

                <h2 className="text-2xl font-black text-[#5c4033] mb-3">
                    {isFirstRun ? "正在进行首次初始化" : "AI 引擎启动中..."}
                </h2>

                <div className="bg-[#e3c086]/20 p-4 rounded-xl border border-[#e3c086] mb-6">
                    {isFirstRun ? (
                        // 首次运行显示的文案
                        <>
                            <p className="text-sm font-bold text-[#8c6b38] leading-relaxed text-left">
                                <AlertCircle size={16} className="inline mr-1 mb-1"/>
                                系统正在配置神经网络模型。
                            </p>
                            <p className="text-xs font-bold text-[#5c4033]/80 mt-2 text-left">
                                首次运行可能需要 <span className="text-red-600 font-black">1-3 分钟</span> 进行硬件调优，请务必耐心等待，不要关闭程序。
                            </p>
                        </>
                    ) : (
                        // 后续运行显示的文案
                        <p className="text-sm font-bold text-[#8c6b38] leading-relaxed">
                             <Zap size={16} className="inline mr-1 mb-1"/>
                             正在加载模型权重，通常需要 5-10 秒。
                        </p>
                    )}
                </div>

                <button
                    onClick={() => {
                        setIsInitializing(false);
                        localStorage.setItem('has_run_ai_before', 'true');
                    }}
                    className="btn-retro btn-brown w-full py-3 rounded-xl font-bold text-sm opacity-80 hover:opacity-100"
                >
                    {isFirstRun ? "我知道了 (后台继续加载)" : "进入游戏"}
                </button>
            </div>
        </div>
      )}

      {/* LOGIN MODAL */}
      {showLoginModal && (
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm z-[70] flex items-center justify-center p-4 animate-in fade-in">
              <div className="bg-[#fcf6ea] rounded-3xl p-6 w-full max-w-sm shadow-2xl border-[6px] border-[#5c4033] relative">
                  <button onClick={() => setShowLoginModal(false)} className="absolute top-4 right-4 text-[#8c6b38]"><X size={20}/></button>
                  <h2 className="text-2xl font-black text-[#5c4033] mb-6 text-center">
                      {loginMode === 'signin' ? '登录账号' : '注册新账号'}
                  </h2>
                  
                  <div className="space-y-4">
                      <input 
                          type="email" placeholder="邮箱" 
                          value={authEmail} onChange={e => setAuthEmail(e.target.value)}
                          className="w-full p-3 bg-white border-2 border-[#e3c086] rounded-xl font-bold text-[#5c4033] outline-none focus:border-[#5c4033]"
                      />
                      <input 
                          type="password" placeholder="密码" 
                          value={authPassword} onChange={e => setAuthPassword(e.target.value)}
                          className="w-full p-3 bg-white border-2 border-[#e3c086] rounded-xl font-bold text-[#5c4033] outline-none focus:border-[#5c4033]"
                      />
                      
                      {loginMode === 'signup' && (
                           <input 
                              type="text" placeholder="昵称 (例如: 弈星)" 
                              value={authNickname} onChange={e => setAuthNickname(e.target.value)}
                              className="w-full p-3 bg-white border-2 border-[#e3c086] rounded-xl font-bold text-[#5c4033] outline-none focus:border-[#5c4033]"
                          />
                      )}

                      <button onClick={handleAuth} className="btn-retro btn-brown w-full py-3 rounded-xl font-bold">
                          {loginMode === 'signin' ? '登录' : '注册并登录'}
                      </button>
                      
                      <div className="flex justify-center gap-2 text-xs font-bold text-[#8c6b38] mt-4">
                          <span>{loginMode === 'signin' ? '还没有账号?' : '已有账号?'}</span>
                          <button 
                              onClick={() => setLoginMode(loginMode === 'signin' ? 'signup' : 'signin')}
                              className="text-[#5c4033] underline"
                          >
                              {loginMode === 'signin' ? '去注册' : '去登录'}
                          </button>
                      </div>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};

export default App;