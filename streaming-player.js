import { Output, NullTarget, Mp4OutputFormat, AudioSampleSource, AudioSample, Quality } from './vendor/media/runtime.js?v=9';

export async function getStreamConfig() {
  const Source = globalThis.ManagedMediaSource || globalThis.MediaSource;
  if (!Source || !globalThis.AudioEncoder || !globalThis.AudioData) return null;
  for (const [codec, name] of [['aac', 'mp4a.40.2'], ['opus', 'opus']]) {
    const mime = `audio/mp4; codecs="${name}"`;
    try {
      if (Source.isTypeSupported(mime) && (await AudioEncoder.isConfigSupported({
        codec: name, sampleRate: 24000, numberOfChannels: 1, bitrate: 64000,
      })).supported) return { Source, codec, mime, fullCodecString: name };
    } catch { /* Try the next native codec. */ }
  }
  return null;
}

const stopped = () => new DOMException('Playback was stopped.', 'AbortError');
const covers = (ranges, start, end) => {
  for (let i = 0; i < ranges.length; i++) {
    // Allow timestamp rounding, never enough tolerance to skip a PCM sample.
    if (ranges.start(i) <= start + 1e-6 && ranges.end(i) >= end - 1e-6) return true;
  }
  return false;
};

// Saved PCM stays in IndexedDB. Only compressed fragments are retained here;
// the native decoder holds approximately 30 seconds behind / 60 seconds ahead.
export class StreamingPlayer {
  constructor(audio, config, { position = 0, bufferSeconds = 0, onerror = () => {}, onready = () => {} } = {}) {
    this.audio = audio;
    this.config = config;
    this.position = Math.max(0, position);
    this.bufferSeconds = bufferSeconds;
    this.buffering = bufferSeconds > 0;
    this.onerror = onerror;
    this.onready = onready;
    this.duration = 0;
    this.fragments = [];
    this.inputs = Promise.resolve();
    this.events = new AbortController();
    this.aborted = new Promise((_, reject) => { this.abort = reject; });
    this.aborted.catch(() => {});
    this.source = new config.Source();
    this.url = URL.createObjectURL(this.source);
    this.ready = this.alive(this.open());
    this.ready.catch(error => this.fail(error));
    const queue = () => { void this.queue(); };
    for (const event of ['timeupdate', 'play', 'ratechange']) audio.addEventListener(event, queue, { signal: this.events.signal });
    audio.addEventListener('seeking', () => {
      // Seeking is an explicit request to hear a position that is already ready.
      this.buffering = false;
      if (!this.primed) this.position = audio.currentTime;
      queue();
    }, { signal: this.events.signal });
    audio.addEventListener('waiting', () => {
      const last = this.fragments.at(-1);
      // Refill only at the generated edge, not during a seek or decoder setup.
      if (this.primed && !audio.seeking && audio.currentTime >= (last?.end ?? last?.start ?? Infinity) - .5) {
        this.buffering = this.bufferSeconds > 0;
      }
      queue();
    }, { signal: this.events.signal });
    this.source.addEventListener('startstreaming', queue, { signal: this.events.signal });
    audio.addEventListener('error', () => {
      if (audio.error) this.fail(new Error(audio.error.message || 'The browser could not play the audio stream.'));
    }, { signal: this.events.signal });
    audio.disableRemotePlayback = true; // Local generated audio has no AirPlay URL.
    audio.src = this.url;
    audio.load();
  }

