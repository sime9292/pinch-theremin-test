  document.querySelectorAll(".key").forEach(k=>k.classList.toggle("selected",state.selectedMidi.has(Number(k.dataset.midi))));const notes=[...state.selectedMidi].sort((a,b)=>a-b),det=detectChord(notes);$("detectedChord").textContent=det;$("selectedNotes").textContent=notes.length?notes.map(midiName).join(" · "):"Nessuna nota selezionata";
  if(!$("customChordName").dataset.touched)$("customChordName").value=det==="—"?"":det;
}
function openChordEditor(id){
  state.editingId=id;state.selectedMidi.clear();const existing=chords.find(c=>c.id===id);if(existing)existing.notes.forEach(n=>state.selectedMidi.add(n));$("chordSheetTitle").textContent=existing?"Modifica accordo":"Nuovo accordo";$("saveChord").textContent=existing?"Salva":"Aggiungi";$("deleteChord").classList.toggle("hidden",!existing);$("customChordName").dataset.touched="";$("customChordName").value=existing?.name||"";openSheet("chordSheet");updateChordEditor();setTimeout(()=>$("piano").parentElement.scrollLeft=100,40)
}
function saveChordFromEditor(){const notes=[...state.selectedMidi].sort((a,b)=>a-b);if(notes.length<2){showToast("Scegli almeno due note");return}const auto=detectChord(notes),name=$("customChordName").value.trim()||auto;if(state.editingId){const c=chords.find(c=>c.id===state.editingId);if(c){c.name=name;c.notes=notes}}else chords.push({id:uid(),name,notes});saveChords();renderChordRail();closeSheets();showToast("Accordo salvato")}
function deleteEditingChord(){if(!state.editingId)return;if(state.activeChordId===state.editingId)stopChord();chords=chords.filter(c=>c.id!==state.editingId);saveChords();renderChordRail();closeSheets();showToast("Accordo eliminato")}

function openSheet(id){$("sheetBackdrop").classList.remove("hidden");$(id).classList.remove("hidden")}
function closeSheets(){$("sheetBackdrop").classList.add("hidden");$("settingsSheet").classList.add("hidden");$("chordSheet").classList.add("hidden");if(state.previewVoice){state.previewVoice.stop();state.previewVoice=null}}
document.querySelectorAll("[data-close]").forEach(b=>b.onclick=closeSheets);$("sheetBackdrop").onclick=closeSheets;$("settingsBtn").onclick=()=>openSheet("settingsSheet");$("cancelChord").onclick=closeSheets;$("saveChord").onclick=saveChordFromEditor;$("deleteChord").onclick=deleteEditingChord;$("clearChord").onclick=()=>{state.selectedMidi.clear();$("customChordName").dataset.touched="";$("customChordName").value="";updateChordEditor()};$("listenChord").onclick=()=>previewChord([...state.selectedMidi].sort((a,b)=>a-b));$("customChordName").addEventListener("input",e=>e.target.dataset.touched="1");

function currentScale(){const cfg=SCALE_MAP[$("scaleSelect").value],base=Number($("octaveSelect").value);const notes=[];for(let oct=0;oct<2;oct++)for(const step of cfg.steps)notes.push(base+cfg.root+step+oct*12);notes.push(base+cfg.root+24);return notes}
function noteFromY(y){const notes=currentScale(),usable=clamp((y-.08)/.84,0,1),idx=Math.round((1-usable)*(notes.length-1));return{midi:notes[idx],idx}}
function extractCategory(result,i){const groups=result.handednesses||result.handedness||[];const cat=groups[i]?.[0];return cat?.categoryName||cat?.displayName||cat?.category_name||""}
function logicalHand(rawLabel){let right=rawLabel.toLowerCase().includes("left");if($("handInvertToggle").checked)right=!right;return right?"Right":"Left"}
function chooseRightHand(result){if(!result?.landmarks?.length)return null;for(let i=0;i<result.landmarks.length;i++){if(logicalHand(extractCategory(result,i))==="Right")return result.landmarks[i]}return null}
function processHand(hand){
  state.rightHand=hand;if(!hand){state.pinch=false;state.currentNoteIndex=-1;$("noteName").textContent="—";return}
  const thumb=hand[4],index=hand[8],wrist=hand[0],middle=hand[9];const palm=Math.max(.025,dist(wrist,middle)),ratio=dist(thumb,index)/palm,sens=Number($("pinchSensitivity").value)/100,close=.30*sens,open=.46*sens;const was=state.pinch;
  if(!state.pinch&&ratio<close)state.pinch=true;else if(state.pinch&&ratio>open)state.pinch=false;
  const y=(thumb.y+index.y)/2,{midi,idx}=noteFromY(y);state.currentNoteIndex=idx;$("noteName").textContent=midiName(midi);
  if(!was&&state.pinch)playMelody(midi);
}

async function loadTracker(){
  if(state.tracker)return state.tracker;setStatus("Caricamento rilevamento mani…");const vision=await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm");const options={baseOptions:{modelAssetPath:"https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",delegate:"GPU"},runningMode:"VIDEO",numHands:2,minHandDetectionConfidence:.5,minHandPresenceConfidence:.45,minTrackingConfidence:.45};
  try{state.tracker=await HandLandmarker.createFromOptions(vision,options)}catch{options.baseOptions.delegate="CPU";state.tracker=await HandLandmarker.createFromOptions(vision,options)}return state.tracker
}
async function startApp(){
  const err=$("startError");err.textContent="";if(!window.isSecureContext){err.textContent="La fotocamera richiede HTTPS. Apri il link GitHub Pages, non il file locale.";return}
  if(!navigator.mediaDevices?.getUserMedia){err.textContent="Il browser non supporta l’accesso alla fotocamera.";return}
  $("startBtn").disabled=true;$("startBtn").textContent="Avvio…";
