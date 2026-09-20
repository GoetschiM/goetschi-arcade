(() => {
"use strict";

const canvas = document.getElementById('c'), ctx = canvas.getContext('2d');
let W = 0, H = 0, DPR = 1;

function viewportSize() {
  const vv = window.visualViewport;
  return {
    w: Math.max(320, Math.round(vv?.width ?? window.innerWidth)),
    h: Math.max(320, Math.round(vv?.height ?? window.innerHeight))
  };
}

function resize() {
  const size = viewportSize();
  W = size.w;
  H = size.h;
  DPR = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(W * DPR);
  canvas.height = Math.round(H * DPR);
  canvas.style.width = `${W}px`;
  canvas.style.height = `${H}px`;
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
}
addEventListener('resize', resize);
window.visualViewport?.addEventListener('resize', resize);

const overlay = document.getElementById('overlay'),
  ovTitle = document.getElementById('ovTitle'),
  ovSub = document.getElementById('ovSub'),
  startBtn = document.getElementById('startBtn'),
  hudRoom = document.getElementById('hudRoom'),
  muteBtn = document.getElementById('mute'),
  fsBtn = document.getElementById('fsBtn'),
  hint = document.getElementById('hint');

// Fullscreen toggle
if (fsBtn) {
  fsBtn.addEventListener('click', () => {
    const doc = document;
    const elem = document.documentElement;
    if (!doc.fullscreenElement && !doc.webkitFullscreenElement) {
      if (elem.requestFullscreen) elem.requestFullscreen();
      else if (elem.webkitRequestFullscreen) elem.webkitRequestFullscreen();
    } else {
      if (doc.exitFullscreen) doc.exitFullscreen();
      else if (doc.webkitExitFullscreen) doc.webkitExitFullscreen();
    }
  });
}

/* ==========================================================================
   PROCEDURAL WEB AUDIO SOUNDTRACK ENGINE (CAVERN & BOSS MUSIC)
   ========================================================================== */
let actx = null, muted = false;
let masterGain = null, musicGain = null;
let musicTimer = 0, musicStep = 0, chordIdx = 0;

// Subterranean Exploration Progression (Bm - G - D - F#m)
const cavernChords = [
  [123.47, 146.83, 185.00, 246.94], // Bm (B2, D3, F#3, B3)
  [98.00, 123.47, 146.83, 196.00],  // G  (G2, B2, D3, G3)
  [73.42, 110.00, 146.83, 185.00],  // D  (D2, A2, D3, F#3)
  [92.50, 110.00, 138.59, 185.00]   // F#m(F#2, A2, C#3, F#3)
];
const harpNotes = [246.94, 277.18, 293.66, 329.63, 369.99, 440.00, 493.88, 554.37, 587.33];

// Boss Battle Ostinato (D minor driving battle)
const bossBassSeq = [73.42, 73.42, 87.31, 73.42, 98.00, 73.42, 110.00, 98.00];

function ensureAudio() {
  if (!actx) {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) actx = new AC();
    } catch(e){}
  }
}

function initMusic() {
  if (!actx || masterGain) return;
  masterGain = actx.createGain();
  masterGain.gain.setValueAtTime(muted ? 0 : 1.0, actx.currentTime);
  masterGain.connect(actx.destination);

  musicGain = actx.createGain();
  musicGain.gain.setValueAtTime(0.24, actx.currentTime);
  musicGain.connect(masterGain);

  // Sub-rumble drone
  const sub = actx.createOscillator();
  sub.type = 'sine';
  sub.frequency.setValueAtTime(46.25, actx.currentTime); // Deep F# / B sub
  const subG = actx.createGain();
  subG.gain.setValueAtTime(0.18, actx.currentTime);
  sub.connect(subG);
  subG.connect(musicGain);
  sub.start();

  // Hollow cavern wind
  const bSize = actx.sampleRate * 2;
  const nBuf = actx.createBuffer(1, bSize, actx.sampleRate);
  const out = nBuf.getChannelData(0);
  for (let i = 0; i < bSize; i++) out[i] = Math.random() * 2 - 1;

  const wind = actx.createBufferSource();
  wind.buffer = nBuf;
  wind.loop = true;

  const windF = actx.createBiquadFilter();
  windF.type = 'bandpass';
  windF.frequency.setValueAtTime(160, actx.currentTime);
  windF.Q.setValueAtTime(2.2, actx.currentTime);

  const windG = actx.createGain();
  windG.gain.setValueAtTime(0.05, actx.currentTime);

  wind.connect(windF);
  windF.connect(windG);
  windG.connect(musicGain);
  wind.start();
}

function playCavernChord() {
  if (muted || !actx || !musicGain) return;
  const now = actx.currentTime;
  const chord = cavernChords[chordIdx % cavernChords.length];
  chordIdx++;

  chord.forEach((freq, i) => {
    const osc = actx.createOscillator();
    const g = actx.createGain();
    const f = actx.createBiquadFilter();

    osc.type = i === 0 ? 'sine' : (i % 2 === 0 ? 'triangle' : 'sawtooth');
    osc.frequency.setValueAtTime(freq, now);

    f.type = 'lowpass';
    f.frequency.setValueAtTime(320 + Math.random() * 60, now);
    f.frequency.linearRampToValueAtTime(440, now + 4);
    f.frequency.exponentialRampToValueAtTime(260, now + 8.5);

    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(0.05 / (i + 1), now + 2.5);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 8.8);

    osc.connect(f);
    f.connect(g);
    g.connect(musicGain);

    osc.start(now);
    osc.stop(now + 9.0);
  });

  // Sparse arpeggio notes echoing through the cavern
  for (let k = 0; k < 3; k++) {
    const nTime = now + 1.2 + k * (1.8 + Math.random() * 1.0);
    playHarpNote(nTime);
  }
}

function playHarpNote(time) {
  if (muted || !actx || !musicGain) return;
  try {
    const osc = actx.createOscillator();
    const g = actx.createGain();
    const freq = harpNotes[Math.floor(Math.random() * harpNotes.length)];

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, time);

    g.gain.setValueAtTime(0.0001, time);
    g.gain.linearRampToValueAtTime(0.045, time + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 2.0);

    osc.connect(g);
    g.connect(musicGain);

    osc.start(time);
    osc.stop(time + 2.1);
  } catch(e){}
}

function playBossPulse(step) {
  if (muted || !actx || !musicGain) return;
  try {
    const now = actx.currentTime;
    const freq = bossBassSeq[step % bossBassSeq.length];

    const osc = actx.createOscillator();
    const g = actx.createGain();
    const f = actx.createBiquadFilter();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(freq, now);

    f.type = 'lowpass';
    f.frequency.setValueAtTime(280, now);
    f.frequency.exponentialRampToValueAtTime(80, now + 0.18);

    g.gain.setValueAtTime(0.06, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

    osc.connect(f);
    f.connect(g);
    g.connect(musicGain);

    osc.start(now);
    osc.stop(now + 0.19);
  } catch(e){}
}

function updateSoundtrack(dt, isBoss) {
  if (!actx || muted) return;
  musicTimer += dt;
  if (isBoss) {
    // Fast driving battle rhythm (140 BPM = ~0.21s per 8th note)
    if (musicTimer >= 0.21) {
      musicTimer = 0;
      musicStep++;
      playBossPulse(musicStep);
      if (musicStep % 16 === 0) {
        // Dramatic brass stab
        tone(146.83, 0.45, 'sawtooth', 0.06, 73.42);
        tone(220.00, 0.45, 'triangle', 0.04);
      }
    }
  } else {
    // Atmospheric slow ambient progression
    if (musicTimer >= 8.2) {
      musicTimer = 0;
      playCavernChord();
    }
  }
}

function setAudioMuted(val) {
  muted = val;
  ensureAudio();
  if (actx && actx.state === 'suspended' && !muted) actx.resume();
  initMusic();
  if (masterGain) masterGain.gain.setTargetAtTime(muted ? 0 : 1.0, actx.currentTime, 0.08);
  muteBtn.textContent = muted ? '🔇 Ton an' : '🔊 Musik an';
}
muteBtn.addEventListener('click', e => {
  e.stopPropagation();
  setAudioMuted(!muted);
});

function tone(f, d, type = 'sine', vol = 0.09, slide = null) {
  if (muted || !actx) return;
  try {
    const t = actx.currentTime;
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + d);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g);
    g.connect(actx.destination);
    o.start(t);
    o.stop(t + d);
  } catch(e){}
}

const S = {
  jump() {
    tone(175, 0.16, 'square', 0.06, 360);
    tone(350, 0.12, 'triangle', 0.04, 520);
  },
  land() {
    tone(95, 0.1, 'sine', 0.05, 45);
  },
  nail() {
    // Crisp metallic slash clash
    tone(540, 0.08, 'sawtooth', 0.06, 260);
    tone(880, 0.06, 'triangle', 0.04, 1100);
  },
  hit() {
    tone(260, 0.12, 'sawtooth', 0.08, 110);
  },
  pogo() {
    // Resonant metallic ping bounce
    tone(420, 0.14, 'square', 0.07, 780);
    tone(840, 0.12, 'sine', 0.05);
  },
  hurt() {
    tone(150, 0.35, 'sawtooth', 0.12, 50);
  },
  climb() {
    tone(230, 0.06, 'triangle', 0.035, 260);
  },
  geo() {
    tone(660, 0.08, 'sine', 0.06, 980);
  },
  gate() {
    tone(110, 0.45, 'sawtooth', 0.07, 50);
  },
  push() {
    tone(65, 0.14, 'sawtooth', 0.045, 48);
  },
  crush() {
    tone(95, 0.28, 'sawtooth', 0.08, 35);
    tone(48, 0.32, 'square', 0.05, 28);
  },
  rune() {
    [220, 330, 440, 660].forEach((f, i) => setTimeout(() => tone(f, 0.28, 'triangle', 0.05, f * 1.06), i * 65));
  },
  bench() {
    // Beautiful harp healing chord
    [330, 392, 493, 659].forEach((f, i) => setTimeout(() => tone(f, 0.38, 'sine', 0.07), i * 90));
  },
  bosshit() {
    tone(210, 0.14, 'sawtooth', 0.09, 80);
  },
  bossdie() {
    [262, 196, 146, 98, 73].forEach((f, i) => setTimeout(() => tone(f, 0.45, 'sawtooth', 0.1, 45), i * 160));
  },
  win() {
    [196, 246, 293, 392, 493, 587].forEach((f, i) => setTimeout(() => tone(f, 0.36, 'triangle', 0.08, f * 1.15), i * 120));
  }
};

/* ==========================================================================
   INPUT CONTROLLER (DUAL KEYBOARD & HIGH-CONTRAST MOBILE GAMEPAD)
   ========================================================================== */
const K = { left: false, right: false, up: false, down: false, jump: false, attack: false };
const km = {
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
  ArrowUp: 'up', KeyW: 'up',
  ArrowDown: 'down', KeyS: 'down',
  Space: 'jump',
  KeyJ: 'attack', KeyX: 'attack', KeyK: 'attack',
  KeyR: 'reset'
};

addEventListener('keydown', e => {
  const k = km[e.code];
  if (!k) return;
  e.preventDefault();
  ensureAudio();
  initMusic();
  if (k === 'reset') { if (running) hardReset(); return; }
  if (k === 'jump' && !K.jump) jumpBuf = JB;
  if (k === 'attack' && !K.attack) atkBuf = AB;
  K[k] = true;
});

addEventListener('keyup', e => {
  const k = km[e.code];
  if (!k) return;
  e.preventDefault();
  if (k in K) K[k] = false;
});

