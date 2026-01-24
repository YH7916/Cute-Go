
import { BoardState } from '../types';
import { createBoard } from '../utils/goLogic';

export const TUTORIAL_STEPS = [
    {
        title: "棋子的气",
        content: "围棋的棋子也是有生命的。棋子周围直线连接的交叉点，就是它们的“气”（呼吸口）\n可以点击黑子查看它的“气”。",
        puzzleType: 'qi',
        boardSize: 5
    },
    {
        title: "提子",
        content: "当棋子最后一口气被对方堵住时，它就会因为窒息而死亡。\n请提走这颗白子！",
        puzzleType: 'capture',
        boardSize: 7
    },
    {
        title: "同生共死",
        content: "相连的棋子是一个整体，它们共享所有的气。\n可以点击查看这个整体的“气”。",
        puzzleType: 'connection',
        boardSize: 5
    },
    {
        title: "禁入点",
        content: "会让自己的棋子“自杀”（且不能提掉对方）的点就是“禁入点”。\n请尝试点击中间交叉点，感受规则的限制。",
        puzzleType: 'forbidden',
        boardSize: 7
    },
    {
        title: "打劫",
        content: "这叫“打劫”。您提掉白子后，白棋不能立即回提，否则棋局会循环不止（同形重复）。\n请先提掉这颗白子。",
        puzzleType: 'ko',
        boardSize: 9
    },
    {
        title: "眼位与死活",
        content: "这块黑棋危险了！围棋的灵魂是“两眼活棋”。有了两个独立的“眼”，对方永远无法填满您的气。\n请在关键位置落子，制造出“两眼活棋”！",
        puzzleType: 'eyes',
        boardSize: 9
    },
    {
        title: "终局: 虚手",
        content: "当双方都没棋可下，连续停一手，游戏结束。\n现在的棋局已经接近尾声，请点击按钮结算。",
        puzzleType: 'endgame',
        boardSize: 9
    },
    {
        title: "终局判定: 数地",
        content: "虚手之后游戏结束，此时系统会自动计算双方的“地盘”（目数）。\n请点击【计算地盘】按钮，查看胜负结果吧！",
        puzzleType: 'territory',
        boardSize: 9
    },
    {
        title: "开局与棋形",
        content: "“金角银边草肚皮”。开局抢占角部效率最高。\n请在棋盘角上的星位（高亮处）落子，然后我们试试经典的“小飞守角”。",
        puzzleType: 'final_shape',
        boardSize: 9
    }
];

export interface TutorialInitResult {
    board: BoardState;
    showQiOverride: boolean;
    qiFocus?: { x: number, y: number };
    isCompleted: boolean;
    setupType: string;
}

