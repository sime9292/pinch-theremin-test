// Stability upgrade and expressive soft synth lead.
const stableTrackV7={
  smoothHand:null,lastCenter:null,lastSeenAt:0,lostAt:0,
  ySamples:[],pinchSamples:[],candidateIndex:-1,candidateFrames:0,
  closeFrames:0,openFrames:0,lastStableMidi:null
};
let leadEngineV7=null;

const stabilityStyleV7=document.createElement("style");
stabilityStyleV7.textContent=`
  .hand-state.seen{box-shadow:0 0 18px rgba(141,255,194,.13)}
  .hand-state.locked{color:#b9ffdc;border-color:rgba(141,255,194,.62);box-shadow:0 0 24px rgba(141,255,194,.22)}
  .note-zone.active{border-color:rgba(142,242,255,.55)}
`;
document.head.appendChild(stabilityStyleV7);

function medianV7(values){
  if(!values.length)return 0;
  const a=[...values].sort((x,y)=>x-y),m=Math.floor(a.length/2);
  return a.length%2?a[m]:(a[m-1]+a[m])/2;
}
function handCenterV7(hand){
  const ids=[0,5,9,13,17];
  return ids.reduce((p,i)=>({x:p.x+hand[i].x/ids.length,y:p.y+hand[i].y/ids.length}),{x:0,y:0});
}
function smoothHandV7(hand){
  if(!stableTrackV7.smoothHand){
    stableTrackV7.smoothHand=hand.map(p=>({x:p.x,y:p.y,z:p.z||0}));
    return stableTrackV7.smoothHand;
  }
  stableTrackV7.smoothHand=hand.map((p,i)=>{
    const old=stableTrackV7.smoothHand[i]||p;
    const movement=Math.hypot(p.x-old.x,p.y-old.y,(p.z||0)-(old.z||0));
    const alpha=clamp(.20+movement*5.5,.20,.60);
    return{x:old.x+(p.x-old.x)*alpha,y:old.y+(p.y-old.y)*alpha,z:(old.z||0)+((p.z||0)-(old.z||0))*alpha};
  });
  return stableTrackV7.smoothHand;
}
function resetStableTrackV7(){
  stableTrackV7.smoothHand=null;stableTrackV7.lastCenter=null;stableTrackV7.ySamples.length=0;
  stableTrackV7.pinchSamples.length=0;stableTrackV7.candidateIndex=-1;stableTrackV7.candidateFrames=0;
  stableTrackV7.closeFrames=0;stableTrackV7.openFrames=0;stableTrackV7.lastStableMidi=null;
}

chooseRightHand=function(result){
  const hands=result?.landmarks||[];
  if(!hands.length)return null;
  if(hands.length===1)return hands[0];

  // Once a hand is acquired, keep the nearest hand to prevent left/right swapping.
  if(stableTrackV7.lastCenter){
    return hands.reduce((best,hand)=>{
      const c=handCenterV7(hand),d=Math.hypot(c.x-stableTrackV7.lastCenter.x,c.y-stableTrackV7.lastCenter.y);
      return !best||d<best.d?{hand,d}:best;
    },null).hand;
  }

  // Initial acquisition: prefer the requested handedness, then the hand away from the chord rail.
  const wanted=$("handInvertToggle").checked?"left":"right";
  for(let i=0;i<hands.length;i++){
    const raw=extractCategory(result,i).toLowerCase();
    if(raw&&raw.includes(wanted))return hands[i];
  }
  const mirrored=$("mirrorToggle").checked;
  return hands.slice().sort((a,b)=>{
    const ax=mirrored?1-a[9].x:a[9].x,bx=mirrored?1-b[9].x:b[9].x;
    return bx-ax;
  })[0];
};

function stableNoteIndexV7(y){
  const notes=currentScale(),usable=clamp((y-.08)/.84,0,1),continuous=(1-usable)*(notes.length-1);
  let proposed=Math.round(continuous);
  if(state.currentNoteIndex>=0&&Math.abs(continuous-state.currentNoteIndex)<.64)proposed=state.currentNoteIndex;
  if(proposed!==stableTrackV7.candidateIndex){stableTrackV7.candidateIndex=proposed;stableTrackV7.candidateFrames=1}
  else stableTrackV7.candidateFrames++;
  if(state.currentNoteIndex<0||stableTrackV7.candidateFrames>=2)return proposed;
  return state.currentNoteIndex;
}

function makeLeadCurveV7(){
  const curve=new Float32Array(1024);
  for(let i=0;i<curve.length;i++){
    const x=i*2/(curve.length-1)-1;
    curve[i]=Math.tanh(1.35*x)/Math.tanh(1.35);
  }
  return curve;
}
const leadCurveV7=makeLeadCurveV7();

