// Low-latency tracking and faster melodic transitions.
const lowLatencyV8={filteredY:null,lastRawY:null,lastTime:0,velocity:0,noteSpeed:0};

const latencyStyleV8=document.createElement("style");
latencyStyleV8.textContent=`
  .hand-state.fast{color:#bfeeff;border-color:rgba(126,232,255,.62);box-shadow:0 0 22px rgba(126,232,255,.18)}
`;
document.head.appendChild(latencyStyleV8);

function resetLowLatencyV8(){
  lowLatencyV8.filteredY=null;lowLatencyV8.lastRawY=null;lowLatencyV8.lastTime=0;
  lowLatencyV8.velocity=0;lowLatencyV8.noteSpeed=0;
}

const previousResetV8=resetStableTrackV7;
resetStableTrackV7=function(){previousResetV8();resetLowLatencyV8()};

// Adaptive smoothing: stable when the hand is still, responsive when it moves quickly.
smoothHandV7=function(hand){
  if(!stableTrackV7.smoothHand){
    stableTrackV7.smoothHand=hand.map(p=>({x:p.x,y:p.y,z:p.z||0}));
    return stableTrackV7.smoothHand;
  }
  stableTrackV7.smoothHand=hand.map((p,i)=>{
    const old=stableTrackV7.smoothHand[i]||p;
    const movement=Math.hypot(p.x-old.x,p.y-old.y,(p.z||0)-(old.z||0));
    const alpha=clamp(.30+movement*7.5,.30,.82);
    return{x:old.x+(p.x-old.x)*alpha,y:old.y+(p.y-old.y)*alpha,z:(old.z||0)+((p.z||0)-(old.z||0))*alpha};
  });
  return stableTrackV7.smoothHand;
};

function predictiveYV8(rawY,now){
  if(lowLatencyV8.filteredY===null){
    lowLatencyV8.filteredY=rawY;lowLatencyV8.lastRawY=rawY;lowLatencyV8.lastTime=now;return rawY;
  }
  const dt=clamp((now-lowLatencyV8.lastTime)/1000,1/120,1/18);
  const rawVelocity=(rawY-lowLatencyV8.lastRawY)/dt;
  lowLatencyV8.velocity=lowLatencyV8.velocity*.58+rawVelocity*.42;
  const speed=Math.abs(lowLatencyV8.velocity);
  const alpha=clamp(.34+speed*.85,.34,.86);
  lowLatencyV8.filteredY+=alpha*(rawY-lowLatencyV8.filteredY);
  const predictionSeconds=clamp(.016+speed*.010,.016,.032);
  const predicted=lowLatencyV8.filteredY+lowLatencyV8.velocity*predictionSeconds;
  lowLatencyV8.lastRawY=rawY;lowLatencyV8.lastTime=now;
  return clamp(predicted,0,1);
}

function lowLatencyIndexV8(y){
  const notes=currentScale(),usable=clamp((y-.08)/.84,0,1);
  const continuous=(1-usable)*(notes.length-1);
  const current=state.currentNoteIndex;
  if(current<0)return Math.round(continuous);
  const indexVelocity=Math.abs(lowLatencyV8.velocity)*(notes.length-1)/.84;
  lowLatencyV8.noteSpeed=lowLatencyV8.noteSpeed*.65+indexVelocity*.35;
  const margin=clamp(.17-lowLatencyV8.noteSpeed*.055,.025,.17);
  if(continuous>current+.5+margin||continuous<current-.5-margin)return Math.round(continuous);
  return current;
}

// Short portamento without the volume dip that made note changes feel late.
setLeadPitchV7=function(engine,midi,attack=false){
  const now=engine.A.currentTime,f=freq(midi),glide=attack?.006:.010;
  [[engine.oscA,f],[engine.oscB,f*2],[engine.oscC,f]].forEach(([osc,target])=>{
    osc.frequency.cancelScheduledValues(now);osc.frequency.setTargetAtTime(target,now,glide);
  });
  engine.oscB.detune.setTargetAtTime(-5,now,.02);engine.oscC.detune.setTargetAtTime(6,now,.02);
  const brightness=clamp(1500+(midi-48)*23,1500,2550);
  engine.filter.frequency.cancelScheduledValues(now);
  engine.filter.frequency.setTargetAtTime(brightness*1.12,now,.012);
  engine.filter.frequency.setTargetAtTime(brightness,now+.055,.09);
  engine.amp.gain.cancelScheduledValues(now);
  if(attack){
    engine.amp.gain.setValueAtTime(.0001,now);
    engine.amp.gain.exponentialRampToValueAtTime(.225,now+.038);
    engine.amp.gain.exponentialRampToValueAtTime(.175,now+.20);
  }else{
    engine.amp.gain.setTargetAtTime(.185,now,.012);
    engine.amp.gain.setTargetAtTime(.172,now+.075,.07);
  }
  engine.midi=midi;
};

