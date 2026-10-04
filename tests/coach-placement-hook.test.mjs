import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTestModule } from './helpers/loadTestModule.mjs';

// Callback/effect tests use the shared minimal hook host. Actual pointer dispatch,
// touch scrolling and rendered placement still require the browser checks.
const { useCoachPlacement, renderHook } = await loadTestModule({
  reactHost: true,
  contents: `export { useCoachPlacement } from './components/coach/useCoachPlacement';
    export { renderHook } from './tests/helpers/reactHooks';`,
});

function eventTarget(fields = {}) {
  const listeners = new Map();
  return { ...fields, listeners,
    addEventListener(type, callback) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(callback);
    },
    removeEventListener(type, callback) { listeners.get(type)?.delete(callback); },
    emit(type) { for (const callback of [...listeners.get(type) ?? []]) callback(); },
    count(type) { return listeners.get(type)?.size ?? 0; },
  };
}

function setup(t) {
  const viewport = eventTarget({ width: 1000, height: 800, offsetLeft: 0, offsetTop: 0 });
  const window = eventTarget({ innerWidth: 1000, innerHeight: 800, visualViewport: viewport });
  const observers = [], reads = { container: 0, character: 0, bubble: 0 };
  class ResizeObserver {
    constructor(callback) { this.callback = callback; this.observed = new Set(); this.disconnected = false; observers.push(this); }
    observe(element) { this.observed.add(element); }
    disconnect() { this.disconnected = true; this.observed.clear(); }
    emit() { if (!this.disconnected) this.callback(); }
  }
  const originals = new Map();
  for (const [name, value] of Object.entries({ window, ResizeObserver,
    getComputedStyle: () => ({ paddingLeft: '12px', paddingRight: '12px', columnGap: '12px' }),
  })) {
    originals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  }
  let api;
  const captured = new Set(), captureCalls = [], releases = [], focuses = [];
  const speech = { scrollHeight: 100, clientHeight: 100 };
  const frame = { x: 100, y: 350, width: 500, height: 180 };
  const pet = { x: 120, y: 400, width: 80, height: 140 };
  const bubbleBox = { x: 220, y: 390, width: 384, height: 100 };
  const container = { getBoundingClientRect() { reads.container++; return { ...frame }; } };
  const character = {
    getBoundingClientRect() {
      reads.character++;
      return { ...pet, x: api?.character.style?.left ?? pet.x, y: api?.character.style?.top ?? pet.y };
    },
    focus(options) { focuses.push(options); },
    setPointerCapture(id) { captured.add(id); captureCalls.push(id); },
    hasPointerCapture(id) { return captured.has(id); },
    releasePointerCapture(id) { assert.ok(captured.delete(id)); releases.push(id); },
  };
  const bubble = {
    getBoundingClientRect() { reads.bubble++; return { ...bubbleBox }; },
    querySelector(selector) { assert.equal(selector, '[data-coach-message]'); return speech; },
  };
  const host = renderHook(useCoachPlacement);
  const render = () => { host.render(); api = host.render(); return api; };
  render();
  api.container.ref.current = container;
  api.character.ref.current = character;
  api.bubble.ref.current = bubble;
  let mounted = true;
  const unmount = () => { if (mounted) { mounted = false; host.unmount(); } };
  t.after(() => {
    unmount();
    for (const [name, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  });
  function event(overrides = {}) {
    return { currentTarget: character, pointerId: 1, button: 0, isPrimary: true,
      clientX: 150, clientY: 430, shiftKey: false, prevented: false, stopped: false,
      preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; }, ...overrides };
  }
  return { render, event, unmount, window, viewport, observers, reads, captured, captureCalls, releases, focuses,
    container, character, bubble, frame, pet, speech, bubbleBox, get api() { return api; } };
}

test('coach drag accepts only the primary left pointer, captures it and starts at the 4px threshold', t => {
  const s = setup(t);
  for (const patch of [{ button: 1 }, { button: 2 }, { isPrimary: false }]) {
    const event = s.event(patch);
    s.api.character.onPointerDown(event);
    assert.equal(event.prevented, false);
    assert.equal(event.stopped, false);
  }
  assert.deepEqual(s.captureCalls, []);
  assert.equal(s.reads.container, 0, 'ignored input must not start a measurement or drag');
  const down = s.event();
  s.api.character.onPointerDown(down);
  assert.equal(down.prevented && down.stopped, true);
  assert.deepEqual(s.captureCalls, [1]);
  assert.deepEqual(s.focuses, [{ preventScroll: true }]);
  s.api.character.onPointerDown(s.event({ pointerId: 2 }));
  s.api.character.onPointerMove(s.event({ pointerId: 2, clientX: 200 }));
  s.api.character.onPointerUp(s.event({ pointerId: 2 }));
  assert.equal(s.render().container['data-coach-floating'], undefined);
  assert.deepEqual([...s.captured], [1]);
  s.api.character.onPointerMove(s.event({ clientX: 153.9 }));
  assert.equal(s.render().character.style, undefined);
  const threshold = s.event({ clientX: 154 });
  s.api.character.onPointerMove(threshold);
  assert.equal(threshold.prevented && threshold.stopped, true);
  assert.equal(s.render().container['data-coach-floating'], true);
  assert.equal(s.api.character.style.left, 124);
  s.api.character.onPointerMove(s.event({ clientX: 153 }));
  assert.equal(s.render().character.style.left, 123, 'after activation, moving back within 4px still follows the pointer');
  const settled = { ...s.api.character.style };
  s.api.character.onPointerUp(s.event());
  assert.deepEqual(s.releases, [1]);
  s.api.character.onPointerMove(s.event({ clientX: 300 }));
  assert.deepEqual(s.render().character.style, settled, 'movement after pointerup cannot continue the finished drag');
});

test('pointer cancellation restores the preceding placement and Escape or Home returns an idle helper to default', t => {
  const s = setup(t);
  s.api.character.onPointerDown(s.event());
  s.api.character.onPointerMove(s.event({ clientX: 190 }));
  s.render();
  s.api.character.onPointerCancel(s.event());
  assert.equal(s.render().container['data-coach-floating'], undefined);
  assert.equal(s.api.character.style, undefined);
  assert.deepEqual(s.releases, [1]);
  s.api.character.onKeyDown(s.event({ key: 'ArrowRight' }));
  const prior = { ...s.render().character.style };
  s.api.character.onPointerDown(s.event({ pointerId: 3 }));
  s.api.character.onPointerMove(s.event({ pointerId: 3, clientX: 180 }));
  assert.notDeepEqual(s.render().character.style, prior);
  s.api.character.onPointerCancel(s.event({ pointerId: 99 }));
  assert.notDeepEqual(s.render().character.style, prior, 'another pointer cannot cancel this drag');
  const escape = s.event({ key: 'Escape' });
  s.api.character.onKeyDown(escape);
  assert.equal(escape.prevented && escape.stopped, true);
  assert.deepEqual(s.render().character.style, prior, 'Escape during drag restores its previous committed placement');
  assert.deepEqual(s.releases, [1, 3]);
  s.api.character.onKeyDown(s.event({ key: 'Home' }));
  assert.equal(s.render().character.style, undefined);
  s.api.character.onKeyDown(s.event({ key: 'ArrowRight' }));
  s.render();
  s.api.character.onKeyDown(s.event({ key: 'Escape' }));
  assert.equal(s.render().character.style, undefined);
});

test('keyboard arrows move from the measured character position and Shift uses the larger step', t => {
  const s = setup(t);
  const ignored = s.event({ key: 'Enter' });
  s.api.character.onKeyDown(ignored);
  assert.equal(ignored.prevented || ignored.stopped, false);
  assert.equal(s.render().character.style, undefined);
  for (const [key, shiftKey, expected] of [
    ['ArrowRight', false, [128, 400]], ['ArrowDown', true, [128, 424]],
    ['ArrowLeft', false, [120, 424]], ['ArrowUp', false, [120, 416]],
  ]) {
    const event = s.event({ key, shiftKey });
    s.api.character.onKeyDown(event);
    const { style } = s.render().character;
    assert.deepEqual([style.left, style.top], expected);
    assert.equal(event.prevented && event.stopped, true);
  }
  assert.deepEqual(s.captureCalls, [], 'keyboard movement does not acquire pointer capture');
});

test('floating placement remeasures content, window and visual viewport changes without accumulating listeners', t => {
  const s = setup(t);
  assert.equal(s.observers.length, 0);
  assert.equal(s.window.count('resize'), 0);
  s.api.character.onKeyDown(s.event({ key: 'ArrowRight' }));
  s.render();
  assert.equal(s.observers.length, 1);
  const observer = s.observers[0];
  assert.deepEqual(observer.observed, new Set([s.bubble, s.character]));
  assert.equal(s.window.count('resize'), 1);
  assert.equal(s.viewport.count('resize'), 1);
  assert.equal(s.viewport.count('scroll'), 1);
  for (const notify of [() => observer.emit(), () => s.window.emit('resize'),
    () => s.viewport.emit('resize'), () => s.viewport.emit('scroll')]) {
    const before = { ...s.reads };
    s.frame.height += 5;
    s.speech.scrollHeight += 20;
    notify();
    assert.equal(s.render().container.style.height, s.frame.height, 'fresh measurements reach the active placement');
    for (const element of ['container', 'character', 'bubble']) assert.ok(s.reads[element] > before[element]);
    assert.equal(s.observers.length, 1);
    assert.equal(s.window.count('resize'), 1);
  }
  s.api.character.onKeyDown(s.event({ key: 'Home' }));
  s.render();
  assert.equal(observer.disconnected, true);
  assert.equal(s.window.count('resize'), 0);
  assert.equal(s.viewport.count('resize'), 0);
  assert.equal(s.viewport.count('scroll'), 0);
  const before = { ...s.reads };
  observer.emit(); s.window.emit('resize'); s.viewport.emit('scroll');
  assert.deepEqual(s.reads, before, 'returning to default stops all placement measurements');
});

test('losing pointer capture stops further dragging and unmount removes all active observation resources', t => {
  const s = setup(t);
  s.api.character.onPointerDown(s.event());
  s.api.character.onPointerMove(s.event({ clientX: 180 }));
  s.render();
  s.api.character.onLostPointerCapture(s.event({ pointerId: 2 }));
  s.api.character.onPointerMove(s.event({ clientX: 190 }));
  assert.equal(s.render().character.style.left, 160, 'a different pointer losing capture cannot end the active drag');
  const committed = { ...s.api.character.style };
  s.captured.delete(1);
  s.api.character.onLostPointerCapture(s.event());
  s.api.character.onPointerMove(s.event({ clientX: 250 }));
  s.api.character.onPointerUp(s.event());
  assert.deepEqual(s.render().character.style, committed);
  assert.deepEqual(s.releases, [], 'capture already lost in the browser is not released twice');
  s.unmount();
  assert.equal(s.observers[0].disconnected, true);
  assert.equal(s.window.count('resize'), 0);
  assert.equal(s.viewport.count('resize'), 0);
  assert.equal(s.viewport.count('scroll'), 0);
  const before = { ...s.reads };
  s.observers[0].emit(); s.window.emit('resize'); s.viewport.emit('resize'); s.viewport.emit('scroll');
  assert.deepEqual(s.reads, before, 'unmounted helpers cannot retain resize callbacks');
});
