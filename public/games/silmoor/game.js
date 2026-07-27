(() => {
"use strict";
const canvas=document.getElementById('c'), ctx=canvas.getContext('2d');
const W=960,H=540;

// ---------------- Sprites (optional painted art; falls back to code art) ----------------
// Drop matching PNGs into assets/ and they are used automatically. Missing files => code art.
const MANIFEST={
  bg_far:'assets/bg/cave_far.png', bg_mid:'assets/bg/cave_mid.png', bg_near:'assets/bg/cave_near.png',
  hero_idle:'assets/hero/idle.png', hero_run:'assets/hero/run.png', hero_jump:'assets/hero/jump.png', hero_attack:'assets/hero/attack.png',
  enemy_crawler:'assets/enemies/crawler.png', enemy_flyer:'assets/enemies/flyer.png',
  enemy_hopper:'assets/enemies/hopper.png', enemy_spitter:'assets/enemies/spitter.png',
  boss:'assets/boss/hueter.png',
};
const IMG={};
for(const k in MANIFEST){ const im=new Image(); im.onload=()=>{IMG[k]=im;}; im.onerror=()=>{}; im.src=MANIFEST[k]; }
function spr(k){ return IMG[k]||null; }
// draw a sprite bottom-centered at world (cx,by), flipped by facing, scaled to targetH
function drawSpriteAt(img,cx,by,face,targetH){ const sc=targetH/img.height, w=img.width*sc,h=targetH;
  ctx.save(); ctx.translate(cx,by); if(face<0)ctx.scale(-1,1); ctx.imageSmoothingEnabled=true; ctx.drawImage(img,-w/2,-h,w,h); ctx.restore(); }
function tileLayer(img,f){ if(!img)return; const sc=H/img.height, tw=img.width*sc; let x=-(((cam.x*f)%tw)); if(x>0)x-=tw; for(;x<W+tw;x+=tw) ctx.drawImage(img,x,0,tw,H); }
const overlay=document.getElementById('overlay'), ovTitle=document.getElementById('ovTitle'),
  ovSub=document.getElementById('ovSub'), startBtn=document.getElementById('startBtn'),
  hudRoom=document.getElementById('hudRoom'), muteBtn=document.getElementById('mute');

// ---------------- Audio ----------------
let actx=null, muted=true;
function ensureAudio(){ if(!actx){ try{actx=new (window.AudioContext||window.webkitAudioContext)();}catch(e){} } }
function tone(f,d,type='sine',vol=0.09,slide=null){ if(muted||!actx)return; const t=actx.currentTime;
  const o=actx.createOscillator(),g=actx.createGain(); o.type=type; o.frequency.setValueAtTime(f,t);
  if(slide)o.frequency.exponentialRampToValueAtTime(slide,t+d);
  g.gain.setValueAtTime(vol,t); g.gain.exponentialRampToValueAtTime(0.0001,t+d);
  o.connect(g); g.connect(actx.destination); o.start(t); o.stop(t+d); }
const S={
  jump(){tone(180,0.16,'square',0.05,340);}, land(){tone(90,0.08,'sine',0.04,55);},
  nail(){tone(520,0.07,'square',0.05,300); tone(760,0.05,'triangle',0.03);},
  hit(){tone(240,0.1,'sawtooth',0.07,120);}, pogo(){tone(300,0.12,'square',0.06,620);},
  hurt(){tone(160,0.3,'sawtooth',0.09,70);}, climb(){tone(220,0.05,'triangle',0.03,240);},
  geo(){tone(660,0.08,'sine',0.05,940);}, gate(){tone(120,0.4,'sawtooth',0.06,60);},
  push(){tone(70,0.12,'sawtooth',0.04,55);}, bench(){[392,523,659].forEach((f,i)=>setTimeout(()=>tone(f,0.25,'triangle',0.06),i*110));},
  bosshit(){tone(200,0.12,'sawtooth',0.08,90);}, bossdie(){[262,196,131,98].forEach((f,i)=>setTimeout(()=>tone(f,0.4,'sawtooth',0.09,60),i*150));},
  win(){[196,262,330,392,523,659].forEach((f,i)=>setTimeout(()=>tone(f,0.3,'triangle',0.07,f*1.2),i*130));}
};
muteBtn.addEventListener('click',e=>{e.stopPropagation();muted=!muted;ensureAudio();if(actx&&actx.state==='suspended')actx.resume();muteBtn.textContent=muted?'Ton an':'Ton aus';});

// ---------------- Input ----------------
const K={left:false,right:false,up:false,down:false,jump:false,attack:false};
const km={ArrowLeft:'left',KeyA:'left',ArrowRight:'right',KeyD:'right',ArrowUp:'up',KeyW:'up',
  ArrowDown:'down',KeyS:'down',Space:'jump',KeyJ:'attack',KeyX:'attack',KeyK:'attack',KeyR:'reset'};
addEventListener('keydown',e=>{const k=km[e.code]; if(!k)return; e.preventDefault();
  if(k==='reset'){ if(running) hardReset(); return; }
  if(k==='jump'&&!K.jump) jumpBuf=JB;
  if(k==='attack'&&!K.attack) atkBuf=AB;
  K[k]=true;});
addEventListener('keyup',e=>{const k=km[e.code]; if(!k)return; e.preventDefault(); if(k in K)K[k]=false;});
// touch
document.querySelectorAll('.btn').forEach(b=>{
  const k=b.dataset.k;
  const on=e=>{e.preventDefault(); if(k==='jump'&&!K.jump)jumpBuf=JB; if(k==='attack'&&!K.attack)atkBuf=AB; K[k]=true;};
  const off=e=>{e.preventDefault(); K[k]=false;};
  b.addEventListener('pointerdown',on); b.addEventListener('pointerup',off);
  b.addEventListener('pointercancel',off); b.addEventListener('pointerleave',off);
});

// ---------------- Const ----------------
const GRAV=0.7,MOVE=0.9,MAXV=4.9,FRIC=0.80,AIR=0.90,JUMPV=-12.8,COY=7,JB=8,CUT=0.5,CLIMBV=2.5;
const AB=8, ATK_CD=20, ATK_LIFE=9, IFRAMES=64;
let jumpBuf=0, atkBuf=0, coyote=0, climbing=false, climbRef=null;

// ---------------- Textures ----------------
let rockPat=null;
function rockTile(){
  const t=document.createElement('canvas'); t.width=72;t.height=72; const g=t.getContext('2d');
  g.fillStyle='#173840'; g.fillRect(0,0,72,72);
  for(let i=0;i<220;i++){ g.fillStyle=`rgba(${8+Math.random()*22|0},${30+Math.random()*34|0},${36+Math.random()*34|0},.5)`;
    g.beginPath(); g.arc(Math.random()*72,Math.random()*72,Math.random()*2.6,0,6.29); g.fill(); }
  g.strokeStyle='rgba(2,14,18,.3)'; g.lineWidth=1;
  for(let i=-72;i<72;i+=6){ g.beginPath();g.moveTo(i,0);g.lineTo(i+72,72);g.stroke(); }
  g.strokeStyle='rgba(2,14,18,.16)';
  for(let i=0;i<144;i+=7){ g.beginPath();g.moveTo(i,72);g.lineTo(i-72,0);g.stroke(); }
  g.strokeStyle='rgba(150,235,220,.05)';
  for(let i=-72;i<72;i+=10){ g.beginPath();g.moveTo(i,0);g.lineTo(i+72,72);g.stroke(); }
  return ctx.createPattern(t,'repeat');
}

// ---------------- Enemy factory ----------------
function mkEnemy(d){
  const base={x:d.x,y:d.y,vx:0,vy:0,dir:d.dir||-1,alive:true,wob:Math.random()*6.28,tmr:Math.random()*60,
    hp:1,w:30,h:26,type:d.t,onG:false,flash:0,sx:d.x,sy:d.y,min:d.min,max:d.max,shootT:60};
  if(d.t==='crawler'){ base.hp=2; base.w=34; base.h=24; }
  if(d.t==='flyer'){ base.hp=2; base.w=30; base.h=26; base.baseY=d.y; }
  if(d.t==='hopper'){ base.hp=3; base.w=32; base.h=30; }
  if(d.t==='spitter'){ base.hp=2; base.w=34; base.h=34; }
  return base;
}

// ---------------- Levels ----------------
// solids=rock rects; spikes=hazard; chains climbable; crates pushable; plate->gate; bench=checkpoint; enemies; lamps; goal=exit; boss level uses boss flag.
const L1={ name:'I · Wurzelhallen', wW:2600, wH:820, spawn:{x:120,y:600},
  goal:{x:2470,y:250,w:60,h:120},
  solids:[
    {x:-60,y:680,w:1200,h:220},{x:1340,y:680,w:1320,h:220},   // floor with a pit 1140-1340
    {x:-60,y:0,w:2720,h:60},
    {x:-60,y:0,w:60,h:820},{x:2600,y:0,w:60,h:820},
    {x:1180,y:600,w:150,h:26},                                  // stepping stone over pit (80 up)
    {x:1700,y:590,w:220,h:26},                                  // 90 up from floor
    {x:2000,y:480,w:220,h:26},                                  // 110 up
    {x:2260,y:370,w:300,h:26},                                  // 110 up (goal ledge)
  ],
  spikes:[{x:900,y:652,w:120,h:30}],
  chains:[{x:640,y:60,h:620,climb:true}],
  crates:[], plates:[], gates:[],
  bench:{x:340,y:632},
  lamps:[{x:180,y:600},{x:760,y:560},{x:1500,y:600},{x:2100,y:440},{x:2400,y:330}],
  orbs:[{x:640,y:360},{x:1810,y:550},{x:2110,y:440}],
  enemies:[{t:'crawler',x:520,y:650,min:420,max:760},{t:'crawler',x:1600,y:650,min:1400,max:1760},
    {t:'flyer',x:1000,y:430,min:840,max:1140},{t:'hopper',x:2050,y:646,min:1900,max:2560}],
};
const L2={ name:'II · Die Sporengruft', wW:2800, wH:900, spawn:{x:110,y:660},
  goal:{x:2660,y:300,w:60,h:120},
  solids:[
    {x:-60,y:740,w:1740,h:220},                                 // floor left (ends 1680)
    {x:1780,y:740,w:1020,h:220},                                // floor right (starts 1780)
    {x:-60,y:0,w:2920,h:60},{x:-60,y:0,w:60,h:900},{x:2800,y:0,w:60,h:900},
    {x:1260,y:340,w:240,h:26},                                  // balcony (rope dismount, orb)
    {x:1980,y:640,w:200,h:26},                                  // 100 up from floor
    {x:2260,y:530,w:220,h:26},                                  // 110 up
    {x:2520,y:420,w:280,h:26},                                  // 110 up (goal ledge)
  ],
  spikes:[{x:600,y:712,w:120,h:30}],
  ropes:[{x:1240,y:60,h:680,climb:true}],
  crates:[{x:360,y:684,w:56,h:56}],
  plates:[{x:840,y:720,w:100,h:20,id:'a'}],
  gates:[{x:1620,y:300,w:44,h:440,plate:'a'}],
  bench:{x:300,y:692},
  lamps:[{x:170,y:660},{x:700,y:660},{x:1040,y:660},{x:1360,y:300},{x:2100,y:520},{x:2600,y:390}],
  orbs:[{x:840,y:696},{x:1300,y:300},{x:2680,y:300}],
  enemies:[{t:'crawler',x:600,y:706,min:440,max:820},{t:'spitter',x:1120,y:706,min:1120,max:1120},
    {t:'flyer',x:2100,y:430,min:1900,max:2760},{t:'hopper',x:2300,y:706,min:1900,max:2760}],
};
const L3={ name:'III · Der Vergessene Steg', wW:3100, wH:900, spawn:{x:100,y:660},
  goal:{x:2880,y:230,w:60,h:120},
  solids:[
    {x:-60,y:740,w:900,h:220},{x:1060,y:740,w:900,h:220},{x:2180,y:740,w:920,h:220}, // 3 floors, 2 pits
    {x:-60,y:0,w:3220,h:60},{x:-60,y:0,w:60,h:900},{x:3100,y:0,w:60,h:900},
    {x:920,y:640,w:120,h:24},{x:2000,y:640,w:120,h:24},        // stepping stones across pits (100 up)
    {x:2360,y:560,w:200,h:26},                                  // 90 up from chain-dismount
    {x:2620,y:450,w:220,h:26},                                  // 110 up
    {x:2800,y:350,w:220,h:26},                                  // 100 up (goal ledge)
  ],
  spikes:[{x:500,y:712,w:120,h:30},{x:1300,y:712,w:150,h:30}],
  chains:[{x:2280,y:60,h:680,climb:true}],
  crates:[{x:1200,y:684,w:56,h:56}],
  plates:[{x:1700,y:720,w:100,h:20,id:'a'}],
  gates:[{x:2180,y:300,w:44,h:440,plate:'a'}],
  bench:{x:1120,y:692},
  lamps:[{x:150,y:660},{x:640,y:660},{x:1300,y:660},{x:1760,y:660},{x:2500,y:520},{x:2820,y:330}],
  orbs:[{x:960,y:600},{x:2010,y:600},{x:2660,y:430}],
  enemies:[{t:'crawler',x:400,y:706,min:240,max:760},{t:'hopper',x:1400,y:706,min:1120,max:1900},
    {t:'flyer',x:700,y:430,min:520,max:820},{t:'spitter',x:2400,y:706,min:2400,max:2400},
    {t:'crawler',x:2600,y:706,min:2260,max:3040}],
};
const LB={ name:'IV · Grund von Silmoor · Der Hüter', wW:1500, wH:760, spawn:{x:120,y:600}, isBoss:true,
  goal:{x:1360,y:560,w:60,h:120, hidden:true},                  // on the floor, reachable after boss falls
  solids:[
    {x:-60,y:680,w:1620,h:200},{x:-60,y:0,w:1620,h:60},
    {x:-60,y:0,w:60,h:760},{x:1440,y:0,w:60,h:760},
    {x:200,y:562,w:150,h:22},{x:1150,y:562,w:150,h:22},         // low dodge ledges (~118 up, at jump reach)
  ],
  spikes:[],
  chains:[], crates:[], plates:[], gates:[],
  bench:{x:120,y:632},
  lamps:[{x:120,y:600},{x:750,y:120},{x:1360,y:600}],
  orbs:[],
  enemies:[],
  boss:{x:840,y:560,w:92,h:110,hp:26,maxhp:26},
};
const levels=[L1,L2,L3,LB];

// ---------------- State ----------------
let cur=0, running=false, winShow=false, t=0, shake=0, levelIntro=0, flash=0;
let player, cam, crates, enemies, projs, orbs, particles, spores, drips, slashes, boss=null;
let masks=5, MAXMASK=5, geo=0, checkpoint=null, transition=0;

function seedSpores(L){ spores=[]; for(let k=0;k<100;k++) spores.push({x:Math.random()*L.wW,y:Math.random()*L.wH,r:0.6+Math.random()*1.9,ph:Math.random()*6.28,sp:0.14+Math.random()*0.4}); }
function newDrip(L){ return {x:80+Math.random()*(L.wW-160),y:70,vy:0,wait:Math.random()*220}; }

function loadLevel(i, useCheckpoint){
  cur=i; const L=levels[i];
  const sp = (useCheckpoint&&checkpoint&&checkpoint.lvl===i)?checkpoint.pos:L.spawn;
  player={x:sp.x,y:sp.y,w:24,h:36,vx:0,vy:0,onG:false,face:1,walk:0,dead:false,iframe:0,atkT:0,atkCD:0,blink:0,cape:mkCape(sp.x,sp.y)};
  cam={x:0,y:0};
  crates=(L.crates||[]).map(c=>({x:c.x,y:c.y,w:c.w,h:c.h,vx:0,vy:0,onG:false,sx:c.x,sy:c.y}));
  enemies=(L.enemies||[]).map(mkEnemy);
  boss = L.boss? {x:L.boss.x,y:L.boss.y,w:L.boss.w,h:L.boss.h,hp:L.boss.hp,maxhp:L.boss.maxhp,vx:0,vy:0,onG:false,
    state:'idle',stateT:90,face:-1,flash:0,phase:1,dead:false,defeated:false,shockwaves:[]} : null;
  orbs=(L.orbs||[]).map(o=>({x:o.x,y:o.y,got:false,ph:Math.random()*6.28}));
  projs=[]; particles=[]; drips=[]; slashes=[];
  (L.gates||[]).forEach(g=>g.open=0);
  (L.plates||[]).forEach(p=>{p.pressed=false;p.wasPressed=false;});
  if(L.goal) L.goal._show = !L.goal.hidden;
  for(let k=0;k<12;k++) drips.push(newDrip(L));
  seedSpores(L);
  if(!checkpoint||checkpoint.lvl!==i||!useCheckpoint){ checkpoint={lvl:i,pos:{x:L.spawn.x,y:L.spawn.y}}; }
  levelIntro=110; hudRoom.textContent=L.name;
}
function respawn(){ // after death: reload room at checkpoint, heal
  masks=MAXMASK; loadLevel(cur,true);
}
function hardReset(){ masks=MAXMASK; loadLevel(cur,true); }

function nextLevel(){
  if(cur<levels.length-1){ S.win(); geo+=25; loadLevel(cur+1,false); }
  else { running=false; winShow=true; showWin(); }
}

function mkCape(x,y){ const s=[]; for(let i=0;i<9;i++)s.push({x,y,px:x,py:y}); return s; }
const aabb=(a,b)=> a.x<b.x+b.w && a.x+a.w>b.x && a.y<b.y+b.h && a.y+a.h>b.y;
function gateRect(g){ return {x:g.x,y:g.y,w:g.w,h:g.h*(1-g.open)}; }
function staticSolids(L){ const a=L.solids.slice(); for(const g of (L.gates||[])){ const r=gateRect(g); if(r.h>2)a.push(r); } return a; }
function burst(x,y,n,sp,col){ for(let i=0;i<n;i++)particles.push({x,y,vx:(Math.random()-.5)*sp,vy:(Math.random()-1)*sp*.7,life:1,r:1+Math.random()*2.4,col:col||'150,220,210'}); }

// ---------------- Damage ----------------
function hurtPlayer(fromX){
  if(player.iframe>0||player.dead) return;
  masks--; player.iframe=IFRAMES; S.hurt(); flash=10; shake=10;
  const dir = player.x < fromX ? -1 : 1;
  player.vx = dir*6; player.vy=-6; climbing=false;
  burst(player.x+player.w/2,player.y+player.h/2,14,5,'230,120,120');
  if(masks<=0){ player.dead=true; player.deadT=0; }
}

// ---------------- Update ----------------
function update(){
  if(!running) return;
  const L=levels[cur]; t++; if(shake>0)shake*=0.86; if(flash>0)flash--; if(levelIntro>0)levelIntro--;

  if(player.dead){ player.deadT=(player.deadT||0)+1; stepParticles(); if(player.deadT>60) respawn(); return; }
  if(transition>0){ transition--; if(transition===0) nextLevel(); }

  const sol=staticSolids(L);

  // crates settle
  for(const c of crates){ c.vy+=GRAV; if(c.vy>14)c.vy=14; c.y+=c.vy; c.onG=false;
    for(const s of sol){ if(aabb(c,s)){ if(c.vy>0){c.y=s.y-c.h;c.onG=true;} else c.y=s.y+s.h; c.vy=0; } }
    for(const o of crates){ if(o!==c&&aabb(c,o)){ if(c.vy>0){c.y=o.y-c.h;c.onG=true;c.vy=0;} else if(c.vy<0){c.y=o.y+o.h;c.vy=0;} } }
    if(c.y>L.wH+180){ c.x=c.sx;c.y=c.sy;c.vx=0;c.vy=0; } }

  // timers
  if(jumpBuf>0)jumpBuf--; if(atkBuf>0)atkBuf--; if(coyote>0)coyote--;
  if(player.atkCD>0)player.atkCD--; if(player.atkT>0)player.atkT--; if(player.iframe>0)player.iframe--;

  // attack
  if(atkBuf>0 && player.atkCD<=0){ atkBuf=0; player.atkCD=ATK_CD; player.atkT=ATK_LIFE; S.nail();
    let dir='side';
    if(K.up) dir='up'; else if(K.down && !player.onG) dir='down';
    let hb;
    if(dir==='up') hb={x:player.x-4,y:player.y-34,w:player.w+8,h:38,dir:'up'};
    else if(dir==='down') hb={x:player.x-4,y:player.y+player.h,w:player.w+8,h:38,dir:'down'};
    else hb={x: player.face>0?player.x+player.w-4:player.x-38, y:player.y+2, w:42, h:32, dir:'side'};
    slashes.push({...hb,life:ATK_LIFE,hitset:new Set()});
  }

  // climbing
  const climbables=[...(L.chains||[]),...(L.ropes||[])].filter(r=>r.climb);
  let onClimb=null;
  for(const r of climbables){ const py=player.y+player.h/2;
    if(Math.abs((player.x+player.w/2)-r.x)<22 && py>r.y-12 && py<r.y+r.h+14){ onClimb=r; break; } }
  if(onClimb && (K.up||K.down) && !climbing){ climbing=true; climbRef=onClimb; player.vx=0; player.vy=0; player.x=onClimb.x-player.w/2; }
  if(climbing){
    if(!onClimb) climbing=false;
    else{
      player.vy=(K.up?-CLIMBV:0)+(K.down?CLIMBV:0); player.y+=player.vy;
      for(const s of sol){ if(aabb(player,s)){ if(player.vy>0)player.y=s.y-player.h; else if(player.vy<0)player.y=s.y+s.h; player.vy=0; } }
      const hx=(K.left?-1:0)+(K.right?1:0);
      if(hx){ player.x+=hx*2.3; player.face=hx; for(const s of sol){ if(aabb(player,s)){ if(hx>0)player.x=s.x-player.w; else player.x=s.x+s.w; } } }
      if((K.up||K.down)&&t%9===0) S.climb();
      if(jumpBuf>0){ climbing=false; player.vy=JUMPV*0.85; player.vx=hx*3.2; jumpBuf=0; S.jump(); }
      commonEnd(L,sol); return;
    }
  }

  // horizontal
  const dir=(K.left?-1:0)+(K.right?1:0);
  if(dir){ player.vx+=dir*(player.onG?MOVE:MOVE*0.7); player.face=dir; }
  player.vx*=player.onG?FRIC:AIR; player.vx=Math.max(-MAXV,Math.min(MAXV,player.vx)); if(Math.abs(player.vx)<0.05)player.vx=0;
  // jump
  if(jumpBuf>0&&coyote>0){ player.vy=JUMPV; player.onG=false; coyote=0; jumpBuf=0; S.jump(); burst(player.x+player.w/2,player.y+player.h,6,3); }
  if(!K.jump&&player.vy<0) player.vy*=(1-CUT);
  player.vy+=GRAV; if(player.vy>15)player.vy=15;
  // move X
  player.x+=player.vx;
  for(const s of sol){ if(aabb(player,s)){ if(player.vx>0)player.x=s.x-player.w; else if(player.vx<0)player.x=s.x+s.w; player.vx=0; } }
  // push crates
  for(const c of crates){ if(aabb(player,c)){ const can=player.onG&&c.onG;
    if(player.face>0&&player.x+player.w>c.x){ const pen=(player.x+player.w)-c.x;
      if(can&&tryMoveCrate(c,pen,L,sol)){ player.x=c.x-player.w; if(t%10===0)S.push(); } else player.x=c.x-player.w; }
    else if(player.face<0&&player.x<c.x+c.w){ const pen=(c.x+c.w)-player.x;
      if(can&&tryMoveCrate(c,-pen,L,sol)){ player.x=c.x+c.w; if(t%10===0)S.push(); } else player.x=c.x+c.w; } } }
  // move Y
  const wasG=player.onG; player.onG=false; player.y+=player.vy;
  const solY=[...sol,...crates];
  for(const s of solY){ if(aabb(player,s)){ if(player.vy>0){player.y=s.y-player.h;player.onG=true; if(!wasG&&player.vy>3){S.land();burst(player.x+player.w/2,player.y+player.h,5,2.2);}} else if(player.vy<0)player.y=s.y+s.h; player.vy=0; } }
  if(player.onG)coyote=COY;
  if(player.x<10)player.x=10; if(player.x+player.w>L.wW-10)player.x=L.wW-10-player.w;
  if(player.y>L.wH+120){ hurtPlayer(player.x); if(!player.dead){ // knock back to safe checkpoint area
      player.y=Math.max(80,(checkpoint?checkpoint.pos.y:L.spawn.y)-40); player.x=checkpoint?checkpoint.pos.x:L.spawn.x; player.vy=0; } }
  if(Math.abs(player.vx)>0.4&&player.onG) player.walk+=Math.abs(player.vx)*0.09;
  player.blink=(player.blink+1)%240;

  commonEnd(L,sol);
}

function tryMoveCrate(c,dx,L,sol){ const nx=c.x+dx, test={x:nx,y:c.y,w:c.w,h:c.h};
  for(const s of sol){ if(aabb(test,s))return false; } for(const o of crates){ if(o!==c&&aabb(test,o))return false; }
  if(nx<10||nx+c.w>L.wW-10)return false; c.x=nx; return true; }

function commonEnd(L,sol){
  // slashes
  for(const sl of slashes){ sl.life--;
    // hit enemies
    for(const e of enemies){ if(!e.alive||sl.hitset.has(e))continue; if(aabb(sl,e)){ damageEnemy(e,1,sl); sl.hitset.add(e); } }
    // hit boss
    if(boss&&!boss.dead&&!sl.hitset.has(boss)&&aabb(sl,boss)){ damageBoss(1,sl); sl.hitset.add(boss); }
    // hit projectiles (parry)
    for(const p of projs){ if(!p.dead&&aabb(sl,p)){ p.dead=true; burst(p.x,p.y,6,3,'150,240,220'); } }
    // pogo off enemies/spikes/boss when down-slash
    if(sl.dir==='down' && !player.onG){
      let pogo=false;
      for(const e of enemies){ if(e.alive&&aabb(sl,e)){pogo=true;} }
      if(boss&&!boss.dead&&aabb(sl,boss))pogo=true;
      for(const sp of L.spikes){ if(aabb(sl,{x:sp.x,y:sp.y,w:sp.w,h:sp.h}))pogo=true; }
      if(pogo){ player.vy=JUMPV*0.92; S.pogo(); }
    }
  }
  slashes=slashes.filter(s=>s.life>0);

  // enemies update
  for(const e of enemies){ if(!e.alive)continue; if(e.flash>0)e.flash--; updateEnemy(e,L,sol); }
  // boss update
  if(boss&&!boss.dead) updateBoss(L,sol);

  // projectiles
  for(const p of projs){ if(p.dead)continue; p.x+=p.vx; p.y+=p.vy; if(p.grav)p.vy+=0.2; p.life--;
    if(p.life<=0||p.x<0||p.x>L.wW||p.y>L.wH){ p.dead=true; continue; }
    if(aabb(p,player)){ p.dead=true; hurtPlayer(p.x); } }
  projs=projs.filter(p=>!p.dead);

  // enemy contact damage
  for(const e of enemies){ if(!e.alive)continue; if(aabb(player,e)) hurtPlayer(e.x+e.w/2); }
  if(boss&&!boss.dead&&aabb(player,boss)) hurtPlayer(boss.x+boss.w/2);

  // spikes
  for(const sp of L.spikes){ if(aabb(player,{x:sp.x,y:sp.y,w:sp.w,h:sp.h})){ hurtPlayer(player.x); if(!player.dead){ player.y-=30; player.vy=-8; } } }

  // plates & gates
  for(const p of (L.plates||[])){ const sensor={x:p.x,y:p.y-6,w:p.w,h:12}; let pr=false;
    for(const c of crates){ if(aabb(c,sensor))pr=true; } if(aabb(player,sensor))pr=true;
    if(pr&&!p.wasPressed)S.bench&&S.geo(); p.pressed=pr; p.wasPressed=pr; }
  for(const g of (L.gates||[])){ const p=(L.plates||[]).find(pp=>pp.id===g.plate); const want=p&&p.pressed?1:0;
    const before=g.open; g.open+=(want-g.open)*0.12; if(Math.abs(g.open-before)>0.005&&Math.random()<0.04)S.gate(); }

  // orbs (geo)
  for(const o of orbs){ if(o.got)continue; o.ph=(o.ph||0)+0.08;
    if(Math.hypot((player.x+player.w/2)-o.x,(player.y+player.h/2)-o.y)<28){ o.got=true; geo+=5; S.geo(); burst(o.x,o.y,10,3,'210,240,150'); } }

  // bench checkpoint
  if(L.bench && aabb(player,{x:L.bench.x-6,y:L.bench.y-10,w:60,h:60})){
    if(!checkpoint||checkpoint.lvl!==cur||checkpoint.pos.x!==L.bench.x){ checkpoint={lvl:cur,pos:{x:L.bench.x,y:L.bench.y}}; masks=MAXMASK; S.bench(); burst(L.bench.x+20,L.bench.y,14,3,'150,240,220'); } }

  // goal
  if(L.goal && L.goal._show && transition===0 && aabb(player,{x:L.goal.x,y:L.goal.y,w:L.goal.w,h:L.goal.h})){ transition=26; burst(L.goal.x+30,L.goal.y+60,20,4,'190,255,240'); }

  // ambient
  stepParticles(); updateCape();
  for(const s of spores){ s.y-=s.sp; s.x+=Math.sin(s.ph+t*0.02)*0.24; if(s.y<40)s.y=L.wH-100; }
  for(const d of drips){ if(d.wait>0){d.wait--; if(d.wait<=0)d.vy=0;} else { d.vy+=0.3; d.y+=d.vy; if(d.y>L.wH-120)Object.assign(d,newDrip(L)); } }

  // camera
  const tx=player.x+player.w/2-W/2, ty=player.y+player.h/2-H/2;
  cam.x+=(Math.max(0,Math.min(L.wW-W,tx))-cam.x)*0.11;
  cam.y+=(Math.max(0,Math.min(L.wH-H,ty))-cam.y)*0.11;
}
function stepParticles(){ particles.forEach(p=>{p.x+=p.vx;p.y+=p.vy;p.vy+=0.2;p.life-=0.02;}); particles=particles.filter(p=>p.life>0); }

function damageEnemy(e,dmg,src){ e.hp-=dmg; e.flash=6; S.hit(); shake=Math.max(shake,5);
  e.vx += (e.x < (src.x+src.w/2) ? -3 : 3); burst(e.x+e.w/2,e.y+e.h/2,8,4,'200,240,230');
  // recoil player
  if(src.dir==='side') player.vx += (player.face>0?-3:3);
  if(e.hp<=0){ e.alive=false; geo+=6; burst(e.x+e.w/2,e.y+e.h/2,18,5,'170,235,215'); S.geo(); } }

function damageBoss(dmg,src){ boss.hp-=dmg; boss.flash=6; S.bosshit(); shake=Math.max(shake,6);
  burst(boss.x+boss.w/2,boss.y+boss.h/2,10,4,'220,150,240');
  if(src.dir==='side') player.vx += (player.face>0?-4:4);
  if(boss.hp<=0 && !boss.dead){ boss.dead=true; boss.defeated=true; S.bossdie(); shake=20;
    burst(boss.x+boss.w/2,boss.y+boss.h/2,40,7,'220,160,240');
    const L=levels[cur]; if(L.goal){ L.goal._show=true; } } }

// ---------------- Enemy AI ----------------
function updateEnemy(e,L,sol){
  if(e.type==='crawler'){ e.vy+=GRAV; e.x+=e.dir*1.3; e.y+=e.vy; e.onG=false;
    for(const s of sol){ if(aabb(e,s)){ if(e.vy>0){e.y=s.y-e.h;e.onG=true;e.vy=0;} else if(e.vy<0){e.y=s.y+e.h;e.vy=0;}
      else { if(e.vx===0){} } } }
    if(e.min!=null&&e.x<=e.min){e.x=e.min;e.dir=1;} if(e.max!=null&&e.x>=e.max){e.x=e.max;e.dir=-1;}
    e.vx*=0.8;
  } else if(e.type==='flyer'){ e.wob+=0.06; e.x+=e.dir*1.1;
    if(e.min!=null&&e.x<=e.min){e.x=e.min;e.dir=1;} if(e.max!=null&&e.x>=e.max){e.x=e.max;e.dir=-1;}
    e.y=e.baseY+Math.sin(e.wob)*26; e.vx*=0.85; e.x+=e.vx;
  } else if(e.type==='hopper'){ e.vy+=GRAV; e.y+=e.vy; e.onG=false; e.tmr--;
    for(const s of sol){ if(aabb(e,s)){ if(e.vy>0){e.y=s.y-e.h;e.onG=true;} else e.y=s.y+e.h; e.vy=0; } }
    if(e.onG){ e.vx*=0.8; if(e.tmr<=0){ e.tmr=70+Math.random()*40; const toP=player.x>e.x?1:-1; e.vx=toP*3.2; e.vy=-9; } }
    e.x+=e.vx;
    if(e.min!=null&&e.x<e.min){e.x=e.min;e.vx=Math.abs(e.vx);} if(e.max!=null&&e.x>e.max){e.x=e.max;e.vx=-Math.abs(e.vx);}
  } else if(e.type==='spitter'){ e.wob+=0.05; e.shootT--; e.dir=player.x>e.x?1:-1;
    if(e.shootT<=0){ e.shootT=110; const dx=player.x-e.x, dy=(player.y+10)-e.y, d=Math.hypot(dx,dy)||1;
      projs.push({x:e.x+e.w/2,y:e.y+8,vx:dx/d*3.6,vy:dy/d*3.6,w:12,h:12,life:200,dead:false,kind:'spit'}); burst(e.x+e.w/2,e.y,4,2,'190,120,220'); }
  }
}

// ---------------- Boss AI ----------------
function updateBoss(L,sol){
  const b=boss; if(b.flash>0)b.flash--; b.stateT--;
  b.phase = b.hp <= b.maxhp*0.5 ? 2 : 1;
  b.face = player.x < b.x ? -1 : 1;
  // gravity
  b.vy+=GRAV; if(b.vy>16)b.vy=16;
  // states: idle -> choose (charge / slam / volley)
  if(b.state==='idle'){ b.vx*=0.9;
    if(b.stateT<=0){ const r=Math.random(); b.state = r<0.4?'charge': r<0.72?'slam':'volley'; b.stateT = b.state==='charge'?70:(b.state==='slam'?50:60); if(b.state==='slam'){ b.vy=-14; } }
  } else if(b.state==='charge'){ const spd=b.phase===2?5.2:3.8; b.vx += b.face*0.5; b.vx=Math.max(-spd,Math.min(spd,b.vx));
    if(b.stateT<=0){ b.state='idle'; b.stateT=b.phase===2?40:70; }
  } else if(b.state==='slam'){ b.vx*=0.96;
    if(b.onG && b.vy===0 && b.stateT<40){ // landed -> shockwave
      b.shockwaves.push({x:b.x+b.w/2,r:10,life:1,dir:-1}); b.shockwaves.push({x:b.x+b.w/2,r:10,life:1,dir:1});
      S.bosshit(); shake=12; b.state='idle'; b.stateT=b.phase===2?40:70; }
  } else if(b.state==='volley'){ b.vx*=0.9;
    if(b.stateT===30||b.stateT===18||b.stateT===6){ const n=b.phase===2?5:3;
      for(let i=0;i<n;i++){ const ang=-Math.PI/2 + (i-(n-1)/2)*0.4; projs.push({x:b.x+b.w/2,y:b.y+20,vx:Math.cos(ang)*3.4+b.face*0.6,vy:Math.sin(ang)*3.4,w:14,h:14,life:220,dead:false,kind:'boss'}); } }
    if(b.stateT<=0){ b.state='idle'; b.stateT=b.phase===2?36:64; }
  }
  b.x+=b.vx; b.y+=b.vy; b.onG=false;
  for(const s of sol){ if(aabb(b,s)){ if(b.vy>0){b.y=s.y-b.h;b.onG=true;} else if(b.vy<0)b.y=s.y+b.h; b.vy=0; }
  }
  // walls
  if(b.x<70){b.x=70;b.vx=Math.abs(b.vx);} if(b.x+b.w>L.wW-70){b.x=L.wW-70-b.w;b.vx=-Math.abs(b.vx);}
  // shockwaves
  for(const w of b.shockwaves){ w.r+=6; w.life-=0.02;
    if(w.life>0 && Math.abs((player.x+player.w/2)-(w.x + w.dir*w.r))<24 && player.onG && Math.abs(player.y+player.h - (L.solids[0].y))<50){ hurtPlayer(w.x); } }
  b.shockwaves=b.shockwaves.filter(w=>w.life>0);
}

// ---------------- Cape ----------------
function updateCape(){ const p=player, back=p.x+p.w/2-p.face*7, topY=p.y+11; const seg=p.cape; seg[0].x=back; seg[0].y=topY;
  const wind=-p.face*(1.1+Math.abs(p.vx)*0.5)+Math.sin(t*0.06)*0.5, rest=7;
  for(let i=1;i<seg.length;i++){ const s=seg[i]; const vx=(s.x-s.px)*0.86, vy=(s.y-s.py)*0.86; s.px=s.x; s.py=s.y; s.x+=vx+wind*(i/seg.length); s.y+=vy+0.55; }
  for(let it=0;it<3;it++){ for(let i=1;i<seg.length;i++){ const a=seg[i-1],b=seg[i]; let dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy)||0.001,df=(d-rest)/d; b.x-=dx*df; b.y-=dy*df; } seg[0].x=back; seg[0].y=topY; } }

// ---------------- Render ----------------
function draw(){
  const L=levels[cur]; const sx=(Math.random()-.5)*shake, sy=(Math.random()-.5)*shake;
  ctx.clearRect(0,0,W,H);
  const bg=ctx.createLinearGradient(0,0,0,H); bg.addColorStop(0,'#0c2a34'); bg.addColorStop(0.5,'#0e3743'); bg.addColorStop(1,'#08202a');
  ctx.fillStyle=bg; ctx.fillRect(0,0,W,H);
  ctx.globalCompositeOperation='lighter';
  const cbg=ctx.createRadialGradient(W*0.5,H*0.4,40,W*0.5,H*0.4,560); cbg.addColorStop(0,'rgba(46,150,148,.3)'); cbg.addColorStop(1,'rgba(46,150,148,0)');
  ctx.fillStyle=cbg; ctx.fillRect(0,0,W,H); ctx.globalCompositeOperation='source-over';
  drawParallax(L);

  ctx.save(); ctx.translate(-cam.x+sx,-cam.y+sy);

  if(!rockPat)rockPat=rockTile();
  for(const s of L.solids){
    ctx.fillStyle=rockPat; ctx.fillRect(s.x,s.y,s.w,s.h);
    ctx.fillStyle='rgba(8,28,34,.5)'; ctx.fillRect(s.x,s.y,s.w,s.h);
    ctx.fillStyle='rgba(130,232,218,.5)'; ctx.fillRect(s.x,s.y,s.w,2.5);
    ctx.fillStyle='rgba(90,190,180,.14)'; ctx.fillRect(s.x,s.y+2.5,s.w,2);
    ctx.fillStyle='rgba(2,12,16,.5)'; ctx.fillRect(s.x,s.y+s.h-4,s.w,4);
    if(s.h<90){ ctx.fillStyle='#0a2028'; ctx.beginPath(); ctx.moveTo(s.x,s.y);
      for(let x=s.x;x<=s.x+s.w;x+=14)ctx.lineTo(x,s.y-3-Math.abs(Math.sin(x*0.7))*4); ctx.lineTo(s.x+s.w,s.y); ctx.closePath(); ctx.fill();
      for(let x=s.x+12;x<s.x+s.w;x+=40){ // grass tufts + glow pod
        ctx.strokeStyle='#0e343a'; ctx.lineWidth=2; for(let b=-2;b<=2;b++){ ctx.beginPath(); ctx.moveTo(x,s.y-2); ctx.lineTo(x+b*2.4,s.y-9-Math.abs(b)); ctx.stroke(); }
        if((x|0)%80<40){ ctx.fillStyle='rgba(150,240,210,.6)'; ctx.beginPath(); ctx.arc(x,s.y-10,1.6,0,6.29); ctx.fill(); } }
    }
    // hanging roots under thick rock
    if(s.h>150){ ctx.strokeStyle='rgba(8,26,30,.9)'; ctx.lineWidth=3;
      for(let x=s.x+30;x<s.x+s.w;x+=90){ const hl=14+((x*7)%22); ctx.beginPath(); ctx.moveTo(x,s.y+s.h); ctx.quadraticCurveTo(x+6,s.y+s.h+hl*0.6,x+2,s.y+s.h+hl); ctx.stroke(); } }
  }

  for(const sp of L.spikes) drawSpikes(sp);
  for(const r of (L.chains||[])) drawChain(r.x,r.y,r.h);
  for(const r of (L.ropes||[])) drawRope(r.x,r.y,r.h);
  for(const p of (L.plates||[])) drawPlate(p);
  for(const g of (L.gates||[])) drawGate(g);
  for(const c of crates) drawCrate(c);
  if(L.bench) drawBench(L.bench);
  for(const lp of (L.lamps||[])) drawLamp(lp);
  if(L.goal && L.goal._show) drawGoal(L.goal);

  for(const o of orbs){ if(o.got)continue; const r=6+Math.sin((o.ph||0))*1.6;
    const og=ctx.createRadialGradient(o.x,o.y,1,o.x,o.y,22); og.addColorStop(0,'rgba(210,245,150,.9)'); og.addColorStop(1,'rgba(210,245,150,0)');
    ctx.fillStyle=og; ctx.beginPath(); ctx.arc(o.x,o.y,22,0,6.29); ctx.fill(); ctx.fillStyle='#dff5a0'; ctx.beginPath(); ctx.arc(o.x,o.y,r,0,6.29); ctx.fill(); }

  for(const e of enemies){ if(e.alive) drawEnemy(e); }
  for(const p of projs) drawProj(p);
  if(boss&&!boss.dead) drawBoss(boss);

  for(const sl of slashes) drawSlash(sl);
  if(!player.dead||player.deadT<8) drawHero();

  // spores/particles/drips
  for(const s of spores){ const a=0.35+Math.sin(s.ph+t*0.03)*0.25; ctx.fillStyle=`rgba(170,238,218,${Math.max(0.05,a*0.4)})`; ctx.beginPath(); ctx.arc(s.x,s.y,s.r+1.6,0,6.29); ctx.fill(); ctx.fillStyle=`rgba(232,255,246,${Math.max(0.1,a)})`; ctx.beginPath(); ctx.arc(s.x,s.y,s.r*0.6,0,6.29); ctx.fill(); }
  for(const p of particles){ ctx.fillStyle=`rgba(${p.col},${p.life})`; ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,6.29); ctx.fill(); }
  ctx.strokeStyle='rgba(150,214,222,.5)'; ctx.lineWidth=1.4;
  for(const d of drips){ if(d.wait<=0){ ctx.beginPath(); ctx.moveTo(d.x,d.y); ctx.lineTo(d.x,d.y+6); ctx.stroke(); } }

  ctx.restore();

  // additive glow
  ctx.globalCompositeOperation='lighter';
  const g=(wx,wy,rad,r,gg,b,a)=>{ const px=wx-cam.x+sx,py=wy-cam.y+sy; if(px<-rad||px>W+rad||py<-rad||py>H+rad)return;
    const gr=ctx.createRadialGradient(px,py,2,px,py,rad); gr.addColorStop(0,`rgba(${r},${gg},${b},${a})`); gr.addColorStop(1,`rgba(${r},${gg},${b},0)`); ctx.fillStyle=gr; ctx.beginPath(); ctx.arc(px,py,rad,0,6.29); ctx.fill(); };
  for(const lp of (L.lamps||[])){ const fl=0.85+Math.sin(t*0.08+lp.x)*0.12; g(lp.x,lp.y-16,120*fl,150,240,224,0.4); }
  g(player.x+player.w/2,player.y+player.h/2,140,150,225,220,0.24);
  if(L.goal&&L.goal._show) g(L.goal.x+L.goal.w/2,L.goal.y+L.goal.h/2,150,140,240,210,0.4+Math.sin(t*0.08)*0.08);
  for(const o of orbs){ if(!o.got)g(o.x,o.y,40,210,245,150,0.35); }
  if(boss&&!boss.dead)g(boss.x+boss.w/2,boss.y+boss.h/2,120,220,150,240,0.3);
  ctx.globalCompositeOperation='source-over';

  const vg=ctx.createRadialGradient(W/2,H*0.44,H*0.44,W/2,H*0.5,H*0.98); vg.addColorStop(0,'rgba(4,18,22,0)'); vg.addColorStop(1,'rgba(4,16,20,.55)');
  ctx.fillStyle=vg; ctx.fillRect(0,0,W,H);
  if(flash>0){ ctx.fillStyle=`rgba(230,90,90,${flash/10*0.25})`; ctx.fillRect(0,0,W,H); }

  drawUI(L);
  if(levelIntro>0){ const a=Math.min(1,levelIntro/110)*(levelIntro>70?(110-levelIntro)/40:1); ctx.save(); ctx.globalAlpha=Math.max(0,Math.min(1,a));
    ctx.fillStyle='#eaf4f1'; ctx.font='300 32px Georgia,serif'; ctx.textAlign='center'; ctx.shadowColor='rgba(120,224,210,.7)'; ctx.shadowBlur=22;
    ctx.fillText(L.name.replace('·','—'),W/2,H/2); ctx.restore(); }
  if(player.dead){ ctx.fillStyle=`rgba(6,22,26,${Math.min(0.6,(player.deadT||0)/60)})`; ctx.fillRect(0,0,W,H);
    ctx.fillStyle='#cfe8e2'; ctx.font='300 26px Georgia,serif'; ctx.textAlign='center'; ctx.fillText('gefallen …',W/2,H/2); }
}

