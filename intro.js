/* ============================================================
   TAF — Ouverture animée · by Majin
   Séquence de 10 s, partition marimba jouée en Web Audio.
   Expose window.PICIntro.play({ sound }) → Promise
           window.PICIntro.renderTo(ctx)  → rendu hors ligne
   ============================================================ */
(function () {
"use strict";

const DURATION = 10000;

/* Points d'ancrage : le son est calé sur l'image, à la milliseconde près. */
const SQUARES = [0.20, 0.275, 0.35, 0.425, 0.50, 0.575, 0.65, 0.725, 0.80];
const CONVERGE = 1.55, MARK = 2.25, TITLE = 3.62;
const WORDS = [5.20, 5.62, 6.04], STAMP = 7.02, FINALE = 8.60;

const GRID = [[-1,-1],[0,-1],[1,-1],[-1,0],[0,0],[1,0],[-1,1],[0,1],[1,1]];

/* ============================================================
   Boîte à outils sonore
   ============================================================ */
function makeKit(ctx, out) {
  const t0 = ctx.currentTime + 0.06;

  /* Note simple, enveloppe exponentielle */
  function tone(at, freq, dur, type, peak, glideTo) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || "sine";
    o.frequency.setValueAtTime(freq, t0 + at);
    if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t0 + at + dur);
    g.gain.setValueAtTime(0.0001, t0 + at);
    g.gain.exponentialRampToValueAtTime(peak, t0 + at + Math.min(0.02, dur * 0.2));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + dur);
    o.connect(g); g.connect(out);
    o.start(t0 + at); o.stop(t0 + at + dur + 0.05);
  }

  /* Maillet de marimba : fondamentale plus une attaque bois très brève */
  function mallet(at, freq, peak, dur) {
    dur = dur || 0.9;
    tone(at, freq, dur, "sine", peak);
    tone(at, freq * 3.94, dur * 0.14, "sine", peak * 0.32);
    tone(at, freq * 2.01, dur * 0.42, "sine", peak * 0.13);
  }

  const roll = (at, freqs, step, fn) => freqs.forEach((f, i) => fn(at + i * step, f));

  return { tone, mallet, roll };
}

/* ============================================================
   La partition — Marimba
   Bois chaud, gamme pentatonique montante sur les neuf carrés,
   roulé d'accord au final. Chaque frappe est une fondamentale
   sinus doublée d'une attaque brève à 3,94 fois la fréquence :
   c'est ce rapport inharmonique qui donne le bois.
   ============================================================ */
function score(k) {
  const PENTA = [261.63, 293.66, 329.63, 392.00, 440.00, 523.25, 587.33, 659.25, 783.99];
  SQUARES.forEach((t, i) => k.mallet(t, PENTA[i], 0.16, 0.75));
  k.mallet(CONVERGE, 130.81, 0.20, 1.6);
  k.roll(MARK, [392.00, 523.25, 659.25], 0.055, (t, f) => k.mallet(t, f, 0.19, 1.9));
  k.mallet(MARK, 98.00, 0.16, 2.2);
  k.roll(TITLE, [523.25, 659.25, 783.99, 1046.50], 0.07, (t, f) => k.mallet(t, f, 0.11, 1.5));
  WORDS.forEach((t, i) => k.mallet(t, [587.33, 698.46, 880.00][i], 0.15, 0.7));
  k.mallet(STAMP, 87.31, 0.24, 0.9);
  k.tone(STAMP, 65, 0.16, "sine", 0.12, 40);
  k.roll(FINALE, [196.00, 392.00, 587.33, 783.99, 1174.66], 0.075,
         (t, f) => k.mallet(t, f, 0.17, 2.6));
}

/* ============================================================
   Scène
   ============================================================ */