// Touch Action Buttons (High contrast & immediate response)
document.querySelectorAll('.btn').forEach(b => {
  const k = b.dataset.k;
  const on = e => {
    e.preventDefault();
    e.stopPropagation();
    ensureAudio();
    initMusic();
    b.classList.add('active');
    if (k === 'jump' && !K.jump) jumpBuf = JB;
    if (k === 'attack' && !K.attack) atkBuf = AB;
    K[k] = true;
  };
  const off = e => {
    e.preventDefault();
    e.stopPropagation();
    b.classList.remove('active');
    K[k] = false;
  };
  b.addEventListener('pointerdown', on);
  b.addEventListener('pointerup', off);
  b.addEventListener('pointercancel', off);
  b.addEventListener('pointerleave', off);
  b.addEventListener('touchstart', on, { passive: false });
  b.addEventListener('touchend', off, { passive: false });
});

// Right Tap-To-Jump Area
const rightTapArea = document.getElementById('rightTapArea');
if (rightTapArea) {
  rightTapArea.addEventListener('pointerdown', e => {
    if (e.target.closest('.btn')) return;
    ensureAudio();
    initMusic();
    jumpBuf = JB;
    K.jump = true;
  });
  rightTapArea.addEventListener('pointerup', () => { K.jump = false; });
  rightTapArea.addEventListener('pointercancel', () => { K.jump = false; });
}

// Analog Movement Stick
const moveStick = document.getElementById('moveStick'), moveKnob = document.getElementById('moveKnob');
let stickPointer = null;
function resetStick() {
  stickPointer = null;
  K.left = K.right = K.up = K.down = false;
  if (moveKnob) moveKnob.style.transform = 'translate(-50%, -50%)';
}

function updateStick(e) {
  if (!moveStick) return;
  const r = moveStick.getBoundingClientRect();
  const cx = r.left + r.width / 2;
  const cy = r.top + r.height / 2;
  const max = r.width * 0.38;
  let dx = e.clientX - cx;
  let dy = e.clientY - cy;
  const dist = Math.hypot(dx, dy);
  if (dist > max) {
    dx *= max / dist;
    dy *= max / dist;
  }
  if (moveKnob) moveKnob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
  const dead = max * 0.24;
  K.left = dx < -dead;
  K.right = dx > dead;
  K.up = dy < -dead;
  K.down = dy > dead;
}

if (moveStick) {
  moveStick.addEventListener('pointerdown', e => {
    e.preventDefault();
    ensureAudio();
    initMusic();
    stickPointer = e.pointerId;
    moveStick.setPointerCapture?.(e.pointerId);
    updateStick(e);
  });
  moveStick.addEventListener('pointermove', e => {
    if (e.pointerId === stickPointer) {
      e.preventDefault();
      updateStick(e);
    }
  });
  moveStick.addEventListener('pointerup', e => { if (e.pointerId === stickPointer) resetStick(); });
  moveStick.addEventListener('pointercancel', e => { if (e.pointerId === stickPointer) resetStick(); });
}

/* ==========================================================================
   GAME CONSTANTS & STATE
   ========================================================================== */
const GRAV = 0.7, MOVE = 0.95, MAXV = 5.0, FRIC = 0.82, AIR = 0.92, JUMPV = -13.0, COY = 7, JB = 8, CUT = 0.5, CLIMBV = 2.6;
const AB = 8, ATK_CD = 18, ATK_LIFE = 9, IFRAMES = 64;
let jumpBuf = 0, atkBuf = 0, coyote = 0, climbing = false, climbRef = null;

let cur = 0, running = false, winShow = false, t = 0, shake = 0, levelIntro = 0, flash = 0;
let player, cam, crates, enemies, projs, orbs, particles, spores, drips, slashes, boss = null;
let masks = 5, MAXMASK = 5, geo = 0, checkpoint = null, transition = 0;

/* ==========================================================================
   LEVEL DEFINITIONS & LORE TABLETS
   ========================================================================== */
const L1 = {
  name: 'I · Wurzelhallen',
  wW: 2600, wH: 820,
  spawn: { x: 120, y: 600 },
  goal: { x: 2470, y: 250, w: 60, h: 120 },
  solids: [
    { x: -60, y: 680, w: 1200, h: 220 }, { x: 1340, y: 680, w: 1320, h: 220 },
    { x: -60, y: 0, w: 2720, h: 60 },
    { x: -60, y: 0, w: 60, h: 820 }, { x: 2600, y: 0, w: 60, h: 820 },
    { x: 1180, y: 600, w: 150, h: 26 },
    { x: 1700, y: 590, w: 220, h: 26 },
    { x: 2000, y: 480, w: 220, h: 26 },
    { x: 2260, y: 370, w: 300, h: 26 },
  ],
  spikes: [{ x: 900, y: 652, w: 120, h: 30 }],
  chains: [{ x: 640, y: 60, h: 620, climb: true }],
  crates: [], plates: [], gates: [],
  bench: { x: 340, y: 632 },
  lamps: [{ x: 180, y: 600 }, { x: 760, y: 560 }, { x: 1500, y: 600 }, { x: 2100, y: 440 }, { x: 2400, y: 330 }],
  orbs: [{ x: 640, y: 360 }, { x: 1810, y: 550 }, { x: 2110, y: 440 }],
  runestones: [
    { x: 500, y: 640, text: '„Hier ruht das vergessene Volk der Tiefe. Hüte dich vor den Stacheln der Verderbnis.“' },
    { x: 1440, y: 640, text: '„Schlage in der Luft nach unten [▼ + Nagel], um auf Stacheln oder Feinden abzuprallen.“' }
  ],
  enemies: [
    { t: 'crawler', x: 520, y: 650, min: 420, max: 760 },
    { t: 'crawler', x: 1600, y: 650, min: 1400, max: 1760 },
    { t: 'flyer', x: 1000, y: 430, min: 840, max: 1140 },
    { t: 'hopper', x: 2050, y: 646, min: 1900, max: 2560 }
  ],
};

const L2 = {
  name: 'II · Die Sporengruft',
  wW: 2800, wH: 900,
  spawn: { x: 110, y: 660 },
  goal: { x: 2660, y: 300, w: 60, h: 120 },
  solids: [
    { x: -60, y: 740, w: 1740, h: 220 },
    { x: 1780, y: 740, w: 1020, h: 220 },
    { x: -60, y: 0, w: 2920, h: 60 }, { x: -60, y: 0, w: 60, h: 900 }, { x: 2800, y: 0, w: 60, h: 900 },
    { x: 1260, y: 340, w: 240, h: 26 },
    { x: 1980, y: 640, w: 200, h: 26 },
    { x: 2260, y: 530, w: 220, h: 26 },
    { x: 2520, y: 420, w: 280, h: 26 },
  ],
  spikes: [{ x: 600, y: 712, w: 120, h: 30 }],
  ropes: [{ x: 1240, y: 60, h: 680, climb: true }],
  crates: [{ x: 360, y: 684, w: 56, h: 56 }],
  plates: [{ x: 840, y: 720, w: 100, h: 20, id: 'a' }],
  gates: [{ x: 1620, y: 300, w: 44, h: 440, plate: 'a' }],
  bench: { x: 300, y: 692 },
  lamps: [{ x: 170, y: 660 }, { x: 700, y: 660 }, { x: 1040, y: 660 }, { x: 1360, y: 300 }, { x: 2100, y: 520 }, { x: 2600, y: 390 }],
  orbs: [{ x: 840, y: 696 }, { x: 1300, y: 300 }, { x: 2680, y: 300 }],
  runestones: [
    { x: 480, y: 700, text: '„Die schweren Runenblöcke tragen das Licht der Ahnen. Nur ihr Gewicht bezwingt die Dornen.“' }
  ],
  enemies: [
    { t: 'crawler', x: 600, y: 706, min: 440, max: 820 },
    { t: 'spitter', x: 1120, y: 706, min: 1120, max: 1120 },
    { t: 'flyer', x: 2100, y: 430, min: 1900, max: 2760 },
    { t: 'hopper', x: 2300, y: 706, min: 1900, max: 2760 }
  ],
};

const L3 = {
  name: 'III · Der Vergessene Steg',
  wW: 3100, wH: 900,
  spawn: { x: 100, y: 660 },
  goal: { x: 2880, y: 230, w: 60, h: 120 },
  solids: [
    { x: -60, y: 740, w: 900, h: 220 }, { x: 1060, y: 740, w: 900, h: 220 }, { x: 2180, y: 740, w: 920, h: 220 },
    { x: -60, y: 0, w: 3220, h: 60 }, { x: -60, y: 0, w: 60, h: 900 }, { x: 3100, y: 0, w: 60, h: 900 },
    { x: 920, y: 640, w: 120, h: 24 }, { x: 2000, y: 640, w: 120, h: 24 },
    { x: 2360, y: 560, w: 200, h: 26 },
    { x: 2620, y: 450, w: 220, h: 26 },
    { x: 2800, y: 350, w: 220, h: 26 },
  ],
  spikes: [{ x: 500, y: 712, w: 120, h: 30 }, { x: 1300, y: 712, w: 150, h: 30 }],
  chains: [{ x: 2280, y: 60, h: 680, climb: true }],
  crates: [{ x: 1200, y: 684, w: 56, h: 56 }],
  plates: [{ x: 1700, y: 720, w: 100, h: 20, id: 'a' }],
  gates: [{ x: 2180, y: 300, w: 44, h: 440, plate: 'a' }],
  bench: { x: 1120, y: 692 },
  lamps: [{ x: 150, y: 660 }, { x: 640, y: 660 }, { x: 1300, y: 660 }, { x: 1760, y: 660 }, { x: 2500, y: 520 }, { x: 2820, y: 330 }],
  orbs: [{ x: 960, y: 600 }, { x: 2010, y: 600 }, { x: 2660, y: 430 }],
  runestones: [
    { x: 1400, y: 700, text: '„Jenseits des Stegs wacht der Hüter. Seine Klinge kennt kein Mitleid, seine Seele kein Vergessen.“' }
  ],
  enemies: [
    { t: 'crawler', x: 400, y: 706, min: 240, max: 760 },
    { t: 'hopper', x: 1400, y: 706, min: 1120, max: 1900 },
    { t: 'flyer', x: 700, y: 430, min: 520, max: 820 },
    { t: 'spitter', x: 2400, y: 706, min: 2400, max: 2400 },
    { t: 'crawler', x: 2600, y: 706, min: 2260, max: 3040 }
  ],
};

const LB = {
  name: 'IV · Grund von Silmoor · Der Hüter',
  wW: 1500, wH: 760,
  spawn: { x: 120, y: 600 },
  isBoss: true,
  goal: { x: 1360, y: 560, w: 60, h: 120, hidden: true },
  solids: [
    { x: -60, y: 680, w: 1620, h: 200 }, { x: -60, y: 0, w: 1620, h: 60 },
    { x: -60, y: 0, w: 60, h: 760 }, { x: 1440, y: 0, w: 60, h: 760 },
    { x: 200, y: 562, w: 150, h: 22 }, { x: 1150, y: 562, w: 150, h: 22 },
  ],
  spikes: [],
  chains: [], crates: [], plates: [], gates: [],
  bench: { x: 120, y: 632 },
  lamps: [{ x: 120, y: 600 }, { x: 750, y: 120 }, { x: 1360, y: 600 }],
  orbs: [],
  runestones: [
    { x: 280, y: 640, text: '„Altar des Hüters: Befreie das uralte Gefäß von seinem endlosen Wachtraum.“' }
  ],
  enemies: [],
  boss: { x: 840, y: 560, w: 96, h: 115, hp: 28, maxhp: 28 },
};

const levels = [L1, L2, L3, LB];

/* ==========================================================================
   ENEMY FACTORY
   ========================================================================== */
