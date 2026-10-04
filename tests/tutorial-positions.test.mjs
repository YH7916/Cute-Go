import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTestModule } from './helpers/loadTestModule.mjs';

const { TUTORIAL_STEPS, initTutorialStep, getTutorialHighlight, playTutorialPoint, passTutorialTurn,
  countTutorialTerritory, inspectMove, getGroup, getAllGroups, getNeighbors, getBoardHash, calculateTerritory } = await loadTestModule({ contents: `
  export { TUTORIAL_STEPS, initTutorialStep, getTutorialHighlight, playTutorialPoint, passTutorialTurn,
    countTutorialTerritory } from './domains/coach/beginnerTutorial';
  export { inspectMove } from './core/go/rules';
  export { getGroup, getAllGroups, getNeighbors, getBoardHash } from './core/board';
  export { calculateTerritory } from './core/go/scoring';
` });

const start = type => initTutorialStep(TUTORIAL_STEPS.findIndex(item => item.puzzleType === type));
const playTarget = session => playTutorialPoint(session, getTutorialHighlight(session)).session;

test('the tutorial forbidden point is actually suicide for the black player shown on its board', () => {
  const session = start('forbidden');
  const { position: { board } } = session;
  const before = JSON.stringify(board);
  const target = getTutorialHighlight(session);
  assert.ok(target);
  assert.deepEqual(inspectMove(board, target.x, target.y, 'black'), { legal: false, reason: 'suicide' });
  assert.equal(JSON.stringify(board), before);
  const rejected = playTarget(session);
  assert.equal(rejected.isCompleted, true);
  assert.deepEqual(rejected.position, session.position);
});

test('the tutorial eye move leaves two independent eyes enclosed by one connected black chain', () => {
  const session = start('eyes');
  const { position: { board } } = session;
  const before = JSON.stringify(board);
  const target = getTutorialHighlight(session);
  assert.deepEqual({ x: target.x, y: target.y }, { x: 3, y: 3 });
  assert.equal(inspectMove(board, 3, 2, 'white').legal, true, 'the initial connected eye space is still open to a white play');
  const move = inspectMove(board, target.x, target.y, 'black');
  assert.equal(move.legal, true);
  assert.equal(move.result.captured, 0);
  const after = move.result.newBoard;
  const group = getGroup(after, target);
  assert.equal(group.stones.length, after.flat().filter(stone => stone?.color === 'black').length,
    'all parts of the eye boundary must belong to the same black chain');
  const eyes = [{ x: 3, y: 2 }, { x: 3, y: 4 }];
  for (const eye of eyes) {
    assert.equal(after[eye.y][eye.x], null);
    assert.ok(getNeighbors(eye, after.length).every(point => group.stones.some(stone => stone.x === point.x && stone.y === point.y)));
    assert.deepEqual(inspectMove(after, eye.x, eye.y, 'white'), { legal: false, reason: 'suicide' });
  }
  assert.ok(!getNeighbors(eyes[0], after.length).some(point => point.x === eyes[1].x && point.y === eyes[1].y));
  assert.equal(JSON.stringify(board), before);
  const completed = playTarget(session);
  assert.equal(completed.isCompleted, true);
  assert.equal(completed.position.history.length, 1);
  assert.equal(completed.position.currentPlayer, 'white');
});

test('all beginner starting chains have liberties and matching board coordinates', () => {
  for (const [index, step] of TUTORIAL_STEPS.entries()) {
    const { position } = initTutorialStep(index);
    assert.equal(position.board.length, step.boardSize);
    for (const group of getAllGroups(position.board)) assert.ok(group.liberties > 0, step.id);
    position.board.forEach((row, y) => row.forEach((stone, x) => {
      if (stone) assert.deepEqual({ x: stone.x, y: stone.y }, { x, y });
    }));
  }
});

test('single and whole-chain captures preserve real capture counts and predecessor history', () => {
  for (const [type, expected] of [['capture', 1], ['capture_group', 2]]) {
    const session = start(type);
    const before = structuredClone(session.position);
    const result = playTarget(session);
    assert.equal(result.isCompleted, true);
    assert.equal(result.position.blackCaptures, expected);
    assert.equal(result.position.whiteCaptures, 0);
    assert.equal(result.position.board.flat().filter(stone => stone?.color === 'white').length, 0);
    assert.equal(result.position.history.length, 1);
    assert.deepEqual(result.position.history[0].board, before.board);
    assert.equal(result.position.currentPlayer, 'white');
    assert.deepEqual(session.position, before);
  }
});

