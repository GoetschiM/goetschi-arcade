import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

test('Neon Swarm keeps animating from the menu and starts its timer', () => {
  const html = readFileSync(new URL('../public/games/neon-swarm/index.html', import.meta.url), 'utf8');
  const source = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(source, 'inline game script should exist');

  const frames = [];
  const elements = new Map();
  const context2d = new Proxy({}, {
    get(target, key) {
      if (key === 'createRadialGradient') return () => ({ addColorStop() {} });
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
    getContext: () => context2d
  });
  const document = {
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, element(id));
      return elements.get(id);
    },
    createElement: () => element('button')
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
  assert.equal(frames.length, 1);
  assert.doesNotThrow(() => frames.shift()(0), 'menu frame must not terminate the animation loop');
  assert.equal(frames.length, 1);

  elements.get('startBtn').onclick();
  for (let timestamp = 16; timestamp <= 1120; timestamp += 16) {
    frames.shift()(timestamp);
  }

  assert.equal(elements.get('start').style.display, 'none');
  assert.equal(elements.get('hud').hidden, false);
  assert.equal(elements.get('time').textContent, '00:01');
  assert.equal(frames.length, 1, 'animation loop must still be scheduled after starting');
});
