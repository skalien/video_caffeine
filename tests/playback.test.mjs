import {test} from 'node:test';
import assert from 'node:assert/strict';
import {skipNonSpeech} from '../.test-build/playback.js';

const regions = [{start:2,end:4},{start:6,end:8}];
function playerAt(time, {advance=0, seeking=false}={}) {
 const media={seeking};
 return {
  time, reads:0, seeks:[], pauses:0,
  getCurrentTime(){this.reads++;const t=this.time;this.time+=advance;return t},
  getDuration(){return 10},
  getMediaElement(){return media},
  setTime(t){this.seeks.push(t);this.time=t;media.seeking=true},
  pause(){this.pauses++},
 };
}

test('an advancing playback clock never causes seeking inside speech',()=>{
 const p=playerAt(2,{advance:0.001});
 for(let frame=0;frame<1000;frame++)assert.equal(skipNonSpeech(p,regions),true);
 assert.equal(p.reads,1000);
 assert.deepEqual(p.seeks,[]);
 assert.equal(p.pauses,0);
 assert.ok(p.time>2.9);
});

test('leading and intermediate gaps seek to the next speech start',()=>{
 for(const [time,target] of [[0,2],[1.9,2],[4,6],[5,6]]){
  const p=playerAt(time);
  assert.equal(skipNonSpeech(p,regions),true);
  assert.deepEqual(p.seeks,[target]);
 }
});

test('speech boundaries and interiors continue without seeking',()=>{
 for(const time of [2,3,3.999,6,7.999]){
  const p=playerAt(time);
  assert.equal(skipNonSpeech(p,regions),true);
  assert.deepEqual(p.seeks,[]);
 }
});

test('an in-progress seek is not repeatedly issued',()=>{
 const p=playerAt(4);
 skipNonSpeech(p,regions);
 // Simulate a slow backend still reporting its old position while seeking.
 p.time=4;
 for(let frame=0;frame<60;frame++)skipNonSpeech(p,regions);
 assert.deepEqual(p.seeks,[6]);
 assert.equal(p.reads,1);
 p.time=6;p.getMediaElement().seeking=false;
 skipNonSpeech(p,regions);
 assert.deepEqual(p.seeks,[6]);
});

test('no remaining speech stops playback and moves to the end',()=>{
 for(const [time,list] of [[8,regions],[9,regions],[0,[]]]){
  const p=playerAt(time);
  assert.equal(skipNonSpeech(p,list),false);
  assert.equal(p.pauses,1);
  assert.deepEqual(p.seeks,[10]);
 }
 const ended=playerAt(10);
 assert.equal(skipNonSpeech(ended,regions),false);
 assert.deepEqual(ended.seeks,[]);
});

test('seeking manually into a gap is respected until the seek completes',()=>{
 const p=playerAt(5,{seeking:true});
 skipNonSpeech(p,regions);
 assert.deepEqual(p.seeks,[]);
 p.getMediaElement().seeking=false;
 skipNonSpeech(p,regions);
 assert.deepEqual(p.seeks,[6]);
});
