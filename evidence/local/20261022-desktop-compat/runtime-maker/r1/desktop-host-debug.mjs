import { createDesktopManager } from './desktop-host-client.mjs';

function loopback(endpoint, protocol) {
  const url = new URL(endpoint);
  if (url.protocol !== protocol || url.hostname !== '127.0.0.1' || url.username || url.password || url.search || url.hash) throw new Error('Only explicit loopback debugging endpoints are allowed');
  return url;
}

async function socketSession(endpoint) {
  loopback(endpoint, 'ws:');
  const socket = new WebSocket(endpoint);
  const pending = new Map(); let id = 0;
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { socket.close(); reject(new Error('Debug transport connection timed out')); }, 5000);
    socket.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
    socket.addEventListener('error', () => { clearTimeout(timer); reject(new Error('Debug transport unavailable')); }, { once: true });
  });
  socket.addEventListener('message', event => { const message = JSON.parse(event.data); const item = pending.get(message.id); if (!item) return; pending.delete(message.id); clearTimeout(item.timer); message.error ? item.reject(new Error('Debug command rejected')) : item.resolve(message.result); });
  socket.addEventListener('close', () => { for (const item of pending.values()) { clearTimeout(item.timer); item.reject(new Error('Debug transport closed')); } pending.clear(); });
  return {
    command(method, params) { const requestId = ++id; return new Promise((resolve, reject) => { const timer = setTimeout(() => { pending.delete(requestId); reject(new Error('Debug command timed out')); }, 120000); pending.set(requestId, { resolve, reject, timer }); socket.send(JSON.stringify({ id: requestId, method, params })); }); },
    close() { socket.close(); },
  };
}

/** Connect only to the existing official app main frame; caller owns temporary port lifecycle. */
export async function connectDesktopManager(endpoint, { allowInstall = false } = {}) {
  const origin = loopback(endpoint, 'http:');
  if (origin.pathname !== '/') throw new Error('Expected debugging origin');
  const response = await fetch(new URL('/json/list', origin), { redirect: 'error', signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error('Desktop debugging inventory unavailable');
  const targets = (await response.json()).filter(t => t.type === 'page' && /^dsh-app:\/\/app\//.test(t.url));
  if (targets.length !== 1) throw new Error('Expected exactly one official app page');
  const session = await socketSession(targets[0].webSocketDebuggerUrl);
  const manager = createDesktopManager(async expression => {
    const result = await session.command('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails || result.result?.subtype === 'error') throw new Error('Desktop management evaluation failed');
    return result.result?.value;
  }, { allowInstall });
  return Object.freeze({ ...manager, close: () => session.close() });
}

/** Main-process inspector only. Fixed official graceful-quit call; never accept caller code. */
export async function requestDesktopQuit(endpoint) {
  const session = await socketSession(endpoint);
  try {
    const result = await session.command('Runtime.evaluate', { expression: "import('electron').then(({app})=>{setTimeout(()=>app.quit(),100);return {requested:true}})", awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails || result.result?.value?.requested !== true) throw new Error('Official desktop quit request failed');
    return { requested: true, provesProcessExit: false };
  } finally { session.close(); }
}
