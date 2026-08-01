// V6: physical-model plucked string. Clearly different from the previous oscillator lead.
const guitarBuffersV6 = new Map();
const guitarRoomsV6 = new Map();

const physicalStyleV6 = document.createElement("style");
physicalStyleV6.textContent = `
  .v6-physical-badge{position:absolute;z-index:9;right:8px;bottom:calc(env(safe-area-inset-bottom) + 54px);padding:7px 9px;border-radius:999px;border:1px solid rgba(255,214,138,.38);background:rgba(5,9,17,.82);font-size:8px;font-weight:950;letter-spacing:.08em;color:#ffe4a3;pointer-events:none;box-shadow:0 0 18px rgba(255,210,120,.12)}
`;
document.head.appendChild(physicalStyleV6);
const physicalBadgeV6 = document.createElement("div");
physicalBadgeV6.className = "v6-physical-badge";
physicalBadgeV6.textContent = "PHYSICAL STRING • V6";
$("app").appendChild(physicalBadgeV6);
if (typeof guitarBadgeV5 !== "undefined") guitarBadgeV5.style.display = "none";

function guitarRoomV6(A) {
  const key = A.sampleRate;
  if (guitarRoomsV6.has(key)) return guitarRoomsV6.get(key);
  const duration = 1.05;
  const length = Math.max(1, Math.floor(A.sampleRate * duration));
  const buffer = A.createBuffer(2, length, A.sampleRate);
  for (let channel = 0; channel < 2; channel++) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < length; i++) {
      const t = i / length;
      const early = i < A.sampleRate * .055 ? .7 : 1;
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 4.6) * .25 * early;
    }
  }
  guitarRoomsV6.set(key, buffer);
  return buffer;
}

function pluckedStringV6(A, midi) {
  const rounded = Math.round(midi);
  const key = `${A.sampleRate}:${rounded}`;
  if (guitarBuffersV6.has(key)) return guitarBuffersV6.get(key);

  const targetFrequency = freq(rounded);
  const period = Math.max(2, Math.round(A.sampleRate / targetFrequency));
  const actualFrequency = A.sampleRate / period;
  const duration = 5.2;
  const length = Math.max(period + 2, Math.floor(A.sampleRate * duration));
  const buffer = A.createBuffer(1, length, A.sampleRate);
  const data = buffer.getChannelData(0);

  const pickPosition = .23;
  const pickOffset = Math.max(1, Math.round(period * pickPosition));
  for (let i = 0; i < period; i++) {
    const envelope = Math.sin(Math.PI * (i + .5) / period);
    const noise = Math.random() * 2 - 1;
    const previous = i >= pickOffset ? data[i - pickOffset] : 0;
    data[i] = (noise - previous * .72) * envelope * .72;
  }

  const damping = rounded < 60 ? .99855 : rounded < 72 ? .99815 : .99765;
  const brightness = rounded < 60 ? .54 : .49;
  let previousOutput = data[period - 1] || 0;
  for (let i = period; i < length; i++) {
    const delayed = data[i - period];
    const delayedPrevious = data[i - period - 1] || delayed;
    const averaged = delayed * brightness + delayedPrevious * (1 - brightness);
    const smoothed = averaged * .82 + previousOutput * .18;
    data[i] = smoothed * damping;
    previousOutput = data[i];
  }

  const result = { buffer, playbackRate: targetFrequency / actualFrequency, rootMidi: rounded };
  guitarBuffersV6.set(key, result);
  return result;
}

function startPhysicalStringV6(lead, midi) {
  const now = lead.A.currentTime;
  const model = pluckedStringV6(lead.A, midi);
  const source = lead.A.createBufferSource();
  const sourceGain = lead.A.createGain();
  source.buffer = model.buffer;
  source.playbackRate.setValueAtTime(model.playbackRate, now);
  sourceGain.gain.setValueAtTime(.0001, now);
  sourceGain.gain.exponentialRampToValueAtTime(.72, now + .006);
  sourceGain.gain.exponentialRampToValueAtTime(.54, now + .11);
  source.connect(sourceGain);
  sourceGain.connect(lead.input);
  source.start(now);
  lead.stringSource = source;
  lead.stringGain = sourceGain;
  lead.stringRootMidi = model.rootMidi;
  lead.stringBaseRate = model.playbackRate;
  source.onended = () => {
    if (lead.stringSource === source) lead.stringSource = null;
  };
}

