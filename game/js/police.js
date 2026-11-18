/* Palmera Bay — police: the wanted system, pursuit cars that hunt the
   player along the road grid, foot officers who make the arrest, and the
   busted / heat-decay rules. */
(function () {
  'use strict';
  var G = window.PalmeraBay.G;
  var U = window.PalmeraBay.utils;

  function addWanted(n, reason) {
    if (G.state !== 'playing') return;
    var before = G.wanted;
    G.wanted = U.clamp(G.wanted + n, 0, 5);
    G.wantedQuiet = 0;
    if (G.wanted > before) {
      window.PalmeraBay.hud.updateWanted();
      if (G.wanted >= 1) window.PalmeraBay.audio.startSiren();
      if (reason) window.PalmeraBay.hud.toast('Wanted level up — ' + reason);
    }
  }

  function clearWanted() {
    G.wanted = 0; G.wantedHeat = 0; G.wantedQuiet = 0;
    window.PalmeraBay.audio.stopSiren();
    for (var i = G.cops.length - 1; i >= 0; i--) {
      G.scene.remove(G.cops[i].group);
      G.cops.splice(i, 1);
    }
    for (var j = G.footCops.length - 1; j >= 0; j--) {
      G.scene.remove(G.footCops[j].group);
      G.footCops.splice(j, 1);
    }
    window.PalmeraBay.hud.updateWanted();
  }

  function spawnCopCar() {
    var rng = G.rng;
    var px = G.player.pos.x, pz = G.player.pos.z;
    for (var tries = 0; tries < 20; tries++) {
      var spot = window.PalmeraBay.city.randomRoadPoint(rng, 30);
      var d = Math.sqrt(U.dist2(spot.x, spot.z, px, pz));
      if (d > 55 && d < 110) {
        var road = U.nearestRoadCoord(spot.x);
        var axis = Math.abs(spot.x - road) < Math.abs(spot.z - U.nearestRoadCoord(spot.z)) ? 'z' : 'x';
        var car = window.PalmeraBay.vehicles.makeCar(spot.x, spot.z, 0,
          { type: 'cop', color: 0x16222e, axis: axis, dir: 1, lane: 2.6, targetSpeed: 14 });
        car.isCop = true;
        car.speed = 12 + G.wanted * 2;
        // find the red/blue light-bar meshes so the bar can flash in the chase
        car.group.traverse(function (o) {
          if (o.isMesh && o.material && o.material.color) {
            if (o.material.color.getHex() === 0xff2222) car.lightRed = o;
            if (o.material.color.getHex() === 0x2244ff) car.lightBlue = o;
          }
        });
        G.cops.push(car);
        return car;
      }
    }
    return null;
  }

  function spawnFootCop() {
    var rng = G.rng;
    var px = G.player.pos.x, pz = G.player.pos.z;
    var a = rng() * Math.PI * 2;
    var x = px + Math.cos(a) * (14 + rng() * 10);
    var z = pz + Math.sin(a) * (14 + rng() * 10);
    var res = U.resolveCircle(x, z, 0.6);
    var ped = window.PalmeraBay.pedestrians.makePed(res.x, res.z,
      { shirt: 0x1a2f4a, pants: 0x1a1a1a, skin: 0xf1c27d, role: 'cop' });
    ped.health = 100;
    ped.isCop = true;
    ped.bustTimer = 0;
    G.footCops.push(ped);
    return ped;
  }

  function updatePolice(dt) {
    if (G.state !== 'playing') return;
    var px = G.player.pos.x, pz = G.player.pos.z;

    // keep the right number of pursuit cars on the street
    var wantCars = G.wanted >= 1 ? Math.min(G.wanted + 1, 5) : 0;
    if (G.cops.length < wantCars && Math.random() < dt * 0.8) spawnCopCar();
    // foot officers only hunt a player on foot
    var wantFoot = (G.wanted >= 1 && G.player.onFoot) ? Math.min(G.wanted, 3) : 0;
    if (G.footCops.length < wantFoot && Math.random() < dt * 0.6) spawnFootCop();

    // do the police still see the player?
    var seen = false;
    for (var s = 0; s < G.cops.length; s++) {
      var cp = G.cops[s].group.position;
      if (U.dist2(cp.x, cp.z, px, pz) < 75 * 75) { seen = true; break; }
    }
    if (!seen) {
      for (var s2 = 0; s2 < G.footCops.length; s2++) {
        var fp = G.footCops[s2].group.position;
        if (U.dist2(fp.x, fp.z, px, pz) < 40 * 40) { seen = true; break; }
      }
    }
    if (seen) G.wantedQuiet = 0;
    else {
      G.wantedQuiet += dt;
      if (G.wanted > 0 && G.wantedQuiet > 15) {
        G.wanted -= 1;
        G.wantedQuiet = 0;
        window.PalmeraBay.hud.updateWanted();
        window.PalmeraBay.hud.toast('You lost them — wanted level down.');
        if (G.wanted === 0) window.PalmeraBay.audio.stopSiren();
      }
    }

    // ---- pursuit cars: road-following chase -------------------------------
    for (var i = G.cops.length - 1; i >= 0; i--) {
      var car = G.cops[i];
      var p = car.group.position;
      // too far away for too long: despawn
      if (U.dist2(p.x, p.z, px, pz) > 190 * 190) {
        G.scene.remove(car.group);
        G.cops.splice(i, 1);
        continue;
      }
      var targetSpeed = 13 + G.wanted * 2.5;
      car.speed = U.lerp(car.speed, targetSpeed, dt * 0.8);
      var step = car.speed * car.dir * dt;
      if (car.axis === 'x') p.x += step; else p.z += step;
      // at an intersection, pick the turn that gets closer to the player
      var cross = car.axis === 'x' ? U.nearestRoadCoord(p.z) : U.nearestRoadCoord(p.x);
      var along = car.axis === 'x' ? p.x : p.z;
      if (Math.abs(along - cross) < 1.4 && !car.turnedAt) {
        car.turnedAt = cross;
        var curD = Math.sqrt(U.dist2(p.x, p.z, px, pz));
        var bestAxis = car.axis, bestDir = car.dir, bestD = curD;
        var options = [
          { axis: 'x', dir: 1 }, { axis: 'x', dir: -1 },
          { axis: 'z', dir: 1 }, { axis: 'z', dir: -1 }
        ];
        for (var o = 0; o < options.length; o++) {
          var op = options[o];
          var nx = p.x + (op.axis === 'x' ? op.dir * 40 : 0);
          var nz = p.z + (op.axis === 'z' ? op.dir * 40 : 0);
          var dd = Math.sqrt(U.dist2(nx, nz, px, pz));
          if (dd < bestD - 2) { bestD = dd; bestAxis = op.axis; bestDir = op.dir; }
        }
        car.axis = bestAxis; car.dir = bestDir;
        car.lane = (G.rng() < 0.5 ? -1 : 1) * 2.6;
        if (car.axis === 'x') p.z = U.nearestRoadCoord(p.z) + car.lane;
        else p.x = U.nearestRoadCoord(p.x) + car.lane;
      } else if (Math.abs(along - cross) > 4) {
        car.turnedAt = null;
      }
      car.heading = car.axis === 'x' ? (car.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (car.dir > 0 ? 0 : Math.PI);
      car.group.rotation.y = car.heading;
      var wheels = car.group.userData.wheels;
      for (var w = 0; w < wheels.length; w++) wheels[w].mesh.rotation.x += car.speed * dt * 1.4;
      // flash the light bar, red / blue alternating
      if (car.lightRed && car.lightBlue) {
        var flashOn = Math.floor(G.time * 3) % 2 === 0;
        car.lightRed.visible = flashOn;
        car.lightBlue.visible = !flashOn;
      }
      p.x = U.clamp(p.x, -205, 205); p.z = U.clamp(p.z, -205, 205);
      // ram the player's car
      if (G.player.car) {
        var pp = G.player.car.group.position;
        var dx = pp.x - p.x, dz = pp.z - p.z;
        var d2 = dx * dx + dz * dz;
        if (d2 < 4.2 * 4.2 && d2 > 0.001) {
          var d = Math.sqrt(d2);
          var push = (4.2 - d) / 2;
          pp.x += (dx / d) * push; pp.z += (dz / d) * push;
          G.player.car.speed *= 0.82;
          car.speed *= 0.9;
          if (Math.abs(G.player.car.speed) > 8) {
            window.PalmeraBay.vehicles.spawnParticle(pp.x, 1, pp.z, 0xffcc66, 0.4, 1.2, 2);
          }
        }
      } else if (U.dist2(p.x, p.z, px, pz) < 3.2 * 3.2) {
        // a cop car next to a player on foot tries to run them down slowly
        car.speed = Math.min(car.speed, 4);
      }
    }

    // ---- foot officers ------------------------------------------------------
    for (var f = G.footCops.length - 1; f >= 0; f--) {
      var cop = G.footCops[f];
      if (cop.state === 'down') {
        cop.downTime -= dt;
        if (cop.downTime <= 0) {
          G.scene.remove(cop.group);
          G.footCops.splice(f, 1);
        }
        continue;
      }
      var cp2 = cop.group.position;
      if (U.dist2(cp2.x, cp2.z, px, pz) > 170 * 170 || G.wanted === 0) {
        G.scene.remove(cop.group);
        G.footCops.splice(f, 1);
        continue;
      }
      var dx2 = px - cp2.x, dz2 = pz - cp2.z;
      var d3 = Math.sqrt(dx2 * dx2 + dz2 * dz2) || 1;
      var runSpeed = 5.2;
      cp2.x += (dx2 / d3) * runSpeed * dt;
      cp2.z += (dz2 / d3) * runSpeed * dt;
      cop.group.rotation.y = Math.atan2(dx2, dz2);
      var res2 = U.resolveCircle(cp2.x, cp2.z, 0.5);
      cp2.x = res2.x; cp2.z = res2.z;
      cop.walkPhase += dt * 14;
      var sw = Math.sin(cop.walkPhase) * 0.6;
      var ud = cop.group.userData;
      ud.legL.rotation.x = sw; ud.legR.rotation.x = -sw;
      ud.armL.rotation.x = -sw * 0.7; ud.armR.rotation.x = sw * 0.7;
      // arrest: an officer standing on the player for a while busts them
      if (d3 < 1.7) {
        cop.bustTimer += dt;
        if (cop.bustTimer > 1.6) {
          window.PalmeraBay.main.busted();
          return;
        }
      } else {
        cop.bustTimer = 0;
      }
    }

    if (G.wanted > 0 && G.cops.length + G.footCops.length === 0) {
      window.PalmeraBay.audio.stopSiren();
    } else if (G.wanted > 0) {
      window.PalmeraBay.audio.startSiren();
    }
  }

  window.PalmeraBay.police = {
    addWanted: addWanted, clearWanted: clearWanted,
    spawnCopCar: spawnCopCar, spawnFootCop: spawnFootCop, updatePolice: updatePolice
  };
})();
