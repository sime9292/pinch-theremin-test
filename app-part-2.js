  const n=$("noteDisplay");n.classList.add("hit");setTimeout(()=>n.classList.remove("hit"),180);
  if(navigator.vibrate)navigator.vibrate(8);
}

function normalizeVoicing(notes){
  let n=[...new Set(notes)].sort((a,b)=>a-b);if(!n.length)return[];
  while(n[0]<40)n=n.map(v=>v+12);while(n[0]>57)n=n.map(v=>v-12);
  n=n.map((v,i)=>{let x=v;while(i&&x<=n[i-1])x+=12;return x});
  if(n.length<4)n.push(n[0]+12);return n.slice(0,5);
}
function buildStringVoice(notes,target=1){
  const {A,chordBus}=initAudio(),now=A.currentTime,group=A.createGain(),filter=A.createBiquadFilter(),warm=A.createBiquadFilter(),chorus=A.createDelay(.05),chorusGain=A.createGain(),lfo=A.createOscillator(),lfoGain=A.createGain(),sources=[];
  group.gain.setValueAtTime(.0001,now);group.gain.linearRampToValueAtTime(target,now+.48);
  filter.type="lowpass";filter.frequency.value=1450;filter.Q.value=.7;warm.type="highpass";warm.frequency.value=85;
  chorus.delayTime.value=.019;chorusGain.gain.value=.28;lfo.frequency.value=.26;lfoGain.gain.value=.0032;lfo.connect(lfoGain);lfoGain.connect(chorus.delayTime);lfo.start(now);sources.push(lfo);
  group.connect(filter);filter.connect(warm);warm.connect(chordBus);warm.connect(chorus);chorus.connect(chorusGain);chorusGain.connect(chordBus);
  normalizeVoicing(notes).forEach((m,i)=>{
    const base=freq(m);[["sawtooth",-5,.055],["sawtooth",5,.055],["triangle",0,.095]].forEach(([type,det,gain])=>{const o=A.createOscillator(),g=A.createGain();o.type=type;o.frequency.value=base;o.detune.value=det+(i%2?1:-1);g.gain.value=gain*(i===0?1.08:.88);o.connect(g);g.connect(group);o.start(now);sources.push(o)});
  });
  return{group,sources,stop(at=A.currentTime){group.gain.cancelScheduledValues(at);group.gain.setTargetAtTime(.0001,at,.18);sources.forEach(s=>{try{s.stop(at+1.05)}catch{}})}};
}
function activateChord(id){
  const chord=chords.find(c=>c.id===id);if(!chord)return;resumeAudio();
  if(state.activeChordId===id){stopChord();return}
  const old=state.chordVoice,newVoice=buildStringVoice(chord.notes,1);state.chordVoice=newVoice;state.activeChordId=id;if(old)old.stop();renderChordRail();showToast(chord.name);
}
function stopChord(){if(state.chordVoice){state.chordVoice.stop();state.chordVoice=null}state.activeChordId=null;renderChordRail()}
function previewChord(notes){if(!notes.length){showToast("Seleziona almeno una nota");return}resumeAudio();if(state.previewVoice)state.previewVoice.stop();state.previewVoice=buildStringVoice(notes,.72);setTimeout(()=>{if(state.previewVoice){state.previewVoice.stop();state.previewVoice=null}},1700)}

function renderChordRail(){
  const rail=$("chordRail");rail.innerHTML="";chords.forEach(ch=>{const b=document.createElement("button");b.className="chord-btn"+(state.activeChordId===ch.id?" active":"");b.innerHTML=`${escapeHtml(ch.name)}<span>${ch.notes.map(m=>SHARP_NAMES[m%12]).join(" · ")}</span>`;
    let timer,moved=false;b.addEventListener("pointerdown",e=>{moved=false;timer=setTimeout(()=>{moved=true;openChordEditor(ch.id)},620)});b.addEventListener("pointermove",()=>clearTimeout(timer));b.addEventListener("pointerup",()=>{clearTimeout(timer);if(!moved)activateChord(ch.id)});b.addEventListener("pointercancel",()=>clearTimeout(timer));b.addEventListener("contextmenu",e=>{e.preventDefault();openChordEditor(ch.id)});rail.appendChild(b)});
  const add=document.createElement("button");add.className="chord-btn add";add.textContent="+";add.setAttribute("aria-label","Aggiungi accordo");add.onclick=()=>openChordEditor(null);rail.appendChild(add);
}
function escapeHtml(s){return String(s).replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]))}

const chordTemplates=[
  ["maj9",[0,2,4,7,11]],["m9",[0,2,3,7,10]],["9",[0,2,4,7,10]],["maj7",[0,4,7,11]],["m7",[0,3,7,10]],["7",[0,4,7,10]],["m7♭5",[0,3,6,10]],["dim7",[0,3,6,9]],["6",[0,4,7,9]],["m6",[0,3,7,9]],["add9",[0,2,4,7]],["sus2",[0,2,7]],["sus4",[0,5,7]],["aug",[0,4,8]],["dim",[0,3,6]],["m",[0,3,7]],["",[0,4,7]]
];
function detectChord(notes){
  if(!notes.length)return"—";const sorted=[...notes].sort((a,b)=>a-b),pcs=[...new Set(sorted.map(n=>n%12))],bass=sorted[0]%12;let best=null;
  for(const root of pcs){for(const [suffix,pattern] of chordTemplates){const target=pattern.map(i=>(root+i)%12).sort((a,b)=>a-b);if(target.length!==pcs.length)continue;if(target.every((v,i)=>v===[...pcs].sort((a,b)=>a-b)[i])){let score=pattern.length*10+(root===bass?4:0);if(!best||score>best.score)best={root,suffix,score}}}}
  if(!best)return pcs.map(p=>SHARP_NAMES[p]).join("/");let name=SHARP_NAMES[best.root]+best.suffix;if(bass!==best.root&&pcs.includes(bass))name+="/"+SHARP_NAMES[bass];return name;
}

function buildPiano(){
  const white=$("whiteKeys"),piano=$("piano");white.innerHTML="";piano.querySelectorAll(".black").forEach(k=>k.remove());const whitePcs=new Set([0,2,4,5,7,9,11]);let whiteIndex=0;
  for(let midi=48;midi<=71;midi++)if(whitePcs.has(midi%12)){const k=makeKey(midi,"white");white.appendChild(k);whiteIndex++}
  whiteIndex=0;for(let midi=48;midi<=71;midi++){const pc=midi%12;if(whitePcs.has(pc)){whiteIndex++;continue}const k=makeKey(midi,"black");const prevWhite=whiteIndex;k.style.left=(prevWhite*48-15.5)+"px";piano.appendChild(k)}
}
function makeKey(midi,type){const b=document.createElement("button");b.className=`key ${type}`;b.dataset.midi=midi;b.textContent=midiName(midi);b.onclick=()=>togglePianoNote(midi);return b}
function togglePianoNote(midi){state.selectedMidi.has(midi)?state.selectedMidi.delete(midi):state.selectedMidi.add(midi);updateChordEditor()}
function updateChordEditor(){
