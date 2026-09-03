import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

test('Silmoor hints stay centered below the top HUD', () => {
  const html = readFileSync(new URL('../public/games/silmoor/index.html', import.meta.url), 'utf8');
  const hintRule = html.match(/\.hint\{([^}]*)\}/)?.[1] ?? '';

  assert.match(hintRule, /left:50%/);
  assert.match(hintRule, /top:calc\(max\(10px,env\(safe-area-inset-top\)\) \+ 44px\)/);
  assert.match(hintRule, /bottom:auto/);
  assert.match(hintRule, /translateX\(-50%\)/);
  assert.doesNotMatch(hintRule, /safe-area-inset-bottom/);
});

test('Silmoor resizes to the viewport on load and on resize', () => {
  const source = readFileSync(new URL('../public/games/silmoor/game.js', import.meta.url), 'utf8');
  const listeners = new Map();
  const elements = new Map();
  const context2d = new Proxy({}, {
    get(target, key) {
      if (key === 'createPattern') return () => ({});
      if (key === 'createLinearGradient') return () => ({ addColorStop() {} });
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
    style: {},
    textContent: '',
    innerHTML: '',
    hidden: false,
    classList: { add() {}, remove() {}, contains() { return false; } },
    addEventListener() {},
    getContext: () => context2d,
  });
  const document = {
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, element(id));
      return elements.get(id);
    },
    querySelectorAll() { return []; },
    createElement(tag) {
      if (tag === 'canvas') return { width: 0, height: 0, getContext: () => context2d };
      return element(tag);
    }
  };
  const canvas = document.getElementById('c');
  const sandbox = {
    window: null,
    document,
    innerWidth: 390,
    innerHeight: 844,
    devicePixelRatio: 2,
    Image: class {
      constructor() {
        this.onload = null;
        this.onerror = null;
      }
      set src(_value) {
        if (this.onload) this.onload();
      }
    },
    requestAnimationFrame() {},
    addEventListener(type, fn) { listeners.set(type, fn); },
    removeEventListener() {},
    performance: { now: () => 0 },
    localStorage: { getItem: () => null, setItem() {} },
    Math,
    console,
  };
  sandbox.window = sandbox;

  vm.runInNewContext(source, sandbox);

  assert.equal(canvas.width, 780);
  assert.equal(canvas.height, 1688);
  assert.equal(canvas.style.width, '390px');
  assert.equal(canvas.style.height, '844px');

  sandbox.innerWidth = 844;
  sandbox.innerHeight = 390;
  listeners.get('resize')();

  assert.equal(canvas.width, 1688);
  assert.equal(canvas.height, 780);
  assert.equal(canvas.style.width, '844px');
  assert.equal(canvas.style.height, '390px');
});
