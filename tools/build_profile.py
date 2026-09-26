"""Build the Isle of Man skyline used by the weather view.

Downloads one SRTM 1 arc-second elevation tile (N54W005, which holds the whole
island) from the public AWS Terrain Tiles bucket, then draws the island in true
perspective as seen from a boat about 10 km east of Douglas, with the eye 6 m
above the sea. For each compass bearing across the view it walks out from the
boat and keeps the steepest angle up to the ground, allowing for the curve of
the earth and ordinary refraction. That gives three silhouettes, split by how
far away the ground is:

    near - ground within 11 km (Douglas Head, Onchan, the coast to Laxey)
    mid  - ground within 16.5 km (the hills behind Douglas and Laxey, Snaefell)
    far  - everything (North Barrule, the south and west, the north)

Each silhouette becomes one sheet of paper in the diorama. Bearings run from
AZ_LEFT to AZ_RIGHT, so index 0 is the south-west (Langness) and the last index
is due north (Maughold Head), left to right for a viewer facing west.
Values are hundredths of a degree above level, and 0 means open sea. The page
applies its own vertical stretch.

Usage:
    python3 tools/build_profile.py            # writes profile.js beside index.html
    python3 tools/build_profile.py --points 900

Needs network access for one download of about 2.7 MB. No third-party
packages. The page itself never calls an elevation service.
"""

import argparse
import array
import gzip
import json
import math
import urllib.request
from pathlib import Path

TILE_URL = "https://s3.amazonaws.com/elevation-tiles-prod/skadi/N54/N54W005.hgt.gz"
TILE_NORTH, TILE_WEST = 55.0, -5.0
LAT_ISLAND_MAX = 54.45  # the tile also holds the Mull of Galloway
EYE_LAT, EYE_LON, EYE_HEIGHT = 54.150, -4.310, 6.0
AZ_LEFT, AZ_RIGHT = 239.0, 364.0
NEAR_M, MID_M, FAR_M = 11000, 16500, 45000
EARTH_RADIUS, REFRACTION = 6371000.0, 0.13
METRES_PER_DEGREE_LAT = 111320.0
OUT = Path(__file__).resolve().parent.parent / "profile.js"


def load_tile():
    with urllib.request.urlopen(TILE_URL, timeout=60) as response:
        raw = gzip.decompress(response.read())
    size = math.isqrt(len(raw) // 2)
    grid = array.array("h")
    grid.frombytes(raw)
    grid.byteswap()  # .hgt files are big-endian
    return grid, size


def sampler(grid, size):
    step = 1 / (size - 1)

    def height(lat, lon):
        if not TILE_NORTH - 1 < lat < LAT_ISLAND_MAX or not TILE_WEST < lon < TILE_WEST + 1:
            return 0.0
        r, c = (TILE_NORTH - lat) / step, (lon - TILE_WEST) / step
        r0, c0 = int(r), int(c)
        fr, fc = r - r0, c - c0
        i = r0 * size + c0
        a, b, d, e = (max(grid[j], 0) for j in (i, i + 1, i + size, i + size + 1))
        return (a * (1 - fc) + b * fc) * (1 - fr) + (d * (1 - fc) + e * fc) * fr

    return height


def distances():
    d, out = 60.0, []
    while d < FAR_M:
        out.append(d)
        d += 15 if d < 4000 else 30 if d < 20000 else 60
    return out


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--points", type=int, default=720, help="points per silhouette (default 720)")
    args = parser.parse_args()

    height = sampler(*load_tile())
    metres_per_degree_lon = METRES_PER_DEGREE_LAT * math.cos(math.radians(EYE_LAT))
    steps = [(d, d * d / (2 * EARTH_RADIUS) * (1 - REFRACTION)) for d in distances()]

    far, mid, near = [], [], []
    for i in range(args.points):
        bearing = math.radians(AZ_LEFT + (AZ_RIGHT - AZ_LEFT) * i / (args.points - 1))
        north, east = math.cos(bearing), math.sin(bearing)
        best = {"near": 0.0, "mid": 0.0, "far": 0.0}
        for d, drop in steps:
            h = height(EYE_LAT + d * north / METRES_PER_DEGREE_LAT, EYE_LON + d * east / metres_per_degree_lon)
            if h <= 0:
                continue
            angle = math.degrees(math.atan2(h - EYE_HEIGHT - drop, d))
            for key, limit in (("near", NEAR_M), ("mid", MID_M), ("far", FAR_M)):
                if d <= limit and angle > best[key]:
                    best[key] = angle
        far.append(round(best["far"] * 100))
        mid.append(round(best["mid"] * 100))
        near.append(round(best["near"] * 100))

    profile = {
        "source": "SRTM 1 arc-second, AWS Terrain Tiles (skadi N54W005)",
        "view": "from a boat 10 km east of Douglas, eye 6 m, looking west; values are hundredths of a degree above level",
        "eye": {"lat": EYE_LAT, "lon": EYE_LON, "height": EYE_HEIGHT},
        "azLeft": AZ_LEFT,
        "azRight": AZ_RIGHT,
        "far": far,
        "mid": mid,
        "near": near,
    }
    OUT.write_text("window.MANX_PROFILE = " + json.dumps(profile, separators=(",", ":")) + ";\n")
    print(f"{args.points} bearings from {AZ_LEFT} to {AZ_RIGHT}, highest {max(far) / 100:.2f} deg, written to {OUT} ({OUT.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
