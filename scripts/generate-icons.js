const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function createPNG(width, height, drawPixel) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  function createChunk(type, data) {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length, 0);
    
    const typeBuffer = Buffer.from(type, 'ascii');
    const crcData = Buffer.concat([typeBuffer, data]);
    
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < crcData.length; i++) {
      crc ^= crcData[i];
      for (let j = 0; j < 8; j++) {
        if (crc & 1) {
          crc = (crc >>> 1) ^ 0xEDB88320;
        } else {
          crc = crc >>> 1;
        }
      }
    }
    crc ^= 0xFFFFFFFF;
    
    const crcBuffer = Buffer.alloc(4);
    crcBuffer.writeUInt32BE(crc >>> 0, 0);
    
    return Buffer.concat([length, typeBuffer, data, crcBuffer]);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const rawData = [];
  for (let y = 0; y < height; y++) {
    rawData.push(0);
    for (let x = 0; x < width; x++) {
      const pixel = drawPixel(x, y, width, height);
      rawData.push(pixel.r, pixel.g, pixel.b, pixel.a);
    }
  }

  const compressed = zlib.deflateSync(Buffer.from(rawData));
  const iend = Buffer.alloc(0);

  return Buffer.concat([
    signature,
    createChunk('IHDR', ihdr),
    createChunk('IDAT', compressed),
    createChunk('IEND', iend)
  ]);
}

function drawIcon(x, y, w, h) {
  const cx = w / 2;
  const cy = h / 2;
  const radius = Math.min(w, h) / 2 - 2;
  
  const dx = x - cx;
  const dy = y - cy;
  const dist = Math.sqrt(dx * dx + dy * dy);
  
  if (dist > radius) {
    return { r: 0, g: 0, b: 0, a: 0 };
  }

  const gradient = dist / radius;
  const r = Math.round(59 + (139 - 59) * gradient);
  const g = Math.round(130 + (92 - 130) * gradient);
  const b = Math.round(246 + (246 - 246) * gradient);
  
  const waveX = Math.sin(x / w * Math.PI * 3) * 2;
  const waveY = Math.cos(y / h * Math.PI * 2) * 2;
  const lineDist = Math.abs((x + waveX) - (y + waveY) * 0.5 - w * 0.3);
  
  let a = 255;
  if (dist > radius - 2) {
    a = Math.round((radius - dist) / 2 * 255);
  }

  return { r, g, b, a: Math.max(0, Math.min(255, a)) };
}

const sizes = [16, 48, 128];
const iconsDir = path.join(__dirname, '..', 'icons');

sizes.forEach(size => {
  const png = createPNG(size, size, drawIcon);
  const filePath = path.join(iconsDir, `icon${size}.png`);
  fs.writeFileSync(filePath, png);
  console.log(`Generated: icon${size}.png`);
});

console.log('All icons generated!');