processHand=function(rawHand){
  const now=performance.now();
  if(!rawHand){
    if(stableTrackV7.lastSeenAt&&now-stableTrackV7.lastSeenAt<230){
      handState.textContent="AGGANCIO MANO…";handState.classList.add("seen");handState.classList.remove("locked","fast");
      if(now-stableTrackV7.lastSeenAt>145&&state.pinch){state.pinch=false;releaseLeadV7(true)}
      return;
    }
    state.rightHand=null;state.pinch=false;state.currentNoteIndex=-1;state.lastPlayedMidi=null;
    $("noteName").textContent="—";handState.textContent="MANO NON VISTA";handState.classList.remove("seen","locked","fast");
    releaseLeadV7(true);resetStableTrackV7();updateNoteGuide();return;
  }

  stableTrackV7.lastSeenAt=now;
  const hand=smoothHandV7(rawHand);state.rightHand=hand;stableTrackV7.lastCenter=handCenterV7(hand);
  const thumb=hand[4],index=hand[8],wrist=hand[0],middle=hand[9];
  const palm=Math.max(.025,dist(wrist,middle)),ratio=dist(thumb,index)/palm;
  const sens=Number($("pinchSensitivity").value)/100,close=.40*sens,open=.58*sens,was=state.pinch;

  if(!state.pinch){
    if(ratio<close*.84)state.pinch=true;
    else{stableTrackV7.closeFrames=ratio<close?stableTrackV7.closeFrames+1:0;if(stableTrackV7.closeFrames>=2)state.pinch=true}
    if(state.pinch)stableTrackV7.closeFrames=0;
  }else{
    if(ratio>open*1.16)state.pinch=false;
    else{stableTrackV7.openFrames=ratio>open?stableTrackV7.openFrames+1:0;if(stableTrackV7.openFrames>=2)state.pinch=false}
    if(!state.pinch)stableTrackV7.openFrames=0;
  }

  const rawY=(thumb.y+index.y)/2,predictedY=predictiveYV8(rawY,now);
  const idx=lowLatencyIndexV8(predictedY),notes=currentScale(),midi=notes[idx],changed=idx!==state.currentNoteIndex;
  state.currentNoteIndex=idx;state.smoothHandY=predictedY;$("noteName").textContent=midiName(midi);updateNoteGuide();

  handState.textContent=state.pinch?"SUONO ATTIVO • RISPOSTA RAPIDA":"MANO STABILE • UNISCI POLLICE E INDICE";
  handState.classList.add("seen","locked");handState.classList.toggle("fast",lowLatencyV8.noteSpeed>2.2);

  if(state.pinch&&(!was||changed)){
    leadNoteV7(midi,!was);stableTrackV7.lastStableMidi=midi;
    const display=$("noteDisplay");display.classList.add("hit");setTimeout(()=>display.classList.remove("hit"),105);
    if(navigator.vibrate&&!was)navigator.vibrate(5);
  }else if(!state.pinch&&was){releaseLeadV7();stableTrackV7.lastStableMidi=null}
};

// One hand is enough: the other hand only presses the on-screen chord buttons.
loadTracker=async function(){
  if(state.tracker)return state.tracker;
  setStatus("Caricamento modalità rapida…");
  const vision=await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm");
  const options={baseOptions:{modelAssetPath:"https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",delegate:"GPU"},runningMode:"VIDEO",numHands:1,minHandDetectionConfidence:.36,minHandPresenceConfidence:.34,minTrackingConfidence:.40};
  try{state.tracker=await HandLandmarker.createFromOptions(vision,options)}catch(error){console.warn("GPU non disponibile, uso CPU",error);options.baseOptions.delegate="CPU";state.tracker=await HandLandmarker.createFromOptions(vision,options)}
  return state.tracker;
};

// Process every fresh camera frame instead of imposing an extra 30 ms delay.
loop=function(now){
  if(!state.started)return;
  if(video.readyState>=2&&state.tracker&&video.currentTime!==state.lastVideoTime&&!state.processing){
    state.processing=true;state.lastDetect=now;state.lastVideoTime=video.currentTime;
    try{const result=state.tracker.detectForVideo(video,now);processHand(chooseRightHand(result))}
    catch(error){console.warn("Tracking frame",error)}finally{state.processing=false}
  }
  drawOverlay();
  if(video.requestVideoFrameCallback)video.requestVideoFrameCallback(t=>loop(t));
  else requestAnimationFrame(loop);
};

async function optimizeCameraV8(){
  const track=state.stream?.getVideoTracks?.()[0];if(!track)return;
  try{await track.applyConstraints({width:{ideal:640},height:{ideal:480},frameRate:{ideal:60,max:60}})}
  catch{try{await track.applyConstraints({width:{ideal:640},height:{ideal:480},frameRate:{ideal:30,max:30}})}catch{}}
}
function scheduleCameraOptimizationV8(){
  let attempts=0;const timer=setInterval(()=>{attempts++;if(state.started&&state.stream){clearInterval(timer);optimizeCameraV8()}else if(attempts>30)clearInterval(timer)},100);
}
$("startBtn").addEventListener("click",scheduleCameraOptimizationV8);
cameraSwitchBtn?.addEventListener("click",()=>setTimeout(optimizeCameraV8,500));
