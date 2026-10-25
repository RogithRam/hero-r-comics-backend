// Hero-R Comics — comic-art backend
//
// What this does: takes an image (a real uploaded photo, or the in-app SVG
// character rendered to a PNG) and turns it into bold-ink comic-book art —
// black outlines (via edge detection) + flat posterized colors — entirely
// with local image processing. No AI model, no API key, no billing account,
// no usage limits.
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

// Builds a Sobel gradient-magnitude map from a (already-smoothed) grayscale
// buffer, and picks an edge threshold adaptively from that image's own
// contrast (mean + a multiple of std-dev) instead of a fixed magic number.
// A fixed threshold looks great on flat, hand-drawn SVG colors but picks up
// every bit of skin texture / lighting gradient as "edges" on a real photo
// — adaptive thresholding keeps only the strongest, most structural edges
// regardless of how noisy or high-contrast the source photo is.
function detectEdges(gray, width, height) {
  const pixelCount = width * height;
  const mag = new Float32Array(pixelCount);
  const gx = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
  const gy = [-1, -2, -1, 0, 0, 0, 1, 2, 1];

  let sum = 0;
  let count = 0;

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
      const m = Math.sqrt(sx * sx + sy * sy);
      mag[y * width + x] = m;
      sum += m;
      count++;
    }
  }

  const mean = sum / Math.max(count, 1);
  let varSum = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const d = mag[y * width + x] - mean;
      varSum += d * d;
    }
  }
  const stdDev = Math.sqrt(varSum / Math.max(count, 1));

  // mean + 1.1*stdDev keeps only the stronger-than-typical gradients
  // (face outline, hairline, eyebrows, nose bridge) while dropping the
  // mass of small gradients caused by skin texture/lighting. Clamped so a
  // very flat image still gets some outline and a very busy one doesn't
  // turn fully black.
  const threshold = clamp(Math.round(mean + 1.1 * stdDev));
  const finalThreshold = Math.max(30, Math.min(threshold, 220));

  const edge = new Uint8Array(pixelCount);
  for (let p = 0; p < pixelCount; p++) {
    edge[p] = mag[p] > finalThreshold ? 1 : 0;
  }
  return edge;
}

function dilateEdges(edge, width, height) {
  const pixelCount = width * height;
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
  return boldEdge;
}

// Composites bold black ink outlines over posterized (flat, comic-book
// style) colors. `colorData` and `gray` must already be smoothed (blurred)
// before this runs, or the result is a noisy speckled mess instead of
// clean flat regions — see stylize() below.
function stylizeComic(colorData, gray, width, height, colorChannels) {
  const pixelCount = width * height;
  const edge = detectEdges(gray, width, height);
  const boldEdge = dilateEdges(edge, width, height);

  const LEVELS = 4;
  const step = 255 / (LEVELS - 1);
  const out = Buffer.alloc(pixelCount * 4);

  for (let p = 0, i = 0; p < pixelCount; p++, i += colorChannels) {
    const o = p * 4;
    if (boldEdge[p]) {
      out[o] = 22;
      out[o + 1] = 20;
      out[o + 2] = 26;
      out[o + 3] = 255;
    } else {
      out[o] = clamp(Math.round(Math.round(colorData[i] / step) * step));
      out[o + 1] = clamp(Math.round(Math.round(colorData[i + 1] / step) * step));
      out[o + 2] = clamp(Math.round(Math.round(colorData[i + 2] / step) * step));
      out[o + 3] = colorChannels === 4 ? colorData[i + 3] : 255;
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

    // Flatten onto white so transparent areas don't throw off the math.
    const base = sharp(inputBuffer).flatten({ background: '#ffffff' });

    // Two branches from the same decoded image:
    // - color: lightly blurred + saturated, used for the posterized colors.
    // - edge: more heavily blurred grayscale, used only to find outlines.
    // Blurring before processing is what keeps real-photo skin texture and
    // lighting noise from turning into a scribbly mess — it merges those
    // small variations into smooth regions before we quantize/detect edges.
    const [colorResult, edgeResult] = await Promise.all([
      base
        .clone()
        .modulate({ saturation: 1.4 })
        .blur(2.2)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true }),
      base
        .clone()
        .greyscale()
        .blur(4.5)
        .raw()
        .toBuffer({ resolveWithObject: true })
    ]);

    const { width, height, channels: colorChannels } = colorResult.info;
    const grayBuffer = edgeResult.data; // 1 channel, same width/height as colorResult

    const styledRaw = stylizeComic(colorResult.data, grayBuffer, width, height, colorChannels);

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
