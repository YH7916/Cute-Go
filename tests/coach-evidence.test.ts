import assert from 'node:assert/strict';
import test from 'node:test';
import { attemptMove } from '../core/go/rules';
import { getBoardHash, getGroup } from '../core/board';
import { buildCoachEvidence, coachPositionKey, getLocalCoachMessage, shouldExplainCoachPosition } from '../domains/coach/evidence';
import { createInitialPosition, recordMove, recordPass, undoPosition, type GamePosition } from '../domains/game/positionState';
import type { Player } from '../types';

function put(position: GamePosition, color: Player, x: number, y: number) {
  position.board[y][x] = { color, x, y, id: `${color}-${x}-${y}` };
}
function play(position: GamePosition, x: number, y: number) {
  const before = position.history[position.history.length - 1];
  const moved = attemptMove(position.board, x, y, position.currentPlayer, 'Go', before ? getBoardHash(before.board) : null);
  assert.ok(moved, 'fixture move must be legal under the real rules');
  return recordMove(position, moved.newBoard, { x, y }, moved.captured, false);
}
function threatened(color: Player = 'black') {
  const position = createInitialPosition(5);
  position.currentPlayer = color;
  const opponent = color === 'black' ? 'white' : 'black';
  put(position, color, 1, 1);
  for (const [x, y] of [[0, 1], [1, 0], [2, 1]]) put(position, opponent, x, y);
  return position;
}
function concise(message: string) {
  assert.ok(message.length <= 80, `teaching must fit 80 characters: ${message}`);
  assert.ok(message.split(/[。！？]/).filter(Boolean).length <= 2, 'one or two teaching sentences');
  assert.doesNotMatch(message, /轮到|全局第|提走.*\d+ 颗|从 \d+ 口减到 \d+ 口/);
}

test('coordinates match the board labels, skip I, and never rotate for the white player', () => {
  const position = createInitialPosition(9);
  put(position, 'black', 0, 0);
  put(position, 'white', 8, 8);
  for (const userColor of ['black', 'white'] as const) {
    const evidence = buildCoachEvidence(position, userColor, 3.5);
    assert.deepEqual(evidence.stones, [
      { color: 'black', point: { x: 0, y: 0, label: 'A9' } },
      { color: 'white', point: { x: 8, y: 8, label: 'J1' } },
    ]);
    assert.equal(evidence.userColor, userColor);
    assert.equal(evidence.toPlay, 'black');
    assert.equal(evidence.komi, 3.5);
    assert.deepEqual(JSON.parse(JSON.stringify(evidence)), evidence);
  }
});

test('C7 then A5 keeps precise evidence but teaches the edge without narrating the move log', () => {
  const position = play(play(createInitialPosition(9), 2, 2), 0, 4);
  const before = structuredClone(position);
  const evidence = buildCoachEvidence(position, 'black', 3.5);
  assert.equal(evidence.moveNumber, 2);
  assert.match(evidence.moveNumberMeaning, /全局.*双方.*停着/);
  const action = evidence.lastAction;
  assert.equal(action.kind, 'move');
  if (action.kind !== 'move') throw new Error('move evidence expected');
  assert.equal(action.color, 'white');
  assert.equal(action.point.label, 'A5');
  assert.equal(action.globalMoveNumber, 2);
  assert.equal(action.location, '左边线正中（左起第 1 列，上起第 5 行）');
  assert.equal(action.libertiesAfter, 3);
  const message = getLocalCoachMessage(evidence, 'explain-last-move');
  concise(message);
  assert.match(message, /边.*气|气.*边/);
  assert.doesNotMatch(message, /全局第|左起第|上起第|这一手没有提子|左上角|白棋第 2/);
  assert.deepEqual(position, before);
});

