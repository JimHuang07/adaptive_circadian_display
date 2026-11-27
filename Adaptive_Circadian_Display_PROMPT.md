# Adaptive Circadian Display
## Personalized Screen Saturation Scheduling through Bayesian Optimization

### 1. Project Overview
Build a fully functional interactive web application demonstrating how Bayesian Optimization (BO) can personalize smartphone screen saturation schedules according to a user's daily routine, behavioral patterns, and subjective preferences.

The hypothesis is that dynamically adjusting screen saturation may reduce unnecessary smartphone engagement, support relaxation, and maintain usability during productive hours. Unlike fixed grayscale modes, provide continuous, gradual, personalized transitions. This is an academic HCI research prototype, not a commercial digital wellbeing application.

Demonstrate dynamic saturation control, time-dependent scheduling, interactive human feedback, Bayesian optimization, and trade-offs between distraction, calmness, productivity, and usability.

### 2. Technology Stack
- Frontend: React, TypeScript, Vite.
- Styling: Tailwind CSS.
- Visualization: Recharts.
- Backend: Python, FastAPI.
- BO: BoTorch or OpenBO.
- Persistence: LocalStorage or SQLite.

Keep the architecture modular. Run locally without paid APIs, authentication, or proprietary services.

### 3. UI/UX Design
Create a polished, minimalistic research dashboard with neutral backgrounds, clean typography, rounded cards, subtle borders, generous spacing, smooth animations, and English interface labels.

Desktop layout:

```text
+---------------------------------------------------------------+
| Adaptive Circadian Display           Simulation / Live Mode   |
+---------------------------+-----------------------------------+
| Smartphone Preview        | Saturation Schedule               |
|   +-------------------+   | [24-hour interactive chart]       |
|   | 08:30             |   |                                   |
|   | App Icons         |   | Schedule Parameters               |
|   | Social Feed       |   | Morning Saturation                |
|   | Colorful Content  |   | Daytime Saturation                |
|   +-------------------+   | Evening Saturation                |
| Saturation: 42%           | Morning / Evening Transition      |
| Time: 08:30               | Transition Duration               |
| [Play 24h Simulation]     | User Feedback                     |
|                           | [Submit Evaluation]               |
|                           | [Recommend Next Schedule]         |
+---------------------------+-----------------------------------+
| Bayesian Optimization Lab                                     |
| Convergence Chart | Objective Scores | History | Pareto Front |
| Current Candidate | Best Candidate                            |
+---------------------------------------------------------------+
```

### 4. Smartphone Preview
Create a realistic interactive smartphone mockup with three selectable screens:
- Home Screen: colorful app icons, wallpaper, simulated status-bar time, navigation dock.
- Social Media Screen: fictional feed, colorful photographs, profile pictures, likes, comments, notification badges.
- Productivity Screen: calendar, to-do list, color-coded tasks, charts.

Use fictional or locally generated content; do not connect to actual social media. Demonstrate how saturation affects different content types.

```css
.phone-display {
    filter: saturate(var(--saturation));
}
```

Saturation ranges from 0 (grayscale) to 1 (full color), with intermediate values 0.25, 0.5, and 0.75. Apply the filter only to the phone display, not the dashboard. Add smooth transitions.

### 5. Time Simulation
Provide a 24-hour timeline with a draggable 00:00–23:59 time slider, instant saturation updates, accelerated playback, pause/resume, reset, and adjustable playback speed. Display simulated time, saturation percentage, and daily phase (sleep, morning calm, morning transition, productive hours, evening transition, wind-down). Optionally compare full color and adjusted displays side by side.

### 6. Saturation Schedule Model
Define a continuous piecewise-linear function S(t; x) in [0, 100], where t is time of day and x is the schedule parameter vector.

| Parameter | Description | Range | Default |
|---|---|---|---|
| s_m | Morning saturation | 0–60% | 20% |
| s_d | Daytime saturation | 60–100% | 100% |
| s_n | Nighttime saturation | 0–40% | 0% |
| t_m | Morning transition start | 07:00–09:00 | 08:00 |
| t_n | Evening transition start | 19:00–22:00 | 21:00 |
| tau | Transition duration | 30–180 min | 120 min |

Use a shared morning/evening transition duration initially. Let users configure wake-up and bedtime separately.

Maintain nighttime saturation until wake-up; use a short fixed transition to morning saturation; gradually increase to daytime saturation at t_m; maintain daytime saturation; gradually decrease to nighttime saturation at t_n; maintain nighttime saturation until the next morning. Validate non-overlapping transitions and wake-up/bedtime constraints.

### 7. Interactive Schedule Visualization
Create a 24-hour line chart with a 0–100% saturation axis, highlighted daily phases, current-time vertical marker, tooltips, instant parameter updates, click-to-seek interaction, and subtle area gradient.

Support current, previous, best observed, and baseline schedules. Include Full Color, Always Grayscale, Fixed Bedtime Grayscale, and Adaptive Saturation presets.

### 8. Parameter Control Panel
Provide sliders/time inputs for all six variables, displaying names, values, ranges, and explanations. Include Reset to Defaults, Randomize Schedule, Save Current Schedule, Restore Best Schedule, and Recommend Next Schedule. Connect all controls to the model and preview.

### 9. User Evaluation
Support two distinct modes.

