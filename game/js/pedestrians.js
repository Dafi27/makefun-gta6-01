/* Palmera Bay — pedestrians: sidewalk walkers who stroll, flee from danger,
   get knocked down by reckless driving, and play the passenger and the
   carjacked driver in missions. */
(function () {
  'use strict';
  var G = window.PalmeraBay.G;
  var U = window.PalmeraBay.utils;

  var SHIRTS = [0xe74c3c, 0x3498db, 0xf1c40f, 0x2ecc71, 0x9b59b6, 0xe67e22, 0x1abc9c, 0xecf0f1, 0xfd79a8, 0x55efc4];
  var PANTS = [0x2c3e50, 0x34495e, 0x7f8c8d, 0x5d4037, 0x1a1a2e];
  var SKINS = [0xf1c27d, 0xe0ac69, 0x8d5524, 0xffdbac, 0xc68642];

  function buildPedMesh(shirt, pants, skin) {
    var g = new THREE.Group();
    var shirtMat = new THREE.MeshLambertMaterial({ color: shirt });
    var pantsMat = new THREE.MeshLambertMaterial({ color: pants });
    var skinMat = new THREE.MeshLambertMaterial({ color: skin });
    var torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.62, 0.3), shirtMat);
    torso.position.y = 1.12; torso.castShadow = true;
    g.add(torso);
    var head = new THREE.Mesh(new THREE.SphereGeometry(0.21, 8, 6), skinMat);
    head.position.y = 1.62; head.castShadow = true;
    g.add(head);
    var hair = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), new THREE.MeshLambertMaterial({ color: 0x2d1c12 }));
    hair.position.y = 1.7; hair.scale.set(1, 0.6, 1);
    g.add(hair);
    var legL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.75, 0.22), pantsMat);
    legL.position.set(-0.14, 0.38, 0);
    var legR = legL.clone(); legR.position.x = 0.14;
    g.add(legL); g.add(legR);
    var armL = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.6, 0.16), shirtMat);
    armL.position.set(-0.34, 1.12, 0);
    var armR = armL.clone(); armR.position.x = 0.34;
    g.add(armL); g.add(armR);
    g.userData = { legL: legL, legR: legR, armL: armL, armR: armR, torso: torso };
    return g;
  }

  function makePed(x, z, opts) {
    opts = opts || {};
    var rng = G.rng;
    var group = buildPedMesh(
      opts.shirt !== undefined ? opts.shirt : SHIRTS[Math.floor(rng() * SHIRTS.length)],
      opts.pants !== undefined ? opts.pants : PANTS[Math.floor(rng() * PANTS.length)],
      opts.skin !== undefined ? opts.skin : SKINS[Math.floor(rng() * SKINS.length)]);
    group.position.set(x, 0, z);
    G.scene.add(group);
    var axis = rng() < 0.5 ? 'x' : 'z';
    var road = U.nearestRoadCoord(axis === 'x' ? z : x);
    var ped = {
      group: group, axis: axis, dir: rng() < 0.5 ? 1 : -1,
      speed: 1.1 + rng() * 0.9, walkPhase: rng() * 6,
      state: 'walk', fleeTime: 0, downTime: 0, pauseTime: 0,
      isPassenger: !!opts.passenger, isDriver: !!opts.driver,
      role: opts.role || null
    };
    if (axis === 'x') group.position.z = road + (rng() < 0.5 ? -7.4 : 7.4);
    else group.position.x = road + (rng() < 0.5 ? -7.4 : 7.4);
    group.rotation.y = axis === 'x' ? (ped.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (ped.dir > 0 ? 0 : Math.PI);
    group.userData.pedRef = ped; // combat raycasts resolve a hit back to this ped
    return ped;
  }

  function spawnPeds(n) {
    for (var i = 0; i < n; i++) {
      var spot = window.PalmeraBay.city.randomRoadPoint(G.rng, 20);
      G.peds.push(makePed(spot.x, spot.z));
    }
  }

  function fleeFrom(ped, x, z) {
    ped.state = 'flee';
    ped.fleeTime = 3 + Math.random() * 2;
    var dx = ped.group.position.x - x, dz = ped.group.position.z - z;
    var d = Math.sqrt(dx * dx + dz * dz) || 1;
    ped.fleeX = dx / d; ped.fleeZ = dz / d;
  }

  function scareNearby(x, z, radius) {
    for (var i = 0; i < G.peds.length; i++) {
      var ped = G.peds[i];
      if (ped.state === 'down') continue;
      var p = ped.group.position;
      if (U.dist2(p.x, p.z, x, z) < radius * radius) fleeFrom(ped, x, z);
    }
  }

  function knockDown(ped) {
    if (ped.state === 'down') return;
    ped.state = 'down';
    ped.downTime = 5;
    ped.group.rotation.x = Math.PI / 2 - 0.15;
    ped.group.position.y = 0.25;
    window.PalmeraBay.vehicles.spawnParticle(ped.group.position.x, 1, ped.group.position.z, 0xff5a4e, 0.6, 1.4, 2);
  }

  function updatePeds(dt) {
    var px = G.player ? G.player.pos.x : 0;
    var pz = G.player ? G.player.pos.z : 0;
    for (var i = G.peds.length - 1; i >= 0; i--) {
      var ped = G.peds[i];
      var p = ped.group.position;
      // recycle far-away peds near the player so streets stay alive
      if (ped.state !== 'down' && U.dist2(p.x, p.z, px, pz) > 150 * 150 && !ped.isPassenger && !ped.role) {
        var spot = window.PalmeraBay.city.randomRoadPoint(G.rng, 40);
        var nx = spot.x, nz = spot.z;
        var dx = nx - px, dz = nz - pz;
        var d = Math.sqrt(dx * dx + dz * dz) || 1;
        p.x = px + (dx / d) * 60; p.z = pz + (dz / d) * 60;
        ped.state = 'walk';
        continue;
      }
      if (ped.state === 'down') {
        ped.downTime -= dt;
        if (ped.downTime <= 0) {
          // get back up and walk away, shaken
          ped.state = 'walk';
          ped.group.rotation.x = 0;
          p.y = 0;
          fleeFrom(ped, px, pz);
        }
        continue;
      }
      var speed = ped.speed;
      if (ped.state === 'flee') {
        ped.fleeTime -= dt;
        speed = 4.6;
        p.x += ped.fleeX * speed * dt;
        p.z += ped.fleeZ * speed * dt;
        ped.group.rotation.y = Math.atan2(ped.fleeX, ped.fleeZ);
        if (ped.fleeTime <= 0) ped.state = 'walk';
      } else if (ped.state === 'enter') {
        // mission passenger walking to the player's car
        var car = G.player.car;
        if (!car) { ped.state = 'walk'; continue; }
        var cp = car.group.position;
        var dx2 = cp.x - p.x, dz2 = cp.z - p.z;
        var d2 = Math.sqrt(dx2 * dx2 + dz2 * dz2);
        if (d2 < 2.2) {
          // got in
          ped.group.visible = false;
          ped.state = 'inCar';
          window.PalmeraBay.missions.onPassengerBoarded();
          continue;
        }
        speed = 3.4;
        p.x += (dx2 / d2) * speed * dt;
        p.z += (dz2 / d2) * speed * dt;
        ped.group.rotation.y = Math.atan2(dx2, dz2);
      } else {
        // stroll along the sidewalk
        var step = ped.speed * ped.dir * dt;
        if (ped.axis === 'x') p.x += step; else p.z += step;
        var cross = ped.axis === 'x' ? U.nearestRoadCoord(p.z) : U.nearestRoadCoord(p.x);
        var along = ped.axis === 'x' ? p.x : p.z;
        if (Math.abs(along - cross) < 1.0 && !ped.turnedAt) {
          ped.turnedAt = cross;
          if (G.rng() < 0.3) {
            ped.axis = ped.axis === 'x' ? 'z' : 'x';
            ped.dir = G.rng() < 0.5 ? 1 : -1;
            if (ped.axis === 'x') p.z = U.nearestRoadCoord(p.z) + (G.rng() < 0.5 ? -7.4 : 7.4);
            else p.x = U.nearestRoadCoord(p.x) + (G.rng() < 0.5 ? -7.4 : 7.4);
          }
        } else if (Math.abs(along - cross) > 4) {
          ped.turnedAt = null;
        }
        ped.group.rotation.y = ped.axis === 'x' ? (ped.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (ped.dir > 0 ? 0 : Math.PI);
        // random idle pauses
        if (Math.random() < 0.001) ped.pauseTime = 1 + Math.random() * 2;
      }
      if (ped.pauseTime > 0) { ped.pauseTime -= dt; speed = 0; }
      // keep out of buildings and inside the city
      var res = U.resolveCircle(p.x, p.z, 0.45);
      p.x = U.clamp(res.x, -205, 205);
      p.z = U.clamp(res.z, -205, 205);
      // walk-cycle animation
      ped.walkPhase += dt * (speed > 0.1 ? speed * 3.2 : 0);
      var sw = Math.sin(ped.walkPhase) * 0.55;
      var ud = ped.group.userData;
      ud.legL.rotation.x = sw; ud.legR.rotation.x = -sw;
      ud.armL.rotation.x = -sw * 0.7; ud.armR.rotation.x = sw * 0.7;
    }
    // player car running over pedestrians
    if (G.player && G.player.car) {
      var car = G.player.car;
      var cp2 = car.group.position;
      var cspeed = Math.abs(car.speed);
      if (cspeed > 5) {
        for (var j = 0; j < G.peds.length; j++) {
          var pd = G.peds[j];
          if (pd.state === 'down' || pd.state === 'inCar') continue;
          var pp = pd.group.position;
          if (U.dist2(pp.x, pp.z, cp2.x, cp2.z) < 2.2 * 2.2) {
            knockDown(pd);
            scareNearby(cp2.x, cp2.z, 25);
            window.PalmeraBay.police.addWanted(1, 'hit pedestrian');
            window.PalmeraBay.hud.toast('You ran someone over! The cops noticed.');
          }
        }
      }
    }
  }

  window.PalmeraBay.pedestrians = {
    makePed: makePed, spawnPeds: spawnPeds, fleeFrom: fleeFrom,
    scareNearby: scareNearby, knockDown: knockDown, updatePeds: updatePeds
  };
})();