createLead = function(midi) {
  const { A, melodyBus } = initAudio();
  const now = A.currentTime;
  const input = A.createGain();
  const highpass = A.createBiquadFilter();
  const lowpass = A.createBiquadFilter();
  const body = A.createBiquadFilter();
  const presence = A.createBiquadFilter();
  const compressor = A.createDynamicsCompressor();
  const dry = A.createGain();
  const delay = A.createDelay(.8);
  const delayFilter = A.createBiquadFilter();
  const feedback = A.createGain();
  const delayWet = A.createGain();
  const room = A.createConvolver();
  const roomWet = A.createGain();
  const mix = A.createGain();
  const amp = A.createGain();

  const sustain = A.createOscillator();
  const sustainGain = A.createGain();
  sustain.type = "sine";
  sustainGain.gain.value = .009;

  highpass.type = "highpass";
  highpass.frequency.value = 78;
  highpass.Q.value = .55;
  lowpass.type = "lowpass";
  lowpass.frequency.value = 3450;
  lowpass.Q.value = .58;
  body.type = "peaking";
  body.frequency.value = 720;
  body.Q.value = .72;
  body.gain.value = 3.4;
  presence.type = "peaking";
  presence.frequency.value = 1850;
  presence.Q.value = 1.05;
  presence.gain.value = 1.6;

  compressor.threshold.value = -26;
  compressor.knee.value = 20;
  compressor.ratio.value = 4.2;
  compressor.attack.value = .004;
  compressor.release.value = .24;

  dry.gain.value = .86;
  delay.delayTime.value = .315;
  delayFilter.type = "lowpass";
  delayFilter.frequency.value = 1900;
  feedback.gain.value = .18;
  delayWet.gain.value = .16;
  room.buffer = guitarRoomV6(A);
  roomWet.gain.value = .11;

  amp.gain.setValueAtTime(.0001, now);
  amp.gain.exponentialRampToValueAtTime(.92, now + .008);
  amp.gain.exponentialRampToValueAtTime(.74, now + .20);

  sustain.connect(sustainGain);
  sustainGain.connect(input);
  input.connect(highpass);
  highpass.connect(lowpass);
  lowpass.connect(body);
  body.connect(presence);
  presence.connect(compressor);
  compressor.connect(dry);
  dry.connect(mix);
  compressor.connect(delay);
  delay.connect(delayFilter);
  delayFilter.connect(delayWet);
  delayWet.connect(mix);
  delayFilter.connect(feedback);
  feedback.connect(delay);
  compressor.connect(room);
  room.connect(roomWet);
  roomWet.connect(mix);
  mix.connect(amp);
  amp.connect(melodyBus);

  sustain.start(now);
  const lead = {
    A, input, sustain, sustainGain, amp, filter: lowpass,
    stringSource: null, stringGain: null, stringRootMidi: null, stringBaseRate: 1,
    stopped: false, midi: null, targetMidi: null,
    transitionUntil: 0, transitionFrom: null, transitionTimer: null
  };
  startPhysicalStringV6(lead, midi);
  setLeadPitch(lead, midi, true);
  return lead;
};

setLeadPitch = function(lead, midiFloat, attack = false) {
  if (!lead || lead.stopped) return;
  const roundedMidi = Math.round(midiFloat);
  const now = lead.A.currentTime;
  const exactFrequency = freq(roundedMidi);

  if (attack || lead.targetMidi === null) {
    lead.sustain.frequency.cancelScheduledValues(now);
    lead.sustain.frequency.setValueAtTime(exactFrequency, now);
    if (lead.stringSource) {
      const exactRate = lead.stringBaseRate * Math.pow(2, (roundedMidi - lead.stringRootMidi) / 12);
      lead.stringSource.playbackRate.cancelScheduledValues(now);
      lead.stringSource.playbackRate.setValueAtTime(exactRate, now);
    }
    lead.midi = roundedMidi;
    lead.targetMidi = roundedMidi;
    lead.transitionUntil = 0;
    bendReadout.textContent = `NOTA ESATTA • ${midiName(roundedMidi)}`;
    $("noteDisplay").classList.remove("glide-v4");
    return;
  }

  if (roundedMidi === lead.targetMidi) return;

  const fromMidi = lead.targetMidi;
  const interval = Math.abs(roundedMidi - fromMidi);
  const duration = clamp(.075 + interval * .012, .085, .145);

  holdParam(lead.sustain.frequency, now);
  lead.sustain.frequency.exponentialRampToValueAtTime(exactFrequency, now + duration);
  if (lead.stringSource) {
    const targetRate = lead.stringBaseRate * Math.pow(2, (roundedMidi - lead.stringRootMidi) / 12);
    holdParam(lead.stringSource.playbackRate, now);
    lead.stringSource.playbackRate.exponentialRampToValueAtTime(Math.max(.01, targetRate), now + duration);
  }

  const cutoff = clamp(2750 + (roundedMidi - 55) * 28, 2550, 4100);
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

const stopLeadBeforeV6 = stopLead;
stopLead = function(immediate = false) {
  const lead = state.lead;
  if (!lead || lead.stopped) {
    stopLeadBeforeV6(immediate);
    return;
  }
  state.lead = null;
  lead.stopped = true;
  if (lead.transitionTimer) clearTimeout(lead.transitionTimer);
  const now = lead.A.currentTime;
  holdParam(lead.amp.gain, now);
  lead.amp.gain.setTargetAtTime(.0001, now, immediate ? .008 : .020);
  const stopAt = now + (immediate ? .07 : .16);
  try { lead.stringSource?.stop(stopAt); } catch {}
  try { lead.sustain.stop(stopAt); } catch {}
  $("noteDisplay").classList.remove("glide-v4");
};

$("melodyVolume").value = "66";
$("melodyOut").textContent = "66%";
if (state.audio) state.audio.melodyBus.gain.value = .66;
if (typeof glideBadgeV4 !== "undefined") {
  glideBadgeV4.innerHTML = "CORDA FISICA • ATTACCO ESATTO<br>DITA UNITE + CAMBIO FASCIA = GLIDE";
}