**Human-in-the-Loop:** Collect 1–10 ratings for calmness, focus, usability, and visual comfort. Optionally accept daily social media minutes and unnecessary phone openings. Submit Evaluation stores parameters and feedback as an observation. Explain that a brief web preview evaluates visual preferences, not reliable real-world productivity or usage; behavioral evaluation requires a longer field study.

**Simulated User:** Create a synthetic user with hidden ideal morning/daytime/nighttime saturation, transition times, and duration. Use nonlinear objectives with parameter interactions, conflicting objectives, multiple local optima, and configurable noise. Include focus-oriented student, creative professional, relaxation-oriented user, and custom profiles. The optimizer must only receive evaluation results, not hidden preferences or the objective implementation. Label all simulated results as synthetic.

### 10. Objective Functions
Support single- and multi-objective optimization. For simulated users define normalized objectives:
- D(x): distraction, minimize.
- C(x): calmness, maximize.
- P(x): productivity, maximize.
- U(x): usability, maximize.

For human evaluation, use available subjective ratings; include behavioral metrics only when explicitly supplied.

Standard BO: f(x) = -w1 D(x) + w2 C(x) + w3 P(x) + w4 U(x). Allow adjustable weights normalized to sum to 1.

Multi-objective BO: optimize objectives independently using a suitable acquisition function such as qNEHVI. Visualize Pareto-optimal schedules and allow selection of two objectives for a 2D visualization.

### 11. Bayesian Optimization Engine
Implement genuine BO, not random search presented as BO.
1. Generate initial feasible candidates with Sobol or another space-filling method.
2. Evaluate using the selected mode.
3. Store parameters and objective values.
4. Fit a Gaussian Process surrogate.
5. Use an acquisition function to balance exploration and exploitation.
6. Recommend the next feasible candidate.
7. Evaluate it and update the model.
8. Repeat until the evaluation budget is reached.

Use Expected Improvement or a noise-aware variant for single-objective optimization, and a suitable multi-objective acquisition function for multi-objective BO. Normalize inputs before fitting.

Controls: initial sample count, maximum iterations, observation noise, optimization mode, random seed. Provide Step, Run (automatic in simulation mode), and Stop. In human mode, wait for feedback before proceeding.

### 12. Optimization Dashboard
- Convergence plot: iteration, observed score, best observed score; update after each evaluation.
- Candidate comparison: initial, current, and best observed parameter values; load any into the phone preview.
- Objective scores: individual values as bars or radar chart.
- Pareto front: evaluated, non-dominated, and selected candidates; objective trade-offs.
- History table: iteration, six parameters, individual scores, weighted utility when applicable, evaluation mode, candidate status. Click rows to inspect schedules. Export CSV or JSON.
- Optimization explanation: explain recommendations using actual predictions, acquisition values, or parameter comparisons. Do not invent unsupported reasoning.

### 13. Baseline Comparison
Compare BO with random search using the same synthetic user, evaluation budget, initial observations, and comparable observation noise. Plot both convergence curves. Do not guarantee BO always outperforms random search.

### 14. Software Architecture
```text
adaptive-circadian-display/
├── frontend/
│   └── src/
│       ├── components/
│       │   ├── PhonePreview.tsx
│       │   ├── TimeSimulator.tsx
│       │   ├── ScheduleChart.tsx
│       │   ├── ParameterPanel.tsx
│       │   ├── FeedbackPanel.tsx
│       │   ├── OptimizationDashboard.tsx
│       │   ├── ConvergenceChart.tsx
│       │   ├── ParetoFront.tsx
│       │   └── HistoryTable.tsx
│       ├── hooks/
│       ├── services/api.ts
│       ├── utils/saturation.ts
│       ├── types/
│       └── App.tsx
├── backend/
│   ├── main.py
│   ├── models.py
│   ├── optimizer.py
│   ├── simulated_user.py
│   ├── objectives.py
│   ├── constraints.py
│   ├── history.py
│   └── requirements.txt
├── tests/
└── README.md
```
Keep the saturation model, evaluation, and optimizer independent of the UI.

### 15. Development Priorities
**Phase 1 — Interactive Visual Demo:** phone mockup, saturation filter, time simulation, six parameters, interactive chart, baseline presets.

**Phase 2 — Bayesian Optimization:** Python backend, synthetic user, GP surrogate, acquisition function, iterative recommendations, convergence visualization.

**Phase 3 — Human-in-the-Loop:** manual feedback, candidate history, persistent observations, personalized recommendations.

**Phase 4 — Advanced Features:** multi-objective BO, Pareto front, random search comparison, multiple simulated profiles.

Prioritize fully functional Phases 1 and 2 before advanced features.

### 16. Acceptance Criteria
The MVP must allow users to:
1. Open the application locally.
2. Adjust saturation and time parameters.
3. Observe real-time changes in the smartphone preview.
4. Simulate an entire day.
5. View the saturation curve.
6. Start a genuine BO experiment.
7. Observe new candidate schedules.
8. Inspect objective scores and optimization history.
9. Compare initial and best observed schedules.
10. Restore the best schedule into the preview.

Include a README with installation and execution instructions and tests for interpolation, parameter constraints, and optimization history. Do not leave placeholder buttons or non-functional core features. The final application should be visually polished, scientifically transparent, and suitable for an academic demonstration.

Start by implementing Phase 1. Verify all visual controls before proceeding to the backend and optimization engine.
