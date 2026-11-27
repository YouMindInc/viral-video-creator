#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const template = 'templates/editorial-explainer';
const help = `Usage: pnpm clean:editorial-explainer [options]

Default: remove this template's SAM2 work files, video preview caches,
saved checks/snapshots, and incomplete processing files.
Keep source/imported footage, subtitles, settings, prepared cutouts, and renders.

  --dry-run    List the cleanup without deleting anything
  --prepared   Also remove prepared cutouts, SAM2 samples, generated posters,
               and the built composition (preview/build will rebuild it)
  --renders    Also remove this template's output runs, including MP4s and backups
  --help       Show this help

Options can be combined. Models, dependencies, and other templates are kept.
Stop preview, rendering, and standalone SAM2 commands before cleaning.
`;

const inside = (parent, child) => child === parent || child.startsWith(parent + path.sep);
function stat(file) {
  try { return fs.lstatSync(file); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

// Validate every path component before reading a directory or removing a target.
// In particular, a linked assets/ or renders/ folder must never widen the cleanup.
function checkedPath(repo, relative) {
  const file = path.resolve(repo, relative);
  if (file === repo || !inside(repo, file)) throw new Error('Cleanup path is outside the repository: ' + relative);
  let cursor = repo;
  for (const part of path.relative(repo, file).split(path.sep)) {
    cursor = path.join(cursor, part);
    if (stat(cursor)?.isSymbolicLink()) throw new Error('Refusing to clean through a symbolic link: ' + cursor);
  }
  return file;
}

function size(file) {
  const info = fs.lstatSync(file);
  if (info.isSymbolicLink()) return 0; // Never follow links inside a disposable directory.
  if (!info.isDirectory()) return info.size;
  return fs.readdirSync(file).reduce((total, name) => total + size(path.join(file, name)), 0);
}
function bytes(count) {
  if (count < 1024) return count + ' B';
  if (count < 1024 ** 2) return (count / 1024).toFixed(1) + ' KiB';
  return (count / 1024 ** 2).toFixed(1) + ' MiB';
}
function context(repoRoot) {
  const repo = fs.realpathSync(repoRoot);
  const configFile = checkedPath(repo, template + '/template.json');
  const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
  if (!config.persona || !config.visual) throw new Error('Invalid template.json; nothing has been cleaned.');
  // Protect configured inputs even if someone deliberately placed one in a cache/output folder.
  const protectedFiles = [configFile];
  for (const value of [config.persona.source, config.visual.video, config.visual.poster, config.captions]) {
    if (!value) continue;
    if (typeof value !== 'string' || path.isAbsolute(value)) throw new Error('Invalid material path in template.json.');
    const file = path.resolve(repo, template, value);
    if (!inside(path.join(repo, template), file)) throw new Error('Material path escapes the template: ' + value);
    protectedFiles.push(file);
    if (fs.existsSync(file)) protectedFiles.push(fs.realpathSync(file));
  }
  return { repo, protectedFiles };
}

export function planCleanup({ repoRoot = repository, prepared = false, renders = false } = {}) {
  const { repo, protectedFiles } = context(repoRoot);
  const candidates = new Set([
    '.cache/sam2', '.transcode-cache', '.waveform-cache', '.hyperframes/preview',
    '.hyperframes/artifacts/checks', '.hyperframes/artifacts/snapshots', 'index.html.tmp'
  ].map(relative => template + '/' + relative));
  const collect = (relative, match) => {
    const directory = checkedPath(repo, template + '/' + relative);
    if (!stat(directory)?.isDirectory()) return;
    for (const name of fs.readdirSync(directory)) if (match(name)) candidates.add(template + '/' + relative + '/' + name);
  };
  collect('assets/persona', name => name.startsWith('.preparing-') || name.endsWith('.partial.webm'));
  collect('assets/inputs', name => /^\.upload-[\da-f-]+\.(mp4|mov|m4v|webm|srt)$/i.test(name));
  if (prepared) {
    for (const relative of ['index.html', 'analysis/hyperframes-build.json', 'assets/vendor/gsap.min.js',
      'assets/persona/prepared.json', 'assets/persona/sam2-tests.json', 'assets/persona/sam2-tests',
      'assets/persona/scene.mp4', 'assets/persona/cutout.webm']) candidates.add(template + '/' + relative);
    collect('assets/persona', name => /^sam2-[\da-f]{16}\.webm$/i.test(name));
    collect('assets/visuals/posters', name => /^[\da-f]{16}\.jpg$/i.test(name));
  }
  if (renders) {
    candidates.add('renders/editorial-explainer');
    candidates.add(template + '/renders');
  }
  const items = [], kept = [];
  for (const relative of [...candidates].sort()) {
    const file = checkedPath(repo, relative);
    if (!stat(file)) continue;
    if (protectedFiles.some(input => inside(file, input) || inside(input, file))) {
      kept.push(relative); continue;
    }
    items.push({ relative, bytes: size(file) });
  }
  return { repo, items, kept, bytes: items.reduce((total, item) => total + item.bytes, 0) };
}

function lockGenerator(repo) {
  // Share generate's lock so a cleanup cannot remove its active SAM2 work directory.
  const lock = checkedPath(repo, template + '/.cache/generate.lock');
  if (stat(lock)) {
    const pid = Number(fs.readFileSync(lock, 'utf8'));
    if (!Number.isInteger(pid) || pid <= 0) throw new Error('Invalid generator lock; nothing has been cleaned: ' + lock);
    let alive = true;
    try { process.kill(pid, 0); } catch (error) { if (error.code === 'ESRCH') alive = false; }
    if (alive) throw new Error('A generator is still running. Wait for it to finish or stop it before cleaning.');
    fs.unlinkSync(lock);
  }
  fs.mkdirSync(path.dirname(lock), { recursive: true });
  fs.writeFileSync(lock, String(process.pid), { flag: 'wx' });
  return () => fs.unlinkSync(lock);
}

export function clean(options = {}, log = console.log) {
  const { repo } = context(options.repoRoot || repository);
  const release = options.dryRun ? () => {} : lockGenerator(repo);
  try {
    const plan = planCleanup(options); // Resolve the complete plan before deleting anything.
    log(`${options.dryRun ? 'Dry run' : 'Cleanup'}: ${plan.items.length} item(s), ${bytes(plan.bytes)} of files.`);
    for (const item of plan.items) {
      const file = checkedPath(repo, item.relative);
      if (!options.dryRun) fs.rmSync(file, { recursive: true, force: true });
      log(`  ${options.dryRun ? 'Would remove' : 'Removed'} ${item.relative} (${bytes(item.bytes)})`);
    }
    for (const relative of plan.kept) log('  Kept (referenced by template.json): ' + relative);
    log('Source/imported footage, subtitles, settings, models, dependencies, and other templates are kept.');
    if (!options.prepared) log('Prepared cutouts are kept; use --prepared to clear them too.');
    if (!options.renders) log('Output runs are kept; use --renders to delete them too.');
    if (options.prepared && !options.dryRun) log('Next: pnpm preview:editorial-explainer to rebuild. SAM2 needs preparing again for the cutout effect.');
    return plan;
  } finally { release(); }
}

export function main(argv = process.argv.slice(2)) {
  const { values } = parseArgs({ args: argv.filter(arg => arg !== '--'), options: {
    help: { type: 'boolean' }, 'dry-run': { type: 'boolean' }, prepared: { type: 'boolean' }, renders: { type: 'boolean' }
  } });
  if (values.help) { console.log(help); return; }
  return clean({ dryRun: values['dry-run'], prepared: values.prepared, renders: values.renders });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
