import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { loadTestModule } from './helpers/loadTestModule.mjs';

const read = (name) => readFile(new URL(`../third_party/ogs-learning/${name}`, import.meta.url), 'utf8');
const catalog = JSON.parse(await read('catalog.json'));
const inventory = JSON.parse(await read('inventory.json'));
const english = JSON.parse(await read('english.json'));
const chinese = JSON.parse(await read('zh-CN.json'));
const runtime = JSON.parse(await readFile(new URL('../domains/coach/sourceData/ogs.json', import.meta.url), 'utf8'));
const OGS_COMMIT = '8baf0345423d20d8f0ca18059e464c1e89862a40';
const lessons = catalog.sections.flatMap((section) => section.lessons);
const pages = lessons.flatMap((lesson) => lesson.pages);
const { inspectMove, getBoardHash, getAllGroups } = await loadTestModule({ contents: `
  export { inspectMove } from './core/go/rules';
  export { getBoardHash, getAllGroups } from './core/board';
` });

function boardFor(page) {
  const { width, height } = page.position;
  const board = Array.from({ length: height }, () => Array(width).fill(null));
  for (const color of ['black', 'white']) for (const { x, y } of page.position[color]) {
    assert.equal(board[y][x], null, `${page.id}: overlapping initial stones`);
    board[y][x] = { color, x, y, id: `${color}-${x}-${y}` };
  }
  return board;
}

test('selection preserves official stage and lesson order with all foundation pages', () => {
  assert.equal(catalog.source.commit, '8baf0345423d20d8f0ca18059e464c1e89862a40');
  assert.equal(catalog.source.commit, OGS_COMMIT);
  assert.equal(inventory.length, 248, 'unregistered files do not inflate the curriculum');
  assert.equal(inventory.reduce((n, lesson) => n + lesson.pages, 0), 3551);
  assert.deepEqual(lessons.map((lesson) => lesson.className), [
    'Intro', 'SelfCapture', 'Eyes', 'Ko', 'Territory', 'EndingTheGame', 'TheBoard',
    'CountLiberties', 'CountChains', 'InAtari', 'CaptureStone', 'CaptureChain',
    'Escape', 'Connect', 'Cut', 'RealFalseEye', 'TwoEyes', 'AtariCorrectSide',
    'PlayDoubleAtari', 'Ladder', 'Snapback', 'Net', 'CountTerritory', 'CloseTerritory', 'CapturingRace',
  ]);
  assert.equal(pages.length, 98);
  assert.equal(new Set(pages.map((page) => page.id)).size, pages.length);
  assert.deepEqual(catalog.sections[0].lessons.map((lesson) => lesson.pages.length), [6, 3, 4, 5, 12, 3, 3]);
  for (const lesson of lessons) {
    assert.equal(lesson.pages[0].pageIndex, 0, 'keep the original explanation page');
    assert.deepEqual(lesson.pages.map((page) => page.pageIndex), lesson.pages.map((page) => page.pageIndex).toSorted((a, b) => a - b));
  }
});

test('human and SGF coordinates normalize without flipping or mixing origins', () => {
  const first = pages.find((page) => page.id === 'ogs-rules-intro-page1');
  const normalized = (page, raw) => page.answer.correct[page.answer.rawCorrect.indexOf(raw)];
  assert.deepEqual(normalized(first, 'a1'), [{ x: 0, y: 8 }]);
  assert.deepEqual(normalized(first, 'j9'), [{ x: 8, y: 0 }]);
  const star = pages.find((page) => page.id === 'ogs-the-board-page3');
  assert.deepEqual(normalized(star, 'd16'), [{ x: 3, y: 3 }]);
  assert.deepEqual(normalized(star, 'k10'), [{ x: 9, y: 9 }]);
  assert.deepEqual(normalized(star, 'q4'), [{ x: 15, y: 15 }]);
  const selfCapture = pages.find((page) => page.id === 'ogs-self-capture-page01');
  assert.deepEqual(normalized(selfCapture, 'ef'), [{ x: 4, y: 5 }]);
  assert.equal(first.answer.correct.length, 81);
  assert.equal(new Set(first.answer.correct.map(([point]) => `${point.x},${point.y}`)).size, 81);
});

