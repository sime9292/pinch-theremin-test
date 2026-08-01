// V4: exact pitch on note start and while holding; glide only when changing note with pinch held.
state.glideTransition = null;

const glideStyleV4 = document.createElement("style");
glideStyleV4.textContent = `
  .v4-mode-badge{position:absolute;z-index:8;right:8px;top:calc(env(safe-area-inset-top) + 176px);max-width:122px;padding:7px 8px;border-radius:13px;border:1px solid rgba(169,243,255,.24);background:rgba(5,9,17,.70);font-size:8px;line-height:1.32;font-weight:900;text-align:center;color:#d9f7ff;pointer-events:none}
  .note-display.glide-v4{box-shadow:0 0 34px rgba(126,232,255,.32)}
  @media(max-width:420px){.v4-mode-badge{top:calc(env(safe-area-inset-top) + 164px);max-width:106px}}
`;
document.head.appendChild(glideStyleV4);

const glideBadgeV4 = document.createElement("div");
glideBadgeV4.className = "v4-mode-badge";
glideBadgeV4.innerHTML = "NOTA SEMPRE ESATTA<br>DITA UNITE + CAMBIO FASCIA = PASSAGGIO";
$("app").appendChild(glideBadgeV4);

if (typeof v2GestureHelp !== "undefined") {
  v2GestureHelp.innerHTML = "P = POLLICE · I = INDICE · C = CENTRO P/I<br>C SCEGLIE SEMPRE UNA NOTA ESATTA";
}
if (typeof midpointBadgeV3 !== "undefined") {
  midpointBadgeV3.innerHTML = "C = CENTRO TRA POLLICE E INDICE<br>SPOSTA C PER CAMBIARE NOTA";
}

// No free bend from rotation or depth. Pitch variation exists only during a note-to-note glide.
updateBend = function() {
  state.bend = 0;
  return 0;
};

// Rebuild the silky lead without automatic vibrato, so a held note remains exactly in tune.
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

  osc1.setPeriodicWave(v2SilkyWave(A));
  osc2.type = "sine";
  osc3.type = "sine";
  g1.gain.value = .105;
  g2.gain.value = .022;
  g3.gain.value = .006;

  highpass.type = "highpass";
  highpass.frequency.value = 105;
  highpass.Q.value = .55;
  lowpass.type = "lowpass";
  lowpass.frequency.value = 2050;
  lowpass.Q.value = .66;
  body.type = "peaking";
  body.frequency.value = 760;
  body.Q.value = .85;
  body.gain.value = 2.1;
  dry.gain.value = .93;
  convolver.buffer = v2RoomImpulse(A);
  wet.gain.value = .09;

  amp.gain.setValueAtTime(.0001, now);
  amp.gain.exponentialRampToValueAtTime(.88, now + .040);
  amp.gain.exponentialRampToValueAtTime(.66, now + .22);

  osc1.connect(g1); osc2.connect(g2); osc3.connect(g3);
  g1.connect(input); g2.connect(input); g3.connect(input);
  input.connect(highpass); highpass.connect(lowpass); lowpass.connect(body);
  body.connect(dry); body.connect(convolver); convolver.connect(wet);
  dry.connect(mix); wet.connect(mix); mix.connect(amp); amp.connect(melodyBus);
  [osc1, osc2, osc3].forEach((osc) => osc.start(now));

  const lead = {
    A, osc1, osc2, osc3, amp, filter: lowpass,
    stopped: false, midi: null, targetMidi: null,
    transitionUntil: 0, transitionFrom: null, transitionTimer: null
  };
  setLeadPitch(lead, midi, true);
  return lead;
};

function setExactFrequencyV4(param, value, now) {
  param.cancelScheduledValues(now);
  param.setValueAtTime(value, now);
}
function glideFrequencyV4(param, value, now, duration) {
  holdParam(param, now);
  param.exponentialRampToValueAtTime(Math.max(.001, value), now + duration);
}