function createLeadEngineV7(midi){
  const {A,melodyBus}=initAudio(),now=A.currentTime;
  const input=A.createGain(),filter=A.createBiquadFilter(),body=A.createBiquadFilter(),drive=A.createWaveShaper(),amp=A.createGain();
  const oscA=A.createOscillator(),oscB=A.createOscillator(),oscC=A.createOscillator();
  const gainA=A.createGain(),gainB=A.createGain(),gainC=A.createGain();
  const vibrato=A.createOscillator(),vibratoDepth=A.createGain();

  oscA.type="triangle";oscB.type="sine";oscC.type="sawtooth";
  gainA.gain.value=.70;gainB.gain.value=.19;gainC.gain.value=.075;
  filter.type="lowpass";filter.Q.value=1.25;filter.frequency.value=1750;
  body.type="peaking";body.frequency.value=720;body.Q.value=.75;body.gain.value=2.2;
  drive.curve=leadCurveV7;drive.oversample="2x";
  amp.gain.setValueAtTime(.0001,now);
  vibrato.type="sine";vibrato.frequency.value=5.15;vibratoDepth.gain.value=3.2;
  vibrato.connect(vibratoDepth);[oscA,oscB,oscC].forEach(o=>vibratoDepth.connect(o.detune));
  oscA.connect(gainA);oscB.connect(gainB);oscC.connect(gainC);
  gainA.connect(input);gainB.connect(input);gainC.connect(input);
  input.connect(filter);filter.connect(body);body.connect(drive);drive.connect(amp);amp.connect(melodyBus);
  [oscA,oscB,oscC,vibrato].forEach(o=>o.start(now));
  const engine={A,oscA,oscB,oscC,vibrato,amp,filter,stopped:false,midi:null};
  setLeadPitchV7(engine,midi,true);
  return engine;
}
function setLeadPitchV7(engine,midi,attack=false){
  const now=engine.A.currentTime,f=freq(midi),glide=attack?.018:.042;
  [[engine.oscA,f],[engine.oscB,f*2],[engine.oscC,f]].forEach(([osc,target])=>{
    osc.frequency.cancelScheduledValues(now);osc.frequency.setTargetAtTime(target,now,glide);
  });
  engine.oscB.detune.setTargetAtTime(-5,now,.04);engine.oscC.detune.setTargetAtTime(6,now,.04);
  const brightness=clamp(1450+(midi-48)*22,1450,2450);
  engine.filter.frequency.cancelScheduledValues(now);
  engine.filter.frequency.setValueAtTime(Math.max(900,engine.filter.frequency.value),now);
  engine.filter.frequency.exponentialRampToValueAtTime(brightness*1.28,now+.045);
  engine.filter.frequency.exponentialRampToValueAtTime(brightness,now+.34);
  engine.amp.gain.cancelScheduledValues(now);
  if(attack){
    engine.amp.gain.setValueAtTime(.0001,now);
    engine.amp.gain.exponentialRampToValueAtTime(.235,now+.065);
    engine.amp.gain.exponentialRampToValueAtTime(.175,now+.30);
  }else{
    const current=Math.max(.08,engine.amp.gain.value||.17);
    engine.amp.gain.setValueAtTime(current,now);
    engine.amp.gain.linearRampToValueAtTime(.125,now+.018);
    engine.amp.gain.exponentialRampToValueAtTime(.205,now+.075);
    engine.amp.gain.exponentialRampToValueAtTime(.172,now+.26);
  }
  engine.midi=midi;
}
function leadNoteV7(midi,retrigger=false){
  resumeAudio();
  if(!leadEngineV7||leadEngineV7.stopped||leadEngineV7.A!==state.audio?.A)leadEngineV7=createLeadEngineV7(midi);
  else setLeadPitchV7(leadEngineV7,midi,retrigger);
}
function releaseLeadV7(fast=false){
  if(!leadEngineV7||leadEngineV7.stopped)return;
  const engine=leadEngineV7,now=engine.A.currentTime;engine.stopped=true;
  engine.amp.gain.cancelScheduledValues(now);engine.amp.gain.setTargetAtTime(.0001,now,fast?.045:.12);
  [engine.oscA,engine.oscB,engine.oscC,engine.vibrato].forEach(o=>{try{o.stop(now+(fast?.25:.75))}catch{}});
  leadEngineV7=null;
}

// Touch preview uses the same warm lead character, but as a self-contained note.
playMelody=function(midi){
  const {A,melodyBus}=initAudio();resumeAudio();const now=A.currentTime;
  const filter=A.createBiquadFilter(),drive=A.createWaveShaper(),amp=A.createGain();
  const specs=[["triangle",freq(midi),0,.17],["sine",freq(midi)*2,-5,.045],["sawtooth",freq(midi),6,.018]];
  filter.type="lowpass";filter.Q.value=1.2;filter.frequency.setValueAtTime(2450,now);filter.frequency.exponentialRampToValueAtTime(1550,now+.42);
  drive.curve=leadCurveV7;drive.oversample="2x";
  amp.gain.setValueAtTime(.0001,now);amp.gain.exponentialRampToValueAtTime(.24,now+.055);amp.gain.exponentialRampToValueAtTime(.15,now+.30);amp.gain.exponentialRampToValueAtTime(.0001,now+1.35);
  filter.connect(drive);drive.connect(amp);amp.connect(melodyBus);
  specs.forEach(([type,hz,det,gain])=>{const o=A.createOscillator(),g=A.createGain();o.type=type;o.frequency.value=hz;o.detune.value=det;g.gain.value=gain;o.connect(g);g.connect(filter);o.start(now);o.stop(now+1.42)});
  const n=$("noteDisplay");n.classList.add("hit");setTimeout(()=>n.classList.remove("hit"),180);
  if(navigator.vibrate)navigator.vibrate(7);
};