// ---- UI ----
function drawUI(L){
  // masks
  for(let i=0;i<MAXMASK;i++){ const x=16+i*26, y=16; ctx.save(); ctx.translate(x,y);
    ctx.fillStyle=i<masks?'#eaf3ef':'rgba(60,90,90,.45)'; ctx.strokeStyle='#0a2228'; ctx.lineWidth=2;
    ctx.beginPath(); ctx.moveTo(0,4); ctx.quadraticCurveTo(0,-4,7,-4); ctx.quadraticCurveTo(14,-4,14,4); ctx.quadraticCurveTo(14,10,7,15); ctx.quadraticCurveTo(0,10,0,4); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore(); }
  // geo
  ctx.fillStyle='#bfe0da'; ctx.font='16px Georgia,serif'; ctx.textAlign='left';
  ctx.fillText('◈ '+geo, 18, 54);
  // boss health bar
  if(boss&&!boss.dead){ const bw=Math.min(W-160,520), bx=(W-bw)/2, by=H-30;
    ctx.fillStyle='rgba(4,16,20,.7)'; ctx.fillRect(bx-2,by-2,bw+4,14);
    ctx.fillStyle='rgba(120,224,210,.25)'; ctx.fillRect(bx,by,bw,10);
    ctx.fillStyle='#a55fd0'; ctx.fillRect(bx,by,bw*Math.max(0,boss.hp/boss.maxhp),10);
    ctx.fillStyle='#cfe8e2'; ctx.font='11px Georgia,serif'; ctx.textAlign='center'; ctx.fillText('DER HÜTER', W/2, by-8); }
}

