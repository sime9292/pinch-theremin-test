// V8: touch-controlled chromatic wall on the right side. Hand pinch audio is disabled.
const chromaticTouchNotesV8 = Array.from({ length: 25 }, (_, index) => 55 + index); // G3–G5
SCALES.chromatic = chromaticTouchNotesV8;

const touchWallV8 = {
  enabled: true,
  active: false,
  pointerId: null,
  index: -1,
  exactTimer: null
};

const touchStyleV8 = document.createElement("style");
touchStyleV8.textContent = `
  #app.touch-mode-v8{background:radial-gradient(circle at 62% 38%,#13263c 0,#08111e 42%,#03070d 100%)}
  #app.touch-mode-v8 #camera,#app.touch-mode-v8 #overlay{display:none!important}
  .touch-wall-v8{position:absolute;z-index:14;right:0;top:calc(env(safe-area-inset-top) + 58px);bottom:calc(env(safe-area-inset-bottom) + 46px);width:clamp(78px,23vw,108px);display:flex;flex-direction:column;border-left:2px solid rgba(164,220,255,.48);background:rgba(5,12,22,.76);backdrop-filter:blur(10px);box-shadow:-12px 0 30px rgba(0,0,0,.28);touch-action:none;user-select:none;overscroll-behavior:contain}
  .touch-wall-v8::before{content:"TIENI PREMUTO E SCORRI";position:absolute;right:calc(100% + 7px);top:50%;transform:translateY(-50%) rotate(-90deg);transform-origin:right center;white-space:nowrap;font-size:8px;font-weight:950;letter-spacing:.14em;color:rgba(210,238,255,.82);pointer-events:none}
  .touch-zone-v8{position:relative;flex:1;min-height:0;display:flex;align-items:center;justify-content:center;border-bottom:1px solid rgba(255,255,255,.075);font-size:8px;font-weight:900;color:rgba(224,239,255,.66);text-shadow:0 1px 4px #000;background:rgba(42,92,128,.055);pointer-events:none}
  .touch-zone-v8:nth-child(odd){background:rgba(72,128,164,.09)}
  .touch-zone-v8.octave{color:#fff2bd;background:rgba(164,122,44,.14)}
  .touch-zone-v8.active{color:white;background:linear-gradient(90deg,rgba(52,150,210,.48),rgba(95,224,205,.72));box-shadow:inset 0 0 18px rgba(162,246,255,.38),-5px 0 20px rgba(80,210,255,.22);font-size:10px}
  .touch-zone-v8.active::after{content:"";position:absolute;left:-9px;width:15px;height:15px;border-radius:50%;background:#fff4b7;box-shadow:0 0 16px #ffd879}
  .touch-mode-badge-v8{position:absolute;z-index:13;right:calc(clamp(78px,23vw,108px) + 9px);top:calc(env(safe-area-inset-top) + 68px);max-width:128px;padding:7px 9px;border-radius:13px;border:1px solid rgba(165,225,255,.30);background:rgba(4,10,18,.76);font-size:8px;line-height:1.32;font-weight:950;text-align:center;color:#dff5ff;pointer-events:none}
  .touch-mode-v8 #chordRail{max-height:calc(100% - 150px);overflow:auto}
  @media(max-width:420px){.touch-wall-v8{width:82px}.touch-mode-badge-v8{right:90px;max-width:112px;font-size:7.5px}}
`;
document.head.appendChild(touchStyleV8);
$("app").classList.add("touch-mode-v8");

const touchWallElementV8 = document.createElement("div");
touchWallElementV8.className = "touch-wall-v8";
touchWallElementV8.setAttribute("aria-label", "Parete cromatica touch");
$("app").appendChild(touchWallElementV8);

const touchModeBadgeV8 = document.createElement("div");
touchModeBadgeV8.className = "touch-mode-badge-v8";
touchModeBadgeV8.innerHTML = "PARETE TOUCH DESTRA<br>SCALA CROMATICA G3–G5<br>RILASCIA = STOP";
$("app").appendChild(touchModeBadgeV8);

