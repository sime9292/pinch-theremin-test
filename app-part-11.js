// Clean melodic lead: remove sawtooth buzz and distortion, keep expressive bend.
const cleanLeadV11={label:"LEAD MORBIDO • CLEAN"};

const cleanLeadStyleV11=document.createElement("style");
cleanLeadStyleV11.textContent=`
  .clean-lead-v11{position:absolute;z-index:7;right:10px;bottom:calc(env(safe-area-inset-bottom) + 52px);padding:6px 9px;border-radius:999px;border:1px solid rgba(169,243,255,.28);background:rgba(4,10,18,.60);backdrop-filter:blur(9px);font-size:8px;font-weight:900;letter-spacing:.10em;color:#bdefff;pointer-events:none}
`;
document.head.appendChild(cleanLeadStyleV11);
const cleanLeadBadgeV11=document.createElement("div");
cleanLeadBadgeV11.className="clean-lead-v11";
cleanLeadBadgeV11.textContent=cleanLeadV11.label;
$("app").appendChild(cleanLeadBadgeV11);

function createCleanLeadV11(midi){
  const {A,melodyBus}=initAudio(),now=A.currentTime;
  const input=A.createGain();
  const lowpass=A.createBiquadFilter();
  const body=A.createBiquadFilter();
  const highpass=A.createBiquadFilter();
  const amp=A.createGain();

  const oscA=A.createOscillator();
  const oscB=A.createOscillator();
  const oscC=A.createOscillator();
  const gainA=A.createGain();
  const gainB=A.createGain();
  const gainC=A.createGain();

  // Warm fundamental, soft width and just a hint of upper harmonic.
  oscA.type="triangle";
  oscB.type="sine";
  oscC.type="sine";
  gainA.gain.value=.115;
  gainB.gain.value=.050;
  gainC.gain.value=.018;

  lowpass.type="lowpass";
  lowpass.frequency.value=1380;
  lowpass.Q.value=.62;
  body.type="peaking";
  body.frequency.value=520;
  body.Q.value=.72;
  body.gain.value=1.7;
  highpass.type="highpass";
  highpass.frequency.value=92;
  highpass.Q.value=.55;

  amp.gain.setValueAtTime(.0001,now);
  amp.gain.exponentialRampToValueAtTime(.78,now+.048);
  amp.gain.exponentialRampToValueAtTime(.62,now+.24);

  oscA.connect(gainA);oscB.connect(gainB);oscC.connect(gainC);
  gainA.connect(input);gainB.connect(input);gainC.connect(input);
  input.connect(highpass);highpass.connect(lowpass);lowpass.connect(body);body.connect(amp);amp.connect(melodyBus);

  [oscA,oscB,oscC].forEach(o=>o.start(now));
  const engine={A,oscA,oscB,oscC,amp,filter:lowpass,body,stopped:false,midi:null};
  setCleanPitchV11(engine,midi,true);
  return engine;
}

function setCleanPitchV11(engine,midiFloat,attack=false){
  if(!engine||engine.stopped)return;
  const now=engine.A.currentTime,f=freq(midiFloat),glide=attack?.005:.010;
  const targets=[
    [engine.oscA,f,0],
    [engine.oscB,f,-4],
    [engine.oscC,f*2,3]
  ];
  targets.forEach(([osc,target,detune])=>{
    osc.frequency.cancelScheduledValues(now);
    osc.frequency.setTargetAtTime(target,now,glide);
    osc.detune.cancelScheduledValues(now);
    osc.detune.setTargetAtTime(detune,now,.018);
  });
  const cutoff=clamp(1180+(midiFloat-48)*18,1180,1880);
  engine.filter.frequency.cancelScheduledValues(now);
  engine.filter.frequency.setTargetAtTime(cutoff,now,.035);
  engine.midi=midiFloat;
}

createLeadEngineV7=function(midi){return createCleanLeadV11(midi)};
setLeadPitchV7=function(engine,midi,attack=false){setCleanPitchV11(engine,midi,attack)};
setContinuousPitchV10=function(engine,midiFloat,attack=false){setCleanPitchV11(engine,midiFloat,attack)};

releaseLeadV7=function(fast=false){
  if(!leadEngineV7||leadEngineV7.stopped)return;
  const engine=leadEngineV7,now=engine.A.currentTime;
  engine.stopped=true;
  engine.amp.gain.cancelScheduledValues(now);
  engine.amp.gain.setTargetAtTime(.0001,now,fast?.035:.095);
  [engine.oscA,engine.oscB,engine.oscC].forEach(o=>{try{o.stop(now+(fast?.20:.62))}catch{}});
  leadEngineV7=null;
};

// Piano/note-lane preview uses the same clean timbre without noise or saturation.
playMelody=function(midi){
  const {A,melodyBus}=initAudio();resumeAudio();const now=A.currentTime;
  const input=A.createGain(),highpass=A.createBiquadFilter(),lowpass=A.createBiquadFilter(),amp=A.createGain();
  highpass.type="highpass";highpass.frequency.value=92;
  lowpass.type="lowpass";lowpass.frequency.setValueAtTime(1500,now);lowpass.frequency.exponentialRampToValueAtTime(1120,now+.70);lowpass.Q.value=.58;
  amp.gain.setValueAtTime(.0001,now);amp.gain.exponentialRampToValueAtTime(.52,now+.045);amp.gain.exponentialRampToValueAtTime(.34,now+.25);amp.gain.exponentialRampToValueAtTime(.0001,now+1.25);
  input.connect(highpass);highpass.connect(lowpass);lowpass.connect(amp);amp.connect(melodyBus);
  [["triangle",freq(midi),0,.115],["sine",freq(midi),-4,.05],["sine",freq(midi)*2,3,.018]].forEach(([type,hz,det,gain])=>{
    const o=A.createOscillator(),g=A.createGain();o.type=type;o.frequency.value=hz;o.detune.value=det;g.gain.value=gain;o.connect(g);g.connect(input);o.start(now);o.stop(now+1.32);
  });
  const n=$("noteDisplay");n.classList.add("hit");setTimeout(()=>n.classList.remove("hit"),140);
};

// Keep overall melody level conservative on phone speakers.
try{
  const audio=state.audio;
  if(audio?.melodyBus)audio.melodyBus.gain.value=Math.min(audio.melodyBus.gain.value,.52);
  $("melodyVolume").value="52";
  $("melodyOut").textContent="52%";
}catch{}
