// V7: sustained sample-based lead. No plucked-string attack.
const sampledLeadV7 = {
  player: null,
  preset: null,
  context: null,
  ready: false,
  scriptsPromise: null,
  decodePromise: null
};

const sampleStyleV7 = document.createElement("style");
sampleStyleV7.textContent = `
  .v7-sample-badge{position:absolute;z-index:10;right:8px;bottom:calc(env(safe-area-inset-bottom) + 54px);padding:7px 9px;border-radius:999px;border:1px solid rgba(178,220,255,.38);background:rgba(5,9,17,.84);font-size:8px;font-weight:950;letter-spacing:.08em;color:#d8efff;pointer-events:none;box-shadow:0 0 18px rgba(125,205,255,.14)}
`;
document.head.appendChild(sampleStyleV7);
const sampleBadgeV7 = document.createElement("div");
sampleBadgeV7.className = "v7-sample-badge";
sampleBadgeV7.textContent = "SAMPLED VOICE LEAD • V7";
$("app").appendChild(sampleBadgeV7);
if (typeof physicalBadgeV6 !== "undefined") physicalBadgeV6.style.display = "none";
if (typeof guitarBadgeV5 !== "undefined") guitarBadgeV5.style.display = "none";
if (typeof v2SoundBadge !== "undefined") v2SoundBadge.style.display = "none";

function loadExternalScriptV7(src, id) {
  const existing = document.getElementById(id);
  if (existing) {
    if (existing.dataset.loaded === "1") return Promise.resolve();
    return new Promise((resolve, reject) => {
      existing.addEventListener("load", resolve, { once: true });
      existing.addEventListener("error", reject, { once: true });
    });
  }
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.id = id;
    script.src = src;
    script.async = true;
    script.onload = () => { script.dataset.loaded = "1"; resolve(); };
    script.onerror = () => reject(new Error(`Impossibile caricare ${src}`));
    document.head.appendChild(script);
  });
}

sampledLeadV7.scriptsPromise = Promise.all([
  loadExternalScriptV7(
    "https://surikov.github.io/webaudiofont/npm/dist/WebAudioFontPlayer.js",
    "webaudiofont-player-v7"
  ),
  loadExternalScriptV7(
    "https://surikov.github.io/webaudiofontdata/sound/0850_FluidR3_GM_sf2_file.js",
    "webaudiofont-voice-v7"
  )
]).then(() => {
  sampledLeadV7.preset = window._tone_0850_FluidR3_GM_sf2_file;
  if (!window.WebAudioFontPlayer || !sampledLeadV7.preset) throw new Error("SoundFont non disponibile");
}).catch((error) => {
  console.warn("Campione V7 non disponibile", error);
  sampleBadgeV7.textContent = "SOFT LEAD FALLBACK • V7";
});

function ensureSampleReadyV7(A) {
  if (sampledLeadV7.ready && sampledLeadV7.context === A) return Promise.resolve(true);
  if (sampledLeadV7.decodePromise && sampledLeadV7.context === A) return sampledLeadV7.decodePromise;
  sampledLeadV7.context = A;
  sampledLeadV7.decodePromise = sampledLeadV7.scriptsPromise.then(() => new Promise((resolve) => {
    sampledLeadV7.player = new window.WebAudioFontPlayer();
    sampledLeadV7.player.loader.decodeAfterLoading(A, "_tone_0850_FluidR3_GM_sf2_file");
    sampledLeadV7.player.loader.waitLoad(() => {
      sampledLeadV7.ready = true;
      sampleBadgeV7.textContent = "SAMPLED VOICE LEAD • V7";
      resolve(true);
    });
  })).catch(() => false);
  return sampledLeadV7.decodePromise;
}

const resumeAudioBeforeV7 = resumeAudio;
resumeAudio = async function() {
  await resumeAudioBeforeV7();
  const { A } = initAudio();
  await ensureSampleReadyV7(A);
};

