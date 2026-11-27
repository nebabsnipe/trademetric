/* Safety check: unlicensed design photos can never ship.
   Fails (exit 1) when this is the main branch or a Production build AND either
     - TM_PHOTO_MODE in js/photos.js is 'private', or
     - the private-photos folder exists.
   Runs on every Vercel build (package.json "vercel-build"; Vercel runs it once per server function, which is harmless) and with `npm test`.
   node scripts/check-photos.mjs [--branch main]   (the flag is for testing the check itself) */
import fs from 'node:fs';
import { execSync } from 'node:child_process';
const arg = process.argv.indexOf('--branch');
let branch = arg > 0 ? process.argv[arg + 1] : process.env.VERCEL_GIT_COMMIT_REF || process.env.GITHUB_REF_NAME || '';
if (!branch) { try { branch = execSync('git rev-parse --abbrev-ref HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch (e) {} }
const production = process.env.VERCEL_ENV === 'production';
const src = fs.existsSync('js/photos.js') ? fs.readFileSync('js/photos.js', 'utf8') : '';
const mode = (src.match(/^var TM_PHOTO_MODE='([a-z]+)'/m) || [])[1] || 'off';
const folder = fs.existsSync('private-photos');
const guarded = branch === 'main' || production;
console.log(`photo check: branch "${branch || 'unknown'}"${production ? ' (Production)' : ''}, mode "${mode}", private folder ${folder ? 'present' : 'absent'}`);
const problems = [];
if (guarded && mode === 'private') problems.push("TM_PHOTO_MODE is 'private' in js/photos.js. Set it to 'off' (or 'licensed').");
if (guarded && folder) problems.push('The private-photos folder exists. Delete it before this goes to main.');
if (problems.length) { console.error('\nSTOPPED: unlicensed photos must not reach the live site.\n - ' + problems.join('\n - ') + '\n'); process.exit(1); }
console.log('photo check passed');