for (const size of [9, 13, 19]) {
  test(`${size}: exact corner, edge and center descriptions do not rotate for either player`, () => {
    const middle = (size - 1) / 2;
    const cases: [number, number, string][] = [
      [0, 0, '左上角'], [size - 1, size - 1, '右下角'],
      [0, middle, '左边线正中'], [size - 1, middle, '右边线正中'],
      [middle, 0, '上边线正中'], [middle, size - 1, '下边线正中'],
      [middle, middle, '棋盘正中心'], [2, 2, '棋盘内部'],
    ];
    for (const [x, y, area] of cases) {
      const position = play(createInitialPosition(size), x, y);
      for (const userColor of ['black', 'white'] as const) {
        const action = buildCoachEvidence(position, userColor, 7.5).lastAction;
        if (action.kind !== 'move') throw new Error('move evidence expected');
        assert.equal(action.location, `${area}（左起第 ${x + 1} 列，上起第 ${y + 1} 行）`);
      }
    }
  });
}

for (const color of ['black', 'white'] as const) {
  test(`${color}: atari and escape are verified from the resulting group, without changing the input`, () => {
    const position = threatened(color);
    const before = structuredClone(position);
    const evidence = buildCoachEvidence(position, color, 7.5);
    const group = evidence.atariGroups.find(item => item.color === color);
    assert.deepEqual(group?.stones, [{ x: 1, y: 1, label: 'B4' }]);
    assert.deepEqual(group?.liberties, [{ x: 1, y: 2, label: 'B3' }]);
    const rescue = evidence.candidates.find(item => item.reasons.includes('escape-atari'));
    assert.ok(rescue);
    assert.deepEqual(rescue.point, { x: 1, y: 2, label: 'B3' });
    assert.equal(rescue.savedStones, 1);
    assert.equal(rescue.libertiesAfter, 3);
    assert.match(getLocalCoachMessage(evidence, 'hint'), /B3/);
    assert.deepEqual(position, before);
    assert.notEqual(evidence.stones[0].point, position.board[0][1]);
  });

  test(`${color}: last-move capture is confirmed by legal history replay and prisoner counts`, () => {
    const opponent = color === 'black' ? 'white' : 'black';
    const before = threatened(opponent);
    before.currentPlayer = color;
    const captureHint = buildCoachEvidence(before, color, 7.5).candidates.find(candidate => candidate.point.x === 1 && candidate.point.y === 2);
    assert.equal(captureHint?.capturedStones, 1);
    assert.ok(captureHint?.reasons.includes('capture'));
    const position = play(before, 1, 2);
    const evidence = buildCoachEvidence(position, color, 7.5);
    assert.equal(evidence.lastAction.kind, 'move');
    if (evidence.lastAction.kind !== 'move') throw new Error('move evidence expected');
    assert.equal(evidence.lastAction.color, color);
    assert.deepEqual(evidence.lastAction.captured, [{ x: 1, y: 1, label: 'B4' }]);
    assert.equal(evidence.captures[color], 1);
    const message = getLocalCoachMessage(evidence, 'explain-last-move');
    concise(message);
    assert.match(message, /最后一口气/);
    assert.match(message, /提走|吃掉/);
    const corrupt = { ...position, blackCaptures: position.blackCaptures + 1 };
    assert.equal(buildCoachEvidence(corrupt, color, 7.5).lastAction.kind, 'unverified');
  });
}

test('a legal extension that remains in atari is not described as a rescue', () => {
  const position = threatened();
  put(position, 'white', 2, 2);
  put(position, 'white', 1, 3);
  const moved = attemptMove(position.board, 1, 2, 'black');
  assert.ok(moved);
  assert.equal(getGroup(moved.newBoard, { x: 1, y: 1 })?.liberties, 1);
  const evidence = buildCoachEvidence(position, 'black', 7.5);
  assert.equal(evidence.candidates.some(item => item.point.x === 1 && item.point.y === 2), false);
  const message = getLocalCoachMessage(evidence, 'hint');
  concise(message);
  assert.match(message, /不能.*无解|不等于.*无法救/);
  assert.equal(shouldExplainCoachPosition(buildCoachEvidence(play(position, 1, 2), 'black', 7.5)), false,
    'an extension that remains in an existing atari must not repeat the warning');
});

