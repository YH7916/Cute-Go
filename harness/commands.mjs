// npm, the local CLI, CI and the generated guide consume this command map.
export const checks = {
  contracts: { description: '架构契约、复用入口、文档与命令一致性', script: 'harness/contracts.mjs' },
  lint: { description: '依赖边界、类型逃逸、循环与文件大小', package: 'eslint', bin: 'eslint', args: ['--max-warnings', '0'] },
  typecheck: { description: 'TypeScript 全量类型检查', package: 'typescript', bin: 'tsc', args: ['--noEmit'] },
  test: { description: 'Node 回归和 harness 负向测试', script: 'scripts/run-tests.mjs' },
  build: { description: 'Vite 生产构建', package: 'vite', bin: 'vite', args: ['build'] },
};
export const checkOrder = ['contracts', 'lint', 'typecheck', 'test', 'build'];
export const flowTestPaths = ['tests/flows'];
export const commandScripts = {
  check: 'node harness/run.mjs check', lint: 'node harness/run.mjs lint',
  typecheck: 'node harness/run.mjs typecheck', test: 'node harness/run.mjs test',
  build: 'node harness/run.mjs build', 'harness:sync': 'node harness/contracts.mjs --write',
  'test:flows': 'node harness/run.mjs test:flows',
};