// ---- parallax ----
function drawParallax(L){
  if(spr('bg_far')||spr('bg_mid')||spr('bg_near')){
    ctx.fillStyle='#0a2530'; ctx.fillRect(0,0,W,H);
    tileLayer(spr('bg_far'),0.15); tileLayer(spr('bg_mid'),0.4); tileLayer(spr('bg_near'),0.7);
    return;
  }
  ctx.save();
  const fw=ctx.createLinearGradient(0,0,0,H); fw.addColorStop(0,'rgba(20,74,80,.4)'); fw.addColorStop(1,'rgba(8,30,38,.5)');
  ctx.fillStyle=fw; ctx.fillRect(0,0,W,H);
  // distant arches
  const ax=-cam.x*0.14; ctx.strokeStyle='rgba(30,96,100,.45)'; ctx.lineWidth=10; ctx.lineCap='round';
  for(let i=-1;i<8;i++){ const bx=((i*210+ax)%(W+420))-210, by=H*0.16;
    ctx.beginPath(); ctx.moveTo(bx,by+190); ctx.lineTo(bx,by+44); ctx.arc(bx+42,by+44,42,Math.PI,0); ctx.lineTo(bx+84,by+190); ctx.stroke(); }
  // giant mushrooms (mid-far)
  const mx=-cam.x*0.26; ctx.fillStyle='rgba(16,60,64,.55)';
  for(let i=-1;i<7;i++){ const bx=((i*300+mx)%(W+600))-300; mushroom(bx,H*0.72,70,120); }
  // god ray
  ctx.globalCompositeOperation='lighter'; const rg=ctx.createLinearGradient(W*0.62,0,W*0.42,H); rg.addColorStop(0,'rgba(120,220,200,.1)'); rg.addColorStop(1,'rgba(120,220,200,0)');
  ctx.fillStyle=rg; ctx.beginPath(); ctx.moveTo(W*0.5,0); ctx.lineTo(W*0.78,0); ctx.lineTo(W*0.5,H); ctx.lineTo(W*0.28,H); ctx.closePath(); ctx.fill(); ctx.globalCompositeOperation='source-over';
  // mid flora
  const fx=-cam.x*0.42; ctx.fillStyle='rgba(9,40,46,.7)';
  for(let i=-1;i<10;i++){ const bx=((i*150+fx)%(W+300))-150; leaf(bx,H,58,210); leaf(bx+56,H,42,160); }
  // near flora dark
  const nx=-cam.x*0.72; ctx.fillStyle='rgba(4,22,26,.9)';
  for(let i=-1;i<9;i++){ const bx=((i*190+nx)%(W+380))-190; leaf(bx,H+12,92,260); }
  ctx.restore();
}
function leaf(x,by,w,h){ ctx.beginPath(); ctx.moveTo(x,by); ctx.quadraticCurveTo(x-w*0.6,by-h*0.5,x,by-h); ctx.quadraticCurveTo(x+w*0.6,by-h*0.5,x,by); ctx.fill(); }
function mushroom(x,by,w,h){ ctx.beginPath(); ctx.rect(x-6,by-h*0.6,12,h*0.6); ctx.fill(); ctx.beginPath(); ctx.ellipse(x,by-h*0.6,w*0.5,h*0.28,0,Math.PI,0); ctx.fill(); }

