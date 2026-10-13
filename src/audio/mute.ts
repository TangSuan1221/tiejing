/** Output preference only: simulation noise and dialogue timing remain unchanged. */
const KEY='ironlung.audio.muted';
let muted=false;
try{muted=localStorage.getItem(KEY)==='1';}catch{/* storage unavailable */}
const listeners=new Set<(muted:boolean)=>void>();
export const isAudioMuted=()=>muted;
export function onAudioMute(fn:(muted:boolean)=>void){listeners.add(fn);fn(muted);return ()=>{listeners.delete(fn);};}
export function setAudioMuted(value:boolean){
 muted=value;
 try{localStorage.setItem(KEY,value?'1':'0');}catch{/* session-only fallback */}
 if(value&&typeof window!=='undefined'&&'speechSynthesis' in window)window.speechSynthesis.cancel();
 for(const fn of listeners)fn(value);
}
/** Browser TTS reads character lines; disabled until recorded voice exists. Subtitles and sound cues are unaffected. */
const DIALOGUE_VOICE=false;
export function speakDialogue(text:string,rate=1){
 if(!DIALOGUE_VOICE||muted||typeof window==='undefined'||!('speechSynthesis' in window))return;
 try{window.speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(text);u.lang='zh-CN';u.rate=rate;window.speechSynthesis.speak(u);}catch{/* speech is optional */}
}
