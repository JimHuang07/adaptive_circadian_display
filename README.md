# Adaptive Circadian Display

Explore how phone saturation changes across a day, then optimize a schedule for a synthetic student or use your own feedback. The app runs entirely in the browser.

## Develop locally

Use Node.js 22.18 or newer. From the project directory:

```sh
cd frontend
npm ci
npm run dev
```

Open the local URL printed by Vite. To build the static app, run `npm run build`. To preview a repository-subpath build locally, use:

```sh
npm run build -- --base /adaptive-circadian-display/
npx vite preview --configLoader runner --base /adaptive-circadian-display/
```

Open the preview URL with `/adaptive-circadian-display/` at the end. The build output is in `frontend/dist`.

## Deploy to GitHub Pages

1. Push the project to a GitHub repository, including `.github/workflows/pages.yml` and `frontend/package-lock.json`.
2. In **Settings → Pages → Build and deployment**, choose **GitHub Actions** as the source.
3. Push to the default branch or run **Deploy GitHub Pages** manually from the Actions tab. Open the deployment URL shown in the successful workflow run.

The workflow tests the port, builds with the base path reported by GitHub Pages, and publishes only `frontend/dist`. The same workflow supports repository subpaths and root sites. See [GitHub's Pages workflow documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages) and [Vite's Pages deployment guide](https://vite.dev/guide/static-deploy#github-pages).

## Explore and evaluate schedules

Choose a phone screen, scrub the time slider or click the chart, and play the simulated day at 1×, 2×, or 4×. Pick a preset or overlay a baseline. Wake-up must leave 15 minutes before the morning transition, and the evening transition must finish by bedtime. Bedtimes earlier than wake-up occur the next day. Invalid edits leave the last valid schedule visible.

In **Synthetic evaluation**, start an experiment, step through it or run the full budget, and inspect the convergence curves. The worker starts with the preview schedule and seeded, shifted Halton samples. It fits a Gaussian process on six normalized parameters using Cholesky factorization with diagonal jitter and evaluates expected improvement over 256 feasible candidates at each Bayesian step. Random search shares the initial observations, budget, and noise draws. Synthetic runs are held in memory for the current page session.

In **Human feedback**, rate four subjective criteria from 1 to 10 and optionally log daily usage observations. Request an exploratory schedule or, after rating three distinct schedules for the same wake-up and bedtime, a Bayesian recommendation. Load recommendations or past evaluations into the phone preview and export the routine's ratings as JSON. The optimizer uses the four ratings equally. Usage observations are saved for reference. Measuring changes in actual phone use or productivity requires a field study.

The last valid adaptive schedule and human evaluations are saved in this browser's LocalStorage, scoped to the app's address. Export ratings before changing browsers or clearing site data. The original Python backend and any SQLite records remain available as references. SQLite records are not imported into browser storage automatically.

## Verify against Python

Run `npm test` from `frontend` with Python 3.10 or newer on your path (or set `PYTHON` to the interpreter path). The tests compare seeded random draws, GP predictions, acquisition values, synthetic scores, full optimization runs, and human recommendations directly with the original Python code. Python is used for verification only. The static application requires no Python runtime or server.
