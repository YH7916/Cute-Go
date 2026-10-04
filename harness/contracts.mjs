import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { architecture } from './architecture.mjs';
import { checks, checkOrder, flowTestPaths, commandScripts } from './commands.mjs';
import { fromRoot } from './paths.mjs';

const guidePath = 'docs/harness.md';
const lf = text => text.replace(/\r\n/g, '\n');
const code = value => `\`${value}\``;
const list = values => values.map(code).join(', ') || '无';
const paths = patterns => list(Array.isArray(patterns) ? patterns : [patterns]);

export function renderHarnessGuide(contract = architecture) {
  const lines = [
    '# Harness 与架构复用指南', '',
    '> 自动生成：修改 `harness/architecture.mjs` 或 `harness/commands.mjs` 后运行 `npm run harness:sync`；不要直接修改本文。', '',
    '业务模块沿用现有职责边界；harness 共享同一份依赖契约、命令编排和测试基础设施。', '',
    '## 修改入口', '',
    '1. 先读 [AGENTS.md](../AGENTS.md)，按下表查找复用入口，再搜索调用方和回归测试。',
    '2. 相同职责扩展现有模块；确需共享抽象时列出至少两个实际消费者和共同语义。按独立职责或平台边界拆分不要求两个消费者。',
    '3. 新能力遵守依赖矩阵。新边界/入口先修改契约，并增加独立的允许/禁止用例；不要由同一规则自动生成全部预期。',
    '4. 运行 `npm run harness:sync` 更新本文，然后执行 `npm run check` 和 `git diff --check`。', '',
    '运行流程和领域不变量见 [架构说明](architecture.md)；本文的矩阵、入口与检查命令由代码生成。', '',
    '## 复用入口', '',
  ];
  for (const entry of contract.reuseEntries) {
    lines.push(`### ${entry.id}`, '', entry.responsibility, '');
    for (const point of entry.entryPoints) lines.push(`- [${point.path}](../${point.path})：${list(point.exports)}`);
    lines.push('', `验证：${entry.verification}`, '', `限制：${entry.limits}`, '');
  }
  lines.push('## 依赖矩阵', '',
    '`harness/architecture.mjs` 为唯一数据来源；`harness/eslint.mjs` 转成 ESLint 规则，根配置只转发。默认拒绝未列出的本地依赖，特例见下一节。', '',
    '| 模块 | 文件匹配 | 职责 | 允许依赖 |', '| --- | --- | --- | --- |');
  for (const module of contract.modules) {
    lines.push(`| ${code(module.id)} | ${paths(module.patterns)} | ${module.responsibility} | ${list(module.allow)} |`);
  }
  lines.push('', '### 迁移例外', '');
  for (const exception of contract.dependencyExceptions) {
    lines.push(`- ${code(exception.from)}${exception.fromFiles ? ` (${list(exception.fromFiles)})` : ''} → ${list(exception.to)}${exception.toFiles ? ` (${list(exception.toFiles)})` : ''}${exception.kind ? `，仅 ${exception.kind} 导入` : ''}。${exception.reason}`);
  }
  lines.push('', '### 检查范围与质量限制', '',
    `- 文件：${list(contract.sourcePolicy.files)}。`,
    `- 排除：${list(contract.sourcePolicy.ignores)}。`,
    `- 文件上限：${contract.sourcePolicy.maxEffectiveLines} 有效行；忽略空行 ${contract.sourcePolicy.skipBlankLines}，忽略注释 ${contract.sourcePolicy.skipComments}；大小豁免 ${list(contract.sourcePolicy.sizeExceptions)}。`,
    `- 禁止内联配置：${contract.qualityPolicy.noInlineConfig}；未使用禁用指令：${contract.qualityPolicy.unusedDisableDirectives}；suppression 白名单：${list(contract.qualityPolicy.allowedSuppressions)}。`,
    '- 禁止显式 any、未说明的类型忽略及运行时循环依赖；外部数据先校验。');
  for (const restriction of contract.packageRestrictions) lines.push(`- ${paths(restriction.files)} 禁止包 ${list(restriction.packages)}：${restriction.message}`);
  for (const restriction of contract.propertyRestrictions) lines.push(`- ${paths(restriction.files)} 禁止属性 ${code(restriction.property)}，排除 ${list(restriction.ignores)}：${restriction.message}`);
  for (const exclusion of contract.sourcePolicy.excludedRuntime) lines.push(`- 独立运行时 ${code(exclusion.path)}：${exclusion.reason}`);
  lines.push('', '## 统一检查流程', '',
    `完整流程：${checkOrder.map(code).join(' → ')}；任一步失败立即停止并保留非零退出码。`, '',
    '| 阶段 | 验证内容 |', '| --- | --- |');
  for (const name of checkOrder) lines.push(`| ${code(name)} | ${checks[name].description} |`);
  lines.push('', '| npm 入口 | 实际命令 |', '| --- | --- |');
  for (const [name, command] of Object.entries(commandScripts)) lines.push(`| ${code(`npm run ${name}`)} | ${code(command)} |`);
  lines.push('',
    '- 本地与 `.github/workflows/quality.yml` 均运行 `npm run check`；npm 脚本必须与上述编排一致。CI 的 Windows/Ubuntu 配置不代表远端已执行。',
    '- contracts 检查引用模块、命名导出、npm 入口、CI 入口、规则指引和本文是否漂移；默认只读，`harness:sync` 仅更新生成指南。',
    '- `npm test -- tests/review-position.test.ts` 或 `npm test -- tests/harness` 只做局部回归；不能替代完整 check。',
    '- CLI 按仓库位置解析依赖和测试路径，可在任意 cwd 调用；check 不接受跳过阶段或缩小测试范围的参数。', '',
    '## 测试基础设施', '',
    '- `harness/testing.mjs` 统一递归发现 `.test.ts` / `.test.tsx` / `.test.mjs`，打包 TS 后交给 Node test；`scripts/run-tests.mjs` 仅转发。',
    `- ${code('npm run test:flows')} 复用 test 阶段，固定选择 ${list(flowTestPaths)}，直接调用业务逻辑走流程；全量 test 和 check 自动包含这些回归。`,
    '- MJS 测试需加载 TS 时复用 `tests/helpers/loadTestModule.mjs` 的 `loadTestModule` / `bundleTestSource`；不再自行搭建 esbuild、临时模块或全局 require。',
    '- `reactHost: true` 显式启用 `tests/helpers/reactHooks.ts`；普通模块不替换 React。该 host 验证回调/清理，不等价于真实 React 并发渲染。',
    '- 共用加载器负责仓库根路径、独立临时目录和失败清理；业务 fixture、断言、SDK 假实现保留在各自测试。',
    '- `tests/harness` 包含实际 ESLint 反例、命令失败/选择器/跨 cwd 回归和契约漂移检查；约束变更须补独立预期。', '',
    '## 能力边界', '');
  lines.push(...contract.limitations.map(limit => `- ${limit}`));
  lines.push('- 自动检查包含 Node 单线程 WASM 的真实 ONNX 推理；不包含真实浏览器、Android 和原生 TapTap 验收。涉及模型/SDK/交互时按 AGENTS.md 补对应环境的实测。', '');
  return lines.join('\n');
}

