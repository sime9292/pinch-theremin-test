// Expressive pitch bend + gesture vibrato, adapted for a Shine On style lead.
const expressiveV9={
  engine:null,
  baselineY:null,
  samples:[],
  vibratoCents:0,
  lastPitch:null,
  lastNearestMidi:null
};

const expressiveStyleV9=document.createElement("style");
expressiveStyleV9.textContent=`
  .bend-readout{display:block;margin-top:3px;font-size:9px;letter-spacing:.10em;font-weight:900;color:#ffd68a;min-height:12px}
  .bend-readout.vibrato{color:#a9f3ff;text-shadow:0 0 12px rgba(126,232,255,.55)}
  .note-display.bending{box-shadow:0 0 34px rgba(255,214,138,.28)}
  .note-display.vibrato{box-shadow:0 0 38px rgba(126,232,255,.36)}
`;
document.head.appendChild(expressiveStyleV9);

const bendReadoutV9=document.createElement("span");
bendReadoutV9.id="bendReadout";
bendReadoutV9.className="bend-readout";
bendReadoutV9.textContent="PRONTO AL BEND";
$("noteDisplay").appendChild(bendReadoutV9);

// Dedicated G minor / Gilmour-oriented note layout.
const oldCurrentScaleV9=currentScale;
SCALE_MAP.shine={root:7,steps:[0,3,5,7,9,10,11]};
const shineOptionV9=document.createElement("option");
shineOptionV9.value="shine";
shineOptionV9.textContent="Shine On – G minor lead";
$("scaleSelect").appendChild(shineOptionV9);
currentScale=function(){
  if($("scaleSelect").value!=="shine")return oldCurrentScaleV9();
  // G3–G5 with E and F# included for the characteristic four-note motif.
  return [55,58,60,62,64,65,66,67,70,72,74,76,77,78,79];
};
$("scaleSelect").value="shine";
$("octaveSelect").value="48";
renderNoteGuide();

function resetExpressiveV9(){
  expressiveV9.baselineY=null;
  expressiveV9.samples.length=0;
  expressiveV9.vibratoCents=0;
  expressiveV9.lastPitch=null;
  expressiveV9.lastNearestMidi=null;
  bendReadoutV9.textContent="PRONTO AL BEND";
  bendReadoutV9.classList.remove("vibrato");
  $("noteDisplay").classList.remove("bending","vibrato");
}

function magneticPitchV9(y){
  const notes=currentScale();
  const usable=clamp((y-.08)/.84,0,1);
  const continuous=(1-usable)*(notes.length-1);
  const nearestIndex=clamp(Math.round(continuous),0,notes.length-1);
  const delta=continuous-nearestIndex;
  const deadZone=.12;
  let magneticIndex=nearestIndex;
  if(Math.abs(delta)>deadZone){
    const amount=clamp((Math.abs(delta)-deadZone)/(.5-deadZone),0,1)*.5;
    magneticIndex=nearestIndex+Math.sign(delta)*amount;
  }
  magneticIndex=clamp(magneticIndex,0,notes.length-1);
  const low=Math.floor(magneticIndex),high=Math.ceil(magneticIndex),mix=magneticIndex-low;
  const midi=notes[low]+(notes[high]-notes[low])*mix;
  return{midi,nearestIndex,nearestMidi:notes[nearestIndex],continuousIndex:continuous};
}

function gestureVibratoV9(y,now){
  expressiveV9.samples.push({y,t:now});
  while(expressiveV9.samples.length&&now-expressiveV9.samples[0].t>300)expressiveV9.samples.shift();
  if(expressiveV9.baselineY===null)expressiveV9.baselineY=y;
  expressiveV9.baselineY+=.075*(y-expressiveV9.baselineY);

  const recent=expressiveV9.samples;
  if(recent.length<6){expressiveV9.vibratoCents*=.72;return{active:false,cents:expressiveV9.vibratoCents}}
  const mean=recent.reduce((s,p)=>s+p.y,0)/recent.length;
  let min=Infinity,max=-Infinity,crossings=0,lastSign=0;
  for(const p of recent){
    min=Math.min(min,p.y);max=Math.max(max,p.y);
    const offset=p.y-mean;
    const sign=Math.abs(offset)<.0012?0:Math.sign(offset);
    if(sign&&lastSign&&sign!==lastSign)crossings++;
    if(sign)lastSign=sign;
  }
  const range=max-min;
  const active=range>.0045&&range<.040&&crossings>=2;
  const target=active?clamp(-(y-mean)*4200,-72,72):0;
  expressiveV9.vibratoCents+=.42*(target-expressiveV9.vibratoCents);
  if(!active)expressiveV9.vibratoCents*=.80;
  return{active,cents:expressiveV9.vibratoCents};
}