for (const color of ['black', 'white'] as const) {
  test(`${color}: local teaching explains escaping atari through the actual extra liberties`, () => {
    const position = play(threatened(color), 1, 2);
    const message = getLocalCoachMessage(buildCoachEvidence(position, color, 7.5), 'explain-last-move');
    concise(message);
    assert.match(message, /多.*出口/);
    assert.match(message, /不等于.*活|不代表.*活/);
    assert.doesNotMatch(message, /已经安全|救活了|全局第|左起第/);
  });

  test(`${color}: local teaching explains a new atari and where the remaining breath is`, () => {
    const position = createInitialPosition(5);
    position.currentPlayer = color;
    const opponent = color === 'black' ? 'white' : 'black';
    put(position, opponent, 1, 1);
    put(position, color, 0, 1);
    put(position, color, 1, 0);
    const message = getLocalCoachMessage(buildCoachEvidence(play(position, 2, 1), color, 7.5), 'explain-last-move');
    assert.match(message, /只剩一口气/);
    assert.match(message, /打吃/);
    assert.match(message, /B3/);
    assert.doesNotMatch(message, /已经吃掉|已经安全/);
  });
}

test('local teaching prioritizes the newly placed group in atari over vague encouragement', () => {
  const position = createInitialPosition(5);
  for (const [x, y] of [[0, 1], [1, 0], [2, 1]]) put(position, 'white', x, y);
  const message = getLocalCoachMessage(buildCoachEvidence(play(position, 1, 1), 'black', 7.5), 'explain-last-move');
  assert.match(message, /黑棋.*只剩一口气/);
  assert.match(message, /B3/);
  assert.match(message, /提走|吃掉/);
  assert.doesNotMatch(message, /安全|成功|好棋/);
});

for (const userColor of ['black', 'white'] as const) {
  test(`${userColor}: a self-atari explanation teaches saving only the user's own stones`, () => {
    const opponent = userColor === 'black' ? 'white' : 'black';
    for (const mover of [userColor, opponent] as const) {
      const position = createInitialPosition(5);
      position.currentPlayer = mover;
      const surrounding = mover === 'black' ? 'white' : 'black';
      for (const [x, y] of [[0, 1], [1, 0], [2, 1]]) put(position, surrounding, x, y);
      const evidence = buildCoachEvidence(play(position, 1, 1), userColor, 7.5);
      const message = getLocalCoachMessage(evidence, 'explain-last-move');
      concise(message);
      assert.match(message, /只剩一口气.*B3/);
      assert.equal(shouldExplainCoachPosition(evidence), true);
      if (mover === userColor) {
        assert.match(message, /你的棋/);
        assert.match(message, /对手.*合法.*提走|对手.*合法.*吃掉/);
        assert.doesNotMatch(message, /先检查.*接长|先.*解围/);
        assert.doesNotMatch(message, /对手的棋/);
      } else {
        assert.match(message, /对手的棋.*合法吃掉/);
        assert.doesNotMatch(message, /检查能否接长|你的棋.*解围/);
      }
    }
  });

  test(`${userColor}: a newly threatened group is described from the learner's color`, () => {
    const opponent = userColor === 'black' ? 'white' : 'black';
    for (const target of [userColor, opponent] as const) {
      const position = createInitialPosition(5);
      position.currentPlayer = target === 'black' ? 'white' : 'black';
      put(position, target, 1, 1);
      put(position, position.currentPlayer, 0, 1);
      put(position, position.currentPlayer, 1, 0);
      const evidence = buildCoachEvidence(play(position, 2, 1), userColor, 7.5);
      const message = getLocalCoachMessage(evidence, 'explain-last-move');
      concise(message);
      assert.match(message, /打吃.*B3/);
      assert.equal(shouldExplainCoachPosition(evidence), true);
      if (target === userColor) {
        assert.match(message, /你的棋.*接长.*解围/);
        assert.doesNotMatch(message, /对方可能从这里|对手的棋/);
      } else {
        assert.match(message, /对手的棋.*观察它/);
        assert.doesNotMatch(message, /你的棋|检查能否接长/);
      }
    }
  });
}

