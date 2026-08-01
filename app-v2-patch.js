// V2: clearer landmarks, reliable bend and a new silky solo lead.
state.bendPlane = null;
state.bendDepth = null;
state.neutralBendPlane = null;
state.neutralBendDepth = null;

const v2Style = document.createElement("style");
v2Style.textContent = `
  .v2-gesture-help{position:absolute;z-index:8;right:8px;top:calc(env(safe-area-inset-top) + 118px);max-width:118px;padding:7px 8px;border-radius:13px;border:1px solid rgba(255,255,255,.13);background:rgba(5,9,17,.68);font-size:8px;line-height:1.3;font-weight:850;text-align:center;color:#d9f7ff;pointer-events:none}
  .v2-sound-badge{position:absolute;z-index:8;right:8px;bottom:calc(env(safe-area-inset-bottom) + 54px);padding:6px 8px;border-radius:999px;border:1px solid rgba(169,243,255,.28);background:rgba(4,10,18,.66);font-size:8px;font-weight:900;letter-spacing:.08em;color:#bdefff;pointer-events:none}
  @media(max-width:420px){.v2-gesture-help{top:calc(env(safe-area-inset-top) + 108px);max-width:102px}}
`;
document.head.appendChild(v2Style);

const v2GestureHelp = document.createElement("div");
v2GestureHelp.className = "v2-gesture-help";
v2GestureHelp.innerHTML = "P = POLLICE · I = INDICE · M = MEDIO<br>↻ RUOTA O INCLINA LA MANO PER IL BEND";
$("app").appendChild(v2GestureHelp);
const v2SoundBadge = document.createElement("div");
v2SoundBadge.className = "v2-sound-badge";
v2SoundBadge.textContent = "SILKY SOLO LEAD";
$("app").appendChild(v2SoundBadge);

function v2RoomImpulse(A) {
  const length = Math.max(1, Math.floor(A.sampleRate * .32));
  const buffer = A.createBuffer(2, length, A.sampleRate);
  for (let c = 0; c < 2; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 3.5) * .5;
  }
  return buffer;
}
function v2SilkyWave(A) {
  const real = new Float32Array([0, 1, .25, .085, .03, .01]);
  const imag = new Float32Array(real.length);
  return A.createPeriodicWave(real, imag, { disableNormalization: false });
}

createLead = function(midi) {
  const { A, melodyBus } = initAudio();
  const now = A.currentTime;
  const input = A.createGain();
  const highpass = A.createBiquadFilter();
  const lowpass = A.createBiquadFilter();
  const body = A.createBiquadFilter();
  const dry = A.createGain();
  const convolver = A.createConvolver();
  const wet = A.createGain();
  const mix = A.createGain();
  const amp = A.createGain();
  const osc1 = A.createOscillator();
  const osc2 = A.createOscillator();
  const osc3 = A.createOscillator();
  const g1 = A.createGain();
  const g2 = A.createGain();
  const g3 = A.createGain();
  const lfo = A.createOscillator();
  const lfoGain = A.createGain();

  osc1.setPeriodicWave(v2SilkyWave(A));
  osc2.type = "sine";
  osc3.type = "sine";
  g1.gain.value = .105;
  g2.gain.value = .024;
  g3.gain.value = .008;
  highpass.type = "highpass";
  highpass.frequency.value = 105;
  highpass.Q.value = .55;
  lowpass.type = "lowpass";
  lowpass.frequency.value = 2050;
  lowpass.Q.value = .68;
  body.type = "peaking";
  body.frequency.value = 760;
  body.Q.value = .85;
  body.gain.value = 2.3;
  dry.gain.value = .91;
  convolver.buffer = v2RoomImpulse(A);
  wet.gain.value = .12;

  amp.gain.setValueAtTime(.0001, now);
  amp.gain.exponentialRampToValueAtTime(.90, now + .045);
  amp.gain.exponentialRampToValueAtTime(.66, now + .24);

  lfo.type = "sine";
  lfo.frequency.value = 5;
  lfoGain.gain.setValueAtTime(0, now);
  lfoGain.gain.linearRampToValueAtTime(1.6, now + .55);
  lfo.connect(lfoGain);
  [osc1, osc2, osc3].forEach((osc) => lfoGain.connect(osc.detune));

  osc1.connect(g1); osc2.connect(g2); osc3.connect(g3);
  g1.connect(input); g2.connect(input); g3.connect(input);
  input.connect(highpass); highpass.connect(lowpass); lowpass.connect(body);
  body.connect(dry); body.connect(convolver); convolver.connect(wet);
  dry.connect(mix); wet.connect(mix); mix.connect(amp); amp.connect(melodyBus);
  [osc1, osc2, osc3, lfo].forEach((osc) => osc.start(now));

  const lead = { A, osc1, osc2, osc3, lfo, amp, filter: lowpass, stopped: false, midi };
  setLeadPitch(lead, midi, true);
  return lead;
};

setLeadPitch = function(lead, midiFloat, attack = false) {
  if (!lead || lead.stopped) return;
  const now = lead.A.currentTime;
  const base = freq(midiFloat);
  const glide = attack ? .004 : .009;
  [[lead.osc1, base, 0], [lead.osc2, base * 2, -3], [lead.osc3, base * 3, 2]].forEach(([osc, hz, detune]) => {
    osc.frequency.cancelScheduledValues(now);
    osc.frequency.setTargetAtTime(hz, now, glide);
    osc.detune.setTargetAtTime(detune, now, .02);
  });
  const cutoff = clamp(1650 + (midiFloat - 48) * 22, 1650, 2550);
  lead.filter.frequency.cancelScheduledValues(now);
  lead.filter.frequency.setTargetAtTime(cutoff, now, .03);
  lead.midi = midiFloat;
};

