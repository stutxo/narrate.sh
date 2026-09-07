// Reproduce the pinned player files without installing runtime dependencies.
import { mkdtemp, mkdir, writeFile, copyFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

const version = "3.8.4";
const integrity = "DrzLbK9Wol3zeiuZCleD9aUOl0KAaBHR9H6WVVVYPZ4Ya+LYxUFTgSF1jooHcMQCv96Ws96wCaZzIoP3bES8pQ==";
const destination = fileURLToPath(new URL("../vendor/plyr/", import.meta.url));
const temporary = await mkdtemp(join(tmpdir(), "narrate-plyr-"));
try {
  const response = await fetch(`https://registry.npmjs.org/plyr/-/plyr-${version}.tgz`);
  if (!response.ok) throw new Error(`Plyr download failed: ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (createHash("sha512").update(bytes).digest("base64") !== integrity) throw new Error("Plyr package integrity mismatch.");
  const archive = join(temporary, "package.tgz");
  await writeFile(archive, bytes);
  execFileSync("tar", ["xzf", archive, "-C", temporary]);
  await mkdir(destination, { recursive: true });
  for (const [source, target] of [["dist/plyr.min.mjs", "plyr.js"], ["dist/plyr.css", "plyr.css"], ["dist/plyr.svg", "plyr.svg"], ["LICENSE.md", "LICENSE.md"]]) {
    await copyFile(join(temporary, "package", source), join(destination, target));
  }
  console.log(`Vendored Plyr ${version} JS, CSS, SVG and MIT license.`);
} finally {
  await rm(temporary, { recursive: true, force: true });
}
