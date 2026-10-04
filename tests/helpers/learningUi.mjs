import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { loadTestModule } from './loadTestModule.mjs';

const require = createRequire(import.meta.url);
const { LearningExercise, LearningControls, GamePlayControls, ScoreBoard, LearningCenter, TutorialModal, GameBoard, CoachMarkers, CoachBubble, CoachPet, Panel, Modal, ProgressBar, renderHook } = await loadTestModule({
  reactHost: true, define: { 'process.env.NODE_ENV': '"production"' },
  plugins: [{ name: 'real-jsx-runtime', setup(build) {
    build.onResolve({ filter: /jsx-runtime$/ }, () => ({ path: require.resolve('react/jsx-runtime') }));
    build.onResolve({ filter: /^lucide-react$/ }, () => ({ path: pathToFileURL(require.resolve('lucide-react')).href, external: true }));
    build.onResolve({ filter: /\/GameBoard$/ }, () => ({ path: 'GameBoard', namespace: 'teaching-board' }));
    build.onLoad({ filter: /.*/, namespace: 'teaching-board' }, () => ({ contents: 'export const GameBoard = () => null;' }));
    build.onResolve({ filter: /\/RenderStoneIcon$/ }, () => ({ path: 'RenderStoneIcon', namespace: 'teaching-stone' }));
    build.onLoad({ filter: /.*/, namespace: 'teaching-stone' }, () => ({ contents: 'export const RenderStoneIcon = () => null;' }));
  } }],
  contents: `export { LearningExercise } from './components/coach/LearningExercise';
    export { LearningControls } from './components/coach/LearningControls';
    export { GamePlayControls } from './components/GamePlayControls';
    export { ScoreBoard } from './components/ScoreBoard';
    export { LearningCenter } from './components/coach/LearningCenter';
    export { TutorialModal } from './components/TutorialModal';
    export { GameBoard } from './components/GameBoard';
    export { CoachMarkers } from './components/board/CoachMarkers';
    export { CoachBubble } from './components/coach/CoachBubble';
    export { CoachPet } from './components/CoachPet';
    export { Panel, Modal, ProgressBar } from './ui/common';
    export { renderHook } from './tests/helpers/reactHooks';`,
});
const noop = () => {};
const props = {
  title: '提子', concept: 'PRIVATE_CONCEPT', example: 'PRIVATE_EXAMPLE', misconception: 'PRIVATE_TRAP',
  phase: 'practice', instruction: '轮到黑棋，提掉这颗白子。', continueLabel: '我来试试',
  onContinue: noop, onUndo: noop, canUndo: false, sources: [], lastMove: null,
  onReturnFromDemo: noop, demoStep: 1, demoTotal: 3,
  lessonProgress: '第 1 / 6 课 · 第 1 / 2 题', turnLabel: '轮到你 · 执黑', markers: [], onInspect: noop,
  prompt: '轮到黑棋，提掉这颗白子。', kind: 'point', currentPlayer: 'black', selectedPoint: null,
  blackCaptures: 0, whiteCaptures: 0,
  board: Array.from({ length: 5 }, () => Array(5).fill(null)),
  choices: [], selectedChoice: '', numberAnswer: '', numberUnit: '气',
  hint: '', hintLevel: 0, result: null, independent: true, explanationVisible: false,
  onChoice: noop, onPoint: noop, onNumber: noop, onHint: noop, onSubmit: noop, onRetry: noop,
  onNext: noop, onBack: noop, onExplanation: noop, canSubmit: false,
};
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
function render(t, input = props, Component = LearningExercise) {
  const host = renderHook(() => {
    if (Component !== LearningExercise) return Component(input);
    const controls = LearningControls(input);
    return [controls.type(controls.props), LearningExercise(input)];
  });
  t.after(() => host.unmount());
  return host;
}
function button(tree, label) {
  const found = elements(tree).find(node => (typeof node.props.onClick === 'function' || node.props.type === 'submit') && text(node).trim() === label);
  assert.ok(found, `Missing ${label}`);
  return found;
}
function centerInput(active) {
  return { isOpen: true, active, loaded: true, filter: 'all', sections: [], lessons: [], personal: [],
    storageMessage: '', notice: '', onClose: noop, onFilter: noop, onLesson: noop, onPersonal: noop,
    onExport: noop, onImport: noop, onDelete: noop };
}


export { LearningExercise, LearningControls, GamePlayControls, ScoreBoard, LearningCenter, TutorialModal, GameBoard, CoachMarkers, CoachBubble, CoachPet, Panel, Modal, ProgressBar, props, noop, render, elements, text, button, centerInput };
