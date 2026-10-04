// Minimal hook host: tests exercise callbacks/effect cleanup without a DOM.
// It deliberately does not claim to cover React rendering or browser behavior.
interface Slot { value: unknown; dependencies?: readonly unknown[]; cleanup?: () => void }
interface Host { slots: Slot[]; cursor: number; effects: (() => void)[] }
let current: Host | null = null;
function host() { if (!current) throw new Error('Hook outside test render'); return current; }
function same(a?: readonly unknown[], b?: readonly unknown[]) {
  return !!a && !!b && a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
}
export function useState<T>(initial: T | (() => T)): [T, (value: T | ((previous: T) => T)) => void] {
  const owner = host();
  const index = owner.cursor++;
  const slot = owner.slots[index] ??= { value: typeof initial === 'function' ? (initial as () => T)() : initial };
  return [slot.value as T, value => { slot.value = typeof value === 'function' ? (value as (previous: T) => T)(slot.value as T) : value; }];
}
export function useRef<T>(initial: T) { return useState(() => ({ current: initial }))[0]; }
export function useReducer<S, A>(reducer: (state: S, action: A) => S, initialState: S): [S, (action: A) => void] {
  const [state, setState] = useState(initialState);
  return [state, action => setState(previous => reducer(previous, action))];
}
export function useCallback<T>(callback: T, dependencies: readonly unknown[]): T {
  const owner = host();
  const index = owner.cursor++;
  const slot = owner.slots[index];
  if (!slot || !same(slot.dependencies, dependencies)) owner.slots[index] = { value: callback, dependencies };
  return owner.slots[index].value as T;
}
export function useMemo<T>(factory: () => T, dependencies: readonly unknown[]): T {
  const owner = host();
  const index = owner.cursor++;
  const slot = owner.slots[index];
  if (!slot || !same(slot.dependencies, dependencies)) owner.slots[index] = { value: factory(), dependencies };
  return owner.slots[index].value as T;
}
export function useEffect(effect: () => void | (() => void), dependencies?: readonly unknown[]) {
  const owner = host();
  const index = owner.cursor++;
  const previous = owner.slots[index];
  if (previous && same(previous.dependencies, dependencies)) return;
  owner.effects.push(() => {
    previous?.cleanup?.();
    const cleanup = effect();
    owner.slots[index] = { value: null, dependencies, cleanup: typeof cleanup === 'function' ? cleanup : undefined };
  });
}
export function renderHook<T>(callback: () => T) {
  const owner: Host = { slots: [], cursor: 0, effects: [] };
  return {
    render() {
      current = owner;
      owner.cursor = 0;
      try { const value = callback(); owner.effects.splice(0).forEach(effect => effect()); return value; }
      finally { current = null; }
    },
    unmount() { owner.slots.forEach(slot => slot.cleanup?.()); },
  };
}
