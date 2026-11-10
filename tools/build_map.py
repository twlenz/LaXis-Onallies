#!/usr/bin/env python3
"""Build the LaXis & OnAllies board from cached OpenStreetMap data.

Inputs:  tools/cache/osm_*.json  (from fetch_osm.py), tools/board_config.py
Outputs: game/js/mapdata.js      (map for the digital game)
         print/board.svg         (printable board, via build_print.js)
         tools/cache/report.txt  (territory / adjacency report)

Method
  1. Project lon/lat to a local plane, then apply a mild separable fisheye so
     the dense city neighborhoods get more room on the board.
  2. Land = municipal polygons minus water polygons.
  3. Each group's land (La Crosse, Onalaska, French Island, Outside) is split
     into territories by Voronoi cells around hand-placed neighborhood seeds.
  4. Adjacency = shared land border, plus bridges found by walking the major
     road network across water.
  5. Walls = every border between an inside and an outside territory.
  6. Zombie road arrows = shortest path toward the nearest downtown, where
     crossing a border on a major highway is cheaper than going cross-country.
"""
import heapq
import json
import math
import pathlib
import sys

from shapely import STRtree, voronoi_polygons
from shapely.geometry import (GeometryCollection, LineString, MultiLineString, MultiPoint, MultiPolygon, Point,
                              Polygon, box)
from shapely.ops import linemerge, polylabel, transform, unary_union

sys.path.insert(0, str(pathlib.Path(__file__).parent))
import board_config as C  # noqa: E402

ROOT = pathlib.Path(__file__).resolve().parent.parent
CACHE = ROOT / "tools" / "cache"

S, N, W, E = 43.70, 44.00, -91.36, -91.03
LAT0 = (S + N) / 2
KX = math.cos(math.radians(LAT0))
SCALE = 4200.0
WIDTH = (E - W) * KX * SCALE
HEIGHT = (N - S) * SCALE
FISH_CENTER = (43.845, -91.232)  # between the two downtowns
FISH_D = 1.25


def proj_raw(lon, lat):
    return ((lon - W) * KX * SCALE, (N - lat) * SCALE)


CX, CY = proj_raw(FISH_CENTER[1], FISH_CENTER[0])


def fish1(v, c, lo, hi, d=FISH_D):
    """Sarkar–Brown graphical fisheye along one axis (monotonic)."""
    if v >= c:
        span = hi - c
        t = min(max((v - c) / span, 0), 1.5)
        return c + span * ((d + 1) * t) / (d * t + 1)
    span = c - lo
    t = min(max((c - v) / span, 0), 1.5)
    return c - span * ((d + 1) * t) / (d * t + 1)


def proj(lon, lat):
    x, y = proj_raw(lon, lat)
    return (fish1(x, CX, 0, WIDTH), fish1(y, CY, 0, HEIGHT))


def proj_xy(x, y, z=None):  # for shapely.ops.transform on lon/lat geometries
    import numpy as np
    x = np.asarray(x, dtype=float)
    y = np.asarray(y, dtype=float)
    out = [proj(a, b) for a, b in zip(x.ravel(), y.ravel())]
    xs = np.array([p[0] for p in out]).reshape(x.shape)
    ys = np.array([p[1] for p in out]).reshape(y.shape)
    return xs, ys


def load(name):
    return json.loads((CACHE / f"osm_{name}.json").read_text())["elements"]


# ------------------------------------------------------------- geometry
def ring_assemble(ways):
    """Join way coordinate lists into closed rings."""
    segs = [list(w) for w in ways if len(w) >= 2]
    rings = []
    while segs:
        cur = segs.pop()
        changed = True
        while changed and cur[0] != cur[-1]:
            changed = False
            for i, s in enumerate(segs):
                if s[0] == cur[-1]:
                    cur += s[1:]
                elif s[-1] == cur[-1]:
                    cur += s[::-1][1:]
                elif s[-1] == cur[0]:
                    cur = s[:-1] + cur
                elif s[0] == cur[0]:
                    cur = s[::-1][:-1] + cur
                else:
                    continue
                segs.pop(i)
                changed = True
                break
        if len(cur) >= 4 and cur[0] == cur[-1]:
            rings.append(cur)
    return rings


