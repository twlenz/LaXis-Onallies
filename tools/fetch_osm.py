#!/usr/bin/env python3
"""Download the OpenStreetMap data the board is built from (Overpass API).

Writes tools/cache/osm_<name>.json. Re-running uses the cache unless --force.
Data (c) OpenStreetMap contributors, ODbL.
"""
import json
import pathlib
import sys
import time
import urllib.parse
import urllib.request

BBOX = (43.69, -91.37, 44.01, -91.02)  # south, west, north, east
B = ",".join(str(v) for v in BBOX)
CACHE = pathlib.Path(__file__).parent / "cache"
URL = "https://overpass-api.de/api/interpreter"

QUERIES = {
    "admin": f"""[out:json][timeout:180];
relation["boundary"="administrative"]["admin_level"~"^(6|7|8)$"]({B});
out geom;""",
    "water": f"""[out:json][timeout:180];
(
  way["natural"="water"]({B});
  relation["natural"="water"]({B});
  way["waterway"="riverbank"]({B});
  relation["waterway"="riverbank"]({B});
);
out geom({B});""",
    "roads": f"""[out:json][timeout:180];
way["highway"~"^(motorway|trunk|primary|secondary|motorway_link|trunk_link)$"]({B});
out geom tags;""",
    "pois": f"""[out:json][timeout:180];
(
  nwr["brand"~"Kwik (Trip|Star)"]({B});
  nwr["name"~"Kwik (Trip|Star)"]({B});
  nwr["aeroway"="aerodrome"]({B});
  nwr["amenity"="hospital"]({B});
  nwr["amenity"="townhall"]({B});
  node["place"]({B});
);
out center tags;""",
}


def fetch(name, query, force=False):
    CACHE.mkdir(exist_ok=True)
    out = CACHE / f"osm_{name}.json"
    if out.exists() and not force:
        print(f"cached {out}")
        return
    data = urllib.parse.urlencode({"data": query}).encode()
    for attempt in range(5):
        try:
            req = urllib.request.Request(URL, data=data, headers={"User-Agent": "laxis-onallies-boardgame/1.0"})
            with urllib.request.urlopen(req, timeout=300) as r:
                body = r.read()
            json.loads(body)
            out.write_bytes(body)
            print(f"wrote {out} ({len(body)//1024} KB)")
            return
        except Exception as e:  # noqa: BLE001
            wait = 2 ** (attempt + 2)
            print(f"{name}: {e}; retrying in {wait}s", file=sys.stderr)
            time.sleep(wait)
    raise SystemExit(f"failed to fetch {name}")


if __name__ == "__main__":
    force = "--force" in sys.argv
    for n, q in QUERIES.items():
        fetch(n, q, force)
