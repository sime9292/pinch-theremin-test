// Robust hand tracking, visible melody note lanes and clearer chord controls.
state.smoothHandY=.5;
state.lastPlayedMidi=null;
state.lastMelodyAt=0;

const usabilityStyle=document.createElement("style");
usabilityStyle.textContent=`
  .hand-state{position:absolute;z-index:7;left:50%;top:calc(env(safe-area-inset-top) + 76px);transform:translateX(-50%);padding:7px 11px;border-radius:999px;border:1px solid rgba(255,255,255,.16);background:rgba(4,9,17,.68);backdrop-filter:blur(10px);font-size:11px;font-weight:850;white-space:nowrap;color:#ffd7a1}
  .hand-state.seen{color:#9dffca;border-color:rgba(141,255,194,.45)}
  .note-guide{position:absolute;z-index:4;left:calc(min(33vw,132px) + 18px);right:8px;top:8%;bottom:8%;display:flex;flex-direction:column;pointer-events:auto;touch-action:none;border-radius:20px;overflow:hidden;border:1px solid rgba(255,255,255,.12);background:rgba(4,8,16,.10)}
  .note-zone{flex:1;min-height:18px;display:flex;align-items:center;justify-content:flex-end;padding:0 10px;border-bottom:1px solid rgba(255,255,255,.08);background:rgba(20,35,55,.08);color:rgba(235,244,255,.62);font-size:11px;font-weight:900;text-shadow:0 1px 5px #000;transition:.1s background,.1s color,.1s transform}
  .note-zone:nth-child(odd){background:rgba(73,130,174,.09)}
  .note-zone.active{background:linear-gradient(90deg,rgba(72,204,255,.05),rgba(75,222,190,.38));color:#fff;box-shadow:inset 0 0 22px rgba(95,235,255,.20);transform:scaleY(1.04)}
  .note-zone small{font-size:8px;color:rgba(255,255,255,.48);margin-right:6px;letter-spacing:.08em}
  #chordRail .chord-btn{min-height:66px!important;font-size:18px!important;border-width:2px!important}
  #chordRail .chord-btn::after{content:"TOCCA";font-size:7px;letter-spacing:.16em;color:rgba(255,255,255,.48);margin-top:1px}
  #chordRail .chord-btn.active::after{content:"IN SUONO";color:#ffe8aa}
  #chordRail .chord-btn.add{font-size:14px!important;line-height:1.1!important;color:#a7f3ff!important}
  #chordRail .chord-btn.add::after{content:"CREA ACCORDO"}
  #chordRail .chord-stop{min-height:42px!important;font-size:11px!important;color:#ffb9c3;background:rgba(91,30,42,.72)!important}
  #chordRail .chord-stop::after{content:""}
  @media(max-width:420px){.note-guide{left:calc(min(34vw,132px) + 12px)}.note-zone{padding-right:6px;font-size:10px}.hand-state{top:calc(env(safe-area-inset-top) + 67px)}}
`;
document.head.appendChild(usabilityStyle);

const noteGuide=document.createElement("div");
noteGuide.id="noteGuide";
noteGuide.className="note-guide";
$("app").insertBefore(noteGuide,$("status"));

const handState=document.createElement("div");
handState.id="handState";
handState.className="hand-state";
handState.textContent="MOSTRA UNA MANO ALLA FOTOCAMERA";
$("app").appendChild(handState);

function renderNoteGuide(){
  const notes=currentScale();
  noteGuide.innerHTML="";
  [...notes].reverse().forEach((midi,visualIndex)=>{
    const originalIndex=notes.length-1-visualIndex;
    const zone=document.createElement("div");
    zone.className="note-zone";
    zone.dataset.index=originalIndex;
    zone.dataset.midi=midi;
    zone.innerHTML=`<small>NOTA</small>${midiName(midi)}`;
    noteGuide.appendChild(zone);
  });
  updateNoteGuide();
}
function updateNoteGuide(){
  noteGuide.querySelectorAll(".note-zone").forEach(zone=>zone.classList.toggle("active",Number(zone.dataset.index)===state.currentNoteIndex));
}
function playGuideAt(clientY){
  const rect=noteGuide.getBoundingClientRect();
  const normalized=clamp((clientY-rect.top)/rect.height,0,1);
  const notes=currentScale();
  const idx=Math.round((1-normalized)*(notes.length-1));
  const midi=notes[idx];
  state.currentNoteIndex=idx;
  $("noteName").textContent=midiName(midi);
  updateNoteGuide();
  const now=performance.now();
  if(state.lastPlayedMidi!==midi||now-state.lastMelodyAt>180){playMelody(midi);state.lastPlayedMidi=midi;state.lastMelodyAt=now}
}
let guidePointer=null;
noteGuide.addEventListener("pointerdown",e=>{guidePointer=e.pointerId;noteGuide.setPointerCapture(e.pointerId);playGuideAt(e.clientY)});
noteGuide.addEventListener("pointermove",e=>{if(e.pointerId===guidePointer)playGuideAt(e.clientY)});
noteGuide.addEventListener("pointerup",e=>{if(e.pointerId===guidePointer)guidePointer=null});
noteGuide.addEventListener("pointercancel",()=>guidePointer=null);

