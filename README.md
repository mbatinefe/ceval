# Ceval

See what it’s worth.

Ceval is a camera web app for shopping in physical stores. Point your phone at a product to read its label and shelf price, then compare shopping or resale listings with links to their sources. Results distinguish confirmed product matches from uncertain candidates and visually similar items. Retail prices, asking prices and evidence of completed sales have separate meanings; an asking price is never proof of resale value.

- **Live:** https://ceval.mbefe34.workers.dev

Hosted access and scan allowances depend on the current deployment settings. You can also run your own copy locally using the steps below.

The hosted trial is limited to the first three new accounts. Each enrolled account gets one continuous ten-minute AI scanning window, starting when its first AI operation reserves budget. The clock continues when scanning stops. After it expires, sign-in and saved results remain available. Existing accounts do not consume new-account trial slots.

## How it works

1. **On the phone.** The browser captures still images from the camera or a selected video and batches one to three frames for analysis. Selected video files stay on the device; extracted frames and product crops go to the server and model when analysis or photo search runs. The synthetic store walkthroughs are labelled demo media, with fixture metadata separate from live recognition results.
2. **Recognition.** The Worker sends frames to Meta’s Muse Spark 1.3 (`muse-spark-1.3`). The model detects products and reads labels and shelf prices. Meta’s `web_search` tool finds candidate product pages and listings; there is no SerpApi requirement.
3. **Checks.** Product pages and their photos support candidate identification and price comparisons. Exact matches require supporting model, variant and pack-size evidence. Every displayed comparison price links to its source; unsupported prices are omitted.
4. **When it isn’t sure.** Ceval keeps uncertain identity separate from visual similarity. Similar-item prices describe those listings, without claiming they belong to the scanned product. Resale searches distinguish asking prices from verified sold evidence.
5. **Saved finds.** Scans are saved to your account so you can come back to them.

## Stack

- React and Vite in the browser
- One Cloudflare Worker for the app and the API, with a Durable Object per account for scan processing
- Cloudflare D1 for accounts, sessions, scans and saved finds
- Better Auth with sign-in codes sent by email through Resend
- Meta Muse Spark 1.3 for recognition and web search
- Meta web search and retrieved product photos for candidate and similar-item comparisons

## Run locally

You need Node.js 22.18 or later and npm. The local app uses Wrangler’s local D1 SQLite and Durable Object simulation. It needs no Cloudflare account, remote database or Resend account.

```sh
npm ci
npm run dev
```

Open **http://localhost:8787**. The first run creates an ignored `.dev.vars.local` with a random Better Auth secret, applies local migrations, builds the browser assets and starts the Worker. Later runs preserve that file and your local data. `npm run setup:local` performs setup without starting the server. Restart `npm run dev` after editing browser code or local credentials.

Sign in with an email address. The terminal running the app prints only the six-digit sign-in code; local mode sends no email. Accounts, sessions and scans remain authenticated and use the local database. Console codes and HTTP session cookies are enabled only when `APP_ENVIRONMENT` is `local` and `BETTER_AUTH_URL` is a validated loopback origin.

For live recognition and comparisons, put **your own Meta API key** in the generated `.dev.vars.local`:

```dotenv
META_API_KEY="your-meta-api-key"
```

Restart the server after changing it. Without a key you can open the app, sign in and inspect the demo interface, but AI analysis is unavailable. This is not offline AI; enabled analysis sends images to Meta and consumes your provider allowance. The hosted app’s credentials are never shared. Keep `.dev.vars.local` private.

Local storage is isolated under `.wrangler/local-state`; the scripts explicitly use `wrangler.local.jsonc`, `--env local`, `--local` and the same persistence path for migrations and serving. The local configuration has no production database IDs or public Worker URL. The existing deployment configuration is separate.

Local setup leaves hosted trial enrollment disabled; authentication and scan budget checks still apply to your own-key runs.

## Host your own copy

For an HTTPS deployment, use your own Cloudflare account, D1 databases, Meta key and Resend account with a verified sending domain. Configure staging and production independently; protect staging separately from customer sign-in.

1. Create your own D1 database for each environment and replace the corresponding names and IDs in `wrangler.jsonc`. The supplied staging and production IDs belong to the hosted app. For example:

   ```sh
   npx wrangler d1 create ceval-staging
   npx wrangler d1 migrations apply ceval-staging --env staging --remote
   ```

2. Replace Worker names and `BETTER_AUTH_URL` with your own exact HTTPS origins. Enable `SIGNUPS_ENABLED` and `SCAN_ENABLED` explicitly when the deployment is ready. Set a scan budget and email allowance appropriate for your provider accounts.
3. Add your own secrets. `AUTH_EMAIL_FROM` must be your own verified sender; keep its value in Worker secrets.

   ```sh
   npx wrangler secret put BETTER_AUTH_SECRET --env staging
   npx wrangler secret put RESEND_API_KEY --env staging
   npx wrangler secret put AUTH_EMAIL_FROM --env staging
   npx wrangler secret put META_API_KEY --env staging
   ```

4. Deploy with `npm run deploy:staging` (or `npm run deploy:production` after repeating the steps with `--env production`).

`SIGNUPS_ENABLED`, `SCAN_ENABLED`, `SCAN_TOTAL_BUDGET_MICROS` and `EMAIL_DAILY_LIMIT` control access and deployment limits. Authentication and scan metering also apply locally. The deployment-wide estimated scan budget accepts at most 100,000,000 microdollars ($100); provider billing remains authoritative. Existing accounts and results remain available when new sign-ups or analysis are paused.

Checks: `npm run typecheck`, `npm test` and `npm run format:check`.

## Limits

- Prices are read from store pages at the time of the scan and exclude delivery and tax.
- Asking prices are what sellers ask, not what items sold for.
- Recognition can be wrong. When Ceval can’t confirm a model, it says so instead of guessing.

## Licence

The code is released under the MIT licence; see `LICENSE`.

Third-party material keeps its own terms: Inter, Archivo and IBM Plex Mono are under the SIL Open Font License (see `public/fonts`), and the Facebook logo is a Meta trademark used under Meta’s brand guidelines (see `src/client/assets/facebook.LICENSE.txt`).
