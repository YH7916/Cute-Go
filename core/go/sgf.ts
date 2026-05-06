import { BoardState, Player, GameType, BoardSize } from '../../types';
import { createBoard } from '../board';
import { attemptMove } from './rules';

interface GameSnapshot {
  board: string[][];
  size: number;
  turn: Player;
  type: GameType;
  bCaps: number;
  wCaps: number;
}

export const serializeGame = (
  board: BoardState,
  currentPlayer: Player,
  gameType: GameType,
  bCaps: number,
  wCaps: number
): string => {
  const simpleBoard = board.map(row =>
    row.map(cell => (cell ? (cell.color === 'black' ? 'B' : 'W') : '.'))
  );
  const snapshot: GameSnapshot = {
    board: simpleBoard,
    size: board.length,
    turn: currentPlayer,
    type: gameType,
    bCaps,
    wCaps,
  };
  try {
    return btoa(JSON.stringify(snapshot));
  } catch (e) {
    console.error(e);
    return '';
  }
};

export const deserializeGame = (
  key: string
): {
  board: BoardState;
  currentPlayer: Player;
  gameType: GameType;
  boardSize: BoardSize;
  blackCaptures: number;
  whiteCaptures: number;
} | null => {
  try {
    const jsonStr = atob(key);
    const snapshot: GameSnapshot = JSON.parse(jsonStr);
    if (!snapshot.board || !snapshot.size) return null;
    const newBoard: BoardState = snapshot.board.map((row, y) =>
      row.map((cell, x) => {
        if (cell === 'B') return { color: 'black' as Player, x, y, id: `imported-b-${x}-${y}-${Date.now()}` };
        if (cell === 'W') return { color: 'white' as Player, x, y, id: `imported-w-${x}-${y}-${Date.now()}` };
        return null;
      })
    );
    return {
      board: newBoard,
      currentPlayer: snapshot.turn,
      gameType: snapshot.type,
      boardSize: snapshot.size as BoardSize,
      blackCaptures: snapshot.bCaps,
      whiteCaptures: snapshot.wCaps,
    };
  } catch (e) {
    return null;
  }
};

export const generateSGF = (
  history: { board: BoardState; currentPlayer: Player; lastMove: { x: number; y: number } | null }[],
  boardSize: number,
  komi = 7.5,
  initialStones: { x: number; y: number; color: Player }[] = []
): string => {
  const date = new Date().toISOString().split('T')[0];
  let sgf = `(;GM[1]FF[4]CA[UTF-8]AP[CuteGo:1.0]ST[2]\n`;
  sgf += `RU[Chinese]SZ[${boardSize}]KM[${komi}]\n`;
  sgf += `DT[${date}]PW[White]PB[Black]GN[CuteGo Game]\n`;

  const toSgfCoord = (c: number) => String.fromCharCode(97 + c);

  if (initialStones.length > 0) {
    let ab = '', aw = '';
    initialStones.forEach(s => {
      const coord = toSgfCoord(s.x) + toSgfCoord(s.y);
      if (s.color === 'black') ab += `[${coord}]`;
      else aw += `[${coord}]`;
    });
    if (ab) sgf += `AB${ab}`;
    if (aw) sgf += `AW${aw}`;
    sgf += '\n';
  }

  history.forEach(h => {
    const color = h.currentPlayer === 'black' ? 'B' : 'W';
    if (h.lastMove) {
      const moveStr = toSgfCoord(h.lastMove.x) + toSgfCoord(h.lastMove.y);
      sgf += `;${color}[${moveStr}]`;
    }
  });

  sgf += ')';
  return sgf;
};

export const parseSGF = (
  sgf: string
): {
  board: BoardState;
  currentPlayer: Player;
  gameType: GameType;
  boardSize: BoardSize;
  blackCaptures: number;
  whiteCaptures: number;
  history: any[];
  komi: number;
  initialStones: { x: number; y: number; color: Player }[];
} | null => {
  try {
    const szMatch = sgf.match(/SZ\[(\d+)\]/);
    const size = szMatch ? parseInt(szMatch[1]) : 19;
    const komiMatch = sgf.match(/KM\[([\d.]+)\]/);
    const komi = komiMatch ? parseFloat(komiMatch[1]) : 7.5;

    let board = createBoard(size);
    let currentPlayer: Player = 'black';
    const history: any[] = [];
    let blackCaptures = 0, whiteCaptures = 0;
    let consecutivePasses = 0;
    const initialStones: { x: number; y: number; color: Player }[] = [];

    const abMatch = sgf.match(/AB((?:\[[a-z]{2}\])+)/);
    if (abMatch) {
      const coords = abMatch[1].match(/\[([a-z]{2})\]/g);
      coords?.forEach(c => {
        const s = c.replace(/[\[\]]/g, '');
        const x = s.charCodeAt(0) - 97, y = s.charCodeAt(1) - 97;
        if (x >= 0 && x < size && y >= 0 && y < size) {
          board[y][x] = { color: 'black', x, y, id: `setup-b-${x}-${y}` };
          initialStones.push({ x, y, color: 'black' });
        }
      });
    }

    const awMatch = sgf.match(/AW((?:\[[a-z]{2}\])+)/);
    if (awMatch) {
      const coords = awMatch[1].match(/\[([a-z]{2})\]/g);
      coords?.forEach(c => {
        const s = c.replace(/[\[\]]/g, '');
        const x = s.charCodeAt(0) - 97, y = s.charCodeAt(1) - 97;
        if (x >= 0 && x < size && y >= 0 && y < size) {
          board[y][x] = { color: 'white', x, y, id: `setup-w-${x}-${y}` };
          initialStones.push({ x, y, color: 'white' });
        }
      });
    }

    const moveRegex = /;([BW])\[([a-z]{0,2})\]/g;
    let match;
    while ((match = moveRegex.exec(sgf)) !== null) {
      const colorCode = match[1];
      const coordStr = match[2];
      const player: Player = colorCode === 'B' ? 'black' : 'white';

      if (!coordStr || coordStr === '' || (coordStr === 'tt' && size <= 19)) {
        const nextPlayer = player === 'black' ? 'white' : 'black';
        history.push({
          board,
          currentPlayer: nextPlayer,
          lastMove: null,
          blackCaptures,
          whiteCaptures,
          consecutivePasses: consecutivePasses + 1,
        });
        consecutivePasses++;
        currentPlayer = nextPlayer;
        continue;
      }

      const x = coordStr.charCodeAt(0) - 97;
      const y = coordStr.charCodeAt(1) - 97;

      if (x >= 0 && x < size && y >= 0 && y < size) {
        const result = attemptMove(board, x, y, player);
        if (result) {
          board = result.newBoard;
          if (player === 'black') blackCaptures += result.captured;
          else whiteCaptures += result.captured;

          const nextPlayer = player === 'black' ? 'white' : 'black';
          history.push({
            board,
            currentPlayer: nextPlayer,
            lastMove: { x, y },
            blackCaptures,
            whiteCaptures,
            consecutivePasses: 0,
          });
          consecutivePasses = 0;
          currentPlayer = nextPlayer;
        }
      }
    }

    return {
      board,
      currentPlayer,
      gameType: 'Go',
      boardSize: size as BoardSize,
      blackCaptures,
      whiteCaptures,
      history,
      komi,
      initialStones,
    };
  } catch (e) {
    console.error('SGF Parse Failed', e);
    return null;
  }
};