// Read syntax only: checking the guide must never initialize a browser, model or SDK.
function namedExports(path, source) {
  const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
  const names = new Set();
  for (const statement of file.statements) {
    if (ts.isExportDeclaration(statement) && statement.exportClause && ts.isNamedExports(statement.exportClause)) {
      statement.exportClause.elements.forEach(element => names.add(element.name.text));
    }
    const modifiers = ts.canHaveModifiers(statement) ? ts.getModifiers(statement) : undefined;
    if (!modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword)
      || modifiers.some(modifier => modifier.kind === ts.SyntaxKind.DefaultKeyword)) continue;
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) if (ts.isIdentifier(declaration.name)) names.add(declaration.name.text);
    } else if (statement.name && ts.isIdentifier(statement.name)) names.add(statement.name.text);
  }
  return names;
}

export function validateContracts(snapshot, contract = architecture) {
  const errors = [];
  const ids = new Set(contract.modules.map(module => module.id));
  if (ids.size !== contract.modules.length) errors.push('Duplicate architecture module id');
  for (const module of contract.modules) {
    for (const target of module.allow) if (target !== '*' && !ids.has(target)) errors.push(`Unknown dependency ${module.id} -> ${target}`);
  }
  for (const exception of contract.dependencyExceptions) {
    for (const id of [exception.from, ...exception.to]) if (!ids.has(id)) errors.push(`Unknown exception module: ${id}`);
    if (!exception.reason.trim()) errors.push('Dependency exception requires a reason');
  }
  if (new Set(checkOrder).size !== checkOrder.length || Object.keys(checks).some(name => !checkOrder.includes(name))) errors.push('Check pipeline must run each declared stage exactly once');
  for (const name of checkOrder) if (!Object.hasOwn(checks, name)) errors.push(`Unknown pipeline stage: ${name}`);
  for (const [name, command] of Object.entries(commandScripts)) {
    if (snapshot.scripts[name] !== command) errors.push(`package.json scripts.${name} must be: ${command}`);
  }
  if (new Set(contract.reuseEntries.map(entry => entry.id)).size !== contract.reuseEntries.length) errors.push('Duplicate reuse entry id');
  for (const entry of contract.reuseEntries) {
    for (const point of entry.entryPoints) {
      const source = snapshot.entries[point.path];
      if (typeof source !== 'string') { errors.push(`Missing reuse entry: ${point.path}`); continue; }
      const exports = namedExports(point.path, source);
      for (const name of point.exports) if (!exports.has(name)) errors.push(`Missing named export ${point.path}: ${name}`);
    }
  }
  if (lf(snapshot.guide) !== renderHarnessGuide(contract)) errors.push(`${guidePath} has drifted; run npm run harness:sync`);
  if ([...snapshot.ci.matchAll(/^\s*- run: npm run check\s*$/gm)].length !== 1) errors.push('quality.yml must call the canonical npm run check entry exactly once');
  const ciCommands = snapshot.ci.split(/\r?\n/).filter(line => /^\s*- run:/.test(line));
  if (ciCommands.some(line => /\bnpm (?:run )?(?:lint|typecheck|test|build)\b/.test(line))) errors.push('quality.yml must not maintain a second check pipeline');
  for (const pointer of ['harness/architecture.mjs', 'docs/harness.md']) if (!snapshot.agents.includes(pointer)) errors.push(`AGENTS.md must point to ${pointer}`);
  if (!snapshot.claude.includes('[AGENTS.md](AGENTS.md)')) errors.push('CLAUDE.md must reuse AGENTS.md');
  if (snapshot.eslint.trim() !== "export { default } from './harness/eslint.mjs';") errors.push('eslint.config.js must remain a thin harness adapter');
  return errors;
}