// ---- entity draws ----
function drawSpikes(sp){ const n=Math.max(1,Math.floor(sp.w/22)),bw=sp.w/n; ctx.fillStyle='#081c22';
  for(let i=0;i<n;i++){ const x=sp.x+i*bw; ctx.beginPath(); ctx.moveTo(x,sp.y+sp.h); ctx.lineTo(x+bw/2,sp.y-4); ctx.lineTo(x+bw,sp.y+sp.h); ctx.closePath(); ctx.fill();
    ctx.strokeStyle='rgba(150,220,210,.3)'; ctx.lineWidth=1; ctx.beginPath(); ctx.moveTo(x+bw/2,sp.y-2); ctx.lineTo(x+bw*0.66,sp.y+sp.h*0.5); ctx.stroke(); } }
function drawChain(x,y,h){ for(let i=0;i<h;i+=16){ const yy=y+i,hz=(i/16)%2===0; ctx.strokeStyle='#4a6a70'; ctx.lineWidth=3; ctx.beginPath(); ctx.ellipse(x,yy+8,hz?4:7,hz?9:6,0,0,6.29); ctx.stroke(); ctx.strokeStyle='rgba(180,230,224,.2)'; ctx.lineWidth=1; ctx.beginPath(); ctx.ellipse(x-1,yy+7,hz?3:6,hz?8:5,0,0,3.1); ctx.stroke(); } }
function drawRope(x,y,h){ ctx.strokeStyle='#3f5a44'; ctx.lineWidth=5; ctx.beginPath(); for(let i=0;i<=h;i+=8)ctx.lineTo(x+Math.sin((y+i)*0.05)*1.5,y+i); ctx.stroke(); ctx.strokeStyle='rgba(140,200,150,.3)'; ctx.lineWidth=1.5; for(let i=0;i<h;i+=7){ ctx.beginPath(); ctx.moveTo(x-3,y+i); ctx.lineTo(x+3,y+i+3); ctx.stroke(); } }
function drawPlate(p){ ctx.fillStyle=p.pressed?'#0d3a3a':'#12262c'; ctx.fillRect(p.x,p.y+(p.pressed?4:0),p.w,p.h-(p.pressed?4:0)); ctx.strokeStyle='#1c4a48'; ctx.lineWidth=2; ctx.strokeRect(p.x,p.y+(p.pressed?4:0),p.w,p.h-(p.pressed?4:0)); ctx.fillStyle=p.pressed?'rgba(150,240,210,.9)':'rgba(60,150,140,.6)'; ctx.beginPath(); ctx.arc(p.x+p.w/2,p.y+p.h/2+(p.pressed?3:0),5,0,6.29); ctx.fill(); }
function drawGate(g){ const open=g.open,sh=g.h*(1-open); ctx.fillStyle='#0a2028'; ctx.fillRect(g.x-4,g.y-6,g.w+8,6); ctx.fillStyle='#1a3a40'; ctx.strokeStyle='#0c2228'; ctx.lineWidth=2; const bars=3,bw=g.w/bars; for(let i=0;i<bars;i++){ const bx=g.x+i*bw+2; ctx.fillRect(bx,g.y,bw-4,sh); ctx.strokeRect(bx,g.y,bw-4,sh); } ctx.fillStyle='#0e2a30'; for(let yy=g.y+20;yy<g.y+sh-8;yy+=44)ctx.fillRect(g.x,yy,g.w,7); ctx.fillStyle='#081c22'; for(let i=0;i<bars;i++){ const bx=g.x+i*bw+bw/2; ctx.beginPath(); ctx.moveTo(bx-bw/2+3,g.y+sh); ctx.lineTo(bx,g.y+sh+8); ctx.lineTo(bx+bw/2-3,g.y+sh); ctx.closePath(); ctx.fill(); } }
function drawCrate(c){ ctx.fillStyle='#2c3a26'; ctx.fillRect(c.x,c.y,c.w,c.h); ctx.strokeStyle='#1a2416'; ctx.lineWidth=2; for(let i=1;i<3;i++){ ctx.beginPath(); ctx.moveTo(c.x,c.y+i*c.h/3); ctx.lineTo(c.x+c.w,c.y+i*c.h/3); ctx.stroke(); } ctx.strokeRect(c.x+1,c.y+1,c.w-2,c.h-2); ctx.fillStyle='#12201a'; ctx.fillRect(c.x,c.y+8,c.w,4); ctx.fillRect(c.x,c.y+c.h-12,c.w,4); ctx.fillStyle='rgba(120,200,150,.15)'; ctx.fillRect(c.x,c.y,c.w,2); ctx.fillStyle='rgba(150,240,210,.5)'; ctx.beginPath(); ctx.arc(c.x+c.w/2,c.y+c.h/2,2,0,6.29); ctx.fill(); }
function drawBench(bn){ ctx.save(); ctx.fillStyle='#173840'; ctx.fillRect(bn.x,bn.y+18,48,8); ctx.fillRect(bn.x+4,bn.y+26,6,16); ctx.fillRect(bn.x+38,bn.y+26,6,16); ctx.fillRect(bn.x,bn.y+2,48,8); ctx.strokeStyle='rgba(150,240,220,.6)'; ctx.lineWidth=1.5; ctx.strokeRect(bn.x,bn.y+18,48,8);
  const gl=ctx.createRadialGradient(bn.x+24,bn.y+14,2,bn.x+24,bn.y+14,30); gl.addColorStop(0,'rgba(150,240,220,.25)'); gl.addColorStop(1,'rgba(150,240,220,0)'); ctx.fillStyle=gl; ctx.beginPath(); ctx.arc(bn.x+24,bn.y+14,30,0,6.29); ctx.fill(); ctx.restore(); }