test('local teaching distinguishes connecting separate groups from diagonal proximity', () => {
  const position = createInitialPosition(5);
  put(position, 'black', 1, 2);
  put(position, 'black', 3, 2);
  const joined = getLocalCoachMessage(buildCoachEvidence(play(position, 2, 2), 'black', 7.5), 'explain-last-move');
  concise(joined);
  assert.match(joined, /连成一块/);
  assert.match(joined, /共用.*气/);
  const diagonal = createInitialPosition(5);
  put(diagonal, 'black', 1, 1);
  const separate = getLocalCoachMessage(buildCoachEvidence(play(diagonal, 2, 2), 'black', 7.5), 'explain-last-move');
  assert.doesNotMatch(separate, /连成一块|接长|围住了|扩大地盘/);
});

test('filling an own liberty explains why the group loses breath without inventing a strategic goal', () => {
  const position = createInitialPosition(5);
  for (const [x, y] of [[1, 1], [2, 1], [3, 1], [1, 2], [3, 2], [1, 3], [2, 3], [3, 3]]) put(position, 'black', x, y);
  const message = getLocalCoachMessage(buildCoachEvidence(play(position, 2, 2), 'black', 7.5), 'explain-last-move');
  assert.match(message, /占掉.*气|填.*气/);
  assert.match(message, /减少|变少|少了/);
  assert.doesNotMatch(message, /好棋|已经安全|扩大地盘/);
});

test('a suicide extension is excluded by the existing rules', () => {
  const position = threatened();
  for (const [x, y] of [[0, 2], [2, 2], [1, 3]]) put(position, 'white', x, y);
  assert.equal(attemptMove(position.board, 1, 2, 'black'), null);
  assert.equal(buildCoachEvidence(position, 'black', 7.5).candidates.some(item => item.point.x === 1 && item.point.y === 2), false);
});

test('immediate ko recapture is not offered as a capture or rescue', () => {
  const before = createInitialPosition(5);
  for (const [x, y] of [[0, 1], [1, 0], [1, 2]]) put(before, 'black', x, y);
  for (const [x, y] of [[1, 1], [2, 0], [3, 1], [2, 2]]) put(before, 'white', x, y);
  const position = play(before, 2, 1);
  assert.ok(attemptMove(position.board, 1, 1, 'white'), 'recapture works without the ko predecessor');
  assert.equal(attemptMove(position.board, 1, 1, 'white', 'Go', getBoardHash(before.board)), null);
  const evidence = buildCoachEvidence(position, 'white', 7.5);
  assert.ok(evidence.atariGroups.some(group => group.color === 'black'
    && group.liberties[0].x === 1 && group.liberties[0].y === 1));
  assert.equal(evidence.candidates.some(item => item.point.x === 1 && item.point.y === 1), false);
});

test('pass events are distinguished from previous stones, including a second pass', () => {
  const moved = play(createInitialPosition(9), 2, 2);
  const first = recordPass(moved);
  const second = recordPass(first);
  assert.deepEqual(buildCoachEvidence(first, 'black', 3.5).lastAction, { kind: 'pass', color: 'white', globalMoveNumber: 2 });
  assert.deepEqual(buildCoachEvidence(second, 'black', 3.5).lastAction, { kind: 'pass', color: 'black', globalMoveNumber: 3 });
  assert.match(getLocalCoachMessage(buildCoachEvidence(first, 'black', 3.5), 'explain-last-move'), /停了一手/);
  assert.equal(buildCoachEvidence(createInitialPosition(9), 'black', 3.5).lastAction.kind, 'none');
});

