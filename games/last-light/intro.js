/*
  The Shanoware Studios intro. This is the studio's tested intro template, kept as it is:
  its timing, sound levels and sound-to-picture sync were tuned by hand.
  Differences from the template, all for this page:
  - It lives in its own file, because the page's security policy allows no inline scripts.
  - It plays through the game's audio, so one tap unlocks both.
  - The logo is drawn here in code, from the pixel grid below.
  - The title screen is the game's own (drawn on its canvas); this fades away to show it.
*/
(function () {
  "use strict";

  // The Shanoware shield: an S whose foot is a W. '#' is a filled pixel.
  const SHIELD = [
    "........##.############........",
    "......###################......",
    "....#######################....",
    "....###.........#...#...###....",
    "....###.................###....",
    "#...###......#.#...#....###...#",
    "##..###...###########...###..##",
    "#######...###########...#######",
    "#######...###########...#######",
    "#######......##################",
    "########........###############",
    "##########...........##########",
    "##############.........########",
    "##################......#######",
    "####################....#######",
    "######..#############...#######",
    "######..######..#####...#######",
    "######...####....####...#######",
    "######...####.....###...#######",
    "######...###......###...#######",
    "######...##...##...##...#######",
    "######...##..####.......#######",
    ".#####......#####.......######.",
    "..#####.....#####......######..",
    "...#####....######....######...",
    "....#####..########..######....",
    ".....#####################.....",
    "......###################......",
    ".......#################.......",
    ".........#############.........",
    "..........###########..........",
    "...........#########...........",
    ".............#####.............",
    "..............###..............",
    "...............#..............."
  ];

  function shieldURI(color) {
    const k = 8, c = document.createElement("canvas");
    c.width = SHIELD[0].length * k; c.height = SHIELD.length * k;
    const g = c.getContext("2d"); g.fillStyle = color;
    SHIELD.forEach((row, y) => { for (let x = 0; x < row.length; x++) if (row[x] === "#") g.fillRect(x * k, y * k, k, k); });
    return c.toDataURL("image/png");
  }

  // opts: name, color, audio() -> AudioContext (called inside the tap), muted() -> bool,
  //       onTitle() when the title starts to show, onReady() when it may take input.
  window.StudioIntro = function (opts) {
    const root = document.getElementById("intro");
    if (!root) return;
    const $ = id => document.getElementById(id);
    const NAME = opts.name.toUpperCase();
    let ctx = null, out, noiseBuf, raf = 0, cues = [], base = 0, perfBase = 0;

    $("emblem").src = shieldURI(opts.color);

    function audioInit() {
      ctx = opts.audio() || null;
      if (!ctx) return;
      // master volume with a limiter, so the boom never crackles
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -6; comp.ratio.value = 8;
      out = ctx.createGain(); out.gain.value = opts.muted() ? 0 : 1.25;
      out.connect(comp).connect(ctx.destination);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      // a silent blip inside the tap unlocks audio on phones
      const blip = ctx.createBufferSource(); blip.buffer = ctx.createBuffer(1, 1, 22050);
      blip.connect(ctx.destination); blip.start(0);
    }
    // Wait until the audio clock is really running (some phones start it late), up to 0.6 s.
    // Scheduling before then books sounds in the past, and they play silently.
    function whenAudioReady(go) {
      if (!ctx || ctx.state === "running") return go();
      let done = false; const once = () => { if (!done) { done = true; go(); } };
      ctx.resume().then(once, once); setTimeout(once, 600);
    }

    // Every sound gets an exact start time on the audio clock, so it is booked ahead and never late.
    function noise(when, dur, type, freq, vol, q = 1) {
      const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      src.buffer = noiseBuf; f.type = type; f.frequency.value = freq; f.Q.value = q;
      g.gain.setValueAtTime(vol, when); g.gain.exponentialRampToValueAtTime(0.001, when + dur);
      src.connect(f).connect(g).connect(out); src.start(when); src.stop(when + dur);
    }
    const click = when => noise(when, 0.025, "highpass", 2300 + Math.random() * 600, 0.35);
    function hiss(t) {
      const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      src.buffer = noiseBuf; f.type = "bandpass"; f.frequency.value = 3500; f.Q.value = 0.6;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.24, t + 0.1);
      g.gain.setValueAtTime(0.24, t + 0.5); g.gain.exponentialRampToValueAtTime(0.001, t + 0.62);
      src.connect(f).connect(g).connect(out); src.start(t); src.stop(t + 0.65);
    }
    function boom(t) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = "sine"; o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(40, t + 1);
      g.gain.setValueAtTime(0.9, t); g.gain.exponentialRampToValueAtTime(0.001, t + 1.3);
      o.connect(g).connect(out); o.start(t); o.stop(t + 1.35);
      noise(t, 0.3, "lowpass", 400, 0.6);
    }

    function fade(el, to, ms, ease = "ease") { el.style.transition = `opacity ${ms}ms ${ease}`; el.style.opacity = to; }
    function set(el, to) { el.style.transition = "none"; el.style.opacity = to; }
    function restartClass(el, cls) { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); }

    // A visual cue at `ms` into the intro, plus an optional sound that starts at that exact moment.
    function cue(ms, fn, sound) { cues.push({ ms, fn }); if (sound && ctx) sound(base + ms / 1000); }
    // Visuals follow the audio clock minus the speaker delay, so each picture lands with its sound.
    function heardMs() {
      if (ctx && ctx.state === "running") {
        const lag = ctx.outputLatency || ctx.baseLatency || 0;
        return (ctx.currentTime - lag - base) * 1000;
      }
      return performance.now() - perfBase; // no audio device: fall back to the normal clock
    }
    function tick() {
      const now = heardMs();
      while (cues.length && cues[0].ms <= now) cues.shift().fn();
      if (cues.length) requestAnimationFrame(tick);
    }

    function drawStatic() {
      const c = $("static"), g = c.getContext("2d"), img = g.createImageData(c.width, c.height);
      const roll = (performance.now() / 6) % c.height;
      for (let y = 0; y < c.height; y++) {
        const band = Math.abs(y - roll) < 6 ? 1.35 : 1; // a rolling brighter band, like a real TV
        for (let x = 0; x < c.width; x++) {
          const i = (y * c.width + x) * 4, v = Math.min(255, Math.random() * 255 * band);
          img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255;
        }
      }
      g.putImageData(img, 0, 0); raf = requestAnimationFrame(drawStatic);
    }

    let started = false;
    function play() {
      if (started) return; started = true;
      audioInit();
      $("start").style.display = "none";
      whenAudioReady(schedule);
    }

    function schedule() {
      const studio = $("studio"), cursor = $("cursor");
      cues = []; base = ctx ? ctx.currentTime + 0.15 : 0; perfBase = performance.now() + 150;

      // 0.0s: logo switches on like an old TV
      cue(0, () => { set(studio, 1); restartClass(studio, "crt-on"); fade($("scan"), 1, 400); });
      // 0.7s: cursor blinks on its own for a moment
      cue(700, () => cursor.className = "on");
      // 1.1s: name types out with slightly uneven, hand-typed timing, one click per letter
      let t = 1100;
      [...NAME].forEach(ch => {
        cue(t, () => { cursor.className = "solid"; $("typed").textContent += ch; }, ch !== " " ? click : null);
        t += ch === " " ? 220 : 110 + Math.random() * 60;
      });
      cue(t, () => cursor.className = "on");
      const tEnd = Math.max(t + 400, 3700); // long names push the rest of the intro back
      // quick glitch on the logo
      cue(tEnd, () => restartClass(studio, "glitch"));
      // static rolls in with the hiss
      cue(tEnd + 200, () => { fade($("static"), 0.85, 120); drawStatic(); }, hiss);
      // hard cut to the flash, boom, screen shake, logo turns white
      cue(tEnd + 800, () => {
        cancelAnimationFrame(raf); set($("static"), 0);
        studio.classList.remove("glitch", "crt-on"); studio.classList.add("white");
        set($("flash"), 1); cursor.className = "";
        restartClass(studio, "punch"); restartClass($("stage"), "shake");
      }, boom);
      // flash and logo fade straight to black together, with no colour hold
      cue(tEnd + 880, () => { fade($("flash"), 0, 1500, "cubic-bezier(.3,0,.7,1)");
                              fade(studio, 0, 1500, "cubic-bezier(.3,0,.7,1)");
                              fade($("scan"), 0, 1500); });
      // the game's title screen fades in from the black with its hum; its menu slides in
      cue(tEnd + 2500, () => { opts.onTitle(); fade(root, 0, 900); });
      // the intro cannot be skipped: the title screen only takes input from here on
      cue(tEnd + 3900, () => { root.remove(); opts.onReady(); });

      cues.sort((a, b) => a.ms - b.ms);
      tick();
    }

    $("start").addEventListener("pointerdown", play);
    document.addEventListener("keydown", function key() { document.removeEventListener("keydown", key); play(); });
  };
})();
