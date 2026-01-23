/**
 * SGF parsing and board reconstruction utilities
 */

import { parse } from '@kaya/sgf';
import { GameTree } from '@kaya/gametree';
import type { GameTreeNode } from '@kaya/gametree';
import { GoBoard } from '@kaya/goboard';

export interface SGFProperty {
  [key: string]: string[] | undefined;
  B?: string[];
  W?: string[];
  SZ?: string[];
  AB?: string[]; // Add Black stones
  AW?: string[]; // Add White stones
  PL?: string[]; // Player to move
}

export interface BoardState {
  board: GoBoard;
  moveCount: number;
  explicitTurn: 'B' | 'W' | null;
}

export interface ParsedSGF {
  rootNode: GameTreeNode<SGFProperty>;
  gameTree: GameTree<SGFProperty>;
  boardSize: number;
  totalMoves: number;
}

/**
 * Parse SGF content and return game information
 * @param sgfContent - SGF file content
 * @returns Parsed SGF information
 * @throws Error if SGF is invalid or empty
 */
export function parseSGF(sgfContent: string): ParsedSGF {
  const rootNodes = parse(sgfContent);

  if (rootNodes.length === 0) {
    throw new Error('No games found in SGF file');
  }

  const rootNode = rootNodes[0] as GameTreeNode<SGFProperty>;

  // Get board size
  const sizeStr = rootNode.data.SZ?.[0] ?? '19';
  const boardSize = parseInt(sizeStr, 10);

  if (isNaN(boardSize) || boardSize < 1 || boardSize > 25) {
    throw new Error(`Invalid board size: ${sizeStr}`);
  }

  // Create game tree
  const gameTree = new GameTree({ root: rootNode });

  // Count total moves in main line
  let tempNode: GameTreeNode<SGFProperty> = rootNode;
  let totalMoves = 0;
  while (tempNode.children && tempNode.children.length > 0) {
    tempNode = tempNode.children[0];
    totalMoves++;
  }

  return {
    rootNode,
    gameTree,
    boardSize,
    totalMoves,
  };
}

/**
 * Navigate to a specific move number in the game tree
 * @param gameTree - The game tree
 * @param rootNode - The root node
 * @param moveNumber - Move number to navigate to (0 = start)
 * @returns The node at the target move
 */
export function navigateToMove(
  gameTree: GameTree<SGFProperty>,
  rootNode: GameTreeNode<SGFProperty>,
  moveNumber: number
): GameTreeNode<SGFProperty> {
  let currentNode = rootNode;

  for (let i = 0; i < moveNumber && currentNode.children.length > 0; i++) {
    currentNode = currentNode.children[0];
  }

  return currentNode;
}

/**
 * Reconstruct board state from SGF game tree up to a specific node
 * @param gameTree - The game tree
 * @param nodeId - Target node ID
 * @param boardSize - Board size
 * @returns Board state with move count and explicit turn
 */
export function reconstructBoard(
  gameTree: GameTree<SGFProperty>,
  nodeId: number | string,
  boardSize: number
): BoardState {
  let board = GoBoard.fromDimensions(boardSize);
  let moveCount = 0;
  let explicitTurn: 'B' | 'W' | null = null;

  // Build path from root to target node by traversing parent links
  const path: GameTreeNode<SGFProperty>[] = [];
  let currentNode = gameTree.get(nodeId);

  while (currentNode) {
    path.unshift(currentNode); // Add to beginning
    if (currentNode.parentId === null) {
      break;
    }
    currentNode = gameTree.get(currentNode.parentId);
  }

  // Check target node for explicit PL (Player to move) property
  const targetNode = gameTree.get(nodeId);
  if (targetNode && targetNode.data.PL) {
    const plValue = targetNode.data.PL[0];
    if (plValue === 'B' || plValue === 'W') {
      explicitTurn = plValue;
    }
  }

  // Apply each move in sequence from root to target
  for (const node of path) {
    const data = node.data;

    // Setup stones (AB/AW in root position)
    if (data.AB) {
      for (const stonePos of data.AB) {
        const vertex = parseVertex(stonePos);
        if (vertex) {
          board = board.makeMove(-1, vertex);
        }
      }
    }
    if (data.AW) {
      for (const stonePos of data.AW) {
        const vertex = parseVertex(stonePos);
        if (vertex) {
          board = board.makeMove(1, vertex);
        }
      }
    }

    // Check for black move
    if (data.B) {
      const moveStr = data.B[0];
      if (moveStr && moveStr.length >= 2) {
        const vertex = parseVertex(moveStr);
        if (vertex) {
          board = board.makeMove(-1, vertex);
          moveCount++;
        }
      }
    }

    // Check for white move
    if (data.W) {
      const moveStr = data.W[0];
      if (moveStr && moveStr.length >= 2) {
        const vertex = parseVertex(moveStr);
        if (vertex) {
          board = board.makeMove(1, vertex);
          moveCount++;
        }
      }
    }
  }

  return { board, moveCount, explicitTurn };
}

/**
 * Parse SGF vertex notation to [x, y] coordinates
 * @param sgfCoord - SGF coordinate string (e.g., "pd", "dd")
 * @returns [x, y] coordinates or null if invalid
 */
export function parseVertex(sgfCoord: string): [number, number] | null {
  if (sgfCoord.length < 2) return null;

  const alpha = 'abcdefghijklmnopqrstuvwxyz';
  const x = alpha.indexOf(sgfCoord[0]);
  const y = alpha.indexOf(sgfCoord[1]);

  if (x === -1 || y === -1) return null;
  return [x, y];
}
