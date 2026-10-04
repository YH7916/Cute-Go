import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import React from 'react';
import { GameBoard, calculateBoardConstants } from '../components/GameBoard';
import { createBoard, getAllGroups, getGroup } from '../core/board';
import { getBoardConnections } from '../components/board/connections';
import { getGroupFaces } from '../components/board/faces';
import { getStarPoints } from '../components/board/geometry';
import { calculateQiFlow } from '../components/board/qiFlow';
import type { BoardState, GameType, Player } from '../types';
import type { StoneThemeId, BoardThemeId } from '../utils/themes';

// The test runner bundles ESM; Node's React server renderer still loads built-ins via require.
Object.assign(globalThis, { require: createRequire(import.meta.url) });
const { renderToStaticMarkup } = await import('react-dom/server');

function fixtureBoard(size: number): BoardState {
  const board = createBoard(size);
  const stones: [number, number, Player][] = [
    [0, 0, 'black'],
    [1, 0, 'white'],
    [1, 1, 'black'],
    [2, 1, 'black'],
    [1, 2, 'black'],
    [2, 2, 'black'],
    [3, 3, 'black'],
    [4, 3, 'white'],
    [5, 4, 'white'],
    [5, 5, 'white'],
    [6, 5, 'white'],
    [7, 7, 'white'],
  ];
  for (const [x, y, color] of stones) board[y][x] = { x, y, color, id: color + '-' + x + '-' + y };
  return board;
}

// Connected Go snapshots retain their pre-decomposition hashes. Independent Go
// and Gomoku snapshots also cover the corrected skin material and separation.
// Independent Go additionally renders one face per stone, retaining shared group moods.
const snapshots: [number, GameType, StoneThemeId, boolean, string][] = [
  [9, 'Go', 'classic', false, 'cd84b50d8837e0756999d4c95b732f328cad11559961f931ec9ab7ae78130528'],
  [9, 'Go', 'classic', true, '511a311d47cfd43945f11420cf2af2792ffa98e63f2a599a25ce4dce6bc8da79'],
  [
    9,
    'Go',
    'skeuomorphic',
    false,
    'e578c609e4ae40a611da875be7c678f67b77ae5831fe0b37e710bb28b9427b2b',
  ],
  [
    9,
    'Go',
    'skeuomorphic',
    true,
    'f243ec3718fde5bcc6612c7a30597cdd2853bc867b16e057b3867ce5c7d4207a',
  ],
  [
    9,
    'Gomoku',
    'classic',
    false,
    '7b84e9cc24790c5ca5aa2db63463b79c1c237dcd96dafeb9ad71b45a7c2485d0',
  ],
  [
    9,
    'Gomoku',
    'classic',
    true,
    '76ee5e2c361cd2e4585162b7e1529df5c3d76b365584c7e42654a7d1325c8524',
  ],
  [
    9,
    'Gomoku',
    'skeuomorphic',
    false,
    '9058ffedb3958015844a4dcd29dd8bed6583ff484b21b3f4e96d391922e6f5b1',
  ],
  [
    9,
    'Gomoku',
    'skeuomorphic',
    true,
    'e3c6e77e3e06df05851411c0686076428f91ebc11c09603de81bca4f0f8a031a',
  ],
  [13, 'Go', 'classic', false, '5a820437c70865f317d6a3e6090cee3b983aca08e42962e54a990f68a3934b44'],
  [13, 'Go', 'classic', true, '2057653c216bb2bfcac94800682eb8c810b0d62e248f75a036af1e77bfe1ddb3'],
  [
    13,
    'Go',
    'skeuomorphic',
    false,
    '5c787880dbf22ea7f97fe5bc34c8387f66b2160a048c7026e00d0521fbe108d4',
  ],
  [
    13,
    'Go',
    'skeuomorphic',
    true,
    '251fbdfa94b8f98f554e1700cc2ffe2cd62428f10a23d092feeb942df8b81dc4',
  ],
  [
    13,
    'Gomoku',
    'classic',
    false,
    'fe48c7b896b069dcf5fa24328e80f77d50fc25ba0b8aff74ffe8dc9cb9312152',
  ],
  [
    13,
    'Gomoku',
    'classic',
    true,
    'e3c4aa4cb99794e494c5f944fe458a613aeb140c053c27c84dd919b58bd17ab6',
  ],
  [
    13,
    'Gomoku',
    'skeuomorphic',
    false,
    '285fa62cbc2027cfd6b0f3dad7387cb8130c8e8fd185f1266fb012479adfde9f',
  ],
  [
    13,
    'Gomoku',
    'skeuomorphic',
    true,
    'edcbbd41c431cc78136254def6cbdc2bafa65197d13c8a14c4728a0cdb6bc44a',
  ],
  [19, 'Go', 'classic', false, '3583e10c0d8e5c74e4a7a89558b7a0c3fb0d4ba379d21b0eb4b5f62f657ab60d'],
  [19, 'Go', 'classic', true, '166bd06012ef4790397f4611ad0b594349fe4f8721625680ece1b416c129ef4e'],
  [
    19,
    'Go',
    'skeuomorphic',
    false,
    '543bb77dbb0a2fe70bcf44a838a595241744e04c07b652a7945eeedab2251f65',
  ],
  [
    19,
    'Go',
    'skeuomorphic',
    true,
    '123e6e853c43198b08dab83568dbfc5d3bcc14981db1acfcc1ea2932f72deb1e',
  ],
  [
    19,
    'Gomoku',
    'classic',
    false,
    '67ed67971e6417fc0893c694e085ebda7aaf8ee916c886e0d7467ad27e21f06d',
  ],
  [
    19,
    'Gomoku',
    'classic',
    true,
    '7a5ba6769ecb09571f557332b89b58472d2ab1bde4a7cc6598707b7a8644a172',
  ],
  [
    19,
    'Gomoku',
    'skeuomorphic',
    false,
    '97784cfb1aff4591885575528d90c4fcac7023de3c5407435e13d1d545ba8af0',
  ],
  [
    19,
    'Gomoku',
    'skeuomorphic',
    true,
    '4ad44d79e595a56a5c15e59203a5cb105c0b75cc20481e382ad2b087c8973038',
  ],
];
for (const [size, gameType, stoneSkin, separatePieces, expected] of snapshots) {
  test(
    'board presentation stays identical: ' + [size, gameType, stoneSkin, separatePieces].join('/'),
    () => {
      const boardSkins: Record<StoneThemeId, BoardThemeId> = {
        classic: 'wood',
        skeuomorphic: 'realistic_wood',
      };
      const markup = renderToStaticMarkup(
        React.createElement(GameBoard, {
          board: fixtureBoard(size),
          onIntersectionClick: () => {},
          currentPlayer: 'black',
          lastMove: { x: 7, y: 7 },
          showQi: true,
          gameType,
          stoneSkin,
          separatePieces,
          showCoordinates: separatePieces,
          boardSkin: boardSkins[stoneSkin],
          showTerritory: true,
          territory: Float32Array.from({ length: size * size }, (_, i) => ((i % 5) - 2) / 2),
          extraSVG: React.createElement('circle', {
            'data-overlay': 'fixture',
            cx: 10,
            cy: 10,
            r: 2,
          }),
        })
      );
      assert.equal(createHash('sha256').update(markup).digest('hex'), expected);
    }
  );
}

