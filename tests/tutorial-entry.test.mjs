import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { loadTestModule } from './helpers/loadTestModule.mjs';

const require = createRequire(import.meta.url);
const leaves = new Set(['TutorialModal', 'SettingsModal', 'CoachSettings', 'UserPage', 'OnlineMenu',
  'ImportExportModal', 'EndGameModal', 'OfflineLoadingModal', 'LoginModal', 'AboutModal', 'SkinShopModal',
  'GameBoard', 'ScoreBoard', 'GameControls', 'PassConfirmationModal', 'AnalysisPanel', 'CoachAssistant',
  'CoachMarkers', 'LearningCenter', 'AchievementNotification']);
const { useAppUiState, AppView, AppModals, TutorialModal, StartScreen, renderHook } = await loadTestModule({
  reactHost: true, define: { 'process.env.NODE_ENV': '"production"' },
  plugins: [{ name: 'tutorial-entry-host', setup(build) {
    build.onResolve({ filter: /jsx-runtime$/ }, () => ({ path: require.resolve('react/jsx-runtime') }));
    build.onResolve({ filter: /^lucide-react$/ }, () => ({ path: pathToFileURL(require.resolve('lucide-react')).href, external: true }));
    build.onResolve({ filter: /\// }, args => {
      const name = args.path.split('/').at(-1);
      return leaves.has(name) ? { path: name, namespace: 'tutorial-entry-leaf' } : undefined;
    });
    build.onLoad({ filter: /.*/, namespace: 'tutorial-entry-leaf' }, args => ({ contents: `export const ${args.path} = () => null;` }));
  } }],
  contents: `export { useAppUiState } from './hooks/useAppUiState';
    export { AppView } from './components/AppView';
    export { AppModals } from './components/app/AppModals';
    export { TutorialModal } from './components/TutorialModal';
    export { StartScreen } from './components/StartScreen';
    export { renderHook } from './tests/helpers/reactHooks';`,
});
function elements(node) {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!node || typeof node !== 'object' || !node.props) return [];
  return [node, ...elements(node.props.children)];
}
function text(node) {
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(text).join('');
  return node?.props ? text(node.props.children) : '';
}
function storage(t, seen) {
  const prior = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const values = new Map(seen ? [['cute_go_tutorial_seen', 'true']] : []);
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value),
  } });
  t.after(() => { if (prior) Object.defineProperty(globalThis, 'localStorage', prior); else delete globalThis.localStorage; });
  return values;
}

for (const seen of [false, true]) {
  test(`the original beginner tutorial ${seen ? 'stays closed for an existing learner' : 'opens on first run'}`, t => {
    storage(t, seen);
    const host = renderHook(() => useAppUiState(false));
    t.after(() => host.unmount());
    host.render();
    assert.equal(host.render().showTutorial, !seen);
    host.render().setShowTutorial(false);
    assert.equal(host.render().showTutorial, false, 'ordinary renders do not repeatedly reopen the tutorial');
    host.render().setShowTutorial(true);
    assert.equal(host.render().showTutorial, true, 'the manual beginner entry remains available');
  });
}

test('the restored modal keeps original animation and haptic preferences and records dismissal', t => {
  const values = storage(t, false), calls = [], vibrate = () => {};
  const tutorialContent = {};
  const vm = { showTutorial: true, setShowTutorial: value => calls.push(value), vibrate,
    teaching: { tutorialContent },
    settings: { gameType: 'Go', gameMode: 'PvAI', difficulty: 'Fun', boardSize: 9, userColor: 'black', stoneAnimationEnabled: false },
    coachSettings: {}, gameState: { appMode: 'playing', gameOver: false } };
  const host = renderHook(() => AppModals({ vm }));
  t.after(() => host.unmount());
  const tutorial = elements(host.render()).find(node => node.type === TutorialModal);
  assert.ok(tutorial);
  assert.equal(tutorial.props.isOpen, true);
  assert.equal(tutorial.props.tutorialContent, tutorialContent, 'first-run and settings entry receive the shared course content');
  assert.equal(tutorial.props.vibrate, vibrate);
  assert.equal(tutorial.props.stoneAnimationEnabled, false);
  tutorial.props.onClose();
  assert.deepEqual(calls, [false]);
  assert.equal(values.get('cute_go_tutorial_seen'), 'true');
});

