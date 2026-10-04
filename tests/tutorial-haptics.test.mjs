import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadTestModule } from './helpers/loadTestModule.mjs';

const require = createRequire(import.meta.url);
// Exercise the tutorial's real callbacks with the shared hook host and JSX.
// Device vibration and React/browser dispatch still require device acceptance.
const { TutorialModal, TutorialGuide, GameBoard, renderHook, tutorialContent } = await loadTestModule({
  reactHost: true, define: { 'process.env.NODE_ENV': '"production"' },
  plugins: [{ name: 'real-jsx-runtime', setup(build) {
    build.onResolve({ filter: /jsx-runtime$/ }, () => ({ path: require.resolve('react/jsx-runtime') }));
    build.onResolve({ filter: /^lucide-react$/ }, () => ({
      path: pathToFileURL(require.resolve('lucide-react')).href, external: true,
    }));
    build.onResolve({ filter: /\/GameBoard$/ }, () => ({ path: 'tutorial-board', namespace: 'tutorial-test' }));
    build.onLoad({ filter: /.*/, namespace: 'tutorial-test' }, () => ({
      contents: `export const GameBoard = () => null;
        export { calculateBoardConstants } from './components/board/geometry';`,
      loader: 'ts', resolveDir: dirname(require.resolve('../package.json')),
    }));
  } }],
  contents: `export { TutorialModal } from './components/TutorialModal';
    export { tutorialContent } from './domains/coach/beginnerTutorial';
    export { TutorialGuide } from './components/TutorialGuide';
    export { GameBoard } from './components/GameBoard';
    export { renderHook } from './tests/helpers/reactHooks';`,
});

function allElements(node) {
  if (Array.isArray(node)) return node.flatMap(allElements);
  if (!node || typeof node !== 'object' || !node.props) return [];
  return [node, ...allElements(node.props.children)];
}

function setup(t, vibrate, onClose = () => {}, onExplore = () => {}, options = {}) {
  const nativeVibrations = [];
  const oldNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true, value: { vibrate: pattern => nativeVibrations.push(pattern) },
  });
  let props = { isOpen: true, onClose, onExplore, vibrate, tutorialContent, ...options };
  const host = renderHook(() => TutorialModal(props));
  const render = () => { host.render(); return host.render(); };
  const board = () => allElements(render()).find(item => item.type === GameBoard);
  const guide = () => allElements(render()).find(item => item.type === TutorialGuide);
  const click = label => {
    const button = allElements(render()).find(item => item.type === 'button'
      && (item.props['aria-label'] === label
        || (Array.isArray(item.props.children) && item.props.children.includes(label))));
    assert.ok(button, `Missing tutorial action ${label}`);
    assert.notEqual(button.props.disabled, true, `${label} must be available`);
    button.props.onClick();
  };
  t.after(() => {
    host.unmount();
    if (oldNavigator) Object.defineProperty(globalThis, 'navigator', oldNavigator);
    else delete globalThis.navigator;
  });
  render();
  return { board, guide, click, nativeVibrations, render,
    setProps: next => { props = { ...props, ...next }; render(); } };
}

function completeTutorial(s) {
  s.click('下一步'); // qi -> capture
  s.board().props.onIntersectionClick(0, 0); // wrong capture
  s.board().props.onIntersectionClick(2, 3); // successful capture
  s.click('下一步'); // capture -> connection
  s.click('下一步'); // connection -> escape
  s.board().props.onIntersectionClick(2, 3);
  s.click('下一步'); // escape -> connect
  s.board().props.onIntersectionClick(2, 2);
  s.click('下一步'); // connect -> capture group
  s.board().props.onIntersectionClick(2, 3);
  s.click('下一步'); // capture group -> forbidden
  s.board().props.onIntersectionClick(2, 2);
  s.click('下一步'); // forbidden -> ko
  s.board().props.onIntersectionClick(2, 2);
  assert.equal(s.board().props.currentPlayer, 'white');
  s.board().props.onIntersectionClick(1, 2);
  s.click('下一步'); // ko -> eyes
  s.board().props.onIntersectionClick(3, 3);
  s.click('下一步'); // eyes -> endgame
  s.click('停着');
  s.click('下一步'); // endgame -> territory
  s.click('计算地盘');
  s.click('下一步'); // territory -> final shape
  s.board().props.onIntersectionClick(2, 2);
  s.board().props.onIntersectionClick(4, 3);
}

