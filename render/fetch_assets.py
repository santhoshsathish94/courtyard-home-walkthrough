"""Download the CC0 Poly Haven assets used by render/scene.py into ./assets (run on the render server; CPU/network only).

  python3 fetch_assets.py            # skips files that already exist
"""
import concurrent.futures as cf
import json
import os
import urllib.request

API = "https://api.polyhaven.com/files/"
UA = {"User-Agent": "courtyard-home-render/1.0"}
OUT = "assets"
MODELS = {  # id: resolution
    "modern_arm_chair_01": "2k", "mid_century_lounge_chair": "2k", "modern_coffee_table_01": "2k", "side_table_01": "1k",
    "outdoor_table_chair_set_01": "2k", "potted_plant_01": "2k", "potted_plant_02": "2k", "brass_diya_lantern": "1k",
    "carved_wooden_elephant": "1k", "modern_ceiling_lamp_01": "1k", "ceiling_fan": "1k", "decorative_book_set_01": "1k",
    "ceramic_vase_03": "1k", "brass_vase_01": "1k", "throw_pillows_01": "2k", "island_tree_02": "2k", "shrub_01": "1k",
    "shrub_04": "1k", "grass_medium_02": "1k", "calathea_orbifolia_01": "1k", "pachira_aquatica_01": "1k",
    "island_tree_01": "1k", "island_tree_03": "1k", "tree_small_02": "1k", "jacaranda_tree": "1k",
}
TEXTURES = {
    "marble_01": "2k", "oak_wood_planks": "2k", "walnut_veneer": "2k", "teak_veneer": "2k", "oak_veneer_01": "2k",
    "white_stucco": "2k", "sandstone_blocks_05": "2k", "castle_wall_slates": "2k", "rectangular_facade_tiles": "2k",
    "large_floor_tiles_02": "2k", "ganges_river_pebbles": "2k", "rough_linen": "2k", "hessian_230": "2k",
    "velour_velvet": "1k", "long_white_tiles": "2k", "asphalt_02": "2k", "leafy_grass": "2k",
}
HDRIS = {"kloofendal_48d_partly_cloudy_puresky": "4k"}
MAPS = ("Diffuse", "nor_gl", "Rough", "Displacement")


def files(asset):
    with urllib.request.urlopen(urllib.request.Request(API + asset, headers=UA), timeout=60) as r:
        return json.load(r)


def get(url, path):
    if os.path.exists(path) and os.path.getsize(path) > 0:
        return 0
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=300) as r, open(path + ".part", "wb") as f:
        while chunk := r.read(1 << 20):
            f.write(chunk)
    os.replace(path + ".part", path)
    return os.path.getsize(path)


jobs, skipped = [], []
for mid, res in MODELS.items():
    try:
        f = files(mid)
        fmt = next(k for k in ("gltf", "blend") if k in f)
        g = f[fmt][res if res in f[fmt] else next(iter(f[fmt]))][fmt]
    except (StopIteration, KeyError, OSError) as e:
        skipped.append(f"{mid} ({e!r})")
        continue
    base = f"{OUT}/models/{mid}"
    jobs.append((g["url"], f"{base}/{mid}.{fmt}"))
    jobs += [(inc["url"], f"{base}/{rel}") for rel, inc in g.get("include", {}).items()]
for tid, res in TEXTURES.items():
    f = files(tid)
    for key in MAPS:
        if key in f and res in f[key]:
            d = f[key][res]
            fmt = "jpg" if "jpg" in d else ("png" if "png" in d else next(iter(d)))
            jobs.append((d[fmt]["url"], f"{OUT}/textures/{tid}/{key}.{fmt}"))
for hid, res in HDRIS.items():
    jobs.append((files(hid)["hdri"][res]["hdr"]["url"], f"{OUT}/hdri/{hid}.hdr"))

with cf.ThreadPoolExecutor(8) as ex:
    sizes = list(ex.map(lambda j: get(*j), jobs))
print(f"{len(jobs)} files, {sum(sizes) / 1e6:.0f} MB downloaded; skipped: {skipped or 'none'}", flush=True)