  alive(promise) { return Promise.race([promise, this.aborted]); }
  check() {
    if (this.disposed) throw stopped();
    if (this.error) throw this.error;
  }
  fail(error) {
    if (this.disposed || this.error) return;
    this.error = error;
    this.abort(error);
    this.onerror(error);
  }
  async open() {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('The streaming audio player could not start.')), 15000);
      this.source.addEventListener('sourceopen', () => { clearTimeout(timer); resolve(); }, { once: true });
      this.aborted.catch(error => { clearTimeout(timer); reject(error); });
    });
    this.check();
    this.buffer = this.source.addSourceBuffer(this.config.mime);
    for (const event of ['bufferedchange', 'updateend']) {
      this.buffer.addEventListener(event, () => { void this.queue(); }, { signal: this.events.signal });
    }
    let ftyp, moof, fragmentStart;
    this.output = new Output({
      target: new NullTarget(),
      format: new Mp4OutputFormat({
        fastStart: 'fragmented', minimumFragmentDuration: .5,
        onFtyp: data => { ftyp = data; },
        onMoov: data => { this.header = new Blob([ftyp, data]); void this.queue(); },
        onMoof: (data, _, timestamp) => { moof = data; fragmentStart = Math.max(0, timestamp); },
        onMdat: data => {
          if (this.disposed) return;
          const previous = this.fragments.at(-1);
          if (previous) previous.end = fragmentStart;
          this.fragments.push({ blob: new Blob([moof, data]), start: fragmentStart });
          void this.queue();
        },
      }),
    });
    // Match the probed SourceBuffer codec. At 24 kHz the library otherwise
    // chooses HE-AAC, even though this stream advertises AAC-LC.
    this.encoder = new AudioSampleSource({ codec: this.config.codec, fullCodecString: this.config.fullCodecString,
      quality: new Quality({ bitrate: 64000 }) });
    this.output.addAudioTrack(this.encoder);
    await this.output.start();
  }

  append(wav) {
    this.inputs = this.inputs.then(async () => {
      await this.ready;
      this.check();
      if (this.finished) throw new Error('This audio stream is already complete.');
      if (!(wav instanceof Blob) || wav.size <= 44) throw new Error('Saved audio is missing or invalid.');
      const bytes = await this.alive(wav.slice(44).arrayBuffer());
      this.check();
      if (!bytes.byteLength || bytes.byteLength % 2) throw new Error('The saved audio chunk is invalid.');
      const sample = new AudioSample({ data: new Uint8Array(bytes), format: 's16',
        sampleRate: 24000, numberOfChannels: 1, timestamp: this.duration });
      this.duration += bytes.byteLength / 48000;
      try { await this.alive(this.encoder.add(sample)); }
      finally { sample.close(); }
      await this.queue();
      this.check();
    });
    this.inputs.catch(error => this.fail(error));
    return this.alive(this.inputs);
  }

  async finish() {
    await this.alive(this.inputs);
    await this.ready;
    this.check();
    if (this.finished) return;
    if (!this.duration) { await this.output.cancel(); this.finished = true; return; }
    await this.alive(this.output.finalize());
    this.finished = true;
    await this.queue();
    this.check();
  }

  queue() {
    this.requested = true;
    if (this.work) return this.work;
    this.work = (async () => {
      await this.ready;
      while (this.requested && !this.disposed && !this.error) {
        this.requested = false;
        await this.pump();
      }
    })().catch(error => this.fail(error)).finally(() => { this.work = null; });
    return this.work;
  }

  async operation(method, ...args) {
    this.check();
    if (this.buffer.updating) await this.alive(new Promise(resolve => this.buffer.addEventListener('updateend', resolve, { once: true })));
    this.check();
    await this.alive(new Promise((resolve, reject) => {
      const done = () => { cleanup(); resolve(); };
      const failed = () => { cleanup(); reject(new Error('The browser could not buffer the audio.')); };
      const cleanup = () => {
        this.buffer.removeEventListener('updateend', done);
        this.buffer.removeEventListener('error', failed);
        this.buffer.removeEventListener('abort', failed);
      };
      this.buffer.addEventListener('updateend', done, { once: true });
      this.buffer.addEventListener('error', failed, { once: true });
      this.buffer.addEventListener('abort', failed, { once: true });
      try { this.buffer[method](...args); }
      catch (error) { cleanup(); reject(error); }
    }));
  }

  updateDuration() {
    if (this.source.readyState !== 'open' || this.buffer.updating) return;
    const ranges = this.buffer.buffered;
    const duration = Math.max(this.duration, ranges.length ? ranges.end(ranges.length - 1) : 0);
    if (this.source.duration !== duration) this.source.duration = duration;
  }

  alignStart() {
    const start = this.fragments[0]?.start;
    // Native AAC may begin just after zero. This also handles seeking back to 0.
    if (start > 0 && start <= .25 && this.audio.currentTime < start) this.audio.currentTime = start;
  }

  async pump() {
    if (!this.header) return;
    if (!this.initialized) {
      await this.operation('appendBuffer', await this.header.arrayBuffer());
      this.initialized = true;
    }
    this.updateDuration();
    if (this.buffering) {
      const last = this.fragments.at(-1);
      const end = last?.end ?? last?.start ?? 0;
      const time = this.primed ? this.audio.currentTime : this.position;
      // Hold playable fragments, not generation. Submitted PCM may still be in
      // the encoder, so use an emitted fragment boundary for the listening lead.
      if (!this.finished && end - time < this.bufferSeconds * this.audio.playbackRate) return;
      this.buffering = false;
    }
    if (!this.primed) {
      if (this.duration <= this.position && !this.finished) return;
      this.audio.currentTime = Math.min(this.position, Math.max(0, this.duration - .001));
      this.primed = true;
    }
    // MMS streaming events are network scheduling hints. These fragments are
    // already local; keep the bounded playback window available even between hints.
    this.alignStart();
    const time = this.audio.currentTime;
    const selected = this.fragments.filter(fragment => (fragment.end ?? this.duration) > time - 30 && fragment.start < time + 60);
    if (!selected.length) return;
    const from = selected[0].start, to = selected.at(-1).end ?? this.duration;
    const ranges = this.buffer.buffered;
    if (ranges.length && from > 0 && ranges.start(0) < from - .06) await this.operation('remove', 0, from);
    if (ranges.length && ranges.end(ranges.length - 1) > to + .06) await this.operation('remove', to, ranges.end(ranges.length - 1));
    for (const fragment of selected) {
      this.check();
      const end = fragment.end ?? this.duration;
      if (!covers(this.buffer.buffered, fragment.start, end)) {
        await this.operation('appendBuffer', await this.alive(fragment.blob.arrayBuffer()));
        if (fragment === this.fragments[0] && this.buffer.buffered.length) {
          const start = this.buffer.buffered.start(0);
          if (start > .25) throw new Error('The browser could not play the start of the audio stream.');
          fragment.start = start;
        }
        if (fragment.end === undefined && this.buffer.buffered.length) fragment.end = this.buffer.buffered.end(this.buffer.buffered.length - 1);
      }
    }
    this.alignStart();
    this.updateDuration();
    if (!this.notified && covers(this.audio.buffered, this.audio.currentTime, Math.min(this.duration, this.audio.currentTime + .1))) {
      this.notified = true;
      this.onready();
    }
    if (this.finished && !this.buffer.updating && this.source.readyState === 'open' && covers(this.buffer.buffered, Math.max(0, this.duration - .1), this.duration)) {
      this.source.endOfStream();
    }
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.events.abort();
    this.abort(stopped());
    void this.output?.cancel().catch(() => {});
    if (this.source.readyState === 'open' && this.buffer?.updating) this.buffer.abort();
    if (this.audio.src === this.url) {
      this.audio.pause();
      this.audio.removeAttribute('src');
      this.audio.load();
    }
    URL.revokeObjectURL(this.url);
    this.fragments.length = 0;
  }
}
