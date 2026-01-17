import React, { useState, useEffect, useCallback, useRef } from 'react';
import { GameBoard } from './components/GameBoard';
import { BoardState, Player, GameMode, GameType, BoardSize, Difficulty } from './types';
import { createBoard, attemptMove, getAIMove, checkGomokuWin, calculateScore, calculateWinRate } from './utils/goLogic';
import { RotateCcw, Users, Cpu, Trophy, Settings, SkipForward, Play, Frown, Globe, Copy, Check, Wind, Volume2, VolumeX, BarChart3, Skull, Undo2, AlertCircle, X } from 'lucide-react';

// --- Configuration ---
const WORKER_URL = 'yesterhaze.codes';

// Types for P2P Messages
type PeerMessage = 
  | { type: 'MOVE'; x: number; y: number }
  | { type: 'PASS' }
  | { type: 'SYNC'; boardSize: BoardSize; gameType: GameType; startColor: Player }
  | { type: 'RESTART' };

// Undo History Item
interface HistoryItem {
    board: BoardState;
    currentPlayer: Player;
    blackCaptures: number;
    whiteCaptures: number;
    lastMove: { x: number, y: number } | null;
    consecutivePasses: number;
}

const App: React.FC = () => {
  // Settings
  const [boardSize, setBoardSize] = useState<BoardSize>(9);
  const [gameType, setGameType] = useState<GameType>('Go');
  const [gameMode, setGameMode] = useState<GameMode>('PvP'); // PvP, PvAI, Online
  const [difficulty, setDifficulty] = useState<Difficulty>('Medium');
  const [showQi, setShowQi] = useState<boolean>(false);
  const [showWinRate, setShowWinRate] = useState<boolean>(true); // Win rate toggle
  const [musicVolume, setMusicVolume] = useState<number>(0.3); // 0.0 to 1.0

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
  const [passNotificationDismissed, setPassNotificationDismissed] = useState(false); // New state to dismiss notification
  const [finalScore, setFinalScore] = useState<{black: number, white: number} | null>(null);
  
  // Undo Stack
  const [history, setHistory] = useState<HistoryItem[]>([]);
  
  // UI State
  const [showMenu, setShowMenu] = useState(false);
  const [showPassModal, setShowPassModal] = useState(false); // Only used for manual user pass confirmation if needed
  const [isThinking, setIsThinking] = useState(false); // Block undo during AI turn

  // Online State
  const [showOnlineMenu, setShowOnlineMenu] = useState(false);
  const [peerId, setPeerId] = useState<string>('');
  const [remotePeerId, setRemotePeerId] = useState<string>('');
  const [onlineStatus, setOnlineStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
  const [myColor, setMyColor] = useState<Player | null>(null);
  const [copied, setCopied] = useState(false);

  // WebRTC Refs
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const pollingRef = useRef<number | null>(null);
  
  // Audio Refs
  const bgmRef = useRef<HTMLAudioElement | null>(null);
  const sfxMove = useRef<HTMLAudioElement | null>(null);
  const sfxCapture = useRef<HTMLAudioElement | null>(null);
  const sfxError = useRef<HTMLAudioElement | null>(null);
  const sfxWin = useRef<HTMLAudioElement | null>(null);
  const sfxLose = useRef<HTMLAudioElement | null>(null);

  const [hasInteracted, setHasInteracted] = useState(false);

  // Refs for State (Fix for Stale Closures & Logic Synchronization)
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

  // Handle Audio Initialization
  useEffect(() => {
     sfxMove.current = new Audio('/move.mp3');
     sfxCapture.current = new Audio('/capture.mp3');
     sfxError.current = new Audio('/error.mp3');
     sfxWin.current = new Audio('/win.mp3');
     sfxLose.current = new Audio('/lose.mp3');
  }, []);

  const playSfx = (type: 'move' | 'capture' | 'error' | 'win' | 'lose') => {
      if (musicVolume === 0) return; // Mute SFX if volume is 0 (simple logic)
      
      const play = (ref: React.MutableRefObject<HTMLAudioElement | null>) => {
          if (ref.current) {
              ref.current.currentTime = 0;
              ref.current.volume = Math.min(1, musicVolume + 0.2); // SFX slightly louder
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

  // Handle BGM Playback Logic
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
    resetGame();
  }, [boardSize, gameType]);

  // --- Helper: Board Stringify for Ko ---
  const getBoardHash = (b: BoardState) => {
      let str = '';
      for(let r=0; r<b.length; r++) for(let c=0; c<b.length; c++) str += b[r][c] ? (b[r][c]?.color==='black'?'B':'W') : '.';
      return str;
  };

  // --- Online Logic (WebRTC + Cloudflare Workers) ---
  
  // Cleanup on unmount or disconnect
  useEffect(() => {
      return () => {
          if (pollingRef.current) clearInterval(pollingRef.current);
          if (pcRef.current) pcRef.current.close();
      };
  }, []);

  // Auto-create room when menu opens if not connected
  useEffect(() => {
      if (showOnlineMenu && !peerId && onlineStatus === 'disconnected') {
          createRoom();
      }
  }, [showOnlineMenu, peerId, onlineStatus]);

  const setupDataChannel = (dc: RTCDataChannel) => {
    dataChannelRef.current = dc;
    
    dc.onopen = () => {
        setOnlineStatus('connected');
        setShowOnlineMenu(false);
        setShowMenu(false);
        setGameMode('PvP');
        
        // Host logic: Sync game state when channel opens
        if (myColorRef.current === 'black') {
             sendData({ 
                type: 'SYNC', 
                boardSize: boardSize, // Use current state value
                gameType: gameTypeRef.current, 
                startColor: 'white' 
            });
        }
    };

    dc.onmessage = (e) => {
        const msg = JSON.parse(e.data) as PeerMessage;
        if (msg.type === 'MOVE') {
            executeMove(msg.x, msg.y, true);
        } else if (msg.type === 'PASS') {
            handlePass(true);
        } else if (msg.type === 'SYNC') {
            setBoardSize(msg.boardSize);
            setGameType(msg.gameType);
            setMyColor(msg.startColor);
            resetGame(true);
        } else if (msg.type === 'RESTART') {
            resetGame(true);
        }
    };
    
    dc.onclose = () => {
        setOnlineStatus('disconnected');
        alert("对方已断开连接");
        setMyColor(null);
        if (pollingRef.current) clearInterval(pollingRef.current);
    };
  };

  const sendData = (msg: PeerMessage) => {
    if (dataChannelRef.current?.readyState === 'open') {
        dataChannelRef.current.send(JSON.stringify(msg));
    }
  };

  const createRoom = async () => {
    // Prevent duplicate init
    if (pcRef.current && pcRef.current.signalingState !== 'closed') return;

    const id = Math.floor(100000 + Math.random() * 900000).toString();
    setPeerId(id);

    const pc = new RTCPeerConnection({
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            // --- 关键：添加免费的 TURN 服务器中转 ---
            {
                urls: 'turn:openrelay.metered.ca:443',
                username: 'openrelayproject',
                password: 'openrelayproject'
            },
            {
                urls: 'turn:openrelay.metered.ca:80',
                username: 'openrelayproject',
                password: 'openrelayproject'
            }
        ]
    });
    pcRef.current = pc;

    const dc = pc.createDataChannel("game-channel");
    setupDataChannel(dc);

    // --- Critical: Wait for ICE gathering to complete ---
    pc.onicecandidate = async (event) => {
        if (event.candidate === null) {
            try {
                // Only send offer when we have all candidates (Wait for null)
                await fetch(`${WORKER_URL}/create-room`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ roomId: id, sdp: pc.localDescription })
                });
                startPolling(id);
            } catch (e) {
                console.error("Failed to upload Host SDP", e);
            }
        }
    };

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
  };

  const startPolling = (id: string) => {
    if (pollingRef.current) clearInterval(pollingRef.current);
    pollingRef.current = window.setInterval(async () => {
        try {
            const res = await fetch(`${WORKER_URL}/check-status?roomId=${id}`);
            const data = await res.json();
            if (data && data.status === 'connected' && data.guestSdp) {
                if (pollingRef.current) clearInterval(pollingRef.current);
                await pcRef.current?.setRemoteDescription(new RTCSessionDescription(data.guestSdp));
                
                // Host logic: Set self as black, prepare for connection open
                setOnlineStatus('connected');
                setMyColor('black');
            }
        } catch (e) {
            console.error("Polling Error", e);
        }
    }, 3000);
  };

  const joinRoom = async () => {
    if (!remotePeerId) return;
    setOnlineStatus('connecting');

    const pc = new RTCPeerConnection({
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            // --- 同样添加 TURN 服务器 ---
            {
                urls: 'turn:openrelay.metered.ca:443',
                username: 'openrelayproject',
                password: 'openrelayproject'
            },
            {
                urls: 'turn:openrelay.metered.ca:80',
                username: 'openrelayproject',
                password: 'openrelayproject'
            }
        ]
    });
    pcRef.current = pc;

    pc.ondatachannel = (event) => setupDataChannel(event.channel);

    // --- Critical: Wait for ICE gathering to complete ---
    pc.onicecandidate = async (event) => {
        if (event.candidate === null) {
             try {
                // Send answer only when ICE is complete
                await fetch(`${WORKER_URL}/join-room`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ roomId: remotePeerId, guestSdp: pc.localDescription })
                });
                setMyColor('white'); // Guest is white
             } catch (e) {
                 console.error("Failed to upload Guest SDP", e);
             }
        }
    };

    try {
        const res = await fetch(`${WORKER_URL}/join-room`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ roomId: remotePeerId })
        });
        
        if (!res.ok) {
            alert("房间不存在或已过期");
            setOnlineStatus('disconnected');
            return;
        }

        const { hostSdp } = await res.json();
        await pc.setRemoteDescription(new RTCSessionDescription(hostSdp));
        
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer); // This triggers ICE gathering
    } catch (e) {
        console.error("Join Error", e);
        setOnlineStatus('disconnected');
        alert("加入失败，请检查网络或房间号");
    }
  };

  const copyId = () => {
      navigator.clipboard.writeText(peerId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
  };
  
  // --- Game Logic ---

  // Undo Function
  const handleUndo = () => {
      if (history.length === 0 || isThinking || gameOver || onlineStatus === 'connected') return;

      // In PvAI, undo 2 steps if it's player's turn (to undo AI's move + Player's move)
      let stepsToUndo = 1;
      if (gameMode === 'PvAI' && currentPlayer === 'black' && history.length >= 2) {
          stepsToUndo = 2;
      }

      const prev = history[history.length - stepsToUndo];
      setBoard(prev.board);
      setCurrentPlayer(prev.currentPlayer);
      setBlackCaptures(prev.blackCaptures);
      setWhiteCaptures(prev.whiteCaptures);
      setLastMove(prev.lastMove);
      setConsecutivePasses(prev.consecutivePasses);
      setPassNotificationDismissed(false); // Reset notification on undo
      
      setHistory(prevHistory => prevHistory.slice(0, prevHistory.length - stepsToUndo));
  };

  const saveHistory = () => {
      setHistory(prev => [...prev, {
          board: boardRef.current,
          currentPlayer: currentPlayerRef.current,
          blackCaptures,
          whiteCaptures,
          lastMove,
          consecutivePasses
      }]);
  };

  // Unified Move Execution Logic (Local & Remote)
  const executeMove = useCallback((x: number, y: number, isRemote: boolean) => {
      const currentBoard = boardRef.current;
      const activePlayer = currentPlayerRef.current;
      const currentType = gameTypeRef.current;

      // Ko Check
      let prevHash = null;
      if (history.length > 0) {
         prevHash = getBoardHash(history[history.length - 1].board);
      }

      const result = attemptMove(currentBoard, x, y, activePlayer, currentType, prevHash);
      
      if (result) {
          // Play SFX
          if (result.captured > 0) playSfx('capture');
          else playSfx('move');

          // Save History (Local only)
          if (!isRemote) {
             setHistory(prev => [...prev, {
                 board: currentBoard,
                 currentPlayer: activePlayer,
                 blackCaptures,
                 whiteCaptures,
                 lastMove,
                 consecutivePasses
             }]);
          }

          // Update Board
          setBoard(result.newBoard);
          setLastMove({ x, y });
          setConsecutivePasses(0); // Reset consecutive passes on any move
          setPassNotificationDismissed(false); // Reset notification state on move

          // Update Score
          if (result.captured > 0) {
              if (activePlayer === 'black') {
                  setBlackCaptures(prev => prev + result.captured);
              } else {
                  setWhiteCaptures(prev => prev + result.captured);
              }
          }

          // Check Win (Gomoku)
          if (currentType === 'Gomoku' && checkGomokuWin(result.newBoard, {x, y})) {
              setTimeout(() => endGame(activePlayer, '五子连珠！'), 0);
              return;
          }

          // Switch Player
          setCurrentPlayer(prev => prev === 'black' ? 'white' : 'black');
      } else {
          // Move was invalid
          if (!isRemote) playSfx('error');
      }
  }, [blackCaptures, whiteCaptures, lastMove, consecutivePasses, history]); 

  const handleIntersectionClick = useCallback((x: number, y: number) => {
    // If game is over or AI is thinking, block interaction
    if (gameOver || isThinking) return;
    
    // NOTE: We do NOT block if 'consecutivePasses > 0'. 
    // Player is allowed to play to break the pass sequence.

    if (gameMode === 'PvAI' && currentPlayer === 'white') return;
    
    // Online Check
    if (onlineStatus === 'connected') {
        if (currentPlayer !== myColor) return; 
        sendData({ type: 'MOVE', x, y });
    }

    // Execute Move locally
    executeMove(x, y, false);

  }, [gameOver, gameMode, currentPlayer, onlineStatus, myColor, executeMove, isThinking]);

  const handlePass = useCallback((isRemote: boolean = false) => {
    if (gameOver) return;
    
    // Save history before pass
    if (!isRemote) {
        setHistory(prev => [...prev, {
            board: boardRef.current,
            currentPlayer: currentPlayerRef.current,
            blackCaptures,
            whiteCaptures,
            lastMove,
            consecutivePasses
        }]);
    }

    // Online sync
    if (onlineStatusRef.current === 'connected' && !isRemote) {
        if (currentPlayerRef.current !== myColorRef.current) return;
        sendData({ type: 'PASS' });
    }

    const activePlayer = currentPlayerRef.current;
    
    setConsecutivePasses(prev => {
        const newPasses = prev + 1;
        // Check for game end condition inside setter to ensure we have latest count
        if (newPasses >= 2) {
             // Game Over due to 2 passes
             setTimeout(() => {
                const score = calculateScore(boardRef.current);
                setFinalScore(score);
                setShowPassModal(false);
                if (score.black > score.white) {
                    endGame('black', `比分: 黑 ${score.black} - 白 ${score.white}`);
                } else {
                    endGame('white', `比分: 白 ${score.white} - 黑 ${score.black}`);
                }
             }, 0);
        }
        return newPasses;
    });
    
    // Reset notification state whenever a pass occurs (so it shows up again if it was dismissed before)
    setPassNotificationDismissed(false); 

    if (consecutivePasses < 1) {
         setCurrentPlayer(prev => prev === 'black' ? 'white' : 'black');
         setLastMove(null);
    }

  }, [gameOver, gameMode, consecutivePasses, blackCaptures, whiteCaptures, lastMove]); 

  const endGame = (winner: Player, reason: string) => {
    setGameOver(true);
    setWinner(winner);
    setWinReason(reason);
    
    // Play sound based on result
    if (gameMode === 'PvAI') {
        if (winner === 'black') playSfx('win');
        else playSfx('lose');
    } else if (onlineStatus === 'connected') {
        if (winner === myColor) playSfx('win');
        else playSfx('lose');
    } else {
        // PvP always happy sound
        playSfx('win'); 
    }
  };

  // AI Turn Handling
  useEffect(() => {
    if (gameMode === 'PvAI' && currentPlayer === 'white' && !gameOver && !showPassModal) {
      setIsThinking(true);
      const timer = setTimeout(() => {
        // AI Logic
        let prevHash = null;
        if (history.length > 0) prevHash = getBoardHash(history[history.length-1].board);

        const move = getAIMove(board, 'white', gameType, difficulty, prevHash);
        
        if (move) {
           executeMove(move.x, move.y, false);
        } else {
           // AI passes
           handlePass();
        }
        setIsThinking(false);
      }, 700);
      return () => clearTimeout(timer);
    }
  }, [currentPlayer, gameMode, board, gameOver, gameType, difficulty, showPassModal, handlePass, executeMove, history]);

  const resetGame = (keepOnline: boolean = false) => {
    setBoard(createBoard(boardSize));
    setCurrentPlayer('black');
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
    
    if (onlineStatusRef.current === 'connected' && !keepOnline) {
        sendData({ type: 'RESTART' });
    }
    
    // If fully resetting (disconnecting), clear online state
    if (!keepOnline) {
        setOnlineStatus('disconnected');
        setMyColor(null);
        if (pollingRef.current) clearInterval(pollingRef.current);
        if (pcRef.current) {
            pcRef.current.close();
            pcRef.current = null;
        }
    }
  };

  const isPvAILoss = gameMode === 'PvAI' && winner === 'white';
  const isOnlineLoss = onlineStatus === 'connected' && winner !== myColor;

  // Calculate Win Rate for UI
  const winRate = showWinRate && !gameOver ? calculateWinRate(board) : 50;

  return (
    <div className="h-full w-full bg-[#f7e7ce] flex flex-col md:flex-row items-center relative select-none overflow-hidden">
      
      {/* Background Audio */}
      <audio 
        ref={bgmRef} 
        loop 
        src="/bgm.mp3" 
      />

      {/* --- TABLET/DESKTOP LAYOUT: Left Side Board --- */}
      <div className="relative flex-grow h-[60%] md:h-full w-full flex items-center justify-center p-2 order-2 md:order-1 min-h-0">
          <div className="w-full h-full max-w-full max-h-full aspect-square flex items-center justify-center">
             <div className="transform transition-transform w-full h-full">
                <GameBoard 
                    board={board} 
                    onIntersectionClick={handleIntersectionClick}
                    currentPlayer={currentPlayer}
                    lastMove={lastMove}
                    showQi={showQi}
                    gameType={gameType}
                />
             </div>
          </div>
          
          {/* AI Thinking Indicator */}
          {isThinking && (
              <div className="absolute top-4 left-4 bg-white/80 px-3 py-1 rounded-full text-xs font-bold text-gray-500 animate-pulse border border-gray-200 shadow-sm z-20">
                  AI 思考中...
              </div>
          )}

           {/* Stylized Pass Indicator Overlay - Dismissible */}
          {consecutivePasses === 1 && !gameOver && !passNotificationDismissed && (
              <>
                {/* Backdrop to dismiss */}
                <div 
                    className="absolute inset-0 z-20 cursor-pointer" 
                    onClick={() => setPassNotificationDismissed(true)}
                ></div>
                
                {/* Modal */}
                <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-[#fff8e1] border-4 border-[#cba367] text-[#5c4033] px-6 py-6 rounded-3xl shadow-2xl z-30 flex flex-col items-center animate-in zoom-in duration-300 w-64 pointer-events-auto">
                    <div className="flex items-center gap-2 mb-4">
                        <AlertCircle size={28} className="text-[#cba367]" />
                        <span className="text-xl font-black">对手停着</span>
                    </div>
                    <p className="text-xs font-bold text-gray-500 text-center mb-6 leading-relaxed">
                        对手认为无需再落子。<br/>
                        点击空白处可继续落子。
                    </p>
                    
                    <div className="flex flex-col gap-3 w-full">
                        <button 
                            onClick={() => setPassNotificationDismissed(true)}
                            className="w-full bg-green-500 hover:bg-green-600 text-white py-3 rounded-xl font-bold shadow-sm active:scale-95 transition-all flex items-center justify-center gap-2"
                        >
                            <Play size={16} fill="currentColor" /> 继续落子
                        </button>
                        <button 
                            onClick={() => handlePass(false)}
                            className="w-full bg-[#cba367] hover:bg-[#b89258] text-white py-3 rounded-xl font-bold shadow-sm active:scale-95 transition-all flex items-center justify-center gap-2"
                        >
                            <SkipForward size={16} fill="currentColor" /> 我也停着 (结算)
                        </button>
                    </div>
                </div>
              </>
          )}
      </div>

      {/* --- TABLET/DESKTOP LAYOUT: Right Side Sidebar --- */}
      <div className="w-full md:w-80 lg:w-96 flex flex-col gap-4 p-4 z-20 shrink-0 bg-[#f7e7ce] md:bg-[#f0dfc5] md:h-full md:border-l md:border-[#e3c086] order-1 md:order-2 shadow-xl md:shadow-none">
        
        {/* Header Section */}
        <div className="flex justify-between items-center">
            <div className="flex flex-col">
                <span className="font-bold text-gray-700 text-lg leading-tight flex items-center gap-2">
                {gameType === 'Go' ? '围棋' : '五子棋'}
                <span className="text-xs font-normal text-gray-500 bg-white/50 px-2 py-0.5 rounded-full border border-gray-200">
                    {boardSize}路 • {difficulty === 'Hell' ? '地狱' : (onlineStatus === 'connected' ? '在线' : (gameMode === 'PvAI' ? '人机' : '本地'))}
                </span>
                {onlineStatus === 'connected' && (
                        <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                        </span>
                )}
                </span>
            </div>
            
            <button 
            onClick={() => setShowMenu(true)}
            className="bg-[#cba367] hover:bg-[#b89258] text-white p-2 rounded-xl shadow-sm font-bold transition-all active:scale-95"
            >
            <Settings size={20} />
            </button>
        </div>

        {/* Score Card */}
        <div className="flex flex-col gap-2">
            <div className="grid grid-cols-2 gap-2">
                {/* Black */}
                <div className={`flex items-center gap-2 px-3 py-3 rounded-xl border-2 transition-all duration-300 ${currentPlayer === 'black' ? 'bg-black/10 border-black/20 shadow-sm scale-105' : 'border-transparent opacity-60'} ${onlineStatus === 'connected' && myColor === 'black' ? 'ring-2 ring-blue-400' : ''}`}>
                    <div className="w-8 h-8 rounded-full bg-[#2a2a2a] shadow-inner border-2 border-[#444] shrink-0 relative">
                        {currentPlayer === 'black' && isThinking && <div className="absolute -top-1 -right-1 w-3 h-3 bg-yellow-400 rounded-full animate-ping"></div>}
                    </div>
                    <div className="flex flex-col">
                        <span className="font-bold text-gray-800 text-sm">黑子 {onlineStatus === 'connected' && myColor === 'black' && '(我)'}</span>
                        {gameType === 'Go' && <span className="text-xs text-gray-700 font-bold">提子: {blackCaptures}</span>}
                    </div>
                </div>

                {/* White */}
                <div className={`flex items-center justify-end gap-2 px-3 py-3 rounded-xl border-2 transition-all duration-300 ${currentPlayer === 'white' ? 'bg-white/60 border-white/50 shadow-sm scale-105' : 'border-transparent opacity-60'} ${onlineStatus === 'connected' && myColor === 'white' ? 'ring-2 ring-blue-400' : ''}`}>
                    <div className="flex flex-col items-end">
                        <span className="font-bold text-gray-800 text-sm">白子 {onlineStatus === 'connected' && myColor === 'white' && '(我)'}</span>
                        {gameType === 'Go' && <span className="text-xs text-gray-700 font-bold">提子: {whiteCaptures}</span>}
                    </div>
                    <div className="w-8 h-8 rounded-full bg-[#f0f0f0] shadow-inner border-2 border-white shrink-0 relative">
                        {currentPlayer === 'white' && isThinking && <div className="absolute -top-1 -right-1 w-3 h-3 bg-yellow-400 rounded-full animate-ping"></div>}
                    </div>
                </div>
            </div>

            {/* Win Rate Bar */}
            {showWinRate && gameType === 'Go' && (
                <div className="w-full h-2 bg-white/50 rounded-full overflow-hidden flex shadow-inner mt-1">
                    <div 
                        className="h-full bg-gray-800 transition-all duration-1000 ease-in-out" 
                        style={{ width: `${winRate}%` }}
                    />
                    <div 
                        className="h-full bg-white transition-all duration-1000 ease-in-out" 
                        style={{ width: `${100 - winRate}%` }}
                    />
                </div>
            )}
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-3 gap-2 mt-auto">
            <button 
            onClick={handleUndo}
            disabled={history.length === 0 || isThinking || gameOver || onlineStatus === 'connected'}
            className="flex flex-col items-center justify-center gap-1 bg-[#e0d0b0] text-[#8c6b38] p-3 rounded-xl shadow-sm font-bold hover:bg-[#d6c29c] active:scale-95 transition-all border-b-4 border-[#c4ae88] disabled:opacity-50 disabled:active:scale-100 disabled:border-transparent"
            >
            <Undo2 size={20} /> <span className="text-xs">悔棋</span>
            </button>

            <button 
            onClick={() => handlePass(false)}
            disabled={gameOver || (onlineStatus === 'connected' && currentPlayer !== myColor)}
            className={`flex flex-col items-center justify-center gap-1 text-white p-3 rounded-xl shadow-sm font-bold active:scale-95 transition-all border-b-4 disabled:opacity-50 disabled:active:scale-100 ${consecutivePasses === 1 ? 'bg-red-500 hover:bg-red-600 border-red-700 animate-pulse' : 'bg-[#8c6b38] hover:bg-[#7a5c30] border-[#5c4033]'}`}
            >
            <SkipForward size={20} /> <span className="text-xs">{consecutivePasses === 1 ? '结束结算' : '停着'}</span>
            </button>
            
            <button 
            onClick={() => resetGame(false)}
            className="flex flex-col items-center justify-center gap-1 bg-white text-gray-700 p-3 rounded-xl shadow-sm font-bold hover:bg-gray-50 active:scale-95 transition-all border-b-4 border-gray-200"
            >
            <RotateCcw size={20} /> <span className="text-xs">重开</span>
            </button>
        </div>
        
        {/* Tablet specific spacer */}
        <div className="hidden md:block flex-grow"></div>
      </div>

      {/* Settings Modal (Unchanged content, kept for context) */}
      {showMenu && (
        <div className="absolute inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl border-4 border-[#e3c086] flex flex-col gap-4 max-h-[90vh] overflow-y-auto custom-scrollbar">
            <div className="flex justify-between items-center border-b pb-2">
                <h2 className="text-2xl font-black text-[#5c4033] tracking-wide">游戏设置</h2>
                <button onClick={() => setShowMenu(false)} className="text-gray-400 hover:text-gray-600 font-bold">关闭</button>
            </div>
            
            <div className="space-y-1">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">模式</label>
                <div className="grid grid-cols-2 gap-2">
                    {(['Go', 'Gomoku'] as GameType[]).map(t => (
                        <button key={t} onClick={() => { setGameType(t); if(onlineStatus === 'connected') sendData({type: 'RESTART'}); }} className={`py-2 rounded-xl font-bold text-sm border-2 ${gameType === t ? 'border-[#cba367] bg-orange-50 text-[#8c6b38]' : 'border-transparent bg-gray-100 text-gray-400'}`}>
                           {t === 'Go' ? '围棋' : '五子棋'}
                        </button>
                    ))}
                </div>
            </div>

            <div className="space-y-1">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">玩家</label>
                <div className="grid grid-cols-2 gap-2">
                     <button onClick={() => { setGameMode('PvP'); resetGame(false); }} className={`py-2 rounded-xl font-bold text-sm border-2 ${gameMode === 'PvP' && onlineStatus !== 'connected' ? 'border-[#cba367] bg-orange-50 text-[#8c6b38]' : 'border-transparent bg-gray-100 text-gray-400'}`}>
                        本地双人
                    </button>
                    <button onClick={() => { setGameMode('PvAI'); resetGame(false); }} className={`py-2 rounded-xl font-bold text-sm border-2 ${gameMode === 'PvAI' ? 'border-[#cba367] bg-orange-50 text-[#8c6b38]' : 'border-transparent bg-gray-100 text-gray-400'}`}>
                        人机对战
                    </button>
                </div>
                <button onClick={() => { setShowOnlineMenu(true); setShowMenu(false); }} className={`mt-2 w-full py-2 rounded-xl font-bold text-sm border-2 flex items-center justify-center gap-2 ${onlineStatus === 'connected' ? 'border-green-500 bg-green-50 text-green-700' : 'border-[#cba367] bg-white text-[#8c6b38]'}`}>
                    <Globe size={16}/> {onlineStatus === 'connected' ? '在线联机中 (点击配置)' : '在线联机 (邀请好友)'}
                </button>
            </div>

            {gameMode === 'PvAI' && (
                <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">人机难度</label>
                    <div className="grid grid-cols-4 gap-2">
                        {(['Easy', 'Medium', 'Hard', 'Hell'] as Difficulty[]).map(d => (
                            <button key={d} onClick={() => setDifficulty(d)} className={`py-2 rounded-xl font-bold text-[10px] sm:text-xs border-2 ${difficulty === d ? (d === 'Hell' ? 'border-red-500 bg-red-50 text-red-600' : 'border-[#cba367] bg-orange-50 text-[#8c6b38]') : 'border-transparent bg-gray-100 text-gray-400'}`}>
                                {d === 'Easy' ? '简单' : d === 'Medium' ? '中等' : d === 'Hard' ? '困难' : <span className="flex items-center justify-center gap-1"><Skull size={10}/> 地狱</span>}
                            </button>
                        ))}
                    </div>
                    {difficulty === 'Hell' && <p className="text-[10px] text-red-400 text-center">地狱模式：AI更有攻击性 (模拟外部引擎)</p>}
                </div>
            )}

            <div className="space-y-1">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">音乐音量</label>
                <div className="flex items-center gap-3 bg-gray-100 p-2 rounded-xl border-2 border-transparent hover:border-[#e3c086]/30 transition-colors">
                    <button onClick={() => setMusicVolume(0)} className="text-gray-400 hover:text-gray-600">
                        {musicVolume === 0 ? <VolumeX size={18}/> : <Volume2 size={18}/>}
                    </button>
                    <input 
                        type="range" 
                        min="0" 
                        max="1" 
                        step="0.01" 
                        value={musicVolume} 
                        onChange={(e) => setMusicVolume(parseFloat(e.target.value))}
                        className="cute-range"
                        style={{
                           background: `linear-gradient(to right, #8c6b38 0%, #8c6b38 ${musicVolume * 100}%, #e5e7eb ${musicVolume * 100}%, #e5e7eb 100%)`
                        }}
                    />
                </div>
            </div>

            <div className="space-y-1">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">辅助功能</label>
                <button 
                    onClick={() => setShowWinRate(!showWinRate)}
                    className={`w-full py-2 mb-2 rounded-xl font-bold text-sm border-2 flex items-center justify-center gap-2 ${showWinRate ? 'border-blue-300 bg-blue-50 text-blue-600' : 'border-transparent bg-gray-100 text-gray-400'}`}
                >
                    <BarChart3 size={16} /> {showWinRate ? '胜率条：开' : '胜率条：关'}
                </button>
                <button 
                    onClick={() => setShowQi(!showQi)}
                    className={`w-full py-2 rounded-xl font-bold text-sm border-2 flex items-center justify-center gap-2 ${showQi ? 'border-purple-300 bg-purple-50 text-purple-600' : 'border-transparent bg-gray-100 text-gray-400'}`}
                >
                    <Wind size={16} /> {showQi ? '气场特效：开' : '气场特效：关'}
                </button>
            </div>

            <div className="space-y-1">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">棋盘大小</label>
                <div className="grid grid-cols-3 gap-2">
                    {[9, 13, 19].map((size) => (
                        <button key={size} onClick={() => { setBoardSize(size as BoardSize); if(onlineStatus==='connected') sendData({type: 'RESTART'}); }} className={`py-2 rounded-xl font-bold text-sm border-2 ${boardSize === size ? 'border-[#cba367] bg-orange-50 text-[#8c6b38]' : 'border-transparent bg-gray-100 text-gray-400'}`}>
                            {size}路
                        </button>
                    ))}
                </div>
            </div>

            <button 
                onClick={() => resetGame(false)}
                className="mt-2 w-full py-3 rounded-xl bg-[#cba367] text-white font-bold text-lg shadow-lg active:scale-95 transition-transform flex items-center justify-center gap-2"
            >
                <RotateCcw size={20} /> 重新开始
            </button>
          </div>
        </div>
      )}

      {/* Online Setup Modal */}
      {showOnlineMenu && (
        <div className="absolute inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
           <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl border-4 border-[#e3c086] flex flex-col gap-4">
             <div className="flex justify-between items-center border-b pb-2">
                <h2 className="text-xl font-black text-[#5c4033] tracking-wide">在线联机 (P2P)</h2>
                <button onClick={() => setShowOnlineMenu(false)} className="text-gray-400 hover:text-gray-600 font-bold">关闭</button>
             </div>

             <div className="bg-orange-50 p-4 rounded-xl border border-orange-200 text-center">
                 <p className="text-xs text-gray-500 mb-2 uppercase font-bold">你的邀请码</p>
                 <div className="flex items-center justify-center gap-2 mb-2">
                     <span className="text-2xl font-black text-gray-800 tracking-wider font-mono">{peerId || '...'}</span>
                     <button onClick={copyId} className="p-2 hover:bg-black/5 rounded-full transition-colors">
                        {copied ? <Check size={20} className="text-green-500"/> : <Copy size={20} className="text-gray-500"/>}
                     </button>
                 </div>
                 <p className="text-xs text-gray-400">将此码发给好友加入游戏</p>
             </div>

             <div className="relative flex py-2 items-center">
                <div className="flex-grow border-t border-gray-200"></div>
                <span className="flex-shrink-0 mx-4 text-gray-400 text-xs">或者</span>
                <div className="flex-grow border-t border-gray-200"></div>
            </div>

             <div className="space-y-2">
                 <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">加入房间</label>
                 <div className="flex gap-2">
                     <input 
                       value={remotePeerId}
                       onChange={(e) => setRemotePeerId(e.target.value)}
                       placeholder="输入好友的邀请码 (6位数字)"
                       className="flex-1 bg-gray-100 border-2 border-transparent focus:border-[#cba367] rounded-xl px-4 py-2 font-mono outline-none transition-colors"
                     />
                     <button 
                        onClick={joinRoom}
                        disabled={!remotePeerId || onlineStatus === 'connecting'}
                        className="bg-[#cba367] text-white px-4 py-2 rounded-xl font-bold shadow-md hover:bg-[#b89258] disabled:opacity-50"
                     >
                        {onlineStatus === 'connecting' ? '...' : '加入'}
                     </button>
                 </div>
             </div>
           </div>
        </div>
      )}

      {/* Game Over Modal (Unchanged) */}
      {winner && (
         <div className="absolute inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center animate-in fade-in duration-300">
            <div className="bg-white p-8 rounded-3xl shadow-2xl flex flex-col items-center w-80 transform scale-110 border-4 border-[#e3c086]">
                {/* Custom Icon and Title for Loss vs Win */}
                {isPvAILoss || isOnlineLoss ? (
                     <>
                        <Frown size={64} className="text-gray-400 mb-4 drop-shadow-md" />
                        <h2 className="text-3xl font-black text-gray-600 mb-1">失败</h2>
                        <p className="text-gray-500 font-semibold mb-4 text-center text-sm">下次一定行！</p>
                     </>
                ) : (
                    <>
                        <Trophy size={64} className="text-yellow-400 mb-4 drop-shadow-md" />
                        <h2 className="text-3xl font-black text-gray-800 mb-1">{gameMode === 'PvP' ? `${winner === 'black' ? '黑子' : '白子'} 胜利!` : '胜利!'}</h2>
                        <p className="text-gray-500 font-semibold mb-4 text-center text-sm">{winReason}</p>
                    </>
                )}
                
                {gameType === 'Go' && finalScore && (
                    <div className="w-full bg-gray-100 rounded-xl p-3 mb-6 flex justify-around">
                        <div className="text-center">
                            <div className="text-xs text-gray-500 uppercase font-bold">黑子</div>
                            <div className="text-xl font-black text-gray-800">{finalScore.black}</div>
                        </div>
                        <div className="text-center">
                            <div className="text-xs text-gray-500 uppercase font-bold">白子</div>
                            <div className="text-xl font-black text-gray-800">{finalScore.white}</div>
                            <div className="text-[10px] text-gray-400">+7.5 贴目</div>
                        </div>
                    </div>
                )}

                <button 
                    onClick={() => resetGame(false)}
                    className={`w-full text-white px-8 py-3 rounded-xl font-bold shadow-lg transition-all active:scale-95 ${isPvAILoss || isOnlineLoss ? 'bg-gray-500 hover:bg-gray-600' : 'bg-[#cba367] hover:bg-[#b89258]'}`}
                >
                    再来一局
                </button>
            </div>
         </div>
      )}
    </div>
  );
};

export default App;