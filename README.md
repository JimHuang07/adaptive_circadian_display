# Adaptive Circadian Display

Adaptive Circadian Display is a browser-based research prototype for exploring how phone screen saturation could change throughout the day. Adjust a schedule, see it applied to a simulated phone, and try Bayesian optimization with either a synthetic student profile or your own ratings.

[Open the live demo](https://jimhuang07.github.io/adaptive_circadian_display/)

## Why we built it

Color can make a social feed more engaging, but it also helps people distinguish events on a calendar and scan a task list. A fixed grayscale setting applies the same trade-off throughout the day. We built this prototype to explore whether a personalized schedule can keep color where it helps and reduce it where someone prefers a quieter display.

The app changes the saturation of the simulated phone on the page. Synthetic scores demonstrate optimizer behavior, and human feedback records how a schedule felt in the preview. Measuring changes in real phone use, productivity, or sleep would require a separate study.

## Try it

1. **Explore a day.** Switch between the phone's home screen, social feed, and productivity view. Drag the time slider, click the schedule chart, or play the simulated day.
2. **Compare schedules.** Try full color, always grayscale, fixed bedtime grayscale, or adaptive saturation. Overlay a baseline and adjust morning, daytime, and nighttime saturation, transition timing, and duration around your wake-up and bedtime.
3. **Run a synthetic experiment.** Start with seed `42`, a budget of `20`, `5` initial samples, and noise `0.03`. Press **Run** to compare Bayesian optimization with random search. Inspect a candidate's scores and parameters, load it into the phone, or restore the best observed schedule.
4. **Give your own feedback.** Switch to **Human feedback** and rate calmness, perceived focus, usability, and visual comfort from 1 to 10. Optionally record social media minutes and unnecessary phone openings. Request another schedule, preview it, and export the saved evaluations as JSON.

Wake-up must leave 15 minutes before the morning transition, and the evening transition must finish by bedtime. A bedtime earlier on the clock than wake-up is treated as occurring the next day. Invalid edits keep the last valid schedule visible.

## How the optimizer works

The synthetic experiment evaluates the starting schedule, then uses seeded Halton samples to explore the feasible parameter space. It fits a Gaussian process to the observed scores and ranks 256 feasible candidates per Bayesian step using expected improvement. The random-search comparison uses the same initial observations, evaluation budget, and paired noise draws. The synthetic score balances lower distraction against higher calmness, productivity, and usability using adjustable weights.

In human mode, the first recommendations explore different schedules. After three distinct schedules have ratings for the same wake-up and bedtime, the optimizer uses expected improvement to suggest the next one. It weights the four ratings equally and uses optional usage observations as reference data.

## Architecture and data

- [`frontend/`](frontend/) contains the React and TypeScript app, the phone preview, and the Recharts dashboard. A Web Worker runs the optimizer so the interface stays responsive.
- [`backend/`](backend/) contains the original Python reference implementation. The live demo runs without a server.
- The last valid schedule and human evaluations are stored in LocalStorage for the current browser and site. Human history and JSON export are scoped to the current wake-up and bedtime. Synthetic runs stay in memory until you refresh. Existing SQLite records are kept separately and are not imported automatically.

## Run locally

Use Node.js 22.18 or newer. From the project directory, run the following commands and open the URL printed by Vite.

```sh
cd frontend
npm ci
npm run dev
```

To verify the TypeScript optimizer against the Python reference, install Python 3.10 or newer and run `npm test` from `frontend`. The tests compare seeded draws, predictions, acquisition values, optimization histories, and human recommendations. Set `PYTHON` if your interpreter uses a different command.

## Build and deploy

Run `npm run build` from `frontend` to create `frontend/dist`. Use the following commands to preview the build at the repository subpath.

```sh
npm run build -- --base /adaptive_circadian_display/
npx vite preview --configLoader runner --base /adaptive_circadian_display/
```

The [GitHub Pages workflow](.github/workflows/pages.yml) tests the app and builds it using the Pages base path. To deploy a fork, choose **GitHub Actions** under **Settings → Pages → Build and deployment**, then push to the default branch or run **Deploy GitHub Pages** manually from the Actions tab.
