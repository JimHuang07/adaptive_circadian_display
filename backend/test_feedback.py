import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from uuid import uuid4

from .feedback import RATINGS, handle_feedback
from .test_experiment import START


class FeedbackTest(unittest.TestCase):
    def setUp(self):
        temp = TemporaryDirectory(dir=".")
        self.addCleanup(temp.cleanup)
        self.database = Path(temp.name) / "feedback.sqlite3"
        self.schedule = dict(START, wake=420, bed=1380)

    def call(self, action, schedule=None, **fields):
        return handle_feedback(action, dict(fields, schedule=schedule or self.schedule), self.database)

    def submit(self, schedule=None, **fields):
        body = dict(requestId=str(uuid4()), ratings=dict.fromkeys(RATINGS, 7)) | fields
        return self.call("submit", schedule, **body)

    def test_persistence_retry_and_routine_isolation(self):
        identifier = str(uuid4())
        first = self.submit(requestId=identifier, socialMinutes=0)
        self.assertEqual(self.submit(requestId=identifier, socialMinutes=0), first)
        self.assertEqual(self.call("history"), first)
        self.assertEqual(first["history"][0]["metrics"], {"socialMinutes": 0})
        self.assertEqual(self.call("history", self.schedule | {"wake": 419}), {"history": []})
        with self.assertRaises(ValueError):
            self.submit(requestId=identifier, socialMinutes=1)

    def test_recommendation_moves_from_exploration_to_expected_improvement(self):
        with self.assertRaises(ValueError):
            self.call("recommend")
        self.submit()
        first = self.call("recommend")
        self.assertIsNone(first["prediction"])
        self.assertNotEqual(first["schedule"], self.schedule)
        self.submit(first["schedule"])
        second = self.call("recommend")
        self.assertIsNone(second["prediction"])
        self.assertNotIn(second["schedule"], [first["schedule"], self.schedule])
        self.submit(second["schedule"])
        third = self.call("recommend")
        self.assertGreaterEqual(third["prediction"]["improvement"], 0)
        self.assertNotIn(third["schedule"], [first["schedule"], second["schedule"], self.schedule])
        self.assertEqual(len(self.call("history")["history"]), 3)

    def test_invalid_schedule_or_rating_is_rejected(self):
        with self.assertRaises(ValueError):
            self.submit(self.schedule | {"bed": 1200})
        with self.assertRaises(ValueError):
            self.submit(ratings=dict.fromkeys(RATINGS, 11))
        self.assertEqual(self.call("history"), {"history": []})


if __name__ == "__main__":
    unittest.main()
