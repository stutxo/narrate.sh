#!/usr/bin/env node
// Development-only scheduling experiment; this does not change the app's policy.
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const HANDOFF_SECONDS = .08, FRAGMENT_SECONDS = .5;
export const methodology = [
  'Simulation, not a phone benchmark or a prediction of audible Safari behavior.',
  'Measured traces replay recorded PCM arrival times; synthetic cases use invented timings.',
  'Assume 80 ms PCM save/encode handoff and hold the final 0.5 s MP4 fragment until more audio or completion.',
  'Both policies use the same arrivals and initial playback rate; finish releases short final audio. No competing inference is modeled.',
  'Reject control/background changes before the last PCM arrival. Ignore later controls and native source handoff: they cannot change already measured arrivals; comparison assumes the initial rate continues.',
  'Adaptive is an experimental estimate: after two samples, use the slowest of the last three generation times per character (40-character denominator floor) and longest of the next two chunks; apply 1.5× margin + 1 s, bounded to 4–10 listening seconds.',
  'Require 30% generation headroom at the selected rate; use fixed10 after any underrun. Future slowdown remains unpredictable.',
];
const requireValue = (condition, message) => { if (!condition) throw new Error(`Unsupported trace: ${message}`); };
const finite = value => typeof value === 'number' && Number.isFinite(value);
const positive = value => finite(value) && value > 0;

export function readDiagnostics(data) {
  requireValue(data?.schema === 1, 'expected diagnostics schema 1.');
  requireValue(data.outcome === 'ready' && data.activeBufferWait === false, 'save timings after successful generation and playback begins.');
  requireValue(data.resumedPassages === 0, 'resumed sessions include audio outside this recording.');
  requireValue(data.hiddenAtStart === false, 'capture a fresh foreground run with current diagnostics (hiddenAtStart is required).');
  requireValue(data.omittedRecords === 0, 'records were omitted.');
  requireValue(positive(data.playbackRate), 'playbackRate must be a positive finite number.');
  requireValue(positive(data.generationFinishedMs) && positive(data.firstPlayingEventMs) && positive(data.firstPlaybackMs)
    && data.firstPlaybackMs >= data.firstPlayingEventMs, 'generation and first playback must be recorded.');
  requireValue(finite(data.elapsedMs) && data.elapsedMs >= Math.max(data.generationFinishedMs, data.firstPlaybackMs), 'inconsistent elapsed time.');
  requireValue(Number.isInteger(data.passages) && data.passages > 0 && data.returnedPassages === data.passages
    && Array.isArray(data.chunks) && data.chunks.length === data.passages, 'all planned chunks must be present.');
  requireValue(data.chunks.every(chunk => chunk && typeof chunk === 'object'), 'invalid chunk record.');
  requireValue(Array.isArray(data.events) && data.events.length > 0, 'playback events are missing.');
  let eventTime = 0;
  for (const event of data.events) {
    requireValue(event && typeof event.type === 'string', 'invalid playback event.');
    requireValue(finite(event.atMs) && event.atMs >= eventTime && event.atMs <= data.elapsedMs, 'event times must be ordered and within the recording.');
    eventTime = event.atMs;
    if (event.atMs > data.chunks.at(-1).atMs) continue;
    requireValue(event.hidden === false, 'backgrounded sessions are not modeled.');
    requireValue(event.playbackRate === data.playbackRate, 'playback-rate changes are not modeled.');
    // Native priming skips at most 0.25 s; diagnostics rounds positions to 0.1 s.
    const initialSeek = ['seeking', 'seeked'].includes(event.type) && finite(event.positionSeconds)
      && event.positionSeconds >= 0 && event.positionSeconds <= .3
      && event.atMs <= data.firstPlayingEventMs;
    requireValue(initialSeek || !['pause', 'seeking', 'seeked', 'error'].includes(event.type), 'pause, seek, or media-error events are not modeled (initial native leading-gap seek is allowed).');
  }
  let previousTime = 0;
  const ids = new Set();
  const chunks = data.chunks.map(chunk => {
    requireValue(Number.isInteger(chunk.id) && !ids.has(chunk.id), 'chunk ids must be unique integers.');
    ids.add(chunk.id);
    requireValue(Number.isInteger(chunk.sourceCharacters) && chunk.sourceCharacters > 0, 'each chunk needs sourceCharacters; older timing exports cannot forecast text length.');
    requireValue(positive(chunk.atMs) && chunk.atMs > previousTime && chunk.atMs <= data.generationFinishedMs, 'chunk arrivals must be ordered and precede completion.');
    requireValue(positive(chunk.audioSeconds) && positive(chunk.requestMs), 'audio durations and request timings must be positive.');
    const timing = chunk.timings;
    requireValue(timing && finite(timing.initMs) && timing.initMs >= 0 && positive(timing.generationMs)
      && positive(timing.totalMs), 'each chunk needs complete worker timings.');
    requireValue(timing.totalMs + 1 >= timing.initMs + timing.generationMs && chunk.requestMs + 1 >= timing.totalMs
      && chunk.atMs + 1 >= chunk.requestMs, 'worker timing accounting is inconsistent.');
    requireValue(chunk.synthesisRate === data.chunks[0].synthesisRate && positive(chunk.synthesisRate), 'synthesis-rate changes are not modeled.');
    previousTime = chunk.atMs;
    return { arrival: chunk.atMs / 1000 + HANDOFF_SECONDS, audio: chunk.audioSeconds,
      generation: timing.generationMs / 1000, characters: chunk.sourceCharacters };
  });
  return { name: 'recorded arrivals', rate: data.playbackRate, chunks,
    finished: Math.max(data.generationFinishedMs / 1000, chunks.at(-1).arrival) };
}

