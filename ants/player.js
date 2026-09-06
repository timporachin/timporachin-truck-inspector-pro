/* Ant Ranchers — player. Owns the clock, the controls and the narration.
   All drawing lives in scene.js; this file only decides which time to draw. */
(function () {
  'use strict';

  var film = window.AntFilm;
  var canvas = document.getElementById('film');
  var ctx = canvas.getContext('2d');
  var params = new URLSearchParams(location.search);
  var RENDER = params.get('render') === '1';

  /* ------------------------------------------------------- render mode -- */
  /* The offline video renderer drives frames itself: no clock, no chrome,
     a canvas pinned to exactly 1280x720 at device ratio 1. */
  if (RENDER) {
    document.body.classList.add('render');
    var scale = Math.max(1, Math.min(4, parseFloat(params.get('scale')) || 1));
    canvas.width = film.W * scale;
    canvas.height = film.H * scale;
    canvas.style.width = (film.W * scale) + 'px';
    canvas.style.height = (film.H * scale) + 'px';
    window.renderFrame = function (t) {
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      film.drawFrame(ctx, t);
    };
    window.filmDuration = film.duration;
    window.filmScale = scale;
    window.filmReady = true;
    window.renderFrame(0);
    return;
  }

  /* ------------------------------------------------------------ state -- */

  var el = {
    screen: document.getElementById('screen'),
    bigPlay: document.getElementById('bigPlay'),
    playPause: document.getElementById('playPause'),
    restart: document.getElementById('restart'),
    scrub: document.getElementById('scrub'),
    fill: document.getElementById('fill'),
    knob: document.getElementById('knob'),
    ticks: document.getElementById('ticks'),
    time: document.getElementById('time'),
    speed: document.getElementById('speed'),
    narrate: document.getElementById('narrate'),
    capToggle: document.getElementById('capToggle'),
    fs: document.getElementById('fs'),
    chapters: document.getElementById('chapters'),
    cc: document.getElementById('cc'),
    narration: document.getElementById('narration')
  };

  var t = 0;
  var playing = false;
  var rate = 1;
  var captionsOn = true;
  var narrating = false;
  var lastFrameTime = 0;
  var activeChapter = -1;

  var RATES = [1, 1.5, 0.5];
  var rateIndex = 0;

  /* The narration is a recorded track built from the same caption list the
     film paints, so the voice and the words on screen cannot drift apart.
     If it fails to load, the button says so rather than silently doing nothing. */
  var narrationBroken = false;
  el.narration.addEventListener('error', function () {
    narrationBroken = true;
    narrating = false;
    el.narrate.disabled = true;
    el.narrate.setAttribute('aria-pressed', 'false');
    el.narrate.title = 'narration.mp3 could not be loaded';
  });

  var reduceMotion = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* -------------------------------------------------------- the canvas -- */

  function sizeCanvas() {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var rect = canvas.getBoundingClientRect();
    var w = Math.max(1, Math.round(rect.width * dpr));
    var h = Math.max(1, Math.round(rect.height * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    draw();
  }

  function draw() {
    /* the film is authored at exactly 1280x720; letterbox it into whatever
       the canvas backing store happens to be */
    var sx = canvas.width / film.W;
    var sy = canvas.height / film.H;
    var s = Math.min(sx, sy);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(s, 0, 0, s, (canvas.width - film.W * s) / 2, (canvas.height - film.H * s) / 2);
    film.drawFrame(ctx, t);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  /* ------------------------------------------------------------- clock -- */

  function tick(now) {
    if (playing) {
      var dt = lastFrameTime ? (now - lastFrameTime) / 1000 : 0;
      lastFrameTime = now;
      /* a long tab-switch shouldn't fast-forward the film */
      t += Math.min(dt, 0.25) * rate;
      if (t >= film.duration) {
        t = film.duration;
        setPlaying(false);
      }
      draw();
      syncUi();
      syncNarration(false);
    }
    requestAnimationFrame(tick);
  }

  function setPlaying(next) {
    if (playing === next) return;
    playing = next;
    lastFrameTime = 0;
    el.bigPlay.hidden = playing || t > 0.02;
    el.playPause.setAttribute('aria-label', playing ? 'Pause' : 'Play');
    el.playPause.firstElementChild.className = 'ico ' + (playing ? 'pause' : 'play');
    if (playing) syncNarration(true); else stopNarration();
  }

  function seek(next, keepPlaying) {
    t = Math.max(0, Math.min(film.duration, next));
    if (!keepPlaying) lastFrameTime = 0;
    syncNarration(true);
    el.bigPlay.hidden = playing || t > 0.02;
    draw();
    syncUi();
  }

  /* --------------------------------------------------------- narration -- */

  /* The film's clock stays the master; the audio element is kept alongside it
     and only corrected when it drifts audibly. */
  var DRIFT = 0.28;

  function syncNarration(force) {
    if (narrationBroken) return;
    var audio = el.narration;
    if (!narrating || !playing) {
      if (!audio.paused) audio.pause();
      return;
    }
    if (audio.playbackRate !== rate) audio.playbackRate = rate;
    if (force || Math.abs(audio.currentTime - t) > DRIFT) {
      try { audio.currentTime = t; } catch (e) { /* not seekable yet */ }
    }
    if (audio.paused) {
      var p = audio.play();
      if (p && p.catch) p.catch(function () { /* autoplay policy; the toggle retries */ });
    }
  }

  function stopNarration() {
    if (!narrationBroken && !el.narration.paused) el.narration.pause();
  }

  /* ------------------------------------------------------------- chrome -- */

  function fmt(sec) {
    var s = Math.max(0, Math.floor(sec));
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }

  function syncUi() {
    var pct = (t / film.duration) * 100;
    el.fill.style.width = pct + '%';
    el.knob.style.left = pct + '%';
    el.time.textContent = fmt(t) + ' / ' + fmt(film.duration);
    el.scrub.setAttribute('aria-valuenow', Math.round(pct));
    el.scrub.setAttribute('aria-valuetext', fmt(t) + ' of ' + fmt(film.duration));

    var cap = film.captionAt(t);
    var capText = cap ? cap.text : '';
    if (el.cc.textContent !== capText) el.cc.textContent = capText;

    var sc = film.sceneAt(t);
    if (sc.index !== activeChapter) {
      activeChapter = sc.index;
      var btns = el.chapters.children;
      for (var i = 0; i < btns.length; i++) {
        btns[i].setAttribute('aria-current', i === activeChapter ? 'true' : 'false');
      }
    }
  }

  function buildChapters() {
    film.scenes.forEach(function (sc, i) {
      var b = document.createElement('button');
      b.type = 'button';
      b.innerHTML = '<b>' + sc.title + '</b> <span>' + fmt(sc.start) + '</span>';
      b.addEventListener('click', function () { seek(sc.start + 0.01); });
      el.chapters.appendChild(b);

      var tick = document.createElement('i');
      tick.style.left = (sc.start / film.duration * 100) + '%';
      if (i > 0) el.ticks.appendChild(tick);
    });
  }

  /* ------------------------------------------------------------- events -- */

  el.playPause.addEventListener('click', function () { setPlaying(!playing); });
  el.bigPlay.addEventListener('click', function () { setPlaying(true); });
  el.restart.addEventListener('click', function () { seek(0); setPlaying(true); });

  el.speed.addEventListener('click', function () {
    rateIndex = (rateIndex + 1) % RATES.length;
    rate = RATES[rateIndex];
    el.speed.innerHTML = rate + '&times;';
    syncNarration(false);
  });

  el.narrate.addEventListener('click', function () {
    if (narrationBroken) return;
    narrating = !narrating;
    el.narrate.setAttribute('aria-pressed', String(narrating));
    if (narrating) syncNarration(true); else stopNarration();
  });

  el.capToggle.addEventListener('click', function () {
    captionsOn = !captionsOn;
    el.capToggle.setAttribute('aria-pressed', String(captionsOn));
    /* captions are painted into the frame, so ask the film to skip them */
    film.showCaptions = captionsOn;
    draw();
  });

  el.fs.addEventListener('click', function () {
    /* embedded contexts can refuse fullscreen outright; don't let the
       rejected promise surface as an unhandled error */
    try {
      if (document.fullscreenElement) {
        var exit = document.exitFullscreen();
        if (exit && exit.catch) exit.catch(function () {});
      } else if (el.screen.requestFullscreen) {
        var enter = el.screen.requestFullscreen();
        if (enter && enter.catch) enter.catch(function () {});
      }
    } catch (e) { /* nothing to do but stay windowed */ }
  });

  /* scrubbing */
  var dragging = false;

  function seekFromPointer(e) {
    var r = el.scrub.getBoundingClientRect();
    var x = (e.clientX - r.left) / r.width;
    seek(Math.max(0, Math.min(1, x)) * film.duration, true);
  }

  el.scrub.addEventListener('pointerdown', function (e) {
    dragging = true;
    el.scrub.setPointerCapture(e.pointerId);
    seekFromPointer(e);
  });
  el.scrub.addEventListener('pointermove', function (e) { if (dragging) seekFromPointer(e); });
  el.scrub.addEventListener('pointerup', function (e) {
    dragging = false;
    if (el.scrub.hasPointerCapture(e.pointerId)) el.scrub.releasePointerCapture(e.pointerId);
  });
  el.scrub.addEventListener('pointercancel', function () { dragging = false; });

  el.scrub.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowLeft') { seek(t - 5, playing); e.preventDefault(); }
    if (e.key === 'ArrowRight') { seek(t + 5, playing); e.preventDefault(); }
    if (e.key === 'Home') { seek(0); e.preventDefault(); }
    if (e.key === 'End') { seek(film.duration); e.preventDefault(); }
  });

  document.addEventListener('keydown', function (e) {
    var tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea') return;
    switch (e.key) {
      case ' ': case 'k': setPlaying(!playing); e.preventDefault(); break;
      case 'ArrowLeft': if (e.target !== el.scrub) { seek(t - 5, playing); e.preventDefault(); } break;
      case 'ArrowRight': if (e.target !== el.scrub) { seek(t + 5, playing); e.preventDefault(); } break;
      case ',': seek(t - 1 / 30, playing); e.preventDefault(); break;
      case '.': seek(t + 1 / 30, playing); e.preventDefault(); break;
      case 'f': case 'F': el.fs.click(); break;
      case 'c': case 'C': el.capToggle.click(); break;
      case 'r': case 'R': el.restart.click(); break;
    }
  });

  document.addEventListener('visibilitychange', function () {
    if (document.hidden && playing) setPlaying(false);
  });

  window.addEventListener('resize', sizeCanvas);
  if (window.ResizeObserver) new ResizeObserver(sizeCanvas).observe(canvas);

  /* --------------------------------------------------------------- go -- */

  buildChapters();
  sizeCanvas();
  syncUi();
  requestAnimationFrame(tick);

  /* autoplay straight into the film, unless the viewer asked for less motion */
  if (!reduceMotion) setPlaying(true);
})();
