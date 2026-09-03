// Tiny PNG writer (truecolour + alpha, filter 0) for generating app icons.
import zlib from 'node:zlib';

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = c ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, 'ascii');
  const cr = Buffer.alloc(4); cr.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, cr]);
}
export function encodePNG(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    rgba.copy ? rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4)
      : Buffer.from(rgba.buffer, y * width * 4, width * 4).copy(raw, y * (width * 4 + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// The app mark: dark disc, teal globe with meridians, gold dashed orbit.
export function makeIcon(size, pad) {
  const px = Buffer.alloc(size * size * 4);
  const S = 3; // supersampling
  const R = size * (pad ? 0.34 : 0.40);
  const cx = size / 2, cy = size / 2;
  const put = (i, r, g, b, a) => { px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = a; };
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (let sy = 0; sy < S; sy++) for (let sx = 0; sx < S; sx++) {
      const px0 = x + (sx + 0.5) / S, py0 = y + (sy + 0.5) / S;
      const dx = px0 - cx, dy = py0 - cy;
      const d = Math.hypot(dx, dy);
      // background
      let cr = 6, cg = 12, cb = 22, ca = 255;
      const bg = Math.max(0, 1 - d / (size * 0.62));
      cr = 4 + bg * 10; cg = 8 + bg * 24; cb = 16 + bg * 38;
      if (d < R) { // globe body
        const t = d / R;
        cr = 9 + (1 - t) * 10; cg = 34 + (1 - t) * 30; cb = 46 + (1 - t) * 26;
        const lat = Math.asin(Math.max(-1, Math.min(1, dy / R)));
        // meridian + equator hairlines
        const mer = Math.abs(Math.abs(dx) / (R * Math.cos(lat) || 1e-6) - 0.55);
        if (mer < 0.045) { cr = 70; cg = 224; cb = 184; }
        if (Math.abs(dy) < R * 0.02) { cr = 70; cg = 224; cb = 184; }
        if (Math.abs(Math.abs(dy) - R * 0.46) < R * 0.014) { cr = 46; cg = 150; cb = 130; }
      }
      const ring = Math.abs(d - R);
      if (ring < size * 0.016) { cr = 90; cg = 236; cb = 198; }
      const orbit = Math.abs(d - R * 1.28);
      if (orbit < size * 0.012) {
        const ang = Math.atan2(dy, dx);
        if ((Math.floor((ang + Math.PI) / (Math.PI / 14)) & 1) === 0) { cr = 242; cg = 181; cb = 82; }
      }
      r += cr; g += cg; b += cb; a += ca;
    }
    const n = S * S, i = (y * size + x) * 4;
    put(i, Math.round(r / n), Math.round(g / n), Math.round(b / n), Math.round(a / n));
  }
  return encodePNG(size, size, px);
}
