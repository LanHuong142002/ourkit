#!/usr/bin/env node
// Minimal Installer: copies every Stage into the project through the Host Shell.
// Deterministic by design (ADR 0005). Questions and Role selection arrive in #9, `upgrade` in #10.
const fs = require('fs');
const path = require('path');

const KIT_ROOT = path.join(__dirname, '..');
const projectDir = path.resolve(process.argv[2] || process.cwd());

const shell = JSON.parse(
  fs.readFileSync(path.join(KIT_ROOT, 'hosts', 'claude-code', 'shell.json'), 'utf8'),
);
const stagesDir = path.join(KIT_ROOT, 'stages');
const stages = fs.readdirSync(stagesDir);

const targetOf = (stage) => path.join(projectDir, shell.stagesDir, stage);

// Check everything first so a refusal never leaves a partial install.
const existing = stages.filter((stage) => fs.existsSync(targetOf(stage)));
if (existing.length > 0) {
  console.error(`ourkit: already installed in ${projectDir}: ${existing.join(', ')}`);
  process.exit(1);
}

for (const stage of stages) {
  fs.cpSync(path.join(stagesDir, stage), targetOf(stage), { recursive: true });
  console.log(`ourkit: installed ${path.join(shell.stagesDir, stage)}`);
}
