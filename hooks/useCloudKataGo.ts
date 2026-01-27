import { useState, useCallback, useRef } from 'react';
import { BoardState, Player } from '../types';
import { CLOUD_AI_URL } from '../utils/constants';

interface UseCloudKataGoProps {
    onAiMove: (x: number, y: number) => void;
    onAiPass: () => void;
    onAiResign: () => void;
}

export const useCloudKataGo = ({ onAiMove, onAiPass, onAiResign }: UseCloudKataGoProps) => {
    const [isThinking, setIsThinking] = useState(false);
    const [aiWinRate, setAiWinRate] = useState(50);
    const [aiLead, setAiLead] = useState<number | null>(null);
    const [aiTerritory, setAiTerritory] = useState<Float32Array | null>(null);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    const abortControllerRef = useRef<AbortController | null>(null);

    // Helper: Convert (x,y) to GTP coordinate (e.g. 3,3 -> "D4")
    const toGtp = (x: number, y: number, size: number) => {
        if (x < 0 || y < 0) return 'pass';
        const xChar = String.fromCharCode(65 + x + (x >= 8 ? 1 : 0)); // Skip 'I'
        const yChar = (size - y).toString();
        return `${xChar}${yChar}`;
    };

    const requestCloudAiMove = useCallback(async (
        board: BoardState,
        playerColor: Player,
        history: any[],
        visits: number = 25, 
        komi: number = 7.5
    ) => {
        if (isThinking) return;

        setIsThinking(true);
        setErrorMsg(null);

        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
        const controller = new AbortController();
        abortControllerRef.current = controller;

        try {
            const size = board.length;
            
            // 1. Format Moves History for Server
            // Server expects: { x, y, color: "black"|"white" }[]
            const historyPayload = [];
            
            history.forEach(item => {
                if (item.lastMove) {
                     historyPayload.push({
                         x: item.lastMove.x,
                         y: item.lastMove.y,
                         color: item.currentPlayer // 'black' or 'white'
                     });
                }
            });

            // 2. Construct Payload (Matching server.py MoveRequest)
            const payload = {
                boardSize: size,
                history: historyPayload,
                komi: komi,
                visits: visits
            };

            const startTime = performance.now();
            console.log(`[CloudAI] Target: ${CLOUD_AI_URL} | Visits: ${visits}`);
            console.log('[CloudAI] Payload:', JSON.stringify(payload, null, 2));
            
            const response = await fetch(CLOUD_AI_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload),
                signal: controller.signal
            });

            if (!response.ok) {
                const errText = await response.text();
                throw new Error(`Server Error (${response.status}): ${errText}`);
            }

            const data = await response.json();
            const endTime = performance.now();
            console.log(`[CloudAI] Latency: ${(endTime - startTime).toFixed(0)}ms`);
            console.log('[CloudAI] Response:', JSON.stringify(data, null, 2));
            
            // Expected data format from KataGo Analysis:
            // { moveInfos: [...], rootInfo: { winrate, lead, ownership... }, ... }
            // Or if custom server.py simplifies it: { move: "D4", winRate: 0.5 ... }
            
            // I'll support BOTH standard KataGo format and simplified format.
            
            if (data.error) {
                throw new Error(data.error);
            }

            let bestMove = null;
            let winRate = 50;
            let lead = 0;
            let ownership = null;

            // Case A: Standard KataGo Analysis Response
            if (data.moveInfos) {
                 const bestInfo = data.moveInfos[0];
                 if (bestInfo) {
                     bestMove = bestInfo.move; // "D4" or "pass"
                 }
                 if (data.rootInfo) {
                     winRate = data.rootInfo.winrate * 100; // 0-1 -> 0-100
                     lead = data.rootInfo.lead;
                     // ownership is usually NOT in rootInfo but separate? 
                     // KataGo JSON: ownership is a field in rootInfo? Or separate? 
                     // Usually separate 'ownership' array if requested.
                     if (data.ownership) ownership = data.ownership;
                 }
            } 
            // Case B: Simplified (Custom Server)
            else if (data.move) {
                 bestMove = data.move; // {x,y} or "pass" or "D4"?
                 winRate = data.winRate ?? 50;
                 lead = data.lead ?? 0;
                 ownership = data.ownership;
            }

            setAiWinRate(winRate);
            setAiLead(lead ?? null);
            if (ownership) {
                setAiTerritory(new Float32Array(ownership));
            }

            // Parse Best Move
            if (bestMove) {
                if (typeof bestMove === 'string') {
                    if (bestMove.toLowerCase() === 'pass') {
                        onAiPass();
                    } else if (bestMove.toLowerCase() === 'resign') {
                        onAiResign();
                    } else {
                        // GTP string to x,y
                        // "D4" -> x=3, y=15 (if 19x19)
                        // Need size to convert Y.
                        const colChar = bestMove[0].toUpperCase();
                        let x = colChar.charCodeAt(0) - 65;
                        if (colChar >= 'I') x--; // I is skipped in GTP
                        
                        const rowStr = bestMove.slice(1);
                        const row = parseInt(rowStr);
                        const y = size - row; 
                        
                        onAiMove(x, y);
                    }
                } else if (typeof bestMove === 'object') {
                    // {x, y} format
                    onAiMove(bestMove.x, bestMove.y);
                }
            } else {
                onAiPass();
            }

        } catch (error: any) {
            if (error.name === 'AbortError') {
                console.log('Cloud AI request aborted');
            } else {
                console.error('Cloud AI Error:', error);
                const msg = error.message || '网络请求失败';
                setErrorMsg(msg);
                // Force alert to ensure user sees it (UI Toast might be failing)
                alert(`Cloud AI Connection Failed:\n${msg}\n\nPlease check console/network logs.`);
            }
        } finally {
            setIsThinking(false);
            abortControllerRef.current = null;
        }

    }, [onAiMove, onAiPass, onAiResign]); // Removed isThinking from deps to prevent infinite re-trigger loop

    const stopThinking = useCallback(() => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            abortControllerRef.current = null;
        }
        setIsThinking(false);
    }, []);

    const resetAI = useCallback(() => {
        setAiWinRate(50);
        setAiLead(null);
        setAiTerritory(null);
        setErrorMsg(null);
        stopThinking();
    }, [stopThinking]);

    return {
        isThinking,
        aiWinRate,
        aiLead,
        aiTerritory,
        errorMsg,
        requestCloudAiMove,
        stopThinking,
        resetAI
    };
};
