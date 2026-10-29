const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// CRC32 table
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  }
  crcTable[n] = c;
}

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function makeChunk(type, data) {
  const len = data.length;
  const chunk = Buffer.alloc(12 + len);
  chunk.writeUInt32BE(len, 0);
  chunk.write(type, 4, 4, 'ascii');
  data.copy(chunk, 8);
  const typeAndData = chunk.subarray(4, 8 + len);
  chunk.writeUInt32BE(crc32(typeAndData), 8 + len);
  return chunk;
}

function createPng(width, height, pixelFn) {
  const header = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.writeUInt8(8, 8);
  ihdr.writeUInt8(6, 9); // RGBA
  ihdr.writeUInt8(0, 10);
  ihdr.writeUInt8(0, 11);
  ihdr.writeUInt8(0, 12);

  const ihdrChunk = makeChunk('IHDR', ihdr);
  const rawData = Buffer.alloc(height * (1 + width * 4));
  let pos = 0;

  for (let y = 0; y < height; y++) {
    rawData[pos++] = 0; // Filter None
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = pixelFn(x, y, width, height);
      rawData[pos++] = Math.round(Math.max(0, Math.min(255, r)));
      rawData[pos++] = Math.round(Math.max(0, Math.min(255, g)));
      rawData[pos++] = Math.round(Math.max(0, Math.min(255, b)));
      rawData[pos++] = Math.round(Math.max(0, Math.min(255, a)));
    }
  }

  const compressed = zlib.deflateSync(rawData);
  const idatChunk = makeChunk('IDAT', compressed);
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([header, ihdrChunk, idatChunk, iendChunk]);
}

// Render Nothing OS Mono Dot-Matrix Glyph
function renderMonoPixel(x, y, w, h) {
  // Map x, y to standard 128x128 coordinate space
  const sx = (x / (w - 1)) * 128;
  const sy = (y / (h - 1)) * 128;

  // Squircle background: rounded rect x:4..124, y:4..124, rx:28
  const rx = 28;
  const left = 4, right = 124, top = 4, bottom = 124;

  let distToEdge = 0;
  let insideSquircle = false;

  // Check if point is inside rounded rect
  const inCenterH = sx >= left && sx <= right && sy >= top + rx && sy <= bottom - rx;
  const inCenterV = sx >= left + rx && sx <= right - rx && sy >= top && sy <= bottom;

  const inTL = Math.hypot(sx - (left + rx), sy - (top + rx)) <= rx;
  const inTR = Math.hypot(sx - (right - rx), sy - (top + rx)) <= rx;
  const inBL = Math.hypot(sx - (left + rx), sy - (bottom - rx)) <= rx;
  const inBR = Math.hypot(sx - (right - rx), sy - (bottom - rx)) <= rx;

  if (inCenterH || inCenterV || inTL || inTR || inBL || inBR) {
    insideSquircle = true;
  }

  if (!insideSquircle) {
    // Check anti-aliased edge
    let minCornerDist = 999;
    if (sx < left + rx && sy < top + rx) minCornerDist = Math.hypot(sx - (left + rx), sy - (top + rx)) - rx;
    else if (sx > right - rx && sy < top + rx) minCornerDist = Math.hypot(sx - (right - rx), sy - (top + rx)) - rx;
    else if (sx < left + rx && sy > bottom - rx) minCornerDist = Math.hypot(sx - (left + rx), sy - (bottom - rx)) - rx;
    else if (sx > right - rx && sy > bottom - rx) minCornerDist = Math.hypot(sx - (right - rx), sy - (bottom - rx)) - rx;
    else {
      minCornerDist = Math.min(left - sx, sx - right, top - sy, sy - bottom);
    }
    if (minCornerDist > 1.2) return [0, 0, 0, 0];
    const alpha = Math.max(0, 1 - minCornerDist);
    return [12, 12, 12, alpha * 255];
  }

  // Base background: #0C0C0C
  let r = 12, g = 12, b = 12;

  // Subtle stroke border: stroke rgba(255,255,255,0.18) width 2
  const dL = sx - left, dR = right - sx, dT = sy - top, dB = bottom - sy;
  const minDistToOuter = Math.min(dL, dR, dT, dB);
  if (minDistToOuter <= 2.2) {
    r += 40; g += 40; b += 40;
  }

  // Dot matrix elements from SVG:
  // Circles r=5:
  // (38,38), (55,38), (72,38), (89,38)
  // (38,55), (89,55 fill #555)
  // (38,72), (55,72), (72,72), (89,72)
  // (38,89), (89,89)
  // Signature dot: (64,55) r=7 fill #E5E5E5
  const dots = [
    { cx: 38, cy: 38, r: 5, col: [255, 255, 255] },
    { cx: 55, cy: 38, r: 5, col: [255, 255, 255] },
    { cx: 72, cy: 38, r: 5, col: [255, 255, 255] },
    { cx: 89, cy: 38, r: 5, col: [255, 255, 255] },

    { cx: 38, cy: 55, r: 5, col: [255, 255, 255] },
    { cx: 89, cy: 55, r: 5, col: [95, 95, 95] }, // #555555

    { cx: 38, cy: 72, r: 5, col: [255, 255, 255] },
    { cx: 55, cy: 72, r: 5, col: [255, 255, 255] },
    { cx: 72, cy: 72, r: 5, col: [255, 255, 255] },
    { cx: 89, cy: 72, r: 5, col: [255, 255, 255] },

    { cx: 38, cy: 89, r: 5, col: [255, 255, 255] },
    { cx: 89, cy: 89, r: 5, col: [255, 255, 255] },

    { cx: 64, cy: 55, r: 7, col: [230, 230, 230] } // #E5E5E5 signature
  ];

  for (const dot of dots) {
    const d = Math.hypot(sx - dot.cx, sy - dot.cy);
    if (d <= dot.r + 0.8) {
      if (d <= dot.r - 0.5) {
        return [...dot.col, 255];
      }
      // Anti-aliased dot edge
      const t = Math.max(0, Math.min(1, (dot.r + 0.8 - d) / 1.3));
      r = r * (1 - t) + dot.col[0] * t;
      g = g * (1 - t) + dot.col[1] * t;
      b = b * (1 - t) + dot.col[2] * t;
      return [r, g, b, 255];
    }
  }

  return [r, g, b, 255];
}

const iconsDir = path.join(__dirname, '..', 'icons');
const sizes = [16, 32, 48, 128, 512];

for (const sz of sizes) {
  const buf = createPng(sz, sz, renderMonoPixel);
  const fileName = sz === 128 ? 'icon-mono.png' : `icon-mono-${sz}.png`;
  fs.writeFileSync(path.join(iconsDir, fileName), buf);
  console.log(`Generated ${fileName} (${buf.length} bytes)`);
}