function roomImpulseV7(A) {
  const length = Math.floor(A.sampleRate * .72);
  const buffer = A.createBuffer(2, length, A.sampleRate);
  for (let channel = 0; channel < 2; channel++) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < length; i++) {
      const t = i / length;
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 4.2) * .22;
    }
  }
  return buffer;
}

function queueSampleV7(lead, startMidi, targetMidi, duration, attack) {
  if (!sampledLeadV7.ready || !sampledLeadV7.player || !sampledLeadV7.preset) return null;
  const now = lead.A.currentTime;
  const slides = targetMidi === startMidi ? [] : [{ when: duration, delta: targetMidi - startMidi }];
  return sampledLeadV7.player.queueWaveTable(
    lead.A,
    lead.input,
    sampledLeadV7.preset,
    now,
    startMidi,
    45,
    attack ? .52 : .48,
    slides
  );
}

function createFallbackVoiceV7(lead, midi) {
  const now = lead.A.currentTime;
  const osc1 = lead.A.createOscillator();
  const osc2 = lead.A.createOscillator();
  const g1 = lead.A.createGain();
  const g2 = lead.A.createGain();
  osc1.type = "sine";
  osc2.type = "triangle";
  g1.gain.value = .075;
  g2.gain.value = .026;
  osc1.connect(g1); osc2.connect(g2);
  g1.connect(lead.input); g2.connect(lead.input);
  osc1.start(now); osc2.start(now);
  lead.fallbackOscillators = [osc1, osc2];
  lead.fallbackGains = [g1, g2];
  setFallbackPitchV7(lead, midi, true);
}

function setFallbackPitchV7(lead, midi, exact) {
  if (!lead.fallbackOscillators) return;
  const now = lead.A.currentTime;
  const base = freq(midi);
  const targets = [base, base * 2];
  lead.fallbackOscillators.forEach((osc, index) => {
    osc.frequency.cancelScheduledValues(now);
    if (exact) osc.frequency.setValueAtTime(targets[index], now);
    else osc.frequency.setTargetAtTime(targets[index], now, .055);
  });
}

createLead = function(midi) {
  const { A, melodyBus } = initAudio();
  const now = A.currentTime;
  const input = A.createGain();
  const highpass = A.createBiquadFilter();
  const lowpass = A.createBiquadFilter();
  const warmth = A.createBiquadFilter();
  const dry = A.createGain();
  const delay = A.createDelay(.8);
  const delayFilter = A.createBiquadFilter();
  const feedback = A.createGain();
  const delayWet = A.createGain();
  const room = A.createConvolver();
  const roomWet = A.createGain();
  const mix = A.createGain();
  const amp = A.createGain();

  highpass.type = "highpass";
  highpass.frequency.value = 115;
  highpass.Q.value = .45;
  lowpass.type = "lowpass";
  lowpass.frequency.value = 2350;
  lowpass.Q.value = .58;
  warmth.type = "peaking";
  warmth.frequency.value = 730;
  warmth.Q.value = .78;
  warmth.gain.value = 1.8;

  dry.gain.value = .92;
  delay.delayTime.value = .285;
  delayFilter.type = "lowpass";
  delayFilter.frequency.value = 1850;
  feedback.gain.value = .11;
  delayWet.gain.value = .10;
  room.buffer = roomImpulseV7(A);
  roomWet.gain.value = .075;

  amp.gain.setValueAtTime(.0001, now);
  amp.gain.exponentialRampToValueAtTime(.72, now + .085);
  amp.gain.exponentialRampToValueAtTime(.64, now + .32);

  input.connect(highpass);
  highpass.connect(lowpass);
  lowpass.connect(warmth);
  warmth.connect(dry);
  dry.connect(mix);
  warmth.connect(delay);
  delay.connect(delayFilter);
  delayFilter.connect(delayWet);
  delayWet.connect(mix);
  delayFilter.connect(feedback);
  feedback.connect(delay);
  warmth.connect(room);
  room.connect(roomWet);
  roomWet.connect(mix);
  mix.connect(amp);
  amp.connect(melodyBus);

  const lead = {
    A, input, amp, filter: lowpass, stopped: false,
    envelope: null, targetMidi: null, midi: null,
    transitionUntil: 0, transitionFrom: null, transitionTimer: null,
    fallbackOscillators: null
  };

  if (sampledLeadV7.ready) lead.envelope = queueSampleV7(lead, midi, midi, 0, true);
  else createFallbackVoiceV7(lead, midi);
  lead.targetMidi = Math.round(midi);
  lead.midi = Math.round(midi);
  bendReadout.textContent = `NOTA ESATTA • ${midiName(lead.targetMidi)}`;
  return lead;
};

