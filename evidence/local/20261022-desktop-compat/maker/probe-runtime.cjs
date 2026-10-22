const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const base = 'D:/DSH-Desktop/app/resources/app.asar/dsh/node_modules';
const out = __dirname;
const names = fs.readdirSync(path.join(base, '@deepseek-ai')).filter(x => /cordis|connection|webserver|client-ui-(layout|sidebar|renderer)|client-core|dsh$/.test(x));
const results = [];
for (const name of names) {
 const root = path.join(base, '@deepseek-ai', name);
 const pkg = JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
 results.push({name:pkg.name,version:pkg.version,main:pkg.main,exports:pkg.exports});
 fs.mkdirSync(path.join(out,'runtime',name),{recursive:true});
 for (const file of ['package.json','lib/index.js','lib/client.js','lib/types/index.d.ts','lib/types/client/index.d.ts']) {
  const src=path.join(root,file); if (!fs.existsSync(src)) continue;
  const bytes=fs.readFileSync(src); const dst=path.join(out,'runtime',name,file);
  fs.mkdirSync(path.dirname(dst),{recursive:true}); fs.writeFileSync(dst,bytes);
  results.push({file:`${pkg.name}/${file}`,sha256:crypto.createHash('sha256').update(bytes).digest('hex')});
 }
}
fs.writeFileSync(path.join(out,'runtime-manifest.json'), JSON.stringify(results,null,2));
console.log(JSON.stringify(results));