function mkEnemy(d) {
  const base = {
    x: d.x, y: d.y, vx: 0, vy: 0, dir: d.dir || -1, alive: true,
    wob: Math.random() * 6.28, tmr: Math.random() * 60,
    hp: 1, w: 32, h: 26, type: d.t, onG: false, flash: 0,
    sx: d.x, sy: d.y, min: d.min, max: d.max, shootT: 60
  };
  if (d.t === 'crawler') { base.hp = 2; base.w = 36; base.h = 24; }
  if (d.t === 'flyer') { base.hp = 2; base.w = 32; base.h = 28; base.baseY = d.y; }
  if (d.t === 'hopper') { base.hp = 3; base.w = 34; base.h = 32; }
  if (d.t === 'spitter') { base.hp = 2; base.w = 36; base.h = 36; }
  return base;
}

function mkCape(x, y) {
  const s = [];
  for (let i = 0; i < 9; i++) s.push({ x, y, px: x, py: y });
  return s;
}

const aabb = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
function gateRect(g) { return { x: g.x, y: g.y, w: g.w, h: g.h * (1 - g.open) }; }
function staticSolids(L) {
  const a = L.solids.slice();
  for (const g of (L.gates || [])) {
    const r = gateRect(g);
    if (r.h > 2) a.push(r);
  }
  return a;
}

function burst(x, y, n, sp, col) {
  for (let i = 0; i < n; i++) {
    particles.push({
      x, y,
      vx: (Math.random() - 0.5) * sp,
      vy: (Math.random() - 1) * sp * 0.7,
      life: 1,
      r: 1.2 + Math.random() * 2.5,
      col: col || '140,235,220'
    });
  }
}

function seedSpores(L) {
  spores = [];
  for (let k = 0; k < 90; k++) {
    spores.push({
      x: Math.random() * L.wW,
      y: Math.random() * L.wH,
      r: 0.8 + Math.random() * 2.2,
      ph: Math.random() * 6.28,
      sp: 0.15 + Math.random() * 0.4
    });
  }
}

function newDrip(L) {
  return { x: 80 + Math.random() * (L.wW - 160), y: 70, vy: 0, wait: Math.random() * 240 };
}

function loadLevel(i, useCheckpoint) {
  cur = i;
  const L = levels[i];
  const sp = (useCheckpoint && checkpoint && checkpoint.lvl === i) ? checkpoint.pos : L.spawn;

  player = {
    x: sp.x, y: sp.y, w: 24, h: 38,
    vx: 0, vy: 0, onG: false, face: 1, walk: 0, dead: false,
    iframe: 0, atkT: 0, atkCD: 0, blink: 0,
    cape: mkCape(sp.x, sp.y)
  };

  cam = { x: 0, y: 0 };
  crates = (L.crates || []).map(c => ({ x: c.x, y: c.y, w: c.w, h: c.h, vx: 0, vy: 0, onG: false, sx: c.x, sy: c.y }));
  enemies = (L.enemies || []).map(mkEnemy);
  boss = L.boss ? {
    x: L.boss.x, y: L.boss.y, w: L.boss.w, h: L.boss.h,
    hp: L.boss.hp, maxhp: L.boss.maxhp, vx: 0, vy: 0, onG: false,
    state: 'idle', stateT: 90, face: -1, flash: 0, phase: 1, dead: false, defeated: false, shockwaves: []
  } : null;

  orbs = (L.orbs || []).map(o => ({ x: o.x, y: o.y, got: false, ph: Math.random() * 6.28 }));
  projs = []; particles = []; drips = []; slashes = [];

  (L.gates || []).forEach(g => g.open = 0);
  (L.plates || []).forEach(p => { p.pressed = false; p.wasPressed = false; });
  (L.spikes || []).forEach(sp => sp.crushed = false);
  if (L.goal) L.goal._show = !L.goal.hidden;

  for (let k = 0; k < 12; k++) drips.push(newDrip(L));
  seedSpores(L);

  if (!checkpoint || checkpoint.lvl !== i || !useCheckpoint) {
    checkpoint = { lvl: i, pos: { x: L.spawn.x, y: L.spawn.y } };
  }
  levelIntro = 110;
  hudRoom.textContent = L.name;

  // Trigger initial exploration chord
  if (!L.isBoss) playCavernChord();
}

function respawn() {
  masks = MAXMASK;
  loadLevel(cur, true);
}

function hardReset() {
  masks = MAXMASK;
  loadLevel(cur, true);
}

function nextLevel() {
  if (cur < levels.length - 1) {
    S.win();
    geo += 30;
    loadLevel(cur + 1, false);
  } else {
    running = false;
    winShow = true;
    showWin();
  }
}

function crushSpikesUnderCrates(spikes, crateList) {
  let crushed = 0;
  for (const sp of spikes) {
    if (sp.crushed) continue;
    for (const c of crateList) {
      if (aabb(c, sp)) {
        sp.crushed = true;
        crushed++;
        break;
      }
    }
  }
  return crushed;
}

function pressesPlate(p, crateList, actor) {
  const sensor = { x: p.x, y: p.y - 8, w: p.w, h: 16 };
  return crateList.some(c => aabb(c, sensor)) || aabb(actor, sensor);
}

function hurtPlayer(fromX) {
  if (player.iframe > 0 || player.dead) return;
  masks--;
  player.iframe = IFRAMES;
  S.hurt();
  flash = 12;
  shake = 12;
  const dir = player.x < fromX ? -1 : 1;
  player.vx = dir * 6.5;
  player.vy = -6.5;
  climbing = false;
  burst(player.x + player.w / 2, player.y + player.h / 2, 16, 5, '240,110,110');
  if (masks <= 0) {
    player.dead = true;
    player.deadT = 0;
  }
}

/* ==========================================================================
   UPDATE GAMEPLAY
   ========================================================================== */
function update() {
  if (!running) return;
  const L = levels[cur];
  t++;
  if (shake > 0) shake *= 0.86;
  if (flash > 0) flash--;
  if (levelIntro > 0) levelIntro--;

  updateSoundtrack(0.0166, Boolean(L.isBoss));

  if (player.dead) {
    player.deadT = (player.deadT || 0) + 1;
    stepParticles();
    if (player.deadT > 60) respawn();
    return;
  }

  if (transition > 0) {
    transition--;
    if (transition === 0) nextLevel();
  }

  const sol = staticSolids(L);

  // Crates
  for (const c of crates) {
    c.vy += GRAV;
    if (c.vy > 14) c.vy = 14;
    c.y += c.vy;
    c.onG = false;
    for (const s of sol) {
      if (aabb(c, s)) {
        if (c.vy > 0) { c.y = s.y - c.h; c.onG = true; }
        else c.y = s.y + s.h;
        c.vy = 0;
      }
    }
    for (const o of crates) {
      if (o !== c && aabb(c, o)) {
        if (c.vy > 0) { c.y = o.y - c.h; c.onG = true; c.vy = 0; }
        else if (c.vy < 0) { c.y = o.y + o.h; c.vy = 0; }
      }
    }
    if (c.y > L.wH + 180) { c.x = c.sx; c.y = c.sy; c.vx = 0; c.vy = 0; }
  }

  // Timers
  if (jumpBuf > 0) jumpBuf--;
  if (atkBuf > 0) atkBuf--;
  if (coyote > 0) coyote--;
  if (player.atkCD > 0) player.atkCD--;
  if (player.atkT > 0) player.atkT--;
  if (player.iframe > 0) player.iframe--;

  // Attack Execution
  if (atkBuf > 0 && player.atkCD <= 0) {
    atkBuf = 0;
    player.atkCD = ATK_CD;
    player.atkT = ATK_LIFE;
    S.nail();

    let dir = 'side';
    if (K.up) dir = 'up';
    else if (K.down && !player.onG) dir = 'down';

    let hb;
    if (dir === 'up') hb = { x: player.x - 6, y: player.y - 36, w: player.w + 12, h: 40, dir: 'up' };
    else if (dir === 'down') hb = { x: player.x - 6, y: player.y + player.h, w: player.w + 12, h: 40, dir: 'down' };
    else hb = { x: player.face > 0 ? player.x + player.w - 4 : player.x - 42, y: player.y + 2, w: 46, h: 34, dir: 'side' };

    slashes.push({ ...hb, life: ATK_LIFE, hitset: new Set() });
  }

  // Climbing Chains / Vines
  const climbables = [...(L.chains || []), ...(L.ropes || [])].filter(r => r.climb);
  let onClimb = null;
  for (const r of climbables) {
    const py = player.y + player.h / 2;
    if (Math.abs((player.x + player.w / 2) - r.x) < 24 && py > r.y - 12 && py < r.y + r.h + 16) {
      onClimb = r;
      break;
    }
  }

  if (onClimb && (K.up || K.down) && !climbing) {
    climbing = true;
    climbRef = onClimb;
    player.vx = 0; player.vy = 0;
    player.x = onClimb.x - player.w / 2;
  }

  if (climbing) {
    if (!onClimb) climbing = false;
    else {
      player.vy = (K.up ? -CLIMBV : 0) + (K.down ? CLIMBV : 0);
      player.y += player.vy;
      for (const s of sol) {
        if (aabb(player, s)) {
          if (player.vy > 0) player.y = s.y - player.h;
          else if (player.vy < 0) player.y = s.y + s.h;
          player.vy = 0;
        }
      }
      const hx = (K.left ? -1 : 0) + (K.right ? 1 : 0);
      if (hx) {
        player.x += hx * 2.3;
        player.face = hx;
        for (const s of sol) {
          if (aabb(player, s)) {
            if (hx > 0) player.x = s.x - player.w;
            else player.x = s.x + s.w;
          }
        }
      }
      if ((K.up || K.down) && t % 9 === 0) S.climb();
      if (jumpBuf > 0) {
        climbing = false;
        player.vy = JUMPV * 0.85;
        player.vx = hx * 3.4;
        jumpBuf = 0;
        S.jump();
      }
      commonEnd(L, sol);
      return;
    }
  }

  // Horizontal Movement
  const dir = (K.left ? -1 : 0) + (K.right ? 1 : 0);
  if (dir) {
    player.vx += dir * (player.onG ? MOVE : MOVE * 0.72);
    player.face = dir;
  }
  player.vx *= player.onG ? FRIC : AIR;
  player.vx = Math.max(-MAXV, Math.min(MAXV, player.vx));
  if (Math.abs(player.vx) < 0.05) player.vx = 0;

  // Jump
  if (jumpBuf > 0 && coyote > 0) {
    player.vy = JUMPV;
    player.onG = false;
    coyote = 0;
    jumpBuf = 0;
    S.jump();
    burst(player.x + player.w / 2, player.y + player.h, 7, 3, '160,240,225');
  }
  if (!K.jump && player.vy < 0) player.vy *= (1 - CUT);
  player.vy += GRAV;
  if (player.vy > 15) player.vy = 15;

  // Move X
  player.x += player.vx;
  for (const s of sol) {
    if (aabb(player, s)) {
      if (player.vx > 0) player.x = s.x - player.w;
      else if (player.vx < 0) player.x = s.x + s.w;
      player.vx = 0;
    }
  }

  // Move Crate
  for (const c of crates) {
    if (aabb(player, c)) {
      const can = player.onG && c.onG;
      if (player.face > 0 && player.x + player.w > c.x) {
        const pen = (player.x + player.w) - c.x;
        if (can && tryMoveCrate(c, pen, L, sol)) {
          player.x = c.x - player.w;
          if (t % 10 === 0) S.push();
        } else player.x = c.x - player.w;
      } else if (player.face < 0 && player.x < c.x + c.w) {
        const pen = (c.x + c.w) - player.x;
        if (can && tryMoveCrate(c, -pen, L, sol)) {
          player.x = c.x + c.w;
          if (t % 10 === 0) S.push();
        } else player.x = c.x + c.w;
      }
    }
  }

  // Move Y
  const wasG = player.onG;
  player.onG = false;
  player.y += player.vy;
  const solY = [...sol, ...crates];
  for (const s of solY) {
    if (aabb(player, s)) {
      if (player.vy > 0) {
        player.y = s.y - player.h;
        player.onG = true;
        if (!wasG && player.vy > 3) {
          S.land();
          burst(player.x + player.w / 2, player.y + player.h, 6, 2.5, '140,225,215');
        }
      } else if (player.vy < 0) {
        player.y = s.y + s.h;
      }
      player.vy = 0;
    }
  }

  if (player.onG) coyote = COY;
  if (player.x < 10) player.x = 10;
  if (player.x + player.w > L.wW - 10) player.x = L.wW - 10 - player.w;

  // Fall pit hazard death
  if (player.y > L.wH + 120) {
    hurtPlayer(player.x);
    if (!player.dead) {
      player.y = Math.max(80, (checkpoint ? checkpoint.pos.y : L.spawn.y) - 40);
      player.x = checkpoint ? checkpoint.pos.x : L.spawn.x;
      player.vy = 0;
    }
  }

  if (Math.abs(player.vx) > 0.4 && player.onG) player.walk += Math.abs(player.vx) * 0.09;
  player.blink = (player.blink + 1) % 240;

  commonEnd(L, sol);
}

