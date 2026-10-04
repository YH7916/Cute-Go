import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { loadTestModule } from './helpers/loadTestModule.mjs';

const require = createRequire(import.meta.url);
const { CoachPanel, CoachReviewTools, renderHook } = await loadTestModule({
  reactHost: true, define: { 'process.env.NODE_ENV': '"production"' },
  plugins: [{ name: 'real-jsx-runtime', setup(build) {
    build.onResolve({ filter: /jsx-runtime$/ }, () => ({ path: require.resolve('react/jsx-runtime') }));
    // Icons use React.forwardRef internally; keep their real React dependency.
    build.onResolve({ filter: /^lucide-react$/ }, () => ({
      path: pathToFileURL(require.resolve('lucide-react')).href, external: true,
    }));
  } }],
  contents: `export { CoachPanel } from './components/CoachPanel';
    export { CoachReviewTools } from './components/coach/CoachReviewTools';
    export { renderHook } from './tests/helpers/reactHooks';`,
});

function elements(node) {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!node || typeof node !== 'object' || !node.props) return [];
  return [node, ...elements(node.props.children)];
}
function control(tree, label) {
  const found = elements(tree).find(element => element.props['aria-label'] === label);
  assert.ok(found, `Missing ${label}`);
  return found;
}
function setup(t, configured = false) {
  const calls = [];
  let cancelled = 0;
  const props = { gameOver: false, coach: {
    text: '先落一子，试着数一数气。', source: 'local', configured, loading: false, error: undefined,
    ask: (intent, question) => calls.push(question === undefined ? [intent] : [intent, question]),
    cancel: () => cancelled++,
  } };
  const host = renderHook(() => CoachPanel(props));
  t.after(() => host.unmount());
  return { ...host, props, calls, get cancelled() { return cancelled; } };
}

test('the main row explains the current position and offers a hint without hidden tools', t => {
  const s = setup(t);
  s.props.coach.conversation = [{ id: 1, question: '之前的问题', answer: '之前的回答' }];
  const tree = s.render();
  assert.equal(elements(tree).some(element => element.type === 'input' || element.type === 'form' || element.type === 'details'), false);
  assert.equal(elements(tree).filter(element => element.props.appearance === 'retro').length, 2);
  for (const label of ['更多陪练选项', '陪练设置', '收起陪练讲解', '分析形势', '讲解这一手']) {
    assert.equal(elements(tree).some(element => element.props['aria-label'] === label), false);
  }
  assert.equal(elements(tree).some(element => element.props.children === '之前的问题'), false);
  control(tree, '讲解当前局面').props.onClick();
  control(tree, '给点提示').props.onClick();
  assert.deepEqual(s.calls, [['explain-position'], ['hint']]);
});

test('a configured composer is immediately available, rejects blank text, trims and sends once', t => {
  const s = setup(t, true);
  let tree = s.render();
  assert.ok(elements(tree).some(element => element.type === 'form'));
  assert.equal(control(tree, '发送问题').props.disabled, true);
  assert.equal(control(tree, '向陪练提问').props.autoFocus, undefined, 'displaying the composer must not summon the keyboard');
  elements(tree).find(element => element.type === 'form').props.onSubmit({ preventDefault() {} });
  control(tree, '向陪练提问').props.onChange({ target: { value: '   ' } });
  tree = s.render();
  assert.equal(control(tree, '发送问题').props.disabled, true);
  elements(tree).find(element => element.type === 'form').props.onSubmit({ preventDefault() {} });
  assert.deepEqual(s.calls, []);
  control(tree, '向陪练提问').props.onChange({ target: { value: '  这块棋有几口气？  ' } });
  tree = s.render();
  assert.equal(control(tree, '发送问题').props.disabled, false);
  elements(tree).find(element => element.type === 'form').props.onSubmit({ preventDefault() {} });
  assert.deepEqual(s.calls, [['explain-position', '这块棋有几口气？']]);
  assert.equal(control(s.render(), '向陪练提问').props.value, '');
});

test('incoming guidance and request cancellation preserve the unsent question', t => {
  const s = setup(t, true);
  control(s.render(), '向陪练提问').props.onChange({ target: { value: '保留草稿' } });
  s.props.coach.text = '新的讲解已经显示。';
  s.props.coach.loading = true;
  let tree = s.render();
  assert.equal(control(tree, '向陪练提问').props.value, '保留草稿');
  control(tree, '停止讲解').props.onClick();
  s.props.coach.loading = false;
  s.props.gameOver = true;
  tree = s.render();
  assert.equal(control(tree, '向陪练提问').props.value, '保留草稿');
  assert.equal(s.cancelled, 1);
  assert.deepEqual(s.calls, []);
});

test('loading replaces explanation with stop while preserving the hint and review action', t => {
  const s = setup(t, true);
  const review = { type: 'review-action', props: { children: '回看棋谱' } };
  s.props.reviewAction = review;
  s.props.coach.loading = true;
  let tree = s.render();
  assert.equal(elements(tree).some(element => element.props['aria-label'] === '讲解当前局面'), false);
  assert.ok(control(tree, '给点提示'));
  assert.ok(elements(tree).includes(review));
  control(tree, '停止讲解').props.onClick();
  assert.equal(s.cancelled, 1);
  assert.deepEqual(s.calls, [], 'stopping never issues a replacement request');
  s.props.coach.loading = false;
  tree = s.render();
  assert.ok(control(tree, '讲解当前局面'));
  assert.equal(elements(tree).some(element => element.props['aria-label'] === '停止讲解'), false);
});

