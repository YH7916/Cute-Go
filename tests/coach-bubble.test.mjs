import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTestModule } from './helpers/loadTestModule.mjs';

const { CoachBubble, renderToStaticMarkup } = await loadTestModule({
  contents: `export { CoachBubble } from './components/coach/CoachBubble';
    export { renderToStaticMarkup } from 'react-dom/server';`,
});
const props = { text: '', loading: false, bodyRef: { current: null } };
function elements(node) {
  if (Array.isArray(node)) return node.flatMap(elements);
  return node?.props ? [node, ...elements(node.props.children)] : [];
}

test('consecutive plain-text bullets form accessible lists between short paragraphs', () => {
  const tree = CoachBubble({ ...props, text: '先看棋盘。\n- 黑棋只剩一口气。\n- 白棋不能立即回提。\n再想下一手。\n- 找能连接的点。' });
  const blocks = elements(tree).filter(node => ['p', 'ul'].includes(node.type));
  assert.deepEqual(blocks.map(node => node.type), ['p', 'ul', 'p', 'ul']);
  assert.deepEqual(elements(blocks[1]).filter(node => node.type === 'li').map(node => node.props.children), ['黑棋只剩一口气。', '白棋不能立即回提。']);
  assert.deepEqual(elements(blocks[3]).filter(node => node.type === 'li').map(node => node.props.children), ['找能连接的点。']);
});

test('blank lines separate paragraphs while ordinary line breaks and single sentences remain intact', () => {
  const tree = CoachBubble({ ...props, text: '先数气。\r\n相邻空点才是气。\r\n\r\n轮到黑棋。' });
  assert.deepEqual(elements(tree).filter(node => node.type === 'p').map(node => node.props.children), ['先数气。\n相邻空点才是气。', '轮到黑棋。']);
  const sentence = '轮到你，试着落一颗黑棋。';
  const single = CoachBubble({ ...props, text: sentence });
  assert.equal(elements(single).filter(node => node.type === 'p').length, 1);
  assert.equal(elements(single).find(node => node.type === 'p').props.children, sentence);
});

test('markup-like input remains literal escaped text, including inside list items', () => {
  const tree = CoachBubble({ ...props, text: '<script>alert(1)</script>\n- <img src=x onerror=alert(1)>\n- **不是粗体** [文字](https://example.com)' });
  const html = renderToStaticMarkup(tree);
  assert.doesNotMatch(html, /<script|<img|<strong|<a[ >]/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(html, /\*\*不是粗体\*\* \[文字\]\(https:\/\/example.com\)/);
});

test('loading hides old paragraphs and bullets while retaining the existing error and live region', () => {
  const tree = CoachBubble({ ...props, text: '旧讲解\n- 旧提示', loading: true, error: '连接暂时中断' });
  const html = renderToStaticMarkup(tree);
  assert.equal(tree.props['aria-live'], 'polite');
  assert.equal(tree.props['aria-busy'], true);
  assert.match(html, /让我看看这步棋…/);
  assert.match(html, /连接暂时中断/);
  assert.doesNotMatch(html, /旧讲解|旧提示|<ul/);
});
