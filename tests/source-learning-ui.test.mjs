import assert from 'node:assert/strict';
import test from 'node:test';
import { LearningCenter, TutorialModal, GameBoard, CoachMarkers, Panel, Modal, ProgressBar, props, render, elements, text, button, centerInput } from './helpers/learningUi.mjs';

test('beginner directory opens the shared tutorial at the selected step and returns to the same course menu', t => {
  const content = {}, vibrate = () => {}, calls = [];
  const input = { ...centerInput(props), tutorialContent: content,
    beginnerLessons: [{ id: 'beginner-capture', title: '提子' }, { id: 'beginner-connect-cut', title: '连接与断点' }],
    appearance: { vibrate, stoneAnimationEnabled: false }, onLesson: id => calls.push(id) };
  const host = render(t, input, LearningCenter);
  const top = elements(host.render()).find(node => node.props.leftButtons);
  elements(top.props.leftButtons).find(node => node.props['aria-label'] === '打开课程').props.onClick();
  button(host.render(), '连接与断点').props.onClick();
  let tree = host.render();
  const tutorial = elements(tree).find(node => node.type === TutorialModal);
  assert.equal(tutorial.props.initialStepId, 'beginner-connect-cut');
  assert.equal(tutorial.props.tutorialContent, content);
  assert.equal(tutorial.props.vibrate, vibrate);
  assert.equal(tutorial.props.stoneAnimationEnabled, false);
  assert.equal(elements(tree).find(node => node.type === Modal).props.isOpen, false);
  assert.deepEqual(calls, [], 'replaying guided pages must not submit an advanced exercise');
  assert.equal(elements(tree).find(node => node.type === GameBoard).props.board, props.board);
  tutorial.props.onClose(); tree = host.render();
  assert.equal(elements(tree).some(node => node.type === TutorialModal), false);
  assert.equal(elements(tree).find(node => node.type === Modal).props.isOpen, true);
  assert.match(text(tree), /已完成 0 \/ 0 课/, 'beginner pages do not inflate exercise completion');
});

test('course menu shows completed, current and untouched lessons directly without record management or filtering', t => {
  const calls = [];
  const input = { ...centerInput(props), activeLessonId: 'liberties',
    sections: [{ id: 'rules', title: '基础规则' }],
    lessons: [
      { id: 'placement', section: 'rules', title: '落子', completedSteps: 2, totalSteps: 2 },
      { id: 'liberties', section: 'rules', title: '气', completedSteps: 1, totalSteps: 3 },
      { id: 'capture', section: 'rules', title: '提子', completedSteps: 0, totalSteps: 4 },
    ], onLesson: id => calls.push(id),
  };
  const host = render(t, input, LearningCenter);
  const top = elements(host.render()).find(node => node.props.leftButtons);
  elements(top.props.leftButtons).find(node => node.props['aria-label'] === '打开课程').props.onClick();
  const menu = elements(host.render()).find(node => node.type === Modal);
  assert.equal(menu.props.isOpen, true);
  assert.match(Modal(menu.props).props.className, /fixed inset-0/, 'the shared modal stays anchored to the viewport even after the lesson page scrolls');
  assert.match(host.render().props.className, /!overflow-hidden/, 'the background lesson cannot scroll while choosing a course');
  assert.equal(elements(menu).filter(node => node.type === Panel).length, 1, 'sections reuse the existing shared frame');
  assert.match(text(menu), /已完成 1 \/ 3 课/);
  assert.doesNotMatch(text(menu), /学习记录|选择内容|到期复习|导出|导入|清空|收藏局面/);
  assert.equal(elements(menu).some(node => node.type === 'select' || node.type === 'input'), false);
  const current = elements(menu).find(node => node.props['aria-current'] === 'step');
  assert.match(text(current), /气1 \/ 3/);
  assert.equal(elements(current).some(node => node.props['aria-label'] === '已完成 1 / 3 步'), true);
  assert.match(text(menu), /落子已完成/);
  assert.doesNotMatch(text(menu), /正在学习|0 \/ 4 步/);
  const progress = elements(menu).find(node => node.type === ProgressBar);
  const track = ProgressBar(progress.props);
  assert.equal(track.props['aria-valuenow'], 1);
  assert.equal(track.props['aria-valuemax'], 3);
  current.props.onClick();
  assert.deepEqual(calls, ['liberties']);
  assert.equal(elements(host.render()).find(node => node.type === Modal).props.isOpen, false);
  assert.doesNotMatch(host.render().props.className, /!overflow-hidden/);
  elements(top.props.leftButtons).find(node => node.props['aria-label'] === '打开课程').props.onClick();
  const event = { key: 'Escape', stopPropagation: () => calls.push('escape') };
  elements(host.render()).find(node => node.props.role === 'dialog').props.onKeyDown(event);
  assert.equal(elements(host.render()).find(node => node.type === Modal).props.isOpen, false);
  assert.equal(calls.at(-1), 'escape');
});

