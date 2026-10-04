import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import React from 'react';
import { GameBoard } from '../components/GameBoard';
import { ScoreBoard } from '../components/ScoreBoard';
import { BoardStoneBody } from '../components/board/BoardStones';
import { getBoardConnections } from '../components/board/connections';
import { createBoard } from '../core/board';
import { STONE_THEMES } from '../utils/themes';
import type { BoardState, GameType, Player } from '../types';
import type { BoardGeometry } from '../components/board/types';
import type { StoneThemeId } from '../utils/themes';

Object.assign(globalThis, { require: createRequire(import.meta.url) });
const { renderToStaticMarkup } = await import('react-dom/server');

const geometry: BoardGeometry = {
  boardSize: 9, CELL_SIZE: 40, GRID_PADDING: 20, STONE_RADIUS: 18, boardPixelSize: 360,
};
const themes: StoneThemeId[] = ['classic', 'skeuomorphic'];
const colors: Player[] = ['black', 'white'];

for (const stoneSkin of themes) {
  for (const gameType of ['Go', 'Gomoku'] as const) {
    test(`${stoneSkin}/${gameType}: disabling placement animation shows faces immediately and preserves board indicators`, () => {
      const board = createBoard(9);
      board[2][2] = { x: 2, y: 2, color: 'black', id: 'first' };
      board[3][3] = { x: 3, y: 3, color: 'black', id: 'second' };
      const render = (stoneAnimationEnabled: boolean) => renderToStaticMarkup(React.createElement(GameBoard, {
        board, stoneSkin, gameType, stoneAnimationEnabled, lastMove: { x: 3, y: 3 },
        currentPlayer: 'white', showQi: true, onIntersectionClick: () => {},
      }));
      const enabled = render(true);
      const disabled = render(false);
      assert.match(enabled, /class="face-enter transition-all duration-300 ease-out"/);
      assert.doesNotMatch(disabled, /class="(?:stone-enter|face-enter)/);
      assert.doesNotMatch(disabled, /transition:transform 0\.3s ease-out/);
      assert.match(disabled, /class="animate-pulse"/, 'the last-move marker remains visible');
      assert.equal((disabled.match(/<circle\b/g) ?? []).length, (enabled.match(/<circle\b/g) ?? []).length,
        'disabling animation must preserve stones and face features');
      if (gameType === 'Go') assert.match(disabled, /<g class="animate-liquid-flow"><line\b/,
        'loose silk animation is independent of placement animation');
    });
  }
}

function squareFixture(color: Player): BoardState {
  const board = createBoard(9);
  for (const [x, y] of [[2, 2], [3, 2], [2, 3], [3, 3]]) {
    board[y][x] = { x, y, color, id: `${color}-${x}-${y}` };
  }
  return board;
}

function renderBody(board: BoardState, color: Player, stoneSkin: string,
  gameType: GameType, separatePieces: boolean) {
  return renderToStaticMarkup(React.createElement(BoardStoneBody, {
    ...geometry, boardSize: board.length, color, stoneSkin, gameType, separatePieces,
    stones: board.flat().filter(stone => stone !== null),
    connections: getBoardConnections(board, gameType), animatingStoneId: null,
  }));
}

// Read each circle's actual SVG filter ancestry, so one filter on all stones
// cannot pass merely because the expected filter ID occurs in the markup.
function circleAppearances(markup: string) {
  type FilterScope = { id: string; scope: number };
  const ancestors: { filter?: FilterScope; styleFilter?: string }[] = [];
  const circles: { radius: string; fill: string; filters: FilterScope[]; styleFilters: string[] }[] = [];
  let scope = 0;
  for (const token of markup.matchAll(/<(\/?)([\w-]+)\b([^>]*?)(\/?)>/g)) {
    if (token[1]) {
      ancestors.pop();
      continue;
    }
    const attributes = Object.fromEntries(
      [...token[3].matchAll(/([\w:-]+)="([^"]*)"/g)].map(match => [match[1], match[2]])
    );
    const filter = attributes.filter ? { id: attributes.filter, scope: scope++ } : undefined;
    const styleFilter = attributes.style?.match(/(?:^|;)filter:([^;]+)/)?.[1];
    const current = { filter, styleFilter };
    if (token[2] === 'circle') {
      circles.push({
        radius: attributes.r, fill: attributes.fill,
        filters: [...ancestors, current].flatMap(node => node.filter ? [node.filter] : []),
        styleFilters: [...ancestors, current].flatMap(node => node.styleFilter ? [node.styleFilter] : []),
      });
    }
    if (!token[4]) ancestors.push(current);
  }
  return circles;
}

function scoreBoard(stoneSkin: string) {
  return React.createElement(ScoreBoard, {
    stoneSkin, currentPlayer: 'black', blackCaptures: 3, whiteCaptures: 2,
    gameType: 'Go', isThinking: false, showWinRate: false, appMode: 'playing',
    gameOver: false, userColor: 'black', displayWinRate: 50,
  });
}

function materialAppearance(circle: ReturnType<typeof circleAppearances>[number]) {
  return {
    radius: circle.radius,
    fill: circle.fill,
    // Each SVG has private IDs, but must select the same board material.
    filters: circle.filters.map(filter => filter.id.match(/jelly-(black|white)/)?.[0] ?? filter.id),
    styleFilters: circle.styleFilters,
  };
}

for (const stoneSkin of [...themes, 'unknown-skin']) {
  test(`scoreboard/${stoneSkin}: both icons use the actual board stone material`, () => {
    const icons = circleAppearances(renderToStaticMarkup(scoreBoard(stoneSkin)));
    assert.equal(icons.length, 2, 'show one stone body for each player');
    for (const [index, color] of colors.entries()) {
      const board = createBoard(9);
      board[0][0] = { x: 0, y: 0, color, id: `${color}-single` };
      const [stone] = circleAppearances(renderBody(board, color, stoneSkin, 'Go', true));
      assert.deepEqual(materialAppearance(icons[index]), materialAppearance(stone),
        `${color} must retain the board material, including its lighting and shadow`);
    }
  });
}

test('scoreboard stone filters are self-contained and unique across multiple instances', () => {
  const markup = renderToStaticMarkup(React.createElement(React.Fragment, null,
    scoreBoard('classic'), scoreBoard('classic')));
  const svgs = [...markup.matchAll(/<svg\b[\s\S]*?<\/svg>/g)].map(match => match[0]);
  assert.equal(svgs.length, 4);
  const allIds = new Set<string>();
  for (const svg of svgs) {
    const ids = [...svg.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
    const references = [...svg.matchAll(/url\(#([^)]+)\)/g)].map(match => match[1]);
    assert.ok(references.length > 0, 'classic stones must retain their lighting filter');
    for (const reference of references) {
      assert.ok(ids.includes(reference), 'an icon must not depend on another SVG or the HTML shell');
    }
    for (const id of ids) {
      assert.ok(!allIds.has(id), `SVG definition ${id} must belong to only one instance`);
      allIds.add(id);
    }
  }
});

test('retired minimal skin is absent from the selectable stone themes', () => {
  assert.equal(Object.hasOwn(STONE_THEMES, 'minimal'), false);
  assert.deepEqual(Object.keys(STONE_THEMES).sort(), ['classic', 'skeuomorphic']);
});

for (const color of colors) {
  for (const stoneSkin of themes) {
    for (const [gameType, separatePieces] of [
      ['Go', true], ['Gomoku', false], ['Gomoku', true],
    ] as const) {
      test(`${stoneSkin}/${color}/${gameType}/${separatePieces}: independent square has no bridges or fillers`, () => {
        const markup = renderBody(squareFixture(color), color, stoneSkin, gameType, separatePieces);
        assert.doesNotMatch(markup, /<(?:line|rect)\b/,
          'adjacent stones and a 2x2 square must remain independent');
        assert.equal(circleAppearances(markup).length, 4, 'render all four stone bodies');
      });
    }
    test(`${stoneSkin}/${color}: connected Go still renders bridges and a square filler`, () => {
      const markup = renderBody(squareFixture(color), color, stoneSkin, 'Go', false);
      assert.match(markup, /<line\b/, 'connected mode must still join orthogonal neighbors');
      assert.match(markup, /<rect\b/, 'connected mode must still close the 2x2 gap');
    });
  }

  for (const [gameType, separatePieces] of [
    ['Go', true], ['Gomoku', false],
  ] as const) {
    test(`classic/${color}/${gameType}: independent stones keep the original radius, fill and lighting`, () => {
      const board = createBoard(9);
      board[2][2] = { x: 2, y: 2, color, id: `${color}-single` };
      const [connected] = circleAppearances(renderBody(board, color, 'classic', 'Go', false));
      const markup = renderBody(board, color, 'classic', gameType, separatePieces);
      const [independent] = circleAppearances(markup);
      assert.equal(independent.radius, connected.radius, 'the setting must not shrink the stone');
      assert.equal(independent.fill, connected.fill, 'the setting must not substitute a gradient');
      assert.equal(independent.radius, '18');
      assert.equal(independent.fill, color === 'black' ? '#2a2a2a' : '#f0f0f0');
      assert.deepEqual(independent.filters.map(filter => filter.id), [`url(#jelly-${color})`]);
      assert.deepEqual(independent.filters.map(filter => filter.id), connected.filters.map(filter => filter.id));
      assert.doesNotMatch(markup, /(?:grad|jelly)-separate-/);
    });
    test(`classic/${color}/${gameType}: each independent stone owns its filter scope`, () => {
      const markup = renderBody(squareFixture(color), color, 'classic', gameType, separatePieces);
      const circles = circleAppearances(markup);
      assert.equal(circles.length, 4);
      for (const circle of circles) {
        assert.deepEqual(circle.filters.map(filter => filter.id), [`url(#jelly-${color})`]);
      }
      assert.equal(new Set(circles.map(circle => circle.filters[0].scope)).size, 4,
        'a shared goo filter would merge the neighboring stones again');
    });
  }
}

for (const stoneSkin of themes) {
  test(`${stoneSkin}: GameBoard suppresses Go silk in independent mode and retains it in connected mode`, () => {
    const board = createBoard(9);
    for (const [x, y, color] of [[1, 1, 'black'], [2, 2, 'black'], [5, 5, 'white'], [6, 6, 'white']] as const) {
      board[y][x] = { x, y, color, id: `${color}-${x}-${y}` };
    }
    assert.equal(getBoardConnections(board, 'Go').filter(link => link.type === 'loose').length, 2);
    const render = (separatePieces: boolean, gameType: GameType = 'Go') => renderToStaticMarkup(
      React.createElement(GameBoard, {
        board, currentPlayer: 'black', lastMove: null, showQi: false,
        stoneSkin, gameType, separatePieces, onIntersectionClick: () => {},
      })
    );
    assert.match(render(false), /<g class="animate-liquid-flow"><line\b/);
    assert.doesNotMatch(render(true), /<g class="animate-liquid-flow"><line\b/,
      'independent Go stones must not retain their diagonal silk');
    assert.doesNotMatch(render(false, 'Gomoku'), /<g class="animate-liquid-flow"><line\b/);
  });
}