stopLead = function(immediate = false) {
  const lead = state.lead;
  state.lead = null;
  if (!lead || lead.stopped) return;
  lead.stopped = true;
  const now = lead.A.currentTime;
  holdParam(lead.amp.gain, now);
  lead.amp.gain.setTargetAtTime(.0001, now, immediate ? .009 : .020);
  const stopAt = now + (immediate ? .07 : .14);
  [lead.osc1, lead.osc2, lead.osc3, lead.lfo].filter(Boolean).forEach((osc) => { try { osc.stop(stopAt); } catch {} });
};

function v2PlaneTilt(hand) {
  const wrist = hand[0];
  const middleTip = hand[12];
  const mirror = $("mirrorToggle").checked;
  const wx = mirror ? 1 - wrist.x : wrist.x;
  const mx = mirror ? 1 - middleTip.x : middleTip.x;
  return Math.atan2(mx - wx, Math.max(.001, wrist.y - middleTip.y)) * 180 / Math.PI;
}
function v2DepthRoll(hand) { return (hand[5].z || 0) - (hand[17].z || 0); }
function v2Smooth(previous, raw, alpha = .42) { return previous === null ? raw : previous + (raw - previous) * alpha; }

setPinch = function(active, baseMidi) {
  if (active === state.pinch) return;
  state.pinch = active;
  if (active) {
    const hand = state.hand;
    state.bendPlane = hand ? v2PlaneTilt(hand) : 0;
    state.bendDepth = hand ? v2DepthRoll(hand) : 0;
    state.neutralBendPlane = state.bendPlane;
    state.neutralBendDepth = state.bendDepth;
    state.bend = 0;
    startLead(baseMidi);
    bendReadout.textContent = "NOTA ESATTA";
    if (navigator.vibrate) navigator.vibrate(5);
  } else {
    state.neutralBendPlane = null;
    state.neutralBendDepth = null;
    state.bend = 0;
    bendMeter.firstElementChild.style.width = "0%";
    bendReadout.textContent = "NOTA ESATTA";
    stopLead(false);
  }
};

updateBend = function() {
  if (!state.hand) return 0;
  const planeRaw = v2PlaneTilt(state.hand);
  const depthRaw = v2DepthRoll(state.hand);
  state.bendPlane = v2Smooth(state.bendPlane, planeRaw, .48);
  state.bendDepth = v2Smooth(state.bendDepth, depthRaw, .38);
  if (state.neutralBendPlane === null) state.neutralBendPlane = state.bendPlane;
  if (state.neutralBendDepth === null) state.neutralBendDepth = state.bendDepth;
  const planeDelta = state.bendPlane - state.neutralBendPlane;
  const depthDelta = Math.abs(state.bendDepth - state.neutralBendDepth);
  const fromPlane = clamp((planeDelta - 1.5) / 13.5, 0, 1);
  const fromDepth = clamp((depthDelta - .009) / .065, 0, 1);
  const target = Math.max(fromPlane, fromDepth);
  state.bend += (target - state.bend) * (Math.abs(target - state.bend) > .1 ? .58 : .38);
  return clamp(state.bend, 0, 1);
};

function v2DrawPoint(index, radius, color, label = "") {
  const p = videoPoint(state.hand[index]);
  ctx.beginPath(); ctx.arc(p.x, p.y, radius + 3, 0, Math.PI * 2); ctx.fillStyle = "rgba(0,0,0,.48)"; ctx.fill();
  ctx.beginPath(); ctx.arc(p.x, p.y, radius, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill();
  if (label) {
    ctx.font = "900 12px system-ui";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(0,0,0,.78)";
    ctx.strokeText(label, p.x, p.y - 15);
    ctx.fillStyle = "white";
    ctx.fillText(label, p.x, p.y - 15);
  }
}

drawOverlay = function() {
  ctx.clearRect(0, 0, innerWidth, innerHeight);
  if (!state.hand) return;
  ctx.lineWidth = 2.2;
  ctx.strokeStyle = "rgba(126,232,255,.78)";
  CONNECTIONS.forEach(([a, b]) => {
    const p1 = videoPoint(state.hand[a]);
    const p2 = videoPoint(state.hand[b]);
    ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
  });
  state.hand.forEach((point) => {
    const p = videoPoint(point);
    ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,.9)";
    ctx.fill();
  });
  const axisA = videoPoint(state.hand[0]);
  const axisB = videoPoint(state.hand[12]);
  ctx.save();
  ctx.setLineDash([7, 5]);
  ctx.lineWidth = 3.2;
  ctx.strokeStyle = "rgba(255,214,138,.9)";
  ctx.beginPath(); ctx.moveTo(axisA.x, axisA.y); ctx.lineTo(axisB.x, axisB.y); ctx.stroke();
  ctx.restore();
  const pinchA = videoPoint(state.hand[4]);
  const pinchB = videoPoint(state.hand[8]);
  ctx.lineWidth = 4;
  ctx.strokeStyle = state.pinch ? "#ffd68a" : "rgba(126,232,255,.8)";
  ctx.beginPath(); ctx.moveTo(pinchA.x, pinchA.y); ctx.lineTo(pinchB.x, pinchB.y); ctx.stroke();
  v2DrawPoint(4, 7, state.pinch ? "#ffd68a" : "#7ee8ff", "P");
  v2DrawPoint(8, 7, state.pinch ? "#ffd68a" : "#7ee8ff", "I");
  v2DrawPoint(12, 7, "#a9ffd0", "M");
  v2DrawPoint(9, 5, "#9db7ff");
  v2DrawPoint(0, 5, "#ffffff");
};

$("melodyVolume").value = "52";
$("melodyOut").textContent = "52%";
if (state.audio) state.audio.melodyBus.gain.value = .52;