import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { loadTestModule } from './helpers/loadTestModule.mjs';

const require = createRequire(import.meta.url);
const leafComponents = new Set(['StoneSkinPreview', 'RenderStoneIcon', 'GameBoard', 'PassConfirmationModal',
  'AnalysisPanel', 'CoachMarkers', 'AchievementNotification', 'StartScreen', 'AppModals']);
const { AppView, SkinShopModal, CoachAssistant, CoachBubble, CoachPet, ScoreBoard, renderHook } = await loadTestModule({
  reactHost: true, define: { 'process.env.NODE_ENV': '"production"', 'import.meta.env.BASE_URL': '"/"' },
  plugins: [{ name: 'real-jsx-runtime', setup(build) {
    build.onResolve({ filter: /jsx-runtime$/ }, () => ({ path: require.resolve('react/jsx-runtime') }));
    build.onResolve({ filter: /^lucide-react$/ }, () => ({ path: pathToFileURL(require.resolve('lucide-react')).href, external: true }));
    build.onResolve({ filter: /\// }, args => {
      const name = args.path.split('/').at(-1);
      return leafComponents.has(name) ? { path: name, namespace: 'skin-test-leaf' } : undefined;
    });
    build.onLoad({ filter: /.*/, namespace: 'skin-test-leaf' }, args => ({ contents: `export const ${args.path} = () => null;` }));
  } }],
  contents: `export { AppView } from './components/AppView';
    export { SkinShopModal } from './components/SkinShopModal';
    export { CoachAssistant } from './components/CoachAssistant';
    export { CoachBubble } from './components/coach/CoachBubble';
    export { CoachPet } from './components/CoachPet';
    export { ScoreBoard } from './components/ScoreBoard';
    export { renderHook } from './tests/helpers/reactHooks';`,
});

function elements(node) {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!node || typeof node !== 'object' || !node.props) return [];
  return [node, ...elements(node.props.children)];
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
function environment(t) {
  const doc = Object.assign(new EventTarget(), { hidden: false });
  const assets = [], cleanups = [], restore = [];
  class ImageAsset { constructor() { assets.push(this); } }
  for (const [key, value] of [['window', new EventTarget()], ['document', doc], ['Image', ImageAsset]]) {
    const previous = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, value });
    restore.push(() => { if (previous) Object.defineProperty(globalThis, key, previous); else Reflect.deleteProperty(globalThis, key); });
  }
  t.after(() => { cleanups.forEach(cleanup => cleanup()); restore.forEach(cleanup => cleanup()); });
  return { assets, doc, register: host => { cleanups.push(() => host.unmount()); return host; } };
}

test('shop companion category changes only the chosen companion and retains both existing appearance categories', t => {
  const calls = [];
  const props = { isOpen: true, currentBoardSkin: 'wood', currentStoneSkin: 'classic', currentCoachSkin: 'chuying',
    onSetCoachSkin: value => { calls.push(['coach', value]); props.currentCoachSkin = value; },
    onSetBoardSkin: value => calls.push(['board', value]), onSetStoneSkin: value => calls.push(['stone', value]), onClose() {} };
  const host = renderHook(() => SkinShopModal(props));
  t.after(() => host.unmount());
  let tree = host.render();
  button(tree, '陪练精灵').props.onClick();
  tree = host.render();
  assert.equal(button(tree, '陪练精灵').props['aria-pressed'], true);
  assert.equal(button(tree, '选择褚嬴陪练精灵').props['aria-pressed'], true);
  assert.equal(button(tree, '选择柯洁陪练精灵').props['aria-pressed'], false);
  const portraits = elements(tree).filter(node => node.type === 'img');
  assert.equal(portraits.length, 2);
  assert.match(portraits.find(node => node.props.alt === '柯洁 Q版精灵').props.src, /^\/coach\/kejie\/poster\.png/);
  button(tree, '选择柯洁陪练精灵').props.onClick();
  tree = host.render();
  assert.equal(button(tree, '选择柯洁陪练精灵').props['aria-pressed'], true);
  assert.equal(button(tree, '选择褚嬴陪练精灵').props['aria-pressed'], false);
  assert.deepEqual(calls, [['coach', 'kejie']]);
  for (const tab of ['棋子皮肤', '棋盘主题']) {
    button(tree, tab).props.onClick();
    tree = host.render();
    assert.equal(button(tree, tab).props['aria-pressed'], true);
    assert.equal(elements(tree).some(node => node.props['aria-label'] === '选择柯洁陪练精灵'), false);
  }
  props.isOpen = false;
  assert.equal(host.render(), null);
});

test('assistant and speech follow the selected companion inside the independent module', t => {
  const env = environment(t);
  const props = { coachSkin: 'kejie', gameOver: false, onSettings() {}, coach: { text: '先照顾这块棋。', loading: false } };
  const host = env.register(renderHook(() => CoachAssistant(props)));
  for (const [id, name] of [['kejie', '柯洁'], ['chuying', '褚嬴']]) {
    props.coachSkin = id;
    const tree = host.render();
    assert.doesNotMatch(text(tree), /问褚嬴|问柯洁/, 'the selected character does not introduce a separate invitation label');
    const pet = elements(tree).find(node => node.type === CoachPet);
    assert.equal(pet.props.skinId, id);
    const bubble = elements(tree).find(node => node.type === CoachBubble);
    assert.equal(CoachBubble(bubble.props).props['aria-label'], `${name}提示`);
  }
});

