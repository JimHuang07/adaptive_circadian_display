"""Persistent human ratings and routine-specific schedule recommendations."""
import json
import sqlite3
from contextlib import closing
from pathlib import Path
from statistics import mean
from uuid import UUID

from .experiment import CandidateSpace, normalized
from .optimizer import recommend

DATABASE = Path(__file__).with_name("feedback.sqlite3")
RATINGS = ("calmness", "focus", "usability", "visualComfort")
METRICS = {"socialMinutes": 1440, "unnecessaryOpenings": 10000}


def handle_feedback(action, request, database=None):
    schedule = request.get("schedule")
    if not isinstance(schedule, dict):
        raise ValueError("Provide the current adaptive schedule.")
    space = CandidateSpace(schedule, seed=42)
    current = space.parse(schedule)
    with closing(sqlite3.connect(database or DATABASE)) as connection, connection:
        connection.execute("""
            CREATE TABLE IF NOT EXISTS evaluations (
                id INTEGER PRIMARY KEY, request_id TEXT UNIQUE NOT NULL,
                wake INTEGER NOT NULL, bed INTEGER NOT NULL, payload TEXT NOT NULL
            )
        """)
        if action == "submit":
            request_id = request.get("requestId")
            if not isinstance(request_id, str):
                raise ValueError("Provide a submission ID.")
            request_id = UUID(request_id).hex
            ratings = request.get("ratings")
            if not isinstance(ratings, dict):
                raise ValueError("Provide all four ratings.")
            ratings = {key: space.integer(ratings, key, 1, 10) for key in RATINGS}
            metrics = {key: space.integer(request, key, 0, maximum)
                       for key, maximum in METRICS.items() if request.get(key) is not None}
            payload = json.dumps({
                "schedule": space.schedule(current), "ratings": ratings,
                "score": (mean(ratings.values()) - 1) / 9, "metrics": metrics,
            })
            connection.execute("""
                INSERT INTO evaluations (request_id, wake, bed, payload) VALUES (?, ?, ?, ?)
                ON CONFLICT(request_id) DO NOTHING
            """, (request_id, space.wake, space.bed, payload))
            accepted, = connection.execute("SELECT payload FROM evaluations WHERE request_id = ?", (request_id,)).fetchone()
            if accepted != payload:
                raise ValueError("This submission ID already belongs to another evaluation.")

        rows = connection.execute(
            "SELECT id, payload FROM evaluations WHERE wake = ? AND bed = ? ORDER BY id DESC",
            (space.wake, space.bed),
        )
        history = [dict(json.loads(payload), id=row_id) for row_id, payload in rows]

    if action == "recommend":
        return next_candidate(space, current, history)
    return {"history": history}


def next_candidate(space, current, history):
    if not history:
        raise ValueError("Submit an evaluation before requesting a recommendation.")
    scores = {}
    for row in history:
        candidate = space.parse(row["schedule"])
        scores.setdefault(candidate, []).append(row["score"])
    pool = space.pool(scores.keys() | {current})
    latest = list(scores)[:40]
    inputs = [normalized(candidate) for candidate in latest]
    if len(inputs) < 3:
        def distance_from_observations(point):
            return min(sum((a - b)**2 for a, b in zip(point, other)) for other in inputs)

        candidate = max(pool, key=lambda item: distance_from_observations(pool[item]))
        prediction = None
    else:
        candidate, (improvement, estimate, deviation) = recommend(
            inputs, [mean(scores[candidate]) for candidate in latest], pool.items(), noise=0.08,
        )
        prediction = {"mean": estimate, "deviation": deviation, "improvement": improvement}
    return {"schedule": space.schedule(candidate), "prediction": prediction}
