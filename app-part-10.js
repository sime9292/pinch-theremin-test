// Exact-note selection + one-tone upward bend controlled by rightward hand rotation.
const exactBendV10={
  currentIndex:-1,
  candidateIndex:-1,
  candidateFrames:0,
  smoothTilt:null,
  neutralTilt:null,
  bendAmount:0,
  baseMidi:null,
  lastPitch:null
};

const exactBendStyleV10=document.createElement("style");
exactBendStyleV10.textContent=`
  .bend-meter-v10{display:block;width:92px;height:5px;margin:5px auto 0;border-radius:999px;overflow:hidden;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.10)}
  .bend-meter-v10>i{display:block;width:0;height:100%;border-radius:999px;background:linear-gradient(90deg,#7ee8ff,#ffd68a);box-shadow:0 0 12px rgba(255,214,138,.48);transition:width .045s linear}
  .rotation-help-v10{position:absolute;z-index:7;right:10px;top:calc(env(safe-area-inset-top) + 72px);max-width:130px;padding:7px 9px;border-radius:13px;border:1px solid rgba(255,255,255,.14);background:rgba(5,9,17,.62);backdrop-filter:blur(10px);font-size:9px;line-height:1.25;font-weight:850;text-align:center;color:#ffe8ad;pointer-events:none}
  .note-display.exact-v10 strong{color:#a9f3ff}
  @media(max-width:420px){.rotation-help-v10{top:calc(env(safe-area-inset-top) + 118px);right:7px;max-width:108px;font-size:8px}}
`;
document.head.appendChild(exactBendStyleV10);

const bendMeterV10=document.createElement("span");
bendMeterV10.className="bend-meter-v10";
bendMeterV10.innerHTML="<i></i>";
$("noteDisplay").appendChild(bendMeterV10);
$("noteDisplay").classList.add("exact-v10");

const rotationHelpV10=document.createElement("div");
rotationHelpV10.className="rotation-help-v10";
rotationHelpV10.innerHTML="NOTA SEMPRE INTONATA<br>↻ RUOTA A DESTRA<br>PER BEND +1 TONO";
$("app").appendChild(rotationHelpV10);

function resetExactBendV10(){
  exactBendV10.currentIndex=-1;
  exactBendV10.candidateIndex=-1;
  exactBendV10.candidateFrames=0;
  exactBendV10.smoothTilt=null;
  exactBendV10.neutralTilt=null;
  exactBendV10.bendAmount=0;
  exactBendV10.baseMidi=null;
  exactBendV10.lastPitch=null;
  bendMeterV10.firstElementChild.style.width="0%";
  bendReadoutV9.textContent="NOTA ESATTA • RUOTA A DESTRA";
  bendReadoutV9.classList.remove("vibrato");
  $("noteDisplay").classList.remove("bending","vibrato");
}

function exactNoteIndexV10(y){
  const notes=currentScale();
  const usable=clamp((y-.08)/.84,0,1);
  const continuous=(1-usable)*(notes.length-1);
  let current=exactBendV10.currentIndex;
  let proposed=current;

  if(current<0)proposed=Math.round(continuous);
  else if(Math.abs(continuous-current)>1.45)proposed=Math.round(continuous);
  else if(continuous>current+.68)proposed=Math.min(notes.length-1,current+1);
  else if(continuous<current-.68)proposed=Math.max(0,current-1);

  proposed=clamp(proposed,0,notes.length-1);
  if(proposed!==current){
    if(proposed!==exactBendV10.candidateIndex){
      exactBendV10.candidateIndex=proposed;
      exactBendV10.candidateFrames=1;
    }else exactBendV10.candidateFrames++;

    if(current<0||exactBendV10.candidateFrames>=2){
      exactBendV10.currentIndex=proposed;
      exactBendV10.candidateFrames=0;
    }
  }else{
    exactBendV10.candidateIndex=current;
    exactBendV10.candidateFrames=0;
  }
  return exactBendV10.currentIndex;
}

function visibleHandTiltV10(hand){
  const wrist=hand[0],middle=hand[9];
  const mirror=$("mirrorToggle").checked;
  const wx=mirror?1-wrist.x:wrist.x;
  const mx=mirror?1-middle.x:middle.x;
  const dx=mx-wx;
  const up=Math.max(.001,wrist.y-middle.y);
  return Math.atan2(dx,up)*180/Math.PI;
}

function smoothAngleV10(raw){
  if(exactBendV10.smoothTilt===null){exactBendV10.smoothTilt=raw;return raw}
  let delta=((raw-exactBendV10.smoothTilt+540)%360)-180;
  const alpha=clamp(.34+Math.abs(delta)*.018,.34,.72);
  exactBendV10.smoothTilt+=delta*alpha;
  return exactBendV10.smoothTilt;
}

function bendFromTiltV10(tilt){
  if(exactBendV10.neutralTilt===null)exactBendV10.neutralTilt=tilt;
  const delta=tilt-exactBendV10.neutralTilt;
  const deadZone=4.5;
  const fullBendAngle=27;
  const target=clamp((delta-deadZone)/(fullBendAngle-deadZone),0,1);
  const alpha=Math.abs(target-exactBendV10.bendAmount)>.14?.46:.28;
  exactBendV10.bendAmount+=alpha*(target-exactBendV10.bendAmount);
  return clamp(exactBendV10.bendAmount,0,1);
}

function setContinuousPitchV10(engine,midiFloat,attack=false){
  if(!engine||engine.stopped)return;
  const now=engine.A.currentTime;
  const f=freq(midiFloat);
  const glide=attack?.006:.012;
  [[engine.oscA,f],[engine.oscB,f*2],[engine.oscC,f]].forEach(([osc,target])=>{
    osc.frequency.cancelScheduledValues(now);
    osc.frequency.setTargetAtTime(target,now,glide);
  });
  const brightness=clamp(1520+(midiFloat-48)*22,1520,2580);
  engine.filter.frequency.cancelScheduledValues(now);
  engine.filter.frequency.setTargetAtTime(brightness,now,.025);
  engine.midi=midiFloat;
}

