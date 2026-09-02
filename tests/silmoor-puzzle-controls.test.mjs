import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

function loadSilmoor() {
  const source = readFileSync(new URL('../public/games/silmoor/game.js', import.meta.url), 'utf8');
  const elements = new Map();
  const audioStats = { oscillatorsStarted: 0 };
  const context2d = new Proxy({}, {
    get(target, key) {
      if (key === 'createPattern') return () => ({});
      if (key === 'createLinearGradient' || key === 'createRadialGradient') return () => ({ addColorStop() {} });
      return target[key] ?? (() => {});
    },
    set(target, key, value) { target[key] = value; return true; }
  });
  const element = id => ({
    id,
    style: {},
    textContent: '',
    innerHTML: '',
    classList: { add() {}, remove() {}, toggle() {} },
    listeners: new Map(),
    addEventListener(type, callback) { this.listeners.set(type, callback); },
    setPointerCapture() {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 120, height: 120 }),
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
  const sandbox = {
    __SILMOOR_TEST_MODE__: true,
    window: null,
    document,
    innerWidth: 390,
    innerHeight: 844,
    devicePixelRatio: 2,
    Image: class { set src(_value) { if (this.onload) this.onload(); } },
    AudioContext: class {
      constructor() { this.currentTime = 0; this.state = 'running'; this.destination = {}; }
      createGain() {
        return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {}, setTargetAtTime() {} }, connect() {} };
      }
      createOscillator() {
        return {
          type: 'sine',
          frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} },
          connect() {},
          start() { audioStats.oscillatorsStarted++; },
          stop() {},
        };
      }
      resume() { this.state = 'running'; }
    },
    requestAnimationFrame() {},
    addEventListener() {},
    setTimeout(callback) { callback(); },
    localStorage: { getItem: () => null, setItem() {} },
    Math,
    console,
  };
  sandbox.window = sandbox;
  vm.runInNewContext(source, sandbox);
  return { api: sandbox.__silmoorTest, elements, audioStats };
}

test('Silmoor rune block crushes spikes and activates a pressure plate', () => {
  const { api } = loadSilmoor();
  const spikes = [{ x: 600, y: 712, w: 120, h: 30, crushed: false }];
  const crates = [{ x: 590, y: 684, w: 56, h: 56 }];
  const player = { x: 300, y: 684, w: 24, h: 36 };

  assert.equal(api.crushSpikesUnderCrates(spikes, crates), 1);
  assert.equal(spikes[0].crushed, true);
  assert.equal(api.crushSpikesUnderCrates(spikes, crates), 0, 'a flattened field only triggers once');

  const plate = { x: 840, y: 720, w: 100, h: 20 };
  crates[0].x = 850;
  assert.equal(api.pressesPlate(plate, crates, player), true);
  crates[0].x = 500;
  assert.equal(api.pressesPlate(plate, crates, player), false);
});

test('Silmoor rune-block puzzles cross spikes and activate their plates', () => {
  const { api } = loadSilmoor();
  const puzzles = [
    { level: 1, playerX: 330, minimumCrateX: 800, frames: 130 },
    { level: 2, playerX: 1170, minimumCrateX: 1660, frames: 145 },
  ];

  for (const puzzle of puzzles) {
    api.loadLevel(puzzle.level, false);
    api.setRunning(true);
    const state = api.state();
    state.player.x = puzzle.playerX;
    state.player.y = 704;
    state.player.onG = true;
    state.player.vy = 0;
    state.enemies.forEach(enemy => { enemy.alive = false; });
    api.input.right = true;

    for (let frame = 0; frame < puzzle.frames; frame++) api.update();

    assert.ok(state.crates[0].x > puzzle.minimumCrateX, `level ${puzzle.level + 1} block should cross the spike field; x=${state.crates[0].x}`);
    assert.equal(state.levels[puzzle.level].spikes.at(-1).crushed, true, `level ${puzzle.level + 1} spike field should flatten`);
    assert.equal(state.levels[puzzle.level].plates[0].pressed, true, `level ${puzzle.level + 1} plate should activate`);
    assert.equal(api.state().masks, 5, `level ${puzzle.level + 1} player remains unharmed behind the block`);
  }
});

test('Silmoor analog stick resolves horizontal and vertical directions', () => {
  const { api } = loadSilmoor();

  api.updateStick({ clientX: 120, clientY: 60 });
  assert.equal(api.input.right, true);
  assert.equal(api.input.left, false);

  api.updateStick({ clientX: 60, clientY: 0 });
  assert.equal(api.input.up, true);
  assert.equal(api.input.down, false);

  api.resetStick();
  assert.deepEqual(
    [api.input.left, api.input.right, api.input.up, api.input.down],
    [false, false, false, false]
  );
});

test('Silmoor page exposes analog movement and both action buttons', () => {
  const html = readFileSync(new URL('../public/games/silmoor/index.html', import.meta.url), 'utf8');
  assert.match(html, /id="moveStick"/);
  assert.match(html, /data-k="jump"/);
  assert.match(html, /data-k="attack"/);
});

test('Silmoor starts its ambient sound bed with the game', () => {
  const { elements, audioStats } = loadSilmoor();
  elements.get('startBtn').listeners.get('click')();
  assert.equal(audioStats.oscillatorsStarted, 2);
});
