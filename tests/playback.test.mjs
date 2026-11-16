import {test} from 'node:test';
import assert from 'node:assert/strict';
import {planSpeech,sourcePosition,SpeechPlayback} from '../.test-build/playback.js';
const regions=[{start:2,end:4},{start:6,end:8}];
const buffer={sampleRate:48000,length:480000,duration:10};
function context(){return {
 currentTime:10,destination:{},nodes:[],closed:false,
 async resume(){},async close(){this.closed=true},
 createBufferSource(){const node={buffer:null,onended:null,stops:0,disconnected:false,
 connect(){},disconnect(){this.disconnected=true},stop(){this.stops++},
 start(...args){this.args=args}};this.nodes.push(node);return node;}
}}

test('speech plan omits gaps and preserves exact source boundaries',()=>{
 assert.deepEqual(planSpeech(regions,0,48000,480000),[
  {offset:2,duration:2,at:0},{offset:6,duration:2,at:2}]);
 assert.deepEqual(planSpeech(regions,3,48000,480000),[
  {offset:3,duration:1,at:0},{offset:6,duration:2,at:1}]);
 assert.deepEqual(planSpeech(regions,5,48000,480000),[{offset:6,duration:2,at:0}]);
 assert.deepEqual(planSpeech(regions,8,48000,480000),[]);
});

test('boundaries align to samples and output clips meet without gaps',()=>{
 const clips=planSpeech([{start:.00001,end:.123456},{start:.234567,end:.765432}],0,48000,48000);
 assert.equal(clips[1].at,clips[0].duration);
 assert.equal(clips[0].duration*48000,Math.round(.123456*48000));
 assert.equal(clips[1].offset*48000,Math.round(.234567*48000));
});

test('cursor maps the audio clock back to original timestamps',()=>{
 const clips=planSpeech(regions,0,48000,480000);
 for(const [elapsed,want] of [[-.1,2],[0,2],[1,3],[2,6],[3,7],[4,8]])assert.equal(sourcePosition(clips,elapsed),want);
});

test('all sources are scheduled contiguously on the audio clock, sharing original audio',async()=>{
 const ctx=context(),player=new SpeechPlayback(ctx);
 assert.equal(await player.play(buffer,regions,0),true);
 assert.deepEqual(ctx.nodes.map(n=>n.args),[[10.1,2,2],[12.1,6,2]]);
 assert.ok(ctx.nodes.every(n=>n.buffer===buffer));
 ctx.currentTime=12.6;
 assert.equal(player.currentTime,6.5);
 assert.equal(ctx.nodes.length,2); // no timer or media seek needed to cross gaps
});

test('pause stops queued audio; resume rebuilds from the exact source position',async()=>{
 const ctx=context(),player=new SpeechPlayback(ctx);
 await player.play(buffer,regions,0);ctx.currentTime=11.1;
 assert.equal(player.pause(),3);
 assert.ok(ctx.nodes.every(n=>n.stops===1&&n.disconnected));
 assert.equal(player.active,false);
 await player.play(buffer,regions,3);
 assert.deepEqual(ctx.nodes.slice(2).map(n=>n.args),[[11.2,3,1],[12.2,6,2]]);
});

test('clicking into a gap replaces queued audio with the next speech segment',async()=>{
 const ctx=context(),player=new SpeechPlayback(ctx);
 await player.play(buffer,regions,0);
 await player.play(buffer,regions,5);
 assert.ok(ctx.nodes.slice(0,2).every(n=>n.stops===1));
 assert.deepEqual(ctx.nodes[2].args,[10.1,6,2]);
});

test('no speech or final source completion stops at file end',async()=>{
 const ctx=context(),player=new SpeechPlayback(ctx);
 assert.equal(await player.play(buffer,[],0),false);
 assert.equal(player.currentTime,10);
 assert.equal(ctx.nodes.length,0);
 await player.play(buffer,regions,0);
 ctx.nodes[1].onended();
 assert.equal(player.active,false);assert.equal(player.currentTime,10);
});

test('pause cancels pending context unlock so delayed audio never starts',async()=>{
 const ctx=context();let unlock;ctx.resume=()=>new Promise(r=>unlock=r);
 const player=new SpeechPlayback(ctx),starting=player.play(buffer,regions,0);
 player.pause();unlock();
 assert.equal(await starting,false);assert.equal(ctx.nodes.length,0);
});

test('dispose stops scheduled sources and closes the audio context',async()=>{
 const ctx=context(),player=new SpeechPlayback(ctx);
 await player.play(buffer,regions,0);player.dispose();
 assert.ok(ctx.nodes.every(n=>n.stops===1));assert.equal(ctx.closed,true);
});
