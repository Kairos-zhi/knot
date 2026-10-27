/** Test-only byte-stream bridge for the server's message/reset SSE contract.
 * No reconnect, browser claims, business interpretation or generated events. */
export function createHttpEventSource(fetchTransport, timeoutMs = 15000) {
  const streams = [];
  class EventSource {
    constructor(url) {
      this.url = String(url);
      this.closed = false;
      this.controller = new AbortController();
      this.listeners = new Map();
      this.lastEventId = '';
      streams.push(this);
      this.done = this.read().catch(() => {
        if (!this.closed) this.onerror?.({ type: 'error' });
      });
    }
    addEventListener(name, callback) { this.listeners.set(name, callback); }
    close() { this.closed = true; this.controller.abort(); }
    async read() {
      const timer = setTimeout(() => this.controller.abort(), timeoutMs);
      let reader;
      try {
        const response = await fetchTransport(this.url, { method: 'GET', credentials: 'same-origin', signal: this.controller.signal });
        if (!response.ok || !response.headers.get('content-type')?.includes('text/event-stream')) throw new Error('SSE response refused');
        reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8', { fatal: true });
        let buffer = '', data = [], eventType = '';
        const line = value => {
          if (value === '') {
            if (data.length && !this.closed) {
              const event = { data: data.join('\n'), lastEventId: this.lastEventId };
              if (!eventType || eventType === 'message') this.onmessage?.(event);
              else if (eventType === 'reset') this.listeners.get('reset')?.(event);
              else throw new Error('Unsupported test SSE event');
            }
            data = []; eventType = ''; return;
          }
          if (value.startsWith(':')) return;
          const colon = value.indexOf(':');
          const field = colon < 0 ? value : value.slice(0, colon);
          let content = colon < 0 ? '' : value.slice(colon + 1);
          if (content.startsWith(' ')) content = content.slice(1);
          if (field === 'data') data.push(content);
          else if (field === 'event') eventType = content;
          else if (field === 'id') {
            if (content.includes('\0')) throw new Error('Invalid SSE identity');
            this.lastEventId = content;
          }
        };
        while (!this.closed) {
          const chunk = await reader.read();
          if (chunk.done) throw new Error('SSE disconnected');
          buffer += decoder.decode(chunk.value, { stream: true });
          if (buffer.length > 2 * 1024 * 1024) throw new Error('Test SSE frame limit');
          let newline;
          while (!this.closed && (newline = buffer.indexOf('\n')) >= 0) {
            const value = buffer.slice(0, newline).replace(/\r$/, '');
            buffer = buffer.slice(newline + 1);
            line(value);
          }
        }
      } finally {
        clearTimeout(timer);
        if (reader) await reader.cancel().catch(() => {});
      }
    }
  }
  return { EventSource, streams, async dispose() {
    for (const stream of streams) stream.close();
    await Promise.all(streams.map(stream => stream.done));
  } };
}