async function readOptional(path) {
  try { return await readFile(fromRoot(path), 'utf8'); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
export async function readContractSnapshot() {
  const entryPaths = [...new Set(architecture.reuseEntries.flatMap(entry => entry.entryPoints.map(point => point.path)))];
  const [metadata, guide, ci, agents, claude, eslint, entries] = await Promise.all([
    readFile(fromRoot('package.json'), 'utf8'), readOptional(guidePath),
    readFile(fromRoot('.github/workflows/quality.yml'), 'utf8'), readFile(fromRoot('AGENTS.md'), 'utf8'),
    readFile(fromRoot('CLAUDE.md'), 'utf8'), readFile(fromRoot('eslint.config.js'), 'utf8'),
    Promise.all(entryPaths.map(async path => [path, await readOptional(path)])),
  ]);
  return { scripts: JSON.parse(metadata).scripts, guide: guide ?? '', ci, agents, claude, eslint, entries: Object.fromEntries(entries) };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    if (args.length && (args.length !== 1 || args[0] !== '--write')) throw new Error('Usage: node harness/contracts.mjs [--write]');
    if (args[0] === '--write') await writeFile(fromRoot(guidePath), renderHarnessGuide());
    const errors = validateContracts(await readContractSnapshot());
    if (errors.length) throw new Error(errors.join('\n'));
    console.log('Harness contracts, reuse entries and generated guide are consistent.');
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
