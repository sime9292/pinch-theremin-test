
// Mobile controls added after the main app has initialized.
state.facingMode="user";

const mobileFixStyle=document.createElement("style");
mobileFixStyle.textContent=`
  #cameraSwitchBtn{right:64px;font-size:19px}
  .chord-title{position:absolute;z-index:7;left:12px;top:calc(env(safe-area-inset-top) + 69px);width:min(33vw,132px);text-align:center;font-size:10px;letter-spacing:.18em;font-weight:900;color:#fff4cf;text-shadow:0 2px 10px #000;padding:5px 2px;pointer-events:none}
  #chordRail{top:calc(env(safe-area-inset-top) + 94px)!important;bottom:calc(env(safe-area-inset-bottom) + 54px);width:min(33vw,132px)!important;padding:6px!important;border:1px solid rgba(255,255,255,.11);border-radius:22px;background:rgba(5,9,17,.18);backdrop-filter:blur(5px)}
  #chordRail .chord-btn{flex:0 0 auto;min-height:62px;background:rgba(8,13,24,.62)}
  #chordRail .chord-btn.add{min-height:52px}
  .camera-setting-button{width:100%;padding:12px;border-radius:14px;border:1px solid var(--line);background:#17345a;font-weight:850;color:white}
  @media (orientation:landscape){.chord-title{top:7px}.chord-rail{top:31px!important;bottom:8px!important;max-height:calc(100vh - 39px)}#cameraSwitchBtn{right:62px}}
`;
document.head.appendChild(mobileFixStyle);

const chordTitle=document.createElement("div");
chordTitle.className="chord-title";
chordTitle.textContent="ACCORDI";
$("app").appendChild(chordTitle);

const cameraSwitchBtn=document.createElement("button");
cameraSwitchBtn.id="cameraSwitchBtn";
cameraSwitchBtn.className="icon-button";
cameraSwitchBtn.type="button";
cameraSwitchBtn.textContent="🔄";
cameraSwitchBtn.setAttribute("aria-label","Cambia fotocamera");
cameraSwitchBtn.title="Cambia fotocamera";
$("app").appendChild(cameraSwitchBtn);

const cameraSettingBtn=document.createElement("button");
cameraSettingBtn.type="button";
cameraSettingBtn.className="camera-setting-button";
cameraSettingBtn.textContent="🔄 Cambia fotocamera";
const settingsGrid=document.querySelector("#settingsSheet .settings-grid");
settingsGrid?.insertBefore(cameraSettingBtn,$("stopBtn"));

async function requestCamera(facingMode){
  return navigator.mediaDevices.getUserMedia({
    audio:false,
    video:{
      facingMode:{ideal:facingMode},
      width:{ideal:1280},
      height:{ideal:720},
      frameRate:{ideal:30,max:30}
    }
  });
}

async function switchCamera(){
  if(!state.started){showToast("Avvia prima la fotocamera");return}
  const previous=state.facingMode||"user";
  const next=previous==="user"?"environment":"user";
  cameraSwitchBtn.disabled=true;
  cameraSettingBtn.disabled=true;
  setStatus("Cambio fotocamera…");
  const current=video.srcObject;
  current?.getTracks?.().forEach(track=>track.stop());
  try{
    const stream=await requestCamera(next);
    state.stream=stream;
    state.facingMode=next;
    video.srcObject=stream;
    await video.play();
    const mirror=next==="user";
    $("mirrorToggle").checked=mirror;
    video.style.transform=mirror?"scaleX(-1)":"none";
    state.lastVideoTime=-1;
    state.rightHand=null;
    showToast(next==="user"?"Fotocamera frontale":"Fotocamera posteriore");
    setStatus("Mano destra: unisci pollice e indice • Sinistra: tocca gli accordi");
  }catch(error){
    console.error("Cambio fotocamera",error);
    try{
      const fallback=await requestCamera(previous);
      state.stream=fallback;
      state.facingMode=previous;
      video.srcObject=fallback;
      await video.play();
      state.lastVideoTime=-1;
    }catch(fallbackError){console.error("Ripristino fotocamera",fallbackError)}
    showToast("Cambio fotocamera non riuscito");
    setStatus("Controlla i permessi della fotocamera");
  }finally{
    cameraSwitchBtn.disabled=false;
    cameraSettingBtn.disabled=false;
  }
}

cameraSwitchBtn.addEventListener("click",switchCamera);
cameraSettingBtn.addEventListener("click",switchCamera);

// Keep the selected camera state coherent when the app is stopped.
$("stopBtn").addEventListener("click",()=>{state.facingMode="user";cameraSwitchBtn.disabled=false});
