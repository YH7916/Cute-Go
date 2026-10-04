import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { loadTestModule } from './helpers/loadTestModule.mjs';

const require = createRequire(import.meta.url);
const leafComponents = new Set(['GameBoard', 'PassConfirmationModal', 'AnalysisPanel', 'CoachAssistant', 'CoachMarkers',
  'AchievementNotification', 'StartScreen', 'AppModals', 'RenderStoneIcon', 'LearningCenter']);
const { AppView, GameControls, GamePlayControls, ScoreBoard, TopBar, GameBoard, CoachAssistant, CoachMarkers, RenderStoneIcon, LearningCenter, CoachReviewTools, StartScreen, Button } = await loadTestModule({
  define: { 'process.env.NODE_ENV': '"production"' },
  plugins: [{ name: 'chrome-test-host', setup(build) {
    build.onResolve({ filter: /jsx-runtime$/ }, () => ({ path: require.resolve('react/jsx-runtime') }));
    build.onResolve({ filter: /^lucide-react$/ }, () => ({ path: pathToFileURL(require.resolve('lucide-react')).href, external: true }));
    build.onResolve({ filter: /\// }, args => {
      const name = args.path.split('/').at(-1);
      return leafComponents.has(name) ? { path: name, namespace: 'chrome-leaf' } : undefined;
    });
    build.onLoad({ filter: /.*/, namespace: 'chrome-leaf' }, args => ({ contents: `export const ${args.path} = () => null;` }));
  } }],
  contents: `export { AppView } from './components/AppView';
    export { GameControls } from './components/GameControls';
    export { GamePlayControls } from './components/GamePlayControls';
    export { ScoreBoard } from './components/ScoreBoard';
    export { TopBar } from './components/common/TopBar';
    export { GameBoard } from './components/GameBoard';
    export { CoachAssistant } from './components/CoachAssistant';
    export { CoachMarkers } from './components/board/CoachMarkers';
    export { LearningCenter } from './components/coach/LearningCenter';
    export { CoachReviewTools } from './components/coach/CoachReviewTools';
    export { StartScreen } from './components/StartScreen';
    export { RenderStoneIcon } from './components/common/RenderStoneIcon';
    export { Button } from './ui/common';`,
});

function elements(node) {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!node || typeof node !== 'object' || !node.props) return [];
  return [node, ...elements(node.type === GamePlayControls ? GamePlayControls(node.props) : node.props.children)];
}
function text(node) {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(text).join('');
  return node?.props ? text(node.props.children) : '';
}
function button(tree, label) {
  const found = elements(tree).find(node => typeof node.props.onClick === 'function'
    && (node.props['aria-label'] === label || text(node).trim() === label));
  assert.ok(found, `Missing ${label}`);
  return found;
}
function controls(overrides = {}) {
  return { appMode: 'playing', setupTool: 'black', reviewIndex: 0, history: [{}],
    setSetupTool() {}, finishSetup() {}, setReviewIndex() {}, setAppMode() {}, setGameOver() {},
    handleUndo() {}, handlePass() {}, resetGame() {}, isThinking: false, gameOver: false,
    onlineStatus: 'disconnected', currentPlayer: 'black', myColor: 'black', consecutivePasses: 0, ...overrides };
}
function model(active, appMode = 'playing') {
  const calls = [];
  return { calls, coach: { active, hintPoints: [], cancel() {} }, review: { inVariation: false, exitVariation() {} },
    teaching: { view: { isOpen: false } },
    settings: { gameType: 'Go', gameMode: 'PvAI', difficulty: 'Fun', boardSize: 9, stoneSkin: 'skeuomorphic',
      stoneAnimationEnabled: false, coachSkin: 'chuying', userColor: 'black' },
    gameState: { ...controls({ appMode }), blackCaptures: 2, whiteCaptures: 5 },
    viewPosition: { board: Array(9), currentPlayer: 'black', blackCaptures: 2, whiteCaptures: 5 },
    handleReturnHome: () => calls.push('home'), setShowMenu: show => calls.push(['settings', show]),
    setShowUserPage: show => calls.push(['profile', show]), vibrate() {}, handleUndo: () => calls.push('undo'),
    handlePass: remote => calls.push(['pass', remote]), resetGame: keepOnline => calls.push(['reset', keepOnline]),
    handleEnterReview: () => calls.push('review'),
    onlineStatus: 'disconnected', showStartScreen: false, showThinkingStatus: false };
}
function component(tree, Component) {
  const matches = elements(tree).filter(node => node.type === Component);
  assert.equal(matches.length, 1, `Exactly one ${Component.name}`);
  return matches[0];
}
function layoutShape(tree) {
  return elements(tree)
    .map(node => ({ type: typeof node.type === 'string' ? node.type : node.type.name ?? node.type.displayName,
    className: node.props.className, role: node.props.role, disabled: node.props.disabled }));
}

