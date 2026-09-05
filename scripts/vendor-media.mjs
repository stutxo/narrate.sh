// Regenerate the small native audio encoder/MP4 muxer bundle: node scripts/vendor-media.mjs
import { mkdtemp, mkdir, writeFile, copyFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const version = '1.55.7';
const integrity = 'Sb/vI8frRiDPbPUwl3hz0n69NSe9yt4Nydcv5yxi8Rdgk0BgnujEGjZqE+uCTehFbafcqIu6gDAok8ln98dcqg==';
const directory = fileURLToPath(new URL('../vendor/media/', import.meta.url));
const temporary = await mkdtemp(join(tmpdir(), 'narrate-media-'));
try {
  const response = await fetch(`https://registry.npmjs.org/mediabunny/-/mediabunny-${version}.tgz`);
  if (!response.ok) throw new Error(`Media dependency download failed: HTTP ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (createHash('sha512').update(bytes).digest('base64') !== integrity) throw new Error('Media dependency checksum mismatch');
  await writeFile(join(temporary, 'package.tgz'), bytes);
  execFileSync('tar', ['xzf', join(temporary, 'package.tgz'), '-C', temporary]);
  await writeFile(join(temporary, 'entry.js'), `export { Output, NullTarget, Mp4OutputFormat, AudioSampleSource, AudioSample, Quality } from './package/dist/modules/src/index.js';\n`);
  await mkdir(directory, { recursive: true });
  execFileSync('npx', ['--yes', '--package=esbuild@0.25.11', 'esbuild', join(temporary, 'entry.js'),
    '--bundle', '--format=esm', '--target=es2022', '--minify', '--log-level=warning',
    '--banner:js=/*! Mediabunny 1.55.7; MPL-2.0; see NOTICE.md and LICENSE. */',
    `--outfile=${join(directory, 'runtime.js')}`], {
    stdio: 'inherit', env: { ...process.env, npm_config_cache: join(tmpdir(), 'narrate-npm-cache') },
  });
  await copyFile(join(temporary, 'package/LICENSE'), join(directory, 'LICENSE'));
} finally {
  await rm(temporary, { recursive: true, force: true });
}
