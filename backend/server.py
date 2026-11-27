"""Local JSON API and optional production frontend server."""
import json
import sqlite3
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Lock
from uuid import uuid4

from .experiment import Experiment
from .feedback import handle_feedback

DIST = Path(__file__).resolve().parents[1] / "frontend" / "dist"
EXPERIMENTS = {}
LOCK = Lock()


class Handler(SimpleHTTPRequestHandler):
    def respond(self, status, data):
        body = json.dumps(data, allow_nan=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        path = self.path.split("?")[0].strip("/").split("/")
        feedback = len(path) == 3 and path[:2] == ["api", "feedback"] and path[2] in {
            "history", "submit", "recommend"
        }
        if not feedback and path != ["api", "experiments"] and not (
            len(path) == 4 and path[:2] == ["api", "experiments"] and path[3] == "step"
        ):
            self.respond(404, {"error": "Unknown API route."})
            return
        try:
            if self.headers.get_content_type() != "application/json":
                raise ValueError("Use application/json for API requests.")
            size = int(self.headers.get("Content-Length", 0))
            if not 0 < size <= 8192:
                raise ValueError("Expected a small JSON request body.")
            request = json.loads(self.rfile.read(size))
            if not isinstance(request, dict):
                raise ValueError("Expected a JSON object.")
            if feedback:
                self.respond(200, handle_feedback(path[2], request))
                return
            with LOCK:
                if len(path) == 2:
                    experiment = Experiment(request)
                    identifier = uuid4().hex
                    EXPERIMENTS[identifier] = experiment
                    if len(EXPERIMENTS) > 64:
                        del EXPERIMENTS[next(iter(EXPERIMENTS))]
                else:
                    identifier = path[2]
                    experiment = EXPERIMENTS.get(identifier)
                    if experiment is None:
                        self.respond(404, {"error": "Experiment expired. Start a new experiment."})
                        return
                    expected = Experiment.integer(request, "expectedCount", 0, experiment.budget)
                    if expected > len(experiment.history):
                        raise ValueError("The requested step is ahead of the experiment.")
                    if expected == len(experiment.history):
                        experiment.step()
                snapshot = experiment.snapshot()
                snapshot["history"] = list(snapshot["history"])
            self.respond(201 if len(path) == 2 else 200, {"id": identifier, **snapshot})
        except ValueError as error:
            self.respond(400, {"error": str(error)})
        except sqlite3.Error as error:
            self.log_error("Feedback database error: %s", error)
            self.respond(503, {"error": "Feedback storage is unavailable. Try again."})


if __name__ == "__main__":
    with ThreadingHTTPServer(("127.0.0.1", 8000), partial(Handler, directory=DIST)) as http:
        print("Optimization API at http://127.0.0.1:8000", flush=True)
        http.serve_forever()
