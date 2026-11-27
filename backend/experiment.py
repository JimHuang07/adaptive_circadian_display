"""Synthetic preference evaluation and budget-matched experiment history."""
from random import Random

from .optimizer import recommend
from .synthetic_user import evaluate

FIELDS = ("morning", "daytime", "night", "morningStart", "eveningStart", "duration")
LIMITS = ((0, 60), (60, 100), (0, 40), (420, 540), (1140, 1320), (30, 180))
OBJECTIVES = ("distraction", "calmness", "productivity", "usability")


def normalized(candidate):
    return tuple((v - lo) / (hi - lo) for v, (lo, hi) in zip(candidate, LIMITS))


def radical_inverse(index, base):
    fraction = 0
    scale = 1 / base
    while index:
        index, digit = divmod(index, base)
        fraction += digit * scale
        scale /= base
    return fraction


def snap(value, low, high):
    return low + int(value * (high - low + 1))


class CandidateSpace:
    def __init__(self, routine, seed):
        self.wake = self.integer(routine, "wake", 0, 525)
        self.bed = self.integer(routine, "bed", 0, 1439)
        self.bed_end = self.bed + (1440 if self.bed < self.wake else 0)
        if self.bed_end < 1170:
            raise ValueError("The routine must allow an evening transition of at least 30 minutes.")
        self.pool_index = 1
        self.shift = [Random(seed + 3 + i).random() for i in range(6)]

    def parse(self, schedule):
        if not isinstance(schedule, dict):
            raise ValueError("Provide a schedule.")
        first = tuple(self.integer(schedule, key, *bounds) for key, bounds in zip(FIELDS, LIMITS))
        if self.wake + 15 > first[3] or first[3] + first[5] > first[4] or first[4] + first[5] > self.bed_end:
            raise ValueError("The schedule does not fit the routine.")
        return first

    def schedule(self, candidate):
        return dict(zip(FIELDS, candidate), wake=self.wake, bed=self.bed)

    def pool(self, excluded):
        candidates = {}
        while len(candidates) < 256:
            candidate = self.next_space_filling()
            if candidate not in excluded:
                candidates[candidate] = normalized(candidate)
        return candidates

    @staticmethod
    def integer(data, key, lo, hi):
        result = data.get(key)
        if type(result) is not int or not lo <= result <= hi:
            raise ValueError(f"{key} must be an integer from {lo} to {hi}.")
        return result

    def feasible(self, u):
        duration = snap(u[5], 30, min(180, self.bed_end - 1140))
        return (
            snap(u[0], 0, 60), snap(u[1], 60, 100), snap(u[2], 0, 40),
            snap(u[3], max(420, self.wake + 15), 540),
            snap(u[4], 1140, min(1320, self.bed_end - duration)), duration,
        )

    def next_space_filling(self):
        coords = [(radical_inverse(self.pool_index, prime) + shift) % 1
                  for prime, shift in zip((2, 3, 5, 7, 11, 13), self.shift)]
        self.pool_index += 1
        return self.feasible(coords)


class Experiment(CandidateSpace):
    def __init__(self, settings):
        seed = self.integer(settings, "seed", 0, 2**31 - 1)
        super().__init__(settings, seed)
        self.budget = self.integer(settings, "budget", 4, 40)
        self.initial_count = self.integer(settings, "initialCount", 3, min(10, self.budget - 1))
        self.noise = settings.get("noise")
        if type(self.noise) not in (int, float) or not 0 <= self.noise <= 0.15:
            raise ValueError("Noise must be between 0 and 0.15.")
        raw = settings.get("weights")
        if not isinstance(raw, list) or len(raw) != 4 or any(
            type(v) not in (int, float) or not 0 <= v <= 100 for v in raw
        ) or not sum(raw):
            raise ValueError("Provide four weights between 0 and 100 with a positive sum.")
        self.weights = [v / sum(raw) for v in raw]
        self.gaussian = Random(seed + 1)
        self.random = Random(seed + 2)
        self.initial = [self.parse(settings.get("schedule"))]
        while len(self.initial) < self.initial_count:
            candidate = self.next_space_filling()
            if candidate not in self.initial:
                self.initial.append(candidate)
        self.history = []
        self.baseline = []
        self.bo_seen = set()
        self.random_seen = set()

    def observe(self, candidate, noise, iteration, prediction=None):
        objectives = evaluate(candidate, noise)
        score = sum(weight * objectives[key] * (-1 if key == "distraction" else 1)
                    for key, weight in zip(OBJECTIVES, self.weights))
        return {
            "iteration": iteration,
            "schedule": self.schedule(candidate),
            "objectives": objectives, "score": score, "prediction": prediction,
        }

    def step(self):
        index = len(self.history)
        if index >= self.budget:
            return
        prediction = None
        if index < self.initial_count:
            candidate = baseline = self.initial[index]
        else:
            pool = self.pool(self.bo_seen)
            inputs = [normalized(tuple(row["schedule"][key] for key in FIELDS)) for row in self.history]
            scores = [row["score"] for row in self.history]
            noise_sd = self.noise * sum(w*w for w in self.weights)**0.5
            candidate, (ei, estimate, deviation) = recommend(inputs, scores, pool.items(), noise_sd)
            prediction = {"mean": estimate, "deviation": deviation, "improvement": ei}
            baseline = self.feasible([self.random.random() for _ in FIELDS])
            while baseline in self.random_seen:
                baseline = self.feasible([self.random.random() for _ in FIELDS])
        noise = [self.gaussian.gauss(0, self.noise) for _ in OBJECTIVES]
        self.history.append(self.observe(candidate, noise, index + 1, prediction))
        self.baseline.append(self.observe(baseline, noise, index + 1))
        self.bo_seen.add(candidate)
        self.random_seen.add(baseline)

    def snapshot(self):
        return {"budget": self.budget, "history": self.history,
                "baseline": [{"iteration": row["iteration"], "score": row["score"]} for row in self.baseline]}