def coords(geom):
    return [(p["lon"], p["lat"]) for p in geom]


def rel_polygon(el):
    outers, inners = [], []
    for m in el.get("members", []):
        if m.get("type") != "way" or "geometry" not in m:
            continue
        (inners if m.get("role") == "inner" else outers).append(coords(m["geometry"]))
    polys = [Polygon(r).buffer(0) for r in ring_assemble(outers)]
    holes = [Polygon(r).buffer(0) for r in ring_assemble(inners)]
    if not polys:
        return None
    g = unary_union(polys)
    if holes:
        g = g.difference(unary_union(holes))
    return g


def way_polygon(el):
    c = coords(el.get("geometry", []))
    if len(c) >= 4 and c[0] == c[-1]:
        return Polygon(c).buffer(0)
    return None


def polys_of(g):
    if g is None or g.is_empty:
        return []
    if isinstance(g, Polygon):
        return [g]
    if isinstance(g, (MultiPolygon, GeometryCollection)):
        out = []
        for x in g.geoms:
            out += polys_of(x)
        return out
    return []


def to_path(g, prec=1):
    def ring(r):
        pts = list(r.coords)
        return "M" + "L".join(f"{x:.{prec}f},{y:.{prec}f}" for x, y in pts[:-1]) + "Z"
    parts = []
    for p in polys_of(g):
        parts.append(ring(p.exterior))
        parts += [ring(i) for i in p.interiors]
    return "".join(parts)


def line_path(g, prec=1):
    lines = []
    if isinstance(g, LineString):
        lines = [g]
    elif isinstance(g, (MultiLineString, GeometryCollection)):
        for x in g.geoms:
            if isinstance(x, LineString):
                lines.append(x)
            elif isinstance(x, MultiLineString):
                lines += list(x.geoms)
    out = []
    for ln in lines:
        pts = list(ln.coords)
        if len(pts) >= 2:
            out.append("M" + "L".join(f"{x:.{prec}f},{y:.{prec}f}" for x, y in pts))
    return "".join(out)


# ------------------------------------------------------------- inputs
def municipalities():
    out = {}
    for el in load("admin"):
        if el["type"] != "relation":
            continue
        t = el.get("tags", {})
        g = rel_polygon(el)
        if g is None or g.is_empty:
            continue
        out.setdefault((t.get("admin_level"), t.get("name", "?")), []).append((t, g))
    return out


def find_muni(munis, name, levels=("8", "7")):
    cands = []
    for (lvl, nm), items in munis.items():
        if lvl not in levels:
            continue
        for t, g in items:
            if nm == name or nm in (f"City of {name}", f"Village of {name}"):
                cands.append((lvl, t, g))
    # prefer cities/villages (8) over towns (7) with the same name
    cands.sort(key=lambda c: c[0], reverse=True)
    return cands[0][2] if cands else None


def find_town(munis, name):
    for (lvl, nm), items in munis.items():
        if nm in (f"Town of {name}",) or (lvl == "7" and nm == name):
            return items[0][1]
    return None


def water_union():
    gs = []
    for el in load("water"):
        g = rel_polygon(el) if el["type"] == "relation" else way_polygon(el)
        if g is not None and not g.is_empty:
            gs.append(g)
    return unary_union(gs)


