import assert from 'node:assert/strict';
import test from 'node:test';
import { capture, sequence, setup } from './helpers/learningCenter.mjs';
import { LearningControls, ScoreBoard, LearningCenter, GameBoard, CoachMarkers, CoachBubble, CoachPet, Panel, Modal,
  props, noop, render, elements, text, button, centerInput } from './helpers/learningUi.mjs';

test('board practice uses the existing character, message and frame without revealing an answer', t => {
  const tree = render(t).render();
  for (const Component of [CoachBubble, CoachPet, Panel]) assert.equal(elements(tree).filter(node => node.type === Component).length, 1);
  assert.equal(elements(tree).find(node => node.type === CoachBubble).props.text, props.instruction);
  assert.equal(elements(tree).some(node => node.type === GameBoard), false, 'the message module does not mount a second board');
  assert.doesNotMatch(text(tree), /PRIVATE_|提交答案|这次答对了|掌握|已练技能/);
  assert.equal(button(tree, '悔棋').props.disabled, true, 'the shared undo stays disabled at the initial position');
  assert.equal(elements(tree).some(node => node.props.onClick === props.onHint && text(node).trim() === '提示'), false);
  assert.equal(elements(tree).some(node => node.props['aria-label'] === '讲一讲这道题'), false);
});

test('practice offers a demonstration only on request, and personal positions never get a dead demonstration button', t => {
  const calls = [];
  const input = { ...props, onDemonstrate: () => calls.push('demo') };
  const host = render(t, input);
  const tree = host.render();
  assert.deepEqual(calls, [], 'rendering practice never starts the demonstration');
  button(tree, '示范').props.onClick();
  assert.deepEqual(calls, ['demo']);
  input.onDemonstrate = undefined;
  assert.equal(elements(host.render()).some(node => text(node).trim() === '示范'), false);
});

test('a hint replaces the original lecture and an explicit explanation takes priority over an old hint', t => {
  const input = { ...props, instruction: '原本很长的课程讲解。', hint: '先看白棋最后一口气。', hintLevel: 1 };
  const host = render(t, input);
  const speech = () => elements(host.render()).find(node => node.type === CoachBubble).props.text;
  assert.equal(speech(), input.hint);
  Object.assign(input, { explanationVisible: true, instruction: '倒扑：先弃一子，再吃回来。\n- 留意回提后整块棋的气。' });
  assert.equal(speech(), input.instruction);
  Object.assign(input, { phase: 'feedback', explanationVisible: false, instruction: '这一手提到了白棋。' });
  assert.equal(speech(), input.instruction, 'old hints must not hide move feedback');
});

test('a failed attempt keeps restart in the middle row and demonstration beside the guidance without advancing the lesson', t => {
  const calls = [];
  const input = { ...props, phase: 'feedback', result: { outcome: 'failure', explanation: '还没提到目标棋子。' },
    instruction: '还没提到目标棋子。', continueLabel: '再试一次', onRetry: () => calls.push('retry'),
    onContinue: () => calls.push('continue'), onDemonstrate: () => calls.push('demo') };
  const tree = render(t, input).render();
  assert.match(button(tree, '重开').props.className, /btn-beige/);
  assert.equal(button(tree, '示范').props.variant, 'secondary');
  assert.ok(button(tree, '下一题'));
  assert.equal(elements(tree[0]).some(node => node.props.onClick === input.onDemonstrate), false);
  assert.equal(button(tree[1], '示范').props.onClick, input.onDemonstrate);
  button(tree, '重开').props.onClick();
  button(tree, '示范').props.onClick();
  assert.deepEqual(calls, ['retry', 'demo']);
});

test('demonstration advances explicitly and feedback uses the supplied verified explanation', t => {
  const calls = [];
  const input = { ...props, phase: 'demonstration', continueLabel: '下一手', instruction: '先观察白子剩下的气。', onContinue: () => calls.push('continue') };
  const host = render(t, input);
  button(host.render(), '下一手').props.onClick();
  assert.deepEqual(calls, ['continue']);
  assert.equal(elements(host.render()).some(node => text(node).trim() === '提示'), false);
  Object.assign(input, { phase: 'feedback', instruction: 'CHECKED_FEEDBACK', continueLabel: '下一课',
    result: { outcome: 'success', explanation: 'CHECKED_FEEDBACK' } });
  const tree = host.render();
  assert.equal(elements(tree).find(node => node.type === CoachBubble).props.text, 'CHECKED_FEEDBACK');
  assert.ok(button(tree, '下一题'));
  assert.ok(button(tree, '重开'));
  assert.match(text(tree), /本次独立作答/);
  assert.doesNotMatch(text(tree), /PRIVATE_|不计新的独立掌握/);
  input.independent = false;
  assert.match(text(host.render()), /本次辅助练习/);
  assert.doesNotMatch(text(host.render()), /本次独立作答/);
});

