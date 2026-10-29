// Pure Node.js PNG and SVG generator for VibeFeed
// Zero external dependencies; uses built-in zlib.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// CRC32 implementation for PNG chunks
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
  ihdr.writeUInt8(8, 8);   // bit depth
  ihdr.writeUInt8(6, 9);   // color type: RGBA
  ihdr.writeUInt8(0, 10);  // compression
  ihdr.writeUInt8(0, 11);  // filter
  ihdr.writeUInt8(0, 12);  // interlace

  const ihdrChunk = makeChunk('IHDR', ihdr);

  // Scanlines with filter byte 0 at start of each line
  const rawData = Buffer.alloc(height * (1 + width * 4));
  let pos = 0;

  for (let y = 0; y < height; y++) {
    rawData[pos++] = 0; // Filter: None
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

// Draw Apple Squircle Dark Icon with glowing cyan/purple vibe waves + filter funnel
function renderIconPixel(x, y, w, h) {
  // Normalize to [-1, 1]
  const nx = (x / (w - 1)) * 2 - 1;
  const ny = (y / (h - 1)) * 2 - 1;

  // Squircle equation: |x|^4 + |y|^4 <= 0.85^4
  const squircleDist = Math.pow(Math.abs(nx), 3.4) + Math.pow(Math.abs(ny), 3.4);
  const maxR = 0.82;
  const edgeDist = Math.pow(maxR, 3.4);

  // Anti-aliasing margin
  if (squircleDist > edgeDist + 0.08) {
    return [0, 0, 0, 0]; // Transparent outside
  }

  let alpha = 1.0;
  if (squircleDist > edgeDist - 0.04) {
    alpha = Math.max(0, Math.min(1, (edgeDist + 0.08 - squircleDist) / 0.12));
  }

  // Background gradient: Deep Apple Space Obsidian with subtle top highlight
  const grad = (ny + 1) / 2; // 0 (top) to 1 (bottom)
  let bgR = 18 - grad * 8;
  let bgG = 20 - grad * 8;
  let bgB = 28 - grad * 10;

  // Inner border highlight (1px inset glass rim)
  if (squircleDist > edgeDist - 0.12 && squircleDist <= edgeDist) {
    const rim = (squircleDist - (edgeDist - 0.12)) / 0.12;
    bgR += 40 * rim;
    bgG += 45 * rim;
    bgB += 65 * rim;
  }

  // Draw icon graphic: YouTube play triangle + clean filter lines + glowing soundwave/vibe dots
  // Center is (0, 0)
  const distCenter = Math.sqrt(nx * nx + ny * ny);

  // Glow in center
  const glow = Math.max(0, 1 - distCenter * 1.4);
  bgR += glow * 10;
  bgG += glow * 30;
  bgB += glow * 65;

  // Render a sleek filter/vibe funnel symbol:
  // Funnel top bar: ny between -0.42 and -0.32, |nx| <= 0.48
  let isSymbol = false;
  let symR = 10, symG = 132, symB = 255; // Apple Blue #0A84FF

  // Funnel horizontal top: y in [-0.36, -0.28], x in [-0.44, 0.44]
  if (ny >= -0.36 && ny <= -0.26 && Math.abs(nx) <= 0.44) {
    isSymbol = true;
    symR = 100; symG = 210; symB = 255; // Cyan
  }
  // Funnel middle: y in [-0.15, -0.07], x in [-0.28, 0.28]
  else if (ny >= -0.15 && ny <= -0.05 && Math.abs(nx) <= 0.28) {
    isSymbol = true;
    symR = 50; symG = 170; symB = 255;
  }
  // Funnel bottom: y in [0.06, 0.16], x in [-0.12, 0.12]
  else if (ny >= 0.06 && ny <= 0.16 && Math.abs(nx) <= 0.12) {
    isSymbol = true;
    symR = 10; symG = 132; symB = 255;
  }
  // Sparkling vibe star or pulse dot at bottom center: y in [0.32, 0.40], x in [-0.04, 0.04]
  else if (Math.pow(nx, 2) + Math.pow(ny - 0.35, 2) <= 0.006) {
    isSymbol = true;
    symR = 48; symG = 209; symB = 88; // Apple Emerald green pulse #30D158
  }

  if (isSymbol) {
    return [symR, symG, symB, alpha * 255];
  }

  return [bgR, bgG, bgB, alpha * 255];
}

// Generate SVG version
const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#1C1C24"/>
      <stop offset="100%" stop-color="#0B0B0E"/>
    </linearGradient>
    <linearGradient id="beam" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#64D2FF"/>
      <stop offset="50%" stop-color="#0A84FF"/>
      <stop offset="100%" stop-color="#BF5AF2"/>
    </linearGradient>
    <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="3" result="blur"/>
      <feMerge>
        <feMergeNode in="blur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
  </defs>
  
  <!-- Apple Dark Squircle -->
  <rect x="6" y="6" width="116" height="116" rx="28" fill="url(#bg)" stroke="rgba(255,255,255,0.12)" stroke-width="1.5"/>
  
  <!-- Ambient Center Glow -->
  <circle cx="64" cy="64" r="32" fill="#0A84FF" opacity="0.15" filter="url(#glow)"/>

  <!-- Sleek Vibe Filter Funnel & Waves -->
  <g filter="url(#glow)">
    <!-- Top Filter Bar -->
    <rect x="30" y="34" width="68" height="8" rx="4" fill="#64D2FF"/>
    
    <!-- Middle Filter Bar -->
    <rect x="42" y="52" width="44" height="8" rx="4" fill="#0A84FF"/>
    
    <!-- Lower Filter Bar -->
    <rect x="54" y="70" width="20" height="8" rx="4" fill="#BF5AF2"/>
    
    <!-- Vibe Sparkle Dot -->
    <circle cx="64" cy="92" r="5" fill="#30D158"/>
    <circle cx="64" cy="92" r="8" fill="#30D158" opacity="0.3"/>
  </g>
</svg>`;

const iconDir = path.join(__dirname, '..', 'icons');
if (!fs.existsSync(iconDir)) {
  fs.mkdirSync(iconDir, { recursive: true });
}

// Write SVG
fs.writeFileSync(path.join(iconDir, 'icon.svg'), svgContent, 'utf8');
console.log('Generated icon.svg');

// Generate 16, 32, 48, 128 PNGs
const sizes = [16, 32, 48, 128];
for (const s of sizes) {
  const buf = createPng(s, s, renderIconPixel);
  fs.writeFileSync(path.join(iconDir, `icon${s}.png`), buf);
  console.log(`Generated icon${s}.png (${buf.length} bytes)`);
}
console.log('All icons generated successfully!');
