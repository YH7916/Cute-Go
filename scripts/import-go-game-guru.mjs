import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { parseSGFToTree } from '../utils/sgfParser.ts';

// Offline conversion only: original bytes and explicitly reviewed annotations
// remain authoritative. This does not invent responses or adjudicate unknowns.
const base = new URL('../third_party/go-game-guru/', import.meta.url);
const read = name => readFile(new URL(name, base), 'utf8');
const manifest = JSON.parse(await read('manifest.json'));
const translations = JSON.parse(await read('translations.zh-CN.json'));
const usedTranslations = new Set();
const problems = [];
for (const entry of manifest.upstreamDocuments) {
  const bytes = await readFile(new URL(entry.file, base));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), entry.sha256,
    `${entry.file}: original upstream document checksum changed`);
}

function coordinate(value, boardSize) {
  if (value === '' || (value === 'tt' && boardSize <= 19)) return null;
  assert.match(value, /^[a-s]{2}$/u, `Unsupported SGF coordinate: ${value}`);
  const point = { x: value.charCodeAt(0) - 97, y: value.charCodeAt(1) - 97 };
  assert.ok(point.x < boardSize && point.y < boardSize, 'Coordinate outside board');
  return point;
}

for (const entry of manifest.problems) {
  const bytes = await readFile(new URL(entry.file, base));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), entry.sha256,
    `${entry.id}: original SGF checksum changed`);
  const roots = parseSGFToTree(bytes.toString('utf8'));
  assert.equal(roots.length, 1, `${entry.id}: expected one SGF tree`);
  const sourceRoot = roots[0];
  const boardSize = Number(sourceRoot.properties.SZ?.[0]);
  assert.equal(boardSize, 19, `${entry.id}: preserve the original board size`);
  const correct = new Set(entry.reviewedCorrectNodes);
  const wrong = new Set(entry.reviewedWrongNodes);
  const visited = new Set();
  const correctDepths = [];
  let nodeCount = 0;
  let maxDepth = 0;
  let unclassifiedLeafCount = 0;

  function convert(node, id, depth) {
    visited.add(id);
    nodeCount++;
    maxDepth = Math.max(maxDepth, depth);
    const properties = node.properties;
    assert.ok(!(properties.B && properties.W), `${entry.id}/${id}: two colors`);
    const color = properties.B ? 'black' : properties.W ? 'white' : null;
    if (depth > 0) assert.ok(color, `${entry.id}/${id}: unexpected non-move node`);
    if (depth > 0) assert.equal(color, depth % 2 === 1 ? 'black' : 'white',
      `${entry.id}/${id}: unexpected turn order`);
    const values = properties.B ?? properties.W;
    if (values) assert.equal(values.length, 1, `${entry.id}/${id}: multiple moves`);
    const point = values ? coordinate(values[0], boardSize) : null;
    const comments = (properties.C ?? []).map(en => {
      assert.equal(typeof translations[en], 'string', `${entry.id}/${id}: untranslated comment`);
      usedTranslations.add(en);
      return { en, zh: translations[en] };
    });
    const explicitlyCorrect = comments.some(({ en }) => /^(?:Also )?correct(?:[.!]|$)/iu.test(en));
    assert.equal(correct.has(id), explicitlyCorrect,
      `${entry.id}/${id}: reviewed correct annotation disagrees with original comment`);
    assert.ok(!(correct.has(id) && wrong.has(id)), `${entry.id}/${id}: conflicting verdicts`);
    if (wrong.has(id)) assert.ok(comments.length, `${entry.id}/${id}: wrong verdict needs source text`);
    if (correct.has(id)) correctDepths.push(depth);
    const children = node.children.map((child, index) => convert(child, `${id}.${index}`, depth + 1));
    if (!children.length && !correct.has(id) && !wrong.has(id)) unclassifiedLeafCount++;
    return {
      id, color, point, comments, correct: correct.has(id), wrong: wrong.has(id),
      verdictSource: correct.has(id) || wrong.has(id) ? 'reviewed-original-comment' : null,
      hasCorrectContinuation: correct.has(id) || children.some(child => child.hasCorrectContinuation),
      properties, children,
    };
  }

  const root = convert(sourceRoot, 'r', 0);
  for (const id of [...correct, ...wrong]) assert.ok(visited.has(id), `${entry.id}: missing node ${id}`);
  assert.ok(correctDepths.length, `${entry.id}: no explicitly correct annotation`);
  const initialStones = ['AB', 'AW'].flatMap(property => (sourceRoot.properties[property] ?? []).map(value => {
    const point = coordinate(value, boardSize);
    assert.ok(point, 'Setup cannot contain a pass');
    return { ...point, color: property === 'AB' ? 'black' : 'white' };
  }));
  assert.equal(new Set(initialStones.map(({ x, y }) => `${x},${y}`)).size, initialStones.length,
    `${entry.id}: duplicate setup point`);
  assert.ok(root.children.every(child => child.color === 'black'), `${entry.id}: expected Black to play`);
  problems.push({
    id: entry.id,
    source: {
      repository: manifest.repository, commit: manifest.commit, path: entry.upstreamPath,
      url: `${manifest.repository}/blob/${manifest.commit}/${entry.upstreamPath}`,
      sha256: entry.sha256, authors: manifest.authors, license: manifest.license,
    },
    boardSize, toPlay: 'black', initialStones,
    selectionNoteZh: entry.selectionNoteZh,
    complexity: {
      moveNodeCount: nodeCount - 1, maxDepth,
      minCorrectDepth: Math.min(...correctDepths), maxCorrectDepth: Math.max(...correctDepths),
      correctNodeCount: correct.size, wrongNodeCount: wrong.size, unclassifiedLeafCount,
    },
    root,
  });
}

