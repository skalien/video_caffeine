import React, {useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import WaveSurfer from 'wavesurfer.js';
import Regions from 'wavesurfer.js/dist/plugins/regions.esm.js';
import {Channel,invoke,isTauri} from '@tauri-apps/api/core';
import './style.css';
import {SpeechPlayback} from './playback';
type Frame={start:number;end:number;probability:number};
function App(){
 const container=useRef<HTMLDivElement>(null), wave=useRef<WaveSurfer|null>(null), regions=useRef<Regions|null>(null), pcm=useRef<Float32Array|null>(null);
 const speechRegions=useRef<{start:number;end:number}[]>([]);
 const decodedAudio=useRef<AudioBuffer|null>(null), speechPlayer=useRef<SpeechPlayback|null>(null);
 const interaction=useRef<(time:number)=>void>(()=>{});
 const [complete,setComplete]=useState(false);
 const [name,setName]=useState('No audio loaded'),[ready,setReady]=useState(false),[busy,setBusy]=useState(false),[loading,setLoading]=useState(false),[playing,setPlaying]=useState(false),[frames,setFrames]=useState<Frame[]>([]),[progress,setProgress]=useState(0),[threshold,setThreshold]=useState(.5),[minimum,setMinimum]=useState(.25),[error,setError]=useState(''),[duration,setDuration]=useState(0),[position,setPosition]=useState(0);
 useEffect(()=>{const r=Regions.create(); regions.current=r; const w=WaveSurfer.create({container:container.current!,waveColor:'#647788',progressColor:'#b9f5d2',height:220,barWidth:2,barGap:1,plugins:[r],cursorColor:'#fff'});wave.current=w;w.on('play',()=>setPlaying(true));w.on('pause',()=>setPlaying(false));w.on('timeupdate',setPosition);w.on('interaction',time=>interaction.current(time));w.on('error',e=>setError(e.message));return()=>{speechPlayer.current?.dispose();w.destroy()}},[]);
 useEffect(()=>{const r=regions.current;if(!r)return;r.clearRegions();speechRegions.current=[];if(!frames.length)return;
 const segments:{start:number;end:number;speech:boolean}[]=[];let speech=frames[0].probability>=threshold;let start=0;let pending:number|null=null;
 for(const f of frames){const next=speech?f.probability>=Math.max(.01,threshold-.15):f.probability>=threshold;if(next!==speech){if(pending===null)pending=f.start;if(f.end-pending >= (speech?minimum:.064)){segments.push({start,end:pending,speech});start=pending;speech=next;pending=null}}else pending=null;}
 segments.push({start,end:frames[frames.length-1].end,speech});
 speechRegions.current=segments.filter(s=>s.speech&&s.end>s.start);
 for(const s of segments)if(s.end>s.start)r.addRegion({start:s.start,end:s.end,color:s.speech?'rgba(83,218,153,.22)':'rgba(244,172,114,.25)',drag:false,resize:false});
 },[frames,threshold,minimum]);
 async function load(file:File){speechPlayer.current?.pause();decodedAudio.current=null;setPlaying(false);setComplete(false);setLoading(true);setReady(false);setError('');setFrames([]);setProgress(0);wave.current?.pause();try{const ctx=new AudioContext();let decoded:AudioBuffer;try{decoded=await ctx.decodeAudioData(await file.arrayBuffer())}finally{await ctx.close()}const offline=new OfflineAudioContext(1,Math.ceil(decoded.duration*16000),16000);const source=offline.createBufferSource();source.buffer=decoded;source.connect(offline.destination);source.start();pcm.current=(await offline.startRendering()).getChannelData(0);await wave.current!.loadBlob(file);decodedAudio.current=decoded;setDuration(decoded.duration);setName(file.name);setReady(true)}catch(e){setError(String(e));pcm.current=null}finally{setLoading(false)}}
 async function analyze(){if(!pcm.current)return;pausePlayback();setComplete(false);setBusy(true);setError('');setFrames([]);setProgress(0);try{const channel=new Channel<{frames:Frame[];progress:number}>();channel.onmessage=u=>{setFrames(f=>f.concat(u.frames));setProgress(u.progress)};await invoke('analyze',{samples:Array.from(pcm.current),algorithm:'silero',updates:channel});setComplete(true)}catch(e){setError(String(e))}finally{setBusy(false)}}
 function pausePlayback(){
  const player=speechPlayer.current;
  if(player?.active){const time=player.pause();wave.current?.setTime(time);}
  wave.current?.pause();setPlaying(false);
 }
 async function playSpeech(from:number){
  const buffer=decodedAudio.current;if(!buffer)return;
  wave.current?.pause();
  try{
   const player=speechPlayer.current??(speechPlayer.current=new SpeechPlayback(new AudioContext()));
   setPlaying(true);
   await player.play(buffer,speechRegions.current,from);
   setPlaying(player.active);
   wave.current?.setTime(player.currentTime);
  }catch(e){setPlaying(false);setError(String(e))}
 }
 async function togglePlayback(){
  const w=wave.current;if(!w)return;
  if(speechPlayer.current?.active||w.isPlaying()){pausePlayback();return;}
  const from=w.getCurrentTime()>=w.getDuration()?0:w.getCurrentTime();
  if(complete){await playSpeech(from);return;}
  try{w.setTime(from);await w.play()}catch(e){setError(String(e))}
 }
 useEffect(()=>{
  interaction.current=(time)=>{if(complete&&speechPlayer.current?.active)void playSpeech(time)};
 });
 useEffect(()=>{
  if(!complete)return;
  // Settings change the schedule, but never alter the original speech boundaries.
  if(speechPlayer.current?.active)void playSpeech(speechPlayer.current.currentTime);
  else {wave.current?.pause();setPlaying(false);}
 },[complete,threshold,minimum]);
 useEffect(()=>{
  if(!complete||!playing)return;
  let id=0;
  const tick=()=>{
   const player=speechPlayer.current;if(!player)return;
   // WaveSurfer's media stays paused; setTime updates only our visual transport.
   // Actual speech playback comes exclusively from the scheduled Web Audio nodes.
   wave.current?.setTime(player.currentTime);
   if(!player.active){setPlaying(false);return;}
   id=requestAnimationFrame(tick);
  };
  id=requestAnimationFrame(tick);return()=>cancelAnimationFrame(id);
 },[complete,playing]);
 const clock=(n:number)=>`${Math.floor(n/60)}:${Math.floor(n%60).toString().padStart(2,'0')}`;
 return <main><header><a className="brand">◒ caffeine<span>AUDIO LAB</span></a><span className="badge">LOCAL · CPU</span></header><section className="intro"><p className="eyebrow">LISTEN BETWEEN THE WORDS</p><h1>Find the quiet.</h1><p>Explore your audio. See where speech begins and ends.</p></section><div className="layout"><section className="panel"><div className="panelhead"><div><small>AUDIO SOURCE</small><h2>{name}</h2></div><label className="button">{loading?'Decoding…':'＋ Open audio'}<input aria-label="Open audio file" type="file" accept="audio/*" disabled={busy||loading} onChange={e=>{const f=e.target.files?.[0];if(f)void load(f);e.target.value=''}}/></label></div><div className="wavebox"><div ref={container}/>{!ready&&!loading&&<p className="empty">Load a WAV, MP3, or M4A file to begin.<br/><small>Supported formats depend on macOS</small></p>}</div><div className="transport"><button disabled={!ready} onClick={()=>void togglePlayback()}>{playing?'Ⅱ Pause':complete?'▶ Play speech':'▶ Play'}</button><span>{clock(position)} <i>/ {clock(duration)}</i></span><label>Zoom <input aria-label="Waveform zoom" type="range" min="0" max="180" defaultValue="0" onChange={e=>wave.current?.zoom(+e.target.value)}/></label></div><div className="legend"><span className="speech">● Speech</span><span className="silence">● Non-speech</span><span>● Not analyzed</span></div><div className="analysis"><div><strong>{busy?'Analyzing audio…':progress===1?'Analysis complete':'Analysis timeline'}</strong><span>{Math.round(progress*100)}%</span></div><progress max="1" value={progress}/><p>{complete?'Playback skips non-speech using the current settings.':'Regions appear as the model processes the recording. Playback and analysis run independently.'}</p></div></section><aside className="panel settings"><small>ANALYSIS SETTINGS</small><h2>A closer listen.</h2><label>Algorithm<select defaultValue="silero" disabled={busy}><option value="silero">01 — Silero VAD</option><option disabled>More algorithms coming later</option></select></label><p>A neural voice detector running locally on one CPU thread.</p><label>Speech threshold <b>{threshold.toFixed(2)}</b><input type="range" min=".1" max=".9" step=".01" value={threshold} onChange={e=>setThreshold(+e.target.value)}/></label><label>Minimum non-speech <b>{minimum.toFixed(2)} s</b><input type="range" min=".064" max="1" step=".01" value={minimum} onChange={e=>setMinimum(+e.target.value)}/></label><p>Adjust settings after analysis to update markings instantly.</p><button className="primary" disabled={!ready||busy||!isTauri()} onClick={()=>void analyze()}>Analyze audio ↗</button>{busy&&<button onClick={()=>void invoke('cancel').catch(e=>setError(String(e)))}>Cancel analysis</button>}<p className="note">Non-speech may include music, breathing, and background sounds. It does not always mean silence.</p></aside></div>{!isTauri()&&<p className="notice">Browser preview: audio playback is available. Launch the Tauri app to run Rust inference.</p>}{error&&<p role="alert" className="error">{error}</p>}<footer>PRIVATE BY DESIGN <span>Audio stays on your device.</span></footer></main>
}
createRoot(document.getElementById('root')!).render(<App/>);
