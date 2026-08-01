// V5: original 70s ambient progressive guitar lead, while keeping V4 exact-pitch behavior.
const guitarStyleV5 = document.createElement("style");
guitarStyleV5.textContent = `
  .v5-guitar-badge{position:absolute;z-index:8;right:8px;bottom:calc(env(safe-area-inset-bottom) + 54px);padding:6px 9px;border-radius:999px;border:1px solid rgba(255,220,150,.30);background:rgba(5,9,17,.72);font-size:8px;font-weight:900;letter-spacing:.08em;color:#ffe0a1;pointer-events:none}
`;
document.head.appendChild(guitarStyleV5);

const guitarBadgeV5 = document.createElement("div");
guitarBadgeV5.className = "v5-guitar-badge";
guitarBadgeV5.textContent = "70s AMBIENT GUITAR";
$("app").appendChild(guitarBadgeV5);
if (typeof v2SoundBadge !== "undefined") v2SoundBadge.style.display = "none";

function guitarWaveV5(A) {
  const real = new Float32Array([0, 1, .40, .19, .105, .062, .038, .024, .015, .009]);
  const imag = new Float32Array(real.length);
  return A.createPeriodicWave(real, imag, { disableNormalization: false });
}

function guitarRoomV5(A) {
  const duration = .82;
  const length = Math.max(1, Math.floor(A.sampleRate * duration));
  const buffer = A.createBuffer(2, length, A.sampleRate);
  for (let channel = 0; channel < 2; channel++) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < length; i++) {
      const t = i / length;
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 4.1) * .34;
    }
  }
  return buffer;
}

function pickNoiseV5(A, destination, now) {
  const length = Math.max(1, Math.floor(A.sampleRate * .055));
  const buffer = A.createBuffer(1, length, A.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) {
    const env = Math.pow(1 - i / length, 3.2);
    data[i] = (Math.random() * 2 - 1) * env;
  }
  const source = A.createBufferSource();
  const band = A.createBiquadFilter();
  const gain = A.createGain();
  source.buffer = buffer;
  band.type = "bandpass";
  band.frequency.value = 2350;
  band.Q.value = .72;
  gain.gain.setValueAtTime(.028, now);
  gain.gain.exponentialRampToValueAtTime(.0001, now + .052);
  source.connect(band);
  band.connect(gain);
  gain.connect(destination);
  source.start(now);
  source.stop(now + .06);
}

createLead = function(midi) {
  const { A, melodyBus } = initAudio();
  const now = A.currentTime;

  const input = A.createGain();
  const compressor = A.createDynamicsCompressor();
  const highpass = A.createBiquadFilter();
  const lowpass = A.createBiquadFilter();
  const body = A.createBiquadFilter();
  const presence = A.createBiquadFilter();
  const dry = A.createGain();
  const delay = A.createDelay(.8);
  const delayFilter = A.createBiquadFilter();
  const delayFeedback = A.createGain();
  const delayWet = A.createGain();
  const room = A.createConvolver();
  const roomWet = A.createGain();
  const mix = A.createGain();
  const amp = A.createGain();

  const osc1 = A.createOscillator();
  const osc2 = A.createOscillator();
  const osc3 = A.createOscillator();
  const g1 = A.createGain();
  const g2 = A.createGain();
  const g3 = A.createGain();

  osc1.setPeriodicWave(guitarWaveV5(A));
  osc2.type = "sine";
  osc3.type = "sine";
  g1.gain.value = .090;
  g2.gain.value = .015;
  g3.gain.value = .0045;

  compressor.threshold.value = -30;
  compressor.knee.value = 18;
  compressor.ratio.value = 5.2;
  compressor.attack.value = .003;
  compressor.release.value = .19;

  highpass.type = "highpass";
  highpass.frequency.value = 82;
  highpass.Q.value = .52;
  lowpass.type = "lowpass";
  lowpass.frequency.value = 2650;
  lowpass.Q.value = .52;
  body.type = "peaking";
  body.frequency.value = 690;
  body.Q.value = .78;
  body.gain.value = 2.8;
  presence.type = "peaking";
  presence.frequency.value = 1550;
  presence.Q.value = .90;
  presence.gain.value = 1.2;

  dry.gain.value = .90;
  delay.delayTime.value = .335;
  delayFilter.type = "lowpass";
  delayFilter.frequency.value = 2100;
  delayFeedback.gain.value = .14;
  delayWet.gain.value = .13;
  room.buffer = guitarRoomV5(A);
  roomWet.gain.value = .075;

  amp.gain.setValueAtTime(.0001, now);
  amp.gain.exponentialRampToValueAtTime(.96, now + .010);
  amp.gain.exponentialRampToValueAtTime(.70, now + .145);
  amp.gain.exponentialRampToValueAtTime(.64, now + .42);

  osc1.connect(g1);
  osc2.connect(g2);
  osc3.connect(g3);
  g1.connect(input);
  g2.connect(input);
  g3.connect(input);
  input.connect(compressor);
  compressor.connect(highpass);
  highpass.connect(lowpass);
  lowpass.connect(body);
  body.connect(presence);

  presence.connect(dry);
  dry.connect(mix);
  presence.connect(delay);
  delay.connect(delayFilter);
  delayFilter.connect(delayWet);
  delayWet.connect(mix);
  delayFilter.connect(delayFeedback);
  delayFeedback.connect(delay);
  presence.connect(room);
  room.connect(roomWet);
  roomWet.connect(mix);
  mix.connect(amp);
  amp.connect(melodyBus);

  pickNoiseV5(A, compressor, now);
  [osc1, osc2, osc3].forEach((osc) => osc.start(now));

  const lead = {
    A, osc1, osc2, osc3, amp, filter: lowpass,
    stopped: false, midi: null, targetMidi: null,
    transitionUntil: 0, transitionFrom: null, transitionTimer: null
  };

  // V4 setLeadPitch sets the initial note immediately and glides only after a real note change.
  setLeadPitch(lead, midi, true);
  return lead;
};

// Keep level conservative on phone speakers while preserving sustain.
$("melodyVolume").value = "58";
$("melodyOut").textContent = "58%";
if (state.audio) state.audio.melodyBus.gain.value = .58;

if (typeof glideBadgeV4 !== "undefined") {
  glideBadgeV4.innerHTML = "ATTACCO ESATTO<br>DITA UNITE + CAMBIO FASCIA = GLIDE DA CHITARRA";
}
