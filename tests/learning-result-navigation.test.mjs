import assert from 'node:assert/strict';
import test from 'node:test';
import { LearningCenter, LearningControls, Modal, props, render, elements, text, button, centerInput } from './helpers/learningUi.mjs';

function middleControls(tree) {
  const actions = elements(tree).find(node => node.props.className?.includes('game-actions'));
  if (!actions) return undefined;
  const controls = elements(actions).find(node => node.type === LearningControls);
  const shared = LearningControls(controls.props);
  return shared.type(shared.props);
}
function nextButton(tree) {
  return button(middleControls(tree), '下一题');
}
function successDialog(tree) {
  return elements(tree).find(node => node.type === Modal && node.props.isOpen
    && elements(node).some(child => child.props['aria-labelledby'] === 'learning-success-title'));
}

test('the middle action row keeps next between undo and reset before answering and after wrong feedback', t => {
  const calls = [];
  const active = { ...props, onNext: () => calls.push('next') };
  const input = centerInput(active);
  const host = render(t, input, LearningCenter);
  const top = elements(host.render()).find(node => node.props.leftButtons);
  assert.deepEqual(elements(top.props.leftButtons).filter(node => node.props.onClick).map(node => node.props['aria-label']),
    ['返回首页', '打开课程'], 'course navigation does not duplicate the exercise action');
  const row = elements(middleControls(host.render())).find(node => node.props.className?.includes('game-play-controls'));
  assert.deepEqual(row.props.children.filter(node => node?.type === 'button').map(text), ['悔棋', '下一题', '重开']);
  assert.equal(nextButton(host.render()).props.disabled, false);
  nextButton(host.render()).props.onClick();
  Object.assign(active, { phase: 'feedback', result: { outcome: 'failure', explanation: '再看空点。' } });
  assert.equal(nextButton(host.render()).props.disabled, false);
  nextButton(host.render()).props.onClick();
  assert.deepEqual(calls, ['next', 'next']);
  active.phase = 'demonstration';
  assert.equal(elements(middleControls(host.render())).some(node => node.type === 'button' && text(node) === '下一题'), false,
    'demonstration keeps its own next-move transition instead of skipping the exercise');
  assert.equal(button(middleControls(host.render()), active.continueLabel).props.onClick, active.onContinue);
  input.active = null;
  assert.equal(middleControls(host.render()), undefined, 'course landing has no exercise actions');
});

for (const kind of ['point', 'number', 'choice', 'sequence', 'variation', 'action']) {
  test(`${kind}: the middle next action remains available without dispatching retry, demo or an exercise action`, t => {
    const calls = [];
    const active = { ...props, kind, onNext: () => calls.push('next'), onAction: () => calls.push('action'),
      onRetry: () => calls.push('retry'), onDemonstrate: () => calls.push('demo') };
    const host = render(t, centerInput(active), LearningCenter);
    for (const outcome of [null, 'failure', 'unverified', 'continue', 'success']) {
      Object.assign(active, { phase: outcome ? 'feedback' : 'practice', result: outcome ? { outcome, explanation: '看看这块棋。' } : null });
      const next = nextButton(host.render());
      assert.equal(next.props.disabled, false);
      next.props.onClick();
    }
    assert.deepEqual(calls, ['next', 'next', 'next', 'next', 'next']);
    active.onNext = undefined;
    assert.equal(nextButton(host.render()).props.disabled, true, 'a caller without a next exercise cannot dispatch a different action');
  });
}

for (const outcome of ['failure', 'unverified', 'continue']) {
  test(`${outcome} feedback does not open a success dialog`, t => {
    const tree = render(t, centerInput({ ...props, phase: 'feedback', result: { outcome, explanation: '看看这块棋。' } }), LearningCenter).render();
    assert.equal(successDialog(tree), undefined);
  });
}