// With one detected hand, always use it. This avoids losing tracking when Android/MediaPipe reverses handedness.
chooseRightHand=function(result){
  const hands=result?.landmarks||[];
  if(!hands.length)return null;
  if(hands.length===1)return hands[0];
  const wanted=$("handInvertToggle").checked?"Left":"Right";
  for(let i=0;i<hands.length;i++){
    const raw=extractCategory(result,i).toLowerCase();
    if(raw&&raw.includes(wanted.toLowerCase()))return hands[i];
  }
  // Fallback: choose the hand furthest from the chord buttons in the mirrored preview.
  const mirrored=$("mirrorToggle").checked;
  return hands.slice().sort((a,b)=>{
    const ax=mirrored?1-a[9].x:a[9].x;
    const bx=mirrored?1-b[9].x:b[9].x;
    return bx-ax;
  })[0];
};

processHand=function(hand){
  state.rightHand=hand;
  if(!hand){
    state.pinch=false;state.currentNoteIndex=-1;state.lastPlayedMidi=null;
    $("noteName").textContent="—";handState.textContent="MANO NON VISTA";handState.classList.remove("seen");updateNoteGuide();return;
  }
  handState.textContent="MANO RILEVATA • UNISCI POLLICE E INDICE";handState.classList.add("seen");
  const thumb=hand[4],index=hand[8],wrist=hand[0],middle=hand[9];
  const palm=Math.max(.025,dist(wrist,middle));
  const ratio=dist(thumb,index)/palm;
  const sens=Number($("pinchSensitivity").value)/100;
  const close=.43*sens,open=.62*sens;
  const was=state.pinch;
  if(!state.pinch&&ratio<close)state.pinch=true;
  else if(state.pinch&&ratio>open)state.pinch=false;
  const rawY=(thumb.y+index.y)/2;
  state.smoothHandY=state.smoothHandY*.68+rawY*.32;
  const {midi,idx}=noteFromY(state.smoothHandY);
  const changed=idx!==state.currentNoteIndex;
  state.currentNoteIndex=idx;
  $("noteName").textContent=midiName(midi);
  updateNoteGuide();
  const now=performance.now();
  if(state.pinch&&(!was||changed)&&(state.lastPlayedMidi!==midi||now-state.lastMelodyAt>140)){
    playMelody(midi);state.lastPlayedMidi=midi;state.lastMelodyAt=now;
  }
  if(!state.pinch&&was)state.lastPlayedMidi=null;
};

// Replace chord controls with reliable single-tap buttons and explicit feedback.
renderChordRail=function(){
  const rail=$("chordRail");rail.innerHTML="";
  chords.forEach(ch=>{
    const b=document.createElement("button");
    b.type="button";
    b.className="chord-btn"+(state.activeChordId===ch.id?" active":"");
    b.innerHTML=`${escapeHtml(ch.name)}<span>${ch.notes.map(m=>SHARP_NAMES[m%12]).join(" · ")}</span>`;
    b.addEventListener("click",e=>{e.preventDefault();activateChord(ch.id)});
    b.addEventListener("contextmenu",e=>{e.preventDefault();openChordEditor(ch.id)});
    rail.appendChild(b);
  });
  const add=document.createElement("button");
  add.type="button";add.className="chord-btn add";add.innerHTML="＋<span>NUOVO</span>";add.onclick=()=>openChordEditor(null);rail.appendChild(add);
  const stop=document.createElement("button");
  stop.type="button";stop.className="chord-btn chord-stop";stop.textContent="■ FERMA ACCORDO";stop.onclick=stopChord;rail.appendChild(stop);
};

const previousScaleHandler=$("scaleSelect").onchange;
$("scaleSelect").onchange=e=>{previousScaleHandler?.call(e.currentTarget,e);renderNoteGuide()};
const previousOctaveHandler=$("octaveSelect").onchange;
$("octaveSelect").onchange=e=>{previousOctaveHandler?.call(e.currentTarget,e);renderNoteGuide()};

const chordTitleNode=document.querySelector(".chord-title");
if(chordTitleNode)chordTitleNode.textContent="ACCORDI • TOCCA PER CAMBIARE";
renderNoteGuide();
renderChordRail();
