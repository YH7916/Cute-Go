// src/hooks/useKataGo.ts
import { useState, useEffect, useRef, useCallback } from 'react';
import { Player, BoardSize, Difficulty } from '../types'; // 引用根目录的 types.ts

// --- 类型定义 ---
interface ElectronAPI {
  initAI: () => void;
  sendCommand: (cmd: string) => void;
  onResponse: (callback: (response: any) => void) => void;
}

// 对应 App.tsx 中的 ExtendedDifficulty
export type ExtendedDifficulty = Difficulty | 'Custom';

// --- 辅助计算函数 (导出给 UI 使用) ---
export const sliderToVisits = (val: number): number => {
    // 0-50 映射到 1-100 (每格约2 visits)
    // 50-100 映射到 100-2000 (每格约38 visits)
    // 这是一个分段线性映射，让低 visits 区间更细腻
    if (val <= 50) return Math.round(1 + (val / 50) * 99);
    else return Math.round(100 + ((val - 50) / 50) * 1900);
};

export const visitsToSlider = (visits: number): number => {
    if (visits <= 100) return ((visits - 1) / 99) * 50;
    else return 50 + ((visits - 100) / 1900) * 50;
};

// --- GTP 工具函数 (私有) ---
const GTP_COORDS = "ABCDEFGHJKLMNOPQRST";

const toGTP = (x: number, y: number, boardSize: number) => {
  if (x < 0 || y < 0) return "pass";
  const colStr = GTP_COORDS[x];
  const rowStr = (boardSize - y).toString();
  return `${colStr}${rowStr}`;
};

const fromGTP = (gtpStr: string, boardSize: number) => {
  if (!gtpStr || gtpStr.toLowerCase() === 'pass') return null;
  const colChar = gtpStr[0].toUpperCase();
  const x = GTP_COORDS.indexOf(colChar);
  const y = boardSize - parseInt(gtpStr.slice(1));
  return { x, y };
};

// --- Hook Props ---
interface UseKataGoProps {
  boardSize: BoardSize;
  onAiMove: (x: number, y: number) => void; // AI 落子回调
  onAiPass: () => void; // AI 停着回调
}

// --- Hook 实现 ---
export const useKataGo = ({ boardSize, onAiMove, onAiPass }: UseKataGoProps) => {
  const [isThinking, setIsThinking] = useState(false);
  const [aiWinRate, setAiWinRate] = useState<number>(50);
  const [isInitializing, setIsInitializing] = useState(true); // 引擎加载状态
  
  // 引用以避免闭包陷阱
  const boardSizeRef = useRef(boardSize);
  const isThinkingRef = useRef(isThinking);

  // 判断环境 (根据 window 对象是否存在 electronAPI)
  const isElectron = typeof window !== 'undefined' && 'electronAPI' in window;

  // 同步 Refs
  useEffect(() => { boardSizeRef.current = boardSize; }, [boardSize]);
  useEffect(() => { isThinkingRef.current = isThinking; }, [isThinking]);

  // --- 1. 初始化监听器 ---
  useEffect(() => {
    if (!isElectron) {
      setIsInitializing(false);
      return;
    }

    const api = (window as any).electronAPI as ElectronAPI;

    const handleAIResponse = (response: any) => {
      if (response.status === 'success') {
        const content = response.data.trim();

        // 错误处理
        if (content.startsWith('?')) {
          console.error("KataGo Error:", content);
          setIsThinking(false);
          return;
        }

        // 解析胜率 (Info)
        if (content.startsWith('info')) {
          const match = content.match(/winrate\s+([\d\.]+)/);
          if (match) {
            let rate = parseFloat(match[1]);
            if (rate <= 1.0) rate *= 100;
            setAiWinRate(rate); // 这里返回 AI 视角的胜率
          }
          return;
        }

        // 解析落子坐标 (只有在思考时才响应)
        // 增加 content 长度校验，防止误判
        if (isThinkingRef.current && (content.match(/^[A-T][0-9]+$/) || content.toLowerCase() === 'pass')) {
          const move = fromGTP(content, boardSizeRef.current);
          if (move) {
            onAiMove(move.x, move.y);
          } else {
            onAiPass();
          }
          setIsThinking(false);
        }
      } else if (response.status === 'error') {
        console.error("IPC Error:", response.error);
        setIsThinking(false);
      }
    };

    const removeListener = api.onResponse(handleAIResponse);
    api.initAI();

    // 模拟初始化延迟
    const isFirstRun = !localStorage.getItem('has_run_ai_before');
    const timer = setTimeout(() => {
      setIsInitializing(false);
      localStorage.setItem('has_run_ai_before', 'true');
    }, isFirstRun ? 15000 : 5000);

    return () => {
      if (removeListener) removeListener();
      clearTimeout(timer);
    };
  }, [isElectron]);

  // --- 2. 对外暴露的方法 ---

  // 基础发送指令
  const sendCommand = useCallback((cmd: string) => {
    if (isElectron) {
      (window as any).electronAPI.sendCommand(cmd);
    }
  }, [isElectron]);

  // 同步玩家的落子到 AI
  const syncHumanMove = useCallback((player: Player, x: number, y: number) => {
    if (!isElectron) return;
    const gtpMove = toGTP(x, y, boardSizeRef.current);
    sendCommand(`play ${player} ${gtpMove}`);
  }, [sendCommand]);

  // 请求 AI 落子
  const requestAiMove = useCallback((
    aiColor: Player, 
    difficulty: ExtendedDifficulty, 
    maxVisits: number
  ) => {
    if (!isElectron) return;
    if (isThinkingRef.current) return; // 防止重复请求

    setIsThinking(true);
    
    // 计算 Visits
    let visits = 10;
    if (difficulty === 'Easy') visits = 1;
    else if (difficulty === 'Medium') visits = 10;
    else if (difficulty === 'Hard') visits = 100;
    else if (difficulty === 'Custom') visits = maxVisits;

    sendCommand(`kata-set-param maxVisits ${visits}`);
    
    // 稍微延时发送 genmove 确保参数生效
    setTimeout(() => {
      sendCommand(`genmove ${aiColor}`);
    }, 50);
  }, [sendCommand]);

  // 重置 AI 状态
  const resetAI = useCallback((newBoardSize: number, komi: number = 7.5) => {
    if (!isElectron) return;
    setIsThinking(false);
    setAiWinRate(50);
    sendCommand(`boardsize ${newBoardSize}`);
    sendCommand('clear_board');
    sendCommand(`komi ${komi}`);
  }, [sendCommand]);

  const stopThinking = useCallback(() => {
    setIsThinking(false);
  }, []);

  return {
    isAvailable: isElectron,
    isThinking,
    isInitializing,
    setIsInitializing,
    aiWinRate,
    setAiWinRate,
    syncHumanMove,
    requestAiMove,
    resetAI,
    stopThinking
  };
};