function drawLamp(lp){ ctx.strokeStyle='#0a2228'; ctx.lineWidth=3; ctx.beginPath(); ctx.moveTo(lp.x,lp.y-30); ctx.lineTo(lp.x,lp.y-18); ctx.stroke(); ctx.fillStyle='#0c2830'; ctx.beginPath(); ctx.arc(lp.x,lp.y-16,7,0,6.29); ctx.fill(); const pl=0.8+Math.sin(t*0.08+lp.x)*0.12; const fg=ctx.createRadialGradient(lp.x,lp.y-16,1,lp.x,lp.y-16,14*pl); fg.addColorStop(0,'rgba(220,255,246,.95)'); fg.addColorStop(0.5,'rgba(120,235,214,.7)'); fg.addColorStop(1,'rgba(90,210,190,0)'); ctx.fillStyle=fg; ctx.beginPath(); ctx.arc(lp.x,lp.y-16,14*pl,0,6.29); ctx.fill(); ctx.fillStyle='#eafff8'; ctx.beginPath(); ctx.arc(lp.x,lp.y-16,3,0,6.29); ctx.fill(); }
function drawGoal(G){ const pulse=0.5+Math.sin(t*0.08)*0.2; const gg=ctx.createLinearGradient(G.x,G.y,G.x,G.y+G.h); gg.addColorStop(0,`rgba(190,255,240,${0.35+pulse*0.4})`); gg.addColorStop(1,'rgba(60,150,140,0)'); ctx.fillStyle=gg; ctx.beginPath(); ctx.moveTo(G.x,G.y+G.h); ctx.lineTo(G.x,G.y+26); ctx.quadraticCurveTo(G.x,G.y,G.x+G.w/2,G.y); ctx.quadraticCurveTo(G.x+G.w,G.y,G.x+G.w,G.y+26); ctx.lineTo(G.x+G.w,G.y+G.h); ctx.closePath(); ctx.fill(); ctx.strokeStyle='rgba(150,236,220,.8)'; ctx.lineWidth=2.5; ctx.beginPath(); ctx.moveTo(G.x,G.y+G.h); ctx.lineTo(G.x,G.y+26); ctx.quadraticCurveTo(G.x,G.y,G.x+G.w/2,G.y); ctx.quadraticCurveTo(G.x+G.w,G.y,G.x+G.w,G.y+26); ctx.lineTo(G.x+G.w,G.y+G.h); ctx.stroke(); for(let i=0;i<4;i++){ const ey=G.y+G.h-((t*1.2+i*34)%G.h); ctx.fillStyle='rgba(220,255,246,.7)'; ctx.beginPath(); ctx.arc(G.x+G.w/2+Math.sin(ey*0.08+i)*10,ey,1.6,0,6.29); ctx.fill(); } }
function drawProj(p){ ctx.save(); const col=p.kind==='boss'?'220,150,240':'190,130,220'; const gr=ctx.createRadialGradient(p.x+p.w/2,p.y+p.h/2,1,p.x+p.w/2,p.y+p.h/2,p.w); gr.addColorStop(0,`rgba(${col},.95)`); gr.addColorStop(1,`rgba(${col},0)`); ctx.fillStyle=gr; ctx.beginPath(); ctx.arc(p.x+p.w/2,p.y+p.h/2,p.w,0,6.29); ctx.fill(); ctx.fillStyle='#f0e6ff'; ctx.beginPath(); ctx.arc(p.x+p.w/2,p.y+p.h/2,p.w*0.35,0,6.29); ctx.fill(); ctx.restore(); }
function drawSlash(sl){ ctx.save(); const a=sl.life/ATK_LIFE; ctx.strokeStyle=`rgba(225,255,248,${a*0.9})`; ctx.lineWidth=4; ctx.lineCap='round';
  if(sl.dir==='side'){ const cx=sl.x+ (player.face>0?4:sl.w-4), cy=sl.y+sl.h/2; ctx.beginPath(); ctx.arc(cx,cy,26,player.face>0?-0.9:Math.PI-0.9,player.face>0?0.9:Math.PI+0.9); ctx.stroke(); }
  else if(sl.dir==='up'){ ctx.beginPath(); ctx.arc(sl.x+sl.w/2,sl.y+sl.h,24,-Math.PI*0.85,-Math.PI*0.15); ctx.stroke(); }
  else { ctx.beginPath(); ctx.arc(sl.x+sl.w/2,sl.y,24,Math.PI*0.15,Math.PI*0.85); ctx.stroke(); }
  ctx.restore(); }