assert.equal(usedTranslations.size, Object.keys(translations).length, 'Remove stale translations');
const output = JSON.stringify({
  schemaVersion: 1, sourceCommit: manifest.commit, license: manifest.license,
  coordinateSystem: 'zero-based x/y from SGF top-left; no rotation or crop',
  unannotatedOutcome: 'unknown', problems,
}, null, 2) + '\n';
function runtimeNode(node) {
  const boardMarks = (node.properties.LB ?? []).map(value => {
    const [encoded, ...label] = value.split(':');
    return { point: coordinate(encoded, 19), label: label.join(':') };
  });
  for (const [property, label] of [['TR', '△'], ['SQ', '□'], ['CR', '○'], ['MA', '×']]) {
    for (const encoded of node.properties[property] ?? []) boardMarks.push({ point: coordinate(encoded, 19), label });
  }
  return { color: node.color, point: node.point, correct: node.correct, wrong: node.wrong,
    text: node.comments.map(comment => comment.zh.replace(/https?:\/\/\S+/gu, '').trim()).filter(Boolean).join('\n\n'),
    boardMarks, children: node.children.map(runtimeNode) };
}
const runtime = JSON.stringify({ sourceCommit: manifest.commit, problems: problems.map(problem => ({
  id: problem.id, sourceUrl: problem.source.url, boardSize: problem.boardSize, toPlay: problem.toPlay,
  initialStones: problem.initialStones, root: runtimeNode(problem.root),
})) }, null, 2) + '\n';
const runtimeDir = new URL('../domains/coach/sourceData/', import.meta.url);
if (process.argv.includes('--check')) {
  assert.equal(await read('problems.json'), output, 'Generated GGG data is stale; run the importer');
  assert.equal(await readFile(new URL('ggg.json', runtimeDir), 'utf8'), runtime, 'Runtime GGG data is stale; run the importer');
  console.log(`Verified ${problems.length} Go Game Guru trees and ${usedTranslations.size} comment translations.`);
} else {
  await writeFile(new URL('problems.json', base), output);
  await mkdir(runtimeDir, { recursive: true });
  await writeFile(new URL('ggg.json', runtimeDir), runtime);
  console.log(`Wrote ${fileURLToPath(new URL('problems.json', base))} (${problems.length} problems).`);
}