function createExpressiveLeadV9(midi){
  const {A,melodyBus}=initAudio(),now=A.currentTime;
  const input=A.createGain(),filter=A.createBiquadFilter(),body=A.createBiquadFilter(),drive=A.createWaveShaper(),amp=A.createGain();
  const oscA=A.createOscillator(),oscB=A.createOscillator(),oscC=A.createOscillator();
  const gainA=A.createGain(),gainB=A.createGain(),gainC=A.createGain();

  oscA.type="triangle";oscB.type="sine";oscC.type="sawtooth";
  gainA.gain.value=.72;gainB.gain.value=.17;gainC.gain.value=.065;
  filter.type="lowpass";filter.frequency.value=1780;filter.Q.value=1.15;
  body.type="peaking";body.frequency.value=760;body.Q.value=.72;body.gain.value=2.4;
  drive.curve=leadCurveV7;drive.oversample="2x";
  amp.gain.setValueAtTime(.0001,now);

  oscA.connect(gainA);oscB.connect(gainB);oscC.connect(gainC);
  gainA.connect(input);gainB.connect(input);gainC.connect(input);
  input.connect(filter);filter.connect(body);body.connect(drive);drive.connect(amp);amp.connect(melodyBus);
  [oscA,oscB,oscC].forEach(o=>o.start(now));

  const engine={A,oscA,oscB,oscC,amp,filter,stopped:false,midi:null};
  setExpressivePitchV9(engine,midi,true,0);
  return engine;
}

function setExpressivePitchV9(engine,midi,attack=false,vibratoCents=0){
  const now=engine.A.currentTime;
  const base=freq(midi);
  const glide=attack?.005:.007;
  [[engine.oscA,base],[engine.oscB,base*2],[engine.oscC,base]].forEach(([osc,target])=>{
    osc.frequency.cancelScheduledValues(now);
    osc.frequency.setTargetAtTime(target,now,glide);
    osc.detune.cancelScheduledValues(now);
    osc.detune.setTargetAtTime(vibratoCents,now,.010);
  });
  engine.oscB.detune.setTargetAtTime(vibratoCents-5,now,.010);
  engine.oscC.detune.setTargetAtTime(vibratoCents+6,now,.010);

  const brightness=clamp(1480+(midi-48)*22,1450,2550);
  engine.filter.frequency.cancelScheduledValues(now);
  engine.filter.frequency.setTargetAtTime(brightness,now,.018);
  engine.amp.gain.cancelScheduledValues(now);
  if(attack){
    engine.amp.gain.setValueAtTime(.0001,now);
    engine.amp.gain.exponentialRampToValueAtTime(.225,now+.042);
    engine.amp.gain.exponentialRampToValueAtTime(.175,now+.22);
  }else engine.amp.gain.setTargetAtTime(.176,now,.018);
  engine.midi=midi;
}

function startExpressiveLeadV9(midi){
  resumeAudio();
  if(expressiveV9.engine&&!expressiveV9.engine.stopped)releaseExpressiveLeadV9(true);
  expressiveV9.engine=createExpressiveLeadV9(midi);
  expressiveV9.lastPitch=midi;
}

function updateExpressiveLeadV9(midi,vibratoCents){
  if(!expressiveV9.engine||expressiveV9.engine.stopped)startExpressiveLeadV9(midi);
  else setExpressivePitchV9(expressiveV9.engine,midi,false,vibratoCents);
  expressiveV9.lastPitch=midi;
}

function releaseExpressiveLeadV9(fast=false){
  const engine=expressiveV9.engine;
  if(!engine||engine.stopped)return;
  engine.stopped=true;
  const now=engine.A.currentTime;
  engine.amp.gain.cancelScheduledValues(now);
  engine.amp.gain.setTargetAtTime(.0001,now,fast?.035:.115);
  [engine.oscA,engine.oscB,engine.oscC].forEach(o=>{try{o.stop(now+(fast?.22:.72))}catch{}});
  expressiveV9.engine=null;
}

