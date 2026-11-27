import unittest

from .experiment import Experiment, FIELDS
from .optimizer import GaussianProcess

START = dict(zip(FIELDS, (20, 100, 0, 480, 1260, 120)))
SETTINGS = dict(wake=420, bed=1380, schedule=START, budget=12, initialCount=4,
                seed=42, noise=0.03, weights=[25]*4)


class ExperimentTest(unittest.TestCase):
    def test_run_is_reproducible_budgeted_and_feasible(self):
        first, second = Experiment(SETTINGS), Experiment(SETTINGS)
        for _ in range(15):
            first.step()
            second.step()
        self.assertEqual(first.snapshot(), second.snapshot())
        self.assertEqual(len(first.history), 12)
        self.assertEqual(first.history[:4], first.baseline[:4])
        self.assertTrue(all(row["prediction"]["improvement"] >= 0 for row in first.history[4:]))
        self.assertEqual(len(first.bo_seen), 12)
        for row in first.history + first.baseline:
            schedule = row["schedule"]
            self.assertLessEqual(schedule["wake"] + 15, schedule["morningStart"])
            self.assertLessEqual(schedule["eveningStart"] + schedule["duration"], schedule["bed"])
            self.assertTrue(all(0 <= value <= 1 for value in row["objectives"].values()))

    def test_noiseless_gp_learns_observations(self):
        gp = GaussianProcess([(0,), (1,)], [0.2, 0.8], 0)
        prediction, sd = gp.predict((1,))
        self.assertAlmostEqual(prediction, 0.8, places=5)
        self.assertLess(sd, 0.001)

    def test_rejects_infeasible_initial_schedule_and_invalid_weights(self):
        for overrides in ({"bed": 1200}, {"weights": [0]*4}, {"noise": float("nan")}):
            with self.assertRaises(ValueError):
                Experiment(SETTINGS | overrides)


if __name__ == "__main__":
    unittest.main()