function drawEnemy(e){
  const si=spr('enemy_'+e.type);
  if(si){ if(e.flash>0)ctx.globalAlpha=0.6; drawSpriteAt(si, e.x+e.w/2, e.y+e.h+2, e.dir||1, e.h*1.75); ctx.globalAlpha=1; return; }
  ctx.save(); ctx.translate(e.x+e.w/2,e.y+e.h/2); const fl=e.flash>0; const body=fl?'#eafff6':'#0b2a30';
  if(e.type==='crawler'){ ctx.fillStyle=body; ctx.beginPath(); ctx.ellipse(0,0,e.w/2,e.h/2,0,0,6.29); ctx.fill(); ctx.fillStyle=fl?'#0b2a30':'rgba(120,220,206,.14)'; ctx.beginPath(); ctx.ellipse(-2,-2,e.w/2-4,e.h/2-4,0,0,6.29); ctx.fill(); ctx.strokeStyle=body; ctx.lineWidth=3; for(let i=-1;i<=1;i+=2){ ctx.beginPath(); ctx.moveTo(i*9,e.h/2-2); ctx.lineTo(i*9+Math.sin(e.wob+i)*3,e.h/2+8); ctx.stroke(); } ctx.fillStyle='#e6fff7'; ctx.beginPath(); ctx.arc(-e.dir*4,-2,2.4,0,6.29); ctx.fill(); ctx.beginPath(); ctx.arc(-e.dir*4+e.dir*7,-2,2.4,0,6.29); ctx.fill(); }
  else if(e.type==='flyer'){ ctx.fillStyle=body; ctx.beginPath(); ctx.ellipse(0,0,e.w/2,e.h/2*0.8,0,0,6.29); ctx.fill(); const wf=Math.sin(t*0.4)*6; ctx.fillStyle=fl?'#0b2a30':'rgba(150,235,220,.5)'; ctx.beginPath(); ctx.ellipse(-e.w/2,0,10,4+wf*0.3,0.5,0,6.29); ctx.fill(); ctx.beginPath(); ctx.ellipse(e.w/2,0,10,4+wf*0.3,-0.5,0,6.29); ctx.fill(); ctx.fillStyle='#e6fff7'; ctx.beginPath(); ctx.arc(0,-2,2.6,0,6.29); ctx.fill(); }
  else if(e.type==='hopper'){ ctx.fillStyle=body; ctx.beginPath(); ctx.arc(0,0,e.w/2,0,6.29); ctx.fill(); ctx.fillStyle='#081c22'; for(let i=-1;i<=1;i++){ ctx.beginPath(); ctx.moveTo(i*7-2,-e.h/2+4); ctx.lineTo(i*7,-e.h/2-6); ctx.lineTo(i*7+2,-e.h/2+4); ctx.closePath(); ctx.fill(); } ctx.fillStyle='#e6fff7'; ctx.beginPath(); ctx.arc(-e.dir*5,-1,2.6,0,6.29); ctx.fill(); ctx.beginPath(); ctx.arc(-e.dir*5+e.dir*8,-1,2.6,0,6.29); ctx.fill(); }
  else if(e.type==='spitter'){ ctx.fillStyle=body; ctx.beginPath(); ctx.moveTo(0,-e.h/2); ctx.lineTo(e.w/2,e.h/2); ctx.lineTo(-e.w/2,e.h/2); ctx.closePath(); ctx.fill(); ctx.fillStyle='#a55fd0'; ctx.beginPath(); ctx.arc(e.dir*6,0,4,0,6.29); ctx.fill(); ctx.fillStyle='#e6fff7'; ctx.beginPath(); ctx.arc(-4,-4,2,0,6.29); ctx.fill(); ctx.beginPath(); ctx.arc(4,-4,2,0,6.29); ctx.fill(); }
  ctx.restore(); }
