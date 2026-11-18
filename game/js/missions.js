/* Palmera Bay — missions: five story jobs for Mara Voss, from a simple
   pickup to the big bank score. Each mission is a list of steps (go to,
   board, deliver, defeat, hold, survive); the runner sets the marker,
   updates the objective line and pays out on completion. */
(function () {
  'use strict';
  var G = window.PalmeraBay.G;
  var U = window.PalmeraBay.utils;

  var MISSION_DEFS = [
    {
      id: 1, title: 'THE PICKUP', reward: 200,
      brief: 'Dante needs a fare collected from the corner of 3rd and Marlin. Pick them up, drop them at the Hotel Palmera. No trouble.',
      steps: [
        { type: 'goto', x: 60, z: -60, r: 5, text: 'Drive to the pickup on 3rd & Marlin' },
        { type: 'board', x: 60, z: -60, r: 6, text: 'Stop in the marker — your passenger is waiting' },
        { type: 'deliver', x: -100, z: 100, r: 6, text: 'Drive the passenger to the Hotel Palmera' }
      ]
    },
    {
      id: 2, title: 'HOT WHEELS', reward: 350,
      brief: 'A gold Comet GT is parked by the marina. Dante wants it in his garage. Take it. The cops will not like the paperwork.',
      steps: [
        { type: 'goto', x: -140, z: 140, r: 6, text: 'Find the gold Comet GT by the marina' },
        { type: 'steal', x: -140, z: 140, r: 6, text: 'Steal the Comet GT (E to get in)' },
        { type: 'deliverCar', x: 100, z: -140, r: 6, text: 'Deliver the Comet to Dante\'s garage' }
      ]
    },
    {
      id: 3, title: 'PAYBACK', reward: 500,
      brief: 'Kroll\'s crew shorted Dante on a shipment. Go to the warehouse on 9th, settle it, and bring the cash back to the safehouse.',
      steps: [
        { type: 'goto', x: -140, z: -100, r: 6, text: 'Go to the Kroll warehouse on 9th' },
        { type: 'killAll', x: -140, z: -100, r: 12, text: 'Deal with Kroll\'s gunmen', count: 4 },
        { type: 'collect', x: -140, z: -100, r: 6, text: 'Grab the cash bag' },
        { type: 'deliver', x: 20, z: 60, r: 6, text: 'Bring the cash to the safehouse' }
      ]
    },
    {
      id: 4, title: 'HEAT', reward: 400,
      brief: 'Someone talked. The whole Palmera Bay PD is on you — three stars and climbing. Stay alive for a minute, then vanish at the safehouse.',
      steps: [
        { type: 'survive', seconds: 60, text: 'Survive the heat — 60 seconds' },
        { type: 'deliver', x: 20, z: 60, r: 6, text: 'Lose the cops and reach the safehouse' }
      ]
    },
    {
      id: 5, title: 'THE BIG SCORE', reward: 1500,
      brief: 'The Marlin Bank vault. Crack it, grab the money, and get to the boat on the beach before the city locks down. This is the one, Mara.',
      steps: [
        { type: 'goto', x: 60, z: 20, r: 6, text: 'Get to the Marlin Bank' },
        { type: 'hold', x: 60, z: 20, r: 5, seconds: 6, text: 'Stay in the vault doorway — cracking the safe…' },
        { type: 'escape', x: 0, z: 184, r: 8, text: 'Run for the boat on the beach — 4 stars!' }
      ]
    }
  ];

  var markerMesh = null;
  var markerRing = null;

  function makeMarker() {
    if (markerMesh) return;
    markerMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(2.6, 2.6, 7, 24, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false }));
    markerMesh.position.y = 3.5;
    G.scene.add(markerMesh);
    markerRing = new THREE.Mesh(
      new THREE.RingGeometry(2.2, 3.0, 32),
      new THREE.MeshBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.85, side: THREE.DoubleSide }));
    markerRing.rotation.x = -Math.PI / 2;
    markerRing.position.y = 0.06;
    G.scene.add(markerRing);
    markerMesh.visible = false;
    markerRing.visible = false;
  }

  function setMarker(x, z, r) {
    makeMarker();
    G.marker = { x: x, z: z, r: r || 6 };
    markerMesh.position.x = x; markerMesh.position.z = z;
    markerRing.position.x = x; markerRing.position.z = z;
    var s = (r || 6) / 3;
    markerRing.scale.set(s, s, 1);
    markerMesh.visible = true;
    markerRing.visible = true;
  }

  function hideMarker() {
    G.marker = null;
    if (markerMesh) markerMesh.visible = false;
    if (markerRing) markerRing.visible = false;
  }

  function currentStep() {
    if (!G.mission) return null;
    return G.mission.def.steps[G.mission.stepIndex] || null;
  }

  function showStep() {
    var step = currentStep();
    if (!step) return;
    window.PalmeraBay.hud.setObjective(G.mission.def.title, step.text);
    if (step.x !== undefined) setMarker(step.x, step.z, step.r);
    else hideMarker();
  }

  function startMission(index) {
    var def = MISSION_DEFS[index];
    if (!def) return false;
    // clear leftovers from a previous attempt
    for (var i = G.enemies.length - 1; i >= 0; i--) {
      G.scene.remove(G.enemies[i].group);
      G.enemies.splice(i, 1);
    }
    G.mission = {
      def: def, stepIndex: 0, stepTime: 0, holdTime: 0,
      passenger: null, goldCar: null, missionPickup: null, guardsSpawned: false
    };
    window.PalmeraBay.hud.showBanner(def.title, def.brief);
    window.PalmeraBay.audio.playMissionJingle();
    window.PalmeraBay.hud.setObjective(def.title, def.steps[0].text);
    if (def.id === 4) window.PalmeraBay.police.addWanted(3, 'someone talked');
    showStep();
    return true;
  }

  function tryStartNextMission() {
    if (G.mission) { window.PalmeraBay.hud.toast('Finish the current job first.'); return; }
    if (G.missionIndex >= MISSION_DEFS.length) {
      window.PalmeraBay.hud.toast('All five jobs are done — you beat the story!');
      return;
    }
    startMission(G.missionIndex);
  }

  function advanceStep() {
    var m = G.mission;
    if (!m) return;
    m.stepIndex += 1;
    m.stepTime = 0; m.holdTime = 0;
    if (m.stepIndex >= m.def.steps.length) { completeMission(); return; }
    var step = currentStep();
    // step setup
    if (step.type === 'board') spawnPassenger(step);
    if (step.type === 'steal') spawnGoldCar(step);
    if (step.type === 'killAll') spawnGang(step);
    if (step.type === 'collect') {
      m.missionPickup = window.PalmeraBay.combat.spawnPickup(step.x, step.z, 'cash', m.def.reward);
      m.missionPickup.isMissionCash = true;
    }
    if (step.type === 'hold') {
      m.guardsSpawned = false;
      window.PalmeraBay.combat.makeEnemy(step.x + 8, step.z + 6, { accuracy: 0.25, damage: 8 });
      window.PalmeraBay.combat.makeEnemy(step.x - 8, step.z - 6, { accuracy: 0.25, damage: 8 });
      m.guardsSpawned = true;
    }
    if (step.type === 'escape') {
      window.PalmeraBay.police.addWanted(4, 'bank robbery');
      window.PalmeraBay.hud.toast('Four stars — run for the boat!');
    }
    showStep();
  }

  function spawnPassenger(step) {
    var ped = window.PalmeraBay.pedestrians.makePed(step.x + 2, step.z + 2,
      { shirt: 0xf1c40f, pants: 0x2c3e50, skin: 0xffdbac, passenger: true });
    ped.state = 'walk';
    G.mission.passenger = ped;
    window.PalmeraBay.hud.toast('Your passenger is waiting at the marker.');
  }

  function onPassengerBoarded() {
    var m = G.mission;
    if (!m || currentStep().type !== 'board') return;
    window.PalmeraBay.hud.toast('Passenger aboard — drive them to the hotel.');
    window.PalmeraBay.audio.playPickup();
    advanceStep();
  }

  function spawnGoldCar(step) {
    var car = window.PalmeraBay.vehicles.makeCar(step.x, step.z, Math.PI / 2,
      { type: 'sport', color: 0xd4af37, parked: true });
    car.isGold = true;
    G.parked.push(car);
    G.mission.goldCar = car;
  }

  function spawnGang(step) {
    var spots = [[-8, -6], [8, -8], [-6, 8], [9, 5]];
    for (var i = 0; i < (step.count || 4); i++) {
      var s = spots[i % spots.length];
      window.PalmeraBay.combat.makeEnemy(step.x + s[0], step.z + s[1], { accuracy: 0.3, damage: 9 });
    }
    window.PalmeraBay.hud.toast('Kroll\'s gunmen — take them down!');
  }

  function onEnemyDown(enemy) {
    var m = G.mission;
    if (!m) return;
    var step = currentStep();
    if (step && step.type === 'killAll') {
      var alive = 0;
      for (var i = 0; i < G.enemies.length; i++) if (G.enemies[i].state === 'alive') alive++;
      window.PalmeraBay.hud.setObjective(m.def.title, step.text + ' — ' + alive + ' left');
      if (alive === 0) {
        window.PalmeraBay.hud.toast('Warehouse clear.');
        advanceStep();
      }
    }
  }

  function completeMission() {
    var def = G.mission.def;
    G.cash += def.reward;
    G.missionsDone += 1;
    G.missionIndex += 1;
    G.mission = null;
    hideMarker();
    window.PalmeraBay.hud.updateCash();
    window.PalmeraBay.hud.setObjective('FREE ROAM', 'Explore Palmera Bay. Press N to start the next mission.');
    window.PalmeraBay.hud.showBanner('MISSION PASSED', '+$' + def.reward + ' — ' + def.title);
    window.PalmeraBay.audio.playMissionJingle();
    window.PalmeraBay.core.saveGame();
    if (G.missionIndex >= MISSION_DEFS.length) {
      setTimeout(function () { window.PalmeraBay.main.storyComplete(); }, 2500);
    }
  }

  function failMission(reason) {
    if (!G.mission) return;
    var def = G.mission.def;
    G.mission = null;
    hideMarker();
    window.PalmeraBay.hud.setObjective('FREE ROAM', 'Explore Palmera Bay. Press N to retry the mission.');
    window.PalmeraBay.hud.showBanner('MISSION FAILED', reason || def.title, true);
    window.PalmeraBay.audio.playFailSting();
    for (var i = G.enemies.length - 1; i >= 0; i--) {
      G.scene.remove(G.enemies[i].group);
      G.enemies.splice(i, 1);
    }
  }

  function updateMissions(dt) {
    var m = G.mission;
    if (!m) return;
    var step = currentStep();
    if (!step) return;
    m.stepTime += dt;
    var px = G.player.pos.x, pz = G.player.pos.z;
    // pulse the marker, and fade its wall away when the player stands inside it
    if (markerMesh && markerMesh.visible) {
      var s = 1 + Math.sin(G.time * 3) * 0.08;
      markerMesh.scale.set(s, 1, s);
      var inside = G.marker && U.dist2(px, pz, G.marker.x, G.marker.z) < G.marker.r * G.marker.r;
      markerMesh.material.opacity = inside ? 0.06 : 0.22 + Math.sin(G.time * 3) * 0.08;
      markerRing.rotation.z += dt * 0.8;
    }
    if (step.type === 'goto' || step.type === 'deliver') {
      if (U.dist2(px, pz, step.x, step.z) < step.r * step.r) advanceStep();
    } else if (step.type === 'board') {
      // the passenger boards when the player's car stops inside the marker
      if (G.player.car && U.dist2(px, pz, step.x, step.z) < step.r * step.r && Math.abs(G.player.car.speed) < 1.5) {
        if (m.passenger && m.passenger.state === 'walk') {
          m.passenger.state = 'enter';
        }
      }
    } else if (step.type === 'steal') {
      if (G.player.car && G.player.car.isGold) advanceStep();
    } else if (step.type === 'deliverCar') {
      if (G.player.car && G.player.car.isGold && U.dist2(px, pz, step.x, step.z) < step.r * step.r) advanceStep();
    } else if (step.type === 'collect') {
      if (m.missionPickup && G.pickups.indexOf(m.missionPickup) < 0) {
        // the cash bag was picked up (combat pays the amount)
        advanceStep();
      }
    } else if (step.type === 'hold') {
      var inside = U.dist2(px, pz, step.x, step.z) < step.r * step.r;
      if (inside) {
        m.holdTime += dt;
        window.PalmeraBay.hud.setObjective(m.def.title, step.text + ' ' + Math.ceil(step.seconds - m.holdTime) + 's');
        if (m.holdTime >= step.seconds) {
          window.PalmeraBay.hud.toast('Vault cracked — grab the money and run!');
          advanceStep();
        }
      } else {
        m.holdTime = Math.max(0, m.holdTime - dt * 0.5);
      }
    } else if (step.type === 'survive') {
      var left = Math.ceil(step.seconds - m.stepTime);
      window.PalmeraBay.hud.setObjective(m.def.title, 'Survive the heat — ' + Math.max(0, left) + 's');
      if (m.stepTime >= step.seconds) {
        window.PalmeraBay.hud.toast('You rode it out — now vanish at the safehouse.');
        advanceStep();
      }
    } else if (step.type === 'escape') {
      if (U.dist2(px, pz, step.x, step.z) < step.r * step.r) advanceStep();
    }
  }

  window.PalmeraBay.missions = {
    MISSION_DEFS: MISSION_DEFS, startMission: startMission,
    tryStartNextMission: tryStartNextMission, advanceStep: advanceStep,
    onPassengerBoarded: onPassengerBoarded, onEnemyDown: onEnemyDown,
    completeMission: completeMission, failMission: failMission,
    updateMissions: updateMissions, setMarker: setMarker, hideMarker: hideMarker
  };
})();
