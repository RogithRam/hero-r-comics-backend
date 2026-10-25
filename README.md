# Hero-R Comics — AI art backend

This is the real backend the live Hero-R Comics page can't run on its own
(the published page can't call external AI APIs directly — see the planning
doc for why). It's one small Express server with a single endpoint:

```
POST /api/stylize
Body: { "imageDataUrl": "data:image/png;base64,....", "style": "bold ink" }
Response: { "imageUrl": "https://...generated-image..." }
```

It sends the image to a face-preserving AI model on Replicate — one that
redraws the art style while keeping the same face — and returns the result.

## 1. Get a Replicate account + API token

1. Sign up at https://replicate.com
2. Go to https://replicate.com/account/api-tokens and create a token.

That's it for setup — `server.js` is already wired to **google/nano-banana-pro**,
an official Replicate image-editing model that takes a reference photo +
prompt and redraws the style while keeping the same face. It's called by
model name, so no version hash to copy or keep updated. If you ever want to
swap in a different model, set `REPLICATE_MODEL_OWNER` /
`REPLICATE_MODEL_NAME` in your environment and adjust the `input` fields in
`server.js` to match that model's schema (check its "API" tab on Replicate).

## 2. Run it locally (optional, to test first)

```
cp .env.example .env
# fill in REPLICATE_API_TOKEN in .env
npm install
npm start
```

Then test with:

```
curl -X POST http://localhost:3000/api/stylize \
  -H "Content-Type: application/json" \
  -d '{"imageDataUrl":"data:image/png;base64,....","style":"bold ink comic"}'
```

## 3. Deploy to Render (or Railway / Fly.io — same idea)

1. Push this folder to a GitHub repo.
2. In Render: **New → Web Service** → connect that repo.
3. Build command: `npm install` — Start command: `npm start` (Render
   usually detects both automatically).
4. In the service's **Environment** settings, add:
   - `REPLICATE_API_TOKEN` = your token from step 1
5. Deploy. Render gives you a public URL like `https://your-app.onrender.com`.

## 4. Wire it into the Hero-R Comics page

Once deployed, the "Choose a style" step in the app can POST the rasterized
avatar PNG (already generated client-side as a data URL) to
`https://your-app.onrender.com/api/stylize`, and swap the in-browser SVG
character for the real AI-generated image it gets back. Send me the
deployed URL and I'll wire that call into the live page.

## Cost note

Each generation typically costs a few cents on Replicate and takes
5–30 seconds — budget accordingly if this gets real traffic, and consider
adding a request limit per user.
