// Hero-R Comics — comic-art backend
//
// What this does: takes an image (the in-app SVG character rendered to a
// PNG) and turns it into bold-ink comic-book art — black outlines (via edge
// detection) + flat posterized colors — entirely with image processing, no
// paid AI model and no API key required. It runs 100% locally on this
// server, so there's nothing to configure and nothing that can run out of
// credit.
//
// This needs Node 18+.

const express = require('express');
const cors = require('cors');
const sharp = require('sharp');

const app = express();
app.use(cors()); // tighten this to your site's origin before going live
app.use(express.json({ limit: '15mb' })); // images arrive as base64 data URLs

app.get('/', (req, res) => {
  res.send('Hero-R Comics comic-art backend is running.');
});

function clamp(v) {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

// Converts a raw RGBA buffer into bold-ink comic art:
// 1) Sobel edge detection -> thick black outlines
// 2) Color posterization -> flat comic-book color blocks
function stylizeComic(data, width, height, channels) {
  const pixelCount = width * height;
  const gray = new Float32Array(pixelCount);
  for (let i = 0, p = 0; i < data.length; i += channels, p++) {
    gray[p] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  }

  // Sobel edge detection.
  const edge = new Uint8Array(pixelCount);
  const gx = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
  const gy = [-1, -2, -1, 0, 0, 0, 1, 2, 1];
  const EDGE_THRESHOLD = 80;

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      let sx = 0;
      let sy = 0;
      let k = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const val = gray[(y + dy) * width + (x + dx)];
          sx += gx[k] * val;
          sy += gy[k] * val;
          k++;
        }
      }
      const mag = Math.sqrt(sx * sx + sy * sy);
      edge[y * width + x] = mag > EDGE_THRESHOLD ? 1 : 0;
    }
  }

  // Dilate the edge mask by one pixel so outlines read as bold ink lines
  // rather than thin hairlines.
  const boldEdge = new Uint8Array(pixelCount);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = y * width + x;
      if (edge[p]) {
        boldEdge[p] = 1;
        continue;
      }
      let hit = 0;
      for (let dy = -1; dy <= 1 && !hit; dy++) {
        for (let dx = -1; dx <= 1 && !hit; dx++) {
          const ny = y + dy;
          const nx = x + dx;
          if (ny >= 0 && ny < height && nx >= 0 && nx < width && edge[ny * width + nx]) {
            hit = 1;
          }
        }
      }
      boldEdge[p] = hit;
    }
  }

  // Posterize + composite.
  const LEVELS = 5;
  const step = 255 / (LEVELS - 1);
  const out = Buffer.alloc(pixelCount * 4);

  for (let p = 0, i = 0; p < pixelCount; p++, i += channels) {
    const o = p * 4;
    if (boldEdge[p]) {
      out[o] = 22;
      out[o + 1] = 20;
      out[o + 2] = 26;
      out[o + 3] = 255;
    } else {
      out[o] = clamp(Math.round(Math.round(data[i] / step) * step));
      out[o + 1] = clamp(Math.round(Math.round(data[i + 1] / step) * step));
      out[o + 2] = clamp(Math.round(Math.round(data[i + 2] / step) * step));
      out[o + 3] = channels === 4 ? data[i + 3] : 255;
    }
  }

  return out;
}

app.post('/api/stylize', async (req, res) => {
  try {
    const { imageDataUrl } = req.body || {};

    if (!imageDataUrl) {
      return res.status(400).json({ error: 'imageDataUrl is required (a data:image/...;base64,... string).' });
    }

    const match = /^data:image\/\w+;base64,(.+)$/.exec(imageDataUrl);
    if (!match) {
      return res.status(400).json({ error: 'imageDataUrl must be a base64 image data URL.' });
    }
    const inputBuffer = Buffer.from(match[1], 'base64');

    // Flatten onto white (so transparent areas don't throw off the edge
    // detection / posterization math) and boost saturation a bit for a
    // punchier comic-book look before we process raw pixels.
    const { data, info } = await sharp(inputBuffer)
      .flatten({ background: '#ffffff' })
      .modulate({ saturation: 1.5 })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const { width, height, channels } = info;
    const styledRaw = stylizeComic(data, width, height, channels);

    const outputBuffer = await sharp(styledRaw, { raw: { width, height, channels: 4 } })
      .png()
      .toBuffer();

    const outDataUrl = `data:image/png;base64,${outputBuffer.toString('base64')}`;
    return res.json({ imageUrl: outDataUrl });
  } catch (err) {
    console.error('Unexpected error in /api/stylize:', err);
    return res.status(500).json({ error: err.message || 'Unexpected server error.' });
  }
});

process.on('unhandledRejection', (err) => {
  console.error('UNHANDLED REJECTION:', err);
});
process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION:', err);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Hero-R Comics backend listening on port ${PORT}`);
});
