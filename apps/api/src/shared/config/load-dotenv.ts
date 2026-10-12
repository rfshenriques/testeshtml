import * as fs from 'node:fs';
import * as path from 'node:path';

/** Load the repo-root .env (and apps/api/.env) without overriding variables already set. No dependency needed. */
export function loadDotenv() {
  for (const file of [path.resolve(process.cwd(), '.env'), path.resolve(__dirname, '../../../../../.env'), path.resolve(__dirname, '../../../.env')]) {
    if (!fs.existsSync(file)) continue;
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
      const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
      if (!m) continue;
      let v = m[2];
      if (/^["'].*["']$/.test(v)) v = v.slice(1, -1);
      else v = v.replace(/\s+#.*$/, '');
      if (process.env[m[1]] === undefined) process.env[m[1]] = v;
    }
  }
}
