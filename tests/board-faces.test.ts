import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import React from 'react';
import { GameBoard } from '../components/GameBoard';
import { getGroupFaces } from '../components/board/faces';
import { createBoard, getAllGroups } from '../core/board';
import type { BoardState, GameType, Player } from '../types';

// Keep the real React renderer in the shared harness's bundled ESM test host.
Object.assign(globalThis, { require: createRequire(import.meta.url) });
const { renderToStaticMarkup } = await import('react-dom/server');

function put(board: BoardState, x: number, y: number, color: Player) {
  board[y][x] = { x, y, color, id: `${color}-${x}-${y}` };
}

function stonesOf(board: BoardState) {
  return board.flat().filter(stone => stone !== null);
}

function facesOf(board: BoardState, separatePieces: boolean, gameType: GameType = 'Go') {
  return getGroupFaces(getAllGroups(board), stonesOf(board), gameType, separatePieces);
}

function mixedBoard() {
  const board = createBoard(9);
  for (const [x, y] of [[1, 1], [2, 1], [1, 2], [2, 2], [7, 7]]) put(board, x, y, 'black');
  for (const [x, y] of [[4, 4], [5, 4], [6, 4], [0, 7]]) put(board, x, y, 'white');
  return board;
}

for (const color of ['black', 'white'] as const) {
  for (const [shape, points] of [
    ['square', [[1, 1], [2, 1], [1, 2], [2, 2]]],
    ['line', [[1, 1], [2, 1], [3, 1]]],
  ] as const) {
    test(`Go/${color}/${shape}: independent pieces each have their own normally sized face`, () => {
      const board = createBoard(9);
      for (const [x, y] of points) put(board, x, y, color);
      const faces = facesOf(board, true);
      assert.equal(faces.length, points.length);
      assert.deepEqual(
        faces.map(({ id, x, y, color: faceColor, scale }) => ({ id, x, y, color: faceColor, scale }))
          .sort((a, b) => a.id.localeCompare(b.id)),
        stonesOf(board).map(stone => ({ ...stone, scale: 1 })).sort((a, b) => a.id.localeCompare(b.id))
      );
      assert.equal(facesOf(board, false).length, 1, 'connected Go retains one face per group');
    });
  }
}

test('Go face mode changes preserve input groups, stones and each separate group', () => {
  const board = mixedBoard();
  const groups = getAllGroups(board);
  const stones = stonesOf(board);
  const before = structuredClone({ board, groups, stones });
  assert.equal(groups.length, 4);
  assert.equal(getGroupFaces(groups, stones, 'Go', true).length, 9);
  const connected = getGroupFaces(groups, stones, 'Go', false);
  assert.equal(connected.length, 4);
  assert.deepEqual(getGroupFaces(groups, stones, 'Go'), connected, 'default mode stays connected');
  assert.deepEqual({ board, groups, stones }, before);
});

for (const [liberties, mood] of [[1, 'worried'], [2, 'neutral'], [3, 'neutral'], [4, 'happy']] as const) {
  test(`Go independent faces share their group's ${liberties}-liberty ${mood} mood`, () => {
    const board = createBoard(5);
    for (const x of [0, 1, 2]) put(board, x, 0, 'black');
    const libertyPoints = [[0, 1], [1, 1], [3, 0], [2, 1]];
    for (const [x, y] of libertyPoints.slice(0, 4 - liberties)) put(board, x, y, 'white');
    const group = getAllGroups(board).find(candidate => candidate.stones[0].color === 'black');
    assert.equal(group?.liberties, liberties, 'fixture must use the actual shared Go liberty count');
    const faces = facesOf(board, true).filter(face => face.color === 'black');
    assert.equal(faces.length, 3);
    assert.deepEqual(faces.map(face => face.mood), [mood, mood, mood],
      'end and middle stones have different local empty neighbors but share one group mood');
    assert.equal(facesOf(board, false).find(face => face.color === 'black')?.mood, mood);
  });
}

test('independent faces look from their own position toward their shared liberty center', () => {
  const board = createBoard(5);
  put(board, 1, 1, 'black');
  put(board, 2, 1, 'black');
  const faces = facesOf(board, true);
  assert.equal(faces.length, 2);
  assert.deepEqual(faces.find(face => face.x === 1)?.lookOffset, { x: 1, y: 0 });
  assert.deepEqual(faces.find(face => face.x === 2)?.lookOffset, { x: -1, y: 0 });
});

test('adding a neighbor keeps existing independent face identities stable', () => {
  const board = createBoard(5);
  put(board, 1, 1, 'black');
  put(board, 2, 1, 'black');
  const before = facesOf(board, true).map(({ id, x, y }) => ({ id, x, y }));
  put(board, 3, 1, 'black');
  const after = facesOf(board, true);
  for (const face of before) {
    const retained = after.find(candidate => candidate.id === face.id);
    assert.ok(retained, 'an existing face must not remount just because the connected group grew');
    assert.deepEqual({ id: retained.id, x: retained.x, y: retained.y }, face);
  }
  assert.equal(after.length, 3);
});

test('Gomoku keeps one happy forward-looking face per stone under either setting', () => {
  const board = mixedBoard();
  const connected = facesOf(board, false, 'Gomoku');
  assert.deepEqual(facesOf(board, true, 'Gomoku'), connected);
  assert.deepEqual(connected, stonesOf(board).map(stone => ({
    ...stone, mood: 'happy', scale: 1, lookOffset: { x: 0, y: 0 },
  })));
});

for (const stoneSkin of ['classic', 'skeuomorphic']) {
  for (const gameType of ['Go', 'Gomoku'] as const) {
    for (const separatePieces of [false, true]) {
      test(`${stoneSkin}/${gameType}/${separatePieces}: GameBoard renders all requested faces`, () => {
        const board = mixedBoard();
        const markup = renderToStaticMarkup(React.createElement(GameBoard, {
          board, currentPlayer: 'black', lastMove: null, showQi: false,
          stoneSkin, gameType, separatePieces, onIntersectionClick: () => {},
        }));
        const expected = gameType === 'Gomoku' || separatePieces ? 9 : 4;
        assert.equal([...markup.matchAll(/class="face-enter\b/g)].length, expected);
      });
    }
  }
}