test('counting liberties keeps explicit answer submission and undo without a hint toolbar', t => {
  const calls = [];
  const input = { ...props, kind: 'number', canSubmit: false, canUndo: true,
    onNumber: value => calls.push(['answer', value]), onSubmit: () => calls.push('submit'),
    onHint: () => calls.push('hint'), onUndo: () => calls.push('undo') };
  const host = render(t, input);
  let tree = host.render();
  elements(tree).find(node => node.type === 'form').props.onSubmit({ preventDefault() {} });
  assert.deepEqual(calls, [], 'empty answers do not dispatch');
  elements(tree).find(node => node.props['aria-label'] === '气的数量').props.onChange({ currentTarget: { value: '3' } });
  input.canSubmit = true;
  tree = host.render();
  elements(tree).find(node => node.type === 'form').props.onSubmit({ preventDefault() {} });
  assert.equal(elements(tree).some(node => node.props.onClick === input.onHint), false);
  input.kind = 'sequence';
  tree = host.render();
  button(tree, '悔棋').props.onClick();
  assert.deepEqual(calls, [['answer', '3'], 'submit', 'undo']);
  input.numberUnit = '目';
  input.kind = 'number';
  tree = host.render();
  assert.ok(elements(tree).some(node => node.props['aria-label'] === '目数'));
  assert.doesNotMatch(text(tree), /有几口气/);
});

for (const exercise of [capture, sequence]) test(`${exercise.kind}: real stopped feedback supports undo, retry and demonstration without advancing`, t => {
  const practice = setup(t, [exercise]);
  practice.render().openExercise(exercise.id);
  const progress = practice.render().view.lessons;
  practice.render().view.active.onPoint(4, 4);
  const input = { ...practice.render().view.active };
  const ui = render(t, input);
  const refresh = () => { Object.assign(input, practice.render().view.active); return ui.render(); };
  let tree = refresh();
  assert.equal(input.phase, 'feedback');
  assert.equal(input.result.outcome, exercise.kind === 'point' ? 'failure' : 'unverified');
  assert.equal(elements(tree).find(node => node.type === CoachBubble).props.text, input.instruction);
  assert.match(input.instruction, /重开或悔棋/);
  assert.doesNotMatch(input.instruction, /继续试下/);
  assert.match(button(tree, '重开').props.className, /btn-beige/);
  assert.match(button(tree, '悔棋').props.className, /btn-sand/);
  assert.equal(button(tree, '示范').props.variant, 'secondary');
  assert.equal(button(tree, '悔棋').props.disabled, false);
  assert.equal(elements(tree).some(node => node.props.onClick === input.onContinue), false);
  const stopped = input.board, original = { ...practice.record.attempts[0] };
  const events = [...practice.events];
  input.onPoint(1, 2);
  tree = refresh();
  assert.equal(input.board, stopped);
  assert.deepEqual(practice.events, events, 'feedback blocks further grading and input');
  button(tree, '示范').props.onClick();
  tree = refresh();
  assert.equal(input.phase, 'demonstration');
  assert.equal(input.board, exercise.position.board);
  button(tree, '下一手').props.onClick();
  tree = refresh();
  button(tree, '返回练习').props.onClick();
  tree = refresh();
  assert.equal(input.phase, 'feedback');
  assert.equal(input.board, stopped, 'returning from the demonstration restores the stopped answer');
  button(tree, '悔棋').props.onClick();
  refresh();
  assert.equal(input.phase, 'practice');
  assert.equal(input.board, exercise.position.board);
  assert.equal(input.independent, false);
  input.onPoint(4, 4);
  tree = refresh();
  button(tree, '重开').props.onClick();
  refresh();
  assert.equal(input.phase, 'practice');
  assert.equal(input.board, exercise.position.board);
  assert.equal(input.currentPlayer, exercise.position.currentPlayer);
  assert.equal(input.result, null);
  assert.equal(input.prompt, exercise.prompt);
  assert.equal(practice.record.attempts.length, 2);
  assert.deepEqual(practice.record.attempts[0], original);
  assert.deepEqual(practice.render().view.lessons, progress, 'none of these controls advances course completion');
});

