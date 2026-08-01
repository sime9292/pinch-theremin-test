import { HandLandmarker, FilesetResolver } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/+esm";

const $ = (id) => document.getElementById(id);
const video = $("camera");
const canvas = $("overlay");
const ctx = canvas.getContext("2d");

const NOTE_NAMES = ["C","C♯","D","E♭","E","F","F♯","G","A♭","A","B♭","B"];
const SHARP_NAMES = ["C","C♯","D","D♯","E","F","F♯","G","G♯","A","A♯","B"];
const CONNECTIONS = [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[17,18],[18,19],[19,20],[0,17]];
const SCALES = {
  shine: [55,58,60,62,64,65,66,67,70,72,74,76,77,78,79],
  majorPenta: [60,62,64,67,69,72,74,76,79,81,84],
  minorPenta: [57,60,62,64,67,69,72,74,76,79,81],
  major: [60,62,64,65,67,69,71,72,74,76,77,79,81,83,84],
  dorian: [62,64,65,67,69,71,72,74,76,77,79,81,83,84,86],
  blues: [57,60,62,63,64,67,69,72,74,75,76,79,81]
};
const DEFAULT_CHORDS = [
  { id: "gm9", name: "Gm9", notes: [43,50,53,58,69] },
  { id: "bbmaj7", name: "B♭maj7", notes: [46,53,57,62] },
  { id: "cadd9", name: "Cadd9", notes: [48,55,62,64] },
  { id: "ebmaj7", name: "E♭maj7", notes: [51,58,62,67] }
];

const state = {
  started: false,
  stream: null,
  facingMode: "user",
  tracker: null,
  processing: false,
  loopToken: 0,
  lastVideoTime: -1,
  hand: null,
  smoothHand: null,
  lastSeenAt: 0,
  selectedIndex: -1,
  yFiltered: null,
  pinch: false,
  closeFrames: 0,
  tiltFiltered: null,
  neutralTilt: null,
  bend: 0,
  audio: null,
  lead: null,
  chordVoice: null,
  activeChordId: null,
  previewVoice: null,
  editingId: null,
  selectedMidi: new Set(),
  chords: loadChords()
};

