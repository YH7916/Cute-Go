import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

// Source and its extracted text/positions/solutions remain AGPL-3.0-or-later.
export const OGS_COMMIT = '8baf0345423d20d8f0ca18059e464c1e89862a40';
const REPOSITORY = 'https://github.com/online-go/online-go.com';
const BASE = 'src/views/LearningHub';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../third_party/ogs-learning');
const SELECTED = new Set([
  'Intro', 'SelfCapture', 'Eyes', 'Ko', 'Territory', 'EndingTheGame', 'TheBoard',
  'CountLiberties', 'CountChains', 'InAtari', 'CaptureStone', 'CaptureChain',
  'Escape', 'Connect', 'Cut', 'RealFalseEye', 'TwoEyes',
  'AtariCorrectSide', 'PlayDoubleAtari', 'Ladder', 'Snapback', 'Net',
  'CountTerritory', 'CloseTerritory', 'CapturingRace',
]);
const SELECTED_PAGES = {
  CountLiberties: [0, 4, 10], CountChains: [0, 2, 5], InAtari: [0, 1, 5],
  CaptureStone: [0, 2, 5], CaptureChain: [0, 7, 13], Escape: [0, 2, 5],
  Connect: [0, 2, 5], Cut: [0, 2, 5], RealFalseEye: [0, 2, 5], TwoEyes: [0, 2, 5],
  AtariCorrectSide: [0, 1, 3, 5], PlayDoubleAtari: [0, 5, 9, 17],
  Ladder: [0, 5, 12, 23], Snapback: [0, 6, 13, 24], Net: [0, 3, 7, 12],
  CountTerritory: [0, 3, 7, 11], CloseTerritory: [0, 3, 7, 11], CapturingRace: [0, 5, 12, 17],
};

function walk(node, callback) {
  callback(node);
  ts.forEachChild(node, (child) => walk(child, callback));
}

function literal(node) {
  if (!node) throw new Error('Missing literal expression');
  if (ts.isStringLiteralLike(node)) return node.text;
  if (ts.isNumericLiteral(node)) return Number(node.text);
  if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (node.kind === ts.SyntaxKind.NullKeyword) return null;
  if (ts.isParenthesizedExpression(node)) return literal(node.expression);
  if (ts.isArrayLiteralExpression(node)) return node.elements.map(literal);
  if (ts.isObjectLiteralExpression(node)) return Object.fromEntries(node.properties.map((prop) => {
    if (!ts.isPropertyAssignment(prop)) throw new Error(`Nonliteral property: ${prop.getText()}`);
    return [prop.name.text ?? prop.name.getText(), literal(prop.initializer)];
  }));
  if (ts.isPrefixUnaryExpression(node) && node.operator === ts.SyntaxKind.MinusToken) {
    return -literal(node.operand);
  }
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    return literal(node.left) + literal(node.right);
  }
  if (ts.isCallExpression(node)) {
    const name = node.expression.getText();
    if (name === '_') return literal(node.arguments[0]);
    if (name === 'pgettext') return literal(node.arguments[1]);
    if (name === 'this.makePuzzleMoveTree') {
      return { rawCorrect: literal(node.arguments[0]), rawWrong: literal(node.arguments[1]),
        width: node.arguments[2] ? literal(node.arguments[2]) : 9,
        height: node.arguments[3] ? literal(node.arguments[3]) : 9 };
    }
  }
  throw new Error(`Unsupported expression: ${node.getText().slice(0,180)}`);
}

function method(cls, name) {
  return cls.members.find((member) => ts.isMethodDeclaration(member) && member.name.getText() === name);
}

function returned(cls, name) {
  return method(cls, name)?.body?.statements.find(ts.isReturnStatement)?.expression;
}