test('editing a board without a corresponding legal move cannot fabricate a capture event', () => {
  const before = threatened('white');
  before.currentPlayer = 'black';
  const position = play(before, 1, 2);
  position.board = position.board.map(row => [...row]);
  position.board[0][1] = null;
  const evidence = buildCoachEvidence(position, 'black', 7.5);
  assert.equal(evidence.lastAction.kind, 'unverified');
});

test('candidate hints are capped at three and each passes the actual legality check', () => {
  const position = createInitialPosition(9);
  for (const [x, y] of [[1, 1], [5, 1], [1, 5], [5, 5]]) {
    put(position, 'black', x, y);
    for (const [dx, dy] of [[-1, 0], [0, -1], [1, 0]]) put(position, 'white', x + dx, y + dy);
  }
  const before = structuredClone(position);
  const evidence = buildCoachEvidence(position, 'black', 3.5);
  assert.equal(evidence.candidates.length, 3);
  for (const candidate of evidence.candidates) {
    const moved = attemptMove(position.board, candidate.point.x, candidate.point.y, 'black');
    assert.ok(moved);
    assert.ok((getGroup(moved.newBoard, candidate.point)?.liberties ?? 0) > 1);
  }
  assert.deepEqual(position, before);
});

test('position identity covers undo, size, turn, prisoners, last move, passes, history, user color and komi', () => {
  const initial = createInitialPosition(9);
  const position = play(initial, 2, 2);
  const key = coachPositionKey(position, 'black', 3.5);
  assert.equal(coachPositionKey(structuredClone(position), 'black', 3.5), key);
  const variants: GamePosition[] = [
    undoPosition(position, 1), createInitialPosition(13),
    { ...position, currentPlayer: 'black' }, { ...position, blackCaptures: 1 },
    { ...position, whiteCaptures: 1 }, { ...position, lastMove: null },
    { ...position, consecutivePasses: 1 }, { ...position, history: [] },
    { ...position, history: [{ ...position.history[0], blackCaptures: 5 }] },
  ];
  for (const changed of variants) assert.notEqual(coachPositionKey(changed, 'black', 3.5), key);
  assert.notEqual(coachPositionKey(position, 'white', 3.5), key);
  assert.notEqual(coachPositionKey(position, 'black', 7.5), key);
  assert.equal(coachPositionKey(initial, 'black', 3.5), coachPositionKey(createInitialPosition(9), 'black', 3.5),
    'semantically identical resets must additionally be distinguished by the hook session generation');
});

