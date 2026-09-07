import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compare, readDiagnostics, simulate, syntheticTraces } from './benchmark-buffer.mjs';

function diagnostics() {
  return { schema: 1, outcome: 'ready', activeBufferWait: false, resumedPassages: 0, hiddenAtStart: false,
    omittedRecords: 0, playbackRate: 1.5, generationFinishedMs: 2400, firstPlayingEventMs: 2000, firstPlaybackMs: 2500, elapsedMs: 2600,
    passages: 2, returnedPassages: 2, events: [{ type: 'playing', atMs: 2000, hidden: false, playbackRate: 1.5 }],
    chunks: [1000, 2300].map((atMs, index) => ({ id: index + 1, atMs, audioSeconds: 3, requestMs: 900,
      sourceCharacters: 60, synthesisRate: 1, timings: { initMs: 0, generationMs: 850, totalMs: 880 } })) };
}

test('recorded arrivals are preserved independently of the forecast', () => {
  const data = diagnostics();
  data.events.unshift({ type: 'seeking', atMs: 100, positionSeconds: .3, hidden: false, playbackRate: 1.5 },
    { type: 'seeked', atMs: 110, positionSeconds: .3, hidden: false, playbackRate: 1.5 });
  const trace = readDiagnostics(data);
  assert.deepEqual(trace.chunks.map(chunk => chunk.arrival), [1.08, 2.38]);
  assert.equal(trace.finished, 2.4);
  assert.equal(trace.chunks[1].generation, .85);
  assert.equal(trace.chunks[1].characters, 60);
});

test('post-arrival controls and managed-source handoff do not change measured inputs', () => {
  const data = diagnostics(), before = readDiagnostics(data);
  data.events.push({ type: 'emptied', atMs: 2350, hidden: false, playbackRate: 1 },
    { type: 'seeking', atMs: 2380, hidden: false, playbackRate: 1.5, positionSeconds: 2 },
    { type: 'ratechange', atMs: 2450, hidden: false, playbackRate: 2 },
    { type: 'pause', atMs: 2500, hidden: true, playbackRate: 2 });
  assert.deepEqual(readDiagnostics(data), before);
});

test('unsupported diagnostic recordings fail explicitly', () => {
  const invalid = [
    data => { data.outcome = 'stopped'; },
    data => { data.returnedPassages--; },
    data => { data.resumedPassages = 1; },
    data => { delete data.hiddenAtStart; },
    data => { data.hiddenAtStart = true; },
    data => { data.omittedRecords = 1; },
    data => { data.events[0].hidden = true; },
    data => { data.events[0].playbackRate = 2; },
    data => { data.events[0].type = 'pause'; },
    data => { data.events[0].type = 'seeking'; },
    data => { data.chunks[1].atMs = 900; },
    data => { data.chunks[1].id = 1; },
    data => { data.chunks[1] = null; },
    data => { data.events[0] = null; },
    data => { delete data.chunks[0].sourceCharacters; },
    data => { data.chunks[0].timings.generationMs = 950; },
    data => { data.chunks[0].audioSeconds = 0; },
    data => { data.chunks[0].sourceCharacters = 2.5; },
    data => { data.chunks[1].synthesisRate = 2; },
    data => { data.firstPlaybackMs = null; },
  ];
  for (const change of invalid) {
    const data = diagnostics(); change(data);
    assert.throws(() => readDiagnostics(data), /Unsupported trace:/, change.toString());
  }
});

test('playback accounting includes starvation and releases a short final clip', () => {
  const chunk = { audio: 15, generation: 1, characters: 180 };
  const result = simulate({ rate: 1, chunks: [{ ...chunk, arrival: 1 }, { ...chunk, arrival: 21 }], finished: 21 }, 'fixed10');
  assert.equal(result.startup, 1);
  assert.equal(result.stalls, 1);
  assert.equal(result.wait, 5.5); // First fragment ends at15.5; next PCM arrives at21.
  assert.equal(result.completion, result.startup + result.audio + result.wait);
  const short = simulate({ rate: 2, chunks: [{ ...chunk, audio: .2, arrival: 1 }], finished: 2 }, 'fixed10');
  assert.equal(short.startup, 2, 'Finalization must release speech shorter than one fragment or reserve.');
  assert.equal(short.completion, 2.1);
  assert.equal(short.stalls, 0);
});

test('all synthetic traces conserve time and expose the adaptive slowdown tradeoff', () => {
  const results = compare(syntheticTraces());
  assert.equal(results.length, 48);
  for (const row of results) {
    assert(Math.abs(row.completion - row.startup - row.audio / row.rate - row.wait) < 1e-8,
      `${row.trace} at${row.rate}× (${row.policy}) must account for all listening and waiting.`);
  }
  const surprise = results.filter(row => row.trace === 'unexpected slow third' && row.rate === 1.5);
  assert(surprise[1].startup < surprise[0].startup);
  assert(surprise[1].stalls > surprise[0].stalls, 'Earlier speculative release must not be reported as unconditionally better.');
});