test('teaching is a separate page even when companion state and the start screen were previously active', () => {
  const vm = model(true);
  vm.showStartScreen = true;
  vm.teaching.view = { isOpen: true, active: { title: '数气' }, onClose: () => vm.calls.push('wrong-close') };
  const tree = AppView({ vm });
  assert.equal(tree.type, LearningCenter);
  assert.equal(tree.props.active, vm.teaching.view.active);
  assert.equal(elements(tree).some(node => node.type === CoachAssistant || node.type === GameBoard || node.type === GameControls), false);
  tree.props.onClose();
  assert.deepEqual(vm.calls, ['home'], 'leaving teaching uses the shared home transition');
  assert.equal(tree.props.appearance.stoneSkin, vm.settings.stoneSkin);
});

test('home routes deeper teaching without exposing beginner onboarding', () => {
  const vm = model(false);
  vm.showStartScreen = true;
  vm.handleOpenLearning = () => vm.calls.push('learning');
  const start = component(AppView({ vm }), StartScreen);
  assert.equal(Object.hasOwn(start.props, 'onOpenTutorial'), false);
  start.props.onOpenLearning();
  assert.deepEqual(vm.calls, ['learning']);
});

for (const appMode of ['playing', 'setup', 'review']) {
  test(`coach adds explanation while ${appMode} keeps the same classic game chrome`, () => {
    const regular = AppView({ vm: model(false, appMode) });
    const coach = AppView({ vm: model(true, appMode) });
    for (const Component of [TopBar, ScoreBoard, GameControls]) {
      const standardElement = component(regular, Component);
      const coachElement = component(coach, Component);
      assert.deepEqual(layoutShape(Component(coachElement.props)), layoutShape(Component(standardElement.props)),
        `${Component.name} keeps the same layout, sizing and enabled state`);
    }
    const sidebars = [regular, coach].map(tree => elements(tree).find(node => node.props.className?.startsWith('game-sidebar ')));
    assert.deepEqual(layoutShape(sidebars[1]), layoutShape(sidebars[0]),
      'ordinary and companion game and review chrome stay shared');
    if (appMode === 'review') {
      for (const sidebar of sidebars) {
        assert.equal(elements(sidebar).some(node => node.type === CoachReviewTools || node.type === CoachAssistant), false,
          'the original review sidebar never contains a second AI toolbar');
      }
      assert.equal(component(coach, CoachAssistant).props.extraTools, undefined, 'review tools do not add another companion row');
    }
    assert.equal(component(coach, CoachAssistant).props.review?.inVariation, appMode === 'review' ? false : undefined,
      'only review passes variation controls into the shared bottom assistant');
    assert.equal(elements(regular).some(node => node.type === CoachAssistant), false);
    assert.equal(component(coach, CoachAssistant).props.coachSkin, 'chuying');
    assert.equal(component(coach, GameBoard).props.stoneAnimationEnabled, false, 'board animation preference survives the UI correction');
    const top = TopBar(component(coach, TopBar).props);
    assert.deepEqual(elements(top).filter(node => node.type === 'button').map(node => node.props['aria-label']), ['返回首页', '个人中心', '设置']);
    const cards = ScoreBoard(component(coach, ScoreBoard).props);
    assert.ok(elements(cards).some(node => node.props.className === 'score-cards grid grid-cols-2 gap-3'));
    assert.deepEqual(elements(cards).filter(node => node.type === RenderStoneIcon).map(node => [node.props.color, node.props.stoneSkin]),
      [['black', 'skeuomorphic'], ['white', 'skeuomorphic']]);
    assert.match(text(cards), /黑子提子: 2白子提子: 5/);
  });
}

