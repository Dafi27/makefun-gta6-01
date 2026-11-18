/* Palmera Bay — city: a sun-soaked coastal grid city, built procedurally
   from a fixed seed so every load shows the same Palmera Bay. Roads, blocks,
   towers, palms, lamps, a beach and the sea. No textures are loaded from
   files; every facade and the whole ground map are drawn on canvases. */
(function () {
  'use strict';
  var G = window.PalmeraBay.G;
  var CITY = window.PalmeraBay.CITY;
  var U = window.PalmeraBay.utils;

  var WORLD = 420; // ground plane size, -210..210

  function worldToPx(v) { return (v + WORLD / 2) / WORLD * 2048; }

  // ---- ground map: one big canvas texture, roads + sidewalks + beach --------
  function makeGroundTexture() {
    var c = document.createElement('canvas');
    c.width = 2048; c.height = 2048;
    var x = c.getContext('2d');
    var rng = U.mulberry32(777);
    // base: pale sidewalk concrete
    x.fillStyle = '#a8a49a'; x.fillRect(0, 0, 2048, 2048);
    // block interiors: varied concrete / lots
    var blockTints = ['#b0a894', '#a39a86', '#b5ad9c', '#9d9684', '#b3a58c'];
    for (var bi = -4; bi <= 4; bi++) {
      for (var bj = -4; bj <= 4; bj++) {
        var cx = (bi * CITY.pitch), cz = (bj * CITY.pitch);
        if (cz > 150) continue; // beach blocks handled below
        x.fillStyle = blockTints[Math.floor(rng() * blockTints.length)];
        var s = 30;
        x.fillRect(worldToPx(cx - s / 2), worldToPx(cz - s / 2), worldToPx(s) - worldToPx(0), worldToPx(s) - worldToPx(0));
      }
    }
    // central park block (0,0): green lawn + paths
    x.fillStyle = '#5d8a4a';
    x.fillRect(worldToPx(-15), worldToPx(-15), worldToPx(30) - worldToPx(0), worldToPx(30) - worldToPx(0));
    x.fillStyle = '#c9b18a';
    x.fillRect(worldToPx(-15), worldToPx(-1.5), worldToPx(30) - worldToPx(0), worldToPx(3) - worldToPx(0));
    x.fillRect(worldToPx(-1.5), worldToPx(-15), worldToPx(3) - worldToPx(0), worldToPx(30) - worldToPx(0));
    // beach sand, south edge
    x.fillStyle = '#e6d3a3';
    x.fillRect(0, worldToPx(168), 2048, 2048 - worldToPx(168));
    x.fillStyle = '#dcc98f';
    for (var d = 0; d < 260; d++) {
      x.fillRect(rng() * 2048, worldToPx(168) + rng() * (2048 - worldToPx(168)), 3, 3);
    }
    // roads: asphalt strips
    x.fillStyle = '#3a3d42';
    for (var r = 0; r < CITY.roads.length; r++) {
      var rc = CITY.roads[r];
      var w = worldToPx(CITY.roadW) - worldToPx(0);
      x.fillRect(0, worldToPx(rc - CITY.roadW / 2), 2048, w);
      x.fillRect(worldToPx(rc - CITY.roadW / 2), 0, w, 2048);
    }
    // lane dashes + edge lines
    x.fillStyle = '#e8c33c';
    for (var r2 = 0; r2 < CITY.roads.length; r2++) {
      var rc2 = CITY.roads[r2];
      for (var d2 = -200; d2 < 200; d2 += 10) {
        x.fillRect(worldToPx(d2), worldToPx(rc2 - 0.35), worldToPx(5) - worldToPx(0), worldToPx(0.7) - worldToPx(0));
        x.fillRect(worldToPx(rc2 - 0.35), worldToPx(d2), worldToPx(0.7) - worldToPx(0), worldToPx(5) - worldToPx(0));
      }
    }
    x.strokeStyle = 'rgba(255,255,255,0.55)'; x.lineWidth = 3;
    for (var r3 = 0; r3 < CITY.roads.length; r3++) {
      var rc3 = CITY.roads[r3];
      var off = CITY.roadW / 2 - 0.8;
      x.beginPath();
      x.moveTo(0, worldToPx(rc3 - off)); x.lineTo(2048, worldToPx(rc3 - off));
      x.moveTo(0, worldToPx(rc3 + off)); x.lineTo(2048, worldToPx(rc3 + off));
      x.moveTo(worldToPx(rc3 - off), 0); x.lineTo(worldToPx(rc3 - off), 2048);
      x.moveTo(worldToPx(rc3 + off), 0); x.lineTo(worldToPx(rc3 + off), 2048);
      x.stroke();
    }
    // crosswalks at every intersection
    x.fillStyle = 'rgba(255,255,255,0.85)';
    for (var i = 0; i < CITY.roads.length; i++) {
      for (var j = 0; j < CITY.roads.length; j++) {
        var ix = CITY.roads[i], iz = CITY.roads[j];
        for (var s2 = -4; s2 <= 4; s2 += 2) {
          x.fillRect(worldToPx(ix + s2 - 0.8), worldToPx(iz - 5.5), worldToPx(1.6) - worldToPx(0), worldToPx(2.2) - worldToPx(0));
          x.fillRect(worldToPx(ix + s2 - 0.8), worldToPx(iz + 3.3), worldToPx(1.6) - worldToPx(0), worldToPx(2.2) - worldToPx(0));
          x.fillRect(worldToPx(ix - 5.5), worldToPx(iz + s2 - 0.8), worldToPx(2.2) - worldToPx(0), worldToPx(1.6) - worldToPx(0));
          x.fillRect(worldToPx(ix + 3.3), worldToPx(iz + s2 - 0.8), worldToPx(2.2) - worldToPx(0), worldToPx(1.6) - worldToPx(0));
        }
      }
    }
    var tex = new THREE.CanvasTexture(c);
    tex.anisotropy = 4;
    return tex;
  }

  // ---- building facades -------------------------------------------------------
  function makeFacadeTexture(base, lit) {
    var c = document.createElement('canvas');
    c.width = 128; c.height = 256;
    var x = c.getContext('2d');
    x.fillStyle = base; x.fillRect(0, 0, 128, 256);
    var rng = U.mulberry32(base.length * 131 + lit * 7);
    for (var row = 0; row < 12; row++) {
      for (var col = 0; col < 6; col++) {
        var on = rng() < lit;
        x.fillStyle = on ? '#ffd98a' : (rng() < 0.5 ? '#2c3e50' : '#5a7086');
        x.fillRect(8 + col * 20, 10 + row * 20, 13, 12);
      }
    }
    x.fillStyle = 'rgba(0,0,0,0.18)';
    x.fillRect(0, 0, 128, 8);
    var tex = new THREE.CanvasTexture(c);
    return tex;
  }

  var facadeMats = [];
  function facadeMaterials() {
    if (facadeMats.length) return facadeMats;
    var defs = [
      ['#c98f5f', 0.25], ['#8fa8bf', 0.35], ['#b8b0a0', 0.2],
      ['#7d9b76', 0.3], ['#a86a5a', 0.25], ['#6f7f95', 0.4]
    ];
    for (var i = 0; i < defs.length; i++) {
      facadeMats.push(new THREE.MeshLambertMaterial({ map: makeFacadeTexture(defs[i][0], defs[i][1]) }));
    }
    return facadeMats;
  }

  function makePalm() {
    var g = new THREE.Group();
    var trunkMat = new THREE.MeshLambertMaterial({ color: 0x8a6b46 });
    var leafMat = new THREE.MeshLambertMaterial({ color: 0x3f8f4f });
    var trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.3, 4.2, 6), trunkMat);
    trunk.position.y = 2.1; trunk.rotation.z = 0.08;
    g.add(trunk);
    for (var i = 0; i < 6; i++) {
      var leaf = new THREE.Mesh(new THREE.ConeGeometry(0.7, 2.6, 4), leafMat);
      var a = (i / 6) * Math.PI * 2;
      leaf.position.set(Math.cos(a) * 0.9, 4.5, Math.sin(a) * 0.9);
      leaf.rotation.set(Math.sin(a) * 1.1, 0, -Math.cos(a) * 1.1);
      leaf.scale.set(1, 1, 0.35);
      g.add(leaf);
    }
    var nuts = new THREE.Mesh(new THREE.SphereGeometry(0.35, 6, 5), new THREE.MeshLambertMaterial({ color: 0x6b4a2a }));
    nuts.position.y = 4.1; g.add(nuts);
    return g;
  }

  function makeLamp() {
    var g = new THREE.Group();
    var mat = new THREE.MeshLambertMaterial({ color: 0x2c2f36 });
    var pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 5.2, 6), mat);
    pole.position.y = 2.6; g.add(pole);
    var arm = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.1, 0.1), mat);
    arm.position.set(0.6, 5.1, 0); g.add(arm);
    var bulb = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xfff2c0 }));
    bulb.position.set(1.25, 5.0, 0); g.add(bulb);
    return g;
  }

  function makeBench() {
    var g = new THREE.Group();
    var wood = new THREE.MeshLambertMaterial({ color: 0x7a5230 });
    var seat = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.12, 0.55), wood);
    seat.position.y = 0.45; g.add(seat);
    var back = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.6, 0.1), wood);
    back.position.set(0, 0.85, -0.25); g.add(back);
    var legMat = new THREE.MeshLambertMaterial({ color: 0x333333 });
    [-0.8, 0.8].forEach(function (dx) {
      var leg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.45, 0.5), legMat);
      leg.position.set(dx, 0.22, 0); g.add(leg);
    });
    return g;
  }

  // ---- the city ---------------------------------------------------------------
  function buildCity(scene) {
    var rng = U.mulberry32(20240);
    var mats = facadeMaterials();

    // sky dome: warm sunset gradient
    var skyC = document.createElement('canvas');
    skyC.width = 4; skyC.height = 256;
    var sx = skyC.getContext('2d');
    var grad = sx.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, '#2f5d8f'); grad.addColorStop(0.45, '#7fb2d9');
    grad.addColorStop(0.72, '#f7c98b'); grad.addColorStop(1, '#ff9e5e');
    sx.fillStyle = grad; sx.fillRect(0, 0, 4, 256);
    var skyTex = new THREE.CanvasTexture(skyC);
    var sky = new THREE.Mesh(new THREE.SphereGeometry(900, 16, 12),
      new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false }));
    scene.add(sky);

    // ground
    var ground = new THREE.Mesh(
      new THREE.PlaneGeometry(WORLD, WORLD),
      new THREE.MeshLambertMaterial({ map: makeGroundTexture() }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    // sea, south of the beach
    var sea = new THREE.Mesh(new THREE.PlaneGeometry(900, 160),
      new THREE.MeshPhongMaterial({ color: 0x1e6f8e, transparent: true, opacity: 0.92, shininess: 120 }));
    sea.rotation.x = -Math.PI / 2;
    sea.position.set(0, -0.25, 190 + 80);
    scene.add(sea);
    G.sea = sea;

    // sun + sky light
    var sun = new THREE.DirectionalLight(0xffe2b0, 1.15);
    sun.position.set(160, 240, 90);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -220; sun.shadow.camera.right = 220;
    sun.shadow.camera.top = 220; sun.shadow.camera.bottom = -220;
    sun.shadow.camera.far = 700;
    scene.add(sun);
    scene.add(new THREE.HemisphereLight(0xbfd9ff, 0x8a6a4a, 0.75));
    scene.fog = new THREE.Fog(0xf2c98f, 260, 700);

    // buildings, block by block
    var boxGeo = new THREE.BoxGeometry(1, 1, 1);
    var roofMat = new THREE.MeshLambertMaterial({ color: 0x5a5a58 });
    for (var bi = -4; bi <= 4; bi++) {
      for (var bj = -4; bj <= 4; bj++) {
        var cx = bi * CITY.pitch, cz = bj * CITY.pitch;
        if (bi === 0 && bj === 0) continue;      // central park
        if (cz >= 160) continue;                  // beach
        var distC = Math.sqrt(cx * cx + cz * cz);
        var count = 1 + Math.floor(rng() * 3);
        for (var b = 0; b < count; b++) {
          var w = 8 + rng() * 8, d = 8 + rng() * 8;
          var h = distC < 70 ? 22 + rng() * 26 : 8 + rng() * 16;
          var ox = (rng() - 0.5) * (30 - w - 4);
          var oz = (rng() - 0.5) * (30 - d - 4);
          var px = cx + ox, pz = cz + oz;
          var baseMat = mats[Math.floor(rng() * mats.length)];
          // repeat the facade so windows stay the same size on every tower
          var mat = baseMat.clone();
          mat.map = baseMat.map.clone();
          mat.map.needsUpdate = true;
          mat.map.wrapS = THREE.RepeatWrapping;
          mat.map.wrapT = THREE.RepeatWrapping;
          mat.map.repeat.set(Math.max(1, Math.round(w / 10)), Math.max(1, Math.round(h / 10)));
          var mesh = new THREE.Mesh(boxGeo, mat);
          mesh.scale.set(w, h, d);
          mesh.position.set(px, h / 2, pz);
          mesh.castShadow = true; mesh.receiveShadow = true;
          scene.add(mesh);
          var roof = new THREE.Mesh(boxGeo, roofMat);
          roof.scale.set(w * 0.55, 1.2, d * 0.55);
          roof.position.set(px, h + 0.6, pz);
          scene.add(roof);
          if (rng() < 0.4) {
            var ac = new THREE.Mesh(boxGeo, roofMat);
            ac.scale.set(1.6, 0.8, 1.6);
            ac.position.set(px + w * 0.2, h + 0.4, pz - d * 0.2);
            scene.add(ac);
          }
          G.colliders.push({ minX: px - w / 2, maxX: px + w / 2, minZ: pz - d / 2, maxZ: pz + d / 2 });
          G.buildings.push({ x: px, z: pz, w: w, d: d, h: h });
        }
      }
    }

    // billboards with the city's own names, mounted on tall downtown towers
    var tall = G.buildings.filter(function (b) { return b.h > 24; }).slice(0, 3);
    var ads = [['PALMERA BAY', '#ff7a3d', '#ffffff'], ['HOTEL PALMERA', '#1e6f8e', '#ffe9a8'], ["DANTE'S GARAGE", '#2d2d2d', '#ffd166']];
    tall.forEach(function (b, idx) {
      var ad = ads[idx % ads.length];
      var bc = document.createElement('canvas');
      bc.width = 512; bc.height = 128;
      var bx = bc.getContext('2d');
      bx.fillStyle = ad[1]; bx.fillRect(0, 0, 512, 128);
      bx.fillStyle = ad[2]; bx.font = 'bold 54px Arial'; bx.textAlign = 'center'; bx.textBaseline = 'middle';
      bx.fillText(ad[0], 256, 66);
      var board = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(b.w * 0.9, 16), 4.5),
        new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(bc) }));
      board.position.set(b.x, b.h - 3, b.z + b.d / 2 + 0.15);
      scene.add(board);
    });

    // palms along the roads + in the park
    for (var p = 0; p < 90; p++) {
      var road = CITY.roads[Math.floor(rng() * CITY.roads.length)];
      var along = -190 + rng() * 380;
      var side = rng() < 0.5 ? -1 : 1;
      var palm = makePalm();
      if (rng() < 0.5) { palm.position.set(road + side * 7.2, 0, along); }
      else { palm.position.set(along, 0, road + side * 7.2); }
      if (palm.position.z > 165) continue;
      palm.rotation.y = rng() * Math.PI * 2;
      palm.scale.setScalar(0.85 + rng() * 0.5);
      scene.add(palm);
    }
    for (var pk = 0; pk < 10; pk++) {
      var pp = makePalm();
      pp.position.set((rng() - 0.5) * 24, 0, (rng() - 0.5) * 24);
      pp.scale.setScalar(0.9 + rng() * 0.4);
      scene.add(pp);
    }

    // street lamps at intersections
    for (var li = 0; li < CITY.roads.length; li++) {
      for (var lj = 0; lj < CITY.roads.length; lj++) {
        if ((li + lj) % 2 === 0) continue;
        var lamp = makeLamp();
        lamp.position.set(CITY.roads[li] + 6.4, 0, CITY.roads[lj] + 6.4);
        lamp.rotation.y = Math.PI;
        scene.add(lamp);
      }
    }

    // park benches + a fountain
    for (var bn = 0; bn < 6; bn++) {
      var bench = makeBench();
      bench.position.set(-10 + (bn % 3) * 10, 0, bn < 3 ? -8 : 8);
      bench.rotation.y = bn < 3 ? 0 : Math.PI;
      scene.add(bench);
    }
    var fountain = new THREE.Mesh(new THREE.CylinderGeometry(4, 4.4, 0.9, 16),
      new THREE.MeshLambertMaterial({ color: 0x9a938a }));
    fountain.position.set(0, 0.45, 0); fountain.castShadow = true;
    scene.add(fountain);
    var fwater = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.4, 0.3, 16),
      new THREE.MeshPhongMaterial({ color: 0x3fa7c7, shininess: 140 }));
    fwater.position.set(0, 0.95, 0);
    scene.add(fwater);
    G.colliders.push({ minX: -4.4, maxX: 4.4, minZ: -4.4, maxZ: 4.4 });

    // beach props: umbrellas + a lifeguard tower
    for (var u = 0; u < 8; u++) {
      var ux = -160 + u * 44 + rng() * 10;
      var pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.4, 6),
        new THREE.MeshLambertMaterial({ color: 0xdddddd }));
      pole.position.set(ux, 1.2, 178); scene.add(pole);
      var umb = new THREE.Mesh(new THREE.ConeGeometry(2.2, 1.1, 8),
        new THREE.MeshLambertMaterial({ color: [0xff5a4e, 0xffd166, 0x3fa7c7, 0x7ee081][u % 4] }));
      umb.position.set(ux, 2.8, 178); scene.add(umb);
    }
    var tower = new THREE.Group();
    var tmat = new THREE.MeshLambertMaterial({ color: 0xf2ead8 });
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (o) {
      var leg = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 3.4, 6), tmat);
      leg.position.set(o[0], 1.7, o[1]); tower.add(leg);
    });
    var cab = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.6, 2.2), tmat);
    cab.position.y = 4.2; tower.add(cab);
    var troof = new THREE.Mesh(new THREE.ConeGeometry(2.2, 1, 4), new THREE.MeshLambertMaterial({ color: 0xd94f3d }));
    troof.position.y = 5.5; troof.rotation.y = Math.PI / 4; tower.add(troof);
    tower.position.set(30, 0, 182);
    scene.add(tower);
    G.colliders.push({ minX: 28.6, maxX: 31.4, minZ: 180.6, maxZ: 183.4 });

    // a few crates and dumpsters in alley blocks for cover
    var crateMat = new THREE.MeshLambertMaterial({ color: 0x8a6f4d });
    for (var cr = 0; cr < 14; cr++) {
      var bx = CITY.roads[Math.floor(rng() * CITY.roads.length)];
      var bz = CITY.roads[Math.floor(rng() * CITY.roads.length)];
      var crate = new THREE.Mesh(boxGeo, crateMat);
      var cs = 1 + rng() * 1.2;
      crate.scale.set(cs, cs, cs);
      crate.position.set(bx + (rng() - 0.5) * 20, cs / 2, bz + (rng() - 0.5) * 20);
      if (crate.position.z > 160 || U.pointInCollider(crate.position.x, crate.position.z, 2)) continue;
      crate.castShadow = true;
      scene.add(crate);
      G.colliders.push({ minX: crate.position.x - cs / 2, maxX: crate.position.x + cs / 2, minZ: crate.position.z - cs / 2, maxZ: crate.position.z + cs / 2 });
    }
  }

  // Pick a random point on a road (used for spawns).
  function randomRoadPoint(rng, margin) {
    margin = margin || 0;
    var road = CITY.roads[Math.floor(rng() * CITY.roads.length)];
    var along = -180 + margin + rng() * (360 - margin * 2);
    if (rng() < 0.5) return { x: road, z: along };
    return { x: along, z: road };
  }

  window.PalmeraBay.city = { buildCity: buildCity, randomRoadPoint: randomRoadPoint };
})();
