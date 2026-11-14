#!/usr/bin/env python3
"""Build the LaXis & OnAllies board.

Inputs : tools/board_config.py   hand-drawn shorelines, city outline, neighborhood seeds
         tools/data/roads.geojson Census TIGER primary/secondary roads (public domain)
         tools/data/kwiktrips.csv Kwik Trip store list with coordinates
Outputs: game/js/mapdata.js       board for the digital game and the print tools
         tools/data/report.txt    territory / adjacency report

Method
  * Work in a local kilometre grid.
  * Inside the wall: Voronoi cells around neighborhood seeds, clipped to the
    city outline and shoreline (French Island separately).
  * Outside: three concentric distance bands around the wall (1.3 km, 3.4 km,
    beyond), each cut into sectors by where they face the wall. Zombies step
    one band inward per turn. West of the river, a three-territory spoke runs
    across the Cass Street bridge (Pettibone, La Crescent, Minnesota bluffs).
  * Walls on every inside/outside border; a wall is a GATE where a state, US
    or interstate highway crosses it (plus the Cass Street bridge).
  * Display: kilometres -> SVG units with a mild fisheye so the city core gets room.
"""
import csv
import json
import math
import pathlib
import sys
from collections import defaultdict, deque

import shapely
from shapely.geometry import LineString, MultiPoint, MultiPolygon, Point, Polygon, box, GeometryCollection, MultiLineString
from shapely.ops import linemerge, polylabel, unary_union, transform
import warnings
warnings.filterwarnings('ignore', category=DeprecationWarning)

sys.path.insert(0, str(pathlib.Path(__file__).parent))
import board_config as C  # noqa: E402

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = ROOT / "tools" / "data"
F = C.FRAME
LAT0 = (F["south"] + F["north"]) / 2
LON0 = F["west"]
KX = 111.32 * math.cos(math.radians(LAT0))
KY = 110.57


def km(lat, lon):
    return ((lon - LON0) * KX, (F["north"] - lat) * KY)


def kpoly(pts):
    return Polygon([km(a, b) for a, b in pts]).buffer(0)


def kline(pts):
    return LineString([km(a, b) for a, b in pts])


W_KM = (F["east"] - F["west"]) * KX
H_KM = (F["north"] - F["south"]) * KY
FRAME = box(0, 0, W_KM, H_KM)
SVG_W = 1000.0
SVG_S = SVG_W / W_KM
SVG_H = H_KM * SVG_S
FISH_C = km(43.845, -91.225)
FISH_D = (1.1, 0.8)


def fish1(v, c, lo, hi, d):
    if d <= 0:
        return v
    if v >= c:
        span = hi - c
        t = (v - c) / span
        return c + span * ((d + 1) * t) / (d * t + 1)
    span = c - lo
    t = (c - v) / span
    return c - span * ((d + 1) * t) / (d * t + 1)


def to_svg_xy(x, y):
    return (fish1(x, FISH_C[0], 0, W_KM, FISH_D[0]) * SVG_S, fish1(y, FISH_C[1], 0, H_KM, FISH_D[1]) * SVG_S)


def to_svg(g):
    if not isinstance(g, Point):
        g = shapely.segmentize(g, 0.12)
    return transform(_tx, g)


def _tx(x, y):
    import numpy as np
    xs = np.asarray(x, dtype=float)
    ys = np.asarray(y, dtype=float)
    pts = [to_svg_xy(a, b) for a, b in zip(xs.ravel(), ys.ravel())]
    return (np.array([p[0] for p in pts]).reshape(xs.shape), np.array([p[1] for p in pts]).reshape(ys.shape))


def polys(g):
    if g is None or g.is_empty:
        return []
    if isinstance(g, Polygon):
        return [g]
    if hasattr(g, "geoms"):
        out = []
        for x in g.geoms:
            out += polys(x)
        return out
    return []


def lines(g):
    if g is None or g.is_empty:
        return []
    if isinstance(g, LineString):
        return [g]
    if hasattr(g, "geoms"):
        out = []
        for x in g.geoms:
            out += lines(x)
        return out
    return []


def path_d(g, prec=1):
    out = []
    for p in polys(g):
        for ring in [p.exterior] + list(p.interiors):
            pts = list(ring.coords)[:-1]
            out.append("M" + "L".join(f"{x:.{prec}f},{y:.{prec}f}" for x, y in pts) + "Z")
    return "".join(out)


