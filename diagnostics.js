// Opt-in, local-only timing data. Never retain narration text or audio here.
export function setupDiagnostics(audio) {
  const panel = document.createElement('details');
  panel.id = 'diagnostics';
  panel.style.cssText = 'margin-top:18px;overflow-wrap:anywhere';
  panel.innerHTML = '<summary>Playback timings</summary><p>Local measurements only. Playback progress does not prove that sound reached the speaker. Native waits can include background interruptions.</p><pre style="white-space:pre-wrap"></pre><button type="button">Save timings</button>';
  document.querySelector('main').append(panel);
  const output = panel.querySelector('pre');
  let run, probe, waiting, environment = {};
  const now = () => performance.now();
  const round = number => Math.round(number * 10) / 10;
  const elapsed = () => round(now() - run.started);
  const bounded = (list, item) => { if (list.length < 2000) list.push(item); else run.omittedRecords++; };
  const endWait = reason => {
    if (!waiting) return;
    const durationMs = round(now() - waiting.started);
    run.bufferWaitMs += durationMs;
    bounded(run.waits, { atMs: waiting.atMs, durationMs, endedBy: reason });
    waiting = null;
  };
  const snapshot = () => {
    if (!run) return { schema: 1, environment };
    const { started, ...data } = run;
    return { schema: 1, environment, ...data,
      elapsedMs: elapsed(), bufferWaitMs: round(run.bufferWaitMs + (waiting ? now() - waiting.started : 0)),
      activeBufferWait: Boolean(waiting),
    };
  };
  const render = () => {
    if (!run) { output.textContent = 'Start a narration to record timings.'; return; }
    output.textContent = [
      `Passages returned: ${run.returnedPassages}`,
      `First playback progress: ${run.firstPlaybackMs === null ? 'waiting' : (run.firstPlaybackMs / 1000).toFixed(2) + ' s'}`,
      `Worker initialization: ${(run.initMs / 1000).toFixed(2)} s`,
      `Generation (setup excluded): ${run.generationMs ? (run.audioSeconds / (run.generationMs / 1000)).toFixed(2) + ' audio seconds / second' : 'waiting'}`,
      `Native waits after playback: ${(snapshot().bufferWaitMs / 1000).toFixed(2)} s`,
      `State: ${run.outcome}`,
    ].join('\n');
  };
  const event = type => {
    if (!run) return;
    bounded(run.events, { type, atMs: elapsed(), positionSeconds: round(audio.currentTime),
      playbackRate: audio.playbackRate, readyState: audio.readyState, hidden: document.hidden });
  };
  audio.addEventListener('playing', () => {
    if (!run) return;
    probe = { position: audio.currentTime };
    run.firstPlayingEventMs ??= elapsed();
    endWait('playing'); event('playing'); render();
  });
  audio.addEventListener('timeupdate', () => {
    if (!run || run.firstPlaybackMs !== null || !probe || audio.paused || audio.seeking) return;
    if (audio.currentTime > probe.position + .01) {
      run.firstPlaybackMs = elapsed();
      event('first-playback-progress'); render();
    }
  });
  audio.addEventListener('waiting', () => {
    if (!run) return;
    event('waiting');
    if (run.firstPlaybackMs !== null && !waiting && !audio.paused && !audio.seeking) {
      waiting = { started: now(), atMs: elapsed() };
    }
    render();
  });
  for (const type of ['pause', 'seeking', 'ended', 'emptied', 'error']) audio.addEventListener(type, () => {
    if (!run) return;
    endWait(type); probe = null; event(type); render();
  });
  for (const type of ['play', 'seeked', 'ratechange']) audio.addEventListener(type, () => { event(type); });
  document.addEventListener('visibilitychange', () => { event('visibilitychange'); });
  panel.querySelector('button').onclick = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(snapshot(), null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url; link.download = 'narrate-timings.json'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  render();
  return {
    snapshot,
    environment(value) {
      environment = { userAgent: navigator.userAgent, isolated: crossOriginIsolated,
        mediaSource: 'ManagedMediaSource' in globalThis ? 'managed' : 'MediaSource' in globalThis ? 'standard' : null,
        ...value };
    },
    start({ passages, resumedPassages, playbackRate }) {
      waiting = probe = null;
      run = { started: now(), recordedAt: new Date().toISOString(), hiddenAtStart: document.hidden, passages, resumedPassages, playbackRate,
        firstPlayingEventMs: null, firstPlaybackMs: null, generationFinishedMs: null, outcome: 'generating',
        returnedPassages: 0, initMs: 0, generationMs: 0, audioSeconds: 0,
        bufferWaitMs: 0, chunks: [], waits: [], events: [], omittedRecords: 0 };
      render();
    },
    chunk({ id, pcm, sampleRate, metrics }, requestMs, sourceCharacters) {
      if (!run) return;
      const audioSeconds = pcm.byteLength / (2 * sampleRate);
      run.returnedPassages++;
      // Returned passages can include one lookahead result discarded by Stop.
      run.audioSeconds += audioSeconds;
      run.initMs += metrics?.initMs || 0;
      run.generationMs += metrics?.generationMs || 0;
      bounded(run.chunks, { id, atMs: elapsed(), audioSeconds,
        sourceCharacters,
        synthesisRate: metrics?.synthesisRate ?? 1, requestMs: round(requestMs),
        timings: metrics ? { initMs: round(metrics.initMs), generationMs: round(metrics.generationMs), totalMs: round(metrics.totalMs) } : null });
      render();
    },
    finish(outcome) { if (run) { endWait(outcome); run.outcome = outcome; run.generationFinishedMs = elapsed(); render(); } },
    clear() { waiting = probe = run = null; render(); },
  };
}