setLeadPitch = function(lead, midiFloat, attack = false) {
  if (!lead || lead.stopped) return;
  const roundedMidi = Math.round(midiFloat);
  const now = lead.A.currentTime;
  const base = freq(roundedMidi);

  // Initial note: set the exact target immediately, never approach it from another pitch.
  if (attack || lead.targetMidi === null) {
    setExactFrequencyV4(lead.osc1.frequency, base, now);
    setExactFrequencyV4(lead.osc2.frequency, base * 2, now);
    setExactFrequencyV4(lead.osc3.frequency, base * 3, now);
    lead.midi = roundedMidi;
    lead.targetMidi = roundedMidi;
    lead.transitionUntil = 0;
    bendReadout.textContent = `NOTA ESATTA • ${midiName(roundedMidi)}`;
    $("noteDisplay").classList.remove("glide-v4");
    return;
  }

  // Same selected note: do nothing. This prevents microtonal drift and repeated rescheduling.
  if (roundedMidi === lead.targetMidi) return;

  // Fingers are still touching and the selected note changed: perform one short, continuous passage.
  const fromMidi = lead.targetMidi;
  const interval = Math.abs(roundedMidi - fromMidi);
  const duration = clamp(.060 + interval * .010, .070, .125);
  glideFrequencyV4(lead.osc1.frequency, base, now, duration);
  glideFrequencyV4(lead.osc2.frequency, base * 2, now, duration);
  glideFrequencyV4(lead.osc3.frequency, base * 3, now, duration);

  const cutoff = clamp(1650 + (roundedMidi - 48) * 22, 1650, 2550);
  lead.filter.frequency.cancelScheduledValues(now);
  lead.filter.frequency.setTargetAtTime(cutoff, now, .025);

  lead.transitionFrom = fromMidi;
  lead.targetMidi = roundedMidi;
  lead.midi = roundedMidi;
  lead.transitionUntil = performance.now() + duration * 1000;
  clearTimeout(lead.transitionTimer);
  bendReadout.textContent = `PASSAGGIO ${midiName(fromMidi)} → ${midiName(roundedMidi)}`;
  $("noteDisplay").classList.add("glide-v4");
  lead.transitionTimer = setTimeout(() => {
    if (state.lead === lead && state.pinch && lead.targetMidi === roundedMidi) {
      bendReadout.textContent = `NOTA ESATTA • ${midiName(roundedMidi)}`;
      $("noteDisplay").classList.remove("glide-v4");
      lead.transitionUntil = 0;
    }
  }, duration * 1000 + 18);
};

const stopLeadBeforeV4 = stopLead;
stopLead = function(immediate = false) {
  const lead = state.lead;
  if (lead?.transitionTimer) clearTimeout(lead.transitionTimer);
  $("noteDisplay").classList.remove("glide-v4");
  state.glideTransition = null;
  stopLeadBeforeV4(immediate);
};

// The base hand loop still manages pinch/open safety. Restore the correct transition readout after it runs.
const processHandBeforeV4 = processHand;
processHand = function(rawHand) {
  processHandBeforeV4(rawHand);
  const lead = state.lead;
  if (!state.pinch || !lead) {
    $("noteDisplay").classList.remove("glide-v4");
    return;
  }
  if (lead.transitionUntil > performance.now() && lead.transitionFrom !== null) {
    bendReadout.textContent = `PASSAGGIO ${midiName(lead.transitionFrom)} → ${midiName(lead.targetMidi)}`;
    $("noteDisplay").classList.add("glide-v4");
  } else {
    bendReadout.textContent = `NOTA ESATTA • ${midiName(lead.targetMidi)}`;
    $("noteDisplay").classList.remove("glide-v4");
  }
  bendMeter.firstElementChild.style.width = "0%";
};

// Remove all rotation/bend wording from the visible interface.
if (typeof v2SoundBadge !== "undefined") v2SoundBadge.textContent = "SILKY LEAD • NOTE ESATTE";
