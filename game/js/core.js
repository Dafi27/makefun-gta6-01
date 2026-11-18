/* Palmera Bay — core: shared game state, utilities, input, seeded random.
   Every other module reads and writes the single global G object. */
(function () {
  'use strict';

  // Seeded random so the city is identical on every load (deterministic build).
  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function dist2(ax, az, bx, bz) { var dx = ax - bx, dz = az - bz; return dx * dx + dz * dz; }
  function angleLerp(a, b, t) {
    var d = b - a;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return a + d * t;
  }
  function angleDiff(a, b) {
    var d = b - a;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return d;
  }

  // City layout constants (shared by city, traffic, minimap, missions).
  var CITY = {
    pitch: 40,        // distance between road centre lines
    roadW: 11,        // road width
    half: 190,        // city extends -190..190 on both axes
    roadCount: 10,    // roads at -180, -140, ... 180
    beachZ: 168,      // south of this is sand, then water
    roads: []         // filled by city.js: road centre coordinates
  };
  for (var i = 0; i < CITY.roadCount; i++) CITY.roads.push(-180 + i * CITY.pitch);

  function nearestRoadCoord(v) {
    var best = CITY.roads[0], bd = Math.abs(v - best);
    for (var i = 1; i < CITY.roads.length; i++) {
      var d = Math.abs(v - CITY.roads[i]);
      if (d < bd) { bd = d; best = CITY.roads[i]; }
    }
    return best;
  }
  function isOnRoad(x, z) {
    var hw = CITY.roadW / 2 + 1;
    for (var i = 0; i < CITY.roads.length; i++) {
      if (Math.abs(x - CITY.roads[i]) < hw) return true;
      if (Math.abs(z - CITY.roads[i]) < hw) return true;
    }
    return false;
  }

  var G = {
    // three.js
    scene: null, camera: null, renderer: null, clock: null,
    // game state: 'menu' | 'playing' | 'paused' | 'busted' | 'wasted' | 'complete'
    state: 'menu',
    time: 0,           // seconds since game start
    clockMinutes: 10 * 60 + 24, // in-world clock, starts 10:24
    rng: mulberry32(1337),
    // player
    player: null,      // {group, pos:Vector3, heading, speed, health, onFoot, car, ...}
    cash: 0,
    wanted: 0,
    wantedHeat: 0,     // 0..1, builds while police see the player
    wantedQuiet: 0,    // seconds since any police saw the player
    ammo: 12, magSize: 12, reserve: Infinity,
    // world
    colliders: [],     // {minX,maxX,minZ,maxZ}
    buildings: [],
    traffic: [],       // AI cars
    parked: [],        // parked cars (stealable)
    peds: [],
    cops: [],          // police cars
    footCops: [],
    enemies: [],       // mission gunmen
    pickups: [],       // cash bags, health packs
    marker: null,      // current objective marker {x,z,r,color}
    // camera
    camYaw: 0, camPitch: 0.32, camDist: 8,
    camUserYaw: 0,     // user drag offset, eases back to follow
    // mission
    missionIndex: 0,   // next mission to play
    mission: null,     // active mission runtime
    missionsDone: 0,
    // input
    keys: {},
    mouseDX: 0, mouseDY: 0,
    dragging: false, lastMX: 0, lastMY: 0,
    shootQueued: false,
    // save
    saveKey: 'palmera-bay-save-v1',
    // scene override for screenshots / tests (?scene=drive|foot|mission|city)
    sceneMode: null,
    // perf
    debug: false
  };

  // ---- input ---------------------------------------------------------------
  function onKey(e, down) {
    if (down && e.repeat) return; // holding a key must not re-fire E / N / R
    var k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    G.keys[k] = down;
    if (down && (k === ' ' || k === 'arrowup' || k === 'arrowdown')) e.preventDefault();
    if (down && k === 'escape' && G.state === 'playing') window.PalmeraBay.pauseGame();
    else if (down && k === 'escape' && G.state === 'paused') window.PalmeraBay.resumeGame();
    if (down && k === 'n' && G.state === 'playing') window.PalmeraBay.tryStartNextMission();
    if (down && k === 'e' && G.state === 'playing') window.PalmeraBay.tryInteract();
    if (down && k === 'r' && G.state === 'playing') window.PalmeraBay.reloadWeapon();
  }
  window.addEventListener('keydown', function (e) { onKey(e, true); });
  window.addEventListener('keyup', function (e) { onKey(e, false); });
  window.addEventListener('blur', function () { G.keys = {}; });
  document.addEventListener('visibilitychange', function () { if (document.hidden) G.keys = {}; });

  function bindMouse(canvas) {
    canvas.addEventListener('mousedown', function (e) {
      G.dragging = true; G.lastMX = e.clientX; G.lastMY = e.clientY;
      if (G.state === 'playing') G.shootQueued = true;
    });
    window.addEventListener('mouseup', function () { G.dragging = false; });
    window.addEventListener('mousemove', function (e) {
      if (!G.dragging) return;
      G.mouseDX += e.clientX - G.lastMX;
      G.mouseDY += e.clientY - G.lastMY;
      G.lastMX = e.clientX; G.lastMY = e.clientY;
    });
    canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    canvas.addEventListener('touchstart', function (e) {
      var t = e.touches[0]; G.dragging = true; G.lastMX = t.clientX; G.lastMY = t.clientY;
    }, { passive: true });
    canvas.addEventListener('touchmove', function (e) {
      if (!G.dragging) return;
      var t = e.touches[0];
      G.mouseDX += t.clientX - G.lastMX; G.mouseDY += t.clientY - G.lastMY;
      G.lastMX = t.clientX; G.lastMY = t.clientY;
    }, { passive: true });
    canvas.addEventListener('touchend', function () { G.dragging = false; });
  }

  // ---- save / load -----------------------------------------------------------
  function saveGame() {
    if (!G.player) return false;
    var p = G.player.pos;
    var data = {
      cash: G.cash, missionIndex: G.missionIndex, missionsDone: G.missionsDone,
      health: G.player.health, x: p.x, z: p.z, heading: G.player.heading,
      savedAt: new Date().toISOString()
    };
    try { localStorage.setItem(G.saveKey, JSON.stringify(data)); return true; }
    catch (e) { return false; }
  }
  function loadSave() {
    try {
      var raw = localStorage.getItem(G.saveKey);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }
  function clearSave() { try { localStorage.removeItem(G.saveKey); } catch (e) {} }

  // ---- collision helpers -----------------------------------------------------
  // Push a circle (x,z,r) out of building AABBs. Returns true if it hit something.
  function resolveCircle(x, z, r) {
    var hit = false;
    for (var i = 0; i < G.colliders.length; i++) {
      var c = G.colliders[i];
      var nx = clamp(x, c.minX, c.maxX), nz = clamp(z, c.minZ, c.maxZ);
      var dx = x - nx, dz = z - nz, d2 = dx * dx + dz * dz;
      if (d2 < r * r) {
        hit = true;
        if (d2 > 0.0001) {
          var d = Math.sqrt(d2);
          x = nx + (dx / d) * r; z = nz + (dz / d) * r;
        } else {
          // centre inside the box: push out along the smallest penetration axis
          var pl = x - c.minX, pr = c.maxX - x, pt = z - c.minZ, pb = c.maxZ - z;
          var m = Math.min(pl, pr, pt, pb);
          if (m === pl) x = c.minX - r; else if (m === pr) x = c.maxX + r;
          else if (m === pt) z = c.minZ - r; else z = c.maxZ + r;
        }
      }
    }
    return { x: x, z: z, hit: hit };
  }
  function pointInCollider(x, z, pad) {
    pad = pad || 0;
    for (var i = 0; i < G.colliders.length; i++) {
      var c = G.colliders[i];
      if (x > c.minX - pad && x < c.maxX + pad && z > c.minZ - pad && z < c.maxZ + pad) return true;
    }
    return false;
  }

  // URL scene override (?scene=drive etc.) for screenshots and testing.
  try {
    var m = /[?&]scene=([a-z]+)/.exec(window.location.search || '');
    if (m) G.sceneMode = m[1];
  } catch (e) {}

  window.PalmeraBay = window.PalmeraBay || {};
  window.PalmeraBay.G = G;
  window.PalmeraBay.CITY = CITY;
  window.PalmeraBay.utils = { mulberry32: mulberry32, clamp: clamp, lerp: lerp, dist2: dist2, angleLerp: angleLerp, angleDiff: angleDiff, nearestRoadCoord: nearestRoadCoord, isOnRoad: isOnRoad, resolveCircle: resolveCircle, pointInCollider: pointInCollider };
  window.PalmeraBay.core = { bindMouse: bindMouse, saveGame: saveGame, loadSave: loadSave, clearSave: clearSave };
})();
