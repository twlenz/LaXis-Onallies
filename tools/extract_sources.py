#!/usr/bin/env python3
"""Extract the open data the board uses into tools/data/ (run once; outputs are committed).

Sources (public domain / open):
  * US Census Bureau TIGER/Line 2025 primary & secondary roads, Wisconsin
    (tl_2025_55_prisecroads), as mirrored in github.com/Gabe-Z/WRFViewerApp
  * Kwik Trip / Kwik Star official store list with coordinates, as mirrored in
    github.com/JoshSol123/ProjectDS150
"""
import csv, json, sys, pathlib
import shapefile  # pyshp

S, N, W, E = 43.69, 44.01, -91.42, -91.05
OUT = pathlib.Path(__file__).parent / "data"

def roads(shp):
    sf = shapefile.Reader(shp)
    flds = [f[0] for f in sf.fields[1:]]
    feats = []
    for sr in sf.iterShapeRecords():
        pts = sr.shape.points
        if not any(W < x < E and S < y < N for x, y in pts):
            continue
        rec = dict(zip(flds, sr.record))
        feats.append({"type": "Feature", "properties": {"name": rec["FULLNAME"], "rttyp": rec["RTTYP"], "mtfcc": rec["MTFCC"]},
                      "geometry": {"type": "LineString", "coordinates": [[round(x, 5), round(y, 5)] for x, y in pts]}})
    (OUT / "roads.geojson").write_text(json.dumps({"type": "FeatureCollection", "features": feats}))
    print("roads:", len(feats))

def kwik(csvpath):
    rows = []
    for r in csv.DictReader(open(csvpath)):
        la, lo = float(r["Latitude"]), float(r["Longitude"])
        if S < la < N and W < lo < E:
            rows.append({k: r[k] for k in ("Store Number", "Store Name", "Address", "City", "Latitude", "Longitude", "Sells Gas")})
    with open(OUT / "kwiktrips.csv", "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader(); w.writerows(rows)
    print("kwik trips:", len(rows))

if __name__ == "__main__":
    roads(sys.argv[1]); kwik(sys.argv[2])
