// Palmera Bay — an open-world crime game for make.fun's "Make GTA 6" bounty.
//
// This file is only the hand-in plumbing (Node 22, standard library only). It
// takes the finished game in game/ and its screenshots in screenshots/ from
// this repository, lays them out in the output directory, and asks the
// vendored make.fun library to summarise them into dossier.json, the text the
// judge reads. It never touches the game itself.
//
// In the grader the output directory is /output. Anywhere else,
// MAKEFUN_OUTPUT_DIR stands in for it:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

// The repository root is the directory this file lives in.
const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// The gate's own caps, as the bounty states them: the dossier text holds at
// most 160 KiB of source, at most four screenshots of at most 256 KiB each,
// and game/ holds at most 993 entries and 48 MiB, with no path over 1000 bytes.
const caps = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};

// Copy one top-level folder of the repository into the output directory,
// skipping it quietly when the repository does not have it.
function copyFolder(name: string): void {
  const from = path.join(repoRoot, name);
  if (!fs.existsSync(from)) return;
  fs.cpSync(from, path.join(outputDir, name), { recursive: true });
}

fs.mkdirSync(outputDir, { recursive: true });
copyFolder('game');
copyFolder('screenshots');

const dossier = buildDossier(outputDir, caps);
fs.writeFileSync(path.join(outputDir, 'dossier.json'), dossier);
console.log(`wrote dossier.json (${dossier.length} bytes) to ${outputDir}`);