function tryMoveCrate(c, dx, L, sol) {
  const nx = c.x + dx, test = { x: nx, y: c.y, w: c.w, h: c.h };
  for (const s of sol) { if (aabb(test, s)) return false; }
  for (const o of crates) { if (o !== c && aabb(test, o)) return false; }
  if (nx < 10 || nx + c.w > L.wW - 10) return false;
  c.x = nx;
  return true;
}

function commonEnd(L, sol) {
  // Slashes
  for (const sl of slashes) {
    sl.life--;
    for (const e of enemies) {
      if (!e.alive || sl.hitset.has(e)) continue;
      if (aabb(sl, e)) {
        damageEnemy(e, 1, sl);
        sl.hitset.add(e);
      }
    }
    if (boss && !boss.dead && !sl.hitset.has(boss) && aabb(sl, boss)) {
      damageBoss(1, sl);
      sl.hitset.add(boss);
    }
    for (const p of projs) {
      if (!p.dead && aabb(sl, p)) {
        p.dead = true;
        burst(p.x, p.y, 8, 3.5, '160,250,230');
      }
    }

    // Pogo mechanic
    if (sl.dir === 'down' && !player.onG) {
      let pogo = false;
      for (const e of enemies) { if (e.alive && aabb(sl, e)) pogo = true; }
      if (boss && !boss.dead && aabb(sl, boss)) pogo = true;
      for (const sp of L.spikes) { if (aabb(sl, { x: sp.x, y: sp.y, w: sp.w, h: sp.h })) pogo = true; }
      if (pogo) {
        player.vy = JUMPV * 0.94;
        S.pogo();
        burst(sl.x + sl.w / 2, sl.y + 4, 12, 4, '220,255,245');
      }
    }
  }
  slashes = slashes.filter(s => s.life > 0);

  // Enemies update
  for (const e of enemies) {
    if (!e.alive) continue;
    if (e.flash > 0) e.flash--;
    updateEnemy(e, L, sol);
  }

  // Boss update
  if (boss && !boss.dead) updateBoss(L, sol);

  // Projectiles
  for (const p of projs) {
    if (p.dead) continue;
    p.x += p.vx; p.y += p.vy;
    if (p.grav) p.vy += 0.2;
    p.life--;
    if (p.life <= 0 || p.x < 0 || p.x > L.wW || p.y > L.wH) {
      p.dead = true;
      continue;
    }
    if (aabb(p, player)) {
      p.dead = true;
      hurtPlayer(p.x);
    }
  }
  projs = projs.filter(p => !p.dead);

  // Contact damage
  for (const e of enemies) {
    if (!e.alive) continue;
    if (aabb(player, e)) hurtPlayer(e.x + e.w / 2);
  }
  if (boss && !boss.dead && aabb(player, boss)) hurtPlayer(boss.x + boss.w / 2);

  // Spikes crushed by crates
  const newlyCrushed = crushSpikesUnderCrates(L.spikes || [], crates);
  if (newlyCrushed) {
    S.crush();
    shake = Math.max(shake, 8);
    for (const sp of L.spikes) {
      if (sp.crushed) burst(sp.x + sp.w / 2, sp.y + sp.h, newlyCrushed * 10, 3.5, '120,220,200');
    }
  }

  // Spike hazards
  for (const sp of L.spikes) {
    if (!sp.crushed && aabb(player, { x: sp.x, y: sp.y, w: sp.w, h: sp.h })) {
      hurtPlayer(player.x);
      if (!player.dead) {
        player.y -= 32;
        player.vy = -8.5;
      }
    }
  }

  // Pressure plates & gates
  for (const p of (L.plates || [])) {
    const pr = pressesPlate(p, crates, player);
    if (pr && !p.wasPressed) S.rune();
    p.pressed = pr;
    p.wasPressed = pr;
  }
  for (const g of (L.gates || [])) {
    const p = (L.plates || []).find(pp => pp.id === g.plate);
    const want = p && p.pressed ? 1 : 0;
    const before = g.open;
    g.open += (want - g.open) * 0.12;
    if (Math.abs(g.open - before) > 0.005 && Math.random() < 0.04) S.gate();
  }

  // Orbs (Geo)
  for (const o of orbs) {
    if (o.got) continue;
    o.ph = (o.ph || 0) + 0.08;
    if (Math.hypot((player.x + player.w / 2) - o.x, (player.y + player.h / 2) - o.y) < 30) {
      o.got = true;
      geo += 6;
      S.geo();
      burst(o.x, o.y, 12, 3.5, '220,250,160');
    }
  }

  // Bench checkpoint (full heal)
  if (L.bench && aabb(player, { x: L.bench.x - 8, y: L.bench.y - 12, w: 64, h: 64 })) {
    if (!checkpoint || checkpoint.lvl !== cur || checkpoint.pos.x !== L.bench.x || masks < MAXMASK) {
      checkpoint = { lvl: cur, pos: { x: L.bench.x, y: L.bench.y } };
      if (masks < MAXMASK) {
        masks = MAXMASK;
        S.bench();
        burst(L.bench.x + 24, L.bench.y, 18, 3.5, '160,255,230');
      }
    }
  }

  // Goal
  if (L.goal && L.goal._show && transition === 0 && aabb(player, { x: L.goal.x, y: L.goal.y, w: L.goal.w, h: L.goal.h })) {
    transition = 28;
    burst(L.goal.x + 30, L.goal.y + 60, 24, 4.5, '190,255,240');
  }

  // Particles & ambient
  stepParticles();
  updateCape();

  for (const s of spores) {
    s.y -= s.sp;
    s.x += Math.sin(s.ph + t * 0.02) * 0.25;
    if (s.y < 40) s.y = L.wH - 100;
  }
  for (const d of drips) {
    if (d.wait > 0) {
      d.wait--;
      if (d.wait <= 0) d.vy = 0;
    } else {
      d.vy += 0.3;
      d.y += d.vy;
      if (d.y > L.wH - 120) Object.assign(d, newDrip(L));
    }
  }

  updateLoreAndHint(L);

  // Camera tracking
  const tx = player.x + player.w / 2 - W / 2;
  const ty = player.y + player.h / 2 - H / 2;
  cam.x += (Math.max(0, Math.min(L.wW - W, tx)) - cam.x) * 0.11;
  cam.y += (Math.max(0, Math.min(L.wH - H, ty)) - cam.y) * 0.11;
}

function stepParticles() {
  particles.forEach(p => {
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.2;
    p.life -= 0.02;
  });
  particles = particles.filter(p => p.life > 0);
}

function updateLoreAndHint(L) {
  let text = '';

  // Check proximity to Runestones
  for (const rs of (L.runestones || [])) {
    if (Math.hypot((player.x + player.w / 2) - rs.x, (player.y + player.h / 2) - rs.y) < 70) {
      text = rs.text;
      break;
    }
  }

  if (!text) {
    const nearCrate = crates.some(c => Math.abs((player.x + player.w / 2) - (c.x + c.w / 2)) < 190);
    if (nearCrate && (L.plates || []).length) {
      text = 'RUNENBLOCK · über Dornen schieben · auf das leuchtende Siegel stellen';
    }
    const pressed = (L.plates || []).some(p => p.pressed);
    if (pressed) {
      text = 'SIEGEL AKTIV · Das Tor ist geöffnet';
    }
  }

  if (hint.textContent !== text) hint.textContent = text;
  hint.classList.toggle('show', Boolean(text));
}

function damageEnemy(e, dmg, src) {
  e.hp -= dmg;
  e.flash = 6;
  S.hit();
  shake = Math.max(shake, 6);
  e.vx += (e.x < (src.x + src.w / 2) ? -3.5 : 3.5);
  burst(e.x + e.w / 2, e.y + e.h / 2, 10, 4.5, '210,250,235');

  if (src.dir === 'side') player.vx += (player.face > 0 ? -3 : 3);
  if (e.hp <= 0) {
    e.alive = false;
    geo += 7;
    burst(e.x + e.w / 2, e.y + e.h / 2, 20, 5.5, '180,245,225');
    S.geo();
  }
}

function damageBoss(dmg, src) {
  boss.hp -= dmg;
  boss.flash = 6;
  S.bosshit();
  shake = Math.max(shake, 7);
  burst(boss.x + boss.w / 2, boss.y + boss.h / 2, 14, 5, '230,160,255');
  if (src.dir === 'side') player.vx += (player.face > 0 ? -4.5 : 4.5);

  if (boss.hp <= 0 && !boss.dead) {
    boss.dead = true;
    boss.defeated = true;
    S.bossdie();
    shake = 22;
    burst(boss.x + boss.w / 2, boss.y + boss.h / 2, 45, 7.5, '230,170,255');
    const L = levels[cur];
    if (L.goal) L.goal._show = true;
  }
}

/* ==========================================================================
   ENEMY AI
   ========================================================================== */
function updateEnemy(e, L, sol) {
  if (e.type === 'crawler') {
    e.vy += GRAV;
    e.x += e.dir * 1.35;
    e.y += e.vy;
    e.onG = false;
    for (const s of sol) {
      if (aabb(e, s)) {
        if (e.vy > 0) { e.y = s.y - e.h; e.onG = true; e.vy = 0; }
        else if (e.vy < 0) { e.y = s.y + s.h; e.vy = 0; }
      }
    }
    if (e.min != null && e.x <= e.min) { e.x = e.min; e.dir = 1; }
    if (e.max != null && e.x >= e.max) { e.x = e.max; e.dir = -1; }
    e.vx *= 0.8;
  } else if (e.type === 'flyer') {
    e.wob += 0.07;
    e.x += e.dir * 1.25;
    if (e.min != null && e.x <= e.min) { e.x = e.min; e.dir = 1; }
    if (e.max != null && e.x >= e.max) { e.x = e.max; e.dir = -1; }
    e.y = e.baseY + Math.sin(e.wob) * 28;
    e.vx *= 0.85;
    e.x += e.vx;
  } else if (e.type === 'hopper') {
    e.vy += GRAV;
    e.y += e.vy;
    e.onG = false;
    e.tmr--;
    for (const s of sol) {
      if (aabb(e, s)) {
        if (e.vy > 0) { e.y = s.y - e.h; e.onG = true; }
        else e.y = s.y + s.h;
        e.vy = 0;
      }
    }
    if (e.onG) {
      e.vx *= 0.8;
      if (e.tmr <= 0) {
        e.tmr = 65 + Math.random() * 35;
        const toP = player.x > e.x ? 1 : -1;
        e.vx = toP * 3.4;
        e.vy = -9.2;
      }
    }
    e.x += e.vx;
    if (e.min != null && e.x < e.min) { e.x = e.min; e.vx = Math.abs(e.vx); }
    if (e.max != null && e.x > e.max) { e.x = e.max; e.vx = -Math.abs(e.vx); }
  } else if (e.type === 'spitter') {
    e.wob += 0.05;
    e.shootT--;
    e.dir = player.x > e.x ? 1 : -1;
    if (e.shootT <= 0) {
      e.shootT = 110;
      const dx = player.x - e.x, dy = (player.y + 10) - e.y, d = Math.hypot(dx, dy) || 1;
      projs.push({
        x: e.x + e.w / 2, y: e.y + 8,
        vx: dx / d * 3.6, vy: dy / d * 3.6,
        w: 14, h: 14, life: 200, dead: false, kind: 'spit'
      });
      burst(e.x + e.w / 2, e.y, 5, 2.5, '200,130,230');
    }
  }
}

