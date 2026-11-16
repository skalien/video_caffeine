/** Return the current time inside speech, the next speech start in a gap,
 * or null when no speech remains. Regions must be sorted and non-overlapping. */
export function nextSpeechTime(regions: readonly {start:number;end:number}[], time:number):number|null {
 let lo=0,hi=regions.length;
 while(lo<hi){const mid=(lo+hi)>>>1;if(regions[mid].end<=time)lo=mid+1;else hi=mid;}
 return lo===regions.length?null:Math.max(time,regions[lo].start);
}

interface SpeechPlayer {
 getCurrentTime(): number;
 getDuration(): number;
 getMediaElement(): {readonly seeking: boolean};
 setTime(time: number): void;
 pause(): void;
}

/** Keep speech playing uninterrupted; seek only when actually inside a gap. */
export function skipNonSpeech(player: SpeechPlayer, regions: readonly {start:number;end:number}[]): boolean {
 // A media seek is asynchronous. Let it finish before considering another jump.
 if (player.getMediaElement().seeking) return true;
 // Read the moving clock exactly once. A second reading could be later and
 // incorrectly trigger a backward seek on every animation frame during speech.
 const current = player.getCurrentTime();
 const next = nextSpeechTime(regions, current);
 if (next === null) {
  player.pause();
  const duration = player.getDuration();
  if (current < duration) player.setTime(duration);
  return false;
 }
 if (next > current) player.setTime(next);
 return true;
}