test('action exercises dispatch pass, finish and selected-stone confirmation explicitly', t => {
  const calls = [];
  const input = { ...props, kind: 'action', actionLabel: '停一手', onAction: () => calls.push(input.actionLabel) };
  const host = render(t, input);
  for (const label of ['停一手', '结束对局', '选好了']) {
    input.actionLabel = label;
    const action = button(host.render(), label);
    assert.match(action.props.className, /btn-coffee/); action.props.onClick();
  }
  assert.deepEqual(calls, ['停一手', '结束对局', '选好了']);
  assert.doesNotMatch(text(host.render()), /已选/);
  input.actionSelectionCount = 0; assert.match(text(host.render()), /已选 0 颗棋子/);
  Object.assign(input, { actionSelectionCount: 3, phase: 'feedback', result: { outcome: 'failure', explanation: '再看看整块棋。' } });
  const retry = host.render(); assert.match(text(retry), /已选 3 颗棋子/); button(retry, '选好了').props.onClick();
  assert.equal(calls.at(-1), '选好了', 'a wrong selection remains editable and confirmable');
  input.result = { outcome: 'success', explanation: '选对了。' };
  assert.equal(elements(host.render()).some(node => node.props.onClick === input.onAction), false);
});

test('variation exercises use ordinary point input while labels preserve letters and source shapes', t => {
  const calls = [];
  const active = { ...props, kind: 'variation', markers: [{ x: 2, y: 2 }],
    boardMarks: [{ point: { x: 1, y: 2 }, label: 'B' }, { point: { x: 3, y: 1 }, label: 'triangle' }],
    onPoint: (x, y) => calls.push(['move', x, y]) };
  const host = render(t, centerInput(active), LearningCenter);
  const board = elements(host.render()).find(node => node.type === GameBoard);
  board.props.onIntersectionClick(1, 2); assert.deepEqual(calls, [['move', 1, 2]]);
  const labelLayer = elements(board.props.extraSVG).find(node => node.props.marks);
  const painted = labelLayer.type(labelLayer.props), labels = elements(painted).filter(node => node.type === 'text');
  assert.deepEqual(labels.map(text), ['B', '△'], 'original B is not replaced with sequential A or a numbered hint');
  const locations = elements(painted).filter(node => node.props.transform).map(node => node.props.transform);
  assert.equal(new Set(locations).size, 2, 'marks retain separate supplied intersections');
  assert.deepEqual(elements(board.props.extraSVG).find(node => node.type === CoachMarkers).props.points, active.markers);
});

test('action questions retain optional demonstration beside guidance while their main action stays above', t => {
  const calls = [];
  const input = { ...props, kind: 'action', actionLabel: '停一手', onAction: () => calls.push('pass'), onDemonstrate: () => calls.push('demo') };
  const tree = render(t, input).render();
  assert.equal(elements(tree).filter(node => node.props.onClick && text(node).trim() === '示范').length, 1);
  button(tree, '停一手').props.onClick(); button(tree, '示范').props.onClick();
  assert.deepEqual(calls, ['pass', 'demo']);
});

test('lesson sources are absent from practice and the course menu even when old data contains them', t => {
  const active = { ...props, sources: [{ title: 'PRIVATE_SOURCE', url: 'https://example.invalid/course-source' }] };
  const host = render(t, centerInput(active), LearningCenter);
  const top = elements(host.render()).find(node => node.props.leftButtons);
  elements(top.props.leftButtons).find(node => node.props['aria-label'] === '打开课程').props.onClick();
  const tree = host.render(); assert.doesNotMatch(text(tree), /本课参考|PRIVATE_SOURCE|校验|SGF/);
  assert.equal(elements(tree).some(node => node.type === 'a' && node.props.href === active.sources[0].url), false);
});