test('same-board demonstrations show progress and support stepping backward or returning at any point', t => {
  const calls = [];
  const input = { ...props, phase: 'demonstration', demoStep: 1, demoTotal: 4, canUndo: false, continueLabel: '下一手',
    onUndo: () => calls.push('undo'), onContinue: () => calls.push('next'), onReturnFromDemo: () => calls.push('return') };
  const host = render(t, input);
  let tree = host.render();
  const center = render(t, centerInput(input), LearningCenter);
  assert.match(text(elements(center.render()).find(node => node.props.rightContent).props.rightContent), /本题示范 · 1 \/ 4/);
  assert.equal(button(tree, '上一手').props.disabled, true);
  button(tree, '返回练习').props.onClick();
  button(tree, '下一手').props.onClick();
  input.demoStep = 3; input.canUndo = true;
  tree = host.render();
  assert.equal(button(tree, '上一手').props.disabled, false);
  button(tree, '上一手').props.onClick();
  input.demoStep = 4; input.continueLabel = '回到练习';
  tree = host.render();
  assert.match(text(elements(center.render()).find(node => node.props.rightContent).props.rightContent), /本题示范 · 4 \/ 4/);
  button(tree, '回到练习').props.onClick();
  assert.deepEqual(calls, ['return', 'next', 'undo', 'next']);
});

test('lesson speech follows supplied instruction and undo stays available without explanation toggles', t => {
  const calls = [];
  const input = { ...props, canUndo: true, hintLevel: 2, onExplanation: () => calls.push('explain'), onUndo: () => calls.push('undo') };
  const host = render(t, input);
  let tree = host.render();
  assert.equal(elements(tree).some(node => node.props.onClick === input.onHint && text(node).trim() === '提示'), false);
  assert.equal(elements(tree).some(node => node.props.onClick === input.onExplanation), false);
  button(tree, '悔棋').props.onClick();
  input.explanationVisible = true;
  input.instruction = '先比较接长、连接和反提，不能把上一题坐标照搬过来。';
  tree = host.render();
  assert.equal(elements(tree).some(node => text(node).trim() === '收起'), false);
  assert.equal(elements(tree).find(node => node.type === CoachBubble).props.text, input.instruction);
  assert.equal(elements(tree).some(node => node.props.onClick === input.onExplanation), false);
  assert.deepEqual(calls, ['undo']);
});

test('a wrong numeric answer remains editable and can be resubmitted without restarting the exercise', t => {
  const calls = [];
  const input = { ...props, kind: 'number', phase: 'feedback', numberAnswer: '2', canSubmit: true,
    result: { outcome: 'failure', explanation: '再检查每个不同的空点。' },
    onNumber: value => calls.push(['number', value]), onSubmit: () => calls.push('submit'), onRetry: () => calls.push('retry') };
  const tree = render(t, input).render();
  const field = elements(tree).find(node => node.props['aria-label'] === '气的数量');
  assert.equal(field.props.value, '2');
  field.props.onChange({ currentTarget: { value: '3' } });
  elements(tree).find(node => node.type === 'form').props.onSubmit({ preventDefault() {} });
  assert.deepEqual(calls, [['number', '3'], 'submit']);
  assert.equal(button(tree, '重开').props.onClick, input.onRetry, 'the optional top restart does not replace resubmission');
});