setLeadPitch = function(lead, midiFloat, attack = false) {
  if (!lead || lead.stopped) return;
  const targetMidi = Math.round(midiFloat);
  const now = lead.A.currentTime;

  if (attack || lead.targetMidi === null) {
    lead.targetMidi = targetMidi;
    lead.midi = targetMidi;
    if (lead.fallbackOscillators) setFallbackPitchV7(lead, targetMidi, true);
    bendReadout.textContent = `NOTA ESATTA • ${midiName(targetMidi)}`;
    return;
  }
  if (targetMidi === lead.targetMidi) return;

  const fromMidi = lead.targetMidi;
  const interval = Math.abs(targetMidi - fromMidi);
  const duration = clamp(.075 + interval * .012, .085, .145);

  if (sampledLeadV7.ready) {
    const previous = lead.envelope;
    lead.envelope = queueSampleV7(lead, fromMidi, targetMidi, duration, false);
    if (previous) {
      try { previous.cancel(); } catch {}
    }
  } else {
    setFallbackPitchV7(lead, targetMidi, false);
  }

  const cutoff = clamp(1850 + (targetMidi - 48) * 16, 1850, 2450);
  lead.filter.frequency.cancelScheduledValues(now);
  lead.filter.frequency.setTargetAtTime(cutoff, now, .035);

  lead.transitionFrom = fromMidi;
  lead.targetMidi = targetMidi;
  lead.midi = targetMidi;
  lead.transitionUntil = performance.now() + duration * 1000;
  clearTimeout(lead.transitionTimer);
  bendReadout.textContent = `PASSAGGIO ${midiName(fromMidi)} → ${midiName(targetMidi)}`;
  $("noteDisplay").classList.add("glide-v4");
  lead.transitionTimer = setTimeout(() => {
    if (state.lead === lead && state.pinch && lead.targetMidi === targetMidi) {
      bendReadout.textContent = `NOTA ESATTA • ${midiName(targetMidi)}`;
      $("noteDisplay").classList.remove("glide-v4");
      lead.transitionUntil = 0;
    }
  }, duration * 1000 + 24);
};

stopLead = function(immediate = false) {
  const lead = state.lead;
  state.lead = null;
  if (!lead || lead.stopped) return;
  lead.stopped = true;
  clearTimeout(lead.transitionTimer);
  $("noteDisplay").classList.remove("glide-v4");
  if (lead.envelope) {
    try { lead.envelope.cancel(Boolean(immediate)); } catch {}
  }
  const now = lead.A.currentTime;
  holdParam(lead.amp.gain, now);
  lead.amp.gain.setTargetAtTime(.0001, now, immediate ? .009 : .024);
  if (lead.fallbackOscillators) {
    lead.fallbackOscillators.forEach((osc) => {
      try { osc.stop(now + (immediate ? .07 : .15)); } catch {}
    });
  }
};

$("melodyVolume").value = "62";
$("melodyOut").textContent = "62%";
if (state.audio) state.audio.melodyBus.gain.value = .62;
if (typeof glideBadgeV4 !== "undefined") {
  glideBadgeV4.innerHTML = "ATTACCO MORBIDO E INTONATO<br>DITA UNITE + CAMBIO FASCIA = PASSAGGIO";
}