function updateExactBendDisplayV10(baseMidi,bendAmount){
  const cents=Math.round(bendAmount*200);
  bendMeterV10.firstElementChild.style.width=`${Math.round(bendAmount*100)}%`;
  if(cents<3){
    bendReadoutV9.textContent="NOTA ESATTA • RUOTA A DESTRA";
    $("noteDisplay").classList.remove("bending","vibrato");
  }else{
    bendReadoutV9.textContent=cents>=196?"BEND COMPLETO +1 TONO":`BEND +${cents}¢`;
    $("noteDisplay").classList.add("bending");
  }
  $("noteName").textContent=midiName(baseMidi);
}

processHand=function(rawHand){
  const now=performance.now();
  if(!rawHand){
    if(stableTrackV7.lastSeenAt&&now-stableTrackV7.lastSeenAt<230){
      handState.textContent="AGGANCIO MANO…";
      handState.classList.add("seen");
      handState.classList.remove("locked","fast");
      if(now-stableTrackV7.lastSeenAt>145&&state.pinch){state.pinch=false;releaseLeadV7(true);exactBendV10.neutralTilt=null}
      return;
    }
    state.rightHand=null;state.pinch=false;state.currentNoteIndex=-1;state.lastPlayedMidi=null;
    $("noteName").textContent="—";
    handState.textContent="MANO NON VISTA";
    handState.classList.remove("seen","locked","fast");
    releaseLeadV7(true);resetStableTrackV7();resetExactBendV10();updateNoteGuide();return;
  }

  stableTrackV7.lastSeenAt=now;
  const hand=smoothHandV7(rawHand);
  state.rightHand=hand;
  stableTrackV7.lastCenter=handCenterV7(hand);

  const thumb=hand[4],index=hand[8],wrist=hand[0],middle=hand[9];
  const palm=Math.max(.025,dist(wrist,middle));
  const ratio=dist(thumb,index)/palm;
  const sens=Number($("pinchSensitivity").value)/100;
  const close=.40*sens,open=.58*sens,was=state.pinch;

  if(!state.pinch){
    if(ratio<close*.84)state.pinch=true;
    else{
      stableTrackV7.closeFrames=ratio<close?stableTrackV7.closeFrames+1:0;
      if(stableTrackV7.closeFrames>=2)state.pinch=true;
    }
    if(state.pinch)stableTrackV7.closeFrames=0;
  }else{
    if(ratio>open*1.16)state.pinch=false;
    else{
      stableTrackV7.openFrames=ratio>open?stableTrackV7.openFrames+1:0;
      if(stableTrackV7.openFrames>=2)state.pinch=false;
    }
    if(!state.pinch)stableTrackV7.openFrames=0;
  }

  const rawY=(thumb.y+index.y)/2;
  const predictedY=predictiveYV8(rawY,now);
  const idx=exactNoteIndexV10(predictedY);
  const notes=currentScale();
  const baseMidi=notes[idx];
  const noteChanged=idx!==state.currentNoteIndex||baseMidi!==exactBendV10.baseMidi;
  state.currentNoteIndex=idx;
  state.smoothHandY=predictedY;
  exactBendV10.baseMidi=baseMidi;
  updateNoteGuide();

  const tilt=smoothAngleV10(visibleHandTiltV10(hand));
  if(state.pinch&&!was)exactBendV10.neutralTilt=tilt;
  const bendAmount=state.pinch?bendFromTiltV10(tilt):0;
  const targetMidi=baseMidi+bendAmount*2;
  updateExactBendDisplayV10(baseMidi,bendAmount);

  handState.textContent=state.pinch
    ?(bendAmount>.96?"BEND +1 TONO":"SUONO ATTIVO • RUOTA A DESTRA PER BEND")
    :"NOTA AGGANCIATA • UNISCI POLLICE E INDICE";
  handState.classList.add("seen","locked");
  handState.classList.toggle("fast",lowLatencyV8.noteSpeed>2.2);

  if(state.pinch){
    if(!was||!leadEngineV7||leadEngineV7.stopped){
      leadNoteV7(baseMidi,true);
      exactBendV10.lastPitch=targetMidi;
      if(navigator.vibrate)navigator.vibrate(5);
    }
    if(leadEngineV7&&(noteChanged||exactBendV10.lastPitch===null||Math.abs(targetMidi-exactBendV10.lastPitch)>.002)){
      setContinuousPitchV10(leadEngineV7,targetMidi,!was);
      exactBendV10.lastPitch=targetMidi;
    }
  }else if(was){
    releaseLeadV7();
    exactBendV10.neutralTilt=null;
    exactBendV10.bendAmount=0;
    exactBendV10.lastPitch=null;
    updateExactBendDisplayV10(baseMidi,0);
  }
};

const originalResetStableV10=resetStableTrackV7;
resetStableTrackV7=function(){originalResetStableV10();resetExactBendV10()};

$("scaleSelect").addEventListener("change",()=>{
  exactBendV10.currentIndex=-1;
  exactBendV10.candidateIndex=-1;
  exactBendV10.baseMidi=null;
  exactBendV10.neutralTilt=null;
});
$("octaveSelect").addEventListener("change",()=>{
  exactBendV10.currentIndex=-1;
  exactBendV10.candidateIndex=-1;
  exactBendV10.baseMidi=null;
  exactBendV10.neutralTilt=null;
});

resetExactBendV10();