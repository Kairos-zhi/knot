import { writeFile } from 'node:fs/promises';
import { requestDesktopQuit } from '../../../../scripts/desktop-host-debug.mjs';
const targets = await (await fetch('http://127.0.0.1:19222/json/list')).json();
const target = targets.find(t => t.type === 'node');
if (!target) throw new Error('No main node target');
const result = await requestDesktopQuit(target.webSocketDebuggerUrl);
await writeFile(new URL('./fixed-quit-request.json', import.meta.url), JSON.stringify({ at: new Date().toISOString(), ...result }, null, 2));
console.log(result);
