import { readFile, access } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import assert from 'node:assert/strict';

const docs = ['README.md', 'README.zh-CN.md', 'CONTRIBUTING.md', 'SECURITY.md', 'THIRD_PARTY_NOTICES.md', 'CHANGELOG.md', 'docs/hosting.md', 'docs/performance.md', 'docs/repository-presentation.md'];
for (const file of docs) {
  const source = await readFile(file, 'utf8');
  const targets = [...source.matchAll(/\]\(([^)]+)\)|(?:src|href)="([^"]+)"/g)].map(match => match[1] || match[2]);
  for (const target of targets) {
    if (/^(https?:|mailto:|#)/.test(target)) continue;
    await access(resolve(dirname(file), decodeURIComponent(target.split('#')[0])));
  }
}
const lock = JSON.parse(await readFile('package-lock.json', 'utf8'));
for (const [name, pkg] of Object.entries(lock.packages)) {
  assert.ok(!pkg.link, `Local dependency link: ${name}`);
  assert.ok(!pkg.resolved || pkg.resolved.startsWith('https://'), `Non-portable dependency: ${name}`);
}
for (const path of ['demo/assets/banner.svg', 'docs/assets/wikipedia-pixel-art.png', 'docs/assets/architecture-light.svg', 'docs/assets/architecture-dark.svg', 'demo/assets/aurora-pixel.jpg', 'demo/assets/aurora-original.jpg', 'demo/index.html', 'LICENSE']) await access(path);
console.log('Repository links, demo assets and dependency metadata are valid.');