test('coach playing adds one independent companion module beside the unchanged board and game sidebar', () => {
  const regular = AppView({ vm: model(false) });
  const coach = AppView({ vm: model(true) });
  const directChildren = coach.props.children.filter(node => node && typeof node === 'object');
  const regions = directChildren.filter(node => ['game-board-area', 'game-sidebar'].some(name =>
    node.props.className?.split(' ').includes(name)) || node.type === CoachAssistant);
  assert.deepEqual(regions.map(node => node.type === CoachAssistant ? 'assistant' : node.props.className.split(' ')[0]),
    ['game-board-area', 'game-sidebar', 'assistant']);
  const sidebar = regions[1];
  for (const Component of [TopBar, ScoreBoard, GameControls]) {
    assert.equal(component(sidebar, Component), component(coach, Component), 'classic sidebar owns the only instance');
    assert.equal(Object.hasOwn(component(coach, Component).props, 'presentation'), false, 'no second visual variant');
  }
  assert.equal(elements(sidebar).some(node => node.type === CoachAssistant), false, 'the companion module does not replace classic game chrome');
  const actions = GameControls(component(coach, GameControls).props);
  assert.deepEqual(elements(actions).filter(node => node.type === 'button').map(node => text(node).trim()), ['悔棋', '停着', '重开']);
  assert.deepEqual(layoutShape(actions), layoutShape(GameControls(component(regular, GameControls).props)), 'the original controls stay shared');
  assert.equal(component(coach, GameBoard).props.stoneAnimationEnabled, false);
  assert.equal(component(coach, CoachAssistant).props.coachSkin, 'chuying');
});

test('ordinary play has no review entry or reserved sidebar space', () => {
  for (const modify of [
    () => {},
    candidate => { candidate.gameState.gameOver = true; },
    candidate => { candidate.gameState.history = []; },
    candidate => { candidate.onlineStatus = 'connected'; },
    candidate => { candidate.gameState.appMode = 'setup'; },
    candidate => { candidate.settings.gameType = 'Gomoku'; },
  ]) {
    const vm = model(false);
    modify(vm);
    const tree = AppView({ vm });
    assert.equal(elements(tree).some(node => node.props['aria-label'] === '回看棋谱'
      || text(node).trim() === '回看棋谱'), false);
    const actions = elements(tree).find(node => node.props.className?.startsWith('game-actions '));
    assert.equal(actions.props.children.filter(Boolean).length, 2, 'only score and controls occupy this sidebar');
    assert.deepEqual(vm.calls, [], 'rendering never enters review');
  }
});

test('companion retains the icon review action and the original route without a sidebar entry', () => {
  const vm = model(true), tree = AppView({ vm });
  const sidebar = elements(tree).find(node => node.props.className?.startsWith('game-sidebar '));
  assert.equal(elements(sidebar).some(node => node.props['aria-label'] === '回看棋谱'), false);
  const entry = component(tree, CoachAssistant).props.reviewAction;
  assert.equal(entry.props['aria-label'], '回看棋谱');
  assert.equal(entry.props.title, '回看棋谱');
  assert.equal(entry.props.appearance, 'retro');
  assert.equal(entry.props.variant, 'secondary');
  assert.equal(text(entry), '', 'the companion entry uses an icon without visible text');
  assert.match(entry.props.className, /\bh-11\b/);
  assert.match(entry.props.className, /\bw-11\b/);
  assert.ok(elements(entry.props.children).some(node => node.props['aria-hidden'] === 'true'));
  entry.props.onClick();
  assert.deepEqual(vm.calls, ['review']);
  for (const modify of [
    candidate => { candidate.gameState.history = []; },
    candidate => { candidate.onlineStatus = 'connected'; },
    candidate => { candidate.gameState.appMode = 'setup'; },
    candidate => { candidate.settings.gameType = 'Gomoku'; },
  ]) {
    const unavailable = model(true);
    modify(unavailable);
    assert.equal(component(AppView({ vm: unavailable }), CoachAssistant).props.reviewAction, undefined);
  }
});

