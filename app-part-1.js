const {HandLandmarker, FilesetResolver}=await import("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/+esm");

const $=id=>document.getElementById(id);
const video=$("camera"),canvas=$("overlay"),ctx=canvas.getContext("2d");
const state={stream:null,tracker:null,audio:null,started:false,processing:false,lastDetect:0,lastVideoTime:-1,rightHand:null,pinch:false,currentNoteIndex:-1,activeChordId:null,chordVoice:null,previewVoice:null,editingId:null,selectedMidi:new Set(),hintTimer:null};
const DEFAULT_CHORDS=[
  {id:"cmaj7",name:"Cmaj7",notes:[48,55,59,64]},
  {id:"am7",name:"Am7",notes:[45,52,55,60]},
  {id:"fmaj7",name:"Fmaj7",notes:[41,48,52,57]},
  {id:"g6",name:"G6",notes:[43,50,52,59]}
];
const NOTE_NAMES=["C","C♯","D","E♭","E","F","F♯","G","A♭","A","B♭","B"];
const SHARP_NAMES=["C","C♯","D","D♯","E","F","F♯","G","G♯","A","A♯","B"];
const SCALE_MAP={majorPenta:{root:0,steps:[0,2,4,7,9]},minorPenta:{root:9,steps:[0,3,5,7,10]},major:{root:0,steps:[0,2,4,5,7,9,11]},dorian:{root:2,steps:[0,2,3,5,7,9,10]},blues:{root:9,steps:[0,3,5,6,7,10]}};
const HAND_CONNECTIONS=[[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[17,18],[18,19],[19,20],[0,17]];
let chords=loadChords();

function loadChords(){try{const saved=JSON.parse(localStorage.getItem("handMelodyChords"));if(Array.isArray(saved)&&saved.length)return saved}catch{}return structuredClone(DEFAULT_CHORDS)}
function saveChords(){localStorage.setItem("handMelodyChords",JSON.stringify(chords))}
function clamp(v,min,max){return Math.max(min,Math.min(max,v))}
function dist(a,b){return Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z||0)}
function midiName(m){return SHARP_NAMES[m%12]+(Math.floor(m/12)-1)}
function freq(m){return 440*Math.pow(2,(m-69)/12)}
function uid(){return "c"+Date.now().toString(36)+Math.random().toString(36).slice(2,6)}
function showToast(text){const t=$("toast");t.textContent=text;t.classList.add("show");clearTimeout(t._timer);t._timer=setTimeout(()=>t.classList.remove("show"),1600)}
function setStatus(text){$("status").textContent=text}
function resizeCanvas(){const dpr=Math.min(2,devicePixelRatio||1);canvas.width=Math.round(innerWidth*dpr);canvas.height=Math.round(innerHeight*dpr);canvas.style.width=innerWidth+"px";canvas.style.height=innerHeight+"px";ctx.setTransform(dpr,0,0,dpr,0,0)}
addEventListener("resize",resizeCanvas);addEventListener("orientationchange",()=>setTimeout(resizeCanvas,250));resizeCanvas();

function initAudio(){
  if(state.audio)return state.audio;
  const A=new(window.AudioContext||window.webkitAudioContext)();
  const master=A.createGain(),compressor=A.createDynamicsCompressor(),limiter=A.createDynamicsCompressor();
  compressor.threshold.value=-20;compressor.knee.value=16;compressor.ratio.value=3;compressor.attack.value=.01;compressor.release.value=.25;
  limiter.threshold.value=-5;limiter.knee.value=2;limiter.ratio.value=18;limiter.attack.value=.002;limiter.release.value=.08;
  const melodyBus=A.createGain(),chordBus=A.createGain(),dry=A.createGain(),reverb=A.createConvolver(),reverbGain=A.createGain(),delay=A.createDelay(.8),delayGain=A.createGain(),feedback=A.createGain();
  melodyBus.gain.value=.64;chordBus.gain.value=.58;dry.gain.value=.8;reverbGain.gain.value=.3;delay.delayTime.value=.22;delayGain.gain.value=.13;feedback.gain.value=.19;
  reverb.buffer=createImpulse(A,2.7,2.4);
  melodyBus.connect(dry);melodyBus.connect(reverb);melodyBus.connect(delay);
  chordBus.connect(dry);chordBus.connect(reverb);
  delay.connect(delayGain);delay.connect(feedback);feedback.connect(delay);delayGain.connect(compressor);
  reverb.connect(reverbGain);reverbGain.connect(compressor);dry.connect(compressor);compressor.connect(limiter);limiter.connect(master);master.connect(A.destination);
  state.audio={A,master,melodyBus,chordBus};
  return state.audio;
}
function createImpulse(A,duration,decay){const length=Math.floor(A.sampleRate*duration),buffer=A.createBuffer(2,length,A.sampleRate);for(let c=0;c<2;c++){const data=buffer.getChannelData(c);for(let i=0;i<length;i++)data[i]=(Math.random()*2-1)*Math.pow(1-i/length,decay)}return buffer}
function resumeAudio(){const a=initAudio();if(a.A.state!=="running")return a.A.resume()}

function playMelody(midi){
  const {A,melodyBus}=initAudio();resumeAudio();const now=A.currentTime;
  const out=A.createGain(),filter=A.createBiquadFilter(),osc1=A.createOscillator(),osc2=A.createOscillator(),air=A.createBufferSource(),airFilter=A.createBiquadFilter(),airGain=A.createGain();
  filter.type="lowpass";filter.frequency.setValueAtTime(2400,now);filter.frequency.exponentialRampToValueAtTime(1200,now+.75);filter.Q.value=1.2;
  osc1.type="triangle";osc1.frequency.value=freq(midi);osc2.type="sine";osc2.frequency.value=freq(midi)*2;osc2.detune.value=-3;
  const noise=A.createBuffer(1,Math.floor(A.sampleRate*.65),A.sampleRate),d=noise.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=(Math.random()*2-1)*(.28*(1-i/d.length));air.buffer=noise;airFilter.type="bandpass";airFilter.frequency.value=1850;airFilter.Q.value=.8;airGain.gain.value=.035;
  out.gain.setValueAtTime(.0001,now);out.gain.exponentialRampToValueAtTime(.28,now+.055);out.gain.exponentialRampToValueAtTime(.15,now+.24);out.gain.exponentialRampToValueAtTime(.0001,now+1.05);
  osc1.connect(filter);osc2.connect(filter);filter.connect(out);air.connect(airFilter);airFilter.connect(airGain);airGain.connect(out);out.connect(melodyBus);
  osc1.start(now);osc2.start(now);air.start(now);osc1.stop(now+1.1);osc2.stop(now+1.1);air.stop(now+.68);
