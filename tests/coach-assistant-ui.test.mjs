import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { loadTestModule } from './helpers/loadTestModule.mjs';

const require = createRequire(import.meta.url);
const { CoachAssistant, CoachBubble, CoachPanel, CoachPet, Panel, renderHook } = await loadTestModule({
  reactHost: true, define: { 'process.env.NODE_ENV': '"production"', 'import.meta.env.BASE_URL': '"/"' },
  plugins: [{ name: 'real-jsx-runtime', setup(build) {
    build.onResolve({ filter: /jsx-runtime$/ }, () => ({ path: require.resolve('react/jsx-runtime') }));
    build.onResolve({ filter: /^lucide-react$/ }, () => ({ path: pathToFileURL(require.resolve('lucide-react')).href, external: true }));
  } }],
  contents: `export { CoachAssistant } from './components/CoachAssistant';
    export { CoachBubble } from './components/coach/CoachBubble';
    export { CoachPanel } from './components/CoachPanel';
    export { CoachPet } from './components/CoachPet';
    export { Panel } from './ui/common';
    export { renderHook } from './tests/helpers/reactHooks';`,
});

function elements(node) {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!node || typeof node !== 'object' || !node.props) return [];
  return [node, ...elements(node.props.children)];
}
function inFlow(element, label) {
  assert.ok(element, `${label} exists`);
  assert.notEqual(element.props.style?.position, 'fixed', `${label} does not float over the board`);
  assert.notEqual(element.props.style?.position, 'absolute', `${label} reserves its own space`);
  assert.doesNotMatch(element.props.className ?? '', /(?:^|\s)(?:[\w-]+:)*(?:fixed|absolute)(?:\s|$)/, `${label} remains in flow in both orientations`);
}
function environment(t) {
  const win = Object.assign(new EventTarget(), { innerWidth: 375, innerHeight: 667 });
  const doc = Object.assign(new EventTarget(), { hidden: false });
  const cleanups = [], restore = [], scrolls = [];
  let focuses = 0;
  for (const [key, value] of [['window', win], ['document', doc], ['Node', EventTarget], ['Image', class ImageAsset {}]]) {
    const previous = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, value });
    restore.push(() => { if (previous) Object.defineProperty(globalThis, key, previous); else delete globalThis[key]; });
  }
  t.after(() => { cleanups.forEach(cleanup => cleanup()); restore.forEach(cleanup => cleanup()); });
  const target = {
    focus: () => { focuses++; }, querySelector: () => target,
    scrollTop: 0, scrollIntoView: options => scrolls.push(options), contains: () => false,
  };
  return { win, target, body: { scrollTop: 0 }, scrolls, get focuses() { return focuses; }, beforeRestore: cleanup => cleanups.push(cleanup) };
}
function setup(t) {
  const env = environment(t);
  let mounted = true;
  const props = { gameOver: false, coach: {
    text: '看棋盘上的①，先连接这两颗黑子。\n连在一起更容易照顾。',
    loading: false, source: 'local', configured: false,
    ask() {}, cancel() {},
  } };
  const host = renderHook(() => CoachAssistant(props));
  const unmount = () => { if (mounted) { mounted = false; host.unmount(); } };
  env.beforeRestore(unmount);
  const render = () => {
    // Bind permanent element refs before the next state/effect render, as a mounted DOM would.
    let tree = host.render();
    for (const element of elements(tree)) {
      if (element.props.ref && typeof element.props.ref === 'object') element.props.ref.current = env.target;
      if (element.type === CoachBubble && element.props.bodyRef) element.props.bodyRef.current = env.body;
    }
    tree = host.render();
    return tree;
  };
  return { env, props, render, unmount };
}
function speech(tree) { return elements(tree).find(element => element.type === CoachBubble); }
function panel(tree) { return elements(tree).find(element => element.type === CoachPanel); }
function escape(win) {
  const event = new Event('keydown');
  Object.defineProperty(event, 'key', { value: 'Escape' });
  win.dispatchEvent(event);
}