for (const coachMode of [false, true]) {
  test(`${coachMode ? 'companion' : 'ordinary'} Go review keeps the original controls above one shared bottom assistant`, () => {
    const vm = model(true, 'review');
    vm.settings.coachMode = coachMode;
    vm.settings.gameMode = coachMode ? 'PvAI' : 'PvP';
    const tree = AppView({ vm });
    const sidebar = elements(tree).find(node => node.props.className?.startsWith('game-sidebar '));
    const assistant = component(tree, CoachAssistant);
    assert.ok(tree.props.children.includes(assistant), 'review reuses the same independent bottom module as live coaching');
    assert.equal(assistant.props.review, vm.review);
    assert.equal(assistant.props.reviewAction, undefined, 'there is no second entry into the review already being viewed');
    assert.equal(elements(sidebar).some(node => node.type === CoachAssistant || node.type === CoachReviewTools), false);
    assert.equal(elements(tree).some(node => node.type === CoachReviewTools), false, 'review actions are composed inside the bottom assistant');
    const originalControls = GameControls(component(tree, GameControls).props);
    const reviewButtons = elements(originalControls).filter(node => node.type === 'button' || node.type === Button)
      .map(node => node.type === Button ? Button(node.props) : node);
    assert.deepEqual(reviewButtons.map(node => node.props['aria-label']),
      ['上一手', '下一手', '查看结果']);
    const slider = elements(originalControls).find(node => node.props['aria-label'] === '棋谱进度');
    assert.equal(slider.props.value, vm.gameState.reviewIndex);
    assert.equal(slider.props.max, vm.gameState.history.length);
    assert.deepEqual(vm.calls, [], 'rendering review does not activate live coaching or navigate');
    assert.equal(vm.settings.coachMode, coachMode);
  });
}

test('review tools add only trial controls and never another card, history list or navigation row', () => {
  const calls = [];
  const review = { inVariation: false, variationMoves: 0,
    startVariation: () => calls.push('start'), undoVariation: () => calls.push('undo'),
    exitVariation: () => calls.push('exit') };
  for (const inVariation of [false, true]) {
    review.inVariation = inVariation;
    const tree = CoachReviewTools({ review });
    assert.equal(tree.type, Symbol.for('react.fragment'));
    const actions = elements(tree).filter(node => typeof node.props.onClick === 'function');
    assert.deepEqual(actions.map(node => node.props['aria-label']), inVariation ? ['返回原谱', '退一手'] : ['从这里试下']);
    assert.ok(actions.every(node => node.type === Button && node.props.appearance === 'retro'));
    assert.equal(actions[0].props.variant, 'secondary');
    for (const label of ['最近问答', '本局教学重点', '个人局面', '记住这个局面', '试下停着', '上一手', '下一手', '查看结果', '退出复盘']) {
      assert.equal(elements(tree).some(node => node.props['aria-label'] === label), false);
    }
    actions[0].props.onClick();
    if (inVariation) {
      assert.equal(button(tree, '退一手').props.disabled, true);
      review.variationMoves = 1;
      const undo = button(CoachReviewTools({ review }), '退一手');
      assert.notEqual(undo.props.disabled, true);
      assert.match(undo.props.className, /\bh-11\b/);
      assert.match(undo.props.className, /\bw-11\b/);
      undo.props.onClick();
    }
  }
  assert.deepEqual(calls, ['start', 'exit', 'undo']);
});

test('original review navigation still cancels guidance and leaves the trial before changing the record', () => {
  const vm = model(true, 'review');
  vm.coach.cancel = () => vm.calls.push('cancel');
  vm.review.exitVariation = () => vm.calls.push('exit-trial');
  vm.gameState.setReviewIndex = index => vm.calls.push(['cursor', index]);
  const game = component(AppView({ vm }), GameControls);
  const slider = elements(GameControls(game.props)).find(node => node.props['aria-label'] === '棋谱进度');
  slider.props.onChange({ target: { value: '1' } });
  assert.deepEqual(vm.calls, ['cancel', 'exit-trial', ['cursor', 1]]);
});

test('review errors hide superseded explanation marks while normal review and live errors preserve their points', () => {
  const points = [{ x: 1, y: 2, label: 'B7' }, { x: 2, y: 2, label: 'C7' }];
  for (const [appMode, reviewError, coachError, hidden] of [
    ['review', '', undefined, false],
    ['review', '这里不能落子。', undefined, true],
    ['review', '', '讲解服务不可用。', true],
    ['review', '这里不能落子。', '讲解服务不可用。', true],
    ['playing', '', '讲解服务不可用。', false],
    ['playing', '旧试下错误', undefined, false],
  ]) {
    const vm = model(true, appMode);
    vm.coach.text = '看①这块棋和②的连接。';
    vm.coach.hintPoints = points;
    vm.coach.error = coachError;
    vm.review.error = reviewError;
    const board = component(AppView({ vm }), GameBoard);
    const markers = component(board.props.extraSVG, CoachMarkers);
    if (hidden) assert.deepEqual(markers.props.points, [], 'an error-only review message must not leave unrelated circles');
    else assert.equal(markers.props.points, points, 'normal review and existing live fallback retain their board-bound marks');
    assert.equal(markers.props.board, vm.viewPosition.board);
  }
});

