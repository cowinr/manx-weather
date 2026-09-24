"""Build the Isle of Man skyline used by the weather view.

Downloads one SRTM 1 arc-second elevation tile (N54W005, which holds the whole
island) from the public AWS Terrain Tiles bucket, then collapses every row of
latitude (about 30 m apart) into three silhouettes as seen from the sea to the
east, looking west:

    far  - highest ground anywhere on that row (the true skyline)
    mid  - highest ground in the eastern two-thirds of the row's land
    near - highest ground in the eastern third of the row's land

Each silhouette becomes one sheet of paper in the diorama. Rows run south to
north, so index 0 is the Calf of Man and the last index is the Point of Ayre,
which is left to right for a viewer facing west. Adjacent rows are merged by
taking their maximum, so summits survive the thinning.

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
LAT_SOUTH, LAT_NORTH = 54.030, 54.425
LON_WEST, LON_EAST = -4.86, -4.30
OUT = Path(__file__).resolve().parent.parent / "profile.js"


def load_tile():
    with urllib.request.urlopen(TILE_URL, timeout=60) as response:
        raw = gzip.decompress(response.read())
    size = math.isqrt(len(raw) // 2)
    grid = array.array("h")
    grid.frombytes(raw)
    grid.byteswap()  # .hgt files are big-endian
    return grid, size


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--points", type=int, default=720, help="points per silhouette (default 720)")
    args = parser.parse_args()

    grid, size = load_tile()
    step = 1 / (size - 1)
    row_north = round((TILE_NORTH - LAT_NORTH) / step)
    row_south = round((TILE_NORTH - LAT_SOUTH) / step)
    col_west = round((LON_WEST - TILE_WEST) / step)
    col_east = round((LON_EAST - TILE_WEST) / step)

    far, mid, near = [], [], []
    for row in range(row_south, row_north - 1, -1):
        base = row * size
        land = [(col, grid[base + col]) for col in range(col_west, col_east + 1) if grid[base + col] > 0]
        if not land:
            far.append(0)
            mid.append(0)
            near.append(0)
            continue
        west, east = land[0][0], land[-1][0]
        span = max(east - west, 1)
        far.append(max(e for _, e in land))
        mid.append(max((e for c, e in land if c >= east - span * 2 / 3), default=0))
        near.append(max((e for c, e in land if c >= east - span / 3), default=0))

    def thin(values):
        chunk = len(values) / args.points
        return [max(values[int(i * chunk) : max(int((i + 1) * chunk), int(i * chunk) + 1)]) for i in range(args.points)]

    profile = {
        "source": "SRTM 1 arc-second, AWS Terrain Tiles (skadi N54W005)",
        "view": "from the east looking west; index 0 = south (Calf of Man)",
        "latSouth": LAT_SOUTH,
        "latNorth": LAT_NORTH,
        "far": thin(far),
        "mid": thin(mid),
        "near": thin(near),
    }
    OUT.write_text("window.MANX_PROFILE = " + json.dumps(profile, separators=(",", ":")) + ";\n")
    print(f"{len(far)} rows thinned to {args.points}, peak {max(far)} m, written to {OUT} ({OUT.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