test('the module groups speech and permanent tools in one shared Panel beside the character', t => {
  const s = setup(t);
  const tree = s.render();
  inFlow(tree, 'assistant');
  assert.doesNotMatch(tree.props.className, /overflow-y-(auto|scroll)/);
  const character = elements(tree).find(element => /\bcoach-character\b/.test(element.props.className ?? ''));
  inFlow(character, 'full-body character');
  assert.equal(character.type, 'button');
  assert.equal(character.props.type, 'button');
  assert.equal(character.props['aria-label'], '移动讲解助手');
  assert.equal(character.props['aria-hidden'], undefined);
  assert.notEqual(character.props.tabIndex, -1, 'the native drag handle remains keyboard reachable');
  assert.ok(elements(character).some(element => element.type === CoachPet));
  assert.equal(elements(character).filter(element => element.type === 'button').length, 1,
    'the character has one labelled drag handle without nesting another control');
  assert.equal(elements(tree).some(element => element.props.children === '问褚嬴' || element.props.children === '需要时，点我聊聊'), false);
  const conversation = elements(tree).find(element => /\bcoach-conversation\b/.test(element.props.className ?? ''));
  assert.equal(conversation.type, Panel, 'one shared Panel contains both speech and its action footer');
  assert.equal(elements(tree).filter(element => element.type === Panel).length, 1);
  assert.equal(conversation.props['aria-live'], undefined, 'controls are not announced as a new teaching message');
  const siblings = conversation.props.children.filter(element => element && element.type !== 'svg');
  assert.equal(elements(conversation).filter(element => /\bcoach-speech-tail\b/.test(element.props.className ?? '')).length, 1);
  assert.equal(siblings[0].type, CoachBubble, 'the speech is above the controls');
  const tools = siblings[1];
  assert.equal(tools.props.id, 'coach-assistant-panel');
  assert.ok(elements(tools).some(element => element.type === CoachPanel));
  assert.equal(elements(tools).some(element => element.type === CoachBubble), false, 'tools are separate from the speech card');
  inFlow(tools, 'permanent tools');
  assert.match(tools.props.className, /\bcoach-tools\b/);
  assert.equal(speech(tree).props.text, s.props.coach.text);
  assert.ok(speech(tree).props.bodyRef);
  assert.equal(panel(tree).props.coach, s.props.coach);
  assert.equal(panel(tree).props.gameOver, false);
  s.props.gameOver = true;
  assert.equal(panel(s.render()).props.gameOver, true);
});

test('the character exposes movement handlers while a click never asks or cancels teaching', t => {
  const s = setup(t), calls = [];
  s.props.coach.ask = (...args) => calls.push(['ask', ...args]);
  s.props.coach.cancel = () => calls.push(['cancel']);
  const tree = s.render();
  const character = elements(tree).find(element => element.props['aria-label'] === '移动讲解助手');
  for (const name of ['onPointerDown', 'onPointerMove', 'onPointerUp', 'onPointerCancel', 'onLostPointerCapture', 'onKeyDown']) {
    assert.equal(typeof character.props[name], 'function', `${name} is attached to the native handle`);
  }
  const events = [];
  character.props.onClick({ preventDefault: () => events.push('preventDefault'), stopPropagation: () => events.push('stopPropagation') });
  assert.deepEqual(events, ['preventDefault', 'stopPropagation']);
  assert.deepEqual(calls, [], 'clicking the movable artwork never triggers an explanation or cancellation');
  assert.equal(speech(s.render()).props.text, s.props.coach.text);
  const pet = elements(character).find(element => element.type === CoachPet);
  const petHost = renderHook(() => CoachPet(pet.props));
  s.env.beforeRestore(() => petHost.unmount());
  assert.equal(petHost.render().props['aria-hidden'], 'true', 'decorative artwork remains hidden inside the labelled handle');
});

test('board interaction and Escape never dismiss available guidance or the permanent controls', t => {
  const s = setup(t);
  const originalText = s.props.coach.text;
  s.render();
  s.env.win.dispatchEvent(new Event('pointerdown'));
  escape(s.env.win);
  const tree = s.render();
  assert.equal(speech(tree).props.text, originalText);
  assert.ok(panel(tree));
  assert.doesNotMatch(tree.props.className, /\bcoach-details\b/);
  assert.equal(s.env.focuses, 0);
  assert.equal(s.env.scrolls.length, 0);
  s.unmount();
  escape(s.env.win);
  assert.equal(s.env.focuses, 0);
});

test('new replies reset only message scrolling while unrelated renders preserve the reading position', t => {
  const s = setup(t);
  s.render();
  s.env.target.scrollTop = 37;
  s.env.body.scrollTop = 180;
  s.props.gameOver = true;
  s.render();
  assert.equal(s.env.body.scrollTop, 180, 'unrelated state changes do not reset the current reply');
  assert.equal(s.env.target.scrollTop, 37);
  s.props.coach.text = '新的讲解：先连接①附近的黑棋。';
  s.render();
  assert.equal(s.env.body.scrollTop, 0);
  s.env.body.scrollTop = 140;
  s.render();
  assert.equal(s.env.body.scrollTop, 140, 'ordinary renders preserve the reading position');
  s.props.coach.loading = true;
  s.render();
  assert.equal(s.env.body.scrollTop, 0);
  assert.equal(s.env.target.scrollTop, 37);
  assert.equal(s.env.focuses, 0, 'incoming speech does not summon the composer keyboard');
  assert.equal(s.env.scrolls.length, 0);
});