function drawBoss(b){
  if(spr('boss')){
    for(const w of b.shockwaves){ const gy=levels[cur].solids[0].y; ctx.strokeStyle=`rgba(220,160,240,${w.life})`; ctx.lineWidth=4; ctx.beginPath(); ctx.arc(w.x+w.dir*w.r,gy,10,0,6.29); ctx.stroke(); }
    if(b.flash>0)ctx.globalAlpha=0.7; drawSpriteAt(spr('boss'), b.x+b.w/2, b.y+b.h+2, b.face, b.h*1.5); ctx.globalAlpha=1;
    return;
  }
  ctx.save(); ctx.translate(b.x+b.w/2,b.y+b.h/2); const fl=b.flash>0;
  // shockwaves
  ctx.restore();
  for(const w of b.shockwaves){ const L=levels[cur]; const gy=L.solids[0].y; ctx.strokeStyle=`rgba(220,160,240,${w.life})`; ctx.lineWidth=4; ctx.beginPath(); ctx.arc(w.x+w.dir*w.r,gy,10,0,6.29); ctx.stroke(); }
  ctx.save(); ctx.translate(b.x+b.w/2,b.y+b.h/2);
  const body=fl?'#f3e6ff':'#241830';
  // cloak
  ctx.fillStyle=body; ctx.beginPath(); ctx.moveTo(-b.w/2,b.h/2); ctx.quadraticCurveTo(-b.w/2-6,-b.h/2,0,-b.h/2); ctx.quadraticCurveTo(b.w/2+6,-b.h/2,b.w/2,b.h/2); ctx.closePath(); ctx.fill();
  ctx.fillStyle=fl?'#241830':'rgba(120,70,160,.25)'; ctx.beginPath(); ctx.ellipse(0,-6,b.w/2-8,b.h/2-10,0,0,6.29); ctx.fill();
  // horns
  ctx.fillStyle='#e9ddf5'; ctx.beginPath(); ctx.moveTo(-14,-b.h/2+8); ctx.quadraticCurveTo(-30,-b.h/2-16,-24,-b.h/2-26); ctx.quadraticCurveTo(-16,-b.h/2-6,-6,-b.h/2+6); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(14,-b.h/2+8); ctx.quadraticCurveTo(30,-b.h/2-16,24,-b.h/2-26); ctx.quadraticCurveTo(16,-b.h/2-6,6,-b.h/2+6); ctx.closePath(); ctx.fill();
  // pale mask
  ctx.fillStyle='#eee3f7'; ctx.beginPath(); ctx.ellipse(b.face*3,-b.h/2+22,15,18,0,0,6.29); ctx.fill();
  // glowing eyes
  ctx.fillStyle='#c060ff'; ctx.shadowColor='#c060ff'; ctx.shadowBlur=10;
  ctx.beginPath(); ctx.ellipse(b.face*3-5,-b.h/2+20,2.4,4.5,0,0,6.29); ctx.fill(); ctx.beginPath(); ctx.ellipse(b.face*3+5,-b.h/2+20,2.4,4.5,0,0,6.29); ctx.fill(); ctx.shadowBlur=0;
  // charge tell
  if(b.state==='charge'){ ctx.strokeStyle='rgba(200,100,255,.5)'; ctx.lineWidth=2; ctx.beginPath(); ctx.arc(0,0,b.w/2+6,0,6.29); ctx.stroke(); }
  ctx.restore(); }
