/* Palmera Bay — main: renderer, the player, third-person camera, on-foot
   movement, the game loop, pause / busted / wasted / story-complete, and
   the ?scene= setups used for screenshots. */
(function () {
  'use strict';
  var G = window.PalmeraBay.G;
  var U = window.PalmeraBay.utils;

  var SPAWN = { x: 0, z: 20 };
  var POLICE_STATION = { x: -60, z: -60 };
  var HOSPITAL = { x: 60, z: 60 };

  function buildPlayerMesh() {
    var g = new THREE.Group();
    var jacket = new THREE.MeshLambertMaterial({ color: 0x0f766e });
    var jeans = new THREE.MeshLambertMaterial({ color: 0x1e3a5f });
    var skin = new THREE.MeshLambertMaterial({ color: 0xc68642 });
    var torso = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.66, 0.32), jacket);
    torso.position.y = 1.14; torso.castShadow = true;
    g.add(torso);
    var head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), skin);
    head.position.y = 1.66; head.castShadow = true;
    g.add(head);
    var hair = new THREE.Mesh(new THREE.SphereGeometry(0.23, 10, 8), new THREE.MeshLambertMaterial({ color: 0x1a1210 }));
    hair.position.y = 1.74; hair.scale.set(1, 0.62, 1);
    g.add(hair);
    var legL = new THREE.Mesh(new THREE.BoxGeometry(0.21, 0.78, 0.24), jeans);
    legL.position.set(-0.15, 0.39, 0);
    var legR = legL.clone(); legR.position.x = 0.15;
    g.add(legL); g.add(legR);
    var armL = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.62, 0.17), jacket);
    armL.position.set(-0.37, 1.14, 0);
    var armR = armL.clone(); armR.position.x = 0.37;
    g.add(armL); g.add(armR);
    // the pistol, visible in the right hand
    var gun = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 0.44), new THREE.MeshLambertMaterial({ color: 0x111111 }));
    gun.position.set(0.4, 1.0, 0.3);
    g.add(gun);
    g.userData = { legL: legL, legR: legR, armL: armL, armR: armR };
    return g;
  }

  function createPlayer(x, z) {
    var group = buildPlayerMesh();
    group.position.set(x, 0, z);
    G.scene.add(group);
    G.player = {
      group: group, pos: group.position, heading: 0,
      speed: 0, health: 100, onFoot: true, car: null,
      walkPhase: 0, vy: 0, grounded: true
    };
  }

  function resetWorld() {
    // remove every dynamic entity and respawn a fresh street
    function clearList(list) {
      for (var i = list.length - 1; i >= 0; i--) { G.scene.remove(list[i].group); list.splice(i, 1); }
    }
    clearList(G.traffic); clearList(G.parked); clearList(G.peds);
    clearList(G.cops); clearList(G.footCops); clearList(G.enemies);
    for (var p = G.pickups.length - 1; p >= 0; p--) { G.scene.remove(G.pickups[p].mesh); G.pickups.splice(p, 1); }
    window.PalmeraBay.police.clearWanted();
    window.PalmeraBay.missions.hideMarker();
    G.mission = null;
    G.wanted = 0;
    G.ammo = G.magSize;
    window.PalmeraBay.vehicles.spawnTraffic(14);
    window.PalmeraBay.vehicles.spawnParked(10);
    window.PalmeraBay.pedestrians.spawnPeds(16);
    // Mara's own starter car, parked on the road by the spawn point, facing along it
    var starter = window.PalmeraBay.vehicles.makeCar(6, 20, Math.PI / 2, { type: 'sedan', color: 0x0f766e, parked: true });
    G.parked.push(starter);
  }

  function startGame(fromSave) {
    var save = fromSave ? window.PalmeraBay.core.loadSave() : null;
    G.cash = save ? save.cash : 0;
    G.missionIndex = save ? save.missionIndex : 0;
    G.missionsDone = save ? save.missionsDone : 0;
    G.time = 0;
    G.clockMinutes = 10 * 60 + 24;
    if (G.player) {
      G.player.health = save ? save.health : 100;
      G.player.onFoot = true;
      G.player.car = null;
      G.player.group.visible = true;
      var sx = save ? save.x : SPAWN.x, sz = save ? save.z : SPAWN.z;
      G.player.pos.set(sx, 0, sz);
      G.player.heading = save ? save.heading : 0;
    }
    resetWorld();
    G.state = 'playing';
    window.PalmeraBay.hud.hideMenu();
    window.PalmeraBay.hud.updateCash();
    window.PalmeraBay.hud.updateHealth();
    window.PalmeraBay.hud.updateAmmo();
    window.PalmeraBay.hud.updateWanted();
    window.PalmeraBay.hud.setObjective('FREE ROAM', 'Explore Palmera Bay. Press N to start the next mission.');
    window.PalmeraBay.hud.showCrosshair(true);
    window.PalmeraBay.audio.ensureAudio();
    window.PalmeraBay.audio.startEngine();
    window.PalmeraBay.audio.updateEngine(0, false);
    if (G.sceneMode) applySceneMode(G.sceneMode);
  }

  function applySceneMode(mode) {
    // scripted setups for screenshots: rich, readable moments, no menu
    if (mode === 'drive') {
      var car = window.PalmeraBay.vehicles.makeCar(0, 60, Math.PI / 2, { type: 'sport', color: 0xd94f3d, parked: true });
      G.parked.push(car);
      window.PalmeraBay.vehicles.enterCar(car);
      car.speed = 30;
      window.PalmeraBay.police.addWanted(2, 'screenshot setup');
      window.PalmeraBay.police.spawnCopCar();
      window.PalmeraBay.police.spawnCopCar();
      // one patrol car right behind the player, in frame for the chase shot
      var chase = window.PalmeraBay.vehicles.makeCar(-28, 60, Math.PI / 2,
        { type: 'cop', color: 0x16222e, axis: 'x', dir: 1, lane: 2.6, targetSpeed: 20 });
      chase.isCop = true;
      chase.speed = 22;
      G.cops.push(chase);
      G.camYaw = 0; G.camPitch = 0.3;
      window.PalmeraBay.hud.setObjective('THE PICKUP', 'Drive the passenger to the Hotel Palmera');
    } else if (mode === 'foot') {
      G.player.pos.set(60, 0, 60);
      G.player.heading = 0;
      for (var i = 0; i < 6; i++) {
        var spot = window.PalmeraBay.city.randomRoadPoint(G.rng, 20);
        G.peds.push(window.PalmeraBay.pedestrians.makePed(60 + (Math.random() - 0.5) * 30, 60 + (Math.random() - 0.5) * 30));
      }
      window.PalmeraBay.hud.setObjective('FREE ROAM', 'Explore Palmera Bay. Press N to start the next mission.');
    } else if (mode === 'mission') {
      // stand inside the warehouse marker so the goto step completes at once
      // and the shootout step (4 gunmen) starts by itself
      G.player.pos.set(-140, 0, -97);
      G.player.heading = 0;
      window.PalmeraBay.missions.startMission(2);
      window.PalmeraBay.police.addWanted(1, 'screenshot setup');
      window.PalmeraBay.hud.setObjective('PAYBACK', 'Deal with Kroll\'s gunmen');
    } else if (mode === 'city') {
      G.player.pos.set(0, 0, 150);
      G.player.heading = Math.PI;
      G.camYaw = Math.PI; G.camPitch = 0.85; G.camDist = 60;
      window.PalmeraBay.hud.setObjective('PALMERA BAY', 'A city to explore on foot and by car');
    }
  }

  function pauseGame() {
    if (G.state !== 'playing') return;
    G.state = 'paused';
    document.getElementById('pause').classList.remove('hidden');
    window.PalmeraBay.audio.updateEngine(0, false);
  }
  function resumeGame() {
    if (G.state !== 'paused') return;
    G.state = 'playing';
    document.getElementById('pause').classList.add('hidden');
  }

  function respawnAt(point, lostCash, label) {
    if (G.player.car) window.PalmeraBay.vehicles.exitCar();
    G.player.pos.set(point.x, 0, point.z);
    G.player.health = 100;
    G.player.heading = 0;
    G.cash = Math.max(0, G.cash - lostCash);
    window.PalmeraBay.police.clearWanted();
    window.PalmeraBay.hud.updateCash();
    window.PalmeraBay.hud.updateHealth();
    window.PalmeraBay.hud.updateWanted();
    window.PalmeraBay.hud.setObjective('FREE ROAM', 'Explore Palmera Bay. Press N to start the next mission.');
    G.state = 'playing';
  }

  function busted() {
    if (G.state !== 'playing') return;
    G.state = 'busted';
    window.PalmeraBay.missions.failMission('BUSTED — the Palmera Bay PD got you');
    window.PalmeraBay.audio.playBusted();
    window.PalmeraBay.hud.showBanner('BUSTED', 'You lose $150. The crew bails you out.', true);
    window.PalmeraBay.audio.updateEngine(0, false);
    setTimeout(function () { respawnAt(POLICE_STATION, 150, 'busted'); }, 2600);
  }

  function wasted() {
    if (G.state !== 'playing') return;
    G.state = 'wasted';
    window.PalmeraBay.missions.failMission('WASTED — Mara is down');
    window.PalmeraBay.audio.playFailSting();
    window.PalmeraBay.hud.showBanner('WASTED', 'You lose $100. The hospital patches you up.', true);
    window.PalmeraBay.audio.updateEngine(0, false);
    setTimeout(function () { respawnAt(HOSPITAL, 100, 'wasted'); }, 2600);
  }

  function storyComplete() {
    G.state = 'complete';
    window.PalmeraBay.hud.showBanner('STORY COMPLETE', 'All five jobs done. Palmera Bay is yours, Mara.');
    window.PalmeraBay.audio.playMissionJingle();
    setTimeout(function () {
      window.PalmeraBay.hud.showMenu();
      window.PalmeraBay.hud.toast('Story complete — free roam continues from the menu.');
    }, 3000);
  }

  function tryInteract() {
    if (G.state !== 'playing' || !G.player) return;
    if (G.player.onFoot) {
      var car = window.PalmeraBay.vehicles.nearestEnterableCar(4);
      if (car) {
        // stealing a car with its driver still in it
        if (car.isTraffic) {
          var driver = window.PalmeraBay.pedestrians.makePed(
            car.group.position.x + 1.5, car.group.position.z + 1.5, { driver: true });
          window.PalmeraBay.pedestrians.fleeFrom(driver, car.group.position.x, car.group.position.z);
          G.peds.push(driver);
          car.hadDriver = true;
        }
        window.PalmeraBay.vehicles.enterCar(car);
        window.PalmeraBay.hud.showInteract(null);
      }
    } else {
      window.PalmeraBay.vehicles.exitCar();
    }
  }

  function tryStartNextMission() {
    if (G.state === 'playing') window.PalmeraBay.missions.tryStartNextMission();
  }
  function reloadWeapon() {
    if (G.state === 'playing') window.PalmeraBay.combat.reloadWeapon();
  }

  // ---- on-foot movement -------------------------------------------------------
  function updatePlayerOnFoot(dt) {
    var keys = G.keys;
    var fwd = (keys['w'] || keys['arrowup'] ? 1 : 0) - (keys['s'] || keys['arrowdown'] ? 1 : 0);
    var strafe = (keys['d'] || keys['arrowright'] ? 1 : 0) - (keys['a'] || keys['arrowleft'] ? 1 : 0);
    var sprint = keys['shift'] ? 1.6 : 1;
    var moving = fwd !== 0 || strafe !== 0;
    var targetSpeed = moving ? 5.2 * sprint : 0;
    G.player.speed = U.lerp(G.player.speed, targetSpeed, dt * 8);
    if (moving) {
      var moveAngle = G.camYaw + Math.atan2(strafe, fwd);
      G.player.heading = U.angleLerp(G.player.heading, moveAngle, dt * 10);
      var mx = Math.sin(moveAngle), mz = Math.cos(moveAngle);
      var nx = G.player.pos.x + mx * G.player.speed * dt;
      var nz = G.player.pos.z + mz * G.player.speed * dt;
      var res = U.resolveCircle(nx, nz, 0.6);
      G.player.pos.x = U.clamp(res.x, -205, 205);
      G.player.pos.z = U.clamp(res.z, -205, 205);
    }
    // jump
    if (keys[' '] && G.player.grounded) { G.player.vy = 7.5; G.player.grounded = false; }
    if (!G.player.grounded) {
      G.player.vy -= 22 * dt;
      G.player.pos.y += G.player.vy * dt;
      if (G.player.pos.y <= 0) { G.player.pos.y = 0; G.player.vy = 0; G.player.grounded = true; }
    }
    // walk cycle
    G.player.walkPhase += dt * G.player.speed * 2.4;
    var sw = Math.sin(G.player.walkPhase) * (G.player.speed > 0.5 ? 0.6 : 0);
    var ud = G.player.group.userData;
    ud.legL.rotation.x = sw; ud.legR.rotation.x = -sw;
    ud.armL.rotation.x = -sw * 0.7; ud.armR.rotation.x = sw * 0.7;
    G.player.group.rotation.y = G.player.heading;
    // interact prompt
    var car = window.PalmeraBay.vehicles.nearestEnterableCar(4);
    if (car) {
      window.PalmeraBay.hud.showInteract(car.isTraffic ? 'to jack this car' : 'to get in the car');
    } else {
      window.PalmeraBay.hud.showInteract(null);
    }
    window.PalmeraBay.hud.showSpeed(false);
    window.PalmeraBay.hud.showCrosshair(true);
  }

  // ---- camera -------------------------------------------------------------------
  function updateCamera(dt) {
    // mouse drag orbits; the offset eases back to the follow direction
    G.camYaw -= G.mouseDX * 0.005;
    G.camPitch = U.clamp(G.camPitch + G.mouseDY * 0.004, 0.08, 1.05);
    G.mouseDX = 0; G.mouseDY = 0;
    var target = G.player.car ? G.player.car.group.position : G.player.pos;
    var wantYaw;
    if (G.player.car && G.sceneMode !== 'city') {
      // chase camera: eases back behind the car after the player drags to look around
      G.camYaw = U.angleLerp(G.camYaw, G.player.car.heading + Math.PI, dt * 1.4);
      wantYaw = G.camYaw;
    } else {
      wantYaw = G.camYaw;
    }
    var dist = G.sceneMode === 'city' ? 60 : (G.player.car ? 11.5 : 8);
    var tx = target.x, ty = target.y + (G.player.car ? 2.2 : 1.6), tz = target.z;
    var cx = tx - Math.sin(wantYaw) * Math.cos(G.camPitch) * dist;
    var cz = tz - Math.cos(wantYaw) * Math.cos(G.camPitch) * dist;
    var cy = ty + Math.sin(G.camPitch) * dist;
    G.camera.position.set(
      U.lerp(G.camera.position.x, cx, dt * 7),
      U.lerp(G.camera.position.y, Math.max(cy, 1.2), dt * 7),
      U.lerp(G.camera.position.z, cz, dt * 7));
    G.camera.lookAt(tx, ty, tz);
    if (G.player.car) {
      window.PalmeraBay.hud.updateSpeed(Math.abs(G.player.car.speed) * 2.2);
      window.PalmeraBay.hud.showSpeed(true);
      window.PalmeraBay.hud.showCrosshair(false);
    }
  }

  // ---- boot + loop --------------------------------------------------------------
  var lastMinimap = 0;
  function loop() {
    requestAnimationFrame(loop);
    var dt = Math.min(G.clock.getDelta(), 0.1);
    if (G.state === 'playing') {
      G.time += dt;
      G.clockMinutes += dt * 0.5; // a game day passes in ~48 real minutes
      if (G.shootQueued) { G.shootQueued = false; window.PalmeraBay.combat.shoot(); }
      if (G.player.onFoot) updatePlayerOnFoot(dt);
      else window.PalmeraBay.vehicles.updatePlayerCar(dt);
      window.PalmeraBay.vehicles.updateTraffic(dt);
      window.PalmeraBay.pedestrians.updatePeds(dt);
      window.PalmeraBay.police.updatePolice(dt);
      window.PalmeraBay.combat.updateCombat(dt);
      window.PalmeraBay.missions.updateMissions(dt);
      window.PalmeraBay.vehicles.updateParticles(dt);
      if (G.sea) G.sea.position.y = -0.25 + Math.sin(G.time * 0.5) * 0.08;
      if (G.time - lastMinimap > 0.12) {
        lastMinimap = G.time;
        window.PalmeraBay.hud.drawMinimap();
        window.PalmeraBay.hud.updateClock();
      }
    }
    updateCamera(G.state === 'playing' ? dt : 0.016);
    G.renderer.render(G.scene, G.camera);
  }

  function init() {
    var container = document.getElementById('game');
    G.renderer = new THREE.WebGLRenderer({ antialias: true });
    G.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    G.renderer.setSize(window.innerWidth, window.innerHeight);
    G.renderer.shadowMap.enabled = true;
    G.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(G.renderer.domElement);
    G.scene = new THREE.Scene();
    G.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 2000);
    G.camera.position.set(0, 8, 30);
    G.clock = new THREE.Clock();
    window.PalmeraBay.core.bindMouse(G.renderer.domElement);
    window.addEventListener('resize', function () {
      G.camera.aspect = window.innerWidth / window.innerHeight;
      G.camera.updateProjectionMatrix();
      G.renderer.setSize(window.innerWidth, window.innerHeight);
    });
    window.PalmeraBay.city.buildCity(G.scene);
    createPlayer(SPAWN.x, SPAWN.z);
    resetWorld();
    window.PalmeraBay.combat.tagBuildings();
    window.PalmeraBay.hud.showMenu();
    window.PalmeraBay.hud.updateCash();
    window.PalmeraBay.hud.updateHealth();
    window.PalmeraBay.hud.updateAmmo();
    window.PalmeraBay.hud.updateWanted();
    // menu buttons
    document.getElementById('btn-start').addEventListener('click', function () {
      window.PalmeraBay.audio.playClick();
      startGame(false);
    });
    document.getElementById('btn-continue').addEventListener('click', function () {
      window.PalmeraBay.audio.playClick();
      startGame(true);
    });
    document.getElementById('btn-howto').addEventListener('click', function () {
      document.getElementById('howto').classList.toggle('hidden');
    });
    document.getElementById('btn-resume').addEventListener('click', resumeGame);
    document.getElementById('btn-save').addEventListener('click', function () {
      var ok = window.PalmeraBay.core.saveGame();
      document.getElementById('pause-save-note').textContent = ok ? 'Saved.' : 'Save failed.';
    });
    document.getElementById('btn-quit').addEventListener('click', function () {
      G.state = 'menu';
      window.PalmeraBay.hud.showMenu();
      window.PalmeraBay.audio.updateEngine(0, false);
      window.PalmeraBay.audio.stopSiren();
    });
    // keyboard audio unlock
    window.addEventListener('keydown', function () { window.PalmeraBay.audio.ensureAudio(); }, { once: true });
    window.addEventListener('mousedown', function () { window.PalmeraBay.audio.ensureAudio(); }, { once: true });
    // auto-start for screenshot scenes
    if (G.sceneMode) {
      startGame(false);
    }
    loop();
  }

  window.PalmeraBay.main = {
    init: init, startGame: startGame, pauseGame: pauseGame, resumeGame: resumeGame,
    tryInteract: tryInteract, tryStartNextMission: tryStartNextMission,
    reloadWeapon: reloadWeapon, busted: busted, wasted: wasted, storyComplete: storyComplete
  };
  // the core key handler calls these on window.PalmeraBay directly
  window.PalmeraBay.pauseGame = pauseGame;
  window.PalmeraBay.resumeGame = resumeGame;
  window.PalmeraBay.tryInteract = tryInteract;
  window.PalmeraBay.tryStartNextMission = tryStartNextMission;
  window.PalmeraBay.reloadWeapon = reloadWeapon;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