/* ==========================================================================
   BOSS AI: DER HÜTER DES GRUNDES
   ========================================================================== */
function updateBoss(L, sol) {
  const b = boss;
  if (b.flash > 0) b.flash--;
  b.stateT--;
  b.phase = b.hp <= b.maxhp * 0.5 ? 2 : 1;
  b.face = player.x < b.x ? -1 : 1;

  b.vy += GRAV;
  if (b.vy > 16) b.vy = 16;

  if (b.state === 'idle') {
    b.vx *= 0.9;
    if (b.stateT <= 0) {
      const r = Math.random();
      b.state = r < 0.38 ? 'charge' : (r < 0.72 ? 'slam' : 'volley');
      b.stateT = b.state === 'charge' ? 70 : (b.state === 'slam' ? 52 : 64);
      if (b.state === 'slam') {
        b.vy = -14.5;
        b.vx = b.face * 2.5;
      }
    }
  } else if (b.state === 'charge') {
    const spd = b.phase === 2 ? 5.6 : 4.0;
    b.vx += b.face * 0.55;
    b.vx = Math.max(-spd, Math.min(spd, b.vx));
    if (b.stateT <= 0) {
      b.state = 'idle';
      b.stateT = b.phase === 2 ? 38 : 65;
    }
  } else if (b.state === 'slam') {
    b.vx *= 0.95;
    if (b.onG && b.vy === 0 && b.stateT < 42) {
      b.shockwaves.push({ x: b.x + b.w / 2, r: 12, life: 1, dir: -1 });
      b.shockwaves.push({ x: b.x + b.w / 2, r: 12, life: 1, dir: 1 });
      S.bosshit();
      shake = 14;
      burst(b.x + b.w / 2, b.y + b.h, 24, 6, '220,160,255');
      b.state = 'idle';
      b.stateT = b.phase === 2 ? 38 : 65;
    }
  } else if (b.state === 'volley') {
    b.vx *= 0.9;
    if (b.stateT === 30 || b.stateT === 18 || b.stateT === 6) {
      const n = b.phase === 2 ? 5 : 3;
      for (let i = 0; i < n; i++) {
        const ang = -Math.PI / 2 + (i - (n - 1) / 2) * 0.42;
        projs.push({
          x: b.x + b.w / 2, y: b.y + 20,
          vx: Math.cos(ang) * 3.6 + b.face * 0.6,
          vy: Math.sin(ang) * 3.6,
          w: 16, h: 16, life: 220, dead: false, kind: 'boss'
        });
      }
    }
    if (b.stateT <= 0) {
      b.state = 'idle';
      b.stateT = b.phase === 2 ? 34 : 60;
    }
  }

  b.x += b.vx;
  b.y += b.vy;
  b.onG = false;
  for (const s of sol) {
    if (aabb(b, s)) {
      if (b.vy > 0) { b.y = s.y - b.h; b.onG = true; }
      else if (b.vy < 0) b.y = s.y + s.h;
      b.vy = 0;
    }
  }

  if (b.x < 70) { b.x = 70; b.vx = Math.abs(b.vx); }
  if (b.x + b.w > L.wW - 70) { b.x = L.wW - 70 - b.w; b.vx = -Math.abs(b.vx); }

  for (const w of b.shockwaves) {
    w.r += 6.5;
    w.life -= 0.022;
    if (w.life > 0 && Math.abs((player.x + player.w / 2) - (w.x + w.dir * w.r)) < 28 && player.onG) {
      hurtPlayer(w.x);
    }
  }
  b.shockwaves = b.shockwaves.filter(w => w.life > 0);
}

/* ==========================================================================
   CAPE SIMULATION
   ========================================================================== */
function updateCape() {
  const p = player, back = p.x + p.w / 2 - p.face * 7, topY = p.y + 12;
  const seg = p.cape;
  seg[0].x = back;
  seg[0].y = topY;
  const wind = -p.face * (1.2 + Math.abs(p.vx) * 0.55) + Math.sin(t * 0.06) * 0.55, rest = 7;
  for (let i = 1; i < seg.length; i++) {
    const s = seg[i];
    const vx = (s.x - s.px) * 0.86, vy = (s.y - s.py) * 0.86;
    s.px = s.x; s.py = s.y;
    s.x += vx + wind * (i / seg.length);
    s.y += vy + 0.55;
  }
  for (let it = 0; it < 3; it++) {
    for (let i = 1; i < seg.length; i++) {
      const a = seg[i - 1], b = seg[i];
      let dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 0.001, df = (d - rest) / d;
      b.x -= dx * df; b.y -= dy * df;
    }
    seg[0].x = back; seg[0].y = topY;
  }
}

/* ==========================================================================
   RENDER PIPELINE (PARALLAX, GOD RAYS, CHARACTERS & EFFECTS)
   ========================================================================== */
let rockPat = null;
function rockTile() {
  const c = document.createElement('canvas');
  c.width = 72; c.height = 72;
  const g = c.getContext('2d');
  g.fillStyle = '#0f2730';
  g.fillRect(0, 0, 72, 72);

  for (let i = 0; i < 180; i++) {
    g.fillStyle = `rgba(${10 + Math.random() * 20 | 0},${35 + Math.random() * 30 | 0},${45 + Math.random() * 30 | 0},0.45)`;
    g.beginPath();
    g.arc(Math.random() * 72, Math.random() * 72, Math.random() * 2.5, 0, Math.PI * 2);
    g.fill();
  }
  g.strokeStyle = 'rgba(2, 14, 18, 0.35)';
  g.lineWidth = 1;
  for (let i = -72; i < 72; i += 7) {
    g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 72, 72); g.stroke();
  }
  g.strokeStyle = 'rgba(140, 235, 215, 0.06)';
  for (let i = -72; i < 72; i += 12) {
    g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 72, 72); g.stroke();
  }
  return ctx.createPattern(c, 'repeat');
}

