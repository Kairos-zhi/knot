import { writeFile } from 'node:fs/promises';
const targets = await (await fetch('http://127.0.0.1:19222/json/list')).json();
const target = targets.find(t => t.type === 'node');
if (!target) throw new Error('No main node target');
const endpoint = new URL(target.webSocketDebuggerUrl);
if (endpoint.hostname !== '127.0.0.1' || endpoint.protocol !== 'ws:') throw new Error('Not loopback');
const socket = new WebSocket(endpoint);
await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = () => reject(new Error('Transport failed')); });
const done = new Promise(resolve => socket.onmessage = e => resolve(JSON.parse(e.data)));
socket.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: {
  expression: "(()=>{try{const electron=process.getBuiltinModule('module').createRequire('D:/DSH-Desktop/app/resources/app.asar/lib/main.js')('electron');return {classification:'fixed-require-checked',quitAvailable:typeof electron.app.quit==='function'}}catch(error){return {classification:'fixed-require-failed',code:['MODULE_NOT_FOUND','ERR_UNKNOWN_BUILTIN_MODULE'].includes(error.code)?error.code:'OTHER'}}})()",
  awaitPromise: true, returnByValue: true,
} }));
const result = await done;
const diagnosis = result.result?.result?.value ?? { classification: 'inspector-evaluation-failed' };
socket.close();
await writeFile(new URL('./fixed-require-diagnosis.json', import.meta.url), JSON.stringify(diagnosis, null, 2));
console.log(diagnosis);
