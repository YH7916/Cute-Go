import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { loadTestModule } from './helpers/loadTestModule.mjs';

const require = createRequire(import.meta.url);
// Real JSX elements plus the shared hook host exercise input callbacks.
// This is not browser rendering or visual acceptance.
const { CoachSettings, SettingsModal, renderHook } = await loadTestModule({
  reactHost: true, define: { 'process.env.NODE_ENV': '"production"' },
  plugins: [{ name: 'real-jsx-runtime', setup(build) {
    build.onResolve({ filter: /jsx-runtime$/ }, () => ({ path: require.resolve('react/jsx-runtime') }));
    build.onResolve({ filter: /^lucide-react$/ }, () => ({
      path: pathToFileURL(require.resolve('lucide-react')).href, external: true,
    }));
  } }],
  contents: `export { CoachSettings } from './components/CoachSettings';
    export { SettingsModal } from './components/SettingsModal';
    export { renderHook } from './tests/helpers/reactHooks';`,
});

function allElements(node) {
  if (Array.isArray(node)) return node.flatMap(allElements);
  if (!node || typeof node !== 'object' || !node.props) return [];
  return [node, ...allElements(node.props.children)];
}
function input(tree, label) {
  const element = allElements(tree).find(item => item.props['aria-label'] === label);
  assert.ok(element, `Missing ${label}`);
  return element;
}

function setup(t) {
  const saved = [];
  const props = { value: { endpoint: 'https://api.deepseek.com', model: 'deepseek-flash', apiKey: 'deepseek-only-key' },
    rememberKey: true, onSave: (config, remember) => saved.push({ config, remember }) };
  const host = renderHook(() => CoachSettings(props));
  t.after(() => host.unmount());
  host.render();
  return { ...host, saved, props };
}

test('choosing another provider clears the old key and explicit save cannot transmit that credential', t => {
  const host = setup(t);
  input(host.render(), 'OpenAI').props.onChange();
  const tree = host.render();
  assert.equal(input(tree, '陪练 API 地址').props.value, 'https://api.openai.com/v1');
  assert.equal(input(tree, '陪练模型').props.value, 'gpt-4.1-mini');
  assert.equal(input(tree, '陪练 API 密钥').props.value, '');
  assert.equal(input(tree, '在此设备记住密钥').props['aria-pressed'], false);
  allElements(tree).find(item => item.props.children === '保存陪练设置').props.onClick();
  assert.deepEqual(host.saved, [{ config: { endpoint: 'https://api.openai.com/v1', model: 'gpt-4.1-mini', apiKey: '' }, remember: false }]);
});

test('opening existing configuration and reselecting its provider preserve the saved model and secret', t => {
  const host = setup(t);
  let tree = host.render();
  assert.equal(input(tree, 'DeepSeek').props.checked, true);
  assert.equal(input(tree, '陪练 API 密钥').props.type, 'password');
  input(tree, 'DeepSeek').props.onChange();
  tree = host.render();
  assert.equal(input(tree, '陪练 API 地址').props.value, host.props.value.endpoint);
  assert.equal(input(tree, '陪练模型').props.value, host.props.value.model);
  assert.equal(input(tree, '陪练 API 密钥').props.value, host.props.value.apiKey);
  assert.equal(input(tree, '在此设备记住密钥').props['aria-pressed'], true);
  assert.deepEqual(host.saved, []);
});

test('remembering a new key remains an explicit choice', t => {
  const host = setup(t);
  input(host.render(), 'OpenAI').props.onChange();
  input(host.render(), '陪练 API 密钥').props.onChange({ target: { value: 'new-provider-key' } });
  let tree = host.render();
  assert.equal(input(tree, '在此设备记住密钥').props['aria-pressed'], false);
  allElements(tree).find(item => item.props.children === '保存陪练设置').props.onClick();
  assert.equal(host.saved[0].remember, false);
  input(tree, '在此设备记住密钥').props.onClick();
  tree = host.render();
  assert.equal(input(tree, '在此设备记住密钥').props['aria-pressed'], true);
  assert.equal(host.saved.length, 1, 'enabling remember changes only the draft until explicitly saved');
  allElements(tree).find(item => item.props.children === '保存陪练设置').props.onClick();
  assert.equal(host.saved[1].remember, true);
  input(tree, '在此设备记住密钥').props.onClick();
  tree = host.render();
  assert.equal(input(tree, '在此设备记住密钥').props['aria-pressed'], false);
  assert.equal(host.saved.length, 2, 'disabling remember changes only the draft until explicitly saved');
  assert.equal(input(tree, '陪练 API 密钥').props.value, 'new-provider-key');
  allElements(tree).find(item => item.props.children === '保存陪练设置').props.onClick();
  assert.equal(host.saved[2].remember, false);
});

function setupModal(t, coachSettings) {
  const calls = { applied: [], closed: 0 };
  const noop = () => {};
  const props = {
    isOpen: true, coachSettings, coachMode: true,
    currentGameSettings: { gameType: 'Go', gameMode: 'PvAI', boardSize: 9, difficulty: 'Fun', userColor: 'black' },
    onClose: () => calls.closed++, onApplyGameSettings: settings => calls.applied.push(settings),
    showQi: true, setShowQi: noop, showWinRate: false, setShowWinRate: noop,
    showCoordinates: true, setShowCoordinates: noop, musicVolume: 0, setMusicVolume: noop,
    hapticEnabled: false, setHapticEnabled: noop, vibrate: noop,
    skipStartScreen: false, setSkipStartScreen: noop, separatePieces: true, setSeparatePieces: noop,
    onStartSetup: noop, onOpenImport: noop, onOpenOnline: noop, onOpenAbout: noop,
    onOpenTutorial: noop, onOpenSkinShop: noop,
  };
  const host = renderHook(() => SettingsModal(props));
  t.after(() => host.unmount());
  host.render();
  return { ...host, props, calls };
}