test('text, loading and errors each keep one visible bubble without duplicating the permanent tools', t => {
  const s = setup(t);
  for (const message of [
    { text: '新一手：这块棋还有三口气。', loading: false, error: undefined },
    { text: '', loading: true, error: undefined },
    { text: '', loading: false, error: '连接暂时中断' },
  ]) {
    Object.assign(s.props.coach, message);
    const tree = s.render();
    assert.equal(elements(tree).filter(element => element.type === CoachPanel).length, 1);
    assert.equal(elements(tree).filter(element => element.type === CoachBubble).length, 1);
    assert.equal(speech(tree).props.text, message.text);
    assert.equal(speech(tree).props.loading, message.loading);
    assert.equal(speech(tree).props.error, message.error);
  }
});

test('the complete reply preserves one aria-live scroll area inside the shared module', t => {
  const text = Array.from({ length: 12 }, (_, index) => `第 ${index + 1} 句：①连接黑棋，②观察对方能否打吃。`).join('\n');
  const error = '连接暂时失败，请检查服务地址。'.repeat(8);
  const bodyRef = { current: null };
  const props = { text, loading: false, bodyRef, error, source: 'local' };
  const host = renderHook(() => CoachBubble(props));
  t.after(() => host.unmount());
  const tree = host.render();
  inFlow(tree, 'speech');
  assert.equal(tree.props['aria-label'], '褚嬴提示');
  assert.equal(tree.props['aria-live'], 'polite');
  assert.equal(tree.props['aria-busy'], false);
  assert.equal(tree.props.role, 'status');
  assert.equal(tree.type, 'div', 'the message does not add a second nested card');
  assert.match(tree.props.className, /\bcoach-speech\b/);
  assert.equal(elements(tree).filter(element => /\bcoach-speech-tail\b/.test(element.props.className ?? '')).length, 0);
  assert.equal(elements(tree).some(element => element.type === CoachPanel), false, 'buttons never become part of the speech card');
  assert.ok(elements(tree).some(element => element.props.children === text || element.props.children?.includes?.(text)));
  const scrollers = elements(tree).filter(element => /overflow-y-(auto|scroll)/.test(element.props.className ?? ''));
  assert.equal(scrollers.length, 1);
  assert.equal(scrollers[0].props.ref, bodyRef);
  assert.ok(elements(tree).some(element => element.props.children === '本地'));
  assert.ok(elements(scrollers[0]).some(element => element.props.children === error));
  for (const element of elements(tree)) assert.doesNotMatch(element.props.className ?? '', /truncate|line-clamp/);
  props.loading = true;
  assert.equal(host.render().props['aria-busy'], true);
  props.loading = false;
  props.source = 'cloud';
  assert.ok(elements(host.render()).some(element => element.props.children === 'AI'));
});

test('a quiet position retains the primary controls without inventing an empty message', t => {
  const s = setup(t);
  s.props.coach.text = '';
  const tree = s.render();
  assert.equal(speech(tree), undefined);
  assert.ok(panel(tree));
  assert.equal(elements(tree).some(element => /\bcoach-speech-tail\b/.test(element.props.className ?? '')), false);
  s.props.coach.loading = true;
  assert.ok(speech(s.render()));
});

test('retained guidance labels its original move and opens that exact position through review', t => {
  const s = setup(t);
  const original = { board: [['original-position']], history: [] };
  const inspected = [];
  s.props.coach.previousPosition = original;
  s.props.coach.moveNumber = 7;
  s.props.onInspectPosition = position => inspected.push(position);
  const tree = s.render();
  assert.ok(elements(tree).some(element => element.props.children === '刚才第 7 手'));
  const replay = elements(tree).find(element => element.props['aria-label'] === '回看这步讲解的棋盘');
  assert.ok(replay);
  replay.props.onClick();
  assert.deepEqual(inspected, [original]);
  assert.equal(inspected[0], original);
  assert.equal(speech(tree).props.text, s.props.coach.text);
});