test('sakura board remains available independently of the retired stone skin', () => {
  for (const size of [9, 13, 19]) {
    const markup = renderToStaticMarkup(React.createElement(GameBoard, {
      board: fixtureBoard(size), currentPlayer: 'black', lastMove: null, showQi: false,
      gameType: 'Go', stoneSkin: 'classic', boardSkin: 'sakura_wood', onIntersectionClick: () => {},
    }));
    assert.ok(markup.includes('border-color:#e4bcc7;background-color:#e4bcc7'));
    assert.ok(markup.includes('background-color:#e4bcc7;background-image:radial-gradient(circle, #dcaeb9 10%, transparent 10.5%);background-size:20px 20px;background-repeat:repeat'));
  }
});

test('board geometry retains size and coordinate margins', () => {
  assert.deepEqual(calculateBoardConstants(9), { CELL_SIZE: 40, GRID_PADDING: 20 });
  assert.deepEqual(calculateBoardConstants(13, true), { CELL_SIZE: 30, GRID_PADDING: 35 });
  assert.deepEqual(calculateBoardConstants(19, true), { CELL_SIZE: 21, GRID_PADDING: 27 });
});

test('coach foreground annotations stay above the grid without replacing legacy background overlays', () => {
  const markup = renderToStaticMarkup(React.createElement(GameBoard, {
    board: fixtureBoard(9), currentPlayer: 'black', lastMove: { x: 7, y: 7 }, showQi: false, gameType: 'Go',
    onIntersectionClick: () => {}, extraSVGLayer: 'foreground',
    extraSVG: React.createElement('g', { 'data-coach-overlay': 'numbered-points' }),
  }));
  assert.ok(markup.indexOf('data-coach-overlay') > markup.indexOf('fill="#ff4444"'),
    'grid lines and stone layers must not cover numbered teaching marks');
});

test('star-point ordering and small/even-board behavior remain unchanged', () => {
  assert.deepEqual(getStarPoints(5), []);
  assert.deepEqual(getStarPoints(8), []);
  assert.deepEqual(getStarPoints(7), [[3, 3]]);
  assert.deepEqual(getStarPoints(9), [
    [4, 4],
    [2, 2],
    [6, 2],
    [2, 6],
    [6, 6],
  ]);
  assert.deepEqual(getStarPoints(19), [
    [9, 9],
    [3, 3],
    [15, 3],
    [3, 15],
    [15, 15],
    [9, 3],
    [9, 15],
    [3, 9],
    [15, 9],
  ]);
});