function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y, (a.z || 0) - (b.z || 0)); }
function freq(midi) { return 440 * Math.pow(2, (midi - 69) / 12); }
function midiName(midi) { return NOTE_NAMES[((Math.round(midi) % 12) + 12) % 12] + (Math.floor(Math.round(midi) / 12) - 1); }
function escapeHtml(value) { return String(value).replace(/[&<>'"]/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c])); }
function uid() { return `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`; }

function loadChords() {
  try {
    const saved = JSON.parse(localStorage.getItem("handMelodyChordsClean"));
    if (Array.isArray(saved) && saved.length) return saved;
  } catch {}
  return structuredClone(DEFAULT_CHORDS);
}
function saveChords() { localStorage.setItem("handMelodyChordsClean", JSON.stringify(state.chords)); }
function showToast(text) {
  const toast = $("toast");
  toast.textContent = text;
  toast.classList.add("show");
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => toast.classList.remove("show"), 1500);
}
function setStatus(text) { $("status").textContent = text; }

const extraStyle = document.createElement("style");
extraStyle.textContent = `
  #cameraSwitchBtn{right:64px}
  .clean-chord-title{position:absolute;z-index:7;left:10px;top:calc(env(safe-area-inset-top) + 66px);width:min(32vw,130px);text-align:center;font-size:9px;letter-spacing:.16em;font-weight:900;color:#ffe4a3;text-shadow:0 2px 8px #000}
  #chordRail{top:calc(env(safe-area-inset-top) + 90px)!important;width:min(32vw,130px)!important;padding:5px!important;border-radius:20px;background:rgba(5,9,17,.25);border:1px solid rgba(255,255,255,.1)}
  #chordRail .chord-btn{flex:0 0 auto;min-height:64px;font-size:17px;background:rgba(7,12,22,.72);border-width:2px}
  #chordRail .chord-btn.active{background:rgba(74,53,18,.75)}
  #chordRail .chord-btn span{font-size:8px}
  .note-guide-clean{position:absolute;z-index:4;left:calc(min(32vw,130px) + 16px);right:7px;top:9%;bottom:8%;display:flex;flex-direction:column;border:1px solid rgba(255,255,255,.11);border-radius:18px;overflow:hidden;pointer-events:none;background:rgba(3,8,16,.08)}
  .note-zone-clean{flex:1;display:flex;align-items:center;justify-content:flex-end;padding:0 8px;border-bottom:1px solid rgba(255,255,255,.07);font-size:10px;font-weight:900;color:rgba(240,247,255,.58);text-shadow:0 1px 5px #000;background:rgba(30,70,95,.055)}
  .note-zone-clean:nth-child(odd){background:rgba(80,135,170,.08)}
  .note-zone-clean.active{color:white;background:linear-gradient(90deg,rgba(40,160,210,.05),rgba(62,210,190,.38));box-shadow:inset 0 0 20px rgba(95,235,255,.18)}
  .tracking-clean{position:absolute;z-index:8;left:50%;top:calc(env(safe-area-inset-top) + 72px);transform:translateX(-50%);padding:6px 10px;border-radius:999px;border:1px solid rgba(255,255,255,.16);background:rgba(5,10,18,.70);font-size:10px;font-weight:900;white-space:nowrap;color:#ffd29a}
  .tracking-clean.seen{color:#a9ffd0;border-color:rgba(141,255,194,.45)}
  .bend-clean{display:block;font-size:8px;letter-spacing:.1em;color:#ffd68a;margin-top:3px;min-height:11px}
  .bend-meter-clean{display:block;width:88px;height:4px;margin:4px auto 0;border-radius:99px;background:rgba(255,255,255,.13);overflow:hidden}
  .bend-meter-clean i{display:block;width:0;height:100%;background:linear-gradient(90deg,#7ee8ff,#ffd68a)}
  .camera-setting-clean{width:100%;padding:12px;border-radius:14px;border:1px solid var(--line);background:#17345a;font-weight:850;color:white}
  @media(max-width:420px){.note-guide-clean{left:calc(min(33vw,130px) + 11px)}.tracking-clean{top:calc(env(safe-area-inset-top) + 64px);font-size:9px}}
`;
document.head.appendChild(extraStyle);

const chordTitle = document.createElement("div");
chordTitle.className = "clean-chord-title";
chordTitle.textContent = "ACCORDI • TOCCA";
$("app").appendChild(chordTitle);

const noteGuide = document.createElement("div");
noteGuide.className = "note-guide-clean";
$("app").insertBefore(noteGuide, $("status"));

const trackingBadge = document.createElement("div");
trackingBadge.className = "tracking-clean";
trackingBadge.textContent = "MOSTRA LA MANO DESTRA";
$("app").appendChild(trackingBadge);

const bendReadout = document.createElement("span");
bendReadout.className = "bend-clean";
bendReadout.textContent = "NOTA ESATTA";
$("noteDisplay").appendChild(bendReadout);
const bendMeter = document.createElement("span");
bendMeter.className = "bend-meter-clean";
bendMeter.innerHTML = "<i></i>";
$("noteDisplay").appendChild(bendMeter);

const cameraSwitchBtn = document.createElement("button");
cameraSwitchBtn.id = "cameraSwitchBtn";
cameraSwitchBtn.className = "icon-button";
cameraSwitchBtn.type = "button";
cameraSwitchBtn.textContent = "🔄";
cameraSwitchBtn.setAttribute("aria-label", "Cambia fotocamera");
$("app").appendChild(cameraSwitchBtn);

const cameraSettingBtn = document.createElement("button");
cameraSettingBtn.type = "button";
cameraSettingBtn.className = "camera-setting-clean";
cameraSettingBtn.textContent = "🔄 Cambia fotocamera";
$("settingsSheet").querySelector(".settings-grid").insertBefore(cameraSettingBtn, $("stopBtn"));

const scaleSelect = $("scaleSelect");
scaleSelect.innerHTML = `
  <option value="shine">Shine On – Sol minore</option>
  <option value="majorPenta">Do maggiore pentatonica</option>
  <option value="minorPenta">La minore pentatonica</option>
  <option value="major">Do maggiore</option>
  <option value="dorian">Re dorica</option>
  <option value="blues">La blues</option>`;
scaleSelect.value = "shine";
$("octaveSelect").parentElement.style.display = "none";
$("handInvertToggle").closest(".toggle").style.display = "none";

function currentScale() { return SCALES[scaleSelect.value] || SCALES.shine; }
function renderNoteGuide() {
  noteGuide.innerHTML = "";
  const notes = currentScale();
  [...notes].reverse().forEach((midi, visualIndex) => {
    const zone = document.createElement("div");
    zone.className = "note-zone-clean";
    zone.dataset.index = String(notes.length - 1 - visualIndex);
    zone.textContent = midiName(midi);
    noteGuide.appendChild(zone);
  });
  updateNoteGuide();
}
function updateNoteGuide() {
  noteGuide.querySelectorAll(".note-zone-clean").forEach((zone) => {
    zone.classList.toggle("active", Number(zone.dataset.index) === state.selectedIndex);
  });
}

function resizeCanvas() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(innerWidth * dpr);
  canvas.height = Math.round(innerHeight * dpr);
  canvas.style.width = `${innerWidth}px`;
  canvas.style.height = `${innerHeight}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
addEventListener("resize", resizeCanvas);
addEventListener("orientationchange", () => setTimeout(resizeCanvas, 250));
resizeCanvas();

function initAudio() {
  if (state.audio) return state.audio;
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  const A = new AudioCtx({ latencyHint: "interactive" });
  const master = A.createGain();
  const compressor = A.createDynamicsCompressor();
  compressor.threshold.value = -18;
  compressor.knee.value = 12;
  compressor.ratio.value = 3;
  compressor.attack.value = 0.004;
  compressor.release.value = 0.12;
  master.gain.value = 0.88;
  master.connect(compressor);
  compressor.connect(A.destination);
  const melodyBus = A.createGain();
  const chordBus = A.createGain();
  melodyBus.gain.value = Number($("melodyVolume").value) / 100;
  chordBus.gain.value = Number($("chordVolume").value) / 100;
  melodyBus.connect(master);
  chordBus.connect(master);
  state.audio = { A, master, melodyBus, chordBus };
  return state.audio;
}
async function resumeAudio() {
  const { A } = initAudio();
  if (A.state !== "running") await A.resume();
}
function holdParam(param, now) {
  if (typeof param.cancelAndHoldAtTime === "function") param.cancelAndHoldAtTime(now);
  else {
    const value = param.value;
    param.cancelScheduledValues(now);
    param.setValueAtTime(Math.max(0.0001, value), now);
  }
}

function createLead(midi) {
  const { A, melodyBus } = initAudio();
  const now = A.currentTime;
  const input = A.createGain();
  const highpass = A.createBiquadFilter();
  const lowpass = A.createBiquadFilter();
  const amp = A.createGain();
  const osc1 = A.createOscillator();
  const osc2 = A.createOscillator();
  const g1 = A.createGain();
  const g2 = A.createGain();

  osc1.type = "triangle";
  osc2.type = "sine";
  g1.gain.value = 0.16;
  g2.gain.value = 0.032;
  highpass.type = "highpass";
  highpass.frequency.value = 90;
  lowpass.type = "lowpass";
  lowpass.frequency.value = 1450;
  lowpass.Q.value = 0.58;

  amp.gain.setValueAtTime(0.0001, now);
  amp.gain.exponentialRampToValueAtTime(0.92, now + 0.035);
  amp.gain.exponentialRampToValueAtTime(0.72, now + 0.18);

  osc1.connect(g1); osc2.connect(g2);
  g1.connect(input); g2.connect(input);
  input.connect(highpass); highpass.connect(lowpass); lowpass.connect(amp); amp.connect(melodyBus);
  osc1.start(now); osc2.start(now);

  const lead = { A, osc1, osc2, amp, filter: lowpass, stopped: false, midi };
  setLeadPitch(lead, midi, true);
  return lead;
}
function setLeadPitch(lead, midiFloat, attack = false) {
  if (!lead || lead.stopped) return;
  const now = lead.A.currentTime;
  const base = freq(midiFloat);
  const glide = attack ? 0.003 : 0.008;
  lead.osc1.frequency.cancelScheduledValues(now);
  lead.osc2.frequency.cancelScheduledValues(now);
  lead.osc1.frequency.setTargetAtTime(base, now, glide);
  lead.osc2.frequency.setTargetAtTime(base * 2, now, glide);
  const cutoff = clamp(1180 + (midiFloat - 48) * 17, 1180, 1850);
  lead.filter.frequency.cancelScheduledValues(now);
  lead.filter.frequency.setTargetAtTime(cutoff, now, 0.025);
  lead.midi = midiFloat;
}
function startLead(midi) {
  stopLead(true);
  state.lead = createLead(midi);
}
function stopLead(immediate = false) {
  const lead = state.lead;
  state.lead = null;
  if (!lead || lead.stopped) return;
  lead.stopped = true;
  const now = lead.A.currentTime;
  holdParam(lead.amp.gain, now);
  lead.amp.gain.setTargetAtTime(0.0001, now, immediate ? 0.012 : 0.028);
  const stopAt = now + (immediate ? 0.09 : 0.18);
  try { lead.osc1.stop(stopAt); } catch {}
  try { lead.osc2.stop(stopAt); } catch {}
}

function normalizeChordNotes(notes) {
  const sorted = [...new Set(notes)].sort((a, b) => a - b);
  if (!sorted.length) return [];
  while (sorted[0] < 40) for (let i = 0; i < sorted.length; i++) sorted[i] += 12;
  return sorted.slice(0, 5);
}
function createChordVoice(notes, level = 1) {
  const { A, chordBus } = initAudio();
  const now = A.currentTime;
  const group = A.createGain();
  const lowpass = A.createBiquadFilter();
  const highpass = A.createBiquadFilter();
  const sources = [];
  group.gain.setValueAtTime(0.0001, now);
  group.gain.linearRampToValueAtTime(0.58 * level, now + 0.35);
  lowpass.type = "lowpass";
  lowpass.frequency.value = 1250;
  lowpass.Q.value = 0.5;
  highpass.type = "highpass";
  highpass.frequency.value = 82;
  group.connect(highpass); highpass.connect(lowpass); lowpass.connect(chordBus);
  normalizeChordNotes(notes).forEach((midi, index) => {
    [["triangle", -3, 0.055], ["triangle", 3, 0.055], ["sine", 0, 0.028]].forEach(([type, detune, gain]) => {
      const osc = A.createOscillator();
      const g = A.createGain();
      osc.type = type;
      osc.frequency.value = freq(midi);
      osc.detune.value = detune;
      g.gain.value = gain * (index === 0 ? 1.05 : 0.86);
      osc.connect(g); g.connect(group); osc.start(now); sources.push(osc);
    });
  });
  return {
    stop() {
      const t = A.currentTime;
      holdParam(group.gain, t);
      group.gain.setTargetAtTime(0.0001, t, 0.12);
      sources.forEach((osc) => { try { osc.stop(t + 0.65); } catch {} });
    }
  };
}
function activateChord(id) {
  const chord = state.chords.find((item) => item.id === id);
  if (!chord) return;
  resumeAudio();
  if (state.activeChordId === id) { stopChord(); return; }
  const previous = state.chordVoice;
  state.chordVoice = createChordVoice(chord.notes, 1);
  state.activeChordId = id;
  if (previous) previous.stop();
  renderChordRail();
  showToast(chord.name);
}
function stopChord() {
  if (state.chordVoice) state.chordVoice.stop();
  state.chordVoice = null;
  state.activeChordId = null;
  renderChordRail();
}
function previewChord(notes) {
  if (!notes.length) { showToast("Seleziona almeno una nota"); return; }
  resumeAudio();
  if (state.previewVoice) state.previewVoice.stop();
  state.previewVoice = createChordVoice(notes, 0.72);
  setTimeout(() => {
    if (state.previewVoice) state.previewVoice.stop();
    state.previewVoice = null;
  }, 1500);
}

function renderChordRail() {
  const rail = $("chordRail");
  rail.innerHTML = "";
  state.chords.forEach((chord) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `chord-btn${state.activeChordId === chord.id ? " active" : ""}`;
    button.innerHTML = `${escapeHtml(chord.name)}<span>${state.activeChordId === chord.id ? "IN SUONO" : "TOCCA"}</span>`;
    let timer = null;
    let longPress = false;
    button.addEventListener("pointerdown", () => {
      longPress = false;
      timer = setTimeout(() => { longPress = true; openChordEditor(chord.id); }, 650);
    });
    button.addEventListener("pointerup", () => {
      clearTimeout(timer);
      if (!longPress) activateChord(chord.id);
    });
    button.addEventListener("pointercancel", () => clearTimeout(timer));
    button.addEventListener("contextmenu", (event) => { event.preventDefault(); openChordEditor(chord.id); });
    rail.appendChild(button);
  });
  const add = document.createElement("button");
  add.type = "button";
  add.className = "chord-btn add";
  add.innerHTML = "＋<span>NUOVO</span>";
  add.addEventListener("click", () => openChordEditor(null));
  rail.appendChild(add);
  const stop = document.createElement("button");
  stop.type = "button";
  stop.className = "chord-btn";
  stop.innerHTML = "■<span>FERMA</span>";
  stop.addEventListener("click", stopChord);
  rail.appendChild(stop);
}

const chordTemplates = [
  ["maj9", [0,2,4,7,11]], ["m9", [0,2,3,7,10]], ["9", [0,2,4,7,10]],
  ["maj7", [0,4,7,11]], ["m7", [0,3,7,10]], ["7", [0,4,7,10]],
  ["m7♭5", [0,3,6,10]], ["dim7", [0,3,6,9]], ["6", [0,4,7,9]],
  ["m6", [0,3,7,9]], ["add9", [0,2,4,7]], ["sus2", [0,2,7]],
  ["sus4", [0,5,7]], ["aug", [0,4,8]], ["dim", [0,3,6]], ["m", [0,3,7]], ["", [0,4,7]]
];
function detectChord(notes) {
  if (!notes.length) return "—";
  const sorted = [...notes].sort((a, b) => a - b);
  const pcs = [...new Set(sorted.map((n) => ((n % 12) + 12) % 12))].sort((a, b) => a - b);
  const bass = pcs[0];
  let best = null;
  for (const root of pcs) {
    for (const [suffix, pattern] of chordTemplates) {
      const target = pattern.map((step) => (root + step) % 12).sort((a, b) => a - b);
      if (target.length !== pcs.length || !target.every((value, index) => value === pcs[index])) continue;
      const score = pattern.length * 10 + (root === bass ? 4 : 0);
      if (!best || score > best.score) best = { root, suffix, score };
    }
  }
  return best ? `${SHARP_NAMES[best.root]}${best.suffix}` : pcs.map((pc) => SHARP_NAMES[pc]).join("/");
}
function buildPiano() {
  const white = $("whiteKeys");
  const piano = $("piano");
  white.innerHTML = "";
  piano.querySelectorAll(".key.black").forEach((key) => key.remove());
  const whitePcs = new Set([0,2,4,5,7,9,11]);
  for (let midi = 48; midi <= 71; midi++) {
    if (!whitePcs.has(midi % 12)) continue;
    const key = makeKey(midi, "white");
    white.appendChild(key);
  }
  let whiteIndex = 0;
  for (let midi = 48; midi <= 71; midi++) {
    if (whitePcs.has(midi % 12)) { whiteIndex++; continue; }
    const key = makeKey(midi, "black");
    key.style.left = `${whiteIndex * 48 - 15.5}px`;
    piano.appendChild(key);
  }
}
function makeKey(midi, type) {
  const key = document.createElement("button");
  key.type = "button";
  key.className = `key ${type}`;
  key.dataset.midi = String(midi);
  key.textContent = midiName(midi);
  key.addEventListener("click", () => {
    state.selectedMidi.has(midi) ? state.selectedMidi.delete(midi) : state.selectedMidi.add(midi);
    updateChordEditor();
  });
  return key;
}
function updateChordEditor() {
  document.querySelectorAll(".key").forEach((key) => key.classList.toggle("selected", state.selectedMidi.has(Number(key.dataset.midi))));
  const notes = [...state.selectedMidi].sort((a, b) => a - b);
  const detected = detectChord(notes);
  $("detectedChord").textContent = detected;
  $("selectedNotes").textContent = notes.length ? notes.map(midiName).join(" · ") : "Nessuna nota selezionata";
  if (!$("customChordName").dataset.touched) $("customChordName").value = detected === "—" ? "" : detected;
}
function openSheet(id) {
  $("sheetBackdrop").classList.remove("hidden");
  $(id).classList.remove("hidden");
}
function closeSheets() {
  $("sheetBackdrop").classList.add("hidden");
  $("settingsSheet").classList.add("hidden");
  $("chordSheet").classList.add("hidden");
  if (state.previewVoice) state.previewVoice.stop();
  state.previewVoice = null;
}
function openChordEditor(id) {
  state.editingId = id;
  state.selectedMidi.clear();
  const chord = state.chords.find((item) => item.id === id);
  if (chord) chord.notes.forEach((note) => state.selectedMidi.add(note));
  $("chordSheetTitle").textContent = chord ? "Modifica accordo" : "Nuovo accordo";
  $("saveChord").textContent = chord ? "Salva" : "Aggiungi";
  $("deleteChord").classList.toggle("hidden", !chord);
  $("customChordName").dataset.touched = "";
  $("customChordName").value = chord?.name || "";
  updateChordEditor();
  openSheet("chordSheet");
}
function saveChordFromEditor() {
  const notes = [...state.selectedMidi].sort((a, b) => a - b);
  if (notes.length < 2) { showToast("Scegli almeno due note"); return; }
  const name = $("customChordName").value.trim() || detectChord(notes);
  if (state.editingId) {
    const chord = state.chords.find((item) => item.id === state.editingId);
    if (chord) { chord.name = name; chord.notes = notes; }
  } else state.chords.push({ id: uid(), name, notes });
  saveChords(); renderChordRail(); closeSheets(); showToast("Accordo salvato");
}
function deleteChord() {
  if (!state.editingId) return;
  if (state.activeChordId === state.editingId) stopChord();
  state.chords = state.chords.filter((chord) => chord.id !== state.editingId);
  saveChords(); renderChordRail(); closeSheets(); showToast("Accordo eliminato");
}

function smoothLandmarks(hand) {
  if (!state.smoothHand) {
    state.smoothHand = hand.map((point) => ({ x: point.x, y: point.y, z: point.z || 0 }));
    return state.smoothHand;
  }
  state.smoothHand = hand.map((point, index) => {
    const previous = state.smoothHand[index] || point;
    const movement = Math.hypot(point.x - previous.x, point.y - previous.y);
    const alpha = clamp(0.28 + movement * 7, 0.28, 0.78);
    return {
      x: previous.x + (point.x - previous.x) * alpha,
      y: previous.y + (point.y - previous.y) * alpha,
      z: previous.z + ((point.z || 0) - previous.z) * alpha
    };
  });
  return state.smoothHand;
}
function noteIndexFromY(y) {
  const notes = currentScale();
  const continuous = (1 - clamp((y - 0.08) / 0.84, 0, 1)) * (notes.length - 1);
  if (state.selectedIndex < 0) return Math.round(continuous);
  if (continuous > state.selectedIndex + 0.64) return Math.min(notes.length - 1, Math.round(continuous));
  if (continuous < state.selectedIndex - 0.64) return Math.max(0, Math.round(continuous));
  return state.selectedIndex;
}
function visibleTilt(hand) {
  const wrist = hand[0];
  const middle = hand[9];
  const mirror = $("mirrorToggle").checked;
  const wx = mirror ? 1 - wrist.x : wrist.x;
  const mx = mirror ? 1 - middle.x : middle.x;
  return Math.atan2(mx - wx, Math.max(0.001, wrist.y - middle.y)) * 180 / Math.PI;
}
function updateBend(tilt) {
  if (state.neutralTilt === null) state.neutralTilt = tilt;
  if (state.tiltFiltered === null) state.tiltFiltered = tilt;
  let delta = ((tilt - state.tiltFiltered + 540) % 360) - 180;
  state.tiltFiltered += delta * clamp(0.32 + Math.abs(delta) * 0.02, 0.32, 0.75);
  const rotation = state.tiltFiltered - state.neutralTilt;
  const target = clamp((rotation - 4) / 24, 0, 1);
  state.bend += (target - state.bend) * (Math.abs(target - state.bend) > 0.12 ? 0.48 : 0.30);
  return state.bend;
}
function resetGestureState() {
  state.hand = null;
  state.smoothHand = null;
  state.selectedIndex = -1;
  state.yFiltered = null;
  state.closeFrames = 0;
  state.tiltFiltered = null;
  state.neutralTilt = null;
  state.bend = 0;
  state.pinch = false;
  $("noteName").textContent = "—";
  bendReadout.textContent = "NOTA ESATTA";
  bendMeter.firstElementChild.style.width = "0%";
  updateNoteGuide();
}
function setPinch(active, baseMidi) {
  if (active === state.pinch) return;
  state.pinch = active;
  if (active) {
    state.neutralTilt = state.tiltFiltered;
    state.bend = 0;
    startLead(baseMidi);
    bendReadout.textContent = "NOTA ESATTA";
    if (navigator.vibrate) navigator.vibrate(5);
  } else {
    state.neutralTilt = null;
    state.bend = 0;
    bendMeter.firstElementChild.style.width = "0%";
    bendReadout.textContent = "NOTA ESATTA";
    stopLead(false);
  }
}
function processHand(rawHand) {
  const now = performance.now();
  if (!rawHand) {
    if (state.lastSeenAt && now - state.lastSeenAt < 110) {
      trackingBadge.textContent = "AGGANCIO MANO…";
      return;
    }
    if (state.pinch) setPinch(false, 0);
    resetGestureState();
    trackingBadge.textContent = "MANO NON VISTA";
    trackingBadge.classList.remove("seen");
    return;
  }

  state.lastSeenAt = now;
  const hand = smoothLandmarks(rawHand);
  state.hand = hand;
  const thumb = hand[4];
  const index = hand[8];
  const wrist = hand[0];
  const middle = hand[9];
  const palm = Math.max(0.025, dist(wrist, middle));
  const ratio = dist(thumb, index) / palm;
  const sensitivity = Number($("pinchSensitivity").value) / 100;
  const closeThreshold = 0.39 * sensitivity;
  const openThreshold = 0.56 * sensitivity;

  const rawY = (thumb.y + index.y) / 2;
  state.yFiltered = state.yFiltered === null ? rawY : state.yFiltered + (rawY - state.yFiltered) * 0.48;
  state.selectedIndex = noteIndexFromY(state.yFiltered);
  const baseMidi = currentScale()[state.selectedIndex];
  $("noteName").textContent = midiName(baseMidi);
  updateNoteGuide();

  const tilt = visibleTilt(hand);
  if (state.tiltFiltered === null) state.tiltFiltered = tilt;

  if (!state.pinch) {
    state.closeFrames = ratio < closeThreshold ? state.closeFrames + 1 : 0;
    if (ratio < closeThreshold * 0.82 || state.closeFrames >= 2) {
      state.closeFrames = 0;
      setPinch(true, baseMidi);
    }
  } else if (ratio > openThreshold) {
    // Opening the fingers is deliberately immediate. No debounce and no effect tail.
    setPinch(false, baseMidi);
  }

  if (state.pinch) {
    const bend = updateBend(tilt);
    const targetMidi = baseMidi + bend * 2;
    setLeadPitch(state.lead, targetMidi, false);
    const cents = Math.round(bend * 200);
    bendReadout.textContent = cents < 3 ? "NOTA ESATTA" : cents >= 197 ? "BEND +1 TONO" : `BEND +${cents}¢`;
    bendMeter.firstElementChild.style.width = `${Math.round(bend * 100)}%`;
    trackingBadge.textContent = cents > 3 ? "SUONO • BEND CON ROTAZIONE" : "SUONO ATTIVO • APRI LE DITA PER FERMARE";
  } else {
    trackingBadge.textContent = "NOTA AGGANCIATA • UNISCI POLLICE E INDICE";
  }
  trackingBadge.classList.add("seen");
}

function videoPoint(point) {
  const vw = video.videoWidth || 1;
  const vh = video.videoHeight || 1;
  const scale = Math.max(innerWidth / vw, innerHeight / vh);
  const shownW = vw * scale;
  const shownH = vh * scale;
  const offsetX = (innerWidth - shownW) / 2;
  const offsetY = (innerHeight - shownH) / 2;
  let x = point.x * shownW + offsetX;
  if ($("mirrorToggle").checked) x = innerWidth - x;
  return { x, y: point.y * shownH + offsetY };
}
function drawOverlay() {
  ctx.clearRect(0, 0, innerWidth, innerHeight);
  if (!state.hand) return;
  ctx.lineWidth = 2.2;
  ctx.strokeStyle = "rgba(126,232,255,.78)";
  ctx.fillStyle = "rgba(255,255,255,.88)";
  CONNECTIONS.forEach(([a, b]) => {
    const p1 = videoPoint(state.hand[a]);
    const p2 = videoPoint(state.hand[b]);
    ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
  });
  state.hand.forEach((point, index) => {
    const p = videoPoint(point);
    ctx.beginPath();
    ctx.arc(p.x, p.y, index === 4 || index === 8 ? 5 : 2.4, 0, Math.PI * 2);
    ctx.fillStyle = index === 4 || index === 8 ? (state.pinch ? "#ffd68a" : "#7ee8ff") : "rgba(255,255,255,.82)";
    ctx.fill();
  });
}

async function loadTracker() {
  if (state.tracker) return state.tracker;
  setStatus("Caricamento rilevamento mano…");
  const vision = await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm");
  const options = {
    baseOptions: {
      modelAssetPath: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
      delegate: "GPU"
    },
    runningMode: "VIDEO",
    numHands: 1,
    minHandDetectionConfidence: 0.42,
    minHandPresenceConfidence: 0.38,
    minTrackingConfidence: 0.45
  };
  try { state.tracker = await HandLandmarker.createFromOptions(vision, options); }
  catch (error) {
    console.warn("GPU non disponibile, uso CPU", error);
    options.baseOptions.delegate = "CPU";
    state.tracker = await HandLandmarker.createFromOptions(vision, options);
  }
  return state.tracker;
}
async function requestCamera(facingMode) {
  return navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      facingMode: { ideal: facingMode },
      width: { ideal: 640 },
      height: { ideal: 480 },
      frameRate: { ideal: 30, max: 60 }
    }
  });
}
async function startCamera(facingMode) {
  const stream = await requestCamera(facingMode);
  state.stream = stream;
  state.facingMode = facingMode;
  video.srcObject = stream;
  await video.play();
  const mirror = facingMode === "user";
  $("mirrorToggle").checked = mirror;
  video.style.transform = mirror ? "scaleX(-1)" : "none";
}
function scheduleLoop() {
  const token = ++state.loopToken;
  const step = (now) => {
    if (!state.started || token !== state.loopToken) return;
    if (video.readyState >= 2 && state.tracker && video.currentTime !== state.lastVideoTime && !state.processing) {
      state.processing = true;
      state.lastVideoTime = video.currentTime;
      try {
        const result = state.tracker.detectForVideo(video, now);
        processHand(result?.landmarks?.[0] || null);
      } catch (error) {
        console.warn("Errore fotogramma", error);
      } finally {
        state.processing = false;
      }
    }
    drawOverlay();
    if (typeof video.requestVideoFrameCallback === "function") video.requestVideoFrameCallback(step);
    else requestAnimationFrame(step);
  };
  if (typeof video.requestVideoFrameCallback === "function") video.requestVideoFrameCallback(step);
  else requestAnimationFrame(step);
}
async function startApp() {
  const errorBox = $("startError");
  errorBox.textContent = "";
  if (!window.isSecureContext) { errorBox.textContent = "La fotocamera richiede una pagina HTTPS."; return; }
  if (!navigator.mediaDevices?.getUserMedia) { errorBox.textContent = "Questo browser non consente l’accesso alla fotocamera."; return; }
  $("startBtn").disabled = true;
  $("startBtn").textContent = "Avvio…";
  try {
    await resumeAudio();
    await Promise.all([loadTracker(), startCamera("user")]);
    state.started = true;
    $("startScreen").classList.add("hidden");
    setStatus("Altezza = nota esatta • Pinch = suono • Rotazione destra = bend");
    scheduleLoop();
  } catch (error) {
    console.error(error);
    stopAll();
    errorBox.textContent = error?.name === "NotAllowedError" ? "Permesso fotocamera negato. Consentilo nelle impostazioni di Chrome." : "Impossibile avviare la fotocamera o il rilevamento.";
  } finally {
    $("startBtn").disabled = false;
    $("startBtn").textContent = "Avvia fotocamera e audio";
  }
}
function stopAll() {
  state.started = false;
  state.loopToken++;
  stopLead(true);
  stopChord();
  if (state.previewVoice) state.previewVoice.stop();
  state.previewVoice = null;
  state.stream?.getTracks?.().forEach((track) => track.stop());
  state.stream = null;
  video.srcObject = null;
  resetGestureState();
  ctx.clearRect(0, 0, innerWidth, innerHeight);
  $("startScreen").classList.remove("hidden");
  setStatus("Tocca Avvia per attivare fotocamera e audio");
}
async function switchCamera() {
  if (!state.started) { showToast("Avvia prima la fotocamera"); return; }
  const previous = state.facingMode;
  const next = previous === "user" ? "environment" : "user";
  cameraSwitchBtn.disabled = true;
  cameraSettingBtn.disabled = true;
  stopLead(true);
  state.stream?.getTracks?.().forEach((track) => track.stop());
  try {
    await startCamera(next);
    resetGestureState();
    showToast(next === "user" ? "Fotocamera frontale" : "Fotocamera posteriore");
  } catch (error) {
    console.error(error);
    try { await startCamera(previous); } catch {}
    showToast("Cambio fotocamera non riuscito");
  } finally {
    cameraSwitchBtn.disabled = false;
    cameraSettingBtn.disabled = false;
  }
}

$("startBtn").addEventListener("click", startApp);
$("stopBtn").addEventListener("click", () => { closeSheets(); stopAll(); });
cameraSwitchBtn.addEventListener("click", switchCamera);
cameraSettingBtn.addEventListener("click", switchCamera);
$("settingsBtn").addEventListener("click", () => openSheet("settingsSheet"));
$("sheetBackdrop").addEventListener("click", closeSheets);
document.querySelectorAll("[data-close]").forEach((button) => button.addEventListener("click", closeSheets));
$("cancelChord").addEventListener("click", closeSheets);
$("saveChord").addEventListener("click", saveChordFromEditor);
$("deleteChord").addEventListener("click", deleteChord);
$("clearChord").addEventListener("click", () => { state.selectedMidi.clear(); $("customChordName").dataset.touched = ""; $("customChordName").value = ""; updateChordEditor(); });
$("listenChord").addEventListener("click", () => previewChord([...state.selectedMidi].sort((a, b) => a - b)));
$("customChordName").addEventListener("input", (event) => { event.target.dataset.touched = "1"; });
scaleSelect.addEventListener("change", () => { state.selectedIndex = -1; renderNoteGuide(); });
$("mirrorToggle").addEventListener("change", (event) => { video.style.transform = event.target.checked ? "scaleX(-1)" : "none"; });
$("pinchSensitivity").addEventListener("input", (event) => { $("pinchOut").textContent = `${event.target.value}%`; });
$("melodyVolume").value = "55";
$("melodyOut").textContent = "55%";
$("melodyVolume").addEventListener("input", (event) => {
  $("melodyOut").textContent = `${event.target.value}%`;
  if (state.audio) state.audio.melodyBus.gain.value = Number(event.target.value) / 100;
});
$("chordVolume").addEventListener("input", (event) => {
  $("chordOut").textContent = `${event.target.value}%`;
  if (state.audio) state.audio.chordBus.gain.value = Number(event.target.value) / 100;
});
addEventListener("pagehide", () => stopAll());
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    stopLead(true);
    state.pinch = false;
  }
});

buildPiano();
renderNoteGuide();
renderChordRail();
