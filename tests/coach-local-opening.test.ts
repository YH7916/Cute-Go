import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCoachEvidence, getLocalCoachMessage } from '../domains/coach/evidence';
import { createInitialPosition } from '../domains/game/positionState';

test('opening hints do not invent learner stones or ask for a move during the opponent turn', () => {
  for (const learner of ['black', 'white'] as const) for (const mover of ['black', 'white'] as const) {
    for (const opponentPresent of [false, true]) {
      const position = createInitialPosition(9);
      position.currentPlayer = mover;
      if (opponentPresent) {
        position.board[2][2] = { color: learner === 'black' ? 'white' : 'black', x: 2, y: 2, id: 'opponent' };
      }
      const before = structuredClone(position);
      const message = getLocalCoachMessage(buildCoachEvidence(position, learner, 7.5), 'hint');
      assert.ok(message.length <= 80, `teaching must fit 80 characters: ${message}`);
      assert.ok(message.split(/[。！？]/).filter(Boolean).length <= 2);
      assert.doesNotMatch(message, /自己.*被切断的棋|连接.*己方|救.*你的棋/);
      assert.match(message, /交叉点|落子|角部/);
      if (learner === mover) assert.match(message, /可以.*落|试.*落/);
      else assert.match(message, /等对手|等.*落子后|下次.*回合/);
      assert.deepEqual(position, before);
    }
  }
});

test('a missing previous move is not an instruction for white to play out of turn', () => {
  const message = getLocalCoachMessage(buildCoachEvidence(createInitialPosition(9), 'white', 3.5), 'explain-last-move');
  assert.match(message, /还没有.*上一手/);
  assert.doesNotMatch(message, /先落一子/);
});