for (const color of ['black', 'white'] as const) {
  test(`${color}: only confirmed tactical events trigger unsolicited teaching`, () => {
    const opponent = color === 'black' ? 'white' : 'black';
    const needed = (position: GamePosition) => shouldExplainCoachPosition(buildCoachEvidence(position, color, 7.5));
    const initial = createInitialPosition(5);
    initial.currentPlayer = color;
    assert.equal(needed(initial), false, 'no historical action');
    const quiet = play(initial, 2, 2);
    assert.equal(needed(quiet), false, 'safe isolated move');
    assert.equal(needed(recordPass(quiet)), false, 'ordinary pass');
    assert.equal(needed(play(threatened(color), 1, 2)), false, 'an ordinary escape is visible without a spoken recap');

    const captured = threatened(opponent);
    captured.currentPlayer = color;
    assert.equal(needed(play(captured, 1, 2)), false, 'an ordinary capture is visible without a spoken recap');

    const pressed = createInitialPosition(5);
    pressed.currentPlayer = color;
    put(pressed, opponent, 1, 1);
    put(pressed, color, 0, 1);
    put(pressed, color, 1, 0);
    const newAtari = play(pressed, 2, 1);
    const action = buildCoachEvidence(newAtari, color, 7.5).lastAction;
    assert.equal(needed(newAtari), true, 'new atari on opponent');
    if (action.kind !== 'move') throw new Error('verified move expected');
    assert.deepEqual(action.effects.pressuredGroups, [
      { point: { x: 1, y: 1, label: 'B4' }, libertiesBefore: 2, libertiesAfter: 1 },
    ]);
    newAtari.blackCaptures++;
    assert.equal(needed(newAtari), false, 'corrupted transition cannot authorize teaching');

    const selfAtari = createInitialPosition(5);
    selfAtari.currentPlayer = color;
    for (const [x, y] of [[0, 1], [1, 0], [2, 1]]) put(selfAtari, opponent, x, y);
    assert.equal(needed(play(selfAtari, 1, 1)), true, 'newly played group in danger');
    const alreadyAtari = threatened(color);
    assert.equal(needed(play(alreadyAtari, 4, 4)), false, 'an unrelated old atari does not trigger every turn');

    const connected = createInitialPosition(5);
    connected.currentPlayer = color;
    put(connected, color, 1, 2);
    put(connected, color, 3, 2);
    assert.equal(needed(play(connected, 2, 2)), false, 'ordinary connection stays quiet');
  });
}

test('pressure short of atari and losing one safe own liberty do not trigger chatter', () => {
  const position = createInitialPosition(5);
  put(position, 'white', 2, 2);
  put(position, 'black', 1, 2);
  const pressure = buildCoachEvidence(play(position, 2, 1), 'black', 7.5);
  assert.equal(shouldExplainCoachPosition(pressure), false);
  const message = getLocalCoachMessage(pressure, 'explain-last-move');
  concise(message);
  assert.match(message, /出口|延伸/);
  assert.match(message, /气少.*不等于|气.*变少.*不等于/);
  const ring = createInitialPosition(5);
  for (const [x, y] of [[1, 1], [2, 1], [3, 1], [1, 2], [3, 2], [1, 3], [2, 3], [3, 3]]) put(ring, 'black', x, y);
  assert.equal(shouldExplainCoachPosition(buildCoachEvidence(play(ring, 2, 2), 'black', 7.5)), false);
});

test('manual hints teach one next observation without counts or turn recaps', () => {
  for (const color of ['black', 'white'] as const) {
    const escape = buildCoachEvidence(threatened(color), color, 7.5);
    const saved = getLocalCoachMessage(escape, 'hint');
    concise(saved);
    assert.match(saved, /B3.*出口/);
    assert.match(saved, /不等于.*活|不代表.*活/);
    const capture = threatened(color === 'black' ? 'white' : 'black');
    capture.currentPlayer = color;
    const message = getLocalCoachMessage(buildCoachEvidence(capture, color, 7.5), 'hint');
    concise(message);
    assert.match(message, /B3.*最后一口气/);
    assert.doesNotMatch(message, /\d+ 颗/);
  }
});

test('a capture must not hide the new atari on the learner in either color', () => {
  for (const mover of ['black', 'white'] as const) {
    const learner = mover === 'black' ? 'white' : 'black';
    const position = createInitialPosition(5);
    position.currentPlayer = mover;
    for (const [x, y] of [[0, 1], [1, 0], [1, 2], [3, 0], [4, 1]]) put(position, mover, x, y);
    for (const [x, y] of [[1, 1], [3, 1]]) put(position, learner, x, y);
    const evidence = buildCoachEvidence(play(position, 2, 1), learner, 7.5);
    assert.equal(evidence.toPlay, learner);
    assert.equal(shouldExplainCoachPosition(evidence), true);
    const message = getLocalCoachMessage(evidence, 'explain-last-move');
    concise(message);
    assert.match(message, /你的棋.*打吃.*D3/);
    assert.match(message, /接长|解围/);
    assert.doesNotMatch(message, /提走.*颗/);
  }
});