test('success opens a shared dialog with verified explanation and an immediate next action', t => {
  const calls = [];
  const active = { ...props, phase: 'feedback', result: { outcome: 'success', explanation: '连接后的棋共享外侧的气。' },
    autoAdvance: true, onContinue: () => calls.push('continue'), onNext: () => calls.push('next') };
  const input = centerInput(active);
  const host = render(t, input, LearningCenter);
  const dialog = successDialog(host.render());
  assert.ok(dialog);
  assert.equal(dialog.props.position, 'fixed');
  assert.match(text(dialog), /答对了！连接后的棋共享外侧的气。下一题稍后自动进入下一题/);
  assert.deepEqual(calls, [], 'rendering success cannot skip its feedback');
  button(dialog, '下一题').props.onClick();
  assert.deepEqual(calls, ['continue']);
  active.autoAdvance = false;
  assert.doesNotMatch(text(successDialog(host.render())), /自动/);
  Object.assign(active, { phase: 'practice', result: null });
  assert.equal(successDialog(host.render()), undefined, 'new exercise removes the old popup');
});

test('success feedback keeps its authored list structure inside the shared dialog', t => {
  const active = { ...props, phase: 'feedback', result: { outcome: 'success', explanation: '看这两处：\n- 左边还留着一口气。\n- 右边的两颗棋连在一起。' } };
  const tree = render(t, centerInput(active), LearningCenter).render();
  const explanation = elements(successDialog(tree)).find(node => node.props.id === 'learning-success-explanation');
  assert.equal(elements(explanation).filter(node => node.type === 'ul').length, 1);
  assert.deepEqual(elements(explanation).filter(node => node.type === 'li').map(text), ['左边还留着一口气。', '右边的两颗棋连在一起。']);
  assert.match(explanation.props.className, /text-left/);
});

test('leaving the success dialog returns keyboard focus to the middle next action', t => {
  const active = { ...props, phase: 'feedback', result: { outcome: 'success', explanation: '这块棋连接了。' } };
  const host = render(t, centerInput(active), LearningCenter);
  const tree = host.render();
  const actions = elements(tree).find(node => node.props.className?.includes('game-actions'));
  const next = nextButton(tree);
  let focused = false;
  actions.props.ref.current = { querySelector(selector) {
    assert.equal(selector, `button[aria-label="${next.props['aria-label']}"]`);
    return { focus() { focused = true; } };
  } };
  Object.assign(active, { phase: 'practice', result: null });
  host.render();
  assert.equal(focused, true);
});

for (const closePage of [false, true]) {
  test(`finishing the final exercise ${closePage ? 'does not move focus after leaving the classroom' : 'returns keyboard focus to courses'}`, t => {
    const input = centerInput({ ...props, phase: 'feedback', result: { outcome: 'success', explanation: '这块棋连接了。' } });
    const host = render(t, input, LearningCenter);
    const tree = host.render();
    const top = elements(tree).find(node => node.props.leftButtons);
    const courses = elements(top.props.leftButtons).find(node => node.props['aria-label'] === '打开课程');
    const actions = elements(tree).find(node => node.props.className?.includes('game-actions'));
    let focused = false;
    courses.props.ref.current = { focus() { focused = true; } };
    actions.props.ref.current = null;
    input.active = null;
    input.isOpen = !closePage;
    const landing = host.render();
    assert.equal(successDialog(landing), undefined);
    assert.equal(middleControls(landing), undefined);
    assert.equal(focused, !closePage);
  });
}

test('success waits for the opponent reply to settle and next is disabled during that reply', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const active = { ...props, phase: 'feedback', result: { outcome: 'success', explanation: '这一手成功了。' },
    replyKey: 'winning-response', replyPreview: { board: props.board, currentPlayer: 'white', lastMove: null,
      blackCaptures: 0, whiteCaptures: 0 } };
  const host = render(t, centerInput(active), LearningCenter);
  assert.equal(successDialog(host.render()), undefined);
  assert.equal(nextButton(host.render()).props.disabled, true);
  t.mock.timers.tick(419);
  assert.equal(successDialog(host.render()), undefined);
  t.mock.timers.tick(1);
  assert.ok(successDialog(host.render()));
  assert.equal(nextButton(host.render()).props.disabled, false);
});
