// Use a bounded, read-only reader instead of adding @electron/asar: inspection needs no extraction or archive-writing dependency.
import { open } from 'node:fs/promises';

/** Read-only ASAR reader for official installed source inspection. Never writes an archive. */
export async function openArchive(archivePath) {
  const file = await open(archivePath, 'r');
  try {
    const size = (await file.stat()).size;
    const first = Buffer.alloc(8);
    await file.read(first, 0, first.length, 0);
    const headerSize = first.readUInt32LE(4);
    if (first.readUInt32LE(0) !== 4 || headerSize < 8 || headerSize > 32 * 1024 * 1024 || headerSize + 8 > size) throw new Error('Unsupported ASAR header');
    const header = Buffer.alloc(headerSize);
    await file.read(header, 0, header.length, 8);
    const jsonLength = header.readUInt32LE(4);
    if (jsonLength > header.length - 8) throw new Error('Invalid ASAR header length');
    const root = JSON.parse(header.subarray(8, 8 + jsonLength).toString('utf8'));
    const locate = path => {
      let node = root;
      for (const part of path.split('/').filter(Boolean)) {
        if (part === '.' || part === '..') throw new Error('Archive traversal rejected');
        node = node.files?.[part];
        if (!node) throw new Error(`Archive member missing: ${path}`);
      }
      return node;
    };
    return {
      list(path = '') { return Object.keys(locate(path).files || {}); },
      async read(path) {
        const entry = locate(path);
        if (entry.unpacked || entry.link || entry.files) throw new Error('Member is not a packed regular file');
        const offset = Number(entry.offset), length = entry.size;
        if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(length) || length < 0 || length > 16 * 1024 * 1024 || 8 + headerSize + offset + length > size) throw new Error('Invalid ASAR file range');
        const buffer = Buffer.alloc(length);
        const result = await file.read(buffer, 0, length, 8 + headerSize + offset);
        if (result.bytesRead !== length) throw new Error('Incomplete ASAR member');
        return buffer;
      },
      close() { return file.close(); },
    };
  } catch (error) { await file.close(); throw error; }
}