test('AppView changes the independent companion module while both modes retain the same classic score cards', () => {
  const vm = { coach: { active: true, hintPoints: [] }, review: { inVariation: false },
    teaching: { view: { isOpen: false } },
    settings: { gameType: 'Go', gameMode: 'PvAI', difficulty: 'Fun', boardSize: 9, stoneSkin: 'skeuomorphic', userColor: 'black' },
    gameState: { appMode: 'playing', history: [], consecutivePasses: 0, gameOver: false },
    viewPosition: { board: Array(9), blackCaptures: 7, whiteCaptures: 3 },
    onlineStatus: 'disconnected', showStartScreen: false, showThinkingStatus: true };
  for (const active of [true, false]) for (const currentPlayer of ['black', 'white']) {
    vm.coach.active = active;
    vm.viewPosition.currentPlayer = currentPlayer;
    const positionProps = [];
    for (const coachSkin of ['chuying', 'kejie']) {
      vm.settings.coachSkin = coachSkin;
      const tree = AppView({ vm });
      const assistant = elements(tree).find(node => node.type === CoachAssistant);
      if (active) assert.equal(assistant.props.coachSkin, coachSkin);
      else assert.equal(assistant, undefined, 'ordinary play does not mount the companion module');
      const score = elements(tree).find(node => node.type === ScoreBoard);
      assert.equal(Object.hasOwn(score.props, 'presentation'), false, 'both modes share one classic presentation');
      assert.equal(Object.hasOwn(score.props, 'coachName'), false, 'companion display names stay inside the companion module');
      assert.equal(Object.hasOwn(score.props, 'coachSkin'), false, 'the classic scoreboard does not receive a character skin');
      assert.equal(score.props.currentPlayer, currentPlayer);
      assert.equal(score.props.blackCaptures, 7);
      assert.equal(score.props.whiteCaptures, 3);
      assert.equal(score.props.stoneSkin, 'skeuomorphic');
      positionProps.push(score.props);
      const cards = ScoreBoard(score.props);
      assert.match(text(cards), /黑子提子: 7白子提子: 3/);
      assert.doesNotMatch(text(cards), /褚嬴|柯洁/);
      const pair = elements(cards).find(node => node.props.className === 'score-cards grid grid-cols-2 gap-3').props.children;
      assert.equal(pair.length, 2);
      pair.forEach((card, index) => {
        const thinking = elements(card).filter(node => node.props.className?.includes('animate-ping'));
        assert.equal(thinking.length, index === (currentPlayer === 'black' ? 0 : 1) ? 1 : 0,
          'classic thinking indicator keeps the actual turn regardless of companion');
      });
    }
    assert.deepEqual(positionProps[0], positionProps[1], 'switching companions never changes scoreboard data or presentation');
  }
});
test('switching companions rejects late image loads and uses one portrait for every Ke Jie state', t => {
  const env = environment(t);
  const props = { skinId: 'chuying', state: 'idle' };
  const host = env.register(renderHook(() => CoachPet(props)));
  const pet = tree => elements(tree).find(node => node.props['data-pet-state']);
  let tree = host.render();
  assert.match(pet(tree).props.style.backgroundImage, /chuying\/poster/);
  const lateOriginalLoad = env.assets[0].onload;
  props.skinId = 'kejie';
  tree = host.render();
  assert.equal(env.assets[0].onload, null);
  assert.match(pet(tree).props.style.backgroundImage, /kejie\/poster/);
  assert.equal(pet(tree).props.style.backgroundSize, 'contain');
  env.assets[1].onload();
  tree = host.render();
  assert.equal(pet(tree).props.style.animationName, undefined, 'selected portrait can now animate');
  lateOriginalLoad();
  assert.equal(pet(host.render()).props.style.animationName, undefined, 'late original completion cannot clobber selected readiness');
  for (const state of ['thinking', 'explaining', 'encouraging']) {
    props.state = state;
    tree = host.render();
    assert.match(pet(tree).props.style.backgroundImage, /kejie\/poster/);
    assert.equal(pet(tree).props.style.backgroundSize, 'contain');
    assert.equal(env.assets.length, 2, 'a single portrait never requests invented sprite files');
  }
  env.doc.hidden = true;
  env.doc.dispatchEvent(new Event('visibilitychange'));
  assert.equal(pet(host.render()).props.style.animationPlayState, 'paused');
  props.skinId = 'chuying';
  tree = host.render();
  assert.match(env.assets[2].src, /chuying\/encouraging/);
  env.assets[2].onload();
  tree = host.render();
  assert.match(pet(tree).props.style.backgroundImage, /chuying\/encouraging/);
  assert.equal(pet(tree).props.style.animationTimingFunction, 'steps(4)');
  assert.equal(pet(tree).props.style.backgroundSize, '384px 104px');
});
