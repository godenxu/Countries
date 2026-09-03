// Packs named typed arrays into one ArrayBuffer with a JSON header.
export function pack(arrays, extra = {}) {
  const names = Object.keys(arrays);
  const header = { v: 1, ...extra, buffers: {} };
  let offset = 0;
  const parts = [];
  for (const n of names) {
    const a = arrays[n];
    const buf = Buffer.from(a.buffer, a.byteOffset, a.byteLength);
    const pad = (4 - (offset % 4)) % 4;
    if (pad) { parts.push(Buffer.alloc(pad)); offset += pad; }
    header.buffers[n] = { type: a.constructor.name, offset, length: a.length };
    parts.push(buf); offset += buf.length;
  }
  const headJson = Buffer.from(JSON.stringify(header), 'utf8');
  const headPad = (4 - ((headJson.length + 4) % 4)) % 4;
  const head = Buffer.concat([
    (() => { const b = Buffer.alloc(4); b.writeUInt32LE(headJson.length + headPad, 0); return b; })(),
    headJson, Buffer.alloc(headPad),
  ]);
  return Buffer.concat([head, ...parts]);
}
