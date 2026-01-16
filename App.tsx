import React, { useState, useEffect, useCallback, useRef } from 'react';
import { GameBoard } from './components/GameBoard';
import { BoardState, Player, GameMode, GameType, BoardSize, Difficulty } from './types';
import { createBoard, attemptMove, getAIMove, checkGomokuWin, calculateScore, calculateWinRate } from './utils/goLogic';
import { RotateCcw, Users, Cpu, Trophy, Settings, SkipForward, Play, Frown, Globe, Copy, Check, Wind, Volume2, VolumeX, BarChart3, Skull } from 'lucide-react';
import Peer, { DataConnection } from 'peerjs';

// Types for P2P Messages
type PeerMessage = 
  | { type: 'MOVE'; x: number; y: number }
  | { type: 'PASS' }
  | { type: 'SYNC'; boardSize: BoardSize; gameType: GameType; startColor: Player }
  | { type: 'RESTART' };

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
  const [finalScore, setFinalScore] = useState<{black: number, white: number} | null>(null);
  
  // UI State
  const [showMenu, setShowMenu] = useState(false);
  const [showPassModal, setShowPassModal] = useState(false);

  // Online State
  const [showOnlineMenu, setShowOnlineMenu] = useState(false);
  const [peerId, setPeerId] = useState<string>('');
  const [remotePeerId, setRemotePeerId] = useState<string>('');
  const [connection, setConnection] = useState<DataConnection | null>(null);
  const [onlineStatus, setOnlineStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
  const [myColor, setMyColor] = useState<Player | null>(null);
  const [copied, setCopied] = useState(false);
  const peerRef = useRef<Peer | null>(null);
  
  // Audio Ref
  const bgmRef = useRef<HTMLAudioElement | null>(null);
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

  // Handle BGM Playback Logic
  // Browsers block autoplay until interaction. This listener attempts to play audio on first click.
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
        // If we have already interacted (or if this is a user-initiated change), try playing
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

  // --- Online Logic ---
  useEffect(() => {
    if (showOnlineMenu && !peerRef.current) {
        const id = 'puyo-' + Math.floor(Math.random() * 1000000).toString();
        const peer = new Peer(id);
        
        peer.on('open', (id) => {
            setPeerId(id);
        });

        peer.on('connection', (conn) => {
            handleConnection(conn, true);
        });

        peerRef.current = peer;
    }
  }, [showOnlineMenu]);

  const handleConnection = (conn: DataConnection, isHost: boolean) => {
      setConnection(conn);
      setOnlineStatus('connecting');

      conn.on('open', () => {
          setOnlineStatus('connected');
          setShowOnlineMenu(false);
          setShowMenu(false);
          setGameMode('PvP'); 
          
          if (isHost) {
              setMyColor('black');
              conn.send({ 
                  type: 'SYNC', 
                  boardSize, 
                  gameType: gameTypeRef.current, 
                  startColor: 'white' 
              });
              resetGame(true); 
          }
      });

      conn.on('data', (data: any) => {
          const msg = data as PeerMessage;
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
      });

      conn.on('close', () => {
          setOnlineStatus('disconnected');
          setConnection(null);
          alert('对方已断开连接');
      });
  };

  const connectToPeer = () => {
      if (!peerRef.current || !remotePeerId) return;
      const conn = peerRef.current.connect(remotePeerId);
      handleConnection(conn, false);
  };

  const copyId = () => {
      navigator.clipboard.writeText(peerId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
  };
  
  // --- Game Logic ---

  // Unified Move Execution Logic (Local & Remote)
  const executeMove = useCallback((x: number, y: number, isRemote: boolean) => {
      const currentBoard = boardRef.current;
      const activePlayer = currentPlayerRef.current;
      const currentType = gameTypeRef.current;

      const result = attemptMove(currentBoard, x, y, activePlayer, currentType);
      
      if (result) {
          // Update Board
          setBoard(result.newBoard);
          setLastMove({ x, y });
          setConsecutivePasses(0);

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
      }
  }, []);

  const handleIntersectionClick = useCallback((x: number, y: number) => {
    if (gameOver || showPassModal) return;
    if (gameMode === 'PvAI' && currentPlayer === 'white') return;
    
    // Online Check
    if (onlineStatus === 'connected') {
        if (currentPlayer !== myColor) return; // Not my turn
        connection?.send({ type: 'MOVE', x, y });
    }

    // Execute Move locally
    executeMove(x, y, false);

  }, [gameOver, showPassModal, gameMode, currentPlayer, onlineStatus, myColor, connection, executeMove]);

  const handlePass = useCallback((isRemote: boolean = false) => {
    if (gameOver) return;
    
    // Online sync
    if (onlineStatusRef.current === 'connected' && !isRemote) {
        if (currentPlayerRef.current !== myColorRef.current) return;
        connection?.send({ type: 'PASS' });
    }

    const activePlayer = currentPlayerRef.current;
    
    setConsecutivePasses(prev => {
        const newPasses = prev + 1;
        // Check for game end condition inside setter to ensure we have latest count
        if (newPasses >= 2) {
             // Defer the score calculation slightly to let render finish
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

    if (activePlayer === 'white' && gameMode === 'PvAI') {
        setShowPassModal(true);
    } else if (isRemote) {
        setShowPassModal(true);
    }

    if (consecutivePasses < 1) {
         setCurrentPlayer(prev => prev === 'black' ? 'white' : 'black');
         setLastMove(null);
    }

  }, [gameOver, gameMode, connection, consecutivePasses]); 

  const endGame = (winner: Player, reason: string) => {
    setGameOver(true);
    setWinner(winner);
    setWinReason(reason);
  };

  // AI Turn Handling
  useEffect(() => {
    if (gameMode === 'PvAI' && currentPlayer === 'white' && !gameOver && !showPassModal) {
      const timer = setTimeout(() => {
        // NOTE: In a real implementation, you would check difficulty here.
        // If 'Hell' and using an external API, await fetch(...)
        // Since we are using local simulation:
        const move = getAIMove(board, 'white', gameType, difficulty);
        
        if (move) {
           executeMove(move.x, move.y, false);
        } else {
           // AI passes if no useful moves found (avoids endless game)
           handlePass();
        }
      }, 700);
      return () => clearTimeout(timer);
    }
  }, [currentPlayer, gameMode, board, gameOver, gameType, difficulty, showPassModal, handlePass, executeMove]);

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
    setFinalScore(null);
    setShowMenu(false);
    setShowPassModal(false);
    
    if (onlineStatusRef.current === 'connected' && !keepOnline) {
        connection?.send({ type: 'RESTART' });
    }
  };

  const isPvAILoss = gameMode === 'PvAI' && winner === 'white';
  const isOnlineLoss = onlineStatus === 'connected' && winner !== myColor;

  // Calculate Win Rate for UI
  const winRate = showWinRate && !gameOver ? calculateWinRate(board) : 50;

  return (
    <div className="h-full w-full bg-[#f7e7ce] flex flex-col items-center relative select-none overflow-hidden">
      
      {/* Background Audio - Switched to a more robust, cute track */}
      <audio 
        ref={bgmRef} 
        loop 
        src="https://cdn.pixabay.com/download/audio/2022/10/25/audio_2494548483.mp3?filename=playful-cat-123495.mp3" 
      />

      {/* Header */}
      <div className="w-full max-w-md px-4 py-2 flex justify-between items-center z-20 shrink-0">
        <div className="flex flex-col">
            <span className="font-bold text-gray-700 text-lg leading-tight flex items-center gap-2">
               {gameType === 'Go' ? '围棋' : '五子棋'}
               <span className="text-xs font-normal text-gray-500 bg-white/50 px-2 py-0.5 rounded-full border border-gray-200">
                 {boardSize}路 • {difficulty === 'Hell' ? '地狱AI' : (onlineStatus === 'connected' ? '在线' : (gameMode === 'PvAI' ? '人机' : '本地'))}
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

      {/* Score */}
      <div className="w-full max-w-md px-4 mb-1 z-20 flex flex-col gap-1 shrink-0">
        <div className="grid grid-cols-2 gap-2">
            {/* Black */}
            <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border-2 transition-all duration-300 ${currentPlayer === 'black' ? 'bg-black/10 border-black/20 shadow-sm' : 'border-transparent opacity-60'} ${onlineStatus === 'connected' && myColor === 'black' ? 'ring-2 ring-blue-400' : ''}`}>
                <div className="w-6 h-6 rounded-full bg-[#2a2a2a] shadow-inner border-2 border-[#444] shrink-0"></div>
                <div className="flex flex-col">
                    <span className="font-bold text-gray-800 text-sm">黑子 {onlineStatus === 'connected' && myColor === 'black' && '(我)'}</span>
                    {gameType === 'Go' && <span className="text-xs text-gray-700 font-bold">提子: {blackCaptures}</span>}
                </div>
            </div>

            {/* White */}
            <div className={`flex items-center justify-end gap-2 px-3 py-2 rounded-xl border-2 transition-all duration-300 ${currentPlayer === 'white' ? 'bg-white/60 border-white/50 shadow-sm' : 'border-transparent opacity-60'} ${onlineStatus === 'connected' && myColor === 'white' ? 'ring-2 ring-blue-400' : ''}`}>
                <div className="flex flex-col items-end">
                    <span className="font-bold text-gray-800 text-sm">白子 {onlineStatus === 'connected' && myColor === 'white' && '(我)'}</span>
                    {gameType === 'Go' && <span className="text-xs text-gray-700 font-bold">提子: {whiteCaptures}</span>}
                </div>
                <div className="w-6 h-6 rounded-full bg-[#f0f0f0] shadow-inner border-2 border-white shrink-0"></div>
            </div>
        </div>

        {/* Win Rate Bar */}
        {showWinRate && gameType === 'Go' && (
            <div className="w-full h-1.5 bg-white/50 rounded-full overflow-hidden flex shadow-inner">
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

      {/* Board */}
      <div className="relative z-10 flex-grow flex items-center justify-center w-full overflow-hidden min-h-0">
        <div className="transform transition-transform">
            <GameBoard 
            board={board} 
            onIntersectionClick={handleIntersectionClick}
            currentPlayer={currentPlayer}
            lastMove={lastMove}
            showQi={showQi}
            />
        </div>
      </div>

      {/* Controls */}
      <div className="w-full max-w-md px-6 py-4 flex justify-center gap-3 z-20 shrink-0">
         <button 
           onClick={() => handlePass(false)}
           disabled={gameOver || showPassModal || (onlineStatus === 'connected' && currentPlayer !== myColor)}
           className="flex items-center gap-2 bg-[#8c6b38] text-white px-6 py-2.5 rounded-xl shadow-md font-bold hover:bg-[#7a5c30] active:scale-95 transition-all border-b-4 border-[#5c4033] disabled:opacity-50 disabled:active:scale-100"
         >
           <SkipForward size={18} /> 停着
         </button>
         
         <button 
           onClick={() => resetGame(false)}
           className="flex items-center gap-2 bg-white text-gray-700 px-6 py-2.5 rounded-xl shadow-md font-bold hover:bg-gray-50 active:scale-95 transition-all border-b-4 border-gray-200"
         >
           <RotateCcw size={18} /> 重开
         </button>
      </div>

      {/* Settings Modal */}
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
                        <button key={t} onClick={() => { setGameType(t); if(onlineStatus === 'connected') connection?.close(); }} className={`py-2 rounded-xl font-bold text-sm border-2 ${gameType === t ? 'border-[#cba367] bg-orange-50 text-[#8c6b38]' : 'border-transparent bg-gray-100 text-gray-400'}`}>
                           {t === 'Go' ? '围棋' : '五子棋'}
                        </button>
                    ))}
                </div>
            </div>

            <div className="space-y-1">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">玩家</label>
                <div className="grid grid-cols-2 gap-2">
                     <button onClick={() => { setGameMode('PvP'); setOnlineStatus('disconnected'); connection?.close(); }} className={`py-2 rounded-xl font-bold text-sm border-2 ${gameMode === 'PvP' && onlineStatus !== 'connected' ? 'border-[#cba367] bg-orange-50 text-[#8c6b38]' : 'border-transparent bg-gray-100 text-gray-400'}`}>
                        本地双人
                    </button>
                    <button onClick={() => { setGameMode('PvAI'); setOnlineStatus('disconnected'); connection?.close(); }} className={`py-2 rounded-xl font-bold text-sm border-2 ${gameMode === 'PvAI' ? 'border-[#cba367] bg-orange-50 text-[#8c6b38]' : 'border-transparent bg-gray-100 text-gray-400'}`}>
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
                        <button key={size} onClick={() => { setBoardSize(size as BoardSize); if(onlineStatus==='connected') connection?.close(); }} className={`py-2 rounded-xl font-bold text-sm border-2 ${boardSize === size ? 'border-[#cba367] bg-orange-50 text-[#8c6b38]' : 'border-transparent bg-gray-100 text-gray-400'}`}>
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
                       placeholder="输入好友的邀请码"
                       className="flex-1 bg-gray-100 border-2 border-transparent focus:border-[#cba367] rounded-xl px-4 py-2 font-mono outline-none transition-colors"
                     />
                     <button 
                        onClick={connectToPeer}
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