test('choice questions dispatch the selected answer directly without a confirm step', t => {
  const calls = [];
  const input = { ...props, kind: 'choice', choices: [{ id: 'a', label: '继续接长' }, { id: 'b', label: '提掉堵路的白棋' }],
    selectedChoice: '', onChoice: id => calls.push(['choice', id]), onSubmit: () => calls.push('submit') };
  const host = render(t, input);
  let tree = host.render();
  assert.equal(elements(tree).some(node => node.type === 'select' || node.type === 'option'), false);
  const options = elements(tree).find(node => node.props.role === 'group' && node.props['aria-label'] === '选择答案');
  assert.deepEqual(elements(options).filter(node => node.props.onClick).map(node => [text(node), node.props['aria-pressed']]),
    [['继续接长', false], ['提掉堵路的白棋', false]]);
  assert.equal(elements(tree).some(node => node.type === 'form' || node.props.type === 'submit'), false);
  assert.doesNotMatch(text(tree), /再想一想|答对了|确认/);
  assert.deepEqual(calls, []);
  const second = button(tree, '提掉堵路的白棋');
  assert.equal(second.props.type, 'button');
  second.props.onClick();
  assert.deepEqual(calls, [['choice', 'b']]);
  input.selectedChoice = 'b'; input.canSubmit = true;
  tree = host.render();
  assert.equal(button(tree, '提掉堵路的白棋').props['aria-pressed'], true);
  assert.equal(button(tree, '继续接长').props['aria-pressed'], false);
  assert.equal(button(tree, '提掉堵路的白棋').props['data-answer-result'], undefined);
  assert.deepEqual(calls, [['choice', 'b']]);
  input.phase = 'feedback'; input.result = { outcome: 'failure', explanation: '再看看。' };
  tree = host.render();
  assert.equal(button(tree, '提掉堵路的白棋').props['data-answer-result'], 'wrong');
  assert.equal(button(tree, '继续接长').props['data-answer-result'], undefined);
  assert.match(text(tree), /再想一想/);
  assert.match(elements(tree).find(node => node.props.role === 'status').props.className, /teaching-answer-wrong/);
  button(tree, '继续接长').props.onClick();
  input.selectedChoice = 'a'; tree = host.render();
  assert.equal(button(tree, '继续接长').props['aria-pressed'], true);
  assert.equal(button(tree, '提掉堵路的白棋').props['aria-pressed'], false);
  assert.deepEqual(calls, [['choice', 'b'], ['choice', 'a']]);
  input.result = { outcome: 'success', explanation: '选对了。' };
  assert.equal(elements(host.render()).some(node => node.props['aria-label'] === '选择答案'), false);
  assert.match(text(host.render()), /答对了/);
  assert.match(elements(host.render()).find(node => node.props.role === 'status').props.className, /teaching-answer-correct/);
});

test('teaching owns one shared board and opens courses only on request', t => {
  const calls = [];
  const active = { ...props, focusPoint: { x: 1, y: 1 }, markers: [{ x: 2, y: 3 }],
    onPoint: (x, y) => calls.push(['move', x, y]), onInspect: (x, y) => calls.push(['inspect', x, y]) };
  const input = { isOpen: true, active, loaded: true, filter: 'all', sections: [], lessons: [], personal: [],
    storageMessage: '', onClose: () => calls.push('home'), appearance: { stoneSkin: 'skeuomorphic', boardSkin: 'sakura_wood', stoneAnimationEnabled: false },
    onFilter: noop, onLesson: noop, onPersonal: noop, onExport: noop, onImport: noop, onDelete: noop };
  const host = render(t, input, LearningCenter);
  let tree = host.render();
  const boards = elements(tree).filter(node => node.type === GameBoard);
  assert.equal(boards.length, 1);
  assert.equal(boards[0].props.board, active.board);
  assert.equal(boards[0].props.stoneSkin, 'skeuomorphic');
  assert.equal(boards[0].props.stoneAnimationEnabled, false);
  boards[0].props.onIntersectionClick(2, 3);
  assert.deepEqual(calls, [['move', 2, 3]], 'board routes directly to the isolated teaching move callback');
  boards[0].props.onInspectPoint(1, 1);
  assert.deepEqual(calls.at(-1), ['inspect', 1, 1], 'inspecting a stone never submits an answer');
  assert.equal(boards[0].props.showQi, true, 'the shared board dispatches inspection only with liberties enabled');
  assert.equal(boards[0].props.qiOnHover, false, 'teaching counts explicit inspection as assistance and cannot leak it through hover');
  assert.equal(boards[0].props.showCoordinates, true, 'marker geometry and the board use the same coordinate padding');
  assert.equal(boards[0].props.autoShowQiAt, active.focusPoint);
  assert.equal(boards[0].props.extraSVGLayer, 'foreground');
  assert.equal(boards[0].props.extraSVG.type, CoachMarkers);
  assert.deepEqual(boards[0].props.extraSVG.props.points, active.markers);
  assert.equal(boards[0].props.extraSVG.props.board, active.board);
  const topProgress = elements(tree).find(node => node.props.rightContent).props.rightContent;
  assert.match(text(topProgress), /第 1 \/ 6 课 · 第 1 \/ 2 题/);
  assert.match(text(elements(tree).find(node => node.props.role === 'status')), /轮到你 · 执黑/);
  assert.match(tree.props.className, /theme-sakura/);
  assert.equal(elements(tree).find(node => node.type === Modal).props.isOpen, false);
  const top = elements(tree).find(node => node.props.leftButtons);
  elements(top.props.leftButtons).find(node => node.props['aria-label'] === '打开课程').props.onClick();
  tree = host.render();
  assert.equal(elements(tree).find(node => node.type === Modal).props.isOpen, true);
  elements(top.props.leftButtons).find(node => node.props['aria-label'] === '返回首页').props.onClick();
  assert.equal(calls.at(-1), 'home');
});

