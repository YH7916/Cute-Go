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

// Complete DOM/SVG snapshots cover skin material, separation and shared group moods.
// Updated after verifying that all 24 outputs changed only from point lights to
// fixed direction lights; drawing nodes and other material parameters are unchanged.
const snapshots: [number, GameType, StoneThemeId, boolean, string][] = [
  [9, 'Go', 'classic', false, '1da691aef56490b8d5ac7f2022b8e4a01f2def417b5ffa4189581e839bfded6b'],
  [9, 'Go', 'classic', true, '1145cf04b9344b6eea66e257f7c0e0d764853bbc953fb9938c8ca0db34305e91'],
  [
    9,
    'Go',
    'skeuomorphic',
    false,
    '9899c9684d5310050857ca4880a09b95b2f3c8a2a0eaab8ade3b2f4e22780798',
  ],
  [
    9,
    'Go',
    'skeuomorphic',
    true,
    '2ea48ba1cb20c3f34c9e59621a90bea63a45c2cd0f78d5dc6f38a6bb0c2a8288',
  ],
  [
    9,
    'Gomoku',
    'classic',
    false,
    '088acd516d21bcad78c1e32f11ccba5f903dd33fc977fc0361fcdf0807754548',
  ],
  [
    9,
    'Gomoku',
    'classic',
    true,
    'f5231d3463ed7ebf4ffae0b618809052ff11ba6b21b2dae2354eb274ba74f9e7',
  ],
  [
    9,
    'Gomoku',
    'skeuomorphic',
    false,
    '5b0824c313b3068fcc61bf411c9175a7273adc41ad501624766a0ea6695e92b1',
  ],
  [
    9,
    'Gomoku',
    'skeuomorphic',
    true,
    '1b6f6433097e85947536dd72f38514a1cdf8867b184b0eb670a5f47662fe3601',
  ],
  [13, 'Go', 'classic', false, '1f388691161c3a4744446c5db98f48eaacc5aff76a73c3ab5e2d758dc8d38fb1'],
  [13, 'Go', 'classic', true, '45bfa48b6699fc37719987eaeb304cec64fc01d9311b3ffd140e7842235687ad'],
  [
    13,
    'Go',
    'skeuomorphic',
    false,
    '144731d75896b3a25e5ae295a3b783ee5dbed270fe8f4263e43af9cfda353b65',
  ],
  [
    13,
    'Go',
    'skeuomorphic',
    true,
    '9181c14b12ecef4c89123456b2012924169236a1d97f24fe9f2826100a656e7c',
  ],
  [
    13,
    'Gomoku',
    'classic',
    false,
    'cf18ff602cb96afe0eebe85982b2770a588cb65dba860ec50bef9efd5bc936df',
  ],
  [
    13,
    'Gomoku',
    'classic',
    true,
    '7f7704cf0cb0e9e822bc9564c952c05b92c5a46b4cbdf7ae2c85169fedbdd68f',
  ],
  [
    13,
    'Gomoku',
    'skeuomorphic',
    false,
    '21dad6e8ccecc86a4f0e60a33c8657694c3738e947fcbd4bfaf20ab600e64936',
  ],
  [
    13,
    'Gomoku',
    'skeuomorphic',
    true,
    '17d164c934fa4a47819e65d0b87f5df4c331bca07982c66377fc400f524e9f03',
  ],
  [19, 'Go', 'classic', false, '3e979de88b7a0df9b970dbbc48baafae6ee87e30a6cbf8a0795ed9786d155129'],
  [19, 'Go', 'classic', true, '62893c012d270dd40a28001929d435209f578b0f584f5d80d25ab06ef38d7f0f'],
  [
    19,
    'Go',
    'skeuomorphic',
    false,
    '5d1fe441bc67b9090fd8419f8cfdd73f1474e8069592d7c2c64b1a16228b58f6',
  ],
  [
    19,
    'Go',
    'skeuomorphic',
    true,
    'c7988bbe7a5d6dcc3360ac080f166eccd5f99ddf341ec4f57043dfc2d4362ea3',
  ],
  [
    19,
    'Gomoku',
    'classic',
    false,
    '17a4226d22c5f855408f3c8f0b7bdbce177edbce27a969a03d8361271f32b081',
  ],
  [
    19,
    'Gomoku',
    'classic',
    true,
    '873e046b3d5afcb50d760616329dabfb87d50ed71cfd1bb7f86a218faf3b7ad5',
  ],
  [
    19,
    'Gomoku',
    'skeuomorphic',
    false,
    'b454702e722e25047a2c3743ef6608ff2fb3bf4aca38ba4e7af8d361325a3d11',
  ],
  [
    19,
    'Gomoku',
    'skeuomorphic',
    true,
    '6239cd6514decdee8b5b14cfd0cf17890d37f7297dd0e01b26227b1e693f9b83',
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
    { x: lineFace.x, y: lineFace.y },
    { x: 2, y: 1 }
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