test('all selected authored correct continuations replay through the actual Go rules', () => {
  let paths = 0;
  for (const page of pages) {
    const initial = boardFor(page);
    if (page.answer.kind !== 'move-tree') continue;
    assert.ok(page.answer.correct.length > 0, page.id);
    for (const group of getAllGroups(initial)) assert.ok(group.liberties > 0, `${page.id}: impossible initial chain`);
    for (const line of page.answer.correct) {
      let board = initial;
      let previousHash = null;
      let color = page.position.initialPlayer;
      assert.ok(line.length > 0, `${page.id}: empty success path`);
      for (const point of line) {
        if (point.x < 0 && point.y < 0) {
          previousHash = getBoardHash(board);
        } else {
          const move = inspectMove(board, point.x, point.y, color, 'Go', previousHash);
          assert.equal(move.legal, true, `${page.id} ${JSON.stringify(point)} ${move.reason ?? ''}`);
          previousHash = getBoardHash(board);
          board = move.result.newBoard;
        }
        color = color === 'black' ? 'white' : 'black';
      }
      paths += 1;
    }
  }
  assert.ok(paths > 200, 'includes all authored alternatives, not just the first line');
});

test('end-game overrides stay actions/removal and never turn dummy b6 into a solution', () => {
  const ending = lessons.find((lesson) => lesson.className === 'EndingTheGame');
  const [pass, remove, finish] = ending.pages;
  assert.equal(pass.answer.kind, 'action');
  assert.equal(pass.answer.action, 'pass');
  assert.equal(finish.answer.kind, 'action');
  assert.equal(finish.answer.action, 'finish');
  assert.equal(remove.answer.kind, 'remove-stones');
  assert.deepEqual(remove.answer.points, [{ x: 5, y: 0 }, { x: 5, y: 1 }, { x: 6, y: 1 }, { x: 7, y: 1 }]);
  assert.equal(remove.config.phase, 'stone removal');
  assert.equal(pass.answer.correct, undefined);
  assert.equal(finish.answer.correct, undefined);
  for (const point of remove.answer.points) assert.equal(boardFor(remove)[point.y][point.x].color, 'black');
});

test('choice answers and complete Chinese text keep original ids, choices and provenance', async () => {
  assert.deepEqual(Object.keys(chinese).sort(), Object.keys(english).sort());
  for (const [key, value] of Object.entries(english)) {
    if (Array.isArray(value)) assert.equal(chinese[key].length, value.length, key);
    else assert.equal(typeof chinese[key], 'string', key);
    if (value.length > 0) assert.ok(chinese[key].length > 0, key);
  }
  for (const page of pages) {
    assert.equal(page.source.commit, OGS_COMMIT);
    assert.match(page.source.url, /github\.com\/online-go\/online-go\.com\/blob\/8baf.*#L\d+$/);
    const original = await read(`upstream/${page.source.path}.txt`);
    assert.ok(original.includes(`class ${page.pageClass} extends LearningPage`), page.id);
    if (page.answer.kind === 'choice') {
      for (const value of page.answer.correct) assert.ok(page.answer.options.includes(value), page.id);
      for (const value of page.answer.options) assert.ok(page.answer.labelsEn[value], page.id);
    }
    if (page.answer.kind === 'move-tree') {
      for (const line of [...page.answer.rawCorrect, ...page.answer.rawWrong]) assert.ok(original.includes(`"${line}"`), `${page.id}: invented answer`);
    }
  }
  assert.equal(await read('LICENSE'), await read('upstream/LICENSE'));
  for (const section of runtime.sections) for (const lesson of section.lessons) {
    assert.equal(lesson.title, chinese[`${lesson.id}.title`]);
    for (const page of lesson.pages) {
      assert.deepEqual(page.text, chinese[`${page.id}.text`], 'runtime translation must be regenerated');
      for (const option of page.answer.options ?? []) assert.equal(option.label, chinese[`${page.id}.option.${option.id}`]);
    }
  }
});
