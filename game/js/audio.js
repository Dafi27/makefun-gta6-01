/* Palmera Bay — audio: everything is synthesized with WebAudio.
   No audio files, no network. Engine hum, sirens, gunshots, music loop. */
(function () {
  'use strict';
  var G = window.PalmeraBay.G;

  var AC = null;          // AudioContext, created on first user gesture
  var master = null;
  var musicTimer = null;
  var engineNodes = null;
  var sirenNodes = null;

  function ensureAudio() {
    if (AC) { if (AC.state === 'suspended') AC.resume(); return true; }
    try {
      var Ctor = window.AudioContext || window.webkitAudioContext;
      if (!Ctor) return false;
      AC = new Ctor();
      master = AC.createGain();
      master.gain.value = 0.5;
      master.connect(AC.destination);
      startMusicLoop();
      return true;
    } catch (e) { return false; }
  }

  function noiseBuffer(seconds) {
    var len = Math.floor(AC.sampleRate * seconds);
    var buf = AC.createBuffer(1, len, AC.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  function blip(freq, dur, type, vol, slideTo) {
    if (!AC) return;
    var t = AC.currentTime;
    var o = AC.createOscillator(), g = AC.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(vol || 0.2, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  function playGunshot() {
    if (!AC) return;
    var t = AC.currentTime;
    var src = AC.createBufferSource();
    src.buffer = noiseBuffer(0.18);
    var f = AC.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.setValueAtTime(3200, t);
    f.frequency.exponentialRampToValueAtTime(300, t + 0.16);
    var g = AC.createGain();
    g.gain.setValueAtTime(0.55, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t);
    blip(160, 0.09, 'square', 0.22, 60);
  }

  function playPickup() { blip(660, 0.12, 'sine', 0.25, 990); setTimeout(function () { blip(990, 0.14, 'sine', 0.25, 1320); }, 90); }
  function playMissionJingle() {
    if (!AC) return;
    var notes = [523, 659, 784, 1047];
    notes.forEach(function (n, i) { setTimeout(function () { blip(n, 0.28, 'triangle', 0.3); }, i * 130); });
  }
  function playFailSting() {
    if (!AC) return;
    [392, 370, 349].forEach(function (n, i) { setTimeout(function () { blip(n, 0.4, 'sawtooth', 0.18); }, i * 180); });
  }
  function playClick() { blip(880, 0.06, 'square', 0.12); }
  function playHorn() { blip(370, 0.28, 'sawtooth', 0.16, 370); }
  function playThud() {
    if (!AC) return;
    blip(90, 0.16, 'sine', 0.5, 45);
    var t = AC.currentTime;
    var src = AC.createBufferSource();
    src.buffer = noiseBuffer(0.12);
    var f = AC.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 500;
    var g = AC.createGain();
    g.gain.setValueAtTime(0.35, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t);
  }
  function playBusted() {
    if (!AC) return;
    [220, 207, 196, 185].forEach(function (n, i) { setTimeout(function () { blip(n, 0.5, 'sawtooth', 0.2); }, i * 220); });
  }

  // ---- engine hum: two oscillators whose pitch follows the car speed --------
  function startEngine() {
    if (!AC || engineNodes) return;
    var o1 = AC.createOscillator(), o2 = AC.createOscillator();
    var g = AC.createGain(), f = AC.createBiquadFilter();
    o1.type = 'sawtooth'; o2.type = 'square';
    o1.frequency.value = 55; o2.frequency.value = 110;
    f.type = 'lowpass'; f.frequency.value = 420;
    g.gain.value = 0.0;
    o1.connect(f); o2.connect(f); f.connect(g); g.connect(master);
    o1.start(); o2.start();
    engineNodes = { o1: o1, o2: o2, g: g, f: f };
  }
  function updateEngine(speed01, on) {
    if (!engineNodes) return;
    var t = AC.currentTime;
    engineNodes.g.gain.setTargetAtTime(on ? 0.05 + speed01 * 0.09 : 0.0, t, 0.1);
    engineNodes.o1.frequency.setTargetAtTime(48 + speed01 * 130, t, 0.08);
    engineNodes.o2.frequency.setTargetAtTime(96 + speed01 * 260, t, 0.08);
    engineNodes.f.frequency.setTargetAtTime(380 + speed01 * 900, t, 0.1);
  }
  function stopEngine() {
    if (!engineNodes) return;
    try { engineNodes.o1.stop(); engineNodes.o2.stop(); } catch (e) {}
    engineNodes = null;
  }

  // ---- police siren: alternating two-tone ------------------------------------
  function startSiren() {
    if (!AC || sirenNodes) return;
    var o = AC.createOscillator(), g = AC.createGain();
    o.type = 'triangle'; o.frequency.value = 720;
    g.gain.value = 0.045;
    o.connect(g); g.connect(master);
    o.start();
    var high = true;
    var iv = setInterval(function () {
      if (!sirenNodes) { clearInterval(iv); return; }
      high = !high;
      o.frequency.setTargetAtTime(high ? 720 : 540, AC.currentTime, 0.05);
    }, 420);
    sirenNodes = { o: o, g: g, iv: iv };
  }
  function stopSiren() {
    if (!sirenNodes) return;
    clearInterval(sirenNodes.iv);
    try { sirenNodes.o.stop(); } catch (e) {}
    sirenNodes = null;
  }

  // ---- ambient music: slow sunset-chord pad loop, scheduled ahead ------------
  var CHORDS = [
    [220.0, 261.6, 329.6],   // Am
    [174.6, 220.0, 261.6],   // F
    [196.0, 246.9, 293.7],   // G
    [164.8, 220.0, 246.9]    // Em
  ];
  function startMusicLoop() {
    if (musicTimer) return;
    var chord = 0, step = 0;
    musicTimer = setInterval(function () {
      if (!AC || G.state !== 'playing') return;
      var notes = CHORDS[chord % CHORDS.length];
      // a soft pad note plus a sparse bass note every other step
      var n = notes[step % notes.length];
      blip(n, 1.6, 'sine', 0.05);
      if (step % 2 === 0) blip(notes[0] / 2, 1.8, 'triangle', 0.06);
      step++;
      if (step % 8 === 0) chord++;
    }, 700);
  }

  window.PalmeraBay.audio = {
    ensureAudio: ensureAudio, playGunshot: playGunshot, playPickup: playPickup,
    playMissionJingle: playMissionJingle, playFailSting: playFailSting, playClick: playClick,
    playHorn: playHorn, playThud: playThud, playBusted: playBusted, startEngine: startEngine,
    updateEngine: updateEngine, stopEngine: stopEngine, startSiren: startSiren, stopSiren: stopSiren
  };
})();