processHand=function(rawHand){
  const now=performance.now();
  if(!rawHand){
    if(stableTrackV7.lastSeenAt&&now-stableTrackV7.lastSeenAt<320){
      handState.textContent="AGGANCIO MANO…";handState.classList.add("seen");handState.classList.remove("locked");
      if(now-stableTrackV7.lastSeenAt>190&&state.pinch){state.pinch=false;releaseLeadV7(true)}
      return;
    }
    state.rightHand=null;state.pinch=false;state.currentNoteIndex=-1;state.lastPlayedMidi=null;
    $("noteName").textContent="—";handState.textContent="MANO NON VISTA";handState.classList.remove("seen","locked");
    releaseLeadV7(true);resetStableTrackV7();updateNoteGuide();return;
  }

  stableTrackV7.lastSeenAt=now;
  const hand=smoothHandV7(rawHand);state.rightHand=hand;stableTrackV7.lastCenter=handCenterV7(hand);
  const thumb=hand[4],index=hand[8],wrist=hand[0],middle=hand[9];
  const palm=Math.max(.025,dist(wrist,middle)),rawRatio=dist(thumb,index)/palm;
  stableTrackV7.pinchSamples.push(rawRatio);if(stableTrackV7.pinchSamples.length>5)stableTrackV7.pinchSamples.shift();
  const ratio=medianV7(stableTrackV7.pinchSamples),sens=Number($("pinchSensitivity").value)/100;
  const close=.40*sens,open=.58*sens,was=state.pinch;

  if(!state.pinch){stableTrackV7.closeFrames=ratio<close?stableTrackV7.closeFrames+1:0;if(stableTrackV7.closeFrames>=2){state.pinch=true;stableTrackV7.closeFrames=0}}
  else{stableTrackV7.openFrames=ratio>open?stableTrackV7.openFrames+1:0;if(stableTrackV7.openFrames>=2){state.pinch=false;stableTrackV7.openFrames=0}}

  const rawY=(thumb.y+index.y)/2;
  stableTrackV7.ySamples.push(rawY);if(stableTrackV7.ySamples.length>5)stableTrackV7.ySamples.shift();
  const medianY=medianV7(stableTrackV7.ySamples);
  state.smoothHandY=state.smoothHandY*.76+medianY*.24;
  const idx=stableNoteIndexV7(state.smoothHandY),notes=currentScale(),midi=notes[idx],changed=idx!==state.currentNoteIndex;
  state.currentNoteIndex=idx;$("noteName").textContent=midiName(midi);updateNoteGuide();

  handState.textContent=state.pinch?"MANO STABILE • SUONO ATTIVO":"MANO STABILE • UNISCI POLLICE E INDICE";
  handState.classList.add("seen","locked");

  if(state.pinch&&(!was||changed)){
    leadNoteV7(midi,!was);stableTrackV7.lastStableMidi=midi;
    const display=$("noteDisplay");display.classList.add("hit");setTimeout(()=>display.classList.remove("hit"),150);
    if(navigator.vibrate&&!was)navigator.vibrate(7);
  }else if(!state.pinch&&was){releaseLeadV7();stableTrackV7.lastStableMidi=null}
};

loadTracker=async function(){
  if(state.tracker)return state.tracker;
  setStatus("Caricamento rilevamento mani stabile…");
  const vision=await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm");
  const options={baseOptions:{modelAssetPath:"https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",delegate:"GPU"},runningMode:"VIDEO",numHands:2,minHandDetectionConfidence:.36,minHandPresenceConfidence:.34,minTrackingConfidence:.42};
  try{state.tracker=await HandLandmarker.createFromOptions(vision,options)}catch(error){console.warn("GPU non disponibile, uso CPU",error);options.baseOptions.delegate="CPU";state.tracker=await HandLandmarker.createFromOptions(vision,options)}
  return state.tracker;
};

loop=async function(now){
  if(!state.started)return;
  if(video.readyState>=2&&state.tracker&&video.currentTime!==state.lastVideoTime&&now-state.lastDetect>30&&!state.processing){
    state.processing=true;state.lastDetect=now;state.lastVideoTime=video.currentTime;
    try{const result=state.tracker.detectForVideo(video,now);processHand(chooseRightHand(result))}
    catch(error){console.warn("Tracking frame",error)}finally{state.processing=false}
  }
  drawOverlay();requestAnimationFrame(loop);
};

const originalStopAllV7=stopAll;
stopAll=function(){releaseLeadV7(true);resetStableTrackV7();return originalStopAllV7()};
