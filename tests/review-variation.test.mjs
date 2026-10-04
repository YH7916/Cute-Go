import assert from 'node:assert/strict';
import test from 'node:test';
import { setupAiSession, createInitialPosition, recordMove } from './helpers/gameAiSession.mjs';

function sixMoveRecord() {
  const positions = [createInitialPosition(9)];
  for (let x = 0; x < 6; x += 1) {
    const previous = positions.at(-1);
    const board = previous.board.map(row => row.slice());
    board[0][x] = { color: previous.currentPlayer, x, y: 0, id: `record-${x}` };
    positions.push(recordMove(previous, board, { x, y: 0 }, 0, false));
  }
  return positions;
}

test('inspecting an earlier position aligns the review cursor and the next step without changing the live game', t => {
  const s = setupAiSession(t);
  let api = s.render();
  const positions = sixMoveRecord();
  const original = positions[6];
  api.state.writePosition(original);
  api = s.render();
  api.review.inspectPosition(positions[4]);
  api = s.render();
  assert.equal(api.state.appMode, 'review');
  assert.equal(api.review.position, positions[4]);
  assert.equal(api.state.reviewIndex, 4, 'the slider must identify the displayed fourth move');
  assert.equal(api.state.readPosition(), original);

  api.review.exitVariation();
  api = s.render();
  assert.equal(api.review.position.board, positions[4].board, 'returning to the record must stay on the inspected move');
  assert.equal(api.review.position.history.length, 4);
  api.review.inspectPosition(positions[4]);
  api = s.render();
  api.state.setReviewIndex(api.state.reviewIndex + 1);
  api = s.render();
  assert.equal(api.state.reviewIndex, 5);
  assert.equal(api.review.position.board, positions[5].board);
  assert.equal(api.review.position.history.length, 5);
  assert.equal(api.review.inVariation, false);
  assert.equal(api.state.readPosition(), original);

  api.state.setAppMode('playing');
  api = s.render();
  assert.equal(api.review.position, original);
  assert.equal(api.state.readPosition(), original);
  api.review.inspectPosition(original);
  api = s.render();
  assert.equal(api.state.reviewIndex, 6, 'inspecting the live position selects the record endpoint');
  assert.equal(api.review.position, original);
});

for (const source of ['another-game', 'different-history']) {
  test(`inspecting a ${source} snapshot retains the independent variation cursor`, t => {
    const s = setupAiSession(t);
    let api = s.render();
    const positions = sixMoveRecord();
    const original = positions[6];
    const external = source === 'another-game' ? sixMoveRecord()[4]
      : { ...positions[4], history: positions[4].history.map(entry => ({ ...entry })) };
    api.state.writePosition(original);
    api.state.setReviewIndex(2);
    api = s.render();
    api.review.inspectPosition(external);
    api = s.render();
    assert.equal(api.state.reviewIndex, 2, 'an unrelated snapshot must not relocate the current record by move count');
    assert.equal(api.review.position, external);
    assert.equal(api.review.inVariation, true);
    assert.equal(api.state.readPosition(), original);
    api.review.exitVariation();
    api = s.render();
    assert.equal(api.review.position.board, positions[2].board);
    assert.equal(api.state.readPosition(), original);
  });
}

test('review variation uses an isolated complete position and cannot modify the original record', t => {
  const s = setupAiSession(t);
  let api = s.render();
  const original = api.state.readPosition();
  api.state.setAppMode('review');
  api = s.render();
  api.review.startVariation();
  api = s.render();
  assert.equal(api.review.inVariation, true);
  api.review.playVariation(2, 2);
  assert.notEqual(api.review.readPosition(), original, 'latest reader changes before render');
  api = s.render();
  assert.equal(api.review.position.currentPlayer, 'white');
  assert.equal(api.review.position.history.length, 1);
  assert.equal(api.state.readPosition(), original);
  api.review.passVariation();
  api = s.render();
  assert.equal(api.review.position.consecutivePasses, 1);
  api.review.undoVariation();
  api = s.render();
  assert.equal(api.review.position.consecutivePasses, 0);
  api.review.exitVariation();
  api = s.render();
  assert.equal(api.review.position, original);
  assert.equal(original.board[2][2], null);
});

test('reset invalidates variation writes even before render', t => {
  const s = setupAiSession(t);
  let api = s.render();
  api.state.setAppMode('review');
  api = s.render();
  api.review.startVariation();
  api = s.render();
  const replacement = createInitialPosition(9);
  api.state.writePosition(replacement);
  api.review.playVariation(2, 2);
  assert.equal(api.review.readPosition(), replacement);
  api = s.render();
  assert.equal(api.review.inVariation, false);
  assert.equal(api.state.readPosition(), replacement);
});

test('two passes end only the variation and block further moves until undo', t => {
  const s = setupAiSession(t);
  let api = s.render();
  api.state.setAppMode('review');
  api = s.render();
  api.review.startVariation();
  api = s.render();
  api.review.passVariation();
  api.review.passVariation();
  const ended = api.review.readPosition();
  api.review.playVariation(2, 2);
  assert.equal(api.review.readPosition(), ended);
  assert.equal(s.render().state.consecutivePasses, 0);
  api = s.render();
  api.review.undoVariation();
  api.review.playVariation(2, 2);
  assert.ok(api.review.readPosition().board[2][2]);
});

test('changing owner hides a personal variation during render and rejects every old-owner callback', t => {
  const s = setupAiSession(t);
  s.options.ownerScopeId = 'account:A';
  let api = s.render();
  const original = api.state.readPosition();
  const savedA = { ...createInitialPosition(9), blackCaptures: 7 };
  api.review.inspectPosition(savedA);
  api = s.render();
  const old = api.review;
  assert.equal(old.position, savedA);
  s.options.ownerScopeId = 'account:B';
  s.options.onReviewRender = review => {
    assert.equal(review.inVariation, false, 'owner guard must hide the branch before effect cleanup');
    assert.equal(review.position, original);
    assert.equal(review.readPosition(), original);
    assert.equal(old.readPosition(), original);
    old.inspectPosition(savedA);
    old.startVariation();
    old.writePosition(savedA);
    assert.equal(review.readPosition(), original, 'old callbacks cannot reintroduce an A snapshot');
  };
  api = s.render();
  s.options.onReviewRender = null;
  const savedB = { ...createInitialPosition(9), whiteCaptures: 3 };
  api.review.inspectPosition(savedB);
  api = s.render();
  old.playVariation(2, 2);
  old.passVariation();
  old.undoVariation();
  old.exitVariation();
  old.inspectPosition(savedA);
  old.writePosition(savedA);
  assert.equal(api.review.readPosition(), savedB, 'old callbacks cannot change or close the B branch');
  assert.equal(old.readPosition(), original, 'a retained old-owner reader cannot read a personal branch');
  api.review.playVariation(2, 2);
  assert.equal(api.review.readPosition().board[2][2]?.color, 'black');
  assert.equal(api.state.readPosition(), original);
  assert.equal(original.board[2][2], null);
});
