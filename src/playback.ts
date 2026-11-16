/** Return the current time inside speech, the next speech start in a gap,
 * or null when no speech remains. Regions must be sorted and non-overlapping. */
export function nextSpeechTime(regions: readonly {start:number;end:number}[], time:number):number|null {
 let lo=0,hi=regions.length;
 while(lo<hi){const mid=(lo+hi)>>>1;if(regions[mid].end<=time)lo=mid+1;else hi=mid;}
 return lo===regions.length?null:Math.max(time,regions[lo].start);
}
