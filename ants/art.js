/* Ant Ranchers — drawing primitives.
   Everything here is a pure function of its arguments: no wall clock, no unseeded
   randomness. That is what lets the interactive player and the offline video
   renderer produce byte-identical frames for the same time value. */
(function (global) {
  'use strict';

  var TAU = Math.PI * 2;

  /* ---------------------------------------------------------------- math -- */

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function mix(a, b, t) { return lerp(a, b, clamp(t, 0, 1)); }

  /* normalized progress of t through the window [a,b], clamped to 0..1 */
  function seg(t, a, b) { return b === a ? (t >= b ? 1 : 0) : clamp((t - a) / (b - a), 0, 1); }

  /* 0 -> 1 -> 0 across the window [a,b] */
  function pulse(t, a, b) {
    var u = seg(t, a, b);
    return Math.sin(u * Math.PI);
  }

  function ease(t) { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); }
  function easeIn(t) { t = clamp(t, 0, 1); return t * t; }
  function easeOut(t) { t = clamp(t, 0, 1); return 1 - (1 - t) * (1 - t); }
  function easeBack(t) {
    t = clamp(t, 0, 1);
    var c = 1.70158;
    return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
  }

  /* deterministic PRNG — same seed always yields the same stream */
  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), 1 | t);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* a tiny stable hash -> float in 0..1, handy for per-index jitter */
  function hash01(i, salt) {
    var x = Math.sin((i + 1) * 127.1 + (salt || 0) * 311.7) * 43758.5453;
    return x - Math.floor(x);
  }

  function wobble(t, freq, amp, phase) {
    return Math.sin(t * freq * TAU + (phase || 0)) * amp;
  }

  /* --------------------------------------------------------------- color -- */

  var C = {
    antDark: '#33190d',
    antBody: '#7a3717',
    antMid: '#8f4620',
    antLight: '#b3652f',
    antShine: '#dd9a58',

    aphidDark: '#7aab38',
    aphidBody: '#b6de6a',
    aphidLight: '#dcf3a6',
    aphidEye: '#26340f',

    bugRed: '#d8392b',
    bugRedDark: '#a02418',
    bugRedLight: '#f0614c',
    bugBlack: '#191310',
    bugWhite: '#f6f1e6',

    honey: '#f2ac2e',
    honeyLight: '#ffdf8d',
    honeyDeep: '#c97f14',

    leaf: '#4f9439',
    leafDark: '#2e6326',
    leafLight: '#7cc255',
    stem: '#5d9a3f',
    stemDark: '#3b6a2a',

    soil: '#5b3a25',
    soilDark: '#341f13',
    soilLight: '#7d5535',
    soilGrain: '#8a6642',

    ink: '#1d1206',
    cream: '#fdf6e6',
    chalk: '#f5efdd'
  };

  /* rgba() from a #rrggbb plus alpha */
  function rgba(hex, a) {
    var h = hex.replace('#', '');
    var n = parseInt(h, 16);
    var r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
  }

  /* ------------------------------------------------------- canvas helpers -- */

  function ellipse(ctx, x, y, rx, ry, rot) {
    ctx.beginPath();
    ctx.ellipse(x, y, Math.abs(rx), Math.abs(ry), rot || 0, 0, TAU);
  }

  function fillEllipse(ctx, x, y, rx, ry, rot, fill) {
    ellipse(ctx, x, y, rx, ry, rot);
    ctx.fillStyle = fill;
    ctx.fill();
  }

  function roundRect(ctx, x, y, w, h, r) {
    var rr = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  function line(ctx, x0, y0, x1, y1, w, color, cap) {
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.lineWidth = w;
    ctx.strokeStyle = color;
    ctx.lineCap = cap || 'round';
    ctx.stroke();
  }

  /* tapered limb segment: thick at the base, thin at the tip */
  function taper(ctx, x0, y0, x1, y1, w0, w1, color) {
    var dx = x1 - x0, dy = y1 - y0;
    var len = Math.hypot(dx, dy) || 1;
    var nx = -dy / len, ny = dx / len;
    ctx.beginPath();
    ctx.moveTo(x0 + nx * w0, y0 + ny * w0);
    ctx.lineTo(x1 + nx * w1, y1 + ny * w1);
    ctx.lineTo(x1 - nx * w1, y1 - ny * w1);
    ctx.lineTo(x0 - nx * w0, y0 - ny * w0);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  }

  /* two-bone inverse kinematics — returns the joint position.
     bend = +1 / -1 picks which way the knee folds. */
  function ik(x0, y0, x1, y1, l1, l2, bend) {
    var dx = x1 - x0, dy = y1 - y0;
    var d = Math.hypot(dx, dy);
    d = Math.min(d, (l1 + l2) * 0.999) || 0.001;
    var base = Math.atan2(dy, dx);
    var cosA = (d * d + l1 * l1 - l2 * l2) / (2 * d * l1);
    var a = Math.acos(clamp(cosA, -1, 1));
    var ang = base + bend * a;
    return { x: x0 + Math.cos(ang) * l1, y: y0 + Math.sin(ang) * l1 };
  }

  /* draw a jointed limb from base to foot */
  function limb(ctx, bx, by, fx, fy, l1, l2, bend, w, color) {
    var k = ik(bx, by, fx, fy, l1, l2, bend);
    taper(ctx, bx, by, k.x, k.y, w, w * 0.72, color);
    taper(ctx, k.x, k.y, fx, fy, w * 0.72, w * 0.34, color);
    fillEllipse(ctx, k.x, k.y, w * 0.85, w * 0.85, 0, color);
    return k;
  }

  /* place a creature: translate, rotate, mirror by facing, scale */
  function place(ctx, o, fn) {
    var s = o.s == null ? 1 : o.s;
    ctx.save();
    ctx.translate(o.x || 0, o.y || 0);
    if (o.rot) ctx.rotate(o.rot);
    ctx.scale(s * (o.dir === -1 ? -1 : 1), s);
    if (o.alpha != null) ctx.globalAlpha *= clamp(o.alpha, 0, 1);
    fn();
    ctx.restore();
  }

  var FONT_SANS = '"Liberation Sans", "DejaVu Sans", Arial, Helvetica, sans-serif';
  var FONT_SERIF = '"Bitstream Charter", Charter, Georgia, "DejaVu Serif", serif';

  function setFont(ctx, size, weight, family) {
    ctx.font = (weight || 400) + ' ' + size + 'px ' + (family || FONT_SANS);
  }

  function text(ctx, str, x, y, o) {
    o = o || {};
    ctx.save();
    setFont(ctx, o.size || 20, o.weight, o.font);
    ctx.textAlign = o.align || 'left';
    ctx.textBaseline = o.baseline || 'alphabetic';
    if (o.letterSpacing && 'letterSpacing' in ctx) ctx.letterSpacing = o.letterSpacing;
    if (o.shadow) {
      ctx.shadowColor = o.shadow;
      ctx.shadowBlur = o.shadowBlur || 8;
      ctx.shadowOffsetY = o.shadowOffsetY || 2;
    }
    if (o.stroke) {
      ctx.lineWidth = o.strokeWidth || 6;
      ctx.strokeStyle = o.stroke;
      ctx.lineJoin = 'round';
      ctx.strokeText(str, x, y);
      ctx.shadowColor = 'transparent';
    }
    ctx.fillStyle = o.color || C.ink;
    ctx.fillText(str, x, y);
    ctx.restore();
  }

  function measure(ctx, str, size, weight, family) {
    ctx.save();
    setFont(ctx, size, weight, family);
    var w = ctx.measureText(str).width;
    ctx.restore();
    return w;
  }

  /* greedy word wrap, returns an array of lines */
  function wrap(ctx, str, maxWidth, size, weight, family) {
    ctx.save();
    setFont(ctx, size, weight, family);
    var words = String(str).split(/\s+/);
    var lines = [];
    var cur = '';
    for (var i = 0; i < words.length; i++) {
      var probe = cur ? cur + ' ' + words[i] : words[i];
      if (ctx.measureText(probe).width > maxWidth && cur) {
        lines.push(cur);
        cur = words[i];
      } else {
        cur = probe;
      }
    }
    if (cur) lines.push(cur);
    ctx.restore();
    return lines;
  }

  /* ----------------------------------------------------------------- ant -- */
  /* Local units: origin sits on the FOOT LINE, facing +x, body slung about 46
     units up. Head-to-gaster is roughly 110 units, so scale 0.5 draws a 55px
     ant standing on y = 0 — scenes just place it on the ground line. */

  var ANT_LEGS = [
    /* base x,y             resting foot x,y      femur, tibia */
    { bx: 10, by: -46, fx: 38, fy: 0, l1: 31, l2: 30 },
    { bx: 0, by: -44, fx: 4, fy: 2, l1: 29, l2: 29 },
    { bx: -11, by: -46, fx: -34, fy: 0, l1: 32, l2: 31 }
  ];

  function footPos(leg, stride, lift, ph) {
    var c = ((ph % 1) + 1) % 1;
    var stance = 0.62;
    if (c < stance) {
      var k = c / stance;
      return { x: leg.fx + stride * (0.5 - k), y: leg.fy };
    }
    var j = (c - stance) / (1 - stance);
    return { x: leg.fx + stride * (-0.5 + j), y: leg.fy - Math.sin(j * Math.PI) * lift };
  }

  function antLegSet(ctx, o, near) {
    var stride = o.stride == null ? 0 : o.stride;
    var lift = o.lift == null ? 10 : o.lift;
    var color = near ? (o.flat || C.antMid) : (o.flat || C.antDark);
    var w = near ? 3.2 : 2.8;
    for (var i = 0; i < 3; i++) {
      var leg = ANT_LEGS[i];
      var ph = o.phase + (near ? 0 : 0.5) + i * 0.5;
      var f = stride ? footPos(leg, stride, lift, ph) : { x: leg.fx, y: leg.fy };
      if (o.legSpread) {
        f = { x: f.x * (1 + o.legSpread * 0.2), y: f.y + (near ? o.legSpread : -o.legSpread * 0.4) };
      }
      if (o.footOffsets && o.footOffsets[i]) {
        f = { x: f.x + o.footOffsets[i][0], y: f.y + o.footOffsets[i][1] };
      }
      limb(ctx, leg.bx, leg.by, f.x, f.y, leg.l1, leg.l2, -1, w, color);
    }
  }

  function antAntenna(ctx, o, side) {
    var bx = 38, by = -66 + side * 1.5;
    var flat = o.flat;
    var t = o.t || 0;
    var tip;
    if (o.antTarget) {
      /* Aim the antennae at a point in ant-local space, with a drumming beat.
         The two are deliberately splayed and beaten out of phase so they read
         as a pair tapping, not as one thick line. */
      var drum = o.antDrum ? Math.sin(t * TAU * (o.antDrumRate || 6) + (side > 0 ? 0 : Math.PI)) * (o.antDrumAmp || 5) : 0;
      tip = {
        x: o.antTarget.x + side * 7,
        y: o.antTarget.y + drum + side * 5
      };
    } else {
      tip = {
        x: 76 + wobble(t, 0.9, 3, side),
        y: -80 + wobble(t, 1.3, 4, side * 2) + side * 3
      };
    }
    /* Scape (long first segment) elbows into the funiculus. Keep any antTarget
       inside 54 units of the base (38, -66) — beyond that the arm straightens
       out and the pair reads as one stick instead of two jointed antennae. */
    var k = ik(bx, by, tip.x, tip.y, 28, 26, -1);
    var col = flat || (side > 0 ? C.antLight : C.antMid);
    taper(ctx, bx, by, k.x, k.y, 2.5, 2.0, col);
    taper(ctx, k.x, k.y, tip.x, tip.y, 2.0, 1.3, col);
    fillEllipse(ctx, tip.x, tip.y, 2.0, 2.0, 0, col);
  }

  function antMandibles(ctx, o) {
    var open = o.mand == null ? 0.1 : o.mand;
    var col = o.flat || '#4a2412';
    var a = open * 0.5;
    for (var side = -1; side <= 1; side += 2) {
      ctx.save();
      ctx.translate(43, -54);
      ctx.rotate(0.28 + side * (0.1 + a));
      ctx.beginPath();
      ctx.moveTo(0, -1.6);
      ctx.quadraticCurveTo(7, -1.2, 11.5, 2.4);
      ctx.quadraticCurveTo(6.5, 1.9, 0, 2.2);
      ctx.closePath();
      ctx.fillStyle = col;
      ctx.fill();
      ctx.restore();
    }
  }

  function drawAnt(ctx, o) {
    o = o || {};
    var t = o.t || 0;
    var flat = o.flat;
    var phase = o.phase || 0;
    var opts = {
      t: t, phase: phase, flat: flat,
      stride: o.stride, lift: o.lift, legSpread: o.legSpread,
      footOffsets: o.footOffsets,
      mand: o.mand, antTarget: o.antTarget, antDrum: o.antDrum,
      antDrumRate: o.antDrumRate, antDrumAmp: o.antDrumAmp
    };
    var bob = o.stride ? Math.sin(phase * TAU * 2) * (o.bob == null ? 1.4 : o.bob) : 0;

    place(ctx, o, function () {
      ctx.translate(0, bob);
      if (o.bodyRot) ctx.rotate(o.bodyRot);

      /* far legs sit behind the body */
      antLegSet(ctx, opts, false);
      antAntenna(ctx, opts, -1);

      /* gaster — the big rear ball, carried a little nose-up */
      var gt = o.gasterTilt || 0;
      fillEllipse(ctx, -44, -58, 20, 16.5, -0.16 + gt, flat || C.antBody);
      if (!flat) {
        fillEllipse(ctx, -41, -64, 13, 8.5, -0.3, rgba(C.antLight, 0.55));
        fillEllipse(ctx, -39, -67, 6.5, 3.8, -0.34, rgba(C.antShine, 0.6));
        ctx.save();
        ellipse(ctx, -44, -58, 20, 16.5, -0.16 + gt);
        ctx.clip();
        for (var i = 0; i < 3; i++) {
          ellipse(ctx, -51 + i * 8.5, -57, 2.8, 17, -0.16);
          ctx.fillStyle = rgba(C.antDark, 0.14);
          ctx.fill();
        }
        ctx.restore();
      }

      /* petiole — the pinched waist that makes an ant an ant */
      taper(ctx, -27, -52, -18, -52, 2.6, 3.4, flat || C.antDark);
      fillEllipse(ctx, -22, -55, 4.4, 6.2, -0.2, flat || C.antBody);

      /* mesosoma */
      ctx.beginPath();
      ctx.moveTo(-17, -46);
      ctx.bezierCurveTo(-19, -58, -10, -63, 0, -64);
      ctx.bezierCurveTo(10, -65, 18, -62, 21, -56);
      ctx.bezierCurveTo(23, -51, 20, -45, 15, -43);
      ctx.bezierCurveTo(5, -40, -10, -41, -17, -46);
      ctx.closePath();
      ctx.fillStyle = flat || C.antBody;
      ctx.fill();
      if (!flat) {
        ctx.beginPath();
        ctx.moveTo(-12, -55);
        ctx.bezierCurveTo(-8, -62, 4, -64, 14, -59);
        ctx.bezierCurveTo(6, -56, -5, -54, -12, -55);
        ctx.closePath();
        ctx.fillStyle = rgba(C.antLight, 0.5);
        ctx.fill();
      }

      /* head — pivots about the neck */
      ctx.save();
      ctx.translate(24, -56);
      ctx.rotate(o.headTilt || 0);
      ctx.translate(-24, 56);

      antMandibles(ctx, opts);
      fillEllipse(ctx, 32, -60, 15.5, 14, 0.14, flat || C.antMid);
      if (!flat) {
        fillEllipse(ctx, 29, -65, 9.5, 7, 0.1, rgba(C.antLight, 0.6));
        /* compound eye */
        fillEllipse(ctx, 38.5, -61.5, 4.8, 5.6, 0.2, C.antDark);
        fillEllipse(ctx, 39.7, -63.4, 1.8, 2.2, 0.2, rgba(C.chalk, 0.9));
      }
      ctx.restore();

      /* near legs and antenna in front of the body */
      antLegSet(ctx, opts, true);
      antAntenna(ctx, opts, 1);

      if (o.carry) {
        ctx.save();
        ctx.translate(56, -66);
        o.carry(ctx);
        ctx.restore();
      }
    });
  }

  /* --------------------------------------------------------------- aphid -- */
  /* Local units: origin on the FOOT LINE, facing +x. The body is a 50-unit
     teardrop — fat at the rear, tapering to a small down-turned head — so at a
     shared scale an aphid is comfortably under half the size of an ant. */

  var APHID_LEGS = [
    { bx: 11, by: -19, fx: 19, fy: 0, l1: 12, l2: 11 },
    { bx: 0, by: -17, fx: 2, fy: 1, l1: 11, l2: 10 },
    { bx: -12, by: -19, fx: -19, fy: 0, l1: 12, l2: 12 }
  ];

  function aphidLegSet(ctx, o, near) {
    var color = near ? (o.flat || C.aphidDark) : (o.flat || '#5f8a2c');
    var w = near ? 2.1 : 1.9;
    for (var i = 0; i < 3; i++) {
      var leg = APHID_LEGS[i];
      var fx = leg.fx, fy = leg.fy;
      if (o.tuck) { fx = leg.bx + (leg.fx - leg.bx) * 0.3; fy = leg.by + 11; }
      if (o.legWave) {
        fx += Math.sin((o.t || 0) * TAU * 1.4 + i * 1.7 + (near ? 0 : 0.8)) * o.legWave;
        fy += Math.cos((o.t || 0) * TAU * 1.1 + i * 2.1) * o.legWave * 0.5;
      }
      limb(ctx, leg.bx, leg.by, fx, fy, leg.l1, leg.l2, -1, w, color);
    }
  }

  function drawAphid(ctx, o) {
    o = o || {};
    var t = o.t || 0;
    var flat = o.flat;
    var pale = flat || '#5f8a2c';
    var breathe = o.calm === false ? 0 : Math.sin(t * TAU * 0.55 + (o.seed || 0)) * 0.7;
    var legOpts = { t: t, flat: flat, tuck: o.tuck, legWave: o.legWave };

    place(ctx, o, function () {
      if (o.bodyRot) { ctx.translate(0, -30); ctx.rotate(o.bodyRot); ctx.translate(0, 30); }

      aphidLegSet(ctx, legOpts, false);

      /* antennae — hair-thin, swept back over the body.
         Deliberately much finer than the cornicles below, so the two never
         get confused when the close-up labels them. */
      var aw = wobble(t, 0.7, 3, o.seed || 0);
      for (var side = -1; side <= 1; side += 2) {
        var tipx = -13 + aw, tipy = -47 + side * 3.5 + aw * 0.5;
        var k = ik(20, -24, tipx, tipy, 17, 20, 1);
        var acol = side > 0 ? (flat || '#8fbc4c') : pale;
        taper(ctx, 20, -24, k.x, k.y, 1.2, 0.9, acol);
        taper(ctx, k.x, k.y, tipx, tipy, 0.9, 0.5, acol);
      }

      /* cornicles — the short thick pair of tubes on the rear.
         These are the alarm-pheromone taps, NOT where honeydew comes from. */
      for (var s2 = -1; s2 <= 1; s2 += 2) {
        var ox = -19 + s2 * 2, oy = -38 + s2 * 1.5;
        taper(ctx, ox, oy, ox - 9, oy - 12, 3.6, 1.9, s2 > 0 ? (flat || C.aphidDark) : pale);
        if (!flat) fillEllipse(ctx, ox - 9, oy - 12, 2, 1.7, -0.5, '#4d7324');
      }

      ctx.save();
      ctx.translate(0, breathe);

      /* cauda — the little upturned tail at the rear */
      ctx.beginPath();
      ctx.moveTo(-29, -27);
      ctx.quadraticCurveTo(-37, -27, -39, -22);
      ctx.quadraticCurveTo(-33, -21, -28, -22);
      ctx.closePath();
      ctx.fillStyle = flat || C.aphidDark;
      ctx.fill();

      /* body — a squat teardrop, fat at the rear */
      ctx.beginPath();
      ctx.moveTo(19, -20);
      ctx.bezierCurveTo(16, -36, 4, -44, -10, -43);
      ctx.bezierCurveTo(-24, -42, -32, -34, -31, -23);
      ctx.bezierCurveTo(-30, -13, -20, -7, -6, -7);
      ctx.bezierCurveTo(8, -7, 19, -12, 19, -20);
      ctx.closePath();
      ctx.fillStyle = flat || C.aphidBody;
      ctx.fill();

      if (!flat) {
        ctx.save();
        ctx.clip();
        fillEllipse(ctx, -8, -38, 20, 8, -0.12, rgba(C.aphidLight, 0.8));
        fillEllipse(ctx, -4, -40, 10, 3.6, -0.16, rgba('#ffffff', 0.55));
        fillEllipse(ctx, -12, -8, 24, 8, 0, rgba(C.aphidDark, 0.38));
        for (var i = 0; i < 4; i++) {
          ellipse(ctx, -24 + i * 9, -25, 2.4, 20, 0.05);
          ctx.fillStyle = rgba(C.aphidDark, 0.16);
          ctx.fill();
        }
        ctx.restore();
      }

      /* head, turned down toward the plant */
      fillEllipse(ctx, 21, -16, 8, 7.4, 0.25, flat || C.aphidBody);
      if (!flat) {
        fillEllipse(ctx, 20, -19, 5.4, 3.8, 0.2, rgba(C.aphidLight, 0.7));
        fillEllipse(ctx, 25.6, -17.5, 2.5, 2.8, 0, C.aphidEye);
        fillEllipse(ctx, 26.3, -18.4, 1, 1.1, 0, rgba(C.chalk, 0.85));
        if (o.blush) fillEllipse(ctx, 19, -12, 3.4, 2.2, 0, rgba('#ef8f8f', 0.5 * o.blush));
      }

      /* stylet — the drinking straw, only drawn when plugged into a plant */
      if (o.stylet) {
        ctx.beginPath();
        ctx.moveTo(23, -10);
        ctx.quadraticCurveTo(24, -10 + o.stylet * 0.55, 20, -10 + o.stylet);
        ctx.lineWidth = 1.8;
        ctx.strokeStyle = flat || '#4d7324';
        ctx.lineCap = 'round';
        ctx.stroke();
      }
      ctx.restore();

      aphidLegSet(ctx, legOpts, true);

      /* honeydew bead at the abdomen tip, just under the cauda */
      if (o.drop) {
        drawDroplet(ctx, {
          x: -36, y: -17 + breathe, r: o.drop,
          alpha: o.dropAlpha == null ? 1 : o.dropAlpha
        });
      }
    });
  }

  /* ------------------------------------------------------------- ladybug -- */
  /* Local units: origin on the FOOT LINE, facing +x, shell centred near y = -34. */

  var BUG_LEGS = [
    { bx: 16, by: -16, fx: 30, fy: 0, l1: 15, l2: 14 },
    { bx: 2, by: -13, fx: 6, fy: 1, l1: 13, l2: 14 },
    { bx: -14, by: -15, fx: -24, fy: 0, l1: 16, l2: 15 }
  ];

  function bugLegSet(ctx, o, near) {
    var color = o.flat || C.bugBlack;
    var w = near ? 2.6 : 2.3;
    var legs = o.legs || [1, 1, 1, 1, 1, 1];
    for (var i = 0; i < 3; i++) {
      if (!legs[near ? i : i + 3]) continue;
      var leg = BUG_LEGS[i];
      var fx = leg.fx, fy = leg.fy;
      if (o.stride) {
        var f = footPos({ fx: leg.fx, fy: leg.fy }, o.stride, o.lift || 7, (o.phase || 0) + (near ? 0 : 0.5) + i * 0.5);
        fx = f.x; fy = f.y;
      }
      if (o.flail) {
        fx = leg.bx + (leg.fx - leg.bx) * 0.7 + Math.sin((o.t || 0) * TAU * 3.1 + i * 2.2 + (near ? 0 : 1.1)) * 9;
        fy = leg.by + 16 + Math.cos((o.t || 0) * TAU * 2.7 + i * 1.6) * 7;
      }
      limb(ctx, leg.bx, leg.by, fx, fy, leg.l1, leg.l2, -1, w, color);
    }
  }

  /* the 7 spots of Coccinella septempunctata, in body-local coordinates */
  var BUG_SPOTS = [
    { x: 6, y: -14, r: 4.6 },
    { x: -4, y: -19, r: 5.4 },
    { x: -16, y: -13, r: 5.0 },
    { x: -8, y: -4, r: 5.6 },
    { x: -22, y: -2, r: 4.4 },
    { x: 2, y: -5, r: 3.6 }
  ];

  function drawLadybug(ctx, o) {
    o = o || {};
    var t = o.t || 0;
    var flat = o.flat;
    var wings = o.wings || 0;

    place(ctx, o, function () {
      if (o.bodyRot) { ctx.translate(0, -28); ctx.rotate(o.bodyRot); ctx.translate(0, 28); }

      bugLegSet(ctx, { t: t, flat: flat, legs: o.legs, stride: o.stride, lift: o.lift, phase: o.phase, flail: o.flail }, false);

      /* membranous hindwings, only out in flight */
      if (wings > 0.01) {
        for (var w = -1; w <= 1; w += 2) {
          ctx.save();
          ctx.translate(-6, -38);
          ctx.rotate(w * 0.16 + Math.sin(t * TAU * 14 + w) * 0.22 * wings);
          ctx.globalAlpha *= 0.5 * wings;
          fillEllipse(ctx, -22, -4, 30, 9, -0.15, rgba('#dceaf5', 0.85));
          ctx.strokeStyle = rgba('#8fb4cc', 0.7);
          ctx.lineWidth = 0.8;
          ellipse(ctx, -22, -4, 30, 9, -0.15);
          ctx.stroke();
          ctx.restore();
        }
      }

      /* abdomen showing under the shell */
      fillEllipse(ctx, -12, -22, 22, 12, 0, flat || '#2b201a');

      /* elytra dome */
      var lift = (o.elytra || 0) * 0.5;
      ctx.save();
      ctx.translate(-2, -34);
      ctx.rotate(-lift);
      ctx.beginPath();
      ctx.moveTo(20, 10);
      ctx.bezierCurveTo(20, -10, 8, -22, -8, -22);
      ctx.bezierCurveTo(-25, -22, -33, -10, -32, 3);
      ctx.bezierCurveTo(-31, 12, -20, 16, -4, 15);
      ctx.bezierCurveTo(10, 14, 20, 14, 20, 10);
      ctx.closePath();
      ctx.fillStyle = flat || C.bugRed;
      ctx.fill();

      if (!flat) {
        ctx.save();
        ctx.clip();
        fillEllipse(ctx, -6, -16, 20, 8, -0.08, rgba(C.bugRedLight, 0.75));
        fillEllipse(ctx, -2, -19, 9, 3.4, -0.1, rgba('#ffffff', 0.45));
        fillEllipse(ctx, -14, 12, 26, 8, 0, rgba(C.bugRedDark, 0.5));
        /* elytral seam */
        ctx.beginPath();
        ctx.moveTo(14, 6);
        ctx.quadraticCurveTo(-6, 14, -30, 4);
        ctx.lineWidth = 1.6;
        ctx.strokeStyle = rgba(C.bugBlack, 0.45);
        ctx.stroke();
        for (var i = 0; i < BUG_SPOTS.length; i++) {
          var sp = BUG_SPOTS[i];
          fillEllipse(ctx, sp.x, sp.y, sp.r, sp.r * 0.92, 0, C.bugBlack);
        }
        ctx.restore();
      }
      ctx.restore();

      /* pronotum + head */
      ctx.save();
      ctx.translate(17, -32);
      ctx.beginPath();
      ctx.moveTo(-4, -11);
      ctx.bezierCurveTo(6, -12, 12, -6, 12, 2);
      ctx.bezierCurveTo(12, 9, 4, 12, -4, 11);
      ctx.closePath();
      ctx.fillStyle = flat || C.bugBlack;
      ctx.fill();
      if (!flat) {
        fillEllipse(ctx, 4, -6, 3.2, 3.4, 0, rgba(C.bugWhite, 0.9));
        fillEllipse(ctx, 4, 6, 3.2, 3.4, 0, rgba(C.bugWhite, 0.9));
      }
      /* head + eye */
      fillEllipse(ctx, 13, 1, 8, 8, 0, flat || C.bugBlack);
      if (!flat) {
        fillEllipse(ctx, 16, -2, 2.6, 3, 0, rgba(C.bugWhite, 0.92));
        fillEllipse(ctx, 16.6, -1.6, 1.3, 1.6, 0, C.bugBlack);
        if (o.chew) {
          /* working mandibles */
          var ch = Math.sin(t * TAU * 5) * 1.6;
          fillEllipse(ctx, 20, 3 + ch, 3, 1.6, 0.3, '#0d0a08');
          fillEllipse(ctx, 20, 5 - ch, 3, 1.6, -0.3, '#0d0a08');
        }
      }
      /* clubbed antennae */
      for (var s = -1; s <= 1; s += 2) {
        var ax = 18, ay = -4 + s * 1.5;
        var tx = 30 + wobble(t, 1.1, 2, s), ty = -12 + s * 3;
        taper(ctx, ax, ay, tx, ty, 1.5, 1.1, flat || C.bugBlack);
        if (!flat) fillEllipse(ctx, tx, ty, 2.2, 1.8, -0.4, C.bugBlack);
      }
      ctx.restore();

      bugLegSet(ctx, { t: t, flat: flat, legs: o.legs, stride: o.stride, lift: o.lift, phase: o.phase, flail: o.flail }, true);
    });
  }

  /* a leg that has parted company with its owner */
  function drawDetachedLeg(ctx, o) {
    place(ctx, o, function () {
      taper(ctx, 0, 0, 12, 6, 2.6, 2.0, o.color || C.bugBlack);
      taper(ctx, 12, 6, 22, 18, 2.0, 1.0, o.color || C.bugBlack);
      fillEllipse(ctx, 12, 6, 2.2, 2.2, 0, o.color || C.bugBlack);
    });
  }

  /* --------------------------------------------------------------- props -- */

  function drawDroplet(ctx, o) {
    var r = o.r == null ? 6 : o.r;
    if (r <= 0.2) return;
    ctx.save();
    if (o.alpha != null) ctx.globalAlpha *= clamp(o.alpha, 0, 1);
    ctx.translate(o.x, o.y);
    var sag = o.sag == null ? 0.22 : o.sag;
    ctx.beginPath();
    ctx.moveTo(0, -r * (1 + sag));
    ctx.bezierCurveTo(r * 0.85, -r * 0.5, r, r * 0.25, 0, r);
    ctx.bezierCurveTo(-r, r * 0.25, -r * 0.85, -r * 0.5, 0, -r * (1 + sag));
    ctx.closePath();
    var g = ctx.createLinearGradient(-r, -r, r, r);
    g.addColorStop(0, rgba(C.honeyLight, 0.95));
    g.addColorStop(0.55, rgba(C.honey, 0.95));
    g.addColorStop(1, rgba(C.honeyDeep, 0.95));
    ctx.fillStyle = g;
    ctx.fill();
    fillEllipse(ctx, -r * 0.3, -r * 0.25, r * 0.28, r * 0.4, -0.4, rgba('#ffffff', 0.75));
    ctx.restore();
  }

  function drawStem(ctx, o) {
    var w = o.w || 14;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(o.x0, o.y0);
    if (o.cx != null) ctx.quadraticCurveTo(o.cx, o.cy, o.x1, o.y1);
    else ctx.lineTo(o.x1, o.y1);
    ctx.lineWidth = w;
    ctx.lineCap = 'round';
    ctx.strokeStyle = o.color || C.stem;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(o.x0 - w * 0.22, o.y0);
    if (o.cx != null) ctx.quadraticCurveTo(o.cx - w * 0.22, o.cy, o.x1 - w * 0.22, o.y1);
    else ctx.lineTo(o.x1 - w * 0.22, o.y1);
    ctx.lineWidth = w * 0.3;
    ctx.strokeStyle = rgba(C.leafLight, 0.45);
    ctx.stroke();
    ctx.restore();
  }

  function drawLeaf(ctx, o) {
    var len = o.len || 90, w = o.w || 34;
    ctx.save();
    ctx.translate(o.x, o.y);
    ctx.rotate(o.rot || 0);
    if (o.flip) ctx.scale(1, -1);
    if (o.alpha != null) ctx.globalAlpha *= o.alpha;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(len * 0.25, -w, len * 0.75, -w * 0.85, len, 0);
    ctx.bezierCurveTo(len * 0.75, w * 0.5, len * 0.25, w * 0.55, 0, 0);
    ctx.closePath();
    var g = ctx.createLinearGradient(0, -w, len, w);
    g.addColorStop(0, o.dark || C.leafDark);
    g.addColorStop(0.5, o.color || C.leaf);
    g.addColorStop(1, o.light || C.leafLight);
    ctx.fillStyle = g;
    ctx.fill();
    /* midrib + veins */
    ctx.beginPath();
    ctx.moveTo(2, 0);
    ctx.quadraticCurveTo(len * 0.5, -w * 0.12, len - 2, 0);
    ctx.lineWidth = 2;
    ctx.strokeStyle = rgba(C.leafDark, 0.55);
    ctx.stroke();
    for (var i = 1; i <= 4; i++) {
      var p = i / 5;
      ctx.beginPath();
      ctx.moveTo(len * p, -w * 0.05);
      ctx.quadraticCurveTo(len * (p + 0.1), -w * 0.4, len * (p + 0.14), -w * 0.55);
      ctx.lineWidth = 1.1;
      ctx.strokeStyle = rgba(C.leafDark, 0.35);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(len * p, w * 0.04);
      ctx.quadraticCurveTo(len * (p + 0.08), w * 0.26, len * (p + 0.12), w * 0.36);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawGrassTuft(ctx, x, y, h, seed, color, t) {
    var r = mulberry32(seed);
    var n = 4 + Math.floor(r() * 4);
    for (var i = 0; i < n; i++) {
      var lean = (r() - 0.5) * 1.1;
      var hh = h * (0.55 + r() * 0.7);
      var sway = Math.sin((t || 0) * 1.3 + i * 1.7 + seed) * hh * 0.06;
      ctx.beginPath();
      ctx.moveTo(x + (r() - 0.5) * 14, y);
      ctx.quadraticCurveTo(x + lean * hh * 0.4, y - hh * 0.6, x + lean * hh + sway, y - hh);
      ctx.lineWidth = 2.6;
      ctx.lineCap = 'round';
      ctx.strokeStyle = color || C.stemDark;
      ctx.stroke();
    }
  }

  /* -------------------------------------------------------------- effects -- */

  function drawCallout(ctx, o) {
    var a = o.alpha == null ? 1 : clamp(o.alpha, 0, 1);
    if (a <= 0.01) return;
    ctx.save();
    ctx.globalAlpha *= a;

    var pad = 15;
    var size = o.size || 22;
    var subSize = o.subSize || 18;
    var maxW = o.maxWidth || 260;
    var lines = wrap(ctx, o.title, maxW, size, 700);
    var subLines = o.sub ? wrap(ctx, o.sub, maxW, subSize, 400) : [];
    var w = 0, i;
    for (i = 0; i < lines.length; i++) w = Math.max(w, measure(ctx, lines[i], size, 700));
    for (i = 0; i < subLines.length; i++) w = Math.max(w, measure(ctx, subLines[i], subSize, 400));
    w += pad * 2;
    var h = pad * 2 + lines.length * (size + 4) + (subLines.length ? 4 + subLines.length * (subSize + 3) : 0);

    var side = o.side || (o.tx < o.x ? 'left' : 'right');
    var bx = side === 'left' ? o.tx - w : o.tx;
    var by = o.ty - h / 2;
    /* keep the chip inside the frame */
    var frameW = o.frameW || 1280, frameH = o.frameH || 720;
    bx = clamp(bx, 18, frameW - w - 18);
    by = clamp(by, 18, frameH - h - 130);

    /* leader */
    ctx.beginPath();
    ctx.moveTo(o.x, o.y);
    var mx = side === 'left' ? bx + w : bx;
    ctx.quadraticCurveTo((o.x + mx) / 2, o.ty, mx, o.ty);
    ctx.lineWidth = 2;
    ctx.strokeStyle = rgba(C.cream, 0.9);
    ctx.setLineDash([6, 5]);
    ctx.stroke();
    ctx.setLineDash([]);
    fillEllipse(ctx, o.x, o.y, 5, 5, 0, rgba(C.cream, 0.95));
    fillEllipse(ctx, o.x, o.y, 2.4, 2.4, 0, rgba(C.ink, 0.8));

    roundRect(ctx, bx, by, w, h, 12);
    ctx.fillStyle = rgba('#161008', 0.86);
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = rgba(C.honeyLight, 0.5);
    ctx.stroke();

    var ty = by + pad + size * 0.82;
    for (i = 0; i < lines.length; i++) {
      text(ctx, lines[i], bx + pad, ty, { size: size, weight: 700, color: C.honeyLight });
      ty += size + 4;
    }
    if (subLines.length) {
      ty += 2;
      for (i = 0; i < subLines.length; i++) {
        text(ctx, subLines[i], bx + pad, ty, { size: subSize, weight: 400, color: rgba(C.cream, 0.88) });
        ty += subSize + 3;
      }
    }
    ctx.restore();
  }

  function drawPop(ctx, o) {
    var a = o.alpha == null ? 1 : clamp(o.alpha, 0, 1);
    if (a <= 0.01) return;
    var r = o.r || 40;
    ctx.save();
    ctx.globalAlpha *= a;
    ctx.translate(o.x, o.y);
    ctx.rotate(o.rot || 0);
    var spikes = o.spikes || 11;
    ctx.beginPath();
    for (var i = 0; i < spikes * 2; i++) {
      var ang = (i / (spikes * 2)) * TAU;
      var rr = i % 2 === 0 ? r : r * 0.55;
      var px = Math.cos(ang) * rr, py = Math.sin(ang) * rr * 0.88;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = o.fill || '#ffd94a';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = o.stroke || C.ink;
    ctx.lineJoin = 'round';
    ctx.stroke();
    if (o.text) {
      text(ctx, o.text, 0, r * 0.16, {
        size: o.textSize || r * 0.52, weight: 800, align: 'center',
        color: o.textColor || C.ink, font: FONT_SANS
      });
    }
    ctx.restore();
  }

  /* a puff of little circles — alarm pheromone, formic acid mist, dust */
  function drawPuff(ctx, o) {
    var a = o.alpha == null ? 1 : clamp(o.alpha, 0, 1);
    if (a <= 0.01) return;
    var n = o.count || 10;
    ctx.save();
    ctx.globalAlpha *= a;
    for (var i = 0; i < n; i++) {
      var h1 = hash01(i, o.seed || 1), h2 = hash01(i, (o.seed || 1) + 7);
      var ang = (o.dir == null ? -Math.PI / 2 : o.dir) + (h1 - 0.5) * (o.spread == null ? 1.2 : o.spread);
      var dist = (o.reach || 40) * (0.25 + h2 * 0.85) * (o.grow == null ? 1 : o.grow);
      var px = o.x + Math.cos(ang) * dist;
      var py = o.y + Math.sin(ang) * dist;
      var r = (o.r || 7) * (0.4 + h1 * 0.9) * (o.grow == null ? 1 : (0.4 + o.grow * 0.8));
      fillEllipse(ctx, px, py, r, r, 0, o.color || rgba('#cfe9ff', 0.6));
    }
    ctx.restore();
  }

  /* the ants' chemical highway */
  function drawPheromoneTrail(ctx, o) {
    var pts = o.points;
    if (!pts || pts.length < 2) return;
    ctx.save();
    ctx.globalAlpha *= o.alpha == null ? 1 : o.alpha;
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.lineWidth = o.w || 10;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = rgba(o.color || '#8fe3ff', 0.18);
    ctx.stroke();
    ctx.lineWidth = (o.w || 10) * 0.34;
    ctx.setLineDash([14, 16]);
    ctx.lineDashOffset = -(o.t || 0) * 60;
    ctx.strokeStyle = rgba(o.color || '#8fe3ff', 0.5);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  /* ------------------------------------------------------------ backdrops -- */

  function skyGradient(ctx, w, h, top, mid, bottom) {
    var g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, top);
    g.addColorStop(0.55, mid);
    g.addColorStop(1, bottom);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }

  function drawSun(ctx, x, y, r, color, glow) {
    var g = ctx.createRadialGradient(x, y, 0, x, y, r * 4);
    g.addColorStop(0, rgba(color, 0.85));
    g.addColorStop(0.25, rgba(color, 0.28));
    g.addColorStop(1, rgba(color, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r * 4, 0, TAU);
    ctx.fill();
    fillEllipse(ctx, x, y, r, r, 0, rgba(glow || '#fff6dd', 0.95));
  }

  /* rolling hills, drawn back to front */
  function drawHills(ctx, w, h, baseY, layers, seed) {
    for (var L = 0; L < layers.length; L++) {
      var cfg = layers[L];
      var r = mulberry32(seed + L * 97);
      ctx.beginPath();
      ctx.moveTo(-20, h + 20);
      ctx.lineTo(-20, baseY + cfg.y);
      var step = 90;
      for (var x = -20; x <= w + 40; x += step) {
        var yy = baseY + cfg.y - Math.sin(x * 0.0042 + L * 2.1) * cfg.amp - r() * cfg.rough;
        ctx.lineTo(x, yy);
      }
      ctx.lineTo(w + 40, h + 20);
      ctx.closePath();
      ctx.fillStyle = cfg.color;
      ctx.fill();
    }
  }

  function drawSoil(ctx, o) {
    var w = o.w, h = o.h, y = o.y;
    var g = ctx.createLinearGradient(0, y, 0, h);
    g.addColorStop(0, o.top || C.soilLight);
    g.addColorStop(0.35, o.mid || C.soil);
    g.addColorStop(1, o.bottom || C.soilDark);
    ctx.fillStyle = g;
    ctx.fillRect(0, y, w, h - y);

    /* speckles + pebbles, seeded so they never crawl between frames */
    var r = mulberry32(o.seed || 4242);
    var n = o.grains == null ? 260 : o.grains;
    for (var i = 0; i < n; i++) {
      var px = r() * w;
      var py = y + r() * (h - y);
      var rr = 1 + r() * 3.4;
      ctx.globalAlpha = 0.10 + r() * 0.22;
      fillEllipse(ctx, px, py, rr, rr * (0.6 + r() * 0.6), r() * 3, r() > 0.5 ? C.soilGrain : C.soilDark);
    }
    ctx.globalAlpha = 1;
  }

  /* a rounded underground void carved into the soil */
  function chamberPath(ctx, x, y, rx, ry, seed) {
    var r = mulberry32(seed || 11);
    ctx.beginPath();
    var n = 22;
    for (var i = 0; i <= n; i++) {
      var a = (i / n) * TAU;
      var wob = 1 + (r() - 0.5) * 0.13;
      var px = x + Math.cos(a) * rx * wob;
      var py = y + Math.sin(a) * ry * wob;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
  }

  function drawChamber(ctx, o) {
    chamberPath(ctx, o.x, o.y, o.rx, o.ry, o.seed);
    var g = ctx.createRadialGradient(o.x, o.y - o.ry * 0.3, o.ry * 0.2, o.x, o.y, o.rx);
    g.addColorStop(0, o.inner || '#4a2f1d');
    g.addColorStop(1, o.outer || '#22150c');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = 5;
    ctx.strokeStyle = rgba(C.soilDark, 0.75);
    ctx.stroke();
  }

  function vignette(ctx, w, h, strength) {
    var g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.32, w / 2, h / 2, Math.max(w, h) * 0.72);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,' + (strength == null ? 0.34 : strength) + ')');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }

  global.AntArt = {
    TAU: TAU, C: C, FONT_SANS: FONT_SANS, FONT_SERIF: FONT_SERIF,
    clamp: clamp, lerp: lerp, mix: mix, seg: seg, pulse: pulse,
    ease: ease, easeIn: easeIn, easeOut: easeOut, easeBack: easeBack,
    mulberry32: mulberry32, hash01: hash01, wobble: wobble, rgba: rgba,
    ellipse: ellipse, fillEllipse: fillEllipse, roundRect: roundRect,
    line: line, taper: taper, ik: ik, limb: limb, place: place,
    text: text, measure: measure, wrap: wrap, setFont: setFont,
    drawAnt: drawAnt, drawAphid: drawAphid, drawLadybug: drawLadybug,
    drawDetachedLeg: drawDetachedLeg,
    drawDroplet: drawDroplet, drawStem: drawStem, drawLeaf: drawLeaf,
    drawGrassTuft: drawGrassTuft, drawCallout: drawCallout, drawPop: drawPop,
    drawPuff: drawPuff, drawPheromoneTrail: drawPheromoneTrail,
    skyGradient: skyGradient, drawSun: drawSun, drawHills: drawHills,
    drawSoil: drawSoil, drawChamber: drawChamber, chamberPath: chamberPath,
    vignette: vignette
  };
})(typeof window !== 'undefined' ? window : this);