// Remove all hand-control hints in this dedicated touch version.
if (typeof trackingBadge !== "undefined") trackingBadge.style.display = "none";
if (typeof v2GestureHelp !== "undefined") v2GestureHelp.style.display = "none";
if (typeof midpointBadgeV3 !== "undefined") midpointBadgeV3.style.display = "none";
if (typeof glideBadgeV4 !== "undefined") glideBadgeV4.style.display = "none";
if (typeof noteGuide !== "undefined") noteGuide.style.display = "none";
if (typeof cameraSwitchBtn !== "undefined") cameraSwitchBtn.style.display = "none";
if (typeof cameraSettingBtn !== "undefined") cameraSettingBtn.style.display = "none";

// Chromatic scale is the default and remains available in settings.
if (!scaleSelect.querySelector('option[value="chromatic"]')) {
  const option = document.createElement("option");
  option.value = "chromatic";
  option.textContent = "Cromatica – G3/G5";
  scaleSelect.prepend(option);
}
scaleSelect.value = "chromatic";

function renderTouchWallV8() {
  touchWallElementV8.innerHTML = "";
  [...chromaticTouchNotesV8].reverse().forEach((midi, visualIndex) => {
    const index = chromaticTouchNotesV8.length - 1 - visualIndex;
    const zone = document.createElement("div");
    zone.className = `touch-zone-v8${midi % 12 === 0 ? " octave" : ""}${index === touchWallV8.index ? " active" : ""}`;
    zone.dataset.index = String(index);
    zone.textContent = midiName(midi);
    touchWallElementV8.appendChild(zone);
  });
}

function touchIndexFromYV8(clientY) {
  const rect = touchWallElementV8.getBoundingClientRect();
  const normalized = clamp((clientY - rect.top) / Math.max(1, rect.height), 0, .999999);
  const visualIndex = Math.floor(normalized * chromaticTouchNotesV8.length);
  return chromaticTouchNotesV8.length - 1 - visualIndex;
}

function showExactTouchNoteV8(midi) {
  clearTimeout(touchWallV8.exactTimer);
  bendReadout.textContent = `NOTA ESATTA • ${midiName(midi)}`;
  touchWallV8.exactTimer = setTimeout(() => {
    if (touchWallV8.active && state.lead?.targetMidi === midi) {
      bendReadout.textContent = `NOTA ESATTA • ${midiName(midi)}`;
      $("noteDisplay").classList.remove("glide-v4");
    }
  }, 190);
}

function selectTouchNoteV8(index, attack = false) {
  const safeIndex = clamp(index, 0, chromaticTouchNotesV8.length - 1);
  const midi = chromaticTouchNotesV8[safeIndex];
  const changed = safeIndex !== touchWallV8.index;
  touchWallV8.index = safeIndex;
  state.selectedIndex = safeIndex;
  $("noteName").textContent = midiName(midi);
  renderTouchWallV8();

  if (attack || !state.lead || state.lead.stopped) {
    state.pinch = true; // Reuse the exact-note engine; hand pinch itself is disabled below.
    startLead(midi);
    showExactTouchNoteV8(midi);
    if (navigator.vibrate) navigator.vibrate(7);
  } else if (changed) {
    setLeadPitch(state.lead, midi, false);
    clearTimeout(touchWallV8.exactTimer);
    touchWallV8.exactTimer = setTimeout(() => showExactTouchNoteV8(midi), 175);
    if (navigator.vibrate) navigator.vibrate(3);
  }
}

function startTouchWallV8(event) {
  event.preventDefault();
  if (!state.started) {
    showToast("Tocca prima Avvia strumento touch");
    return;
  }
  if (touchWallV8.active) return;
  touchWallV8.active = true;
  touchWallV8.pointerId = event.pointerId;
  try { touchWallElementV8.setPointerCapture(event.pointerId); } catch {}
  selectTouchNoteV8(touchIndexFromYV8(event.clientY), true);
  setStatus("SUONO ATTIVO • scorri sulla parete destra • rilascia per fermare");
}