// OGS accepts either SGF coordinates (top-left origin) or human coordinates
// (letters omit I; numbers count from the bottom). Preserve the original too.
export function decodeOgsPoints(encoded, width = 9, height = 9) {
  if (!encoded) return [];
  if (typeof encoded !== 'string') throw new Error('Coordinates must be text');
  const points = [];
  if (/\d/.test(encoded)) {
    const parts = encoded.match(/[a-z]\d+/gi) ?? [];
    if (parts.join('').toLowerCase() !== encoded.toLowerCase()) throw new Error(`Invalid human coordinates: ${encoded}`);
    for (const part of parts) {
      const x = 'abcdefghjklmnopqrstuvwxyz'.indexOf(part[0].toLowerCase());
      points.push({ x, y: height - Number(part.slice(1)) });
    }
  } else {
    if (encoded.length % 2) throw new Error(`Invalid SGF coordinates: ${encoded}`);
    for (let index = 0; index < encoded.length; index += 2) {
      const pair = encoded.slice(index, index + 2);
      points.push(pair === '..' ? { x: -1, y: -1 } :
        { x: pair.charCodeAt(0) - 97, y: pair.charCodeAt(1) - 97 });
    }
  }
  for (const point of points) {
    if (point.x === -1 && point.y === -1) continue;
    if (point.x < 0 || point.x >= width || point.y < 0 || point.y >= height) {
      throw new Error(`Out of bounds coordinate in ${encoded} for ${width}x${height}`);
    }
  }
  return points;
}

function translatedText(node, excludeLabels = false) {
  const values = [];
  function visit(child) {
    if (excludeLabels && ts.isJsxElement(child) && child.openingElement.tagName.getText() === 'label') return;
    if (ts.isCallExpression(child) && ['_', 'pgettext'].includes(child.expression.getText())) {
      const value = literal(child);
      if (!values.includes(value)) values.push(value);
    }
    ts.forEachChild(child, visit);
  }
  visit(node);
  return values;
}

function choices(cls) {
  const text = method(cls, 'text');
  const options = [];
  const labelsEn = {};
  const correct = [];
  walk(text, (node) => {
    if (ts.isJsxSelfClosingElement(node) && node.tagName.getText() === 'input') {
      const value = node.attributes.properties.find((p) => ts.isJsxAttribute(p) && p.name.getText() === 'value');
      if (value?.initializer && ts.isStringLiteral(value.initializer)) {
        const option = value.initializer.text;
        options.push(option);
        labelsEn[option] = translatedText(node.parent)[0] ?? option;
      }
    }
    if (ts.isIfStatement(node) && ts.isBinaryExpression(node.expression) &&
        node.expression.left.getText() === 'selectedValue' &&
        node.expression.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken &&
        node.thenStatement.getText().includes('props.onCorrectAnswer()')) {
      correct.push(literal(node.expression.right));
    }
  });
  if (!options.length) return undefined;
  if (!correct.length || correct.some((value) => !options.includes(value))) {
    throw new Error(`Unrecognized choice logic: ${cls.name.text}`);
  }
  return { kind: 'choice', options, correct, labelsEn };
}

function pageAnswer(cls, config, lessonId) {
  // These upstream pages deliberately contain a dummy tree that must not count
  // as a move-answer. Their complete()/onStoneRemoval() overrides are authoritative.
  if (method(cls, 'complete')) {
    if (lessonId !== 'ending-the-game') throw new Error(`Unknown custom completion: ${lessonId}`);
    const removal = method(cls, 'onStoneRemoval');
    if (removal) {
      let encoded;
      walk(removal, (node) => {
        if (ts.isBinaryExpression(node) && node.left.getText() === 'stone_removal_string' &&
            node.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken) encoded = literal(node.right);
      });
      if (!encoded) throw new Error('Missing exact stone-removal answer');
      return { kind: 'remove-stones', points: decodeOgsPoints(encoded, config.width, config.height), rawStones: encoded };
    }
    const label = translatedText(method(cls, 'button'))[0];
    if (!['Pass', 'Finish'].includes(label) || !method(cls, 'complete').getText().includes('this.pass_pressed')) {
      throw new Error('Unrecognized end-of-game action');
    }
    return { kind: 'action', action: label.toLowerCase(), labelEn: label };
  }
  const choice = choices(cls);
  if (choice) return choice;
  if (config.move_tree) {
    const { rawCorrect, rawWrong, width, height } = config.move_tree;
    return { kind: 'move-tree', rawCorrect, rawWrong,
      correct: rawCorrect.map((value) => decodeOgsPoints(value, width, height)),
      wrong: rawWrong.map((value) => decodeOgsPoints(value, width, height)) };
  }
  return { kind: 'manual', reason: 'No supported authored completion condition; reading is not a correct answer.' };
}