test('escape increases actual liberties and connecting joins both original stones', () => {
  const escape = start('atari_escape');
  assert.equal(getGroup(escape.position.board, { x: 2, y: 2 }).liberties, 1);
  const escaped = playTarget(escape);
  assert.equal(getGroup(escaped.position.board, { x: 2, y: 2 }).liberties, 3);
  assert.match(escaped.feedback, /3 口气/);
  const connection = start('connect_cut');
  assert.equal(getAllGroups(connection.position.board).length, 2);
  const connected = playTarget(connection);
  assert.equal(getAllGroups(connected.position.board).length, 1);
  assert.equal(getGroup(connected.position.board, { x: 2, y: 2 }).stones.length, 3);
  const cut = inspectMove(connection.position.board, 2, 2, 'white');
  assert.equal(cut.legal, true);
  assert.equal(getGroup(cut.result.newBoard, { x: 1, y: 2 }).stones.length, 1);
  assert.equal(getGroup(cut.result.newBoard, { x: 3, y: 2 }).stones.length, 1);
});

test('ko captures then rejects White immediate recapture using its actual predecessor', () => {
  const before = start('ko');
  const captured = playTarget(before);
  assert.equal(captured.isCompleted, false);
  assert.equal(captured.position.blackCaptures, 1);
  assert.equal(captured.position.currentPlayer, 'white');
  const target = getTutorialHighlight(captured);
  const withoutHistory = inspectMove(captured.position.board, target.x, target.y, 'white');
  assert.equal(withoutHistory.legal, true);
  assert.equal(getBoardHash(withoutHistory.result.newBoard), getBoardHash(before.position.board));
  assert.deepEqual(inspectMove(captured.position.board, target.x, target.y, 'white', 'Go',
    getBoardHash(captured.position.history[0].board)), { legal: false, reason: 'ko' });
  const rejected = playTarget(captured);
  assert.equal(rejected.isCompleted, true);
  assert.deepEqual(rejected.position, captured.position);
});

test('the opening only accepts the highlighted corner and alternates a legal white reply', () => {
  const initial = start('final_shape');
  assert.deepEqual(playTutorialPoint(initial, { x: 6, y: 6 }).session.position, initial.position);
  const first = playTarget(initial);
  assert.equal(first.position.board[2][2].color, 'black');
  assert.equal(first.position.board[6][6].color, 'white');
  assert.equal(first.position.currentPlayer, 'black');
  assert.equal(first.position.history.length, 2);
  assert.deepEqual({ x: getTutorialHighlight(first).x, y: getTutorialHighlight(first).y }, { x: 4, y: 3 });
  const complete = playTarget(first);
  assert.equal(complete.isCompleted, true);
  assert.equal(complete.position.history.length, 3);
  assert.equal(complete.position.board[3][4].color, 'black');
  assert.equal(complete.position.currentPlayer, 'white');
});

test('final diagram has two connected chains with two eye spaces each and no neutral points', () => {
  const { position: { board } } = start('territory');
  assert.equal(getAllGroups(board).length, 2);
  const territory = calculateTerritory(board);
  assert.equal(territory.black.length, 32);
  assert.equal(territory.white.length, 24);
  assert.equal(territory.black.length + territory.white.length, board.flat().filter(stone => !stone).length);
  for (const color of ['black', 'white']) {
    const remaining = new Set(territory[color].map(point => `${point.x},${point.y}`));
    let eyes = 0;
    while (remaining.size) {
      const [x, y] = [...remaining][0].split(',').map(Number);
      const queue = [{ x, y }];
      remaining.delete(`${x},${y}`);
      eyes++;
      while (queue.length) {
        for (const point of getNeighbors(queue.pop(), board.length)) {
          if (remaining.delete(`${point.x},${point.y}`)) queue.push(point);
        }
      }
    }
    assert.equal(eyes, 2, `${color} must have two independent eye spaces`);
  }
});

test('endgame records both passes and uses the real territory and shared 9x9 komi', () => {
  const initial = start('endgame');
  const passed = passTutorialTurn(initial).session;
  assert.equal(passed.position.consecutivePasses, 2);
  assert.equal(passed.position.history.length, 2);
  assert.ok(passed.position.history.every(item => item.move === null));
  assert.deepEqual(passed.position.board, initial.position.board);
  const counted = countTutorialTerritory(start('territory')).session;
  assert.deepEqual(counted.territory, calculateTerritory(counted.position.board));
  assert.match(counted.feedback, /黑棋围住 32 个空点，白棋围住 24 个空点/);
  assert.match(counted.feedback, /白贴 3.5 目/);
  assert.match(counted.feedback, /黑 32 目，白 27.5 目，黑胜 4.5 目/);
});