// The forecast is a heuristic; it is never substituted for measured arrival times.
function reserve(chunks, count, rate, policy, stalls) {
  if (policy === 'fixed10' || count < 2 || stalls) return 10;
  const recent = chunks.slice(Math.max(0, count - 3), count);
  if (recent.some(chunk => chunk.audio / chunk.generation < rate * 1.3)) return 10;
  const nextLength = Math.max(chunks[count]?.characters ?? 0, chunks[count + 1]?.characters ?? 0);
  const estimate = Math.max(...recent.map(chunk => chunk.generation / Math.max(40, chunk.characters))) * nextLength;
  return Math.max(4, Math.min(10, 1.5 * estimate + 1));
}

export function simulate(trace, policy) {
  if (!['fixed10', 'adaptive'].includes(policy)) throw new Error('Unknown buffer policy.');
  const { chunks, rate } = trace;
  let time = 0, position = 0, duration = 0, end = 0, count = 0;
  let holding = true, finished = false, playing = false, startup = null, waitStart = null, wait = 0, stalls = 0;
  const events = chunks.map(chunk => ({ at: chunk.arrival, chunk }));
  events.push({ at: trace.finished });
  for (const event of events) {
    if (playing) {
      const exhausted = time + (end - position) / rate;
      if (exhausted < event.at - 1e-9) {
        position = end; playing = false; holding = true; stalls++; waitStart = exhausted;
      } else position += (event.at - time) * rate;
    }
    time = event.at;
    if (event.chunk) { count++; duration += event.chunk.audio; }
    else finished = true;
    end = Math.max(position, duration - (finished ? 0 : Math.min(FRAGMENT_SECONDS, duration)));
    if (holding && (finished || end - position >= reserve(chunks, count, rate, policy, stalls) * rate)) holding = false;
    if (!holding && end - position > 1e-9) {
      playing = true;
      startup ??= time;
      if (waitStart !== null) { wait += time - waitStart; waitStart = null; }
    }
  }
  return { policy, startup, stalls, wait, completion: time + (end - position) / rate, audio: duration };
}

export function syntheticTraces() {
  const repeat = (count, characters, audio, generation) => Array.from({ length: count }, () => ({ characters, audio, generation }));
  const cases = {
    'fast uniform': repeat(30, 160, 8, 1.4),
    'tiny opener then long': [...repeat(1, 12, .8, .25), ...repeat(29, 180, 10, 2.5)],
    'short sentences': repeat(30, 70, 3, .7),
    'near sustainable limit': repeat(30, 180, 9, 5.5),
    'slow throughout': repeat(30, 180, 9, 8),
    'unexpected slow second': [...repeat(1, 160, 8, 1.4), ...repeat(1, 160, 8, 12), ...repeat(28, 160, 8, 2)],
    'unexpected slow third': [...repeat(2, 90, 4.5, .8), ...repeat(1, 90, 4.5, 12), ...repeat(27, 90, 4.5, 1)],
    'sustained slowdown': [...repeat(5, 160, 8, 1.4), ...repeat(10, 160, 8, 3.8), ...repeat(30, 160, 8, 7)],
  };
  return Object.entries(cases).flatMap(([name, values]) => [1, 1.5, 2].map(rate => {
    let arrival = 3;
    const chunks = values.map(chunk => { arrival += chunk.generation; return { ...chunk, arrival: arrival + HANDOFF_SECONDS }; });
    return { name, rate, chunks, finished: chunks.at(-1).arrival };
  }));
}

export function compare(traces) {
  return traces.flatMap(trace => ['fixed10', 'adaptive'].map(policy => ({ trace: trace.name, rate: trace.rate, ...simulate(trace, policy) })));
}

async function main(args) {
  let filename, json = false;
  for (let index = 0; index < args.length; index++) {
    if (args[index] === '--json') json = true;
    else if (args[index] === '--trace' && args[index + 1] && !args[index + 1].startsWith('--')) filename = args[++index];
    else if (args[index] === '--help') { console.log('Usage: node scripts/benchmark-buffer.mjs [--trace narrate-timings.json] [--json]'); return; }
    else throw new Error(`Unknown or incomplete argument: ${args[index]}`);
  }
  const traces = filename ? [readDiagnostics(JSON.parse(await readFile(filename, 'utf8')))] : syntheticTraces();
  const output = { input: filename ? 'measured arrivals' : 'synthetic traces', methodology, results: compare(traces) };
  if (json) console.log(JSON.stringify(output, null, 2));
  else {
    console.log(methodology.join('\n') + '\nAll times below are simulated seconds.\n');
    console.table(output.results.map(row => Object.fromEntries(Object.entries(row).map(([key, value]) =>
      [key, typeof value === 'number' ? Math.round(value * 100) / 100 : value]))));
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 1; });
}