async function source(relative) {
  const local = path.join(ROOT, 'upstream', relative + (/\.tsx?$/.test(relative) ? '.txt' : ''));
  if (process.argv.includes('--fetch')) {
    let failure;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      try {
        const response = await fetch(`https://raw.githubusercontent.com/online-go/online-go.com/${OGS_COMMIT}/${relative}`);
        if (!response.ok) throw new Error(`${response.status} ${relative}`);
        const content = await response.text();
        await fs.mkdir(path.dirname(local), { recursive: true });
        await fs.writeFile(local, content);
        failure = undefined;
        break;
      } catch (error) { failure = error; }
    }
    if (failure) throw failure;
  }
  return fs.readFile(local, 'utf8');
}

export async function importOgsLearning({ checkOnly = process.argv.includes('--check') } = {}) {
  if (checkOnly && process.argv.includes('--fetch')) throw new Error('--check cannot fetch or overwrite source files');
  async function output(file, content) {
    if (checkOnly) {
      if (await fs.readFile(file, 'utf8') !== content) throw new Error(`Generated OGS data differs: ${file}`);
    } else await fs.writeFile(file, content);
  }
  const sectionsText = await source(`${BASE}/sections.ts`);
  const sectionsAst = ts.createSourceFile('sections.ts', sectionsText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const imports = new Map();
  for (const declaration of sectionsAst.statements.filter(ts.isImportDeclaration)) {
    if (!declaration.moduleSpecifier.text.startsWith('./Sections/')) continue;
    for (const binding of declaration.importClause.namedBindings.elements) {
      imports.set(binding.name.text, `${BASE}/${declaration.moduleSpecifier.text.slice(2)}.tsx`);
    }
  }
  let sectionsNode;
  walk(sectionsAst, (node) => {
    if (ts.isVariableDeclaration(node) && node.name.getText() === 'sections') sectionsNode = node.initializer;
  });
  const sections = [];
  const inventory = [];
  for (const [index, sectionNode] of sectionsNode.elements.entries()) {
    const section = { id: `ogs-stage-${index + 1}`, titleEn: literal(sectionNode.elements[0]), lessons: [] };
    const entries = sectionNode.elements[1].elements;
    for (const entry of entries) {
      const className = entry.text;
      const relative = imports.get(className);
      const text = await source(relative);
      const ast = ts.createSourceFile(relative, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      const classes = ast.statements.filter(ts.isClassDeclaration);
      const lessonClass = classes.find((cls) => cls.name.text === className);
      const lessonId = literal(returned(lessonClass, 'section'));
      const registered = returned(lessonClass, 'pages').elements.map((node) => node.text);
      const lesson = { id: `ogs-${lessonId}`, upstreamId: lessonId, className,
        titleEn: literal(returned(lessonClass, 'title')), subtextEn: literal(returned(lessonClass, 'subtext')), pages: [] };
      const counts = {};
      for (const [pageIndex, pageClass] of registered.entries()) {
        const cls = classes.find((candidate) => candidate.name.text === pageClass);
        const config = { width: 9, height: 9, initial_player: 'black', ...literal(returned(cls, 'config')) };
        const answer = pageAnswer(cls, config, lessonId);
        const page = { id: `${lesson.id}-${pageClass.toLowerCase()}`, pageClass, pageIndex,
          textEn: translatedText(method(cls, 'text'), true), config,
          position: { width: config.width, height: config.height, initialPlayer: config.initial_player,
            black: decodeOgsPoints(config.initial_state?.black ?? '', config.width, config.height),
            white: decodeOgsPoints(config.initial_state?.white ?? '', config.width, config.height),
            marks: Object.fromEntries(Object.entries(config.marks ?? {}).map(([key, value]) =>
              [key, decodeOgsPoints(value, config.width, config.height)])) }, answer,
          source: { commit: OGS_COMMIT, path: relative,
            url: `${REPOSITORY}/blob/${OGS_COMMIT}/${relative}#L${ast.getLineAndCharacterOfPosition(cls.getStart()).line + 1}`,
            lessonUrl: `https://online-go.com/learn-to-play-go/${lessonId}/${pageIndex}` } };
        lesson.pages.push(page);
        counts[answer.kind] = (counts[answer.kind] ?? 0) + 1;
      }
      inventory.push({ section: section.titleEn, id: lesson.id, className, pages: lesson.pages.length, answerKinds: counts,
        selected: SELECTED.has(className), path: relative });
      if (SELECTED.has(className)) {
        if (SELECTED_PAGES[className]) lesson.pages = lesson.pages.filter((page) => SELECTED_PAGES[className].includes(page.pageIndex));
        section.lessons.push(lesson);
      }
    }
    if (section.lessons.length) sections.push(section);
  }
  const catalog = { schemaVersion: 1, source: { repository: REPOSITORY, commit: OGS_COMMIT, license: 'AGPL-3.0-or-later' }, sections };
  const english = Object.fromEntries(sections.flatMap((section) => [[`${section.id}.title`, section.titleEn], ...section.lessons.flatMap((lesson) => [
    [`${lesson.id}.title`, lesson.titleEn], [`${lesson.id}.subtext`, lesson.subtextEn],
    ...lesson.pages.flatMap((page) => [[`${page.id}.text`, page.textEn],
      ...Object.entries(page.answer.labelsEn ?? {}).map(([value, label]) => [`${page.id}.option.${value}`, label]),
      ...(page.answer.labelEn ? [[`${page.id}.action`, page.answer.labelEn]] : []),
    ]),
  ])]));
  await output(path.join(ROOT, 'catalog.json'), `${JSON.stringify(catalog, null, 2)}\n`);
  await output(path.join(ROOT, 'inventory.json'), `${JSON.stringify(inventory, null, 2)}\n`);
  await output(path.join(ROOT, 'english.json'), `${JSON.stringify(english, null, 2)}\n`);
  await output(path.join(ROOT, 'LICENSE'), await source('LICENSE'));
  const chinese = JSON.parse(await fs.readFile(path.join(ROOT, 'zh-CN.json'), 'utf8'));
  const translated = (key) => {
    if (!(key in chinese)) throw new Error(`Missing Chinese translation: ${key}`);
    return chinese[key];
  };
  const runtime = { source: catalog.source, sections: sections.map((section) => ({
    id: section.id, title: translated(`${section.id}.title`), lessons: section.lessons.map((lesson) => ({
      id: lesson.id, title: translated(`${lesson.id}.title`), subtext: translated(`${lesson.id}.subtext`),
      pages: lesson.pages.map((page) => {
        const { kind } = page.answer;
        const answer = kind === 'move-tree' ? { kind, correct: page.answer.correct, wrong: page.answer.wrong }
          : kind === 'choice' ? { kind, options: page.answer.options.map((value) => ({ id: value,
            label: translated(`${page.id}.option.${value}`) })), correct: page.answer.correct }
            : kind === 'action' ? { kind, action: page.answer.action }
              : kind === 'remove-stones' ? { kind, points: page.answer.points } : page.answer;
        return { id: page.id, text: translated(`${page.id}.text`), position: page.position, answer,
          sourceUrl: page.source.url };
      }),
    })),
  })) };
  const runtimeDir = path.resolve(ROOT, '../../domains/coach/sourceData');
  if (!checkOnly) await fs.mkdir(runtimeDir, { recursive: true });
  await output(path.join(runtimeDir, 'ogs.json'), `${JSON.stringify(runtime, null, 2)}\n`);
  const pages = sections.flatMap((section) => section.lessons.flatMap((lesson) => lesson.pages));
  return { sourceLessons: inventory.length, sourcePages: inventory.reduce((n, lesson) => n + lesson.pages, 0),
    selectedLessons: sections.reduce((n, section) => n + section.lessons.length, 0), selectedPages: pages.length,
    answerKinds: pages.reduce((counts, page) => ({ ...counts, [page.answer.kind]: (counts[page.answer.kind] ?? 0) + 1 }), {}) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(await importOgsLearning(), null, 2));
}