function drawHero(){ const p=player, cx=p.x+p.w/2, feet=p.y+p.h;
  if(p.iframe>0 && Math.floor(p.iframe/4)%2===0){ return; } // flicker while hurt
  // painted sprite path (if art present)
  if(spr('hero_idle')){
    let img=spr('hero_idle');
    if(p.atkT>0&&spr('hero_attack'))img=spr('hero_attack');
    else if(!p.onG&&spr('hero_jump'))img=spr('hero_jump');
    else if(Math.abs(p.vx)>0.4&&p.onG&&spr('hero_run'))img=spr('hero_run');
    drawSpriteAt(img, cx, feet+2, p.face, p.h*1.85);
    return;
  }
  const seg=p.cape; ctx.save();
  ctx.beginPath(); ctx.moveTo(seg[0].x,seg[0].y);
  for(let i=1;i<seg.length;i++){ const w=9*(1-i/seg.length)+2; const dx=seg[i].x-seg[i-1].x,dy=seg[i].y-seg[i-1].y,d=Math.hypot(dx,dy)||1; ctx.lineTo(seg[i].x-dy/d*w,seg[i].y+dx/d*w); }
  for(let i=seg.length-1;i>=1;i--){ const w=9*(1-i/seg.length)+2; const dx=seg[i].x-seg[i-1].x,dy=seg[i].y-seg[i-1].y,d=Math.hypot(dx,dy)||1; ctx.lineTo(seg[i].x+dy/d*w,seg[i].y-dx/d*w); }
  ctx.closePath(); const cg=ctx.createLinearGradient(seg[0].x,seg[0].y,seg[seg.length-1].x,seg[seg.length-1].y); cg.addColorStop(0,'#123a3e'); cg.addColorStop(1,'#061c20'); ctx.fillStyle=cg; ctx.fill(); ctx.restore();

  ctx.save();
  if(p.onG){ ctx.fillStyle='rgba(0,0,0,.3)'; ctx.beginPath(); ctx.ellipse(cx,feet+2,p.w*0.7,4,0,0,6.29); ctx.fill(); }
  const moving=Math.abs(p.vx)>0.4&&p.onG, stride=Math.sin(p.walk)*7, up=Math.abs(Math.cos(p.walk))*3;
  ctx.strokeStyle='#08181c'; ctx.fillStyle='#08181c'; ctx.lineCap='round'; ctx.lineWidth=5;
  if(climbing){ ctx.beginPath(); ctx.moveTo(cx-4,feet-14); ctx.lineTo(cx-5,feet); ctx.stroke(); ctx.beginPath(); ctx.moveTo(cx+4,feet-14); ctx.lineTo(cx+5,feet-6); ctx.stroke(); }
  else if(moving){ ctx.beginPath(); ctx.moveTo(cx,feet-14); ctx.lineTo(cx+stride,feet); ctx.stroke(); ctx.beginPath(); ctx.moveTo(cx,feet-14); ctx.lineTo(cx-stride,feet-up); ctx.stroke(); }
  else { ctx.beginPath(); ctx.moveTo(cx-4,feet-14); ctx.lineTo(cx-4,feet); ctx.stroke(); ctx.beginPath(); ctx.moveTo(cx+4,feet-14); ctx.lineTo(cx+4,feet); ctx.stroke(); }
  ctx.lineWidth=9; ctx.beginPath(); ctx.moveTo(cx,feet-14); ctx.lineTo(cx,p.y+13); ctx.stroke();
  ctx.fillStyle='#08181c'; ctx.beginPath(); ctx.moveTo(cx-8,p.y+14); ctx.lineTo(cx-13,p.y+8); ctx.lineTo(cx-5,p.y+12); ctx.closePath(); ctx.fill(); ctx.beginPath(); ctx.moveTo(cx+8,p.y+14); ctx.lineTo(cx+13,p.y+8); ctx.lineTo(cx+5,p.y+12); ctx.closePath(); ctx.fill();
  ctx.lineWidth=4;
  // arm holds nail; swing on attack
  const atk=p.atkT>0;
  if(atk){ ctx.strokeStyle='#08181c'; ctx.beginPath(); ctx.moveTo(cx,p.y+18); ctx.lineTo(cx+p.face*14,p.y+16); ctx.stroke();
    ctx.strokeStyle='#cfe0dc'; ctx.lineWidth=3; ctx.beginPath(); ctx.moveTo(cx+p.face*14,p.y+16); ctx.lineTo(cx+p.face*30,p.y+8); ctx.stroke(); ctx.lineWidth=4; ctx.strokeStyle='#08181c'; }
  else if(climbing){ ctx.beginPath(); ctx.moveTo(cx,p.y+18); ctx.lineTo(cx+6,p.y+8); ctx.stroke(); ctx.beginPath(); ctx.moveTo(cx,p.y+18); ctx.lineTo(cx-6,p.y+8); ctx.stroke(); }
  else if(!p.onG){ ctx.beginPath(); ctx.moveTo(cx,p.y+18); ctx.lineTo(cx+p.face*9,p.y+11); ctx.stroke(); ctx.beginPath(); ctx.moveTo(cx,p.y+18); ctx.lineTo(cx-p.face*7,p.y+15); ctx.stroke(); }
  else { const sw=moving?Math.sin(p.walk)*6:0; ctx.beginPath(); ctx.moveTo(cx,p.y+18); ctx.lineTo(cx+p.face*4+sw,p.y+27); ctx.stroke(); ctx.beginPath(); ctx.moveTo(cx,p.y+18); ctx.lineTo(cx-p.face*4-sw,p.y+27); ctx.stroke(); }
  // head
  ctx.fillStyle='#08181c'; ctx.beginPath(); ctx.arc(cx,p.y+7,9.5,0,6.29); ctx.fill();
  ctx.fillStyle='#e9f2ee'; ctx.beginPath(); ctx.moveTo(cx-5,p.y+1); ctx.quadraticCurveTo(cx-12,p.y-6,cx-10,p.y-11); ctx.quadraticCurveTo(cx-6,p.y-5,cx-2,p.y-1); ctx.closePath(); ctx.fill(); ctx.beginPath(); ctx.moveTo(cx+5,p.y+1); ctx.quadraticCurveTo(cx+12,p.y-6,cx+10,p.y-11); ctx.quadraticCurveTo(cx+6,p.y-5,cx+2,p.y-1); ctx.closePath(); ctx.fill();
  ctx.fillStyle='#eaf3ef'; ctx.beginPath(); ctx.ellipse(cx+p.face*1.5,p.y+7,6.2,7.3,0,0,6.29); ctx.fill();
  ctx.fillStyle='#0a1a1e'; if(p.blink>7){ ctx.beginPath(); ctx.ellipse(cx+p.face*1.5-2.4,p.y+6.5,1.5,2.7,0,0,6.29); ctx.fill(); ctx.beginPath(); ctx.ellipse(cx+p.face*1.5+2.4,p.y+6.5,1.5,2.7,0,0,6.29); ctx.fill(); } else ctx.fillRect(cx+p.face*1.5-4,p.y+6,8,1.3);
  ctx.restore(); }

// ---------------- Loop ----------------
let last=0,acc=0;
function frame(ts){ const dt=Math.min(50,ts-last); last=ts; acc+=dt; let st=0; while(acc>=16.6667&&st<5){ update(); acc-=16.6667; st++; } if(cur<levels.length&&player) draw(); requestAnimationFrame(frame); }

function showWin(){ overlay.classList.remove('hide'); ovTitle.textContent='Silmoor befreit'; ovSub.innerHTML='Der Hüter ist gefallen. Das hohle Wesen steht im stillen Licht des Grundes.<br>Gesammeltes Geo: '+geo; startBtn.textContent='Neu erwachen'; }
startBtn.addEventListener('click',()=>{ ensureAudio(); if(actx&&actx.state==='suspended')actx.resume();
  if(winShow){ winShow=false; cur=0; geo=0; masks=MAXMASK; checkpoint=null; }
  loadLevel(cur,false); running=true; overlay.classList.add('hide'); });

loadLevel(0,false);
requestAnimationFrame(frame);
})();