def main():
    munis = municipalities()
    print("municipal polygons:", len(munis))
    report = []

    def P(g):
        return transform(proj_xy, g)

    frame = box(0, 0, WIDTH, HEIGHT)
    water = P(water_union()).buffer(0).intersection(frame)
    # ignore tiny ponds so they do not punch holes in neighborhoods
    water = unary_union([p for p in polys_of(water) if p.area > 60])

    lax = P(find_muni(munis, "La Crosse"))
    ona = P(find_muni(munis, "Onalaska"))
    fi = P(find_town(munis, "Campbell"))
    assert lax is not None and ona is not None and fi is not None, "municipal polygons missing"
    inside_union = unary_union([lax, ona, fi])
    lax = lax.difference(water)
    ona = ona.difference(water).difference(lax)
    fi = fi.difference(water).difference(lax).difference(ona)

    wi = []
    for (lvl, nm), items in munis.items():
        if lvl == "6" and nm in C.WISCONSIN_COUNTIES:
            wi += [P(g) for _, g in items]
    wisconsin = unary_union(wi).intersection(frame)
    mn_land = frame.difference(wisconsin).difference(water)
    outside = wisconsin.difference(water).difference(inside_union).buffer(0)

    groups = {"LAX": (C.LAX, lax), "ONA": (C.ONA, ona), "FI": (C.FI, fi), "OUT": (C.OUT, outside)}
    terr = {}
    dropped = []
    for gname, (defs, region) in groups.items():
        region = region.buffer(0)
        fixed = [d for d in defs if d.get("muni")]
        free = [d for d in defs if not d.get("muni")]
        for d in fixed:
            m = find_muni(munis, d["muni"])
            assert m is not None, d["muni"]
            g = P(m).intersection(region)
            terr[d["id"]] = dict(d, group=gname, geom=g)
            region = region.difference(g)
        seeds = [Point(*proj(d["seed"][1], d["seed"][0])) for d in free]
        cells = voronoi_polygons(MultiPoint(seeds), extend_to=frame.buffer(2000))
        cell_for = {}
        for cell in cells.geoms:
            for i, s in enumerate(seeds):
                if cell.contains(s):
                    cell_for[i] = cell
        for i, d in enumerate(free):
            g = cell_for[i].intersection(region)
            terr[d["id"]] = dict(d, group=gname, geom=g)
        # tidy: keep the main part of each territory; reassign or drop crumbs
        ids = [d["id"] for d in defs]
        crumbs = []
        for tid in ids:
            parts = sorted(polys_of(terr[tid]["geom"]), key=lambda p: -p.area)
            if not parts:
                raise SystemExit(f"{tid} has no land — move its seed")
            seed_pt = Point(*proj(terr[tid]["seed"][1], terr[tid]["seed"][0])) if not terr[tid].get("muni") else None
            main_part = parts[0]
            if seed_pt is not None:
                for p in parts:
                    if p.buffer(1).contains(seed_pt):
                        main_part = p
                        break
            terr[tid]["geom"] = main_part
            crumbs += [p for p in parts if p is not main_part]
        for p in crumbs:
            best, best_len = None, 0
            for tid in ids:
                L = p.buffer(1.0).intersection(terr[tid]["geom"].boundary).length
                if L > best_len:
                    best, best_len = tid, L
            if best and best_len > 2:
                terr[best]["geom"] = unary_union([terr[best]["geom"], p]).buffer(0.01).buffer(-0.01)
            elif p.area > 400:
                near = min(ids, key=lambda t: terr[t]["geom"].distance(p))
                terr[near]["geom"] = unary_union([terr[near]["geom"], p])
            else:
                dropped.append(p)

    order = [d["id"] for d in C.LAX + C.ONA + C.FI + C.OUT]
    for tid in order:
        g = terr[tid]["geom"].simplify(0.6, preserve_topology=True)
        terr[tid]["geom"] = g
        terr[tid]["inside"] = terr[tid]["group"] != "OUT"
        terr[tid]["adj"] = set()
        terr[tid]["roadadj"] = set()

    # ---- land adjacency
    for i, a in enumerate(order):
        for b in order[i + 1:]:
            ga, gb = terr[a]["geom"], terr[b]["geom"]
            if ga.distance(gb) > 1.5:
                continue
            shared = ga.buffer(1.5).intersection(gb.boundary)
            if shared.length > 6:
                terr[a]["adj"].add(b)
                terr[b]["adj"].add(a)

    # ---- roads: merge, project, walk across borders and bridges
    roads = []
    road_lines = []
    for el in load("roads"):
        t = el.get("tags", {})
        c = coords(el.get("geometry", []))
        if len(c) < 2:
            continue
        ln = P(LineString(c))
        cls = t.get("highway", "")
        roads.append((cls, t.get("ref", ""), ln))
        if cls in ("motorway", "trunk", "primary", "motorway_link", "trunk_link", "secondary"):
            road_lines.append(ln)
    merged = linemerge(unary_union(road_lines))
    tree_ids = order
    tree = STRtree([terr[t]["geom"] for t in tree_ids])

    def which(pt):
        for k in tree.query(pt):
            if terr[tree_ids[k]]["geom"].buffer(0.5).contains(pt):
                return tree_ids[k]
        return None

    bridges = []
    lines = list(merged.geoms) if hasattr(merged, "geoms") else [merged]
    for ln in lines:
        n = max(2, int(ln.length / 3))
        seq = [which(ln.interpolate(k / n, normalized=True)) for k in range(n + 1)]
        prev, gap_start, gap = None, None, 0
        for k, cur in enumerate(seq):
            if cur is None:
                if prev is not None and gap == 0:
                    gap_start = k
                gap += 1
                continue
            if prev is not None and cur != prev:
                if gap == 0 or cur in terr[prev]["adj"]:
                    terr[prev]["roadadj"].add(cur)
                    terr[cur]["roadadj"].add(prev)
                elif gap * 3 < 90:  # crossing water on a bridge
                    a_pt = ln.interpolate((gap_start - 1) / n, normalized=True)
                    b_pt = ln.interpolate(k / n, normalized=True)
                    terr[prev]["adj"].add(cur)
                    terr[cur]["adj"].add(prev)
                    terr[prev]["roadadj"].add(cur)
                    terr[cur]["roadadj"].add(prev)
                    bridges.append((prev, cur, LineString([a_pt, b_pt])))
            prev, gap = cur, 0
    # de-duplicate bridges per pair (keep shortest)
    bpair = {}
    for a, b, g in bridges:
        k = tuple(sorted((a, b)))
        if k not in bpair or g.length < bpair[k].length:
            bpair[k] = g

    # ---- walls
    walls = []
    for a in order:
        if not terr[a]["inside"]:
            continue
        for b in sorted(terr[a]["adj"]):
            if terr[b]["inside"]:
                continue
            k = tuple(sorted((a, b)))
            if k in bpair:
                bl = bpair[k]
                mid = bl.interpolate(0.5, normalized=True)
                dx = bl.coords[-1][0] - bl.coords[0][0]
                dy = bl.coords[-1][1] - bl.coords[0][1]
                L = math.hypot(dx, dy) or 1
                nx, ny = -dy / L * 7, dx / L * 7
                g = LineString([(mid.x - nx, mid.y - ny), (mid.x + nx, mid.y + ny)])
            else:
                g = terr[a]["geom"].boundary.intersection(terr[b]["geom"].buffer(1.5))
                g = linemerge(g) if not isinstance(g, LineString) and not g.is_empty else g
            walls.append(dict(id=f"{a}|{b}", inside=a, outside=b, path=line_path(g)))

    # ---- zombie arrows (Dijkstra toward nearest downtown)
    targets = ["lax_downtown", "ona_downtown"]
    dist = {t: math.inf for t in order}
    pq = []
    for t in targets:
        dist[t] = 0
        heapq.heappush(pq, (0, t))

    def w(a, b):
        return 1.0 if b in terr[a]["roadadj"] else 2.6

    while pq:
        d, u = heapq.heappop(pq)
        if d > dist[u]:
            continue
        for v in terr[u]["adj"]:
            nd = d + w(u, v)
            if nd < dist[v] - 1e-9:
                dist[v] = nd
                heapq.heappush(pq, (nd, v))
    for t in order:
        if t in targets:
            terr[t]["zombieNext"] = []
            continue
        best = sorted([v for v in terr[t]["adj"] if abs(dist[v] + w(t, v) - dist[t]) < 1e-6],
                      key=lambda v: (0 if v in terr[t]["roadadj"] else 1, dist[v]))
        terr[t]["zombieNext"] = best[:2]
        if not best:
            raise SystemExit(f"{t} has no route to a downtown")

    # ---- POIs: Kwik Trips
    kts = []
    for el in load("pois"):
        t = el.get("tags", {})
        nm = t.get("brand", "") + " " + t.get("name", "")
        if "Kwik" not in nm:
            continue
        if t.get("amenity") not in (None, "fuel") and t.get("shop") not in ("convenience", None):
            pass
        lat = el.get("lat", el.get("center", {}).get("lat"))
        lon = el.get("lon", el.get("center", {}).get("lon"))
        if lat is None:
            continue
        kts.append(dict(lat=lat, lon=lon, name=t.get("name", "Kwik Trip"), street=t.get("addr:street", ""),
                        num=t.get("addr:housenumber", "")))
    # de-duplicate (store mapped as node + building)
    uniq = []
    for k in kts:
        x, y = proj(k["lon"], k["lat"])
        if all(math.hypot(x - u["x"], y - u["y"]) > 4 for u in uniq):
            uniq.append(dict(k, x=round(x, 1), y=round(y, 1)))
    for tid in order:
        terr[tid]["kwikTrips"] = 0
    kt_out = []
    for k in uniq:
        tid = which(Point(k["x"], k["y"]))
        if tid is None:
            continue
        terr[tid]["kwikTrips"] += 1
        kt_out.append(dict(x=k["x"], y=k["y"], name=f'{k["name"]} {k["num"]} {k["street"]}'.strip(), tid=tid))

    # ---- assemble output
    out_t = []
    for tid in order:
        d = terr[tid]
        g = d["geom"]
        main = max(polys_of(g), key=lambda p: p.area)
        lab = polylabel(main, tolerance=0.5)
        so = {"LAX": "LAX", "ONA": "ONA"}.get(d["group"])
        out_t.append(dict(
            id=tid, name=d["name"], short=d.get("short", d["name"]), group=d["group"],
            region={"LAX": "La Crosse", "ONA": "Onalaska", "FI": "French Island", "OUT": "Outside"}[d["group"]],
            inside=d["inside"], value=d.get("value", 0), kwikTrips=d["kwikTrips"],
            special=d.get("special", []), spawn=d.get("spawn"), startOwner=so,
            startUnits=d.get("start", {}), adj=sorted(d["adj"]), roadAdj=sorted(d["roadadj"]),
            zombieNext=d["zombieNext"], label=[round(lab.x, 1), round(lab.y, 1)],
            area=round(g.area), path=to_path(g)))
    water_paths = [to_path(p.simplify(0.8)) for p in polys_of(water) if p.area > 150]
    backdrop = [dict(path=to_path(p.simplify(1.0))) for p in polys_of(mn_land) if p.area > 150]
    backdrop += [dict(path=to_path(p)) for p in dropped if p.area > 30]
    road_out = []
    for cls, ref, ln in roads:
        if cls in ("motorway", "trunk", "primary"):
            road_out.append(dict(cls=cls, ref=ref, path=line_path(ln.simplify(0.8))))
    bridge_out = [dict(a=a, b=b, path=line_path(g)) for (a, b), g in bpair.items()]
    labels = []
    mapdata = dict(
        viewBox=[0, 0, round(WIDTH, 1), round(HEIGHT, 1)],
        attribution="Map data © OpenStreetMap contributors (ODbL)",
        territories=out_t, walls=walls, water=water_paths, backdrop=backdrop, roads=road_out,
        bridges=bridge_out, kwikTrips=kt_out, labels=labels,
        cityHalls={"LAX": "lax_downtown", "ONA": "ona_downtown"},
    )
    js = ("/* Generated by tools/build_map.py from OpenStreetMap data (ODbL). Do not edit by hand. */\n"
          "(function (root) {\nconst MAP = " + json.dumps(mapdata, separators=(",", ":")) + ";\n"
          "if (typeof module === 'object' && module.exports) module.exports = MAP; else root.LAXIS_MAP = MAP;\n"
          "})(typeof self !== 'undefined' ? self : this);\n")
    (ROOT / "game" / "js" / "mapdata.js").write_text(js)
    # report
    for t in out_t:
        report.append(f'{t["id"]:16} {t["group"]:3} v{t["value"]} kt{t["kwikTrips"]} area{t["area"]:>7} '
                      f'adj={",".join(t["adj"])} next={",".join(t["zombieNext"])}')
    report.append(f"walls: {len(walls)}  bridges: {len(bridge_out)}  kwik trips placed: {len(kt_out)} / found {len(uniq)}")
    (CACHE / "report.txt").write_text("\n".join(report))
    print("\n".join(report))


if __name__ == "__main__":
    main()
