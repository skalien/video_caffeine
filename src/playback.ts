export type SpeechRegion = {start: number; end: number};
export type ScheduledClip = {offset: number; duration: number; at: number};

/** Quantize boundaries to the original buffer's samples, without adding padding. */
export function planSpeech(regions: readonly SpeechRegion[], from: number, sampleRate: number, length: number): ScheduledClip[] {
 const clips: ScheduledClip[] = [];
 let outputSamples = 0;
 const fromSample = Math.max(0, Math.round(from * sampleRate));
 for (const region of regions) {
  const start = Math.max(fromSample, Math.round(region.start * sampleRate), 0);
  const end = Math.min(length, Math.round(region.end * sampleRate));
  if (end <= start) continue;
  clips.push({offset: start / sampleRate, duration: (end - start) / sampleRate, at: outputSamples / sampleRate});
  outputSamples += end - start;
 }
 return clips;
}

export function sourcePosition(clips: readonly ScheduledClip[], elapsed: number): number {
 if (!clips.length) return 0;
 let lo = 0, hi = clips.length;
 while (lo < hi) {
  const mid = (lo + hi) >>> 1;
  if (clips[mid].at + clips[mid].duration <= elapsed) lo = mid + 1;
  else hi = mid;
 }
 const clip = clips[Math.min(lo, clips.length - 1)];
 return clip.offset + Math.max(0, Math.min(clip.duration, elapsed - clip.at));
}

/** Audio runs on the audio clock; animation frames only read the source position. */
export class SpeechPlayback {
 private nodes: AudioBufferSourceNode[] = [];
 private clips: ScheduledClip[] = [];
 private startedAt: number | null = null;
 private generation = 0;
 private position = 0;
 active = false;
 constructor(private context: AudioContext) {}

 get currentTime(): number {
  return this.active && this.startedAt !== null
   ? sourcePosition(this.clips, this.context.currentTime - this.startedAt)
   : this.position;
 }

 pause(): number {
  this.position = this.currentTime;
  this.active = false;
  this.generation++;
  for (const node of this.nodes) {
   node.onended = null;
   try {node.stop();} catch { /* A failed start may leave a node unstarted. */ }
   node.disconnect();
  }
  this.nodes = [];
  this.startedAt = null;
  return this.position;
 }

 async play(buffer: AudioBuffer, regions: readonly SpeechRegion[], from: number): Promise<boolean> {
  this.pause();
  const generation = this.generation;
  this.position = from;
  this.clips = planSpeech(regions, from, buffer.sampleRate, buffer.length);
  if (!this.clips.length) {this.position = buffer.duration; return false;}
  this.active = true;
  try {
   // Called directly from the user's play/click handler to unlock macOS audio.
   await this.context.resume();
   if (generation !== this.generation) return false;
   // Prepare every node before choosing the clock origin. Every node shares the
   // original multichannel buffer; no additional edited audio buffer is copied.
   this.nodes = this.clips.map(() => {
    const node = this.context.createBufferSource();
    node.buffer = buffer;
    node.connect(this.context.destination);
    return node;
   });
   this.startedAt = this.context.currentTime + 0.1;
   this.nodes.forEach((node, index) => {
    const clip = this.clips[index];
    node.onended = () => {
     node.disconnect();
     if (generation === this.generation && index === this.clips.length - 1) {
      this.position = buffer.duration;
      this.active = false;
      this.startedAt = null;
      this.nodes = [];
     }
    };
    node.start(this.startedAt! + clip.at, clip.offset, clip.duration);
   });
   return true;
  } catch (error) {
   if (generation === this.generation) this.pause();
   throw error;
  }
 }

 dispose(): void {
  this.pause();
  void this.context.close();
 }
}
