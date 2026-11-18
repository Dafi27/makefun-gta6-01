/* Palmera Bay — vehicles: low-poly cars built from boxes, arcade driving
   physics, road-following traffic, parked cars to steal, and a small
   particle pool for exhaust, smoke and sparks. */
(function () {
  'use strict';
  var G = window.PalmeraBay.G;
  var U = window.PalmeraBay.utils;

  var CAR_COLORS = [0xd94f3d, 0x3fa7c7, 0xffd166, 0x7ee081, 0xf2ead8, 0x2c2f36, 0x8a5fb0, 0xe08a3c, 0x4ec9b0, 0xc0c8d0];
  var TAXI_COLOR = 0xffc21c;

  // ---- particle pool (exhaust puffs, smoke, sparks) ---------------------------
  var particles = [];
  var particleGeo = new THREE.SphereGeometry(0.22, 6, 5);
  function spawnParticle(x, y, z, color, life, size, vy) {
    var p = null;
    for (var i = 0; i < particles.length; i++) {
      if (!particles[i].alive) { p = particles[i]; break; }
    }
    if (!p) {
      if (particles.length >= 120) return;
      p = { mesh: new THREE.Mesh(particleGeo, new THREE.MeshBasicMaterial({ transparent: true })), alive: false };
      G.scene.add(p.mesh);
      particles.push(p);
    }
    p.alive = true; p.life = life; p.maxLife = life;
    p.mesh.position.set(x, y, z);
    p.mesh.material.color.setHex(color);
    p.mesh.material.opacity = 0.9;
    p.mesh.scale.setScalar(size || 1);
    p.vy = vy === undefined ? 1.2 : vy;
    p.vx = (Math.random() - 0.5) * 1.2;
    p.vz = (Math.random() - 0.5) * 1.2;
  }
  function updateParticles(dt) {
    for (var i = 0; i < particles.length; i++) {
      var p = particles[i];
      if (!p.alive) continue;
      p.life -= dt;
      if (p.life <= 0) { p.alive = false; p.mesh.visible = false; continue; }
      p.mesh.visible = true;
      p.mesh.position.x += p.vx * dt;
      p.mesh.position.y += p.vy * dt;
      p.mesh.position.z += p.vz * dt;
      p.mesh.material.opacity = 0.9 * (p.life / p.maxLife);
      var s = p.mesh.scale.x + dt * 1.5;
      p.mesh.scale.setScalar(s);
    }
  }

  // ---- car factory -------------------------------------------------------------
  function buildCarMesh(color, type) {
    var g = new THREE.Group();
    var bodyMat = new THREE.MeshLambertMaterial({ color: color });
    var glassMat = new THREE.MeshLambertMaterial({ color: 0x1c2833 });
    var isVan = type === 'van';
    var isSport = type === 'sport';
    var len = isVan ? 5.0 : (isSport ? 4.4 : 4.2);
    var body = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.72, len), bodyMat);
    body.position.y = 0.62; body.castShadow = true;
    g.add(body);
    var cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.62, isVan ? 2.6 : 2.0), glassMat);
    cabin.position.set(0, 1.25, isVan ? 0.3 : -0.2);
    cabin.castShadow = true;
    g.add(cabin);
    // hood + trunk hints
    var hood = new THREE.Mesh(new THREE.BoxGeometry(1.86, 0.18, 0.9), bodyMat);
    hood.position.set(0, 0.95, len / 2 - 0.5);
    g.add(hood);
    // headlights / taillights
    var hlMat = new THREE.MeshBasicMaterial({ color: 0xfff6c8 });
    var tlMat = new THREE.MeshBasicMaterial({ color: 0xff2a1e });
    [-0.65, 0.65].forEach(function (dx) {
      var hl = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.08), hlMat);
      hl.position.set(dx, 0.68, len / 2 + 0.01); g.add(hl);
      var tl = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.08), tlMat);
      tl.position.set(dx, 0.68, -len / 2 - 0.01); g.add(tl);
    });
    // wheels
    var wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.28, 10);
    var wheelMat = new THREE.MeshLambertMaterial({ color: 0x141414 });
    var wheels = [];
    [[-0.85, len / 2 - 0.85], [0.85, len / 2 - 0.85], [-0.85, -len / 2 + 0.85], [0.85, -len / 2 + 0.85]].forEach(function (pos, idx) {
      var w = new THREE.Mesh(wheelGeo, wheelMat);
      w.rotation.z = Math.PI / 2;
      w.position.set(pos[0], 0.36, pos[1]);
      w.castShadow = true;
      g.add(w);
      wheels.push({ mesh: w, front: idx < 2 });
    });
    if (type === 'taxi') {
      var sign = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.22, 0.4), new THREE.MeshBasicMaterial({ color: 0xffe45e }));
      sign.position.set(0, 1.68, -0.2); g.add(sign);
    }
    if (type === 'cop') {
      var bar = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.14, 0.3), new THREE.MeshBasicMaterial({ color: 0xff2222 }));
      bar.position.set(0, 1.66, -0.2); g.add(bar);
      var bar2 = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.14, 0.3), new THREE.MeshBasicMaterial({ color: 0x2244ff }));
      bar2.position.set(0, 1.66, 0.1); g.add(bar2);
    }
    g.userData.wheels = wheels;
    g.userData.len = len;
    return g;
  }

  function makeCar(x, z, heading, opts) {
    opts = opts || {};
    var type = opts.type || 'sedan';
    var color = opts.color !== undefined ? opts.color : CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)];
    var group = buildCarMesh(color, type);
    group.position.set(x, 0, z);
    group.rotation.y = heading || 0;
    G.scene.add(group);
    var car = {
      group: group, type: type, color: color,
      heading: heading || 0, speed: 0, steer: 0,
      maxSpeed: type === 'sport' ? 34 : (type === 'van' ? 22 : 28),
      accel: type === 'sport' ? 16 : 11,
      isPlayer: false, isCop: type === 'cop', isTraffic: !!opts.traffic,
      isParked: !!opts.parked, stolen: false, damage: 0,
      axis: opts.axis || 'x', dir: opts.dir || 1, lane: opts.lane || 0,
      targetSpeed: opts.targetSpeed || 9,
      driver: null, stuckTime: 0, honked: false
    };
    return car;
  }

  // ---- traffic -----------------------------------------------------------------
  function spawnTraffic(n) {
    var rng = G.rng;
    for (var i = 0; i < n; i++) {
      var road = window.PalmeraBay.CITY.roads[Math.floor(rng() * window.PalmeraBay.CITY.roads.length)];
      var along = -180 + rng() * 360;
      var axis = rng() < 0.5 ? 'x' : 'z';
      var dir = rng() < 0.5 ? 1 : -1;
      var lane = (rng() < 0.5 ? -1 : 1) * 2.6;
      var x = axis === 'x' ? along : road + lane;
      var z = axis === 'x' ? road + lane : along;
      var heading = axis === 'x' ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (dir > 0 ? 0 : Math.PI);
      var type = rng() < 0.08 ? 'taxi' : (rng() < 0.1 ? 'van' : 'sedan');
      var car = makeCar(x, z, heading, { type: type, traffic: true, axis: axis, dir: dir, lane: lane, targetSpeed: 7 + rng() * 5 });
      car.hadDriver = true; // jacking one of these counts as carjacking
      car.speed = car.targetSpeed;
      G.traffic.push(car);
    }
  }

  function spawnParked(n) {
    var rng = G.rng;
    var placed = 0, tries = 0;
    while (placed < n && tries < 200) {
      tries++;
      var road = window.PalmeraBay.CITY.roads[Math.floor(rng() * window.PalmeraBay.CITY.roads.length)];
      var along = -170 + rng() * 340;
      var side = rng() < 0.5 ? -1 : 1;
      var x, z, heading;
      if (rng() < 0.5) { x = road + side * 7.6; z = along; heading = side > 0 ? Math.PI / 2 : -Math.PI / 2; }
      else { x = along; z = road + side * 7.6; heading = side > 0 ? 0 : Math.PI; }
      if (z > 160) continue;
      if (U.pointInCollider(x, z, 3)) continue;
      var type = rng() < 0.12 ? 'sport' : (rng() < 0.12 ? 'pickup' : 'sedan');
      var car = makeCar(x, z, heading, { type: type, parked: true });
      G.parked.push(car);
      placed++;
    }
  }

  function trafficCarAhead(car) {
    var fx = Math.sin(car.heading), fz = Math.cos(car.heading);
    var best = null, bestD = 12;
    var all = G.traffic.concat(G.parked, G.cops);
    for (var i = 0; i < all.length; i++) {
      var o = all[i];
      if (o === car) continue;
      var dx = o.group.position.x - car.group.position.x;
      var dz = o.group.position.z - car.group.position.z;
      var along = dx * fx + dz * fz;
      var side = Math.abs(dx * fz - dz * fx);
      if (along > 0 && along < bestD && side < 2.4) { bestD = along; best = o; }
    }
    return best;
  }

  function updateTraffic(dt) {
    var px = G.player ? G.player.pos.x : 0;
    var pz = G.player ? G.player.pos.z : 0;
    for (var i = G.traffic.length - 1; i >= 0; i--) {
      var car = G.traffic[i];
      var p = car.group.position;
      // respawn far-away cars near the player so streets stay busy
      if (U.dist2(p.x, p.z, px, pz) > 170 * 170) {
        var spot = window.PalmeraBay.city.randomRoadPoint(G.rng, 60);
        var road = U.nearestRoadCoord(spot.x);
        car.axis = Math.abs(spot.x - road) < Math.abs(spot.z - U.nearestRoadCoord(spot.z)) ? 'z' : 'x';
        if (car.axis === 'x') { p.x = spot.x; p.z = road + car.lane; }
        else { p.x = road + car.lane; p.z = spot.z; }
        car.dir = G.rng() < 0.5 ? 1 : -1;
        car.heading = car.axis === 'x' ? (car.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (car.dir > 0 ? 0 : Math.PI);
        car.speed = car.targetSpeed;
        continue;
      }
      // slow down for the car ahead
      var ahead = trafficCarAhead(car);
      var want = ahead ? Math.max(0, (ahead.speed || 0)) : car.targetSpeed;
      car.speed = U.lerp(car.speed, want, dt * 1.5);
      // move along its road
      var step = car.speed * car.dir * dt;
      if (car.axis === 'x') p.x += step; else p.z += step;
      // at an intersection, maybe turn
      var cross = car.axis === 'x' ? U.nearestRoadCoord(p.z) : U.nearestRoadCoord(p.x);
      var alongCoord = car.axis === 'x' ? p.x : p.z;
      var toCross = Math.abs(alongCoord - cross);
      if (toCross < 1.2 && !car.turnedAt) {
        car.turnedAt = cross;
        if (G.rng() < 0.35) {
          car.axis = car.axis === 'x' ? 'z' : 'x';
          car.dir = G.rng() < 0.5 ? 1 : -1;
          car.lane = (G.rng() < 0.5 ? -1 : 1) * 2.6;
          if (car.axis === 'x') p.z = U.nearestRoadCoord(p.z) + car.lane;
          else p.x = U.nearestRoadCoord(p.x) + car.lane;
        }
      } else if (toCross > 4) {
        car.turnedAt = null;
      }
      car.heading = car.axis === 'x' ? (car.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (car.dir > 0 ? 0 : Math.PI);
      car.group.rotation.y = car.heading;
      // spin wheels
      var wheels = car.group.userData.wheels;
      for (var w = 0; w < wheels.length; w++) wheels[w].mesh.rotation.x += car.speed * dt * 1.4;
      // keep inside the city
      p.x = U.clamp(p.x, -205, 205); p.z = U.clamp(p.z, -205, 205);
    }
  }

  // ---- player driving ------------------------------------------------------------
  function updatePlayerCar(dt) {
    var car = G.player.car;
    if (!car) return;
    var p = car.group.position;
    var keys = G.keys;
    var fwd = (keys['w'] || keys['arrowup'] ? 1 : 0) - (keys['s'] || keys['arrowdown'] ? 1 : 0);
    var steerIn = (keys['a'] || keys['arrowleft'] ? 1 : 0) - (keys['d'] || keys['arrowright'] ? 1 : 0);
    var handbrake = !!keys[' '];
    // steering eases toward input, stronger at low speed
    var steerTarget = steerIn * 0.55 * U.clamp(Math.abs(car.speed) / 8, 0.25, 1);
    car.steer = U.lerp(car.steer, steerTarget, dt * 6);
    if (fwd > 0) car.speed += car.accel * dt;
    else if (fwd < 0) car.speed -= (car.speed > 0.5 ? car.accel * 1.4 : car.accel * 0.6) * dt;
    else car.speed -= car.speed * 0.9 * dt;
    if (handbrake) { car.speed -= car.speed * 2.2 * dt; car.steer *= 1.35; }
    car.speed = U.clamp(car.speed, -10, car.maxSpeed);
    if (Math.abs(car.speed) < 0.05) car.speed = 0;
    car.heading += car.steer * (car.speed / 9) * dt * (car.speed < 0 ? -1 : 1);
    var fx = Math.sin(car.heading), fz = Math.cos(car.heading);
    var nx = p.x + fx * car.speed * dt;
    var nz = p.z + fz * car.speed * dt;
    var res = U.resolveCircle(nx, nz, 1.7);
    if (res.hit && Math.abs(car.speed) > 6) {
      car.speed *= 0.45;
      spawnParticle(p.x, 0.8, p.z, 0xffcc66, 0.5, 1.2, 2);
      window.PalmeraBay.audio.playThud();
    }
    p.x = U.clamp(res.x, -205, 205);
    p.z = U.clamp(res.z, -205, 205);
    car.group.rotation.y = car.heading;
    var wheels = car.group.userData.wheels;
    for (var w = 0; w < wheels.length; w++) {
      wheels[w].mesh.rotation.x += car.speed * dt * 1.4;
      if (wheels[w].front) wheels[w].mesh.rotation.y = car.steer * 0.7;
    }
    // exhaust puffs when accelerating hard
    if (fwd > 0 && Math.abs(car.speed) > 4 && Math.random() < 0.3) {
      spawnParticle(p.x - fx * 2.2, 0.5, p.z - fz * 2.2, 0x999999, 0.6, 0.8, 0.8);
    }
    // bump other cars
    var all = G.traffic.concat(G.parked, G.cops);
    for (var i = 0; i < all.length; i++) {
      var o = all[i];
      if (o === car) continue;
      var op = o.group.position;
      var dx = p.x - op.x, dz = p.z - op.z;
      var d2 = dx * dx + dz * dz;
      if (d2 < 4.4 * 4.4 && d2 > 0.001) {
        var d = Math.sqrt(d2);
        var push = (4.4 - d) / 2;
        var ux = dx / d, uz = dz / d;
        p.x += ux * push; p.z += uz * push;
        if (!o.isTraffic) { op.x -= ux * push; op.z -= uz * push; }
        else { op.x -= ux * push * 0.4; op.z -= uz * push * 0.4; }
        var transfer = car.speed * 0.35;
        car.speed *= 0.7;
        if (o.isTraffic) o.speed = Math.max(o.speed, Math.abs(transfer));
        if (Math.abs(transfer) > 4) spawnParticle(p.x, 0.9, p.z, 0xffcc66, 0.4, 1, 2.5);
      }
    }
    G.player.pos.copy(p);
    G.player.heading = car.heading;
    window.PalmeraBay.audio.updateEngine(Math.abs(car.speed) / car.maxSpeed, true);
  }

  function nearestEnterableCar(maxD) {
    var p = G.player.pos;
    var best = null, bestD = maxD || 4;
    var list = G.parked.concat(G.traffic);
    for (var i = 0; i < list.length; i++) {
      var c = list[i];
      var cp = c.group.position;
      var d = Math.sqrt(U.dist2(p.x, p.z, cp.x, cp.z));
      if (d < bestD) { bestD = d; best = c; }
    }
    return best;
  }

  function enterCar(car) {
    var Gp = G.player;
    Gp.car = car;
    car.isPlayer = true;
    car.isParked = false;
    car.stolen = true;
    var idx = G.parked.indexOf(car);
    if (idx >= 0) G.parked.splice(idx, 1);
    var ti = G.traffic.indexOf(car);
    if (ti >= 0) G.traffic.splice(ti, 1);
    Gp.group.visible = false;
    Gp.onFoot = false;
    car.speed = 0;
    window.PalmeraBay.audio.startEngine();
    // stealing an occupied car in front of the law draws heat
    if (car.hadDriver) {
      window.PalmeraBay.police.addWanted(1, 'carjacking');
    }
  }

  function exitCar() {
    var car = G.player.car;
    if (!car) return;
    var p = car.group.position;
    var sx = p.x + Math.cos(car.heading) * 2.4;
    var sz = p.z - Math.sin(car.heading) * 2.4;
    var res = U.resolveCircle(sx, sz, 0.7);
    G.player.pos.set(res.x, 0, res.z);
    G.player.group.position.copy(G.player.pos);
    G.player.group.visible = true;
    G.player.onFoot = true;
    G.player.heading = car.heading;
    car.isPlayer = false;
    car.speed = 0;
    G.player.car = null;
    window.PalmeraBay.audio.updateEngine(0, false);
  }

  window.PalmeraBay.vehicles = {
    makeCar: makeCar, spawnTraffic: spawnTraffic, spawnParked: spawnParked,
    updateTraffic: updateTraffic, updatePlayerCar: updatePlayerCar,
    nearestEnterableCar: nearestEnterableCar, enterCar: enterCar, exitCar: exitCar,
    spawnParticle: spawnParticle, updateParticles: updateParticles, CAR_COLORS: CAR_COLORS
  };
})();
