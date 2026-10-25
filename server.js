// Hero-R Comics — AI art backend
//
// What this does: takes an image (a photo, or the in-app SVG character
// rendered to a PNG) and a style prompt, sends it to a face-preserving
// image model on Replicate, and returns the generated comic-art image.
// "Face-preserving" means the model is built to keep the same face
// structure/identity while changing the art style — that's the key
// requirement from the brief (convert to "animation" without changing
// face structure).
//
// This needs Node 18+ (for the built-in `fetch`) — no extra HTTP library.
//
// SECURITY: REPLICATE_API_TOKEN must only ever live here, as a server
// environment variable. Never put it in the front-end page or commit it
// to the repo — anyone who has it can spend your Replicate credits.

require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors()); // tighten this to your site's origin before going live
app.use(express.json({ limit: '15mb' })); // images arrive as base64 data URLs

const REPLICATE_API_TOKEN = process.env.REPLICATE_API_TOKEN;

// Find the exact model + version string on https://replicate.com before
// deploying — model names/versions change over time, so don't trust a
// hard-coded value here. Good starting points for face-preserving,
// identity-locked stylization: search Replicate for "photomaker",
// "instant-id", or "ip-adapter-faceid". Copy the "owner/model:version"
// string from the model's page into REPLICATE_MODEL_VERSION below.
const MODEL_VERSION = process.env.REPLICATE_MODEL_VERSION || '';

app.get('/', (req, res) => {
  res.send('Hero-R Comics AI art backend is running.');
});

app.post('/api/stylize', async (req, res) => {
  try {
    const { imageDataUrl, style } = req.body || {};

    if (!imageDataUrl) {
      return res.status(400).json({ error: 'imageDataUrl is required (a data:image/...;base64,... string).' });
    }
    if (!REPLICATE_API_TOKEN) {
      return res.status(500).json({ error: 'Server has no REPLICATE_API_TOKEN configured yet.' });
    }
    if (!MODEL_VERSION) {
      return res.status(500).json({ error: 'Server has no REPLICATE_MODEL_VERSION configured yet.' });
    }

    // 1. Start the prediction.
    const createRes = await fetch('https://api.replicate.com/v1/predictions', {
      method: 'POST',
      headers: {
        Authorization: `Token ${REPLICATE_API_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        version: MODEL_VERSION,
        input: {
          // Field names vary by model — check the model's "API" tab on
          // Replicate and adjust these to match (e.g. some expect
          // `input_image`, others `face_image`, `image`, etc.)
          input_image: imageDataUrl,
          prompt: style
            ? `comic book style illustration, ${style}, bold ink lines, vibrant colors`
            : 'comic book style illustration, bold ink lines, vibrant colors',
          num_inference_steps: 20
        }
      })
    });

    const prediction = await createRes.json();
    if (!createRes.ok) {
      return res.status(502).json({ error: prediction.detail || 'Replicate rejected the request.' });
    }

    // 2. Poll until it finishes (image generation takes roughly 5-30s).
    let result = prediction;
    const pollUrl = result.urls && result.urls.get;
    const start = Date.now();
    const TIMEOUT_MS = 90 * 1000;

    while (
      result.status !== 'succeeded' &&
      result.status !== 'failed' &&
      result.status !== 'canceled'
    ) {
      if (Date.now() - start > TIMEOUT_MS) {
        return res.status(504).json({ error: 'Generation timed out.' });
      }
      await new Promise((r) => setTimeout(r, 1500));
      const pollRes = await fetch(pollUrl, {
        headers: { Authorization: `Token ${REPLICATE_API_TOKEN}` }
      });
      result = await pollRes.json();
    }

    if (result.status !== 'succeeded') {
      return res.status(500).json({ error: 'Generation failed.', detail: result.error });
    }

    const outputUrl = Array.isArray(result.output) ? result.output[0] : result.output;
    return res.json({ imageUrl: outputUrl });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Unexpected server error.' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Hero-R Comics backend listening on port ${PORT}`);
});
