import assert from 'node:assert/strict';
import test from 'node:test';
import { setupGameFlow } from '../helpers/gameFlow.mjs';

const position = game => game.api.state.readPosition();
const occupied = (game, color) => position(game).board.flat().filter(stone => stone?.color === color);

function assertReadyForHuman(game, moves) {
  assert.equal(position(game).history.length, moves);
  assert.equal(position(game).currentPlayer, 'black');
  assert.equal(game.api.ai.aiTurnLock.current, false);
  assert.equal(game.api.flow.showThinkingStatus, false);
  assert.deepEqual(game.errors, []);
  if (moves === 0) {
    assert.ok(position(game).board.flat().every(stone => stone === null));
    assert.equal(position(game).blackCaptures, 0);
    assert.equal(position(game).whiteCaptures, 0);
    assert.equal(position(game).lastMove, null);
    assert.equal(position(game).consecutivePasses, 0);
  }
}

function finishRuleReply(game) {
  game.advance(180); // Production rules request completes; no synthetic reply.
  game.advance(200); // Production deferred placement commits the real move.
}

test('固定陪练对弈流程：开局→玩家落子→真实规则AI→双步悔棋→重开隔离旧应手→继续', { timeout: 10000 }, async t => {
  const game = setupGameFlow(t);
  // The real start-coach action selects a fresh 9x9 Fun game.
  game.api.start.handleStartCoach();
  game.render();
  assert.equal(game.settings.coachMode, true);
  const initial = position(game);
  assertReadyForHuman(game, 0);

  await game.move(4, 4);
  assert.equal(position(game).board[4][4]?.color, 'black');
  assert.equal(position(game).history.length, 1);
  assert.equal(position(game).currentPlayer, 'white');
  assert.equal(game.api.flow.showThinkingStatus, true);
  const awaiting = position(game);
  await game.move(8, 8);
  assert.equal(position(game), awaiting, 'human input cannot add a move during the AI turn');

  finishRuleReply(game);
  assertReadyForHuman(game, 2);
  assert.equal(occupied(game, 'black').length, 1);
  assert.equal(occupied(game, 'white').length, 1);
  assert.equal(position(game).board[4][4]?.color, 'black', 'AI cannot overwrite the human stone');
  assert.equal(position(game).history[1].board[4][4]?.color, 'black');
  assert.equal(position(game).history[1].currentPlayer, 'white');
  game.undo();
  assert.deepEqual(position(game), initial, 'AI undo restores the whole position, not only the visible stones');
  assertReadyForHuman(game, 0);

  await game.move(2, 2);
  game.advance(180);
  assert.notEqual(game.api.ai.aiTimerRef.current, null, 'the old answer has been computed and is waiting to land');
  await game.reset();
  const resetPosition = position(game);
  game.advance(1_000);
  assert.equal(position(game), resetPosition, 'the already computed old answer cannot land after restart');
  assertReadyForHuman(game, 0);

  await game.move(6, 6);
  await game.reset(); // Cancel before the local rules response is computed.
  await game.move(3, 3);
  finishRuleReply(game);
  assertReadyForHuman(game, 2);
  assert.equal(position(game).board[3][3]?.color, 'black');
  assert.notEqual(position(game).board[6][6]?.color, 'black', 'the canceled human move must not be restored');
  assert.equal(occupied(game, 'white').length, 1, 'exactly the new request receives an AI reply');
  assert.equal(game.workerCreations, 0, 'Fun exercises its production rules path without an ONNX substitute');
});

test('固定本地围棋流程：非法占点→角部提子→悔棋恢复→连续停着结算→重开', { timeout: 10000 }, async t => {
  const game = setupGameFlow(t);
  await game.start('PvP');
  const initial = position(game);
  await game.move(1, 0);
  await game.move(0, 0);
  const beforeCapture = position(game);
  await game.move(1, 0);
  assert.equal(position(game), beforeCapture, 'occupied-point rejection keeps turn, history and captures unchanged');
  await game.move(0, 1);
  assert.equal(position(game).blackCaptures, 1);
  assert.equal(position(game).whiteCaptures, 0);
  assert.equal(position(game).board[0][0], null);
  game.undo();
  assert.deepEqual(position(game), beforeCapture, 'undo restores the captured white stone and every position field');
  await game.move(0, 1);
  assert.equal(position(game).blackCaptures, 1);
  await game.pass();
  assert.equal(position(game).consecutivePasses, 1);
  assert.equal(game.api.state.gameOver, false);
  await game.pass();
  assert.equal(game.api.state.gameOver, true);
  assert.ok(game.api.state.finalScore);
  assert.ok(Number.isFinite(game.api.state.finalScore.black));
  assert.ok(Number.isFinite(game.api.state.finalScore.white));
  assert.equal(position(game).history.length, 5);
  const ended = position(game);
  await game.move(5, 5);
  assert.equal(position(game), ended, 'a settled game no longer accepts board input');
  await game.reset();
  assert.deepEqual(position(game), initial);
  assert.equal(game.api.state.gameOver, false);
  assert.equal(game.api.state.finalScore, null);
  await game.move(4, 4);
  assert.equal(position(game).board[4][4]?.color, 'black');
  assert.deepEqual(game.errors, []);
});

test('固定五子棋流程：交替落子连五→胜负结算→重开可继续', { timeout: 10000 }, async t => {
  const game = setupGameFlow(t, { gameType: 'Gomoku' });
  await game.start('PvP');
  for (let x = 0; x < 4; x++) {
    await game.move(x, 0);
    await game.move(x, 2);
  }
  await game.move(4, 0);
  game.advance(0);
  assert.equal(game.api.state.gameOver, true);
  assert.equal(game.api.state.winner, 'black');
  assert.equal(game.api.state.winReason, '五子连珠！');
  assert.equal(position(game).history.length, 9);
  await game.reset();
  assert.equal(game.api.state.gameOver, false);
  assert.equal(game.api.state.winner, null);
  assert.equal(position(game).history.length, 0);
  await game.move(4, 4);
  assert.equal(position(game).board[4][4]?.color, 'black');
  assert.deepEqual(game.errors, []);
});