test('a finished game keeps manual position questions and hints available', t => {
  const s = setup(t, true);
  control(s.render(), '向陪练提问').props.onChange({ target: { value: '尚未发送的问题' } });
  s.props.gameOver = true;
  let tree = s.render();
  for (const label of ['讲解当前局面', '给点提示', '向陪练提问', '发送问题']) assert.notEqual(control(tree, label).props.disabled, true);
  elements(tree).find(element => element.type === 'form').props.onSubmit({ preventDefault() {} });
  assert.deepEqual(s.calls, [['explain-position', '尚未发送的问题']]);
  tree = s.render();
  control(tree, '讲解当前局面').props.onClick();
  control(tree, '给点提示').props.onClick();
  assert.deepEqual(s.calls.slice(-2), [['explain-position'], ['hint']]);
});

test('primary actions retain retro buttons and leave the complete reply in its separate reading area', t => {
  const s = setup(t, true);
  const text = Array.from({ length: 12 }, (_, index) => `第 ${index + 1} 句：先看棋盘上的标记，再数相邻的空点。`).join('\n');
  s.props.coach.text = text;
  s.props.coach.error = '连接暂时失败，请检查服务地址。'.repeat(8);
  const tree = s.render();
  assert.equal(elements(tree).some(element => element.props.children === text || element.type === 'h2'), false);
  assert.equal(elements(tree).some(element => /overflow-y-(auto|scroll)/.test(element.props.className ?? '')), false);
  assert.doesNotMatch(tree.props.className, /max-h-|(?:^|\s)(?:[\w-]+:)*(?:fixed|absolute)(?:\s|$)/);
  for (const [label, variant] of [['讲解当前局面', 'primary'], ['给点提示', 'secondary']]) {
    const action = control(tree, label);
    assert.equal(action.props.appearance, 'retro');
    assert.equal(action.props.variant, variant);
    assert.match(action.props.className, /\bh-11\b/);
    assert.ok(elements(action.props.children).some(element => element.props['aria-hidden'] === 'true'), `${label} includes a decorative icon`);
  }
  assert.match(control(tree, '向陪练提问').props.className, /\bh-11\b/);
  assert.equal(control(tree, '发送问题').props.variant, 'secondary');
});

test('the review action is immediately available alongside explanation and hint', t => {
  const s = setup(t);
  let reviews = 0;
  const action = { type: 'review-action', props: { 'aria-label': '回看棋谱', onClick: () => reviews++ } };
  s.props.reviewAction = action;
  const tree = s.render();
  const row = elements(tree).find(element => /\bcoach-actions\b/.test(element.props.className ?? ''));
  assert.ok(row);
  assert.deepEqual(elements(row).filter(element => element.props['aria-label']).map(element => element.props['aria-label']),
    ['讲解当前局面', '给点提示', '回看棋谱']);
  assert.ok(elements(row).includes(action));
  control(tree, '回看棋谱').props.onClick();
  assert.equal(reviews, 1);
  assert.equal(elements(tree).some(element => element.props.type === 'checkbox'), false);
});

test('review replaces live hint, navigation and composer with one explanation and shared trial actions', t => {
  const s = setup(t, true);
  control(s.render(), '向陪练提问').props.onChange({ target: { value: '尚未发送的实战问题' } });
  const review = { inVariation: false, variationMoves: 0 };
  const reviewAction = { type: 'review-action', props: { 'aria-label': '回看棋谱' } };
  s.props.review = review;
  s.props.reviewAction = reviewAction;
  s.props.gameOver = true;
  let tree = s.render();
  assert.equal(tree.props['aria-label'], 'AI 复盘讲解');
  const explain = control(tree, '讲解这手');
  assert.equal(explain.props.variant, 'primary');
  assert.equal(explain.props.appearance, 'retro');
  assert.notEqual(explain.props.disabled, true, 'finished games remain reviewable');
  explain.props.onClick();
  assert.deepEqual(s.calls, [['explain-position']], 'review explains the selected complete position through the existing intent');
  const trial = elements(tree).filter(element => element.type === CoachReviewTools);
  assert.equal(trial.length, 1);
  assert.equal(trial[0].props.review, review);
  assert.equal(elements(tree).includes(reviewAction), false);
  assert.equal(elements(tree).some(element => element.type === 'input' || element.type === 'form' || element.type === 'details'), false);
  for (const label of ['给点提示', '讲解当前局面', '回看棋谱', '向陪练提问', '发送问题', '最近问答', '个人局面', '本局教学重点']) {
    assert.equal(elements(tree).some(element => element.props['aria-label'] === label), false);
  }

  s.props.review = undefined;
  tree = s.render();
  assert.equal(tree.props['aria-label'], 'AI 陪练讲解');
  assert.equal(control(tree, '向陪练提问').props.value, '尚未发送的实战问题', 'temporary review does not erase a live-coaching draft');
  assert.ok(control(tree, '给点提示'));
  assert.ok(elements(tree).includes(reviewAction));
});

test('review loading offers cancellation without removing the trial controls', t => {
  const s = setup(t, true);
  const review = { inVariation: true, variationMoves: 2 };
  s.props.review = review;
  s.props.coach.loading = true;
  const tree = s.render();
  control(tree, '停止讲解').props.onClick();
  assert.equal(s.cancelled, 1);
  assert.deepEqual(s.calls, []);
  assert.equal(elements(tree).some(element => element.props['aria-label'] === '讲解这手'), false);
  assert.equal(elements(tree).filter(element => element.type === CoachReviewTools).length, 1);
  assert.equal(elements(tree).find(element => element.type === CoachReviewTools).props.review, review);
  assert.equal(elements(tree).some(element => element.type === 'form'), false);
});