function build() {
  const root = document.createElement("div");
  root.className = "intro";
  root.id = "intro";
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-label", "Ouverture de TAF");

  root.innerHTML =
    '<div class="intro-stage">' +
      '<div class="intro-grid"></div>' +
      '<div class="intro-mark"><span class="intro-mark-sq"></span><span class="intro-mark-txt">TAF</span></div>' +
      '<h1 class="intro-title"><span>Travail à Faire</span></h1>' +
      '<ul class="intro-words">' +
        '<li style="--d:5.20s">Suivre</li>' +
        '<li style="--d:5.62s">Collaborer</li>' +
        '<li style="--d:6.04s">Capitaliser</li>' +
      '</ul>' +
      '<div class="intro-majin">by Majin</div>' +
    '</div>' +
    '<span class="intro-wipe"></span>' +
    '<div class="intro-progress"><i></i></div>' +
    '<button class="intro-skip" type="button">Passer</button>' +
    '<button class="intro-sound" type="button" hidden>Activer le son</button>';

  const grid = root.querySelector(".intro-grid");
  GRID.forEach(([cx, cy], i) => {
    const s = document.createElement("span");
    s.className = "intro-sq" + (i % 2 ? " is-white" : "");
    s.style.setProperty("--gx", cx * 34 + "px");
    s.style.setProperty("--gy", cy * 34 + "px");
    s.style.animationDelay = SQUARES[i].toFixed(3) + "s";
    grid.appendChild(s);
  });
  return root;
}

/* ============================================================
   Lecture
   ============================================================ */
function startScore(volume) {
  let ctx;
  try { ctx = new (window.AudioContext || window.webkitAudioContext)(); }
  catch (e) { return null; }
  const master = ctx.createGain();
  master.gain.value = volume == null ? 0.62 : volume;
  master.connect(ctx.destination);
  score(makeKit(ctx, master));
  return { ctx, master };
}

function stopScore(audio, immediate) {
  if (!audio) return;
  try {
    audio.master.gain.setTargetAtTime(0.0001, audio.ctx.currentTime, immediate ? 0.02 : 0.12);
    setTimeout(() => audio.ctx.close().catch(() => {}), immediate ? 150 : 500);
  } catch (e) { /* déjà fermé */ }
}

function play(opts) {
  const withSound = !opts || opts.sound !== false;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

  return new Promise(resolve => {
    const root = build();
    document.body.appendChild(root);
    document.body.classList.add("intro-open");
    if (reduced) root.classList.add("is-reduced");

    const soundBtn = root.querySelector(".intro-sound");
    let audio = null, done = false;

    if (withSound) {
      audio = startScore();
      if (audio && audio.ctx.state === "suspended") {
        soundBtn.hidden = false;
        audio.ctx.resume().then(() => { soundBtn.hidden = true; }).catch(() => {});
      }
    }

    function finish() {
      if (done) return;
      done = true;
      clearTimeout(timer);
      window.removeEventListener("keydown", onKey);
      stopScore(audio);
      root.classList.add("is-closing");
      setTimeout(() => {
        root.remove();
        document.body.classList.remove("intro-open");
        resolve();
      }, 420);
    }

    function onKey(e) { if (e.key === "Escape" || e.key === "Enter" || e.key === " ") finish(); }

    root.querySelector(".intro-skip").addEventListener("click", finish);
    soundBtn.addEventListener("click", () => {
      if (audio) audio.ctx.resume().then(() => { soundBtn.hidden = true; }).catch(() => {});
    });
    window.addEventListener("keydown", onKey);

    /* Les navigateurs bloquent le son tant que rien n'a été touché :
       le premier geste, quel qu'il soit, le réveille. */
    const wake = () => { if (audio && audio.ctx.state === "suspended") audio.ctx.resume().catch(() => {}); };
    ["pointerdown", "keydown", "touchstart"].forEach(ev =>
      window.addEventListener(ev, wake, { once:true, passive:true }));

    const timer = setTimeout(finish, reduced ? 1400 : DURATION);
  });
}

/* Rendu hors ligne : sert à exporter une ambiance en fichier audio
   ou à la tester automatiquement. */
function renderTo(ctx, out) {
  score(makeKit(ctx, out || ctx.destination));
  return true;
}

window.PICIntro = { play, renderTo, DURATION };

})();