test('the permanent review action is passed through unchanged without secondary panels', t => {
  const s = setup(t);
  const action = { type: 'review-action', props: { children: '回看棋谱' } };
  s.props.reviewAction = action;
  const tree = s.render();
  assert.equal(panel(tree).props.reviewAction, action);
  for (const name of ['onSettings', 'onClose', 'onDetailsChange', 'onShowSpeech', 'dismissVersion', 'onInspectHistory', 'extraTools']) {
    assert.equal(name in panel(tree).props, false, `${name} is no longer part of the assistant interaction`);
  }
  assert.equal(elements(tree).some(element => element.type === 'details'), false);
});

test('service configuration does not hide speech or introduce an expanded state', t => {
  const s = setup(t);
  let tree = s.render();
  assert.doesNotMatch(tree.props.className, /\bcoach-configured\b/);
  s.props.coach.configured = true;
  tree = s.render();
  assert.match(tree.props.className, /\bcoach-configured\b/);
  assert.doesNotMatch(tree.props.className, /\bcoach-details\b/);
  assert.equal(speech(tree).props.text, s.props.coach.text);
  assert.equal(panel(tree).props.coach.configured, true);
  assert.equal(s.env.focuses, 0);
});

test('review reuses the same character, bubble and panel without live composer space or a second replay header', t => {
  const s = setup(t);
  const review = { inVariation: false, variationMoves: 0, error: '' };
  s.props.review = review;
  s.props.coach.configured = true;
  s.props.coach.previousPosition = { board: [], history: [] };
  s.props.coach.moveNumber = 7;
  s.props.onInspectPosition = () => assert.fail('review must not offer a second replay entry');
  const tree = s.render();
  assert.equal(tree.props['aria-label'], '围棋复盘助手');
  assert.doesNotMatch(tree.props.className, /\bcoach-configured\b/);
  for (const Component of [CoachPet, CoachBubble, CoachPanel, Panel]) {
    assert.equal(elements(tree).filter(element => element.type === Component).length, 1);
  }
  assert.equal(panel(tree).props.review, review);
  assert.equal(panel(tree).props.coach, s.props.coach);
  assert.equal(elements(tree).some(element => element.props['aria-label'] === '回看这步讲解的棋盘'), false);
  assert.equal(elements(tree).some(element => element.props.children === '刚才第 7 手'), false);
  assert.equal(elements(tree).some(element => element.type === 'details'), false);
  assert.equal(s.env.focuses, 0);
});

test('quiet review always explains the next action in one sentence while live coaching stays quiet', t => {
  const s = setup(t);
  s.props.coach.text = '';
  s.props.review = { inVariation: false, variationMoves: 0, error: '' };
  let tree = s.render();
  assert.equal(speech(tree).props.text, '用上方按钮选一手，点讲解看原因。');
  assert.equal(speech(tree).props.error, undefined);
  s.props.review.inVariation = true;
  tree = s.render();
  assert.equal(speech(tree).props.text, '在棋盘上试下，点“原谱”回到这手。');
  assert.equal(speech(tree).props.error, undefined);
  s.props.review = undefined;
  assert.equal(speech(s.render()), undefined, 'the review helper text does not leak into live coaching');
});

test('review selects one visible message with trial errors ahead of service errors and explanations', t => {
  const s = setup(t);
  s.props.review = { inVariation: false, variationMoves: 0, error: '' };
  s.props.coach.text = '圈出的棋只剩一口气，先检查能否接长。';
  let tree = s.render();
  assert.equal(speech(tree).props.text, s.props.coach.text);
  assert.equal(speech(tree).props.error, undefined);

  s.env.body.scrollTop = 180;
  s.props.coach.error = 'provider unavailable\nHTTP 503';
  tree = s.render();
  assert.equal(speech(tree).props.text, '讲解暂时不可用，可以重试。');
  assert.equal(speech(tree).props.error, undefined, 'service details do not add a second line to the review bubble');
  assert.equal(s.env.body.scrollTop, 0, 'a changed visible error is a new message');
  s.env.body.scrollTop = 120;
  s.props.coach.loading = true;
  s.props.review.error = '这里不能落子，请换一个交叉点。';
  tree = s.render();
  assert.equal(speech(tree).props.text, s.props.review.error);
  assert.equal(speech(tree).props.loading, false, 'loading must not hide the action error');
  assert.equal(speech(tree).props.error, undefined);
  assert.equal(elements(tree).filter(element => element.type === CoachBubble).length, 1);
  assert.equal(s.env.body.scrollTop, 0);

  s.props.review.error = '';
  s.props.coach.error = undefined;
  tree = s.render();
  assert.equal(speech(tree).props.loading, true);
  s.props.coach.loading = false;
  assert.equal(speech(s.render()).props.text, s.props.coach.text, 'the complete board-bound explanation is preserved rather than sliced in the UI');
});