test('teaching keeps three shared actions above the board and one demonstration in the bubble without win rate', t => {
  const active = { ...props, blackCaptures: 3, whiteCaptures: 7, onDemonstrate: noop, canUndo: true };
  const tree = render(t, centerInput(active), LearningCenter).render();
  const header = elements(tree).find(node => node.type === 'header');
  const score = elements(header).find(node => node.type === ScoreBoard);
  assert.deepEqual([score.props.blackCaptures, score.props.whiteCaptures], [3, 7]);
  assert.equal(score.props.showWinRate, false);
  assert.equal(score.props.showCaptures, false);
  assert.doesNotMatch(text(ScoreBoard(score.props)), /%|胜率|领先|提子/);
  assert.match(text(ScoreBoard(score.props)), /黑子白子/);
  assert.match(text(ScoreBoard({ ...score.props, showCaptures: undefined })), /提子: 3.*提子: 7/, 'ordinary matches keep capture counts by default');
  const actions = elements(header).find(node => node.props.className?.includes('game-actions'));
  assert.equal(elements(actions).some(node => node.props['aria-label'] === '课程进度'), false, 'progress only belongs in the top bar');
  assert.equal(elements(header).filter(node => node.type === LearningControls).length, 1);
  const [middle, speech] = render(t, active).render();
  assert.deepEqual(elements(middle).filter(node => node.props.onClick).map(text), ['悔棋', '下一题', '重开']);
  assert.deepEqual(elements(speech).filter(node => node.props.onClick && ['悔棋', '下一题', '重开'].includes(text(node).trim())), []);
  assert.equal(elements(speech).some(node => node.props['aria-label'] === '本题示范进度'), false);
  const tools = elements(speech).find(node => node.props.className?.includes('coach-tools'));
  assert.deepEqual(elements(tools).filter(node => node.props.onClick).map(text), ['示范']);
  const withoutDemo = render(t, { ...active, onDemonstrate: undefined }).render().at(-1);
  assert.equal(elements(withoutDemo).some(node => node.props.className?.includes('coach-tools')), false, 'board guidance has no empty toolbar');
  assert.equal(elements(speech).some(node => ['提示', '讲解'].includes(text(node).trim()) && node.props.onClick), false);
});

test('the course menu stays focused on lessons even when practical play is available', t => {
  const calls = [];
  const input = { ...centerInput(props), onPractice: () => calls.push('practice') };
  const host = render(t, input, LearningCenter);
  let tree = host.render();
  assert.deepEqual(calls, [], 'rendering a lesson never starts a match');
  const top = elements(tree).find(node => node.props.leftButtons);
  elements(top.props.leftButtons).find(node => node.props['aria-label'] === '打开课程').props.onClick();
  tree = host.render();
  const menu = elements(tree).find(node => node.type === Modal);
  assert.equal(menu.props.isOpen, true);
  assert.doesNotMatch(text(menu), /去 9 路陪练|把刚学的|随时重看/);
  assert.equal(elements(menu).some(node => node.type === 'footer'), false, 'the lesson list ends without a separate activity footer');
  assert.deepEqual(calls, []);
});

test('the completed exercise view keeps course selection beside optional practical play', t => {
  const calls = [];
  const input = { ...centerInput(null), onPractice: () => calls.push('practice') };
  const host = render(t, input, LearningCenter);
  const tree = host.render();
  const empty = elements(tree).find(node => node.props.className?.includes('board-viewport'));
  assert.deepEqual(calls, [], 'finishing lessons leaves the next activity to the student');
  assert.ok(button(empty, '选择课程'));
  button(empty, '去 9 路陪练').props.onClick();
  assert.deepEqual(calls, ['practice']);
  button(empty, '选择课程').props.onClick();
  assert.equal(elements(host.render()).find(node => node.type === Modal).props.isOpen, true);
});
