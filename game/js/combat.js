/* Palmera Bay — combat: the player's pistol, mission gunmen with return
   fire, health and damage, pickups, muzzle flash and tracers. */
(function () {
  'use strict';
  var G = window.PalmeraBay.G;
  var U = window.PalmeraBay.utils;

  var raycaster = null;
  var fireCooldown = 0;
  var reloadTimer = 0;
  var lastDamageAt = 0;
  var flashLight = null;
  var tracers = [];

  function ensureRaycaster() {
    if (!raycaster) raycaster = new THREE.Raycaster();
    return raycaster;
  }

  function makeEnemy(x, z, opts) {
    opts = opts || {};
    var group = window.PalmeraBay.pedestrians.makePed(x, z,
      { shirt: 0x2d2d2d, pants: 0x1a1a1a, skin: 0xe0ac69, role: 'enemy' }).group;
    // a pistol in the right hand
    var gun = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 0.42),
      new THREE.MeshLambertMaterial({ color: 0x111111 }));
    gun.position.set(0.36, 1.15, 0.3);
    group.add(gun);
    var enemy = {
      group: group, health: 100, state: 'alive',
      shootTimer: 1 + Math.random() * 1.5, walkPhase: Math.random() * 6,
      accuracy: opts.accuracy !== undefined ? opts.accuracy : 0.32,
      damage: opts.damage || 10, dropCash: opts.dropCash !== false
    };
    group.traverse(function (o) { o.userData.enemyRef = enemy; });
    G.enemies.push(enemy);
    return enemy;
  }

  function spawnPickup(x, z, kind, amount) {
    var color = kind === 'health' ? 0xffffff : 0x2ecc71;
    var mesh = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.5, 0.7),
      new THREE.MeshLambertMaterial({ color: color }));
    mesh.position.set(x, 0.5, z);
    mesh.castShadow = true;
    G.scene.add(mesh);
    var p = { mesh: mesh, kind: kind, amount: amount || 25, spin: Math.random() * 6 };
    G.pickups.push(p);
    return p;
  }

  function shoot() {
    if (G.state !== 'playing' || !G.player.onFoot) return;
    if (fireCooldown > 0 || reloadTimer > 0) return;
    if (G.ammo <= 0) { reloadWeapon(); return; }
    fireCooldown = 0.22;
    G.ammo -= 1;
    window.PalmeraBay.audio.playGunshot();
    window.PalmeraBay.hud.updateAmmo();
    // firing a gun in the city draws the law when they are close
    var heard = false;
    for (var i = 0; i < G.cops.length; i++) {
      var cp = G.cops[i].group.position;
      if (U.dist2(cp.x, cp.z, G.player.pos.x, G.player.pos.z) < 90 * 90) { heard = true; break; }
    }
    if (!heard) {
      for (var j = 0; j < G.footCops.length; j++) {
        var fp = G.footCops[j].group.position;
        if (U.dist2(fp.x, fp.z, G.player.pos.x, G.player.pos.z) < 60 * 60) { heard = true; break; }
      }
    }
    if (heard) window.PalmeraBay.police.addWanted(1, 'shots fired');
    window.PalmeraBay.pedestrians.scareNearby(G.player.pos.x, G.player.pos.z, 30);

    // raycast from the camera through the crosshair
    var rc = ensureRaycaster();
    rc.setFromCamera({ x: 0, y: 0 }, G.camera);
    rc.far = 120;
    var targets = [];
    G.enemies.forEach(function (e) { if (e.state === 'alive') targets.push(e.group); });
    G.footCops.forEach(function (c) { if (c.state !== 'down') targets.push(c.group); });
    G.peds.forEach(function (p) { if (p.state !== 'down' && p.state !== 'inCar') targets.push(p.group); });
    // collect building meshes for blocking
    var blockers = [];
    G.scene.traverse(function (o) {
      if (o.isMesh && o.userData.isBuilding) blockers.push(o);
    });
    var hits = rc.intersectObjects(targets.concat(blockers), true);
    var endPoint = null;
    if (hits.length > 0) {
      var hit = hits[0];
      endPoint = hit.point.clone();
      var ref = null;
      var o = hit.object;
      while (o) {
        if (o.userData && o.userData.enemyRef) { ref = o.userData.enemyRef; break; }
        o = o.parent;
      }
      if (ref) {
        damageEnemy(ref, 34, hit.point);
      } else {
        // did we hit a pedestrian or a foot cop?
        var hitPed = null;
        var o2 = hit.object;
        while (o2) {
          if (o2.userData && o2.userData.pedRef) { hitPed = o2.userData.pedRef; break; }
          o2 = o2.parent;
        }
        if (hitPed) {
          if (hitPed.isCop) damageFootCop(hitPed, 34);
          else {
            window.PalmeraBay.pedestrians.knockDown(hitPed);
            window.PalmeraBay.police.addWanted(1, 'shot a pedestrian');
          }
        } else {
          window.PalmeraBay.vehicles.spawnParticle(hit.point.x, hit.point.y, hit.point.z, 0xcccccc, 0.35, 0.8, 1.5);
        }
      }
    } else {
      endPoint = rc.ray.origin.clone().add(rc.ray.direction.clone().multiplyScalar(120));
    }
    // tracer + muzzle flash
    if (endPoint) {
      var from = G.camera.position.clone();
      var geo = new THREE.BufferGeometry().setFromPoints([from, endPoint]);
      var line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.9 }));
      G.scene.add(line);
      tracers.push({ line: line, life: 0.09 });
      if (!flashLight) {
        flashLight = new THREE.PointLight(0xffc861, 0, 14);
        G.scene.add(flashLight);
      }
      flashLight.position.copy(from).add(new THREE.Vector3(0, -0.3, 0));
      flashLight.intensity = 2.2;
    }
  }

  function damageEnemy(enemy, dmg, at) {
    enemy.health -= dmg;
    window.PalmeraBay.vehicles.spawnParticle(at.x, at.y, at.z, 0xff5a4e, 0.5, 1.2, 2);
    if (enemy.health <= 0) {
      enemy.state = 'dead';
      enemy.group.rotation.x = Math.PI / 2 - 0.15;
      enemy.group.position.y = 0.25;
      if (enemy.dropCash) spawnPickup(enemy.group.position.x, enemy.group.position.z, 'cash', 25 + Math.floor(Math.random() * 25));
      window.PalmeraBay.missions.onEnemyDown(enemy);
    }
  }

  function damageFootCop(cop, dmg) {
    cop.health -= dmg;
    if (cop.health <= 0 && cop.state !== 'down') {
      window.PalmeraBay.pedestrians.knockDown(cop);
      window.PalmeraBay.police.addWanted(1, 'shot an officer');
    }
  }

  function reloadWeapon() {
    if (reloadTimer > 0 || G.ammo === G.magSize) return;
    reloadTimer = 0.9;
    window.PalmeraBay.hud.toast('Reloading…');
  }

  function damagePlayer(amount) {
    if (G.state !== 'playing') return;
    G.player.health -= amount;
    lastDamageAt = G.time;
    window.PalmeraBay.hud.updateHealth();
    window.PalmeraBay.hud.flashDamage();
    if (G.player.health <= 0) {
      G.player.health = 0;
      window.PalmeraBay.main.wasted();
    }
  }

  function updateCombat(dt) {
    fireCooldown = Math.max(0, fireCooldown - dt);
    if (reloadTimer > 0) {
      reloadTimer -= dt;
      if (reloadTimer <= 0) { G.ammo = G.magSize; window.PalmeraBay.hud.updateAmmo(); }
    }
    if (flashLight && flashLight.intensity > 0) flashLight.intensity = Math.max(0, flashLight.intensity - dt * 30);
    for (var t = tracers.length - 1; t >= 0; t--) {
      tracers[t].life -= dt;
      if (tracers[t].life <= 0) {
        G.scene.remove(tracers[t].line);
        tracers[t].line.geometry.dispose();
        tracers.splice(t, 1);
      }
    }
    // slow health regen when out of trouble
    if (G.player && G.player.health > 0 && G.player.health < 100 && G.time - lastDamageAt > 6) {
      G.player.health = Math.min(100, G.player.health + 2.5 * dt);
      window.PalmeraBay.hud.updateHealth();
    }
    // enemies: advance, shoot, die
    var px = G.player ? G.player.pos.x : 0;
    var pz = G.player ? G.player.pos.z : 0;
    for (var i = G.enemies.length - 1; i >= 0; i--) {
      var e = G.enemies[i];
      if (e.state === 'dead') {
        e.deadTime = (e.deadTime || 0) + dt;
        if (e.deadTime > 8) {
          G.scene.remove(e.group);
          G.enemies.splice(i, 1);
        }
        continue;
      }
      var p = e.group.position;
      var dx = px - p.x, dz = pz - p.z;
      var d = Math.sqrt(dx * dx + dz * dz) || 1;
      if (d < 45 && G.player.onFoot) {
        e.group.rotation.y = Math.atan2(dx, dz);
        if (d > 18) {
          p.x += (dx / d) * 2.6 * dt;
          p.z += (dz / d) * 2.6 * dt;
          var res = U.resolveCircle(p.x, p.z, 0.5);
          p.x = res.x; p.z = res.z;
          e.walkPhase += dt * 10;
          var sw = Math.sin(e.walkPhase) * 0.5;
          var ud = e.group.userData;
          ud.legL.rotation.x = sw; ud.legR.rotation.x = -sw;
        }
        e.shootTimer -= dt;
        if (e.shootTimer <= 0) {
          e.shootTimer = 1.1 + Math.random() * 1.1;
          // tracer from the gunman toward the player, hit by accuracy roll
          var from = p.clone(); from.y = 1.4;
          var to = new THREE.Vector3(px, 1.2, pz);
          var geo = new THREE.BufferGeometry().setFromPoints([from, to]);
          var line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xff8866, transparent: true, opacity: 0.85 }));
          G.scene.add(line);
          tracers.push({ line: line, life: 0.12 });
          window.PalmeraBay.audio.playGunshot();
          if (Math.random() < e.accuracy) damagePlayer(e.damage);
        }
      }
    }
    // pickups: spin, collect
    for (var k = G.pickups.length - 1; k >= 0; k--) {
      var pk = G.pickups[k];
      pk.spin += dt * 2;
      pk.mesh.rotation.y = pk.spin;
      pk.mesh.position.y = 0.5 + Math.sin(pk.spin * 2) * 0.12;
      if (U.dist2(pk.mesh.position.x, pk.mesh.position.z, px, pz) < 2.4 * 2.4) {
        if (pk.kind === 'cash') {
          if (pk.isMissionCash) {
            // the mission's take is paid at completion, not at pickup
            window.PalmeraBay.hud.toast('Cash bag secured!');
          } else {
            G.cash += pk.amount;
            window.PalmeraBay.hud.updateCash();
            window.PalmeraBay.hud.toast('+$' + pk.amount);
          }
        } else {
          G.player.health = Math.min(100, G.player.health + 40);
          window.PalmeraBay.hud.updateHealth();
          window.PalmeraBay.hud.toast('+40 health');
        }
        window.PalmeraBay.audio.playPickup();
        G.scene.remove(pk.mesh);
        G.pickups.splice(k, 1);
      }
    }
  }

  // tag building meshes so bullets stop at walls (called once after city build)
  function tagBuildings() {
    G.scene.traverse(function (o) {
      if (o.isMesh && o.geometry && o.geometry.type === 'BoxGeometry' && o.scale.y > 6) {
        o.userData.isBuilding = true;
      }
    });
  }

  window.PalmeraBay.combat = {
    makeEnemy: makeEnemy, spawnPickup: spawnPickup, shoot: shoot,
    reloadWeapon: reloadWeapon, damagePlayer: damagePlayer,
    updateCombat: updateCombat, tagBuildings: tagBuildings
  };
})();
