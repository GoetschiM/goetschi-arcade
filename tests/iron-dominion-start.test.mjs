import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

function makeSandbox({ search = '' } = {}) {
  const frames = [];
  const elements = new Map();
  const context2d = new Proxy({}, {
    get(target, key) {
      if (key === 'createRadialGradient' || key === 'createLinearGradient') {
        return () => ({ addColorStop() {} });
      }
      return target[key] ?? (() => {});
    },
    set(target, key, value) {
      target[key] = value;
      return true;
    }
  });
  function makeClassList(el) {
    const set = new Set();
    return {
      add: (...cls) => { cls.forEach(c => set.add(c)); el.className = [...set].join(' '); },
      remove: (...cls) => { cls.forEach(c => set.delete(c)); el.className = [...set].join(' '); },
      toggle: (c, force) => { (force ?? !set.has(c)) ? set.add(c) : set.delete(c); el.className = [...set].join(' '); },
      contains: c => set.has(c)
    };
  }
  const element = id => {
    const el = {
      id,
      hidden: false,
      className: '',
      style: {},
      dataset: {},
      textContent: '',
      innerHTML: '',
      value: '',
      children: [],
    };
    el.classList = makeClassList(el);
    return Object.assign(el, {
    appendChild(child) { this.children.push(child); },
    addEventListener() {},
    removeEventListener() {},
    setPointerCapture() {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 960, height: 640 }),
    clientWidth: 960,
    clientHeight: 640,
    width: 960,
    height: 640,
    querySelector: () => element('_child'),
    querySelectorAll: () => [],
    animate() {},
    onclick: null,
    getContext: () => context2d
    });
  };
  const tabButtons = [
    Object.assign(element('_tabBuild'), { dataset: { tab: 'build' } }),
    Object.assign(element('_tabUnit'), { dataset: { tab: 'unit' } })
  ];
  const document = {
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, element(id));
      return elements.get(id);
    },
    querySelectorAll(sel) {
      if (sel === '.tabs button') return tabButtons;
      return [];
    },
    createElement: tag => element('_created_' + tag),
    addEventListener() {},
    removeEventListener() {}
  };
  const sandbox = {
    document,
    location: { search },
    innerWidth: 960,
    innerHeight: 640,
    devicePixelRatio: 1,
    performance: { now: () => 0 },
    requestAnimationFrame: callback => frames.push(callback),
    setTimeout: () => 0,
    clearTimeout: () => {},
    addEventListener() {},
    removeEventListener() {},
    console,
    Math
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  return { sandbox, frames, elements, tabButtons };
}

test('Iron Dominion starts without crashing and keeps simulating', () => {
  const html = readFileSync(new URL('../public/games/iron-dominion/index.html', import.meta.url), 'utf8');
  const source = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(source, 'inline game script should exist');

  const { sandbox, frames, elements } = makeSandbox({ search: '?test=1' });
  vm.runInContext(source, sandbox);

  assert.equal(frames.length, 1, 'a first animation frame must be scheduled on load');
  assert.doesNotThrow(() => frames.shift()(0), 'menu frame must not throw');
  assert.equal(frames.length, 1, 'loop must re-arm after the menu frame');

  const dbg = sandbox.__dbg;
  assert.ok(dbg, 'debug hook must be exposed when ?test=1 is set');
  assert.equal(dbg.entities.filter(e => e.owner === 'player' && e.isBuilding).length, 2, 'player starts with HQ + refinery');
  assert.equal(dbg.entities.filter(e => e.owner === 'enemy' && e.isBuilding).length, 2, 'enemy starts with HQ + refinery');

  elements.get('startBtn').onclick();
  assert.ok(elements.get('overlay').classList.contains('hide'), 'start overlay hides on start');

  dbg.setPaused(false);
  assert.doesNotThrow(() => {
    for (let i = 0; i < 3000; i++) { dbg.update(0.05); dbg.draw(); }
  }, 'gameplay simulation (150s) must not throw');

  const playerCredits = dbg.player.credits;
  const enemyCredits = dbg.enemy.credits;
  assert.ok(playerCredits > 2500, 'player economy should have grown from harvesting');
  assert.ok(enemyCredits > 2500, 'enemy economy should have grown from harvesting');
  assert.ok(dbg.entities.filter(e => e.owner === 'enemy' && e.isBuilding && !e.dead).length >= 2,
    'enemy AI should have kept or expanded its base');
});
