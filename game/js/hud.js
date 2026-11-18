/* Palmera Bay — HUD: cash, health, ammo, wanted stars, the objective line,
   a live minimap (roads, player, traffic, police, mission marker), banners,
   toasts, the damage flash, and the menu / pause wiring. */
(function () {
  'use strict';
  var G = window.PalmeraBay.G;
  var U = window.PalmeraBay.utils;

  function el(id) { return document.getElementById(id); }
  var toastTimer = null;
  var bannerTimer = null;

  function updateCash() { el('cash-value').textContent = G.cash.toLocaleString('en-US'); }
  function updateHealth() {
    var h = Math.max(0, Math.round(G.player ? G.player.health : 100));
    el('health-bar').style.width = h + '%';
    el('health-text').textContent = h;
    el('health-bar').style.background = h > 50 ? 'linear-gradient(90deg,#37c978,#9be15d)' :
      (h > 25 ? 'linear-gradient(90deg,#e8a13c,#ffd166)' : 'linear-gradient(90deg,#d93b2b,#ff7a5e)');
  }
  function updateAmmo() {
    el('ammo-value').textContent = G.ammo + ' / ∞';
  }
  function updateWanted() {
    var s = '';
    for (var i = 0; i < 5; i++) s += '<span class="' + (i < G.wanted ? 'lit' : 'dim') + '">★</span>';
    el('wanted-stars').innerHTML = s;
  }
  function setObjective(title, text) {
    el('objective-title').textContent = title;
    el('objective-text').textContent = text;
  }
  function updateSpeed(mph) {
    el('speed-value').textContent = Math.round(mph);
  }
  function showSpeed(show) { el('speed-wrap').classList.toggle('hidden', !show); }
  function showCrosshair(show) { el('crosshair').classList.toggle('hidden', !show); }
  function showInteract(text) {
    if (text) {
      el('interact-text').textContent = text;
      el('interact-prompt').classList.remove('hidden');
    } else {
      el('interact-prompt').classList.add('hidden');
    }
  }
  function toast(msg) {
    var t = el('toast');
    t.textContent = msg;
    t.style.opacity = 1;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.style.opacity = 0; }, 3200);
  }
  function showBanner(title, sub, bad) {
    var b = el('banner');
    b.innerHTML = title + (sub ? '<small>' + sub + '</small>' : '');
    b.classList.toggle('bad', !!bad);
    b.classList.remove('hidden');
    if (bannerTimer) clearTimeout(bannerTimer);
    bannerTimer = setTimeout(function () { b.classList.add('hidden'); }, 3400);
  }
  function flashDamage() {
    var v = el('vignette');
    v.style.boxShadow = 'inset 0 0 120px 40px rgba(255,0,0,0.55)';
    setTimeout(function () { v.style.boxShadow = 'inset 0 0 120px 40px rgba(255,0,0,0)'; }, 180);
  }
  function updateClock() {
    var mins = Math.floor(G.clockMinutes) % (24 * 60);
    var h = Math.floor(mins / 60), m = mins % 60;
    el('clock-value').textContent = (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
  }

  // ---- minimap ---------------------------------------------------------------
  var mm = null, mmx = null;
  function drawMinimap() {
    if (!mm) { mm = el('minimap'); mmx = mm.getContext('2d'); }
    if (!G.player) return;
    var W = 200, C = W / 2, SCALE = W / 460; // world -230..230 fits the circle
    mmx.clearRect(0, 0, W, W);
    // sea + sand at the bottom
    mmx.fillStyle = '#12303f'; mmx.fillRect(0, 0, W, W);
    mmx.fillStyle = '#e6d3a3'; mmx.fillRect(0, (168 + 230) * SCALE, W, W);
    // blocks
    mmx.fillStyle = '#3d4a58';
    mmx.fillRect(0, 0, W, (168 + 230) * SCALE);
    // roads
    mmx.strokeStyle = '#20262e'; mmx.lineWidth = 5;
    var roads = window.PalmeraBay.CITY.roads;
    for (var i = 0; i < roads.length; i++) {
      var p = (roads[i] + 230) * SCALE;
      mmx.beginPath(); mmx.moveTo(0, p); mmx.lineTo(W, p); mmx.stroke();
      mmx.beginPath(); mmx.moveTo(p, 0); mmx.lineTo(p, W); mmx.stroke();
    }
    function dot(x, z, color, r) {
      mmx.fillStyle = color;
      mmx.beginPath();
      mmx.arc((x + 230) * SCALE, (z + 230) * SCALE, r, 0, Math.PI * 2);
      mmx.fill();
    }
    // mission marker
    if (G.marker) {
      mmx.fillStyle = '#ffd166';
      mmx.beginPath();
      mmx.arc((G.marker.x + 230) * SCALE, (G.marker.z + 230) * SCALE, 7, 0, Math.PI * 2);
      mmx.fill();
      mmx.strokeStyle = '#fff'; mmx.lineWidth = 2;
      mmx.beginPath();
      mmx.arc((G.marker.x + 230) * SCALE, (G.marker.z + 230) * SCALE, 9, 0, Math.PI * 2);
      mmx.stroke();
    }
    // traffic (white), parked (grey)
    for (var t = 0; t < G.traffic.length; t++) dot(G.traffic[t].group.position.x, G.traffic[t].group.position.z, '#dddddd', 2);
    for (var p2 = 0; p2 < G.parked.length; p2++) dot(G.parked[p2].group.position.x, G.parked[p2].group.position.z, '#888888', 2);
    // police (blue, flashing)
    var flash = Math.floor(G.time * 4) % 2 === 0;
    for (var c = 0; c < G.cops.length; c++) dot(G.cops[c].group.position.x, G.cops[c].group.position.z, flash ? '#4488ff' : '#ff4444', 3);
    // enemies (red)
    for (var e = 0; e < G.enemies.length; e++) {
      if (G.enemies[e].state === 'alive') dot(G.enemies[e].group.position.x, G.enemies[e].group.position.z, '#ff2222', 3);
    }
    // player arrow
    var px = (G.player.pos.x + 230) * SCALE, pz = (G.player.pos.z + 230) * SCALE;
    mmx.save();
    mmx.translate(px, pz);
    mmx.rotate(G.player.heading);
    mmx.fillStyle = '#ffffff';
    mmx.strokeStyle = '#000'; mmx.lineWidth = 1.5;
    mmx.beginPath();
    mmx.moveTo(0, -8); mmx.lineTo(5.5, 6); mmx.lineTo(0, 3); mmx.lineTo(-5.5, 6);
    mmx.closePath(); mmx.fill(); mmx.stroke();
    mmx.restore();
    // north tick
    mmx.fillStyle = '#ffd166';
    mmx.font = 'bold 11px sans-serif';
    mmx.fillText('N', C - 3, 12);
  }

  // ---- menus -------------------------------------------------------------------
  function refreshMenu() {
    var save = window.PalmeraBay.core.loadSave();
    var cont = el('btn-continue');
    if (save) {
      cont.classList.remove('hidden');
      el('continue-label').textContent = 'Mission ' + (save.missionIndex + 1) + ' · $' + save.cash;
    } else {
      cont.classList.add('hidden');
    }
    var list = el('mission-list');
    list.innerHTML = '';
    var defs = window.PalmeraBay.missions.MISSION_DEFS;
    var done = save ? save.missionsDone : 0;
    for (var i = 0; i < defs.length; i++) {
      var li = document.createElement('li');
      li.textContent = (i + 1) + '. ' + defs[i].title + ' — $' + defs[i].reward;
      li.className = i < done ? 'done' : (i === done ? 'next' : 'locked');
      list.appendChild(li);
    }
  }

  function showMenu() {
    el('menu').classList.remove('hidden');
    el('hud').classList.add('hidden');
    el('pause').classList.add('hidden');
    refreshMenu();
  }
  function hideMenu() {
    el('menu').classList.add('hidden');
    el('hud').classList.remove('hidden');
  }

  window.PalmeraBay.hud = {
    updateCash: updateCash, updateHealth: updateHealth, updateAmmo: updateAmmo,
    updateWanted: updateWanted, setObjective: setObjective, updateSpeed: updateSpeed,
    showSpeed: showSpeed, showCrosshair: showCrosshair, showInteract: showInteract,
    toast: toast, showBanner: showBanner, flashDamage: flashDamage,
    updateClock: updateClock, drawMinimap: drawMinimap,
    refreshMenu: refreshMenu, showMenu: showMenu, hideMenu: hideMenu
  };
})();