function draw() {
  const L = levels[cur];
  const sx = (Math.random() - 0.5) * shake;
  const sy = (Math.random() - 0.5) * shake;

  ctx.clearRect(0, 0, W, H);

  // Background gradient
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#0a232c');
  bg.addColorStop(0.5, '#0c2e38');
  bg.addColorStop(1, '#061922');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  drawParallax(L);

  ctx.save();
  ctx.translate(-cam.x + sx, -cam.y + sy);

  if (!rockPat) rockPat = rockTile();

  // Draw Solids (Slate cavern platforms)
  for (const s of L.solids) {
    ctx.fillStyle = rockPat;
    ctx.fillRect(s.x, s.y, s.w, s.h);
    ctx.fillStyle = 'rgba(6, 24, 30, 0.5)';
    ctx.fillRect(s.x, s.y, s.w, s.h);

    // Luminous moss top
    ctx.fillStyle = 'rgba(130, 235, 220, 0.55)';
    ctx.fillRect(s.x, s.y, s.w, 2.5);
    ctx.fillStyle = 'rgba(90, 195, 180, 0.16)';
    ctx.fillRect(s.x, s.y + 2.5, s.w, 2);

    // Bottom dark shadow
    ctx.fillStyle = 'rgba(2, 10, 14, 0.6)';
    ctx.fillRect(s.x, s.y + s.h - 4, s.w, 4);

    // Glowing vegetation tufts on thin ledges
    if (s.h < 90) {
      for (let x = s.x + 14; x < s.x + s.w; x += 42) {
        ctx.strokeStyle = '#0e3840';
        ctx.lineWidth = 2;
        for (let b = -2; b <= 2; b++) {
          ctx.beginPath();
          ctx.moveTo(x, s.y - 2);
          ctx.lineTo(x + b * 2.5, s.y - 10 - Math.abs(b));
          ctx.stroke();
        }
        if ((x | 0) % 80 < 42) {
          ctx.fillStyle = 'rgba(150, 245, 215, 0.65)';
          ctx.beginPath();
          ctx.arc(x, s.y - 11, 1.8, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // Roots dangling from high ceilings
    if (s.h > 150) {
      ctx.strokeStyle = 'rgba(6, 22, 28, 0.95)';
      ctx.lineWidth = 3;
      for (let x = s.x + 30; x < s.x + s.w; x += 95) {
        const hl = 16 + ((x * 7) % 24);
        ctx.beginPath();
        ctx.moveTo(x, s.y + s.h);
        ctx.quadraticCurveTo(x + 6, s.y + s.h + hl * 0.6, x + 2, s.y + s.h + hl);
        ctx.stroke();
      }
    }
  }

  // Spikes, Chains, Ropes, Plates, Gates, Crates
  for (const sp of L.spikes) drawSpikes(sp);
  for (const r of (L.chains || [])) drawChain(r.x, r.y, r.h);
  for (const r of (L.ropes || [])) drawRope(r.x, r.y, r.h);
  for (const p of (L.plates || [])) drawPlate(p);
  for (const g of (L.gates || [])) drawGate(g);
  for (const c of crates) drawCrate(c);
  if (L.bench) drawBench(L.bench);
  for (const lp of (L.lamps || [])) drawLamp(lp);
  for (const rs of (L.runestones || [])) drawRunestone(rs);
  if (L.goal && L.goal._show) drawGoal(L.goal);

  // Geo Orbs
  for (const o of orbs) {
    if (o.got) continue;
    const r = 6 + Math.sin(o.ph || 0) * 1.6;
    const og = ctx.createRadialGradient(o.x, o.y, 1, o.x, o.y, 22);
    og.addColorStop(0, 'rgba(215, 250, 150, 0.9)');
    og.addColorStop(1, 'rgba(215, 250, 150, 0)');
    ctx.fillStyle = og;
    ctx.beginPath();
    ctx.arc(o.x, o.y, 22, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#e4f8a8';
    ctx.beginPath();
    ctx.arc(o.x, o.y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  for (const e of enemies) {
    if (e.alive) drawEnemy(e);
  }
  for (const p of projs) drawProj(p);
  if (boss && !boss.dead) drawBoss(boss);

  for (const sl of slashes) drawSlash(sl);
  if (!player.dead || player.deadT < 8) drawHero();

  // Spores, Drips, Particles
  for (const s of spores) {
    const a = 0.35 + Math.sin(s.ph + t * 0.03) * 0.25;
    ctx.fillStyle = `rgba(160, 240, 220, ${Math.max(0.05, a * 0.4)})`;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r + 1.8, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = `rgba(235, 255, 248, ${Math.max(0.1, a)})`;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r * 0.6, 0, Math.PI * 2);
    ctx.fill();
  }

  for (const p of particles) {
    ctx.fillStyle = `rgba(${p.col}, ${p.life})`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.strokeStyle = 'rgba(150, 220, 230, 0.5)';
  ctx.lineWidth = 1.4;
  for (const d of drips) {
    if (d.wait <= 0) {
      ctx.beginPath();
      ctx.moveTo(d.x, d.y);
      ctx.lineTo(d.x, d.y + 6);
      ctx.stroke();
    }
  }

  ctx.restore();

  // Additive volumetric glow
  ctx.globalCompositeOperation = 'lighter';
  const glow = (wx, wy, rad, r, gg, b, a) => {
    const px = wx - cam.x + sx, py = wy - cam.y + sy;
    if (px < -rad || px > W + rad || py < -rad || py > H + rad) return;
    const gr = ctx.createRadialGradient(px, py, 2, px, py, rad);
    gr.addColorStop(0, `rgba(${r},${gg},${b},${a})`);
    gr.addColorStop(1, `rgba(${r},${gg},${b},0)`);
    ctx.fillStyle = gr;
    ctx.beginPath();
    ctx.arc(px, py, rad, 0, Math.PI * 2);
    ctx.fill();
  };

  for (const lp of (L.lamps || [])) {
    const fl = 0.85 + Math.sin(t * 0.08 + lp.x) * 0.12;
    glow(lp.x, lp.y - 16, 130 * fl, 150, 240, 224, 0.45);
  }
  glow(player.x + player.w / 2, player.y + player.h / 2, 140, 150, 230, 220, 0.25);
  if (L.goal && L.goal._show) glow(L.goal.x + L.goal.w / 2, L.goal.y + L.goal.h / 2, 160, 140, 240, 210, 0.45);
  for (const o of orbs) {
    if (!o.got) glow(o.x, o.y, 45, 215, 250, 150, 0.38);
  }
  if (boss && !boss.dead) glow(boss.x + boss.w / 2, boss.y + boss.h / 2, 135, 225, 155, 245, 0.35);

  ctx.globalCompositeOperation = 'source-over';

  // Vignette
  const vg = ctx.createRadialGradient(W / 2, H * 0.44, H * 0.44, W / 2, H * 0.5, H * 0.98);
  vg.addColorStop(0, 'rgba(4, 18, 22, 0)');
  vg.addColorStop(1, 'rgba(3, 14, 18, 0.65)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);

  if (flash > 0) {
    ctx.fillStyle = `rgba(235, 80, 80, ${flash / 12 * 0.28})`;
    ctx.fillRect(0, 0, W, H);
  }

  drawUI(L);

  if (levelIntro > 0) {
    const a = Math.min(1, levelIntro / 110) * (levelIntro > 70 ? (110 - levelIntro) / 40 : 1);
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, a));
    ctx.fillStyle = '#eaf4f1';
    ctx.font = '300 32px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.shadowColor = 'rgba(120, 224, 210, 0.75)';
    ctx.shadowBlur = 24;
    ctx.fillText(L.name.replace('·', '—'), W / 2, H / 2);
    ctx.restore();
  }

  if (player.dead) {
    ctx.fillStyle = `rgba(5, 18, 22, ${Math.min(0.65, (player.deadT || 0) / 60)})`;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#cfe8e2';
    ctx.font = '300 28px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.fillText('gefallen …', W / 2, H / 2);
  }
}

/* ==========================================================================
   UI RENDERING (MASKS, GEO & BOSS HEALTH)
   ========================================================================== */
function drawUI(L) {
  // Masks (Hollow Knight style bone masks)
  for (let i = 0; i < MAXMASK; i++) {
    const x = 20 + i * 28, y = 20;
    ctx.save();
    ctx.translate(x, y);

    if (i < masks) {
      ctx.fillStyle = '#eef5f2';
      ctx.shadowColor = 'rgba(140, 235, 220, 0.4)';
      ctx.shadowBlur = 8;
    } else {
      ctx.fillStyle = 'rgba(40, 65, 68, 0.45)';
      ctx.shadowBlur = 0;
    }

    ctx.strokeStyle = '#06161b';
    ctx.lineWidth = 2;

    ctx.beginPath();
    ctx.moveTo(0, 4);
    ctx.quadraticCurveTo(0, -5, 8, -5);
    ctx.quadraticCurveTo(16, -5, 16, 4);
    ctx.quadraticCurveTo(16, 12, 8, 17);
    ctx.quadraticCurveTo(0, 12, 0, 4);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Eye sockets in masks
    if (i < masks) {
      ctx.fillStyle = '#06161b';
      ctx.beginPath();
      ctx.ellipse(5, 5, 1.8, 2.5, -0.15, 0, Math.PI * 2);
      ctx.ellipse(11, 5, 1.8, 2.5, 0.15, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // Geo counter
  ctx.save();
  ctx.fillStyle = '#bfe5dd';
  ctx.font = '16px "Courier New", monospace';
  ctx.textAlign = 'left';
  ctx.shadowColor = 'rgba(94, 201, 186, 0.4)';
  ctx.shadowBlur = 8;
  ctx.fillText('◈ ' + geo, 22, 64);
  ctx.restore();

  // Boss health bar
  if (boss && !boss.dead) {
    const bw = Math.min(W - 160, 520), bx = (W - bw) / 2, by = H - 34;
    ctx.fillStyle = 'rgba(3, 14, 18, 0.85)';
    ctx.fillRect(bx - 3, by - 3, bw + 6, 16);
    ctx.strokeStyle = 'rgba(120, 224, 210, 0.4)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(bx - 3, by - 3, bw + 6, 16);

    ctx.fillStyle = '#9b4fd8';
    ctx.fillRect(bx, by, bw * Math.max(0, boss.hp / boss.maxhp), 10);

    ctx.fillStyle = '#e8d5f8';
    ctx.font = '12px "Courier New", monospace';
    ctx.letterSpacing = '0.15em';
    ctx.textAlign = 'center';
    ctx.fillText('DER URALTE HÜTER DES GRUNDES', W / 2, by - 8);
  }
}

/* ==========================================================================
   PARALLAX BACKGROUND
   ========================================================================== */
function drawParallax(L) {
  ctx.save();
  // Distant gothic arches
  const ax = -cam.x * 0.14;
  ctx.strokeStyle = 'rgba(28, 88, 92, 0.4)';
  ctx.lineWidth = 12;
  ctx.lineCap = 'round';
  for (let i = -1; i < 8; i++) {
    const bx = ((i * 220 + ax) % (W + 440)) - 220, by = H * 0.16;
    ctx.beginPath();
    ctx.moveTo(bx, by + 210);
    ctx.lineTo(bx, by + 45);
    ctx.arc(bx + 45, by + 45, 45, Math.PI, 0);
    ctx.lineTo(bx + 90, by + 210);
    ctx.stroke();
  }

  // Giant glowing mushrooms
  const mx = -cam.x * 0.26;
  ctx.fillStyle = 'rgba(14, 52, 56, 0.55)';
  for (let i = -1; i < 7; i++) {
    const bx = ((i * 300 + mx) % (W + 600)) - 300;
    mushroom(bx, H * 0.74, 75, 130);
  }

  // Volumetric god rays
  ctx.globalCompositeOperation = 'lighter';
  const rg = ctx.createLinearGradient(W * 0.62, 0, W * 0.42, H);
  rg.addColorStop(0, 'rgba(120, 225, 205, 0.12)');
  rg.addColorStop(1, 'rgba(120, 225, 205, 0)');
  ctx.fillStyle = rg;
  ctx.beginPath();
  ctx.moveTo(W * 0.5, 0);
  ctx.lineTo(W * 0.78, 0);
  ctx.lineTo(W * 0.52, H);
  ctx.lineTo(W * 0.28, H);
  ctx.closePath();
  ctx.fill();
  ctx.globalCompositeOperation = 'source-over';

  // Mid flora
  const fx = -cam.x * 0.42;
  ctx.fillStyle = 'rgba(8, 36, 42, 0.75)';
  for (let i = -1; i < 10; i++) {
    const bx = ((i * 150 + fx) % (W + 300)) - 150;
    leaf(bx, H, 60, 220);
    leaf(bx + 58, H, 44, 165);
  }

  // Near flora dark
  const nx = -cam.x * 0.72;
  ctx.fillStyle = 'rgba(3, 18, 22, 0.92)';
  for (let i = -1; i < 9; i++) {
    const bx = ((i * 190 + nx) % (W + 380)) - 190;
    leaf(bx, H + 12, 95, 270);
  }
  ctx.restore();
}

function leaf(x, by, w, h) {
  ctx.beginPath();
  ctx.moveTo(x, by);
  ctx.quadraticCurveTo(x - w * 0.6, by - h * 0.5, x, by - h);
  ctx.quadraticCurveTo(x + w * 0.6, by - h * 0.5, x, by);
  ctx.fill();
}

function mushroom(x, by, w, h) {
  ctx.beginPath();
  ctx.rect(x - 6, by - h * 0.6, 12, h * 0.6);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(x, by - h * 0.6, w * 0.5, h * 0.28, 0, Math.PI, 0);
  ctx.fill();
}

/* ==========================================================================
   INTERACTIVE ENTITY RENDERING
   ========================================================================== */
function drawSpikes(sp) {
  const n = Math.max(1, Math.floor(sp.w / 22)), bw = sp.w / n, tipY = sp.crushed ? sp.y + sp.h - 7 : sp.y - 4;
  ctx.fillStyle = sp.crushed ? '#15383a' : '#081c22';
  for (let i = 0; i < n; i++) {
    const x = sp.x + i * bw;
    ctx.beginPath();
    ctx.moveTo(x, sp.y + sp.h);
    ctx.lineTo(x + bw / 2, tipY);
    ctx.lineTo(x + bw, sp.y + sp.h);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = sp.crushed ? 'rgba(120,235,210,.5)' : 'rgba(150,220,210,.3)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + bw / 2, tipY);
    ctx.lineTo(x + bw * 0.66, sp.y + sp.h);
    ctx.stroke();
  }
  if (sp.crushed) {
    ctx.fillStyle = 'rgba(116,230,208,.16)';
    ctx.fillRect(sp.x, sp.y + sp.h - 5, sp.w, 5);
  }
}

function drawChain(x, y, h) {
  for (let i = 0; i < h; i += 16) {
    const yy = y + i, hz = (i / 16) % 2 === 0;
    ctx.strokeStyle = '#4a6a70';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(x, yy + 8, hz ? 4 : 7, hz ? 9 : 6, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function drawRope(x, y, h) {
  ctx.strokeStyle = '#3f5a44';
  ctx.lineWidth = 5;
  ctx.beginPath();
  for (let i = 0; i <= h; i += 8) ctx.lineTo(x + Math.sin((y + i) * 0.05) * 1.5, y + i);
  ctx.stroke();
}

function drawPlate(p) {
  ctx.fillStyle = p.pressed ? '#0d3a3a' : '#12262c';
  ctx.fillRect(p.x, p.y + (p.pressed ? 4 : 0), p.w, p.h - (p.pressed ? 4 : 0));
  ctx.strokeStyle = '#1c4a48';
  ctx.lineWidth = 2;
  ctx.strokeRect(p.x, p.y + (p.pressed ? 4 : 0), p.w, p.h - (p.pressed ? 4 : 0));
  ctx.fillStyle = p.pressed ? 'rgba(150,240,210,.9)' : 'rgba(60,150,140,.6)';
  ctx.beginPath();
  ctx.arc(p.x + p.w / 2, p.y + p.h / 2 + (p.pressed ? 3 : 0), 5, 0, Math.PI * 2);
  ctx.fill();
}

function drawGate(g) {
  const open = g.open, sh = g.h * (1 - open);
  ctx.fillStyle = '#0a2028';
  ctx.fillRect(g.x - 4, g.y - 6, g.w + 8, 6);
  ctx.fillStyle = '#1a3a40';
  ctx.strokeStyle = '#0c2228';
  ctx.lineWidth = 2;
  const bars = 3, bw = g.w / bars;
  for (let i = 0; i < bars; i++) {
    const bx = g.x + i * bw + 2;
    ctx.fillRect(bx, g.y, bw - 4, sh);
    ctx.strokeRect(bx, g.y, bw - 4, sh);
  }
}

function drawCrate(c) {
  const pulse = 0.55 + Math.sin(t * 0.055 + c.x) * 0.2;
  ctx.fillStyle = '#24392f';
  ctx.fillRect(c.x, c.y, c.w, c.h);
  ctx.strokeStyle = '#0d201b';
  ctx.lineWidth = 3;
  ctx.strokeRect(c.x + 1.5, c.y + 1.5, c.w - 3, c.h - 3);

  ctx.strokeStyle = 'rgba(92,160,135,.34)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(c.x + 8, c.y + 8); ctx.lineTo(c.x + c.w - 8, c.y + c.h - 8);
  ctx.moveTo(c.x + c.w - 8, c.y + 8); ctx.lineTo(c.x + 8, c.y + c.h - 8);
  ctx.stroke();

  ctx.fillStyle = `rgba(145,245,215,${pulse})`;
  ctx.shadowColor = '#72e3c7';
  ctx.shadowBlur = 12;
  ctx.beginPath();
  ctx.moveTo(c.x + c.w / 2, c.y + 13);
  ctx.lineTo(c.x + c.w - 13, c.y + c.h / 2);
  ctx.lineTo(c.x + c.w / 2, c.y + c.h - 13);
  ctx.lineTo(c.x + 13, c.y + c.h / 2);
  ctx.closePath();
  ctx.strokeStyle = `rgba(145,245,215,${pulse})`;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.shadowBlur = 0;
}

function drawBench(bn) {
  ctx.save();
  ctx.fillStyle = '#173840';
  ctx.fillRect(bn.x, bn.y + 18, 48, 8);
  ctx.fillRect(bn.x + 4, bn.y + 26, 6, 16);
  ctx.fillRect(bn.x + 38, bn.y + 26, 6, 16);
  ctx.fillRect(bn.x, bn.y + 2, 48, 8);
  ctx.strokeStyle = 'rgba(150,240,220,.6)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(bn.x, bn.y + 18, 48, 8);

  const gl = ctx.createRadialGradient(bn.x + 24, bn.y + 14, 2, bn.x + 24, bn.y + 14, 30);
  gl.addColorStop(0, 'rgba(150,240,220,.3)');
  gl.addColorStop(1, 'rgba(150,240,220,0)');
  ctx.fillStyle = gl;
  ctx.beginPath();
  ctx.arc(bn.x + 24, bn.y + 14, 30, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawLamp(lp) {
  ctx.strokeStyle = '#0a2228';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(lp.x, lp.y - 30);
  ctx.lineTo(lp.x, lp.y - 18);
  ctx.stroke();
  ctx.fillStyle = '#0c2830';
  ctx.beginPath();
  ctx.arc(lp.x, lp.y - 16, 7, 0, Math.PI * 2);
  ctx.fill();
  const pl = 0.8 + Math.sin(t * 0.08 + lp.x) * 0.12;
  const fg = ctx.createRadialGradient(lp.x, lp.y - 16, 1, lp.x, lp.y - 16, 14 * pl);
  fg.addColorStop(0, 'rgba(220,255,246,.95)');
  fg.addColorStop(0.5, 'rgba(120,235,214,.7)');
  fg.addColorStop(1, 'rgba(90,210,190,0)');
  ctx.fillStyle = fg;
  ctx.beginPath();
  ctx.arc(lp.x, lp.y - 16, 14 * pl, 0, Math.PI * 2);
  ctx.fill();
}

function drawRunestone(rs) {
  const rx = rs.x, ry = rs.y;
  ctx.save();
  ctx.fillStyle = '#0b1e24';
  ctx.strokeStyle = 'rgba(130, 235, 220, 0.4)';
  ctx.lineWidth = 2;

  // Carved runic obelisk
  ctx.beginPath();
  ctx.moveTo(rx - 12, ry);
  ctx.lineTo(rx - 16, ry - 38);
  ctx.lineTo(rx, ry - 48);
  ctx.lineTo(rx + 16, ry - 38);
  ctx.lineTo(rx + 12, ry);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Glowing rune symbol
  const glow = 0.6 + Math.sin(t * 0.06 + rx) * 0.35;
  ctx.strokeStyle = `rgba(140, 245, 225, ${glow})`;
  ctx.shadowColor = '#80f0dc';
  ctx.shadowBlur = 10;
  ctx.lineWidth = 1.5;

  ctx.beginPath();
  ctx.moveTo(rx, ry - 38);
  ctx.lineTo(rx, ry - 14);
  ctx.moveTo(rx - 6, ry - 28);
  ctx.lineTo(rx + 6, ry - 24);
  ctx.moveTo(rx - 6, ry - 18);
  ctx.lineTo(rx + 6, ry - 22);
  ctx.stroke();
  ctx.restore();
}

function drawGoal(G) {
  const pulse = 0.5 + Math.sin(t * 0.08) * 0.2;
  const gg = ctx.createLinearGradient(G.x, G.y, G.x, G.y + G.h);
  gg.addColorStop(0, `rgba(190,255,240,${0.35 + pulse * 0.4})`);
  gg.addColorStop(1, 'rgba(60,150,140,0)');
  ctx.fillStyle = gg;
  ctx.beginPath();
  ctx.moveTo(G.x, G.y + G.h);
  ctx.lineTo(G.x, G.y + 26);
  ctx.quadraticCurveTo(G.x, G.y, G.x + G.w / 2, G.y);
  ctx.quadraticCurveTo(G.x + G.w, G.y, G.x + G.w, G.y + 26);
  ctx.lineTo(G.x + G.w, G.y + G.h);
  ctx.closePath();
  ctx.fill();
}

function drawProj(p) {
  ctx.save();
  const col = p.kind === 'boss' ? '220,150,240' : '190,130,220';
  const gr = ctx.createRadialGradient(p.x + p.w / 2, p.y + p.h / 2, 1, p.x + p.w / 2, p.y + p.h / 2, p.w);
  gr.addColorStop(0, `rgba(${col},.95)`);
  gr.addColorStop(1, `rgba(${col},0)`);
  ctx.fillStyle = gr;
  ctx.beginPath();
  ctx.arc(p.x + p.w / 2, p.y + p.h / 2, p.w, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawSlash(sl) {
  ctx.save();
  const a = sl.life / ATK_LIFE;
  ctx.strokeStyle = `rgba(225,255,248,${a * 0.95})`;
  ctx.lineWidth = 4.5;
  ctx.lineCap = 'round';
  ctx.shadowColor = '#80f0dc';
  ctx.shadowBlur = 12;

  if (sl.dir === 'side') {
    const cx = sl.x + (player.face > 0 ? 4 : sl.w - 4), cy = sl.y + sl.h / 2;
    ctx.beginPath();
    ctx.arc(cx, cy, 28, player.face > 0 ? -0.9 : Math.PI - 0.9, player.face > 0 ? 0.9 : Math.PI + 0.9);
    ctx.stroke();
  } else if (sl.dir === 'up') {
    ctx.beginPath();
    ctx.arc(sl.x + sl.w / 2, sl.y + sl.h, 26, -Math.PI * 0.85, -Math.PI * 0.15);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.arc(sl.x + sl.w / 2, sl.y, 26, Math.PI * 0.15, Math.PI * 0.85);
    ctx.stroke();
  }
  ctx.restore();
}

/* ==========================================================================
   HAND-CRAFTED PROCEDURAL ART (HERO, ENEMIES, BOSS)
   ========================================================================== */
function drawEnemy(e) {
  ctx.save();
  ctx.translate(e.x + e.w / 2, e.y + e.h / 2);
  const fl = e.flash > 0;
  const body = fl ? '#ffffff' : '#0b2a30';

  if (e.type === 'crawler') {
    // Segmented chitin beetle
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.ellipse(0, 0, e.w / 2, e.h / 2, 0, 0, Math.PI * 2);
    ctx.fill();

    // Carapace plate ridges
    ctx.strokeStyle = fl ? '#0b2a30' : 'rgba(140, 240, 220, 0.35)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(-2, 0, e.w / 3, -1, 1);
    ctx.arc(2, 0, e.w / 3, -1, 1);
    ctx.stroke();

    // 6 Jointed skittering legs
    ctx.strokeStyle = body;
    ctx.lineWidth = 3;
    for (let i = -1; i <= 1; i++) {
      const legWob = Math.sin(e.wob + i * 1.5) * 4;
      ctx.beginPath();
      ctx.moveTo(i * 10, e.h / 2 - 2);
      ctx.lineTo(i * 12 + legWob, e.h / 2 + 8);
      ctx.stroke();
    }

    // Glowing red eyes
    ctx.fillStyle = '#ff4a6a';
    ctx.shadowColor = '#ff4a6a';
    ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.arc(-e.dir * 6, -2, 2.4, 0, Math.PI * 2);
    ctx.arc(-e.dir * 6 + e.dir * 8, -2, 2.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  } else if (e.type === 'flyer') {
    // Translucent fluttering wings
    const wf = Math.sin(t * 0.45) * 8;
    ctx.fillStyle = fl ? '#ffffff' : 'rgba(160, 245, 230, 0.55)';
    ctx.beginPath();
    ctx.ellipse(-e.w / 2, -2, 12, 5 + wf * 0.3, 0.4, 0, Math.PI * 2);
    ctx.ellipse(e.w / 2, -2, 12, 5 + wf * 0.3, -0.4, 0, Math.PI * 2);
    ctx.fill();

    // Body
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.ellipse(0, 0, e.w / 2.2, e.h / 2.4, 0, 0, Math.PI * 2);
    ctx.fill();

    // Venom stinger
    ctx.strokeStyle = '#05181c';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(0, e.h / 2.5);
    ctx.lineTo(e.dir * 4, e.h / 2.5 + 8);
    ctx.stroke();

    // Glowing cyan eyes
    ctx.fillStyle = '#78f0dc';
    ctx.beginPath();
    ctx.arc(0, -2, 2.8, 0, Math.PI * 2);
    ctx.fill();
  } else if (e.type === 'hopper') {
    // Bulky carapace with fungal growths
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.arc(0, 0, e.w / 2, 0, Math.PI * 2);
    ctx.fill();

    // Bioluminescent green fungal growths on back
    ctx.fillStyle = '#a6f050';
    ctx.shadowColor = '#a6f050';
    ctx.shadowBlur = 8;
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.arc(i * 7, -e.h / 2 + 2, 3.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.shadowBlur = 0;

    // Glowing eyes
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(-e.dir * 6, -1, 2.6, 0, Math.PI * 2);
    ctx.arc(-e.dir * 6 + e.dir * 9, -1, 2.4, 0, Math.PI * 2);
    ctx.fill();
  } else if (e.type === 'spitter') {
    // Swollen spore turret
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.moveTo(0, -e.h / 2);
    ctx.lineTo(e.w / 2, e.h / 2);
    ctx.lineTo(-e.w / 2, e.h / 2);
    ctx.closePath();
    ctx.fill();

    // Pulsating purple acid sac
    ctx.fillStyle = '#b055e8';
    ctx.shadowColor = '#b055e8';
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(e.dir * 6, 0, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }
  ctx.restore();
}

function drawBoss(b) {
  ctx.save();
  ctx.translate(b.x + b.w / 2, b.y + b.h / 2);
  const fl = b.flash > 0;
  const body = fl ? '#ffffff' : (b.phase === 2 ? '#341544' : '#1e1628');

  // Shockwaves
  for (const w of b.shockwaves) {
    const gy = levels[cur].solids[0].y;
    ctx.strokeStyle = `rgba(220,160,240,${w.life})`;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(w.x - (b.x + b.w / 2) + w.dir * w.r, gy - (b.y + b.h / 2), 12, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Heavy horned cloak
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.moveTo(-b.w / 2, b.h / 2);
  ctx.quadraticCurveTo(-b.w / 2 - 8, -b.h / 2, 0, -b.h / 2);
  ctx.quadraticCurveTo(b.w / 2 + 8, -b.h / 2, b.w / 2, b.h / 2);
  ctx.closePath();
  ctx.fill();

  // Ornate runic breastplate
  ctx.fillStyle = fl ? '#1e1628' : 'rgba(130, 80, 180, 0.35)';
  ctx.beginPath();
  ctx.ellipse(0, -6, b.w / 2 - 10, b.h / 2 - 12, 0, 0, Math.PI * 2);
  ctx.fill();

  // Spiked Pauldrons
  ctx.fillStyle = '#2d223c';
  ctx.beginPath();
  ctx.moveTo(-b.w / 2 + 4, -b.h / 2 + 20);
  ctx.lineTo(-b.w / 2 - 14, -b.h / 2 + 6);
  ctx.lineTo(-b.w / 2 + 6, -b.h / 2 + 40);
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(b.w / 2 - 4, -b.h / 2 + 20);
  ctx.lineTo(b.w / 2 + 14, -b.h / 2 + 6);
  ctx.lineTo(b.w / 2 - 6, -b.h / 2 + 40);
  ctx.fill();

  // Four Ancient Horns
  ctx.fillStyle = '#f0e6fa';
  ctx.beginPath();
  ctx.moveTo(-16, -b.h / 2 + 8);
  ctx.quadraticCurveTo(-34, -b.h / 2 - 18, -26, -b.h / 2 - 32);
  ctx.quadraticCurveTo(-18, -b.h / 2 - 8, -6, -b.h / 2 + 6);
  ctx.closePath();
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(16, -b.h / 2 + 8);
  ctx.quadraticCurveTo(34, -b.h / 2 - 18, 26, -b.h / 2 - 32);
  ctx.quadraticCurveTo(18, -b.h / 2 - 8, 6, -b.h / 2 + 6);
  ctx.closePath();
  ctx.fill();

  // Ancient Great Mask
  ctx.fillStyle = '#f2e8fc';
  ctx.beginPath();
  ctx.ellipse(b.face * 4, -b.h / 2 + 22, 16, 20, 0, 0, Math.PI * 2);
  ctx.fill();

  // Void Purple Eyes
  ctx.fillStyle = b.phase === 2 ? '#ff3df0' : '#c860ff';
  ctx.shadowColor = b.phase === 2 ? '#ff3df0' : '#c860ff';
  ctx.shadowBlur = 14;
  ctx.beginPath();
  ctx.ellipse(b.face * 4 - 6, -b.h / 2 + 20, 3.2, 5.5, -0.1, 0, Math.PI * 2);
  ctx.ellipse(b.face * 4 + 6, -b.h / 2 + 20, 3.2, 5.5, 0.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;

  // Charge warning aura
  if (b.state === 'charge') {
    ctx.strokeStyle = 'rgba(220, 120, 255, 0.65)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(0, 0, b.w / 2 + 8, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.restore();
}

function drawHero() {
  const p = player, cx = p.x + p.w / 2, feet = p.y + p.h;
  if (p.iframe > 0 && Math.floor(p.iframe / 4) % 2 === 0) return;

  // Shaded cloth cape simulation
  const seg = p.cape;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(seg[0].x, seg[0].y);
  for (let i = 1; i < seg.length; i++) {
    const w = 10 * (1 - i / seg.length) + 2;
    const dx = seg[i].x - seg[i - 1].x, dy = seg[i].y - seg[i - 1].y, d = Math.hypot(dx, dy) || 1;
    ctx.lineTo(seg[i].x - dy / d * w, seg[i].y + dx / d * w);
  }
  for (let i = seg.length - 1; i >= 1; i--) {
    const w = 10 * (1 - i / seg.length) + 2;
    const dx = seg[i].x - seg[i - 1].x, dy = seg[i].y - seg[i - 1].y, d = Math.hypot(dx, dy) || 1;
    ctx.lineTo(seg[i].x + dy / d * w, seg[i].y - dx / d * w);
  }
  ctx.closePath();

  const cg = ctx.createLinearGradient(seg[0].x, seg[0].y, seg[seg.length - 1].x, seg[seg.length - 1].y);
  cg.addColorStop(0, '#153f44');
  cg.addColorStop(1, '#05181c');
  ctx.fillStyle = cg;
  ctx.fill();
  ctx.restore();

  // Shadow on floor
  ctx.save();
  if (p.onG) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.beginPath();
    ctx.ellipse(cx, feet + 2, p.w * 0.75, 4, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  const moving = Math.abs(p.vx) > 0.4 && p.onG;
  const stride = Math.sin(p.walk) * 7;
  const up = Math.abs(Math.cos(p.walk)) * 3;

  ctx.strokeStyle = '#08181c';
  ctx.fillStyle = '#08181c';
  ctx.lineCap = 'round';
  ctx.lineWidth = 5;

  // Articulated legs
  if (climbing) {
    ctx.beginPath();
    ctx.moveTo(cx - 4, feet - 14); ctx.lineTo(cx - 5, feet); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx + 4, feet - 14); ctx.lineTo(cx + 5, feet - 6); ctx.stroke();
  } else if (moving) {
    ctx.beginPath();
    ctx.moveTo(cx, feet - 14); ctx.lineTo(cx + stride, feet); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx, feet - 14); ctx.lineTo(cx - stride, feet - up); ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.moveTo(cx - 4, feet - 14); ctx.lineTo(cx - 4, feet); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx + 4, feet - 14); ctx.lineTo(cx + 4, feet); ctx.stroke();
  }

  // Torso
  ctx.lineWidth = 9.5;
  ctx.beginPath();
  ctx.moveTo(cx, feet - 14); ctx.lineTo(cx, p.y + 13);
  ctx.stroke();

  // Shoulders
  ctx.fillStyle = '#08181c';
  ctx.beginPath();
  ctx.moveTo(cx - 8, p.y + 14); ctx.lineTo(cx - 13, p.y + 8); ctx.lineTo(cx - 5, p.y + 12);
  ctx.closePath(); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(cx + 8, p.y + 14); ctx.lineTo(cx + 13, p.y + 8); ctx.lineTo(cx + 5, p.y + 12);
  ctx.closePath(); ctx.fill();

  // Arms holding the Nail
  ctx.lineWidth = 4;
  const atk = p.atkT > 0;
  if (atk) {
    ctx.strokeStyle = '#08181c';
    ctx.beginPath();
    ctx.moveTo(cx, p.y + 18); ctx.lineTo(cx + p.face * 15, p.y + 16);
    ctx.stroke();

    // Gleaming Nail blade
    ctx.strokeStyle = '#dff0ec';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(cx + p.face * 15, p.y + 16);
    ctx.lineTo(cx + p.face * 32, p.y + 8);
    ctx.stroke();
  } else if (climbing) {
    ctx.beginPath(); ctx.moveTo(cx, p.y + 18); ctx.lineTo(cx + 6, p.y + 8); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx, p.y + 18); ctx.lineTo(cx - 6, p.y + 8); ctx.stroke();
  } else if (!p.onG) {
    ctx.beginPath(); ctx.moveTo(cx, p.y + 18); ctx.lineTo(cx + p.face * 9, p.y + 11); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx, p.y + 18); ctx.lineTo(cx - p.face * 7, p.y + 15); ctx.stroke();
  } else {
    const sw = moving ? Math.sin(p.walk) * 6 : 0;
    ctx.beginPath(); ctx.moveTo(cx, p.y + 18); ctx.lineTo(cx + p.face * 4 + sw, p.y + 27); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx, p.y + 18); ctx.lineTo(cx - p.face * 4 - sw, p.y + 27); ctx.stroke();
  }

  // Pure White Bone Mask with Curved Stag Horns
  ctx.fillStyle = '#08181c';
  ctx.beginPath();
  ctx.arc(cx, p.y + 7, 9.5, 0, Math.PI * 2);
  ctx.fill();

  // Elegant Stag Beetle Horns
  ctx.fillStyle = '#f0f7f4';
  ctx.beginPath();
  ctx.moveTo(cx - 5, p.y + 1);
  ctx.quadraticCurveTo(cx - 13, p.y - 7, cx - 11, p.y - 14);
  ctx.quadraticCurveTo(cx - 6, p.y - 6, cx - 2, p.y - 1);
  ctx.closePath();
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(cx + 5, p.y + 1);
  ctx.quadraticCurveTo(cx + 13, p.y - 7, cx + 11, p.y - 14);
  ctx.quadraticCurveTo(cx + 6, p.y - 6, cx + 2, p.y - 1);
  ctx.closePath();
  ctx.fill();

  // Bone Face Plate
  ctx.fillStyle = '#f2f8f5';
  ctx.beginPath();
  ctx.ellipse(cx + p.face * 1.5, p.y + 7, 6.4, 7.5, 0, 0, Math.PI * 2);
  ctx.fill();

  // Dark Soul Eye Sockets
  ctx.fillStyle = '#08181c';
  if (p.blink > 7) {
    ctx.beginPath();
    ctx.ellipse(cx + p.face * 1.5 - 2.5, p.y + 6.5, 1.6, 2.8, -0.1, 0, Math.PI * 2);
    ctx.ellipse(cx + p.face * 1.5 + 2.5, p.y + 6.5, 1.6, 2.8, 0.1, 0, Math.PI * 2);
    ctx.fill();

    // Subtle cyan soul pupil glint
    ctx.fillStyle = '#9cf5e4';
    ctx.beginPath();
    ctx.arc(cx + p.face * 1.5 - 2.5 + p.face * 0.4, p.y + 6.5, 0.7, 0, Math.PI * 2);
    ctx.arc(cx + p.face * 1.5 + 2.5 + p.face * 0.4, p.y + 6.5, 0.7, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.fillRect(cx + p.face * 1.5 - 4, p.y + 6, 8, 1.4);
  }

  ctx.restore();
}

/* ==========================================================================
   LOOP & START/WIN
   ========================================================================== */
let last = 0, acc = 0;
function frame(ts) {
  const dt = Math.min(50, ts - last);
  last = ts;
  acc += dt;
  let st = 0;
  while (acc >= 16.6667 && st < 5) {
    update();
    acc -= 16.6667;
    st++;
  }
  if (cur < levels.length && player) draw();
  requestAnimationFrame(frame);
}

function showWin() {
  overlay.classList.remove('hide');
  ovTitle.textContent = 'Silmoor befreit';
  ovSub.innerHTML = 'Der Hüter ist gefallen. Das uralte Gefäß ruht im stillen Licht des Grundes.<br>Gesammeltes Geo: ◈ ' + geo;
  startBtn.textContent = 'Neu erwachen ↺';
}

startBtn.addEventListener('click', () => {
  ensureAudio();
  if (actx && actx.state === 'suspended') actx.resume();
  initMusic();
  if (winShow) {
    winShow = false;
    cur = 0;
    geo = 0;
    masks = MAXMASK;
    checkpoint = null;
  }
  loadLevel(cur, false);
  running = true;
  overlay.classList.add('hide');
});

resize();
loadLevel(0, false);

if (typeof globalThis !== 'undefined' && globalThis.__SILMOOR_TEST_MODE__) {
  globalThis.__silmoorTest = {
    aabb, crushSpikesUnderCrates, pressesPlate, input: K, updateStick, resetStick, loadLevel, update,
    setRunning(value) { running = value; },
    state() { return { player, crates, enemies, levels, masks }; }
  };
}

requestAnimationFrame(frame);
})();
