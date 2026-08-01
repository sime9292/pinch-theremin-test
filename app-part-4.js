  try{await resumeAudio();const trackerPromise=loadTracker();state.stream=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:"user",width:{ideal:1280},height:{ideal:720},frameRate:{ideal:30,max:30}}});video.srcObject=state.stream;await video.play();await trackerPromise;state.started=true;$("startScreen").classList.add("hidden");setStatus("Mano destra: unisci pollice e indice • Sinistra: scegli un accordo");clearTimeout(state.hintTimer);state.hintTimer=setTimeout(()=>setStatus("Pronto"),4800);requestAnimationFrame(loop)}catch(e){console.error(e);stopAll();let text="Impossibile avviare la fotocamera.";if(e?.name==="NotAllowedError")text="Permesso fotocamera negato. Abilitalo nelle impostazioni del sito e premi Riprova.";else if(e?.name==="NotFoundError")text="Nessuna fotocamera disponibile.";else if(e?.name==="NotReadableError")text="La fotocamera è già usata da un’altra app.";err.textContent=text;$("startBtn").textContent="Riprova";$("startBtn").disabled=false}
}
function stopAll(){
  state.started=false;state.stream?.getTracks().forEach(t=>t.stop());state.stream=null;video.srcObject=null;stopChord();state.tracker?.close?.();state.tracker=null;if(state.audio){state.audio.A.close().catch(()=>{});state.audio=null}state.rightHand=null;state.pinch=false;ctx.clearRect(0,0,innerWidth,innerHeight);$("startScreen").classList.remove("hidden");$("startBtn").disabled=false;$("startBtn").textContent="Avvia fotocamera e audio";closeSheets();setStatus("Tocca Avvia per attivare fotocamera e audio")
}
async function loop(now){
  if(!state.started)return;if(video.readyState>=2&&state.tracker&&video.currentTime!==state.lastVideoTime&&now-state.lastDetect>34&&!state.processing){state.processing=true;state.lastDetect=now;state.lastVideoTime=video.currentTime;try{const result=state.tracker.detectForVideo(video,now);processHand(chooseRightHand(result))}catch(e){console.warn("Tracking frame",e)}finally{state.processing=false}}
  drawOverlay();requestAnimationFrame(loop)
}
function mapPoint(p){const vw=video.videoWidth||innerWidth,vh=video.videoHeight||innerHeight,scale=Math.max(innerWidth/vw,innerHeight/vh),dw=vw*scale,dh=vh*scale,ox=(innerWidth-dw)/2,oy=(innerHeight-dh)/2;let x=p.x;if($("mirrorToggle").checked)x=1-x;return{x:ox+x*dw,y:oy+p.y*dh}}
function drawOverlay(){
  ctx.clearRect(0,0,innerWidth,innerHeight);const hand=state.rightHand;if(!hand)return;ctx.save();ctx.lineWidth=2;ctx.strokeStyle="rgba(170,234,255,.34)";HAND_CONNECTIONS.forEach(([a,b])=>{const A=mapPoint(hand[a]),B=mapPoint(hand[b]);ctx.beginPath();ctx.moveTo(A.x,A.y);ctx.lineTo(B.x,B.y);ctx.stroke()});const t=mapPoint(hand[4]),i=mapPoint(hand[8]),m={x:(t.x+i.x)/2,y:(t.y+i.y)/2};ctx.lineWidth=3;ctx.strokeStyle=state.pinch?"#8dffc2":"rgba(255,255,255,.72)";ctx.beginPath();ctx.moveTo(t.x,t.y);ctx.lineTo(i.x,i.y);ctx.stroke();[t,i].forEach(p=>{ctx.fillStyle="#7ee8ff";ctx.beginPath();ctx.arc(p.x,p.y,5,0,Math.PI*2);ctx.fill()});ctx.shadowBlur=state.pinch?24:10;ctx.shadowColor=state.pinch?"#8dffc2":"#7ee8ff";ctx.strokeStyle=state.pinch?"#8dffc2":"#7ee8ff";ctx.lineWidth=3;ctx.beginPath();ctx.arc(m.x,m.y,state.pinch?16:10,0,Math.PI*2);ctx.stroke();ctx.shadowBlur=0;ctx.font="800 11px system-ui";ctx.textAlign="center";ctx.fillStyle="rgba(255,255,255,.92)";ctx.fillText("DESTRA",m.x,m.y-22);ctx.restore()
}

$("startBtn").onclick=startApp;$("stopBtn").onclick=stopAll;
$("mirrorToggle").onchange=e=>video.style.transform=e.target.checked?"scaleX(-1)":"none";
[["pinchSensitivity","pinchOut"],["melodyVolume","melodyOut"],["chordVolume","chordOut"]].forEach(([input,out])=>{$(input).oninput=e=>{$(out).value=e.target.value+"%";if(state.audio){if(input==="melodyVolume")state.audio.melodyBus.gain.setTargetAtTime(e.target.value/100,state.audio.A.currentTime,.04);if(input==="chordVolume")state.audio.chordBus.gain.setTargetAtTime(e.target.value/100,state.audio.A.currentTime,.04)}}});
$("scaleSelect").onchange=()=>showToast($("scaleSelect").selectedOptions[0].text);$("octaveSelect").onchange=()=>showToast($("octaveSelect").selectedOptions[0].text);
document.addEventListener("visibilitychange",()=>{if(document.hidden&&state.audio?.A.state==="running")state.audio.A.suspend();else if(!document.hidden&&state.started)state.audio?.A.resume()});
addEventListener("pagehide",()=>state.stream?.getTracks().forEach(t=>t.stop()));

buildPiano();renderChordRail();
if(!window.isSecureContext)$("startError").textContent="Apri questa app tramite un indirizzo HTTPS per usare la fotocamera.";