test('tutorial feedback uses the supplied haptic callback for every teaching action', t => {
  const patterns = [];
  const vibrate = pattern => patterns.push(pattern);
  const s = setup(t, vibrate);
  completeTutorial(s);
  assert.deepEqual(patterns, [50, [20, 30, 20], [20, 30, 20], [20, 30, 20], [20, 30, 20],
    200, [20, 30, 20], 200, [20, 30, 20], 20, 20, [20, 30, 20]]);
  assert.deepEqual(s.nativeVibrations, [], 'tutorial must not bypass the application haptic preference');
});

test('a disabled application haptic callback keeps the entire tutorial silent', t => {
  const s = setup(t, () => {});
  completeTutorial(s);
  assert.deepEqual(s.nativeVibrations, []);
});

test('tutorial board inspection receives the same preference-aware haptic callback', t => {
  const vibrate = () => {};
  const s = setup(t, vibrate);
  assert.equal(s.board().props.vibrate, vibrate);
});

test('tutorial continues through the optional board guide and one exploration page before closing', t => {
  let closes = 0;
  const s = setup(t, () => {}, () => { closes++; });
  completeTutorial(s);
  const finalPuzzleKey = s.board().key;

  s.click('下一步');
  assert.equal(closes, 0, 'finishing the board lessons must not close the tutorial');
  const zoomBoard = s.board();
  assert.ok(zoomBoard, 'the zoom guide reuses the interactive GameBoard');
  assert.notEqual(zoomBoard.key, finalPuzzleKey, 'new board pages reset the prior view');
  assert.equal(s.guide(), undefined);
  const examplePosition = structuredClone(zoomBoard.props.board);
  zoomBoard.props.onIntersectionClick(0, 0);
  assert.deepEqual(s.board().props.board, examplePosition, 'board inspection must preserve the zoom example');

  s.click('上一页');
  assert.equal(s.board().key, finalPuzzleKey);
  s.board().props.onIntersectionClick(2, 2);
  s.board().props.onIntersectionClick(4, 3);
  s.click('下一步');
  assert.equal(s.board().key, zoomBoard.key);

  s.click('下一步'); // Touch input is optional, including on desktop.
  assert.equal(s.board(), undefined);
  assert.equal(typeof s.guide().props.onExplore, 'function');
  s.click('上一页');
  assert.equal(s.board().key, zoomBoard.key);
  s.click('下一步');
  assert.ok(s.guide());
  assert.equal(closes, 0, 'navigation between guide pages must not close the tutorial');
  s.click('完成');
  assert.equal(closes, 1);
});

for (const destination of ['learning', 'local', 'online', 'ai', 'coach']) {
  test(`exploring ${destination} closes the beginner tutorial before opening its existing mode`, t => {
    const calls = [];
    const s = setup(t, () => {}, () => calls.push('close'), target => calls.push(target));
    completeTutorial(s);
    s.click('下一步');
    s.click('下一步');
    const guide = TutorialGuide(s.guide().props);
    const modes = allElements(guide).filter(item => typeof item.props.onClick === 'function');
    assert.equal(modes.length, 5);
    const mode = modes.find(item => item.key === destination);
    assert.ok(mode);
    mode.props.onClick();
    assert.deepEqual(calls, ['close', destination]);
  });
}

test('opening a catalog lesson selects it and reopening clears its prior answer', t => {
  const s = setup(t, () => {}, () => {}, undefined, { initialStepId: 'beginner-capture' });
  assert.equal(s.board().props.board[2][2].color, 'white');
  s.board().props.onIntersectionClick(2, 3);
  assert.equal(s.board().props.board[2][2], null);
  s.setProps({ isOpen: false });
  assert.equal(s.render(), null);
  s.setProps({ isOpen: true });
  assert.equal(s.board().props.board[2][2].color, 'white');
  assert.equal(s.board().props.board[3][2], null);
  s.setProps({ initialStepId: 'beginner-two-eyes' });
  assert.equal(s.board().props.board.length, 7);
  assert.equal(s.board().props.board[3][3], null);
  s.setProps({ initialStepId: 'missing-lesson' });
  assert.equal(s.board().props.board.length, 5);
  assert.equal(s.board().props.showQi, true);
});

test('catalog completion without a mode launcher returns to the course list', t => {
  let closes = 0;
  const s = setup(t, () => {}, () => { closes++; }, undefined,
    { initialStepId: 'beginner-explore', onExplore: undefined });
  assert.equal(s.guide(), undefined);
  const button = allElements(s.render()).find(node => node.type === 'button' && node.props.children === '返回课程');
  assert.ok(button);
  button.props.onClick();
  assert.equal(closes, 1);
});
