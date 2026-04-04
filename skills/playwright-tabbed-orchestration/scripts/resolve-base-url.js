#!/usr/bin/env node
/**
 * Resolution order for the site root URL (stdout is the final URL; consistent with the
 * implementation below and `--help`):
 *
 * 1. Environment variable `PLAYWRIGHT_BASE_URL`
 * 2. Under each **Git repo root**, read files in order: `.env.local` → `.env` → `playwright.env.local`
 *    (only the `PLAYWRIGHT_BASE_URL` key is recognised)
 *    Repo roots: walk up from `process.cwd()` to find the first `.git`, then walk up from this
 *    skill's install directory to find a second root (deduplicated);
 *    **the cwd root is tried before the skill root**.
 * 3. `scripts/local.env` (copy from `scripts/local.env.example`; useful as a personal default
 *    or when the skill is used independently of any single project)
 */
const fs = require('fs');
const path = require('path');

const skillDir = path.resolve(__dirname, '..');

function findGitRoot(startDir) {
  let dir = path.resolve(startDir);
  for (;;) {
    const gitPath = path.join(dir, '.git');
    if (fs.existsSync(gitPath)) return dir;
    const up = path.dirname(dir);
    if (up === dir) return null;
    dir = up;
  }
}

function parseEnvLine(line) {
  const t = line.trim();
  if (!t || t.startsWith('#')) return null;
  const m = t.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
  if (!m) return null;
  let v = m[2].split('#')[0].trim().replace(/^["']|["']$/g, '');
  return v ? { key: m[1], value: v } : null;
}

/** Read PLAYWRIGHT_BASE_URL only (last assignment wins). */
function pickFromEnvFile(file) {
  if (!fs.existsSync(file)) return null;
  let pw = null;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const p = parseEnvLine(line);
    if (!p) continue;
    if (p.key === 'PLAYWRIGHT_BASE_URL') pw = p.value;
  }
  if (pw) return { url: pw, detail: `PLAYWRIGHT_BASE_URL in ${file}` };
  return null;
}

function readFromDir(dir) {
  for (const name of ['.env.local', '.env']) {
    const file = path.join(dir, name);
    const r = pickFromEnvFile(file);
    if (r) return { url: r.url, source: r.detail };
  }
  const legacy = pickFromEnvFile(path.join(dir, 'playwright.env.local'));
  if (legacy) return { url: legacy.url, source: legacy.detail };
  return null;
}

function uniqueGitRoots() {
  const roots = [];
  const seen = new Set();
  for (const start of [process.cwd(), skillDir]) {
    const root = findGitRoot(start);
    if (root && !seen.has(root)) {
      seen.add(root);
      roots.push(root);
    }
  }
  return roots;
}

const argv = new Set(process.argv.slice(2));
if (argv.has('--help') || argv.has('-h')) {
  console.error(`Usage: node resolve-base-url.js [--source] [--strip-trailing-slash] [--export]

Resolution order:
  1) Environment variable PLAYWRIGHT_BASE_URL
  2) Git repo root(s): .env.local, .env, playwright.env.local (PLAYWRIGHT_BASE_URL key only)
     Roots: cwd first, then skill install path (deduped). Tip: cwd on target repo when using (2).
  3) scripts/local.env (next to this script)
`);
  process.exit(0);
}

let url = (process.env.PLAYWRIGHT_BASE_URL || '').trim();
let source = 'environment variable PLAYWRIGHT_BASE_URL';

if (!url) {
  for (const root of uniqueGitRoots()) {
    const r = readFromDir(root);
    if (r) {
      url = r.url;
      source = r.source;
      break;
    }
  }
}

if (!url) {
  const localFile = path.join(__dirname, 'local.env');
  const r = pickFromEnvFile(localFile);
  if (r) {
    url = r.url;
    source = `local.env (${localFile})`;
  }
}

if (!url) {
  console.error(
    'resolve-base-url: missing PLAYWRIGHT_BASE_URL. Set the env var, add PLAYWRIGHT_BASE_URL under git-root .env.local / .env / playwright.env.local, or copy scripts/local.env.example → scripts/local.env.'
  );
  process.exit(1);
}

if (argv.has('--strip-trailing-slash')) url = url.replace(/\/$/, '');

if (argv.has('--export')) {
  console.log(`export PLAYWRIGHT_BASE_URL=${JSON.stringify(url)}`);
} else {
  console.log(url);
}

if (argv.has('--source')) console.error(`resolve-base-url: source=${source}`);
