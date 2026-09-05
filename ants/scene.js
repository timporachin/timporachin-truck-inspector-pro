/* Ant Ranchers — the film.
   AntFilm.drawFrame(ctx, t) paints the whole 1280x720 frame for time t in
   seconds. It is a pure function of t: the interactive player and the offline
   video renderer call the very same function and get identical pixels. */
(function (global) {
  'use strict';

  var A = global.AntArt;
  var C = A.C;
  var TAU = A.TAU;
  var W = 1280, H = 720;

  var seg = A.seg, ease = A.ease, easeOut = A.easeOut, easeIn = A.easeIn;
  var lerp = A.lerp, clamp = A.clamp, mix = A.mix, pulse = A.pulse;
  var rgba = A.rgba, hash01 = A.hash01, wobble = A.wobble;

  /* ------------------------------------------------------------- staging -- */

  /* The rose stem that scenes 2, 3, 6 and 7 all share, so the herd always
     lives in the same place. Quadratic bezier, bottom-left to top-right. */
  var STEM = { x0: 120, y0: 760, cx: 520, cy: 560, x1: 1080, y1: 120, w: 30 };

  function stemAt(u) {
    var mt = 1 - u;
    var x = mt * mt * STEM.x0 + 2 * mt * u * STEM.cx + u * u * STEM.x1;
    var y = mt * mt * STEM.y0 + 2 * mt * u * STEM.cy + u * u * STEM.y1;
    var dx = 2 * mt * (STEM.cx - STEM.x0) + 2 * u * (STEM.x1 - STEM.cx);
    var dy = 2 * mt * (STEM.cy - STEM.y0) + 2 * u * (STEM.y1 - STEM.cy);
    var ang = Math.atan2(dy, dx);
    return { x: x, y: y, ang: ang, nx: Math.sin(ang), ny: -Math.cos(ang) };
  }

  /* a placement standing on the upper face of the stem */
  function onStem(u, lift) {
    var p = stemAt(u);
    var off = STEM.w / 2 + (lift || 0);
    return { x: p.x + p.nx * off, y: p.y + p.ny * off, rot: p.ang };
  }

  function camera(ctx, cam, fn) {
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.scale(cam.zoom, cam.zoom);
    ctx.translate(-cam.x, -cam.y);
    fn();
    ctx.restore();
  }

  /* world point -> screen point, so callouts drawn in screen space can still
     be pinned to something the camera is looking at */
  function w2s(cam, x, y) {
    return {
      x: (x - cam.x) * cam.zoom + W / 2,
      y: (y - cam.y) * cam.zoom + H / 2
    };
  }

  /* -------------------------------------------------------- shared skies -- */

  function gardenSky(ctx, t, warm) {
    A.skyGradient(ctx, W, H,
      warm ? '#ffd6a3' : '#bfe4f2',
      warm ? '#ffe9c8' : '#dff1f6',
      warm ? '#f3f0d4' : '#eef7e6');
    A.drawSun(ctx, warm ? 980 : 1120, warm ? 150 : 90, warm ? 46 : 34, '#ffd98a', '#fffbe9');

    /* out-of-focus foliage, kept faint so it never competes with the action */
    var r = A.mulberry32(77);
    for (var i = 0; i < 15; i++) {
      var x = r() * (W + 200) - 100;
      var y = 140 + r() * 520;
      var rad = 60 + r() * 130;
      ctx.globalAlpha = 0.05 + r() * 0.06;
      A.fillEllipse(ctx, x, y, rad, rad * (0.7 + r() * 0.5), r() * 3, r() > 0.45 ? '#4f8c3c' : '#7cb85c');
    }
    ctx.globalAlpha = 1;

    /* sun shafts */
    ctx.save();
    ctx.globalAlpha = 0.055;
    for (var s = 0; s < 4; s++) {
      ctx.save();
      ctx.translate(1000, 60);
      ctx.rotate(2.1 + s * 0.18 + Math.sin(t * 0.15 + s) * 0.01);
      ctx.fillStyle = '#fff6d8';
      ctx.fillRect(0, -26 - s * 4, 1500, 52 + s * 8);
      ctx.restore();
    }
    ctx.restore();
  }

  /* the shared rose stem with its leaves */
  function rosePlant(ctx, t) {
    /* a couple of background stems for depth */
    ctx.save();
    ctx.globalAlpha = 0.4;
    A.drawStem(ctx, { x0: 420, y0: 780, cx: 640, cy: 420, x1: 700, y1: -40, w: 16, color: '#3f7a30' });
    A.drawLeaf(ctx, { x: 660, y: 250, len: 150, w: 46, rot: -0.9, color: '#3f7a30', dark: '#2a5620', light: '#5a9642' });
    ctx.restore();

    /* the main stem */
    A.drawStem(ctx, { x0: STEM.x0, y0: STEM.y0, cx: STEM.cx, cy: STEM.cy, x1: STEM.x1, y1: STEM.y1, w: STEM.w });

    /* thorns */
    var i, p;
    for (i = 0; i < 5; i++) {
      p = stemAt(0.12 + i * 0.19);
      ctx.save();
      ctx.translate(p.x - p.nx * (STEM.w / 2 - 2), p.y - p.ny * (STEM.w / 2 - 2));
      ctx.rotate(p.ang + Math.PI / 2);
      ctx.beginPath();
      ctx.moveTo(-7, 0); ctx.lineTo(7, 0); ctx.lineTo(0, 17);
      ctx.closePath();
      ctx.fillStyle = '#3b6a2a';
      ctx.fill();
      ctx.restore();
    }

    /* leaves hanging off the stem, kept clear of the herd zone (u 0.31 - 0.68) */
    var leaves = [
      { u: 0.08, rot: 0.62, len: 200, w: 64 },
      { u: 0.22, rot: 0.34, len: 175, w: 56 },
      { u: 0.76, rot: 0.60, len: 165, w: 52 },
      { u: 0.92, rot: 0.24, len: 130, w: 42 }
    ];
    for (i = 0; i < leaves.length; i++) {
      var L = leaves[i];
      p = stemAt(L.u);
      var sway = Math.sin(t * 0.5 + i * 1.9) * 0.035;
      A.drawLeaf(ctx, {
        x: p.x - p.nx * 4, y: p.y - p.ny * 4,
        len: L.len, w: L.w, rot: L.rot + sway
      });
    }
  }

  /* the seven aphids of the herd, in fixed spots along the middle of the stem
     so the camera can sit close on them */
  var HERD = [
    { u: 0.315, s: 0.78, seed: 1 },
    { u: 0.380, s: 0.70, seed: 2 },
    { u: 0.440, s: 0.82, seed: 3 },
    { u: 0.500, s: 0.72, seed: 4 },
    { u: 0.560, s: 0.79, seed: 5 },
    { u: 0.620, s: 0.68, seed: 6 },
    { u: 0.680, s: 0.75, seed: 7 }
  ];

  /* the camera position the stem scenes share: the herd's diagonal, centred,
     sitting clear of the caption bar */
  var HERD_CAM = { x: 560, y: 516, zoom: 1.62 };

  /* which aphid each story beat happens to, and where the actor stands */
  var TAKE_IDX = 3, TAKE_U = 0.378;   /* the one that gets carried off */
  var BUG_IDX = 4, BUG_U = 0.582;     /* the one the ladybird goes for */

  function drawHerd(ctx, t, opts) {
    opts = opts || {};
    for (var i = 0; i < HERD.length; i++) {
      if (opts.skip && opts.skip.indexOf(i) !== -1) continue;
      var a = HERD[i];
      var pl = onStem(a.u, -4);
      var drop = 0;
      if (opts.drops && opts.drops[i] != null) drop = opts.drops[i];
      A.drawAphid(ctx, {
        x: pl.x, y: pl.y, rot: pl.rot, s: a.s, t: t + a.seed * 0.7,
        seed: a.seed, stylet: 22, drop: drop,
        legWave: opts.alarm ? 1.6 : 0
      });
    }
  }

  /* ------------------------------------------------------------- captions -- */

  function drawCaption(ctx, str, alpha) {
    if (!str || alpha <= 0.01) return;
    var maxW = 900;
    var size = 27;
    var lines = A.wrap(ctx, str, maxW, size, 600);
    var lh = size + 9;
    var boxH = lines.length * lh + 26;
    var boxW = 0;
    for (var i = 0; i < lines.length; i++) {
      boxW = Math.max(boxW, A.measure(ctx, lines[i], size, 600));
    }
    boxW += 56;
    var bx = (W - boxW) / 2;
    var by = H - 34 - boxH;

    ctx.save();
    ctx.globalAlpha *= clamp(alpha, 0, 1);
    A.roundRect(ctx, bx, by, boxW, boxH, 16);
    ctx.fillStyle = 'rgba(18,13,7,.78)';
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = rgba(C.honeyLight, 0.28);
    ctx.stroke();
    var ty = by + 13 + size * 0.82;
    for (var j = 0; j < lines.length; j++) {
      A.text(ctx, lines[j], W / 2, ty, {
        size: size, weight: 600, align: 'center', color: C.chalk
      });
      ty += lh;
    }
    ctx.restore();
  }

  /* ================================================================ SCENES = */

  /* ---- 1. title ---------------------------------------------------------- */

  function sceneTitle(ctx, u, lt, t) {
    gardenSky(ctx, t, true);

    A.drawHills(ctx, W, H, 470, [
      { y: 0, amp: 34, rough: 12, color: '#7fb45f' },
      { y: 70, amp: 46, rough: 16, color: '#5f9a46' },
      { y: 150, amp: 30, rough: 10, color: '#437a34' }
    ], 5);

    /* foreground bank the ants march along */
    ctx.beginPath();
    ctx.moveTo(0, H);
    ctx.lineTo(0, 612);
    for (var x = 0; x <= W; x += 40) {
      ctx.lineTo(x, 612 + Math.sin(x * 0.006) * 10);
    }
    ctx.lineTo(W, H);
    ctx.closePath();
    ctx.fillStyle = '#2f5b28';
    ctx.fill();

    /* a marching column, silhouetted against the light */
    var march = lt * 52;
    for (var i = 0; i < 9; i++) {
      var ax = ((i * 168 + march) % (W + 320)) - 160;
      var gy = 616 + Math.sin(ax * 0.006) * 10;
      A.drawAnt(ctx, {
        x: ax, y: gy, s: 0.42 + (i % 3) * 0.04, t: t + i,
        phase: lt * 1.7 + i * 0.31, stride: 22, lift: 11,
        flat: '#173318'
      });
    }
    for (var g = 0; g < 14; g++) {
      A.drawGrassTuft(ctx, g * 96 + 20, 640 + (g % 3) * 12, 60 + (g % 4) * 22, 30 + g, '#1e4520', t);
    }

    /* title */
    var tIn = ease(seg(lt, 0.6, 2.2));
    var sub = ease(seg(lt, 2.3, 3.4));
    var tag = ease(seg(lt, 3.6, 4.6));

    ctx.save();
    ctx.globalAlpha = tIn;
    ctx.translate(0, (1 - tIn) * 26);
    A.text(ctx, 'ANT RANCHERS', W / 2, 268, {
      size: 92, weight: 800, align: 'center', font: A.FONT_SERIF,
      color: '#3a2109', letterSpacing: '3px',
      stroke: 'rgba(255,250,235,.92)', strokeWidth: 12
    });
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = sub;
    A.text(ctx, 'How ants kidnap aphids, milk them for sugar,', W / 2, 330, {
      size: 30, weight: 600, align: 'center', color: '#40260c',
      stroke: 'rgba(255,250,235,.8)', strokeWidth: 7
    });
    A.text(ctx, 'and tear the legs off anything that threatens the herd', W / 2, 370, {
      size: 30, weight: 600, align: 'center', color: '#40260c',
      stroke: 'rgba(255,250,235,.8)', strokeWidth: 7
    });
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = tag * (1 - ease(seg(lt, 7.6, 8.6)));
    var tagStr = 'A TRUE STORY FROM YOUR GARDEN';
    var tagW = A.measure(ctx, tagStr, 18, 700) + 56;
    A.roundRect(ctx, W / 2 - tagW / 2, 410, tagW, 44, 22);
    ctx.fillStyle = 'rgba(28,18,6,.74)';
    ctx.fill();
    A.text(ctx, tagStr, W / 2, 439, {
      size: 18, weight: 700, align: 'center', color: C.honeyLight
    });
    ctx.restore();
  }

  /* ---- 2. the herd ------------------------------------------------------- */

  function sceneHerd(ctx, u, lt, t) {
    var push = ease(seg(lt, 0, 14));
    var cam = {
      x: lerp(HERD_CAM.x - 16, HERD_CAM.x + 22, push),
      y: lerp(HERD_CAM.y + 12, HERD_CAM.y - 8, push),
      zoom: lerp(HERD_CAM.zoom, HERD_CAM.zoom + 0.3, push)
    };

    gardenSky(ctx, t, false);
    camera(ctx, cam, function () {
      rosePlant(ctx, t);

      /* two of the herd slowly swell a bead of honeydew */
      var drops = {};
      drops[3] = seg(lt, 5.2, 8.6) * 7.5;
      drops[5] = seg(lt, 7.4, 10.4) * 5;
      drawHerd(ctx, t, { drops: drops });

      /* one bead finally lets go */
      var fall = seg(lt, 8.8, 10.4);
      if (fall > 0 && fall < 1) {
        var pd = onStem(HERD[3].u, 0);
        A.drawDroplet(ctx, {
          x: pd.x - 26 - fall * 8, y: pd.y - 16 + fall * fall * 260,
          r: 7.5 * (1 - fall * 0.25), alpha: 1 - easeIn(fall)
        });
      }
    });

    /* labels live in screen space so the type never distorts, but they are
       pinned to real world points through the same camera */
    var pStylet = onStem(HERD[2].u, 0);
    var pDrop = onStem(HERD[3].u, 0);
    var pCorn = onStem(HERD[5].u, 0);

    var a1 = w2s(cam, pStylet.x + 14, pStylet.y + 4);
    var c1 = ease(seg(lt, 1.6, 2.4)) * (1 - ease(seg(lt, 5.0, 5.7)));
    A.drawCallout(ctx, {
      x: a1.x, y: a1.y, tx: 250, ty: 545, side: 'left', alpha: c1,
      title: 'Stylet', sub: 'A hypodermic straw, tapped straight into the plant’s sugar pipes.'
    });

    var a2 = w2s(cam, pDrop.x - 24, pDrop.y - 16);
    var c2 = ease(seg(lt, 6.2, 7.0)) * (1 - ease(seg(lt, 9.8, 10.5)));
    A.drawCallout(ctx, {
      x: a2.x, y: a2.y, tx: 240, ty: 190, side: 'left', alpha: c2,
      title: 'Honeydew', sub: 'Sap carries far more sugar than an aphid needs. The surplus goes straight through.'
    });

    var a3 = w2s(cam, pCorn.x - 16, pCorn.y - 30);
    var c3 = ease(seg(lt, 10.8, 11.6)) * (1 - ease(seg(lt, 14.2, 14.9)));
    A.drawCallout(ctx, {
      x: a3.x, y: a3.y, tx: 1040, ty: 200, side: 'right', alpha: c3, maxWidth: 220,
      title: 'Cornicles', sub: 'The two horns are alarm sirens, not milk taps. Almost everyone gets this wrong.'
    });
  }

  /* ---- 3. the roundup ---------------------------------------------------- */

  function sceneRoundup(ctx, u, lt, t) {
    gardenSky(ctx, t, false);
    var cam = { x: HERD_CAM.x, y: HERD_CAM.y, zoom: HERD_CAM.zoom };

    /* the worker climbs the stem, inspects, lifts an aphid, carries it away */
    var climb = ease(seg(lt, 0.2, 3.4));
    var back = ease(seg(lt, 10.2, 16.8));
    var antU = back > 0 ? lerp(TAKE_U, 0.04, back) : lerp(0.06, TAKE_U, climb);

    var lift = ease(seg(lt, 6.4, 7.8));   /* the aphid leaves the stem */
    var tapping = lt > 3.6 && lt < 6.2;
    var carrying = lt > 6.4;
    var leaving = back > 0.02;

    camera(ctx, cam, function () {
      rosePlant(ctx, t);
      drawHerd(ctx, t, { skip: carrying ? [TAKE_IDX] : [] });

      var pl = onStem(antU, -2);
      var target = onStem(HERD[TAKE_IDX].u, -4);
      var antS = 0.62;

      A.drawAnt(ctx, {
        x: pl.x, y: pl.y, rot: pl.rot, s: antS, t: t,
        dir: leaving ? -1 : 1,
        phase: lt * 1.9, stride: (climb < 1 || leaving) ? 22 : 0, lift: 11,
        mand: carrying ? 0.9 : (tapping ? 0.35 : 0.12),
        headTilt: carrying ? -0.14 : 0.05,
        antTarget: tapping ? { x: 68, y: -30 } : null,
        antDrum: tapping, antDrumRate: 7, antDrumAmp: 6
      });

      /* the abducted aphid: on the stem, then up into the mandibles.
         The carry point is (56, -58) in ant-local units, so it has to go
         through the ant's own scale, facing and stem rotation to reach world. */
      if (carrying) {
        var fdir = leaving ? -1 : 1;
        var cxl = 56 * fdir * antS, cyl = -58 * antS;
        var ca = Math.cos(pl.rot), sa = Math.sin(pl.rot);
        var mx = pl.x + cxl * ca - cyl * sa;
        var my = pl.y + cxl * sa + cyl * ca;
        A.drawAphid(ctx, {
          x: lerp(target.x, mx, lift), y: lerp(target.y, my, lift),
          rot: pl.rot + lift * 0.4 * fdir, s: HERD[TAKE_IDX].s, t: t, dir: fdir,
          seed: 1, tuck: lift > 0.35, legWave: lift > 0.35 ? 1.8 : 0,
          blush: lift
        });
      }

      /* a second worker attending the far end of the herd */
      var p2 = onStem(lerp(0.88, 0.72, ease(seg(lt, 8.0, 15.0))), -2);
      A.drawAnt(ctx, {
        x: p2.x, y: p2.y, rot: p2.rot, s: 0.46, t: t + 3, dir: -1,
        phase: lt * 1.7 + 0.4, stride: 20, lift: 10, mand: 0.2
      });
    });

    var pTap = onStem(HERD[TAKE_IDX].u, 0);
    var a1 = w2s(cam, pTap.x - 10, pTap.y - 26);
    var c1 = ease(seg(lt, 4.0, 4.8)) * (1 - ease(seg(lt, 7.6, 8.3)));
    A.drawCallout(ctx, {
      x: a1.x, y: a1.y, tx: 1050, ty: 180, side: 'right', alpha: c1, maxWidth: 215,
      title: 'Antennal inspection', sub: 'She taps first. A tended aphid learns to sit still and be handled.'
    });
  }

  /* ---- 4. the march home ------------------------------------------------- */

  function sceneMarch(ctx, u, lt, t) {
    var pan = lt * 26;

    A.skyGradient(ctx, W, H, '#cfe9f4', '#e6f3e4', '#dcecc9');

    /* sit closer to the ground so the column reads at a decent size */
    var cam = { x: 640, y: 536, zoom: 1.3 };
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.scale(cam.zoom, cam.zoom);
    ctx.translate(-cam.x, -cam.y);

    /* the vegetation strip along the back of the path */
    var GROUND = 548;
    ctx.beginPath();
    ctx.moveTo(-200, GROUND + 10);
    ctx.lineTo(-200, GROUND - 34);
    for (var vx = -200; vx <= W + 200; vx += 46) {
      ctx.lineTo(vx, GROUND - 34 + Math.sin(vx * 0.031) * 7 + Math.sin(vx * 0.011) * 5);
    }
    ctx.lineTo(W + 200, GROUND + 10);
    ctx.closePath();
    ctx.fillStyle = '#4b7a37';
    ctx.fill();
    ctx.save();
    ctx.globalAlpha = 0.55;
    for (var g = 0; g < 16; g++) {
      var gx = ((g * 104 - pan * 0.35) % (W + 260)) - 130;
      A.drawGrassTuft(ctx, gx, GROUND - 6, 56 + (g % 4) * 26, 200 + g, '#79b862', t);
    }
    ctx.restore();

    /* the bare dirt path the column runs along */
    A.drawSoil(ctx, {
      w: W, h: 900, y: GROUND, seed: 909, grains: 340,
      top: '#8a6440', mid: '#6d4a2b', bottom: '#4a2f19'
    });
    /* a few pebbles for scale */
    var pr = A.mulberry32(1212);
    for (var pb = 0; pb < 20; pb++) {
      var px = pr() * W, py = GROUND + 24 + pr() * 250;
      ctx.globalAlpha = 0.55;
      A.fillEllipse(ctx, px, py, 6 + pr() * 12, 4 + pr() * 7, pr() * 3, pr() > 0.5 ? '#9c7a53' : '#5c4026');
    }
    ctx.globalAlpha = 1;

    /* the nest mound, parked on the right */
    var moundX = 985;
    ctx.beginPath();
    ctx.moveTo(moundX - 250, 636);
    ctx.bezierCurveTo(moundX - 140, 500, moundX + 140, 500, moundX + 250, 636);
    ctx.closePath();
    ctx.fillStyle = '#7a5130';
    ctx.fill();
    var rr = A.mulberry32(31);
    for (var s = 0; s < 130; s++) {
      var sx = moundX - 240 + rr() * 480;
      var sy = 510 + rr() * 120;
      ctx.globalAlpha = 0.2 + rr() * 0.3;
      A.fillEllipse(ctx, sx, sy, 1.5 + rr() * 3.6, 1.5 + rr() * 2.8, 0, rr() > 0.5 ? '#9c7a53' : '#4a2c17');
    }
    ctx.globalAlpha = 1;
    /* the entrance */
    A.fillEllipse(ctx, moundX, 566, 54, 26, 0, '#1d1108');
    ctx.lineWidth = 6;
    ctx.strokeStyle = 'rgba(140,104,66,.7)';
    A.ellipse(ctx, moundX, 566, 54, 26, 0);
    ctx.stroke();

    /* the worn line the column has trodden into the dirt */
    ctx.save();
    var wg = ctx.createLinearGradient(0, 596, 0, 634);
    wg.addColorStop(0, 'rgba(56,34,16,0)');
    wg.addColorStop(0.5, 'rgba(56,34,16,.28)');
    wg.addColorStop(1, 'rgba(56,34,16,0)');
    ctx.fillStyle = wg;
    ctx.fillRect(-200, 596, moundX + 200, 38);
    ctx.restore();

    /* the scent lying on top of it */
    var trailA = ease(seg(lt, 0.6, 2.2));
    ctx.save();
    ctx.globalAlpha = trailA * 0.16;
    var tg = ctx.createLinearGradient(0, 596, 0, 630);
    tg.addColorStop(0, 'rgba(160,230,255,0)');
    tg.addColorStop(0.5, 'rgba(160,230,255,.7)');
    tg.addColorStop(1, 'rgba(160,230,255,0)');
    ctx.fillStyle = tg;
    ctx.fillRect(-200, 596, moundX + 160, 34);
    ctx.restore();
    /* scent motes drifting along it */
    for (var m = 0; m < 30; m++) {
      var mx = ((A.hash01(m, 3) * 1400 + t * 26) % 1400) - 200;
      var my = 598 + A.hash01(m, 9) * 26;
      ctx.globalAlpha = trailA * (0.15 + A.hash01(m, 5) * 0.3);
      A.fillEllipse(ctx, mx, my, 2 + A.hash01(m, 7) * 3, 2 + A.hash01(m, 7) * 3, 0, '#bdeeff');
    }
    ctx.globalAlpha = 1;

    /* the column, four of them carrying livestock */
    var carriers = [0, 2, 4, 6];
    for (var i = 0; i < 8; i++) {
      var ax = -420 + i * 196 + lt * 92;
      /* ants vanish down the hole */
      var into = clamp((ax - (moundX - 46)) / 92, 0, 1);
      if (into >= 1) continue;
      var ay = 612 - Math.sin(ax * 0.01) * 5 - into * 46;
      var carries = carriers.indexOf(i) !== -1;

      ctx.save();
      ctx.globalAlpha = 1 - into * 0.9;
      A.drawAnt(ctx, {
        x: ax, y: ay, s: 0.74 - into * 0.16, t: t + i, phase: lt * 2.1 + i * 0.37,
        stride: 23, lift: 11, mand: carries ? 0.85 : 0.15,
        headTilt: carries ? -0.1 : 0,
        carry: carries ? function (c) {
          A.drawAphid(ctx, {
            x: 0, y: 0, s: 0.6, t: t, seed: i, tuck: true,
            legWave: 1.6, bodyRot: 0.4, blush: 0.6
          });
        } : null
      });
      ctx.restore();
    }

    /* a couple of ants heading back out for the next load */
    for (var j = 0; j < 2; j++) {
      var bx = 1010 - ((lt * 80 + j * 460) % 1340);
      A.drawAnt(ctx, {
        x: bx, y: 668, s: 0.86, t: t + j * 5, dir: -1,
        phase: lt * 1.8 + j * 0.5, stride: 21, lift: 10
      });
    }

    /* foreground grass, low and sparse, purely for depth at the bottom edge */
    for (var f = 0; f < 5; f++) {
      var fx = ((f * 300 - pan * 1.4) % (W + 600)) - 300;
      A.drawGrassTuft(ctx, fx, 748, 96 + (f % 3) * 30, 500 + f, '#2c5c26', t);
    }
    ctx.restore();

    var aTrail = w2s(cam, 400, 610);
    var c1 = ease(seg(lt, 2.4, 3.2)) * (1 - ease(seg(lt, 6.2, 6.9)));
    A.drawCallout(ctx, {
      x: aTrail.x, y: aTrail.y, tx: 240, ty: 200, side: 'left', alpha: c1, maxWidth: 245,
      title: 'Pheromone trail', sub: 'Every ant that walks it tops the scent back up. The road maintains itself.'
    });
  }

  /* ---- 5. the milking parlour -------------------------------------------- */

  /* The hero pair stand on a root running through the chamber floor. */
  var PARLOUR = { rootY: 512, heroX: 706 };

  function sceneParlour(ctx, u, lt, t) {
    /* the shot pushes from the wide chamber into a big two-shot, then pulls out */
    var zi = ease(seg(lt, 4.4, 7.2));
    var zo = ease(seg(lt, 19.6, 21.8));
    var cam = {
      x: lerp(lerp(640, 656, zi), 640, zo),
      y: lerp(lerp(424, 470, zi), 424, zo),
      zoom: lerp(lerp(1.0, 2.75, zi), 1.0, zo)
    };

    /* daylight, just visible at the very top */
    A.skyGradient(ctx, W, H, '#cfe9f4', '#dcecc9', '#dcecc9');

    camera(ctx, cam, function () {
      ctx.fillStyle = '#4b7a37';
      ctx.fillRect(-400, 30, 2200, 26);
      A.drawSoil(ctx, { w: W, h: 980, y: 54, seed: 5150, grains: 460 });

      /* the shaft down from the surface, drawn first so the chamber rim
         swallows its lower end instead of gashing across the ceiling */
      ctx.beginPath();
      ctx.moveTo(322, 40);
      ctx.bezierCurveTo(322, 150, 288, 230, 292, 320);
      ctx.lineWidth = 44;
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#33200f';
      ctx.stroke();

      /* the chamber itself */
      A.drawChamber(ctx, {
        x: 660, y: 448, rx: 430, ry: 205, seed: 88,
        inner: '#5c3c25', outer: '#2e1d11'
      });

      /* the root the herd is plugged into, crossing the chamber */
      ctx.save();
      ctx.lineCap = 'round';
      function rootCurve(off) {
        ctx.beginPath();
        ctx.moveTo(190, PARLOUR.rootY + 60 + off);
        ctx.bezierCurveTo(430, PARLOUR.rootY + 22 + off, 820, PARLOUR.rootY + 6 + off, 1160, PARLOUR.rootY + 40 + off);
      }
      rootCurve(0);
      ctx.lineWidth = 48;
      ctx.strokeStyle = '#6d4a26';
      ctx.stroke();
      rootCurve(-7);
      ctx.lineWidth = 22;
      ctx.strokeStyle = '#8b6337';
      ctx.stroke();
      rootCurve(-15);
      ctx.lineWidth = 7;
      ctx.strokeStyle = 'rgba(178,134,84,.75)';
      ctx.stroke();
      /* bark grain */
      for (var bg = 0; bg < 22; bg++) {
        var gx2 = 210 + bg * 45;
        ctx.beginPath();
        ctx.moveTo(gx2, PARLOUR.rootY + 4 + A.hash01(bg, 2) * 26);
        ctx.lineTo(gx2 + 16 + A.hash01(bg, 8) * 20, PARLOUR.rootY + 8 + A.hash01(bg, 4) * 26);
        ctx.lineWidth = 1.8;
        ctx.strokeStyle = 'rgba(58,36,18,.35)';
        ctx.stroke();
      }
      /* rootlets trailing down into the soil */
      for (var rl = 0; rl < 6; rl++) {
        var rx = 260 + rl * 160;
        ctx.beginPath();
        ctx.moveTo(rx, PARLOUR.rootY + 40);
        ctx.quadraticCurveTo(rx + 24, PARLOUR.rootY + 100, rx + 8 + rl * 6, PARLOUR.rootY + 158);
        ctx.lineWidth = 6;
        ctx.strokeStyle = '#6b4a28';
        ctx.stroke();
      }
      ctx.restore();

      /* warm glow so the parlour feels lived in */
      var g = ctx.createRadialGradient(660, 470, 30, 660, 470, 430);
      g.addColorStop(0, 'rgba(255,196,96,.26)');
      g.addColorStop(1, 'rgba(255,196,96,0)');
      ctx.fillStyle = g;
      ctx.fillRect(200, 230, 940, 470);

      /* background pairs, so the parlour looks staffed */
      var pairs = [[320, 0.30], [430, 0.26], [960, 0.29], [1060, 0.25]];
      for (var p = 0; p < pairs.length; p++) {
        var px = pairs[p][0], ps = pairs[p][1];
        var py = PARLOUR.rootY - 8 + Math.abs(px - 660) * 0.03;
        A.drawAphid(ctx, { x: px, y: py, s: ps, t: t + p * 2, seed: p + 2, stylet: 16 });
        A.drawAnt(ctx, {
          x: px - 62 * ps, y: py, s: ps * 1.2, t: t + p,
          phase: 0, antTarget: { x: 66, y: -28 }, antDrum: true,
          antDrumRate: 5 + p, headTilt: 0.14, mand: 0.25
        });
      }

      /* --- the hero pair, centre stage --- */
      var hx = PARLOUR.heroX, hy = PARLOUR.rootY - 14;
      var drumming = lt > 7.0 && lt < 15.2;
      var swell = seg(lt, 9.0, 13.8);
      var sip = seg(lt, 15.2, 17.6);
      var dropR = lerp(0, 13, swell) * (1 - easeIn(sip));

      /* The aphid is drawn without its bead, the ant next, then the bead on
         top — otherwise the ant's head hides the one thing the shot is about. */
      A.drawAphid(ctx, {
        x: hx, y: hy, s: 0.95, t: t, seed: 3, stylet: 22,
        blush: clamp(swell + 0.2, 0, 1),
        legWave: drumming ? 0.9 : 0
      });

      /* the ant works the aphid's abdomen tip from behind */
      var lean = drumming ? Math.sin(lt * TAU * 0.9) * 2.5 : 0;
      var antX = hx - 100 + lean + sip * 8;
      A.drawAnt(ctx, {
        x: antX, y: hy, s: 1.05, t: t, phase: 0, stride: 0,
        headTilt: 0.18 + sip * 0.12,
        mand: sip > 0 ? 0.55 : 0.28,
        antTarget: drumming ? { x: 62, y: -22 } : { x: 70, y: -52 },
        antDrum: drumming, antDrumRate: 6.5, antDrumAmp: 8
      });

      if (dropR > 0.3) {
        A.drawDroplet(ctx, { x: hx - 36, y: hy - 17, r: dropR });
      }

      /* her crop filling up as she drinks */
      if (sip > 0.15) {
        A.fillEllipse(ctx, antX - 46, hy - 62, 13 * sip, 10 * sip, -0.16, rgba(C.honey, 0.55 * sip));
      }
    });

    /* callouts, pinned through the same camera */
    var aDrum = w2s(cam, PARLOUR.heroX - 40, PARLOUR.rootY - 40);
    var c1 = ease(seg(lt, 8.6, 9.4)) * (1 - ease(seg(lt, 12.6, 13.3)));
    A.drawCallout(ctx, {
      x: aDrum.x, y: aDrum.y, tx: 230, ty: 175, side: 'left', alpha: c1, maxWidth: 230,
      title: 'Antennal drumming', sub: 'A fast, deliberate tap-tap-tap on the aphid’s rear end. This is the milking.'
    });

    var aDrop = w2s(cam, PARLOUR.heroX - 36, PARLOUR.rootY - 31);
    var c2 = ease(seg(lt, 13.8, 14.6)) * (1 - ease(seg(lt, 18.2, 18.9)));
    A.drawCallout(ctx, {
      x: aDrop.x, y: aDrop.y, tx: 1060, ty: 200, side: 'right', alpha: c2, maxWidth: 205,
      title: 'Honeydew, on demand', sub: 'Released from the anus. The ant drinks it before it can ever hit the ground.'
    });
  }

  /* ---- 6. the raid ------------------------------------------------------- */

  function sceneRaid(ctx, u, lt, t) {
    gardenSky(ctx, t, false);
    var cam = { x: HERD_CAM.x + 20, y: HERD_CAM.y - 10, zoom: HERD_CAM.zoom };

    var fly = seg(lt, 0.4, 3.0);
    var walk = ease(seg(lt, 3.2, 5.8));
    var bite = lt > 6.0;
    var alarm = seg(lt, 6.4, 8.0);

    camera(ctx, cam, function () {
      rosePlant(ctx, t);
      drawHerd(ctx, t, { skip: bite ? [BUG_IDX] : [], alarm: alarm > 0.1 });

      /* the ladybird drops in from off-frame right, then closes on the herd */
      var lu = lerp(0.70, BUG_U, walk);
      var lp = onStem(lu, -2);
      var lx = fly < 1 ? lerp(lp.x + 620, lp.x, easeOut(fly)) : lp.x;
      var ly = fly < 1 ? lerp(lp.y - 420, lp.y, easeOut(fly)) : lp.y;
      var wingOut = fly < 1 ? 1 : Math.max(0, 1 - seg(lt, 3.0, 3.8));

      A.drawLadybug(ctx, {
        x: lx, y: ly, s: 0.8, dir: -1, t: t,
        rot: fly < 1 ? lerp(-0.5, lp.rot, easeOut(fly)) : lp.rot,
        wings: wingOut, elytra: wingOut * 0.9,
        stride: (fly >= 1 && walk < 1) ? 15 : 0, lift: 6, phase: lt * 1.6,
        chew: bite
      });

      /* the herd fires its alarm horns */
      if (alarm > 0.05) {
        for (var i = 1; i < 6; i++) {
          if (i === BUG_IDX) continue;
          var ap = onStem(HERD[i].u, 0);
          A.drawPuff(ctx, {
            x: ap.x - 16, y: ap.y - 40, count: 9, reach: 44, r: 7,
            grow: alarm, seed: 10 + i, dir: -2.1, spread: 1.5,
            alpha: (1 - ease(seg(lt, 9.4, 11.8))) * 0.75,
            color: 'rgba(214,238,255,.75)'
          });
        }
      }

      /* guards come up the stem */
      var alert = ease(seg(lt, 7.4, 11.0));
      for (var k = 0; k < 2; k++) {
        var gp = onStem(lerp(0.06 + k * 0.05, 0.42 + k * 0.06, alert), -2);
        A.drawAnt(ctx, {
          x: gp.x, y: gp.y, rot: gp.rot, s: 0.52, t: t + k,
          phase: lt * 2.4 + k * 0.4, stride: alert < 1 ? 24 : 0, lift: 12,
          mand: 0.2 + alert * 0.75, headTilt: -0.08
        });
      }
    });

    var lpTag = onStem(BUG_U, 0);
    var a1 = w2s(cam, lpTag.x, lpTag.y - 48);
    var c1 = ease(seg(lt, 4.4, 5.2)) * (1 - ease(seg(lt, 8.4, 9.1)));
    A.drawCallout(ctx, {
      x: a1.x, y: a1.y, tx: 230, ty: 180, side: 'left', alpha: c1, maxWidth: 245,
      title: 'Coccinella septempunctata',
      sub: 'A seven-spot ladybird: about fifty aphids a day, and it does not stop to ask.'
    });
  }

  /* ---- 7. the defence ---------------------------------------------------- */

  function sceneDefence(ctx, u, lt, t) {
    gardenSky(ctx, t, false);

    var charge = ease(seg(lt, 0.2, 2.6));
    var grab = seg(lt, 2.8, 4.4);
    var spray = lt > 4.2 && lt < 7.2;
    var flip = ease(seg(lt, 6.6, 8.2));
    var pop1 = seg(lt, 8.4, 9.4);
    var pop2 = seg(lt, 11.0, 12.0);
    var haul = ease(seg(lt, 12.4, 16.0));
    var calm = ease(seg(lt, 15.4, 17.4));
    var cam = { x: HERD_CAM.x + 20, y: HERD_CAM.y - 10, zoom: HERD_CAM.zoom };

    var bp = onStem(BUG_U, -2);
    var bx = bp.x - haul * 400;
    var by = bp.y + haul * 230;

    camera(ctx, cam, function () {
      rosePlant(ctx, t);
      drawHerd(ctx, t, { skip: [BUG_IDX], alarm: calm < 0.4 });

      /* the beetle: upright, then flipped, then dragged away */
      var legsLeft = [1, 1, 1, 1, 1, 1];
      if (pop1 > 0.35) legsLeft[4] = 0;
      if (pop2 > 0.35) legsLeft[1] = 0;

      ctx.save();
      ctx.globalAlpha = 1 - ease(seg(lt, 15.0, 16.6));
      A.drawLadybug(ctx, {
        x: bx, y: by, s: 0.78, dir: -1, t: t,
        rot: bp.rot + flip * Math.PI + (1 - flip) * Math.sin(lt * 9) * 0.06 * (grab > 0.2 ? 1 : 0),
        legs: legsLeft, flail: flip > 0.4, chew: false
      });
      ctx.restore();

      /* detached legs, spinning off */
      if (pop1 > 0) {
        A.drawDetachedLeg(ctx, {
          x: bx + 40 + pop1 * 190, y: by - 60 - pop1 * 90 + pop1 * pop1 * 220,
          s: 0.8, rot: pop1 * 9, alpha: 1 - easeIn(pop1)
        });
      }
      if (pop2 > 0) {
        A.drawDetachedLeg(ctx, {
          x: bx - 30 - pop2 * 160, y: by - 70 - pop2 * 70 + pop2 * pop2 * 240,
          s: 0.8, rot: -pop2 * 8, alpha: 1 - easeIn(pop2)
        });
      }

      /* the mob */
      var attackers = [
        { from: 0.10, to: BUG_U - 0.055, s: 0.54, off: 0 },
        { from: 0.03, to: BUG_U - 0.005, s: 0.50, off: 0.3 },
        { from: 0.18, to: BUG_U + 0.085, s: 0.52, off: 0.6 },
        { from: 0.00, to: BUG_U - 0.105, s: 0.48, off: 0.15 }
      ];
      for (var i = 0; i < attackers.length; i++) {
        var atk = attackers[i];
        var au = lerp(atk.from, atk.to, ease(clamp(charge - atk.off * 0.18, 0, 1)));
        var ap = onStem(au, -2);
        var ax = ap.x - haul * 400 * (i < 2 ? 1 : 0.9);
        var ay = ap.y + haul * 230 * (i < 2 ? 1 : 0.9);
        var shake = charge >= 1 && lt < 13 ? Math.sin(lt * 22 + i * 2.1) * 2.2 : 0;
        A.drawAnt(ctx, {
          x: ax + shake, y: ay, rot: ap.rot, s: atk.s, t: t + i,
          phase: lt * 2.6 + i * 0.3, stride: charge < 1 || haul > 0.02 ? 24 : 0, lift: 12,
          mand: charge >= 1 ? 0.95 : 0.5,
          headTilt: -0.12,
          gasterTilt: spray && i % 2 === 0 ? -0.5 : 0
        });

        /* formic acid, fired from the gaster tip */
        if (spray && i % 2 === 0) {
          A.drawPuff(ctx, {
            x: ax - 34, y: ay - 58, count: 8, reach: 60, r: 5,
            grow: pulse(lt, 4.2, 7.2), seed: 40 + i, dir: -0.55, spread: 0.8,
            alpha: 0.7, color: 'rgba(210,246,190,.8)'
          });
        }
      }
    });

    /* comic hits, pinned to where the beetle actually is */
    var hit = w2s(cam, bx, by - 40);
    if (grab > 0.05 && grab < 1) {
      A.drawPop(ctx, {
        x: clamp(hit.x + 90, 90, W - 90), y: clamp(hit.y - 20, 90, 520),
        r: 48 * (0.6 + grab * 0.7), rot: 0.2,
        alpha: 1 - grab, text: 'BITE!', textSize: 26, fill: '#ffd94a'
      });
    }
    if (pop1 > 0.02 && pop1 < 0.9) {
      A.drawPop(ctx, {
        x: clamp(hit.x + 150, 100, W - 100), y: clamp(hit.y - 84, 100, 520),
        r: 66 * (0.5 + pop1), rot: -0.15,
        alpha: 1 - pop1, text: 'POP!', textSize: 36, fill: '#ffe27a'
      });
    }
    if (pop2 > 0.02 && pop2 < 0.9) {
      A.drawPop(ctx, {
        x: clamp(hit.x - 160, 100, W - 100), y: clamp(hit.y - 100, 100, 520),
        r: 60 * (0.5 + pop2), rot: 0.22,
        alpha: 1 - pop2, text: 'POP!', textSize: 33, fill: '#ffe27a'
      });
    }

    var aSpray = w2s(cam, bx - 120, by - 70);
    var c1 = ease(seg(lt, 9.6, 10.4)) * (1 - ease(seg(lt, 13.6, 14.3)));
    A.drawCallout(ctx, {
      x: aSpray.x, y: aSpray.y, tx: 230, ty: 180, side: 'left', alpha: c1, maxWidth: 240,
      title: 'Formic acid', sub: 'Sprayed from the gaster. Ants also bite the legs off ladybird larvae and eat the eggs.'
    });
  }

  /* ---- 8. the deal ------------------------------------------------------- */

  function sceneDeal(ctx, u, lt, t) {
    A.skyGradient(ctx, W, H, '#f7ecd2', '#f1e3c4', '#e6d5ae');

    /* soft blobs for texture */
    var r = A.mulberry32(19);
    for (var i = 0; i < 16; i++) {
      ctx.globalAlpha = 0.05 + r() * 0.05;
      A.fillEllipse(ctx, r() * W, r() * H, 60 + r() * 160, 50 + r() * 120, 0, '#b58a4a');
    }
    ctx.globalAlpha = 1;

    var titleIn = ease(seg(lt, 0.3, 1.3));
    ctx.save();
    ctx.globalAlpha = titleIn;
    A.text(ctx, 'THE DEAL', W / 2, 88, {
      size: 52, weight: 800, align: 'center', font: A.FONT_SERIF,
      color: '#40260c', letterSpacing: '4px'
    });
    ctx.restore();

    /* two columns of the contract */
    var colIn = ease(seg(lt, 1.4, 2.6));
    var cols = [
      {
        x: 330, title: 'THE APHID PAYS', accent: C.aphidDark,
        items: ['Honeydew, on demand', 'All day, every day', 'Enough sugar to run a colony']
      },
      {
        x: 950, title: 'THE ANT PAYS', accent: '#a4531f',
        items: ['Armed bodyguards', 'Transport to fresh stems', 'Winter housing, underground']
      }
    ];
    for (var c = 0; c < cols.length; c++) {
      var col = cols[c];
      ctx.save();
      ctx.globalAlpha = colIn;
      ctx.translate(0, (1 - colIn) * 20);
      A.roundRect(ctx, col.x - 250, 138, 500, 236, 20);
      ctx.fillStyle = 'rgba(255,252,242,.85)';
      ctx.fill();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = rgba(col.accent, 0.5);
      ctx.stroke();
      A.text(ctx, col.title, col.x, 180, {
        size: 24, weight: 800, align: 'center', color: col.accent, letterSpacing: '2px'
      });
      for (var k = 0; k < col.items.length; k++) {
        var iy = 228 + k * 44;
        A.fillEllipse(ctx, col.x - 210, iy - 6, 5, 5, 0, rgba(col.accent, 0.85));
        A.text(ctx, col.items[k], col.x - 192, iy, { size: 22, weight: 500, color: '#4a3418' });
      }
      ctx.restore();
    }

    /* species credits, sitting between the cards and the two parties */
    var credIn = ease(seg(lt, 8.4, 9.4));
    ctx.save();
    ctx.globalAlpha = credIn * (1 - ease(seg(lt, 12.8, 13.8)));
    A.text(ctx, 'Lasius niger   ·   Macrosiphum rosae   ·   Coccinella septempunctata', W / 2, 412, {
      size: 19, weight: 500, align: 'center', color: '#8a6a3a'
    });
    ctx.restore();

    /* the two parties, facing each other in the middle */
    var meet = ease(seg(lt, 2.2, 3.6));
    A.drawAphid(ctx, {
      x: lerp(430, 560, meet), y: 574, s: 1.6, t: t, seed: 2,
      drop: 8 * ease(seg(lt, 4.2, 5.4)), blush: 0.7
    });
    A.drawAnt(ctx, {
      x: lerp(890, 748, meet), y: 574, s: 1.42, t: t, dir: -1,
      phase: lt * 1.6, stride: meet < 1 ? 22 : 0, lift: 11,
      mand: 0.3, headTilt: 0.14,
      antTarget: meet >= 1 ? { x: 68, y: -28 } : null,
      antDrum: meet >= 1, antDrumRate: 4, antDrumAmp: 5
    });
  }

  /* ================================================================ TIMELINE */

  var SCENES = [
    { id: 'title', title: 'Ant Ranchers', dur: 9, paint: sceneTitle },
    { id: 'herd', title: 'The herd', dur: 15, paint: sceneHerd },
    { id: 'roundup', title: 'The roundup', dur: 17, paint: sceneRoundup, cutIn: true },
    { id: 'march', title: 'The march home', dur: 14, paint: sceneMarch },
    { id: 'parlour', title: 'The milking parlour', dur: 23, paint: sceneParlour },
    { id: 'raid', title: 'The raid', dur: 14, paint: sceneRaid },
    { id: 'defence', title: 'The defence', dur: 18, paint: sceneDefence, cutIn: true },
    { id: 'deal', title: 'The deal', dur: 14, paint: sceneDeal }
  ];

  var start = 0;
  for (var i = 0; i < SCENES.length; i++) {
    SCENES[i].start = start;
    SCENES[i].index = i;
    start += SCENES[i].dur;
  }
  var DURATION = start;

  /* caption track, in scene-local seconds: [sceneId, at, dur, text] */
  var CAPTION_SRC = [
    ['herd', 0.4, 4.2, 'This is an aphid. It spends its whole life with a straw in a plant, drinking sugar.'],
    ['herd', 5.0, 4.4, 'Far more sugar goes in than it needs — so the surplus drips out the back as honeydew.'],
    ['herd', 9.8, 4.8, 'Which is why ants do not eat aphids. Ants keep them.'],

    ['roundup', 0.4, 3.4, 'A worker climbs up, taps the herd with her antennae, and chooses one.'],
    ['roundup', 4.2, 4.4, 'The aphid does not struggle. Being carried off by an ant is safer than staying put.'],
    ['roundup', 9.2, 4.6, 'This is real husbandry: ants move their aphids to fresher stems all season.'],
    ['roundup', 14.2, 2.6, 'And in autumn, they carry the eggs down into the nest.'],

    ['march', 0.4, 4.2, 'The road home is chemical — a scent trail, topped up by every ant that uses it.'],
    ['march', 5.2, 4.4, 'Livestock in the mandibles, the column heads underground.'],
    ['march', 10.2, 3.4, 'Welcome to the dairy.'],

    ['parlour', 0.4, 4.0, 'Down here the herd is warm, hidden from predators, and permanently on tap.'],
    ['parlour', 5.2, 3.4, 'To get milk, the ant strokes the aphid’s abdomen with her antennae.'],
    ['parlour', 9.0, 4.4, 'Yes. She is, accurately and scientifically, tickling its bum.'],
    ['parlour', 13.8, 4.4, 'The aphid answers with a bead of honeydew, and the ant drinks it straight from the tap.'],
    ['parlour', 18.6, 3.8, 'Not from the horns, by the way. Those are alarm sirens. This comes out the back.'],

    ['raid', 0.4, 3.6, 'And then the cattle raid arrives.'],
    ['raid', 4.4, 4.6, 'A seven-spot ladybird eats about fifty aphids a day. To an ant, that is the herd, the milk and the winter — gone.'],
    ['raid', 9.6, 3.8, 'An aphid fires its alarm horns. The guards come running.'],

    ['defence', 0.4, 3.4, 'Ants defend a herd the way a farmer defends a field.'],
    ['defence', 4.2, 4.4, 'They swarm it, bite the legs, spray formic acid, and flip the beetle onto its back.'],
    ['defence', 9.2, 4.6, 'This part is not cartoon licence: ants really do pull ladybirds apart to protect their aphids.'],
    ['defence', 14.4, 3.2, 'The herd goes back to grazing.'],

    ['deal', 0.4, 3.6, 'So it is not really kidnapping. It is a contract.'],
    ['deal', 4.4, 4.4, 'The aphid pays in sugar. The ant pays in bodyguards, transport and winter housing.'],
    ['deal', 9.4, 4.0, 'Ants have farmed like this for tens of millions of years. We have managed twelve thousand.']
  ];

  var CAPTIONS = CAPTION_SRC.map(function (c) {
    var sc = null;
    for (var k = 0; k < SCENES.length; k++) if (SCENES[k].id === c[0]) sc = SCENES[k];
    return { start: sc.start + c[1], end: sc.start + c[1] + c[2], text: c[3], scene: c[0] };
  });

  function captionAt(t) {
    for (var i = 0; i < CAPTIONS.length; i++) {
      if (t >= CAPTIONS[i].start && t < CAPTIONS[i].end) return CAPTIONS[i];
    }
    return null;
  }

  function sceneAt(t) {
    for (var i = SCENES.length - 1; i >= 0; i--) {
      if (t >= SCENES[i].start) return SCENES[i];
    }
    return SCENES[0];
  }

  /* scene changes blink through a warm dark rather than cutting to black —
     short, and never fully opaque, so it reads as a beat and not a dropout */
  var DIP = 0.16, DIP_MAX = 0.88;

  function drawFrame(ctx, time) {
    var t = clamp(time, 0, DURATION);
    var sc = sceneAt(t);
    var lt = t - sc.start;

    ctx.save();
    ctx.clearRect(0, 0, W, H);
    sc.paint(ctx, clamp(lt / sc.dur, 0, 1), lt, t);
    ctx.restore();

    A.vignette(ctx, W, H, 0.3);

    /* caption, with a short fade at each end. Captions are painted into the
       frame so the video stands alone, which means the player's CC toggle has
       to ask the film to leave them out rather than hiding a DOM node. */
    var cap = global.AntFilm && global.AntFilm.showCaptions === false ? null : captionAt(t);
    if (cap) {
      var fade = Math.min(seg(t, cap.start, cap.start + 0.3), 1 - seg(t, cap.end - 0.35, cap.end));
      drawCaption(ctx, cap.text, fade);
    }

    /* dip transitions between scenes, unless the next one wants a hard cut */
    var next = SCENES[sc.index + 1];
    var dipOut = (next && !next.cutIn) ? seg(t, sc.start + sc.dur - DIP, sc.start + sc.dur) : 0;
    var dipIn = (!sc.cutIn && sc.index > 0) ? 1 - seg(lt, 0, DIP) : 0;
    var dip = Math.max(dipOut, dipIn) * DIP_MAX;
    if (dip > 0.001) {
      ctx.fillStyle = 'rgba(24,16,8,' + dip + ')';
      ctx.fillRect(0, 0, W, H);
    }

    /* open on black, close on black */
    var open = 1 - seg(t, 0, 1.1);
    var close = seg(t, DURATION - 1.6, DURATION);
    var black = Math.max(open, close);
    if (black > 0.001) {
      ctx.fillStyle = 'rgba(0,0,0,' + black + ')';
      ctx.fillRect(0, 0, W, H);
    }
  }

  global.AntFilm = {
    W: W, H: H,
    scenes: SCENES,
    captions: CAPTIONS,
    duration: DURATION,
    showCaptions: true,
    drawFrame: drawFrame,
    captionAt: captionAt,
    sceneAt: sceneAt
  };
})(typeof window !== 'undefined' ? window : this);