function put(board: BoardState, x: number, y: number, color: Player = 'black') {
  board[y][x] = { x, y, color, id: `${x},${y}` };
}

test('qi visualization keeps two edges to a shared liberty without counting it twice in rules', () => {
  const board = createBoard(3);
  put(board, 0, 0);
  put(board, 1, 0);
  put(board, 0, 1);
  put(board, 2, 0, 'white');
  const before = structuredClone(board);
  assert.deepEqual(calculateQiFlow(board, 0, 0), [
    { x1: 0, y1: 1, x2: 1, y2: 1, key: 'qi-0,1-1,1' },
    { x1: 0, y1: 1, x2: 0, y2: 2, key: 'qi-0,1-0,2' },
    { x1: 1, y1: 0, x2: 1, y2: 1, key: 'qi-1,0-1,1' },
  ]);
  assert.equal(getGroup(board, { x: 0, y: 0 })?.liberties, 2);
  assert.deepEqual(calculateQiFlow(board, 2, 2), []);
  assert.deepEqual(board, before);
});

test('Go silk preserves diagonal eye cuts, solid bridges, and blocked jumps', () => {
  const board = createBoard(5);
  put(board, 0, 0);
  put(board, 1, 1);
  const hasDiagonal = () =>
    getBoardConnections(board, 'Go').some(
      (c) => c.type === 'loose' && c.x1 === 0 && c.y1 === 0 && c.x2 === 1 && c.y2 === 1
    );
  assert.equal(hasDiagonal(), true);
  put(board, 1, 0, 'white');
  assert.equal(hasDiagonal(), true, 'one occupied eye must not sever the diagonal silk');
  put(board, 0, 1, 'white');
  assert.equal(hasDiagonal(), false);
  board[1][0] = null;
  put(board, 1, 0);
  assert.equal(hasDiagonal(), false, 'a connected own bridge replaces the loose silk');
  assert.equal(getBoardConnections(board, 'Go').filter((c) => c.type === 'ortho').length, 2);
  board[1][1] = null;
  put(board, 2, 0);
  put(board, 1, 0, 'white');
  assert.equal(getBoardConnections(board, 'Go').length, 0);
  board[0][1] = null;
  assert.deepEqual(getBoardConnections(board, 'Go'), [
    { x1: 0, y1: 0, x2: 2, y2: 0, color: 'black', type: 'loose' },
  ]);
});

test('Gomoku links each adjacent pair once and gives each stone a happy face', () => {
  const board = createBoard(3);
  put(board, 0, 0);
  put(board, 1, 0);
  put(board, 1, 1);
  const links = getBoardConnections(board, 'Gomoku');
  assert.deepEqual(
    links.map((c) => [c.x1, c.y1, c.x2, c.y2, c.type]),
    [
      [0, 0, 1, 0, 'loose'],
      [0, 0, 1, 1, 'loose'],
      [1, 0, 1, 1, 'loose'],
    ]
  );
  const stones = board.flat().filter((stone) => stone !== null);
  const faces = getGroupFaces(getAllGroups(board), stones, 'Gomoku');
  assert.equal(faces.length, 3);
  assert.ok(
    faces.every(
      (face) =>
        face.mood === 'happy' &&
        face.scale === 1 &&
        face.lookOffset.x === 0 &&
        face.lookOffset.y === 0
    )
  );
});

test('Go faces retain the line-end anchor, stable center tie-break, and liberty mood', () => {
  const line = createBoard(5);
  put(line, 0, 1);
  put(line, 1, 1);
  put(line, 2, 1);
  const [lineFace] = getGroupFaces(getAllGroups(line), [], 'Go');
  assert.deepEqual(
    { x: lineFace.x, y: lineFace.y, scale: lineFace.scale },
    { x: 2, y: 1, scale: 1.2 }
  );
  const square = createBoard(5);
  put(square, 1, 1);
  put(square, 2, 1);
  put(square, 1, 2);
  put(square, 2, 2);
  const [squareFace] = getGroupFaces(getAllGroups(square), [], 'Go');
  assert.deepEqual(
    { x: squareFace.x, y: squareFace.y, id: squareFace.id },
    { x: 1, y: 1, id: '1,1-2,1-1,2-2,2' }
  );
  const corner = createBoard(3);
  put(corner, 0, 0);
  put(corner, 1, 0, 'white');
  const [cornerFace] = getGroupFaces(getAllGroups(corner), [], 'Go');
  assert.equal(cornerFace.mood, 'worried');
  assert.deepEqual(cornerFace.lookOffset, { x: 0, y: 1 });
});