test('coach status retains classic black/white cards, capture ownership and selected stone material', () => {
  const vm = model(true);
  vm.settings.userColor = 'white';
  vm.settings.coachSkin = 'kejie';
  vm.viewPosition.currentPlayer = 'white';
  const scoreProps = component(AppView({ vm }), ScoreBoard).props;
  const score = ScoreBoard(scoreProps);
  assert.deepEqual(elements(score).filter(node => node.type === RenderStoneIcon).map(node => [node.props.color, node.props.stoneSkin]),
    [['black', 'skeuomorphic'], ['white', 'skeuomorphic']]);
  assert.match(text(score), /黑子提子: 2白子提子: 5/);
  assert.doesNotMatch(text(score), /柯洁|褚嬴/);
  const thinking = ScoreBoard({ ...scoreProps, isThinking: true });
  const cards = elements(thinking).find(node => node.props.className === 'score-cards grid grid-cols-2 gap-3').props.children;
  assert.equal(elements(cards[0]).some(node => node.props.className?.includes('animate-ping')), false);
  assert.equal(elements(cards[1]).some(node => node.props.className?.includes('animate-ping')), true, 'thinking indicator follows the white turn');
});

test('classic controls retain undo/pass restrictions and the visible reset action', () => {
  const cases = [
    [{}, false, false], [{ history: [] }, true, false], [{ isThinking: true }, true, true],
    [{ gameOver: true }, true, true], [{ onlineStatus: 'connected' }, true, false],
    [{ onlineStatus: 'connected', currentPlayer: 'white' }, true, true],
  ];
  for (const [overrides, undoDisabled, passDisabled] of cases) {
    const tree = GameControls(controls(overrides));
    assert.equal(button(tree, '悔棋').props.disabled, undoDisabled);
    assert.equal(button(tree, '停着').props.disabled, passDisabled);
    assert.ok(button(tree, '重开'));
  }
  assert.ok(button(GameControls(controls({ consecutivePasses: 1 })), '结算'));
});

test('both modes invoke the original navigation and game callbacks directly', () => {
  for (const active of [false, true]) {
    const vm = model(active), tree = AppView({ vm });
    const top = TopBar(component(tree, TopBar).props);
    for (const label of ['返回首页', '个人中心', '设置']) button(top, label).props.onClick();
    const game = GameControls(component(tree, GameControls).props);
    for (const label of ['悔棋', '停着', '重开']) button(game, label).props.onClick();
    assert.deepEqual(vm.calls, ['home', ['profile', true], ['settings', true], 'undo', ['pass', false], ['reset', false]]);
  }
  const calls = [];
  button(GameControls(controls({ onlineStatus: 'connected', resetGame: keepOnline => calls.push(keepOnline) })), '重开').props.onClick();
  assert.deepEqual(calls, [true], 'connected reset preserves the existing session policy');
});

for (const gameOver of [false, true]) {
  test(`review buttons and slider preserve the ${gameOver ? 'finished' : 'unfinished'} game without exposing an exit button`, () => {
    const vm = model(true, 'review');
    vm.gameState.gameOver = gameOver;
    vm.gameState.history = [{}, {}, {}];
    vm.gameState.reviewIndex = 1;
    vm.gameState.setAppMode = value => vm.calls.push(['mode', value]);
    vm.gameState.setGameOver = value => vm.calls.push(['over', value]);
    vm.gameState.setReviewIndex = value => vm.calls.push(['cursor', value]);
    vm.setShowTerritory = value => vm.calls.push(['territory', value]);
    vm.showTerritory = false;
    const game = component(AppView({ vm }), GameControls);
    const tree = GameControls(game.props);
    assert.equal(elements(tree).some(node => node.props['aria-label'] === '退出复盘'), false);
    button(tree, '上一手').props.onClick();
    button(tree, '下一手').props.onClick();
    elements(tree).find(node => node.props['aria-label'] === '棋谱进度').props.onChange({ target: { value: '0' } });
    button(tree, '查看结果').props.onClick();
    assert.deepEqual(vm.calls, [['cursor', 0], ['cursor', 2], ['cursor', 0], ['cursor', 3], ['territory', true]],
      'record navigation and results never end a live game or change the application mode');
    assert.equal(vm.gameState.gameOver, gameOver);
  });
}
