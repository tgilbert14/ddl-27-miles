"""Build the measured data for 27 Miles to Canada.

Terrain: public elevation tiles (Mapzen Terrain Tiles on AWS, "terrarium" encoding).
Road and places: OpenStreetMap through the public Overpass API. Data (c) OpenStreetMap contributors, ODbL.

Run from the repo root:
    uv run --with numpy --with pillow python tools/build_data.py

Writes data/height.webp (16-bit heights in the red and green channels), data/route.json and data/meta.json.
Downloads are cached in tools/.cache (git-ignored).
"""
import heapq
import json
import math
import time
import urllib.parse
import urllib.request
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
CACHE = Path(__file__).resolve().parent / ".cache"
TILES = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"
HOSTS = ["https://overpass-api.de/api/interpreter", "https://overpass.private.coffee/api/interpreter",
         "https://overpass.kumi.systems/api/interpreter"]
UA = {"User-Agent": "terrain-route-build/1.0"}

BBOX = (-111.02, 32.18, -110.62, 32.50)      # west, south, east, north: the Catalinas and the east side of the basin
SHEET_Z, SHEET_W = 12, 1024
ROAD_Z = 13                                   # finer tiles, sampled only along the road
START = (32.2579, -110.7991)                  # Catalina Highway at Tanque Verde Road
SUMMIT = (32.4430, -110.7885)                 # Mount Lemmon high point
ROADS = "32.24,-110.83,32.47,-110.68"
PLACES = "32.24,-110.86,32.47,-110.66"
M_FT, M_MI = 3.28084, 1609.344


def fx(lon):
    return (lon + 180) / 360


