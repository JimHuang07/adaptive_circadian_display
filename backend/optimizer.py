"""Gaussian-process regression and expected improvement on a finite candidate pool."""
from math import erf, exp, pi, sqrt
from statistics import mean


def kernel(a, b):
    distance = sum((x - y)**2 for x, y in zip(a, b))
    return 0.18**2 * exp(-distance / (2 * 0.35**2))


def solve_lower(matrix, values):
    result = []
    for i, row in enumerate(matrix):
        result.append((values[i] - sum(row[j] * result[j] for j in range(i))) / row[i])
    return result


class GaussianProcess:
    def __init__(self, inputs, scores, noise):
        self.inputs = inputs
        self.center = mean(scores)
        self.lower = []
        for i, x in enumerate(inputs):
            row = []
            for j in range(i):
                other = self.lower[j]
                residual = kernel(x, inputs[j]) - sum(row[k] * other[k] for k in range(j))
                row.append(residual / other[j])
            row.append(sqrt(kernel(x, x) + noise**2 + 1e-8 - sum(v*v for v in row)))
            self.lower.append(row)
        self.whitened = solve_lower(self.lower, [v - self.center for v in scores])

    def predict(self, point):
        cross = solve_lower(self.lower, [kernel(x, point) for x in self.inputs])
        prediction = self.center + sum(a * b for a, b in zip(cross, self.whitened))
        variance = max(0, kernel(point, point) - sum(v*v for v in cross))
        return prediction, sqrt(variance)


def recommend(inputs, scores, candidates, noise):
    gp = GaussianProcess(inputs, scores, noise)
    incumbent = max(gp.predict(point)[0] for point in inputs)

    def acquisition(point):
        prediction, deviation = gp.predict(point)
        improvement = prediction - incumbent
        if deviation < 1e-10:
            return max(0, improvement), prediction, deviation
        z = improvement / deviation
        ei = improvement * (1 + erf(z / sqrt(2))) / 2 + deviation * exp(-z*z / 2) / sqrt(2*pi)
        return ei, prediction, deviation

    return max(((candidate, acquisition(point)) for candidate, point in candidates),
               key=lambda entry: entry[1][0])