test('home routes classroom and companion through the existing owners without a beginner tutorial entry', t => {
  storage(t, true);
  const calls = [];
  const host = renderHook(() => {
    const ui = useAppUiState(false);
    const vm = { ...ui, settings: { gameType: 'Go', gameMode: 'PvAI' },
      gameState: { appMode: 'playing', history: [] }, viewPosition: { board: [], currentPlayer: 'black' },
      coach: { active: false }, coachSettings: {}, review: {}, teaching: { view: { isOpen: false }, tutorialContent: {} },
      handleOpenLearning: () => calls.push('classroom'), handleStartCoach: () => calls.push('companion'),
      handleStartGame: (...args) => calls.push(['game', ...args]) };
    const app = AppView({ vm });
    const start = elements(app).find(node => node.type === StartScreen);
    return { home: StartScreen(start.props), modals: AppModals({ vm }) };
  });
  t.after(() => host.unmount());
  const { home } = host.render();
  const content = elements(home).find(node => node.props.onStartCoach && node.props.onOpenLearning);
  const tree = content.type(content.props);
  const beginner = elements(tree).find(node => node.props.label === '新手教学');
  const classroom = elements(tree).find(node => node.props.label === '围棋课堂');
  const companion = elements(tree).find(node => node.type === 'button' && text(node).includes('陪我下棋'));
  assert.equal(beginner, undefined);
  assert.ok(classroom);
  assert.ok(companion);
  assert.equal(elements(host.render().modals).find(node => node.type === TutorialModal).props.isOpen, false);
  classroom.props.onClick(); companion.props.onClick();
  assert.deepEqual(calls, ['classroom', 'companion']);
  assert.equal(elements(host.render().modals).find(node => node.type === TutorialModal).props.isOpen, false);
  elements(home).find(node => node.props.label === '五子棋').props.onClick();
  const gomoku = elements(host.render().home).find(node => node.props.onStartGame && !node.props.onOpenLearning);
  assert.ok(gomoku);
  assert.equal(gomoku.props.onStartCoach, undefined);
  const gomokuTree = gomoku.type(gomoku.props);
  assert.equal(elements(gomokuTree).some(node => ['新手教学', '围棋课堂'].includes(node.props.label)), false);
  elements(gomokuTree).find(node => node.type === 'button' && text(node).includes('AI 对战')).props.onClick();
  assert.deepEqual(calls.at(-1), ['game', 'PvAI', 'local', 'Gomoku']);
});

for (const [destination, expected] of [
  ['learning', ['learning']], ['local', ['start', 'PvP', undefined, 'Go']],
  ['online', ['online', true]], ['ai', ['start', 'PvAI', 'local', 'Go']], ['coach', ['coach']],
]) {
  test(`beginner exploration routes ${destination} through the existing application owner`, t => {
    const values = storage(t, false), calls = [];
    const vm = { settings: {}, coachSettings: {}, gameState: {}, showTutorial: true,
      setShowTutorial: value => calls.push(['tutorial', value]),
      handleOpenLearning: () => calls.push(['learning']), handleStartCoach: () => calls.push(['coach']),
      handleStartGame: (...args) => calls.push(['start', ...args]),
      setShowOnlineMenu: value => calls.push(['online', value]),
    };
    const host = renderHook(() => AppModals({ vm }));
    t.after(() => host.unmount());
    const tutorial = elements(host.render()).find(node => node.type === TutorialModal);
    tutorial.props.onClose();
    tutorial.props.onExplore(destination);
    assert.deepEqual(calls, [['tutorial', false], expected]);
    assert.equal(values.get('cute_go_tutorial_seen'), 'true');
  });
}