function moveTouchWallV8(event) {
  if (!touchWallV8.active || event.pointerId !== touchWallV8.pointerId) return;
  event.preventDefault();
  selectTouchNoteV8(touchIndexFromYV8(event.clientY), false);
}

function stopTouchWallV8(event) {
  if (!touchWallV8.active) return;
  if (event?.pointerId !== undefined && event.pointerId !== touchWallV8.pointerId) return;
  event?.preventDefault?.();
  touchWallV8.active = false;
  touchWallV8.pointerId = null;
  touchWallV8.index = -1;
  state.pinch = false;
  clearTimeout(touchWallV8.exactTimer);
  stopLead(false);
  renderTouchWallV8();
  $("noteDisplay").classList.remove("glide-v4");
  bendReadout.textContent = "PREMI LA PARETE DESTRA";
  setStatus("Parete destra = melodia cromatica • accordi a sinistra");
}

touchWallElementV8.addEventListener("pointerdown", startTouchWallV8);
touchWallElementV8.addEventListener("pointermove", moveTouchWallV8);
touchWallElementV8.addEventListener("pointerup", stopTouchWallV8);
touchWallElementV8.addEventListener("pointercancel", stopTouchWallV8);
touchWallElementV8.addEventListener("lostpointercapture", stopTouchWallV8);
touchWallElementV8.addEventListener("contextmenu", (event) => event.preventDefault());
addEventListener("pointerup", stopTouchWallV8);
addEventListener("pointercancel", stopTouchWallV8);

// The hand tracker must never start or stop notes in touch mode.
const setPinchBeforeV8 = setPinch;
setPinch = function(active, baseMidi) {
  if (touchWallV8.enabled) {
    if (!touchWallV8.active) state.pinch = false;
    return;
  }
  return setPinchBeforeV8(active, baseMidi);
};

// Replace the original camera start control with an audio-only touch start.
const originalStartButtonV8 = $("startBtn");
const touchStartButtonV8 = originalStartButtonV8.cloneNode(true);
originalStartButtonV8.replaceWith(touchStartButtonV8);
touchStartButtonV8.textContent = "Avvia strumento touch";
touchStartButtonV8.addEventListener("click", async () => {
  const errorBox = $("startError");
  errorBox.textContent = "";
  touchStartButtonV8.disabled = true;
  touchStartButtonV8.textContent = "Caricamento suono…";
  try {
    await resumeAudio();
    state.started = true;
    $("startScreen").classList.add("hidden");
    bendReadout.textContent = "PREMI LA PARETE DESTRA";
    setStatus("Parete destra = melodia cromatica • accordi a sinistra");
  } catch (error) {
    console.error(error);
    errorBox.textContent = "Non riesco ad avviare l’audio. Ricarica la pagina e riprova.";
  } finally {
    touchStartButtonV8.disabled = false;
    touchStartButtonV8.textContent = "Avvia strumento touch";
  }
});

// Update the introduction for the new control scheme.
const startCardV8 = $("startScreen").querySelector(".start-card");
startCardV8.querySelector("p").textContent = "Suona premendo la parete cromatica sulla destra. Gli accordi restano sulla sinistra.";
startCardV8.querySelector(".instructions").innerHTML = `
  <div class="instruction"><b>👉</b><span>Premi e tieni il dito sulla parete destra per far partire la nota.</span></div>
  <div class="instruction"><b>↕</b><span>Scorri verticalmente: tutte le note della scala cromatica da G3 a G5.</span></div>
  <div class="instruction"><b>◯</b><span>Rilascia lo schermo per fermare immediatamente la melodia.</span></div>
  <div class="instruction"><b>🎻</b><span>Tocca gli accordi sulla sinistra per accompagnare.</span></div>`;

// Raise chord volume as requested.
$("chordVolume").value = "70";
$("chordOut").textContent = "70%";
if (state.audio) state.audio.chordBus.gain.value = .70;

$("stopBtn").addEventListener("click", () => stopTouchWallV8());
document.addEventListener("visibilitychange", () => { if (document.hidden) stopTouchWallV8(); });
renderTouchWallV8();