def line_d(g, prec=1):
    out = []
    for ln in lines(g):
        pts = list(ln.coords)
        if len(pts) >= 2:
            out.append("M" + "L".join(f"{x:.{prec}f},{y:.{prec}f}" for x, y in pts))
    return "".join(out)


def main():
    rep = []
    # ---------------------------------------------------------------- land & water
    water = Polygon([km(a, b) for a, b in C.WI_SHORE] + [km(a, b) for a, b in C.MN_SHORE]).buffer(0)
    fi_land = kpoly(C.FRENCH_ISLAND)
    pett_land = kpoly(C.PETTIBONE)
    water = water.difference(fi_land).difference(pett_land).intersection(FRAME)
    mn = Polygon([km(a, b) for a, b in C.MN_SHORE] + [km(F["north"], F["west"]), km(F["south"], F["west"])]).buffer(0)
    mn = mn.intersection(FRAME).difference(water)
    wi_land = FRAME.difference(water).difference(mn).difference(fi_land).difference(pett_land)
    edge = kline(C.CITY_EDGE)
    s_end, n_end = C.CITY_EDGE[-1], C.CITY_EDGE[0]
    city_shape = Polygon([km(a, b) for a, b in C.CITY_EDGE] + [km(s_end[0], -91.31), km(n_end[0], -91.31)]).buffer(0)
    inside_main = max(polys(city_shape.intersection(wi_land)), key=lambda p: p.area)

    # ---------------------------------------------------------------- major roads (loaded early)
    road_geoms = []
    for f in json.loads((DATA / "roads.geojson").read_text())["features"]:
        p = f["properties"]
        if p["rttyp"] == "C":
            continue
        road_geoms.append((p["name"], p["rttyp"], LineString([km(lat, lon) for lon, lat in f["geometry"]["coordinates"]])))
    road_union = unary_union([ln for _, _, ln in road_geoms])

    def snap_to_road(pt, others, max_km=0.5, min_sep=0.45):
        q = road_union.interpolate(road_union.project(pt))
        if q.distance(pt) > max_km or any(q.distance(o) < min_sep for o in others):
            return pt
        return q

    # ---------------------------------------------------------------- inside territories
    terr = {}

    def voronoi_into(defs, region, group):
        seeds = []
        for d in defs:  # put each neighborhood astride its main road
            raw = Point(*km(*d["seed"]))
            sp = snap_to_road(raw, seeds)
            seeds.append(sp if region.buffer(-0.05).contains(sp) else raw)
        for s, d in zip(seeds, defs):
            assert region.buffer(0.01).contains(s), f"seed outside its region: {d['id']}"
        cells = shapely.voronoi_polygons(MultiPoint(seeds), extend_to=FRAME.buffer(5))
        for cell in cells.geoms:
            for s, d in zip(seeds, defs):
                if cell.contains(s):
                    g = cell.intersection(region)
                    parts = polys(g)
                    main = next((p for p in parts if p.buffer(0.01).contains(s)), max(parts, key=lambda p: p.area))
                    terr[d["id"]] = dict(d, group=group, inside=True, ring=0, geom=main,
                                         crumbs=[p for p in parts if p is not main])

    voronoi_into(C.LAX + C.ONA, inside_main, None)
    for d in C.LAX:
        terr[d["id"]]["group"] = "LAX"
    for d in C.ONA:
        terr[d["id"]]["group"] = "ONA"
    voronoi_into(C.FI, fi_land, "FI")

    # ---------------------------------------------------------------- outside rings
    outside = wi_land.difference(inside_main)
    b1 = inside_main.buffer(C.RING_KM[0], quad_segs=16)
    b2 = inside_main.buffer(C.RING_KM[1], quad_segs=16)
    bands = [outside.intersection(b1), outside.intersection(b2).difference(b1), outside.difference(b2)]
    # sectors by the position (0..1 along the city edge) of the nearest wall point
    n_s = 600
    samples = [edge.interpolate(i / (n_s - 1), normalized=True) for i in range(n_s)]
    vor = shapely.voronoi_polygons(MultiPoint(samples), extend_to=FRAME.buffer(20))
    cell_t = []
    for cell in vor.geoms:
        c = cell.representative_point()
        best = min(range(n_s), key=lambda i: samples[i].distance(c) if cell.contains(samples[i]) else 1e9)
        cell_t.append((cell, best / (n_s - 1)))
    out_ids = []
    # where highways leave the city: sector centres, so roads run down the middle of ring territories
    crossings = sorted(edge.project(pt, normalized=True) for _, rt, ln in road_geoms if rt in "IUS"
                       for pt in [g for g in getattr(ln.intersection(edge), "geoms", [ln.intersection(edge)]) if isinstance(g, Point)])
    merged_c = []
    for t in crossings:
        if merged_c and t - merged_c[-1] < 0.03:
            merged_c[-1] = (merged_c[-1] + t) / 2
        else:
            merged_c.append(t)

    def centres_for(n):
        c = list(merged_c)
        while len(c) > n:  # merge the closest pair
            i = min(range(len(c) - 1), key=lambda i: c[i + 1] - c[i])
            c[i:i + 2] = [(c[i] + c[i + 1]) / 2]
        while len(c) < n:  # fill the biggest gap (ends count as gaps to 0 and 1)
            pts = [0.0] + c + [1.0]
            gaps = [(pts[i + 1] - pts[i]) * (0.5 if i in (0, len(pts) - 2) else 1) for i in range(len(pts) - 1)]
            i = max(range(len(gaps)), key=lambda i: gaps[i])
            new = pts[i + 1] - 0.5 * (pts[i + 1] - pts[i]) if 0 < i < len(pts) - 2 else (pts[1] / 2 if i == 0 else (pts[-2] + 1) / 2)
            c = sorted(c + [new])
        return c

    def even_nudged(n):
        cs = []
        for i in range(n):
            e = (i + 0.5) / n
            near = [t for t in merged_c if abs(t - e) < 0.35 / n]
            cs.append(min(near, key=lambda t: abs(t - e)) if near else e)
        return cs

    for k, band in enumerate(bands):
        n = C.RING_SECTORS[k]
        cs = even_nudged(n) if k == 2 else centres_for(n)
        bounds = [0.0] + [(cs[i] + cs[i + 1]) / 2 for i in range(n - 1)] + [1.0001]
        for j in range(n):
            lo, hi = bounds[j], bounds[j + 1]
            sector = unary_union([c for c, t in cell_t if lo <= t < hi])
            g = band.intersection(sector)
            parts = sorted(polys(g), key=lambda p: -p.area)
            if not parts:
                continue
            tid = f"r{k + 1}_{j + 1}"
            terr[tid] = dict(id=tid, group="OUT", inside=False, ring=k + 1, sector=j, tmid=cs[j],
                             geom=parts[0], crumbs=parts[1:])
            out_ids.append(tid)

    # west spoke
    for d in C.WEST:
        if d["id"] == "w_pettibone":
            g = pett_land
        else:
            r0, r1 = d["radius_km"]
            c = Point(*km(*C.WEST_CENTER))
            ring_shape = c.buffer(r1, quad_segs=24).difference(c.buffer(r0, quad_segs=24)) if r0 else c.buffer(r1, quad_segs=24)
            g = max(polys(mn.intersection(ring_shape)), key=lambda p: p.area)
        terr[d["id"]] = dict(d, group="OUT", inside=False, geom=g, crumbs=[], west=True)
        out_ids.append(d["id"])
    mn_rest = mn.difference(unary_union([terr["w_lacrescent"]["geom"], terr["w_mnbluffs"]["geom"]]))

    # crumbs: merge into the touching territory of the same kind with the longest border, else drop
    dropped = []
    all_ids = list(terr)
    for tid in all_ids:
        for c in terr[tid].pop("crumbs"):
            best, bl = None, 0.0
            for o in all_ids:
                if terr[o]["inside"] != terr[tid]["inside"]:
                    continue
                L = c.buffer(0.02).intersection(terr[o]["geom"].boundary).length
                if L > bl:
                    best, bl = o, L
            if best and bl > 0.05:
                terr[best]["geom"] = unary_union([terr[best]["geom"], c]).buffer(0.001).buffer(-0.001)
            else:
                dropped.append(c)
    for tid in all_ids:  # keep single polygons
        ps = polys(terr[tid]["geom"])
        big = max(ps, key=lambda p: p.area)
        dropped += [p for p in ps if p is not big]
        terr[tid]["geom"] = big

    # ---------------------------------------------------------------- caricature: chunky shared-edge simplification
    ids = list(terr)
    simp = shapely.coverage_simplify([terr[t]["geom"] for t in ids], 0.22)
    for t, g in zip(ids, simp):
        terr[t]["geom"] = max(polys(g.buffer(0)), key=lambda p: p.area)

    # ---------------------------------------------------------------- adjacency
    ids = list(terr)
    adj = defaultdict(set)
    shared = {}
    for i, a in enumerate(ids):
        for b in ids[i + 1:]:
            ga, gb = terr[a]["geom"], terr[b]["geom"]
            if ga.distance(gb) > 0.03:
                continue
            s = ga.buffer(0.03).intersection(gb.boundary)
            L = sum(l.length for l in lines(s)) if not s.is_empty else 0
            if L > 0.12:
                adj[a].add(b)
                adj[b].add(a)
                shared[(a, b)] = shared[(b, a)] = s

    def at(lat, lon):
        p = Point(*km(lat, lon))
        return min(ids, key=lambda t: terr[t]["geom"].distance(p))

    bridges = []
    for p1, p2, name in C.FI_BRIDGES + [(C.CASS_STREET_BRIDGE[0], C.CASS_STREET_BRIDGE[1], "Cass Street Bridge"),
                                       (C.PETTIBONE_LACRESCENT_BRIDGE[0], C.PETTIBONE_LACRESCENT_BRIDGE[1], "US-14/61 Bridge")]:
        a, b = at(*p1), at(*p2)
        assert a != b, name
        adj[a].add(b)
        adj[b].add(a)
        bridges.append(dict(a=a, b=b, name=name, geom=LineString([km(*p1), km(*p2)])))

    # ---------------------------------------------------------------- walls & gates
    walls = {}
    for a in ids:
        if not terr[a]["inside"]:
            continue
        for b in sorted(adj[a]):
            if terr[b]["inside"]:
                continue
            br = next((x for x in bridges if {x["a"], x["b"]} == {a, b}), None)
            if br:
                g = br["geom"]
                mid = g.interpolate(0.5, normalized=True)
                (x0, y0), (x1, y1) = g.coords[0], g.coords[-1]
                L = math.hypot(x1 - x0, y1 - y0)
                nx, ny = -(y1 - y0) / L * 0.25, (x1 - x0) / L * 0.25
                wg = LineString([(mid.x - nx, mid.y - ny), (mid.x + nx, mid.y + ny)])
            else:
                wg = linemerge(shared[(a, b)]) if not isinstance(shared[(a, b)], LineString) else shared[(a, b)]
            walls[f"{a}|{b}"] = dict(id=f"{a}|{b}", inside=a, outside=b, geom=wg, gate=bool(br), gateAt=None,
                                     gateRoads=set(["US-14/61 (Cass St)"] if br else []))
            if br:
                walls[f"{a}|{b}"]["gateAt"] = wg.interpolate(0.5, normalized=True)

    tree = shapely.STRtree([terr[t]["geom"] for t in ids])

    def which(pt):
        for k in tree.query(pt):
            if terr[ids[k]]["geom"].covers(pt):
                return ids[k]
        return None

    for name, rt, ln in road_geoms:
        n = max(2, int(ln.length / 0.04))
        prev = None
        for i in range(n + 1):
            pt = ln.interpolate(i / n, normalized=True)
            cur = which(pt)
            if cur and prev and cur != prev:
                key = f"{prev}|{cur}" if terr[prev]["inside"] else f"{cur}|{prev}"
                if key in walls:
                    w = walls[key]
                    w["gate"] = True
                    w["gateRoads"].add(name)
                    if w["gateAt"] is None:
                        w["gateAt"] = w["geom"].interpolate(w["geom"].project(pt))
            if cur:
                prev = cur

    # ---------------------------------------------------------------- zombie routes
    targets = [C.LAX[0]["id"], C.ONA[0]["id"]]
    dist = {t: math.inf for t in ids}
    dq = deque()
    for t in targets:
        dist[t] = 0
        dq.append(t)
    while dq:
        u = dq.popleft()
        for v in adj[u]:
            if dist[v] == math.inf:
                dist[v] = dist[u] + 1
                dq.append(v)

    def border_len(a, b):
        s = shared.get((a, b))
        return sum(l.length for l in lines(s)) if s is not None else 0

    for t in ids:
        T = terr[t]
        if t in targets:
            T["zombieNext"] = []
            continue
        cands = [v for v in adj[t] if dist[v] == dist[t] - 1]
        if not T["inside"]:
            # march inward: prefer the next ring in (then the wall), longest shared border
            ring = T.get("ring", 9)
            inward = [v for v in adj[t] if terr[v]["inside"] or terr[v].get("ring", 9) < ring]
            cands = inward or cands
            cands.sort(key=lambda v: (-border_len(t, v)))
            T["zombieNext"] = cands[:1]
        else:
            cands.sort(key=lambda v: -border_len(t, v))
            T["zombieNext"] = cands[:2]
        assert T["zombieNext"], f"{t} has nowhere to go"

    # ---------------------------------------------------------------- names, values, spawn
    for t in out_ids:
        T = terr[t]
        if T.get("west"):
            continue
        g = T["geom"]
        found = [p for p in C.PLACES if g.covers(Point(*km(p[1], p[2])))]
        found.sort(key=lambda p: -p[3])
        dir_name = sector_dir(T["tmid"])
        if found:
            T["name"] = found[0][0]
        elif T["ring"] == 1:
            inner = next((v for v in T["zombieNext"] if terr[v]["inside"]), T["zombieNext"][0])
            T["name"] = f'{terr[inner].get("short", terr[inner]["name"])} Outskirts'
        else:
            T["name"] = f'{dir_name} {"Coulees" if T["ring"] == 2 else "Farmland"}'
        T["short"] = T["name"]
        T["value"] = C.RING_VALUE[T["ring"] - 1]
        if found and found[0][3] >= 2 and T["ring"] < 3:
            T["value"] = found[0][3]
    ring3 = sorted([t for t in out_ids if terr[t].get("ring") == 3 and not terr[t].get("west")], key=lambda t: terr[t]["tmid"])
    assert len(ring3) == 6, ring3
    for i, t in enumerate(ring3):
        terr[t]["spawn"] = i + 1
        hw = sorted({n for n, rt, ln in road_geoms if rt in "IUS" and ln.intersects(terr[t]["geom"])})
        terr[t]["roads"] = hw
    # de-duplicate names (west to east along the wall)
    groups = defaultdict(list)
    for t in out_ids:
        groups[terr[t]["name"]].append(t)
    for name, ts in groups.items():
        if len(ts) < 2:
            continue
        ts.sort(key=lambda t: terr[t].get("tmid", 0))
        tags = ["West", "East"] if len(ts) == 2 else [str(i + 1) for i in range(len(ts))]
        for t, tag in zip(ts, tags):
            terr[t]["name"] = terr[t]["short"] = f"{name} {tag}"

    # ---------------------------------------------------------------- Kwik Trips
    kts = []
    for r in csv.DictReader(open(DATA / "kwiktrips.csv")):
        if r["Sells Gas"] != "Yes":
            continue
        p = Point(*km(float(r["Latitude"]), float(r["Longitude"])))
        t = which(p) or min(ids, key=lambda x: terr[x]["geom"].distance(p))
        if terr[t]["geom"].distance(p) > 0.6:
            continue
        kts.append(dict(p=p, tid=t, name=f'{r["Store Name"].title()} – {r["Address"].title()}, {r["City"].title()}'))
    for t in ids:
        terr[t]["kwikTrips"] = sum(1 for k in kts if k["tid"] == t)

    # ---------------------------------------------------------------- output
    out_t = []
    order = [d["id"] for d in C.LAX + C.ONA + C.FI] + sorted(out_ids, key=lambda t: (terr[t].get("ring", 0), t))
    for t in order:
        T = terr[t]
        gs = to_svg(T["geom"])
        lab = polylabel(gs, tolerance=0.5)
        so = T["group"] if T["group"] in ("LAX", "ONA") else None
        start = T.get("start") or (dict(C.DEFAULT_START) if so else {})
        if t in C.EXTRA_START:
            start = C.EXTRA_START[t]
        out_t.append(dict(
            id=t, name=T["name"], short=T.get("short", T["name"]), group=T["group"],
            region={"LAX": "La Crosse", "ONA": "Onalaska", "FI": "French Island", "OUT": "Outside"}[T["group"]],
            inside=T["inside"], ring=T.get("ring", 0), value=T.get("value", 0), kwikTrips=T["kwikTrips"],
            special=T.get("special", []), spawn=T.get("spawn"), startOwner=so, startUnits=start,
            adj=sorted(adj[t]), zombieNext=T["zombieNext"], label=[round(lab.x, 1), round(lab.y, 1)],
            area=round(gs.area), path=path_d(gs), roads=T.get("roads", [])))
    walls_out = []
    for i, w in enumerate(sorted(walls.values(), key=lambda w: (w["inside"], w["outside"]))):
        ga = to_svg(w["geom"])
        gate_xy = None
        if w["gate"]:
            gp = to_svg(w["gateAt"]) if w["gateAt"] is not None else ga.interpolate(0.5, normalized=True)
            gate_xy = [round(gp.x, 1), round(gp.y, 1)]
        walls_out.append(dict(id=w["id"], no=i + 1, inside=w["inside"], outside=w["outside"], gate=w["gate"],
                              gateAt=gate_xy, gateRoads=sorted(w["gateRoads"]), path=line_d(ga)))
    road_out = []
    land_union = unary_union([terr[t]["geom"] for t in ids]).buffer(0.02)
    in_water = 0.0
    for name, rt, ln in road_geoms:
        g = ln.intersection(FRAME)
        in_water += g.difference(land_union).length
        g = g.intersection(land_union)  # roads stay on land; bridges are drawn separately
        if g.is_empty:
            continue
        cls = {"I": "motorway", "U": "trunk", "S": "primary"}.get(rt, "secondary")
        road_out.append(dict(cls=cls, name=name, path=line_d(to_svg(g).simplify(0.4))))
    print(f"road length clipped off (water / outside the board's land): {in_water:.1f} km")
    water_out = [path_d(to_svg(p).simplify(0.3)) for p in polys(water)]
    backdrop = [dict(path=path_d(to_svg(p).simplify(0.4)), kind="mn") for p in polys(mn_rest)]
    backdrop += [dict(path=path_d(to_svg(p).simplify(0.4)), kind="island") for p in dropped if p.area > 0.02]
    river = to_svg(kline(C.LA_CROSSE_RIVER).intersection(inside_main.buffer(-0.02)))
    kt_out = []
    for k in kts:
        sp = to_svg(k["p"])
        kt_out.append(dict(x=round(sp.x, 1), y=round(sp.y, 1), name=k["name"], tid=k["tid"]))
    br_out = [dict(a=b["a"], b=b["b"], name=b["name"], path=line_d(to_svg(b["geom"]))) for b in bridges]
    mapdata = dict(
        viewBox=[0, 0, round(SVG_W, 1), round(SVG_H, 1)],
        attribution="Roads: US Census TIGER/Line. Kwik Trip locations: Kwik Trip store list. Shorelines and outlines hand-drawn.",
        territories=out_t, walls=walls_out, water=water_out, backdrop=backdrop, roads=road_out,
        rivers=[line_d(river)], bridges=br_out, kwikTrips=kt_out,
        cityHalls={"LAX": C.LAX[0]["id"], "ONA": C.ONA[0]["id"]},
        mnLabel=[round(v, 1) for v in to_svg_xy(*km(43.935, -91.385))],
        doodles=[dict(kind=k, x=round(xy[0], 1), y=round(xy[1], 1)) for k, xy in
                 [(k, to_svg_xy(*km(*ll))) for k, ll in C.DOODLES]],
    )
    js = ("/* Generated by tools/build_map.py. Do not edit by hand. */\n(function (root) {\nconst MAP = "
          + json.dumps(mapdata, separators=(",", ":"), ensure_ascii=False)
          + ";\nif (typeof module === 'object' && module.exports) module.exports = MAP; else root.LAXIS_MAP = MAP;\n"
          "})(typeof self !== 'undefined' ? self : this);\n")
    (ROOT / "game" / "js" / "mapdata.js").write_text(js)
    for t in out_t:
        rep.append(f'{t["id"]:18} {t["group"]:3} r{t["ring"]} v{t["value"]} kt{t["kwikTrips"]} sp{t["spawn"] or "-"} '
                   f'{t["name"][:34]:34} next={",".join(t["zombieNext"])} adj={",".join(t["adj"])}')
    for w in walls_out:
        rep.append(f'W{w["no"]:<3} {w["id"]:30} {"GATE " + ", ".join(w["gateRoads"]) if w["gate"] else ""}')
    rep.append(f"territories {len(out_t)}  walls {len(walls_out)}  gates {sum(w['gate'] for w in walls_out)}  kwik trips {len(kt_out)}")
    (DATA / "report.txt").write_text("\n".join(rep))
    print("\n".join(rep))


def sector_dir(t):
    # t runs along the city edge from the north-west (0) round the east to the south (1)
    dirs = ["Northwest", "North", "Northeast", "East", "Southeast", "South"]
    return dirs[min(5, int(t * 6))]


if __name__ == "__main__":
    main()
