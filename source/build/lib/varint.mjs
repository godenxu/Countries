// zigzag varint stream helpers (encoder side; the runtime has a matching decoder)
export function encodeVarints(values) {
  const out = [];
  for (let i = 0; i < values.length; i++) {
    let u = ((values[i] << 1) ^ (values[i] >> 31)) >>> 0;
    while (u >= 0x80) { out.push((u & 0x7f) | 0x80); u >>>= 7; }
    out.push(u);
  }
  return Uint8Array.from(out);
}
export function encodeUVarints(values) {
  const out = [];
  for (let i = 0; i < values.length; i++) {
    let u = values[i] >>> 0;
    while (u >= 0x80) { out.push((u & 0x7f) | 0x80); u >>>= 7; }
    out.push(u);
  }
  return Uint8Array.from(out);
}
