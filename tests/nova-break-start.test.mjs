import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

test('Nova Break starts without crashing and keeps animating', () => {
  const html = readFileSync(new URL('../public/games/nova-break/index.html', import.meta.url), 'utf8');
  const source = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(source, 'inline game script should exist');

  const frames = [];
  const elements = new Map();
  const context2d = new Proxy({}, {
    get(target, key) {
      if (key === 'createRadialGradient') return () => ({ addColorStop() {} });
      if (key === 'createLinearGradient') return () => ({ addColorStop() {} });
      return target[key] ?? (() => {});
    },
    set(target, key, value) {
      target[key] = value;
      return true;
    }
  });
  const element = id => ({
    id,
    hidden: false,
    style: {},
    textContent: '',
    innerHTML: '',
    children: [],
    appendChild(child) { this.children.push(child); },
    addEventListener() {},
    setPointerCapture() {},
    animate() {},
    querySelector() { return { addEventListener() {}, textContent: '' }; },
    onclick: null,
    getContext: () => context2d
  });
  const document = {
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, element(id));
      return elements.get(id);
    }
  };
  const localStorage = { getItem: () => null, setItem() {} };
  const sandbox = {
    document,
    localStorage,
    innerWidth: 390,
    innerHeight: 844,
    devicePixelRatio: 2,
    performance: { now: () => 0 },
    requestAnimationFrame: callback => frames.push(callback),
    addEventListener() {},
    console,
    Math
  };

  vm.runInNewContext(source, sandbox);
  assert.equal(frames.length, 1, 'a first frame must be scheduled on load');

  assert.doesNotThrow(() => frames.shift()(0), 'menu frame must not terminate the animation loop');
  assert.equal(frames.length, 1, 'loop must re-arm after the menu frame');

  elements.get('startBtn').onclick();
  assert.equal(elements.get('start').style.display, 'none', 'start overlay hides on Start');

  let ran = 0;
  assert.doesNotThrow(() => {
    for (let timestamp = 16; timestamp <= 1200; timestamp += 16) {
      frames.shift()(timestamp);
      ran++;
    }
  }, 'gameplay frames must not throw');
  assert.equal(ran, 75);
  assert.equal(elements.get('hud').hidden, false, 'HUD must stay visible while playing');
  assert.equal(elements.get('over').style.display, 'none', 'game over screen must not appear after 1.2s');
  assert.equal(frames.length, 1, 'animation loop must still be scheduled after starting');
});