// Redirect the previous lead controls to the expressive engine.
leadNoteV7=function(midi,retrigger=false){
  if(retrigger||!expressiveV9.engine)startExpressiveLeadV9(midi);
  else updateExpressiveLeadV9(midi,0);
};
releaseLeadV7=function(fast=false){releaseExpressiveLeadV9(fast)};

processHand=function(rawHand){
  const now=performance.now();
  if(!rawHand){
    if(stableTrackV7.lastSeenAt&&now-stableTrackV7.lastSeenAt<230){
      handState.textContent="AGGANCIO MANO…";handState.classList.add("seen");handState.classList.remove("locked","fast");
      if(now-stableTrackV7.lastSeenAt>145&&state.pinch){state.pinch=false;releaseExpressiveLeadV9(true)}
      return;
    }
    state.rightHand=null;state.pinch=false;state.currentNoteIndex=-1;state.lastPlayedMidi=null;
    $("noteName").textContent="—";handState.textContent="MANO NON VISTA";handState.classList.remove("seen","locked","fast");
    releaseExpressiveLeadV9(true);resetStableTrackV7();resetExpressiveV9();updateNoteGuide();return;
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

  const rawY=(thumb.y+index.y)/2;
  const predictedY=predictiveYV8(rawY,now);
  const pitchInfo=magneticPitchV9(predictedY);
  const nearestIndex=pitchInfo.nearestIndex;
  const nearestMidi=pitchInfo.nearestMidi;
  state.currentNoteIndex=nearestIndex;state.smoothHandY=predictedY;
  $("noteName").textContent=midiName(nearestMidi);updateNoteGuide();

  if(state.pinch){
    const vibrato=gestureVibratoV9(predictedY,now);
    if(!was){
      startExpressiveLeadV9(nearestMidi);
      expressiveV9.lastNearestMidi=nearestMidi;
    }else updateExpressiveLeadV9(pitchInfo.midi,vibrato.cents);

    const bendCents=Math.round((pitchInfo.midi-nearestMidi)*100);
    if(vibrato.active){
      bendReadoutV9.textContent=`VIBRATO ${Math.round(Math.abs(vibrato.cents))}¢`;
      bendReadoutV9.classList.add("vibrato");
      $("noteDisplay").classList.add("vibrato");
      $("noteDisplay").classList.remove("bending");
      handState.textContent="VIBRATO GESTUALE";
    }else if(Math.abs(bendCents)>4){
      bendReadoutV9.textContent=`BEND ${bendCents>0?"+":""}${bendCents}¢`;
      bendReadoutV9.classList.remove("vibrato");
      $("noteDisplay").classList.add("bending");
      $("noteDisplay").classList.remove("vibrato");
      handState.textContent="BENDING • DITA UNITE";
    }else{
      bendReadoutV9.textContent="NOTA INTONATA";
      bendReadoutV9.classList.remove("vibrato");
      $("noteDisplay").classList.remove("bending","vibrato");
      handState.textContent="SUONO ATTIVO • MUOVI PER IL BEND";
    }
  }else{
    if(was)releaseExpressiveLeadV9();
    expressiveV9.samples.length=0;expressiveV9.baselineY=null;expressiveV9.vibratoCents=0;
    bendReadoutV9.textContent="UNISCI LE DITA";
    bendReadoutV9.classList.remove("vibrato");$("noteDisplay").classList.remove("bending","vibrato");
    handState.textContent="MANO STABILE • UNISCI POLLICE E INDICE";
  }

  handState.classList.add("seen","locked");
  handState.classList.toggle("fast",lowLatencyV8.noteSpeed>2.2);
};

const oldScaleChangeV9=$("scaleSelect").onchange;
$("scaleSelect").onchange=e=>{
  oldScaleChangeV9?.call(e.currentTarget,e);
  renderNoteGuide();
  resetExpressiveV9();
};

const oldStopAllV9=stopAll;
stopAll=function(){releaseExpressiveLeadV9(true);resetExpressiveV9();return oldStopAllV9()};

showToast("Preset Shine On attivo");