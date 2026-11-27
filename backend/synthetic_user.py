"""Fictional student profile. The optimizer receives only evaluated utilities."""
from math import cos, exp, pi


def evaluate(schedule, noise):
    morning, daytime, night, start, evening, duration = schedule
    m, d, n = morning / 60, (daytime - 60) / 40, night / 40
    a, e, r = (start - 420) / 120, (evening - 1140) / 180, (duration - 30) / 150
    scores = (
        0.10 + 0.28*m + 0.25*n + 0.22*e*n + 0.13*d,
        0.87 - 0.50*(m - 0.24)**2 - 0.33*n - 0.20*(e + r - 0.9)**2 + 0.07*cos(4*pi*r),
        0.92 - 0.50*(d - 0.75)**2 - 0.38*(a + r - 0.72)**2 + 0.07*cos(4*pi*a),
        0.53 + 0.22*d + 0.15*n + 0.08*m + 0.13*exp(-12*(r - 0.45)**2),
    )
    return dict(zip(("distraction", "calmness", "productivity", "usability"),
                    (min(1, max(0, value + error)) for value, error in zip(scores, noise))))
