import {readFile,writeFile,stat} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const sha=b=>createHash('sha256').update(b).digest('hex');
const git=(...args)=>execFileSync('git',args,{maxBuffer:32*1024*1024});
const receipt=JSON.parse(await readFile('evidence/local/20261022-closeout/maker/receipt.json'));
for(const row of [...receipt.files,...receipt.productComparison])assert.equal(sha(await readFile(row.path)),row.sha256.toLowerCase(),row.path);
const upstream=git('-C','C:/Users/x2270/Documents/Codex/2026-10-17/knot-accepted-core-publish','show','08a2a5340edab920ce942173ba63b2c5bc369eb4:knot-flowgram-app/scripts/asset-write-server.mjs');
assert.deepEqual(upstream,await readFile('tests/fixtures/asset-write-server.upstream.mjs'));
const files=git('diff','--cached','--name-only','-z').toString().split('\0').filter(Boolean);const stageSet=new Set(files);
const index=JSON.parse(await readFile('evidence/INDEX.json'));
const mismatches=[],notStaged=[],privateStaged=[],dispositions={};
for(const row of index.files){dispositions[row.disposition]=(dispositions[row.disposition]??0)+1;const b=await readFile(row.path);if(sha(b)!==row.sha256||b.length!==row.bytes)mismatches.push(row.path);if(row.disposition==='include'){if(!stageSet.has(row.path))notStaged.push(row.path);else if(sha(git('show',':'+row.path))!==row.sha256)mismatches.push('staged:'+row.path);}else if(stageSet.has(row.path))privateStaged.push(row.path);}
const suspiciousNames=files.filter(p=>/(^|\/)(\.env(?:\.|$)|agent-token$|credentials(?:\.|\/)|cookies?(?:\.|\/)|worksites\.json(?:\.|$)|node_modules\/|\.runtime\/|user-data\/)/i.test(p));
const keyPatterns=[/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,/\bsk-[A-Za-z0-9_-]{30,}\b/,/(?:[?&]token=|Bearer\s+)[A-Za-z0-9_-]{32,}/];
const secretCandidatePaths=[];for(const p of files){const b=git('show',':'+p);if(keyPatterns.some(re=>re.test(b.toString('utf8'))))secretCandidatePaths.push(p);}
const state=await readFile('STATE.md','utf8'),queue=await readFile('QUEUE.md','utf8');
const result={at:new Date().toISOString(),frozenMakerFiles:receipt.files.length,unchangedComparedFiles:receipt.productComparison.length,sourceFixtureExactGitBlob:true,sourceCommit:receipt.source.commit,sourceSha256:sha(upstream),stagedFileCount:files.length,evidenceEntries:index.files.length,dispositions,indexHashMismatches:mismatches,indexIncludesNotStaged:notStaged,privateEntriesStaged:privateStaged,suspiciousNames,secretCandidatePaths,stateLines:state.trimEnd().split('\n').length,queueLimitedRows:queue.split('\n').filter(l=>l.startsWith('| KONT-')&&l.includes('| ACCEPTED_LIMITED |')).length,queueClosedRows:queue.split('\n').filter(l=>l.startsWith('| KONT-')&&l.includes('| CLOSED |')).length,archiveBytes:{state:(await stat('docs/archive/STATE-20261022.md')).size,queue:(await stat('docs/archive/QUEUE-20261022.md')).size},attributes:git('check-attr','text','--','tests/fixtures/asset-write-server.upstream.mjs','STATE.md').toString().trim(),coreAutocrlf:git('config','--get','core.autocrlf').toString().trim()};
await writeFile('evidence/local/20261022-closeout/checker/audit.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