export const initTutorialStep = (stepIdx: number): TutorialInitResult => {
    const step = TUTORIAL_STEPS[stepIdx];
    const size = step.boardSize;
    const center = Math.floor(size / 2);
    let board = createBoard(size);
    let showQiOverride = false;
    let qiFocus = undefined;
    let isCompleted = false;
    const type = step.puzzleType;

    if (type === 'qi') {
        board[center][center] = { x: center, y: center, color: 'black', id: 'tut-b1' };
        showQiOverride = true;
        qiFocus = { x: center, y: center };
        isCompleted = true;
    }
    else if (type === 'connection') {
        board[center][center] = { x: center, y: center, color: 'black', id: 'tut-b1' };
        board[center][center + 1] = { x: center + 1, y: center, color: 'black', id: 'tut-b2' };
        showQiOverride = true;
        qiFocus = { x: center, y: center };
        isCompleted = true;
    }
    else if (type === 'capture') {
        board[center - 1][center] = { x: center, y: center - 1, color: 'black', id: 'tut-b1' };
        board[center][center - 1] = { x: center - 1, y: center, color: 'black', id: 'tut-b2' };
        board[center][center + 1] = { x: center + 1, y: center, color: 'black', id: 'tut-b3' };
        board[center][center] = { x: center, y: center, color: 'white', id: 'tut-w1' };
    }
    else if (type === 'forbidden') {
        board[center - 1][center] = { x: center, y: center - 1, color: 'black', id: 'b1' };
        board[center + 1][center] = { x: center, y: center + 1, color: 'black', id: 'b2' };
        board[center][center - 1] = { x: center - 1, y: center, color: 'black', id: 'b3' };
        board[center][center + 1] = { x: center + 1, y: center, color: 'black', id: 'b4' };
    }
    else if (type === 'ko') {
        board[2][8] = { x: 8, y: 2, color: 'black', id: 'b-ko-1' };
        board[3][7] = { x: 7, y: 3, color: 'black', id: 'b-ko-2' };
        board[3][8] = { x: 8, y: 3, color: 'white', id: 'w-victim' };
        board[5][8] = { x: 8, y: 5, color: 'white', id: 'w-wall-1' };
        board[4][7] = { x: 7, y: 4, color: 'white', id: 'w-wall-2' };
    }
    else if (type === 'eyes') {
        board[3][3] = { x: 3, y: 3, color: 'black', id: 'b-e-1' };
        board[4][3] = { x: 3, y: 4, color: 'black', id: 'b-e-2' };
        board[5][3] = { x: 3, y: 5, color: 'black', id: 'b-e-3' };
        board[2][4] = { x: 4, y: 2, color: 'black', id: 'b-e-4' };
        board[6][4] = { x: 4, y: 6, color: 'black', id: 'b-e-5' };
        board[3][5] = { x: 5, y: 3, color: 'black', id: 'b-e-6' };
        board[4][5] = { x: 5, y: 4, color: 'black', id: 'b-e-7' };
        board[5][5] = { x: 5, y: 5, color: 'black', id: 'b-e-8' };
        board[1][4] = { x: 4, y: 1, color: 'white', id: 'w-d-1' };
        board[7][4] = { x: 4, y: 7, color: 'white', id: 'w-d-2' };
    }
    else if (type === 'territory' || type === 'endgame') {
        for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++)
            if ((x + y) % 2 === 0) board[y][x] = { x, y, color: 'black', id: `tut-b-${x}-${y}` };
        board[4][0] = { x: 0, y: 4, color: 'black', id: 'b-wall-1' };
        board[4][1] = { x: 1, y: 4, color: 'black', id: 'b-wall-2' };
        board[4][2] = { x: 2, y: 4, color: 'black', id: 'b-wall-3' };
        board[3][3] = { x: 3, y: 3, color: 'black', id: 'b-wall-4' };
        board[2][4] = { x: 4, y: 2, color: 'black', id: 'b-wall-5' };
        board[1][4] = { x: 4, y: 1, color: 'black', id: 'b-wall-6' };
        board[0][4] = { x: 4, y: 0, color: 'black', id: 'b-wall-7' };

        board[5][5] = { x: 5, y: 5, color: 'white', id: 'w-wall-1' };
        board[5][6] = { x: 6, y: 5, color: 'white', id: 'w-wall-2' };
        board[5][7] = { x: 7, y: 5, color: 'white', id: 'w-wall-3' };
        board[5][8] = { x: 8, y: 5, color: 'white', id: 'w-wall-4' };
        board[6][5] = { x: 5, y: 6, color: 'white', id: 'w-wall-5' };
        board[7][5] = { x: 5, y: 7, color: 'white', id: 'w-wall-6' };
        board[8][5] = { x: 5, y: 8, color: 'white', id: 'w-wall-7' };
        board[7][7] = { x: 7, y: 7, color: 'white', id: 'w-in-1' };
    }
    else if (type === 'final_shape') {
        board[2][6] = { x: 6, y: 2, color: 'white', id: 'tut-w-corner' };
    }

    return { board, showQiOverride, qiFocus, isCompleted, setupType: type };
};

export const getTutorialHighlight = (stepIdx: number, isCompleted: boolean, board: BoardState) => {
    if (isCompleted) return null;
    const type = TUTORIAL_STEPS[stepIdx].puzzleType;
    const size = board.length;
    const center = Math.floor(size / 2);

    if (type === 'capture') return { x: center, y: center + 1, color: '#795548' };
    if (type === 'forbidden') return { x: center, y: center, color: '#795548' };
    if (type === 'ko') return { x: 8, y: 4, color: '#795548' };
    if (type === 'eyes') return { x: 4, y: 4, color: '#795548' };
    if (type === 'final_shape') {
        let hasMove1 = false;
        board.forEach(r => r.forEach(s => { if (s?.color === 'black' && s.id === 'move-1') hasMove1 = true; }));
        if (!hasMove1) return { x: 2, y: 2, color: '#795548' };
        else return { x: 4, y: 3, color: '#795548' };
    }
    return null;
};