function boardSlider(tree) {
  return allElements(tree).find(item => item.props.type === 'range' && item.props.max === '19');
}

test('Go settings opens the existing beginner tutorial without applying game settings', t => {
  const modal = setupModal(t);
  let tutorials = 0;
  modal.props.onOpenTutorial = () => tutorials++;
  const control = input(modal.render(), '重看新手教学');
  assert.ok(control);
  control.props.onClick();
  assert.equal(tutorials, 1);
  assert.equal(modal.calls.closed, 1);
  assert.deepEqual(modal.calls.applied, []);
});

test('turning vibration off applies the preference without issuing a final vibration', t => {
  const modal = setupModal(t);
  const preferences = [], vibrations = [];
  modal.props.hapticEnabled = true;
  modal.props.setHapticEnabled = value => preferences.push(value);
  modal.props.vibrate = pattern => vibrations.push(pattern);
  const toggle = allElements(modal.render()).find(item => item.type === 'button'
    && allElements(item).some(child => child.props.children === '振动'));
  assert.ok(toggle, 'vibration toggle is present');
  toggle.props.onClick();
  assert.deepEqual(preferences, [false]);
  assert.deepEqual(vibrations, [], 'disabling haptics must take effect for the disabling click itself');
});

test('service submenu hides board settings and returning preserves their uncommitted selection', t => {
  const coach = setup(t);
  const modal = setupModal(t, coach.render());
  let tree = modal.render();
  assert.equal(allElements(tree).filter(item => item.props['aria-label'] === '陪练讲解服务').length, 1);
  assert.equal(allElements(tree).some(item => item.props['aria-label'] === '陪练 API 密钥'), false);
  boardSlider(tree).props.onChange({ target: { value: '13' } });
  input(modal.render(), '陪练讲解服务').props.onClick();
  tree = modal.render();
  assert.equal(allElements(tree).find(item => item.props.role === 'dialog').props['aria-label'], '陪练讲解服务');
  assert.equal(boardSlider(tree), undefined);
  assert.equal(allElements(tree).some(item => item.props.onClick && String(item.props.children).includes('应用设置并重新开始')), false);
  assert.equal(input(tree, '陪练 API 密钥').props.value, coach.props.value.apiKey);
  input(tree, '返回设置').props.onClick();
  tree = modal.render();
  assert.equal(boardSlider(tree).props.value, 13);
  assert.equal(allElements(tree).some(item => item.props['aria-label'] === '陪练 API 密钥'), false);
  assert.deepEqual(modal.calls.applied, []);
  assert.deepEqual(coach.saved, []);
});

test('saving service configuration and closing never applies game settings; reopening starts at main settings', t => {
  const coach = setup(t);
  const modal = setupModal(t, coach.render());
  input(modal.render(), '陪练讲解服务').props.onClick();
  let tree = modal.render();
  allElements(tree).find(item => item.props.children === '保存陪练设置').props.onClick();
  assert.deepEqual(coach.saved, [{ config: coach.props.value, remember: true }]);
  assert.deepEqual(modal.calls.applied, []);
  input(tree, '关闭设置').props.onClick();
  assert.equal(modal.calls.closed, 1);
  modal.props.isOpen = false;
  assert.equal(modal.render(), null);
  modal.props.isOpen = true;
  tree = modal.render();
  assert.equal(allElements(tree).find(item => item.props.role === 'dialog').props['aria-label'], '陪练设置');
  assert.equal(allElements(tree).some(item => item.props['aria-label'] === '返回设置'), false);
  assert.equal(allElements(tree).some(item => item.props['aria-label'] === '陪练 API 密钥'), false);
  assert.deepEqual(modal.calls.applied, []);
});

test('manual endpoint edits clear credentials before saving and preserve editable model choice', t => {
  const host = setup(t);
  input(host.render(), '陪练 API 地址').props.onChange({ target: { value: 'http://localhost:1234/v1' } });
  let tree = host.render();
  assert.equal(input(tree, '陪练 API 密钥').props.value, '');
  input(tree, '陪练模型').props.onChange({ target: { value: 'my-local-model' } });
  tree = host.render();
  allElements(tree).find(item => item.props.children === '保存陪练设置').props.onClick();
  assert.equal(host.saved[0].config.model, 'my-local-model');
  assert.equal(host.saved[0].config.apiKey, '');
});

test('invalid endpoint never reaches the save callback and renders a safe validation error', t => {
  const host = setup(t);
  input(host.render(), '陪练 API 地址').props.onChange({ target: { value: 'https://user:private-key@service.test' } });
  allElements(host.render()).find(item => item.props.children === '保存陪练设置').props.onClick();
  assert.equal(host.saved.length, 0);
  const alert = allElements(host.render()).find(item => item.props.role === 'alert');
  assert.match(alert.props.children, /不能包含账号或密码/);
  assert.ok(!alert.props.children.includes('private-key'));
});
