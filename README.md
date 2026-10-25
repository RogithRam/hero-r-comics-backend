# Hero-R Comics — comic-art backend

Turns your in-app character avatar into bold-ink comic-book art: black
outlines (via edge detection) + flat posterized colors. This runs as plain
image-processing code, with **no AI model, no API key, and no billing
account required** — it's free and has no usage limits.

## Local testing (optional)

```
npm install
npm start
```

The server listens on port 3000 (or `$PORT`). Test it:

```
curl http://localhost:3000/
```

should respond with "Hero-R Comics comic-art backend is running."

## Deploying to Render

1. Push this folder's files (`server.js`, `package.json`, `.gitignore`,
   `README.md`) to your `hero-r-comics-backend` GitHub repo, overwriting
   what's there.
2. In Render, go to your existing backend Web Service (or create a new one
   pointed at this repo).
3. **Build Command:** `npm install`
4. **Start Command:** `npm start`
5. No environment variables are required. Deploy.

Render will install `sharp` (the image-processing library) automatically —
no extra setup needed.

## What changed from the AI-model version

The previous version of this backend called a paid AI image model
(Replicate's `google/nano-banana-pro`) to restyle the avatar. All image
generation services — Replicate, Google's own Gemini API, Hugging Face's
Inference Providers — require a paid account for real AI image generation;
there's no genuinely free tier for that. This version swaps that out for a
local image-processing pipeline instead:

1. **Edge detection** (Sobel operator) finds outlines in the avatar and
   draws them as bold black ink lines.
2. **Posterization** reduces each color channel to a handful of levels,
   giving flat, comic-book-style color blocks instead of smooth gradients.

It won't match the painterly quality of a generative AI model, but it's
instant, free forever, and has no "insufficient credit" failure mode. If you
want real AI-generated art later, you can add back a paid model (Replicate,
Google AI Studio, etc.) as an option alongside this free one — ask any time
and I can wire that back in.

## About payments and episode 2

Unrelated to the above — if you still want to sell Episode 2 unlocks on the
site, fill in `STRIPE_PAYMENT_LINK` and `EPISODE2_PRICE` in the standalone
site's `index.html` with a real Stripe Payment Link. There's still no
payment-verification server, so unlocking Episode 2 after paying is
honor-system (a visitor could tap "I've paid" without paying). A proper fix
adds a Stripe webhook to this backend — ask when you're ready for that.