def fy(lat):
    return (1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2


_tiles = {}


def tile(z, x, y):
    if (z, x, y) not in _tiles:
        CACHE.mkdir(exist_ok=True)
        p = CACHE / f"{z}-{x}-{y}.png"
        if not p.exists():
            req = urllib.request.Request(TILES.format(z=z, x=x, y=y), headers=UA)
            p.write_bytes(urllib.request.urlopen(req, timeout=60).read())
        a = np.asarray(Image.open(p).convert("RGB")).astype(np.float64)
        _tiles[(z, x, y)] = a[..., 0] * 256 + a[..., 1] + a[..., 2] / 256 - 32768
    return _tiles[(z, x, y)]


def elev(lat, lon, z=ROAD_Z):
    """Bilinear elevation in metres straight from the tiles."""
    size = 2 ** z * 256
    px, py = fx(lon) * size - 0.5, fy(lat) * size - 0.5
    i, j = math.floor(px), math.floor(py)
    a, b = px - i, py - j

    def at(ii, jj):
        return tile(z, ii // 256, jj // 256)[jj % 256, ii % 256]
    return at(i, j) * (1 - a) * (1 - b) + at(i + 1, j) * a * (1 - b) + at(i, j + 1) * (1 - a) * b + at(i + 1, j + 1) * a * b


def sheet():
    w, s, e, n = BBOX
    size = 2 ** SHEET_Z * 256
    px0, px1, py0, py1 = round(fx(w) * size), round(fx(e) * size), round(fy(n) * size), round(fy(s) * size)
    x0, x1, y0, y1 = px0 // 256, (px1 - 1) // 256, py0 // 256, (py1 - 1) // 256
    mos = np.zeros(((y1 - y0 + 1) * 256, (x1 - x0 + 1) * 256), dtype=np.float32)
    for x in range(x0, x1 + 1):
        for y in range(y0, y1 + 1):
            mos[(y - y0) * 256:(y - y0 + 1) * 256, (x - x0) * 256:(x - x0 + 1) * 256] = tile(SHEET_Z, x, y)
    crop = mos[py0 - y0 * 256:py1 - y0 * 256, px0 - x0 * 256:px1 - x0 * 256]
    out_h = round(crop.shape[0] * SHEET_W / crop.shape[1])
    a = np.asarray(Image.fromarray(crop, mode="F").resize((SHEET_W, out_h), Image.LANCZOS))
    info = dict(w=SHEET_W, h=out_h, fx0=px0 / size, fx1=px1 / size, fy0=py0 / size, fy1=py1 / size)
    info["metersPerPixel"] = 40075016.686 * math.cos(math.radians((n + s) / 2)) * (info["fx1"] - info["fx0"]) / SHEET_W
    lo, step = float(np.floor(a.min())), 0.125
    q = np.round((a - lo) / step).astype(np.uint16)
    rgb = np.zeros(q.shape + (3,), dtype=np.uint8)
    rgb[..., 0], rgb[..., 1] = q >> 8, q & 255
    Image.fromarray(rgb).save(ROOT / "data" / "height.webp", lossless=True, quality=100, method=6)
    info.update(lo=lo, step=step, hi=float(a.max()))
    return info


def overpass(name, q):
    CACHE.mkdir(exist_ok=True)
    p = CACHE / f"{name}.json"
    if not p.exists():
        last = None
        for host in HOSTS:
            try:
                req = urllib.request.Request(host, data=urllib.parse.urlencode({"data": q}).encode(), headers=UA)
                p.write_bytes(urllib.request.urlopen(req, timeout=200).read())
                json.loads(p.read_text())
                break
            except Exception as err:          # try the next mirror
                last = err
                p.unlink(missing_ok=True)
                time.sleep(2)
        else:
            raise SystemExit(f"Overpass failed for {name}: {last}")
    return json.loads(p.read_text())


def hav(a, b):
    p1, p2, dl = math.radians(a[0]), math.radians(b[0]), math.radians(b[1] - a[1])
    x = math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * 6371008.8 * math.asin(math.sqrt(x))


def route():
    q = (f'[out:json][timeout:120];way["highway"~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|service)$"]'
         f'({ROADS});out geom;')
    ways = overpass("roads", q)["elements"]
    pos, adj, wayname = {}, {}, {}
    for w in ways:
        nm = w.get("tags", {}).get("name", "")
        kind = w["tags"]["highway"]
        # stay on the highway until the top: side streets cost more, so the path keeps to the named road
        cost = 1.0 if ("Hitchcock" in nm or "Catalina Highway" in nm or "Ski Run" in nm) else (1.6 if kind != "service" else 2.2)
        for n, g in zip(w["nodes"], w["geometry"]):
            pos[n] = (g["lat"], g["lon"])
        for a, b in zip(w["nodes"], w["nodes"][1:]):
            d = hav(pos[a], pos[b])
            adj.setdefault(a, []).append((b, d, d * cost, nm))
            adj.setdefault(b, []).append((a, d, d * cost, nm))
    named = [n for w in ways if "Catalina Highway" in w.get("tags", {}).get("name", "") for n in w["nodes"]]
    src = min(named, key=lambda n: hav(pos[n], START))
    dst = min(adj, key=lambda n: hav(pos[n], SUMMIT))
    best, prev, pq = {src: 0.0}, {}, [(0.0, src)]
    while pq:
        c, n = heapq.heappop(pq)
        if n == dst:
            break
        if c > best[n]:
            continue
        for m, d, wc, nm in adj[n]:
            if c + wc < best.get(m, 1e18):
                best[m], prev[m] = c + wc, (n, nm)
                heapq.heappush(pq, (c + wc, m))
    chain, names, n = [dst], [], dst
    while n != src:
        n, nm = prev[n]
        chain.append(n)
        names.append(nm)
    chain.reverse()
    names.reverse()
    names.append(names[-1])
    return [pos[n] for n in chain], names, hav(pos[dst], SUMMIT)


def places():
    q = (f'[out:json][timeout:120];(nwr["name"~"Windy Point|Molino|Rose Canyon|Palisade|Babad|Seven Cataracts|Summerhaven|'
         f'Mount Lemmon|Ski Valley|Geology Vista|Hitchcock|San Pedro Vista|Thimble Peak|Bear Canyon|Aspen Vista|SkyCenter|Sky Center"]'
         f'({PLACES}););out center tags;')
    out = []
    for e in overpass("places", q)["elements"]:
        lat, lon = (e["lat"], e["lon"]) if e["type"] == "node" else (e.get("center", {}).get("lat"), e.get("center", {}).get("lon"))
        if lat is None:
            continue
        t = e["tags"]
        kind = next((f"{k}={t[k]}" for k in ("tourism", "natural", "place", "amenity", "leisure", "highway", "landuse", "boundary") if k in t), "")
        out.append(dict(name=t["name"], kind=kind, type=e["type"], lat=lat, lon=lon, ele_tag=t.get("ele")))
    return out


def main():
    (ROOT / "data").mkdir(exist_ok=True)
    info = sheet()
    pts, names, miss = route()
    # mile 0 is where the General Hitchcock Highway begins; the East Catalina Highway before it is the approach
    first = next(i for i, nm in enumerate(names) if "Hitchcock" in nm)
    approach = sum(hav(a, b) for a, b in zip(pts[:first + 1], pts[1:first + 1]))
    tanque_verde_ft = round(elev(*pts[0]) * M_FT)
    pts, names = pts[first:], names[first:]
    # resample every 40 m so the profile and the camera path are even
    cum = [0.0]
    for a, b in zip(pts, pts[1:]):
        cum.append(cum[-1] + hav(a, b))
    total = cum[-1]
    s = np.arange(0, total, 40.0)
    s = np.append(s, total)
    lat = np.interp(s, cum, [p[0] for p in pts])
    lon = np.interp(s, cum, [p[1] for p in pts])
    idx = np.clip(np.searchsorted(cum, s, side="right") - 1, 0, len(names) - 1)
    raw = np.array([elev(a, b) for a, b in zip(lat, lon)])
    k = 5                                       # 200 m running mean: takes the grid steps out of a road cut
    pad = np.pad(raw, (k // 2, k // 2), mode="edge")
    ele = np.convolve(pad, np.ones(k) / k, mode="valid")
    dz = np.diff(ele)
    u = (np.array([fx(v) for v in lon]) - info["fx0"]) / (info["fx1"] - info["fx0"])
    v = (np.array([fy(x) for x in lat]) - info["fy0"]) / (info["fy1"] - info["fy0"])
    segs, last = [], None
    for i, j in enumerate(idx):
        if names[j] != last:
            last = names[j]
            segs.append(dict(name=last or "(unnamed)", mile=round(float(s[i]) / M_MI, 2)))
    turn = next(i for i, j in enumerate(idx) if "Ski Run" in names[j])      # where Ski Run Road leaves the highway
    hi = int(np.argmax(ele[:turn]))
    low = hi + int(np.argmin(ele[hi:turn + 1]))
    stats = dict(
        miles=round(total / M_MI, 2), start_ft=round(float(ele[0]) * M_FT), end_ft=round(float(ele[-1]) * M_FT),
        climb_ft=round(float(dz[dz > 0].sum()) * M_FT), descent_ft=round(float(-dz[dz < 0].sum()) * M_FT),
        end_to_summit_m=round(miss), max_ft=round(float(ele.max()) * M_FT), segments=segs,
        approach_miles=round(approach / M_MI, 2), tanque_verde_ft=tanque_verde_ft,
        crest=dict(mile=round(float(s[hi]) / M_MI, 2), ft=round(float(ele[hi]) * M_FT)),
        dip=dict(mile=round(float(s[low]) / M_MI, 2), ft=round(float(ele[low]) * M_FT)),
        ski_run=dict(mile=round(float(s[turn]) / M_MI, 2), ft=round(float(ele[turn]) * M_FT)))
    pl = places()
    for p in pl:
        d = [hav((p["lat"], p["lon"]), (a, b)) for a, b in zip(lat, lon)]
        i = int(np.argmin(d))
        p.update(mile=round(float(s[i]) / M_MI, 2), road_ft=round(float(ele[i]) * M_FT), off_road_m=round(d[i]),
                 u=round((fx(p["lon"]) - info["fx0"]) / (info["fx1"] - info["fx0"]), 5),
                 v=round((fy(p["lat"]) - info["fy0"]) / (info["fy1"] - info["fy0"]), 5),
                 ground_ft=round(elev(p["lat"], p["lon"]) * M_FT))
    (ROOT / "data" / "route.json").write_text(json.dumps(dict(
        source="Road: OpenStreetMap contributors (ODbL). Elevation: Mapzen Terrain Tiles, zoom 13, sampled every 40 m, 200 m running mean.",
        step_m=40, mi=[round(float(x) / M_MI, 3) for x in s], ft=[round(float(x) * M_FT) for x in ele],
        u=[round(float(x), 5) for x in u], v=[round(float(x), 5) for x in v], stats=stats), separators=(",", ":")))
    (ROOT / "data" / "meta.json").write_text(json.dumps(dict(sheet=info, bbox=BBOX, places=pl), indent=1))
    print(json.dumps(stats, indent=1))
    for p in sorted(pl, key=lambda p: p["mile"]):
        if p["off_road_m"] < 1500:
            print(f'{p["mile"]:6.2f} mi  road {p["road_ft"]:5d} ft  ground {p["ground_ft"]:5d}  {p["off_road_m"]:5d} m off  {p["name"]}  [{p["kind"]}] ele={p["ele_tag"]}')


if __name__ == "__main__":
    main()
