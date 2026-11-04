# Ceval

See what it’s worth.

Ceval is a camera web app for shopping in physical stores. Point your phone at a product and Ceval names it, reads the shelf price, and finds the same model at other stores, with a link to every price. For things people resell, it keeps store prices, reported completed sales and asking prices apart, and opens a Facebook Marketplace search.

- **Live:** https://ceval.mbefe34.workers.dev
- **Demo video:** _link to be added_

New sign-ups on the hosted app are paused to protect its API budget. The demo video shows the app in use, and the steps below deploy your own copy.

## How it works

1. **On the phone.** The browser follows products in the camera view and compares each view with the ones it has already analysed. It sends a single still frame only when the view changes, and never uploads video. A video you choose from your library stays on the device in the same way.
2. **Recognition.** The Worker sends the frame to Meta’s Muse Spark 1.3 (`muse-spark-1.3`). The model detects the products in view, reads labels and shelf prices, and uses its `web_search` tool to find store pages in the shopper’s country.
3. **Checks.** An offer counts as the scanned product only when its store page supports it: the same model and variant, the same pack size, and a storefront for the shopper’s country. Anything else is dropped, and every price links to its source.
4. **When it isn’t sure.** If the exact model can’t be confirmed, Ceval says so. You can choose the product yourself, or search by photo for items that are labelled as similar.
5. **Saved finds.** Scans are saved to your account so you can come back to them.

## Stack

- React and Vite in the browser
- One Cloudflare Worker for the app and the API, with a Durable Object per account for scan processing
- Cloudflare D1 for accounts, sessions, scans and saved finds
- Better Auth with sign-in codes sent by email through Resend
- Meta Muse Spark 1.3 for recognition and web search
- Optional photo search for similar items through SerpApi (Google Lens); only product crops are sent

## Run your own copy

You need Node.js 22.18 or later, a Cloudflare account, a Meta API key for Muse Spark, and a Resend account with a verified sending domain. SerpApi is optional. Use your own accounts and keys; the hosted app’s keys are not part of this repository.

```sh
npm install
cp .dev.vars.example .dev.vars   # local values; never commit this file
```

1. Create a D1 database for each environment, put its ID in `wrangler.jsonc` (the IDs in this repository belong to the hosted app), and apply the migrations:

   ```sh
   npx wrangler d1 create ceval-staging
   npx wrangler d1 migrations apply ceval-staging --env staging --remote
   ```

2. Set `BETTER_AUTH_URL` in `wrangler.jsonc` to the HTTPS address your Worker will use.
3. Add the secrets:

   ```sh
   npx wrangler secret put BETTER_AUTH_SECRET --env staging
   npx wrangler secret put RESEND_API_KEY --env staging
   npx wrangler secret put AUTH_EMAIL_FROM --env staging
   npx wrangler secret put META_API_KEY --env staging
   npx wrangler secret put SERPAPI_API_KEY --env staging   # optional
   ```

4. Deploy with `npm run deploy:staging` (or `npm run deploy:production` after repeating the steps with `--env production`).

`SIGNUPS_ENABLED`, `SCAN_ENABLED`, `SCAN_TOTAL_BUDGET_MICROS` and `EMAIL_DAILY_LIMIT` in `wrangler.jsonc` control who can create an account and how much a deployment can spend.

Checks: `npm run typecheck`, `npm test` and `npm run format:check`.

## Limits

- Prices are read from store pages at the time of the scan and exclude delivery and tax.
- Asking prices are what sellers ask, not what items sold for.
- Recognition can be wrong. When Ceval can’t confirm a model, it says so instead of guessing.

## Licence

The code is released under the MIT licence; see `LICENSE`.

Third-party material keeps its own terms: Inter, Archivo and IBM Plex Mono are under the SIL Open Font License (see `public/fonts`), and the Facebook logo is a Meta trademark used under Meta’s brand guidelines (see `src/client/assets/facebook.LICENSE.txt`).
