"""Courtyard Home — photoreal walkthrough (Blender 4.5, Cycles). Cycle 9: real materials, furniture, decor and landscape.

Usage (headless, on the render server):
  blender -b -P scene.py -- --glb courtyard.glb --props props.json --assets assets --out out
        [--preview [--picks Living@0.5,Kitchen]] [--res 1920x1080] [--samples 64] [--device GPU] [--frames 1-1944]
        [--fast] [--save scene.blend]

Inputs
  courtyard.glb  open design exported from index.html (materials carry the web palette names; movable furniture
                 meshes are named prop_<kind> and are hidden here)
  props.json     furniture placements from walkthrough.exportProps() (house-local feet)
  assets/        CC0 Poly Haven models, textures and HDRI downloaded by fetch_assets.py
House-local feet (x east, y up, z south) map to Blender metres as X = 0.3048·(x − 21.5), Y = −0.3048·(z − 14), Z = 0.3048·y.
"""
import argparse
import json
import math
import os
import random
import sys
import time

import bmesh
import bpy
import numpy as np
from mathutils import Vector

FT = 0.3048
argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
ap = argparse.ArgumentParser()
ap.add_argument("--glb", default="courtyard.glb")
ap.add_argument("--props", default="props.json")
ap.add_argument("--assets", default="assets")
ap.add_argument("--out", default="out")
ap.add_argument("--preview", action="store_true")
ap.add_argument("--picks", default="")
ap.add_argument("--res", default="1920x1080")
ap.add_argument("--samples", type=int, default=64)
ap.add_argument("--threads", type=int, default=16)
ap.add_argument("--device", default="GPU", choices=["CPU", "GPU"])
ap.add_argument("--frames", default="")
ap.add_argument("--fast", action="store_true", help="skip grass and background trees")
ap.add_argument("--save", default="")
args = ap.parse_args(argv)
os.makedirs(args.out, exist_ok=True)
random.seed(7)
T0 = time.time()


def log(msg):
    print(f"[{time.time() - T0:6.1f}s] {msg}", flush=True)


def H(x, y, z):
    """House-local feet → Blender metres."""
    return Vector(((x - 21.5) * FT, -(z - 14.0) * FT, y * FT))


# ================================================================ import the web model
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
bpy.ops.import_scene.gltf(filepath=args.glb, merge_vertices=False)
for o in list(bpy.data.objects):
    if o.type in {"CAMERA", "LIGHT"}:
        bpy.data.objects.remove(o, do_unlink=True)
root = bpy.data.objects.new("Courtyard", None)
scene.collection.objects.link(root)
for o in list(scene.objects):
    if o is not root and o.parent is None:
        o.parent = root
root.scale = (FT, FT, FT)
for o in scene.objects:
    if o.name.startswith("prop_") and not o.name.startswith("prop_wardrobe"):
        o.hide_render = o.hide_viewport = True          # box placeholders; real or modelled furniture is placed below
bpy.context.view_layer.update()
log("model imported")

# ================================================================ material helpers
TEXDIR = os.path.join(args.assets, "textures")
_lum = {}


def image(tid, key):
    for ext in ("jpg", "png", "exr"):
        p = os.path.abspath(os.path.join(TEXDIR, tid, f"{key}.{ext}"))
        if os.path.exists(p):
            im = bpy.data.images.load(p, check_existing=True)
            im.colorspace_settings.name = "sRGB" if key == "Diffuse" else "Non-Color"
            return im
    return None


def mean_lum(im):
    """Mean linear luminance of an sRGB texture (used to recolour a texture while keeping its detail)."""
    if im.name not in _lum:
        px = np.empty(len(im.pixels), np.float32)
        im.pixels.foreach_get(px)
        rgb = px.reshape(-1, 4)[:, :3] ** 2.2
        _lum[im.name] = max(1e-3, float(np.mean(rgb @ np.array([0.2126, 0.7152, 0.0722], np.float32))))
    return _lum[im.name]


def lin(h):
    c = [((h >> s) & 255) / 255 for s in (16, 8, 0)]
    return tuple(v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4 for v in c) + (1.0,)


def mix_sockets(n):
    """(factor, A, B, result) colour sockets of a Mix node, found by type so socket order changes don't matter."""
    ins = [s for s in n.inputs if s.type == "RGBA"]
    return (next(s for s in n.inputs if s.name == "Factor"), ins[0], ins[1], next(s for s in n.outputs if s.type == "RGBA"))


class Tree:
    def __init__(self, m, shader="ShaderNodeBsdfPrincipled"):
        m.use_nodes = True
        self.nt = m.node_tree
        self.nt.nodes.clear()
        self.out = self.node("ShaderNodeOutputMaterial")
        self.bsdf = self.node(shader)
        self.link(self.bsdf.outputs[0], self.out.inputs["Surface"])

    def node(self, kind, **props):
        n = self.nt.nodes.new(kind)
        for k, v in props.items():
            setattr(n, k, v)
        return n

    def link(self, a, b):
        self.nt.links.new(a, b)

    def put(self, socket, v):
        if isinstance(v, bpy.types.NodeSocket):
            self.link(v, socket)
        else:
            socket.default_value = v

    def set(self, values):
        for k, v in values.items():
            if k in self.bsdf.inputs and v is not None:
                self.put(self.bsdf.inputs[k], v)

    def mix(self, fac, a, b, blend="MIX"):
        n = self.node("ShaderNodeMix", data_type="RGBA", blend_type=blend)
        f, sa, sb, out = mix_sockets(n)
        for s, v in zip((f, sa, sb), (fac, a, b)):
            self.put(s, v)
        return out

    def math(self, op, a, b=0.0, c=0.0):
        n = self.node("ShaderNodeMath", operation=op)
        for s, v in zip(n.inputs, (a, b, c)):
            self.put(s, v)
        return n.outputs[0]


def pbr(m, tid, size=1.0, tint=None, mono=False, rough=None, rough_mul=1.0, bump=0.3, coord="world", metal=0.0, coat=0.0,
        sheen=0.0, rotate=0.0):
    """Box-projected PBR texture set; world coordinates (metres) for architecture, object coordinates for furniture."""
    t = Tree(m)
    vec = t.node("ShaderNodeNewGeometry").outputs["Position"] if coord == "world" else t.node("ShaderNodeTexCoord").outputs["Object"]
    mp = t.node("ShaderNodeMapping")
    mp.inputs["Scale"].default_value = (1 / size,) * 3
    mp.inputs["Rotation"].default_value = (0, 0, rotate)
    t.link(vec, mp.inputs["Vector"])

    def tex(key):
        im = image(tid, key)
        if im is None:
            return None
        n = t.node("ShaderNodeTexImage", image=im, projection="BOX", projection_blend=0.3)
        t.link(mp.outputs[0], n.inputs["Vector"])
        return n

    d = tex("Diffuse")
    col = None
    if d is not None:
        col = d.outputs["Color"]
        if mono:
            bw = t.node("ShaderNodeRGBToBW")
            t.link(col, bw.inputs["Color"])
            col = t.math("DIVIDE", bw.outputs["Val"], mean_lum(d.image))
        if tint:
            col = t.mix(1.0, tint, col, "MULTIPLY")
        t.link(col, t.bsdf.inputs["Base Color"])
    elif tint:
        t.bsdf.inputs["Base Color"].default_value = tint
    r = tex("Rough") if rough is None else None
    if r is not None:
        t.link(t.math("MULTIPLY", r.outputs["Color"], rough_mul), t.bsdf.inputs["Roughness"])
    else:
        t.bsdf.inputs["Roughness"].default_value = 0.6 if rough is None else rough
    if bump:
        h = tex("Displacement")
        if h is not None:
            bp = t.node("ShaderNodeBump")
            bp.inputs["Strength"].default_value = bump
            bp.inputs["Distance"].default_value = 0.01 * size
            t.link(h.outputs["Color"], bp.inputs["Height"])
            t.link(bp.outputs["Normal"], t.bsdf.inputs["Normal"])
    t.set({"Metallic": metal, "Coat Weight": coat, "Sheen Weight": sheen})
    return t


def tiled(m, tid, tile, grout=0.002, size=1.6, tint=None, rough=0.12, var=0.05, offset=0.0, grout_col=(0.45, 0.43, 0.4, 1),
          coat=0.0, rotate=0.0):
    """Floor tiles / boards in world XY: real grout lines, per-tile texture offset and slight tone variation."""
    t = Tree(m)
    pos = t.node("ShaderNodeNewGeometry").outputs["Position"]
    br = t.node("ShaderNodeTexBrick", offset=offset, offset_frequency=2, squash=1.0, squash_frequency=2)
    for k, v in {"Scale": 1.0, "Mortar Size": grout, "Mortar Smooth": 0.3, "Bias": 0.0, "Brick Width": tile[0],
                 "Row Height": tile[1], "Color1": (0, 0, 0, 1), "Color2": (1, 1, 1, 1)}.items():
        br.inputs[k].default_value = v
    t.link(pos, br.inputs["Vector"])
    rnd = t.node("ShaderNodeRGBToBW")
    t.link(br.outputs["Color"], rnd.inputs["Color"])
    jit = t.node("ShaderNodeVectorMath", operation="SCALE")
    jit.inputs[0].default_value = (17.3, 9.1, 0.0)
    t.link(rnd.outputs["Val"], jit.inputs["Scale"])
    mp = t.node("ShaderNodeMapping")
    mp.inputs["Scale"].default_value = (1 / size,) * 3
    mp.inputs["Rotation"].default_value = (0, 0, rotate)
    t.link(pos, mp.inputs["Vector"])
    uv = t.node("ShaderNodeVectorMath", operation="ADD")
    t.link(mp.outputs[0], uv.inputs[0])
    t.link(jit.outputs[0], uv.inputs[1])
    d = t.node("ShaderNodeTexImage", image=image(tid, "Diffuse"))
    t.link(uv.outputs[0], d.inputs["Vector"])
    col = d.outputs["Color"]
    if tint:
        col = t.mix(1.0, tint, col, "MULTIPLY")
    col = t.mix(1.0, col, t.math("MULTIPLY_ADD", rnd.outputs["Val"], var, 1 - var / 2), "MULTIPLY")
    t.link(t.mix(br.outputs["Fac"], col, grout_col), t.bsdf.inputs["Base Color"])
    t.link(t.math("MULTIPLY_ADD", br.outputs["Fac"], 0.75 - rough, rough), t.bsdf.inputs["Roughness"])
    bp = t.node("ShaderNodeBump", invert=True)
    bp.inputs["Strength"].default_value = 0.5
    bp.inputs["Distance"].default_value = 0.002
    t.link(br.outputs["Fac"], bp.inputs["Height"])
    t.link(bp.outputs["Normal"], t.bsdf.inputs["Normal"])
    t.set({"Coat Weight": coat, "Coat Roughness": 0.05})
    return t


def flat(m, color, rough, metal=0.0, coat=0.0, noise=0.0):
    t = Tree(m)
    t.set({"Base Color": color, "Roughness": rough, "Metallic": metal, "Coat Weight": coat})
    if noise:
        nz = t.node("ShaderNodeTexNoise")
        nz.inputs["Scale"].default_value = 60.0
        bp = t.node("ShaderNodeBump")
        bp.inputs["Strength"].default_value = noise
        t.link(nz.outputs["Fac"], bp.inputs["Height"])
        t.link(bp.outputs["Normal"], t.bsdf.inputs["Normal"])
    return t


def carved(m, color, scale=6.0):
    """Hand-finished stone (Buddha): mottled tone, fine pitting."""
    t = Tree(m)
    nz = t.node("ShaderNodeTexNoise")
    nz.inputs["Scale"].default_value = scale
    nz.inputs["Detail"].default_value = 8.0
    t.link(t.mix(nz.outputs["Fac"], tuple(c * 0.8 for c in color[:3]) + (1,), tuple(min(1, c * 1.2) for c in color[:3]) + (1,)),
           t.bsdf.inputs["Base Color"])
    vo = t.node("ShaderNodeTexVoronoi")
    vo.inputs["Scale"].default_value = 140.0
    bp = t.node("ShaderNodeBump")
    bp.inputs["Strength"].default_value = 0.25
    t.link(vo.outputs["Distance"], bp.inputs["Height"])
    t.link(bp.outputs["Normal"], t.bsdf.inputs["Normal"])
    t.set({"Roughness": 0.82})
    return t


def emissive(m, color, strength):
    t = Tree(m)
    t.set({"Base Color": color, "Emission Color": color, "Emission Strength": strength, "Roughness": 0.5})
    return t


def glass(m, tint=(0.94, 0.97, 0.98, 1.0), rough=0.01, ior=1.45):
    """Refractive for camera rays, transparent for shadow rays so sunlight reaches the rooms."""
    t = Tree(m)
    t.set({"Base Color": tint, "Roughness": rough, "IOR": ior, "Transmission Weight": 1.0})
    clear = t.node("ShaderNodeBsdfTransparent")
    clear.inputs["Color"].default_value = tint
    lp = t.node("ShaderNodeLightPath")
    mx = t.node("ShaderNodeMixShader")
    t.link(lp.outputs["Is Shadow Ray"], mx.inputs["Fac"])
    t.link(t.bsdf.outputs[0], mx.inputs[1])
    t.link(clear.outputs[0], mx.inputs[2])
    t.link(mx.outputs[0], t.out.inputs["Surface"])
    return t


def quartz(m):
    t = Tree(m)
    nz = t.node("ShaderNodeTexNoise")
    nz.inputs["Scale"].default_value = 900.0
    nz.inputs["Detail"].default_value = 2.0
    flecks = t.math("GREATER_THAN", nz.outputs["Fac"], 0.68)
    t.link(t.mix(flecks, (0.86, 0.85, 0.83, 1), (0.55, 0.54, 0.52, 1)), t.bsdf.inputs["Base Color"])
    t.set({"Roughness": 0.14, "Coat Weight": 0.6, "Coat Roughness": 0.03})
    return t


def sheer(m):
    t = Tree(m, "ShaderNodeBsdfTranslucent")
    t.bsdf.inputs["Color"].default_value = (0.92, 0.9, 0.86, 1)
    diff = t.node("ShaderNodeBsdfDiffuse")
    diff.inputs["Color"].default_value = (0.85, 0.83, 0.79, 1)
    tr = t.node("ShaderNodeBsdfTransparent")
    a = t.node("ShaderNodeMixShader")
    a.inputs["Fac"].default_value = 0.35
    t.link(t.bsdf.outputs[0], a.inputs[1])
    t.link(diff.outputs[0], a.inputs[2])
    b = t.node("ShaderNodeMixShader")
    b.inputs["Fac"].default_value = 0.45
    t.link(a.outputs[0], b.inputs[1])
    t.link(tr.outputs[0], b.inputs[2])
    t.link(b.outputs[0], t.out.inputs["Surface"])
    return t


def abstract_art(m):
    """Large warm abstract canvas (terracotta, ochre, cream, charcoal)."""
    t = Tree(m)
    tc = t.node("ShaderNodeTexCoord")
    nz = t.node("ShaderNodeTexNoise")
    nz.inputs["Scale"].default_value = 2.4
    nz.inputs["Detail"].default_value = 6.0
    nz.inputs["Distortion"].default_value = 0.5
    t.link(tc.outputs["Object"], nz.inputs["Vector"])
    ramp = t.node("ShaderNodeValToRGB")
    els = ramp.color_ramp.elements
    els[0].position, els[0].color = 0.34, lin(0xE6DFD2)
    els[1].position, els[1].color = 0.74, lin(0x3A3633)
    for pos, col in ((0.48, lin(0xC8B79A)), (0.6, lin(0x9C5A3C))):
        e = els.new(pos)
        e.color = col
    t.link(nz.outputs["Fac"], ramp.inputs["Fac"])
    t.link(ramp.outputs["Color"], t.bsdf.inputs["Base Color"])
    cv = t.node("ShaderNodeTexNoise")
    cv.inputs["Scale"].default_value = 500.0
    bp = t.node("ShaderNodeBump")
    bp.inputs["Strength"].default_value = 0.15
    t.link(cv.outputs["Fac"], bp.inputs["Height"])
    t.link(bp.outputs["Normal"], t.bsdf.inputs["Normal"])
    t.set({"Roughness": 0.9})
    return t


def web(name):
    return [m for m in bpy.data.materials if m.name.split(".")[0] == name]


WOOD = dict(rough_mul=0.9, bump=0.06, coat=0.12)
WALNUT = (0.56, 0.48, 0.43, 1)                             # deepen the veneer towards a rich, neutral walnut
SPEC = {
    "cream": lambda m: pbr(m, "white_stucco", 1.6, tint=lin(0xF2EFE9), rough=0.9, bump=0.08),
    "slab": lambda m: pbr(m, "white_stucco", 1.6, tint=lin(0xF2EFE9), rough=0.9, bump=0.08),
    "creamTrim": lambda m: pbr(m, "white_stucco", 1.6, tint=lin(0xE4E0D8), rough=0.9, bump=0.08),
    "coolRoof": lambda m: pbr(m, "large_floor_tiles_02", 2.4, tint=lin(0xD6D3CE), rough=0.85, bump=0.2),
    "floorTile": lambda m: tiled(m, "marble_01", (1.2, 0.6), 0.0015, 1.8, tint=lin(0xF6F1EA), rough=0.1, var=0.05, coat=0.2),
    "stone": lambda m: pbr(m, "sandstone_blocks_05", 1.4, rough=0.9, bump=0.9),
    "paver": lambda m: pbr(m, "large_floor_tiles_02", 2.4, rough=0.8, bump=0.4),
    "slate": lambda m: pbr(m, "castle_wall_slates", 1.6, rough=0.85, bump=1.0),
    "teak": lambda m: pbr(m, "walnut_veneer", 1.0, tint=WALNUT, **WOOD),
    "doorTeak": lambda m: pbr(m, "walnut_veneer", 1.0, tint=(0.58, 0.51, 0.46, 1), **WOOD),
    "woodLight": lambda m: pbr(m, "oak_veneer_01", 1.0, rough_mul=1.0, bump=0.06),
    "soffitWood": lambda m: pbr(m, "teak_veneer", 1.2, bump=0.05),
    "deck": lambda m: tiled(m, "teak_veneer", (1.8, 0.14), 0.005, 1.2, rough=0.55, var=0.14, offset=0.5,
                            grout_col=(0.03, 0.025, 0.02, 1), rotate=math.pi / 2),
    "brownRoof": lambda m: flat(m, (0.05, 0.05, 0.05, 1), 0.45, metal=0.5),
    "winFrame": lambda m: flat(m, (0.012, 0.012, 0.012, 1), 0.38, metal=0.6),
    "charcoal": lambda m: flat(m, (0.02, 0.02, 0.02, 1), 0.45, metal=0.5),
    "cabinet": lambda m: flat(m, lin(0x8C9A7E), 0.42, coat=0.2),
    "counter": quartz,
    "porcelain": lambda m: flat(m, (0.9, 0.9, 0.9, 1), 0.08, coat=0.5),
    "grass": lambda m: pbr(m, "leafy_grass", 2.5, tint=(0.2, 0.3, 0.1, 1), mono=True, rough=0.95, bump=0.3),
    "lawnBright": lambda m: pbr(m, "leafy_grass", 2.5, tint=(0.22, 0.33, 0.11, 1), mono=True, rough=0.95, bump=0.3),
    "road": lambda m: pbr(m, "asphalt_02", 3.0, rough=0.85, bump=0.4),
    "rug": lambda m: pbr(m, "hessian_230", 0.6, rough=0.95, bump=0.4),
    "terracotta": lambda m: flat(m, lin(0xA65A3A), 0.88, noise=0.2),
    "soil": lambda m: flat(m, (0.04, 0.028, 0.02, 1), 1.0, noise=0.5),
    "lamp": lambda m: emissive(m, (1.0, 0.86, 0.68, 1), 10.0),
    "buddhaStone": lambda m: carved(m, (0.2, 0.19, 0.17, 1)),
    "buddhaFace": lambda m: carved(m, (0.2, 0.19, 0.17, 1)),
    "darkStone": lambda m: carved(m, (0.15, 0.145, 0.135, 1), 3.0),
    "glass": glass,
    "glassClear": glass,
    "carGlass": glass,
    "water": lambda m: glass(m, (0.55, 0.75, 0.78, 1), 0.02, 1.33),
    "mirror": lambda m: flat(m, (0.95, 0.95, 0.95, 1), 0.02, metal=1.0),
    "steel": lambda m: flat(m, (0.75, 0.76, 0.77, 1), 0.25, metal=1.0),
    "brass": lambda m: flat(m, (0.8, 0.58, 0.26, 1), 0.28, metal=1.0),
    "solar": lambda m: flat(m, (0.02, 0.04, 0.12, 1), 0.08, coat=1.0),
    "tank": lambda m: flat(m, (0.03, 0.035, 0.04, 1), 0.5),
}
for name, build in SPEC.items():
    for m in web(name):
        build(m)

M = {n: bpy.data.materials.new(n) for n in (
    "walnut", "oak", "black", "linen", "linen_grey", "linen_cream", "sheet", "duvet", "throw", "velvet_mustard",
    "velvet_terracotta", "ceramic", "brass2", "sheer", "art", "tiles_white", "water2", "marigold", "marigold2", "flame", "bulb")}
pbr(M["walnut"], "walnut_veneer", 0.8, tint=WALNUT, coord="object", **WOOD)
pbr(M["oak"], "oak_veneer_01", 0.8, coord="object", bump=0.06)
flat(M["black"], (0.015, 0.015, 0.015, 1), 0.4, metal=0.6)
for n, tint in (("linen", (0.56, 0.51, 0.43, 1)), ("linen_grey", (0.42, 0.41, 0.39, 1)), ("linen_cream", (0.8, 0.76, 0.68, 1)),
                ("sheet", (0.88, 0.87, 0.84, 1)), ("duvet", (0.8, 0.78, 0.74, 1))):
    pbr(M[n], "rough_linen", 0.3, tint=tint, mono=True, coord="object", rough=0.92, bump=0.15, sheen=0.3)
for n, tint in (("throw", (0.42, 0.17, 0.09, 1)), ("velvet_mustard", (0.6, 0.4, 0.07, 1)), ("velvet_terracotta", (0.48, 0.19, 0.11, 1))):
    pbr(M[n], "velour_velvet", 0.3, tint=tint, mono=True, coord="object", rough=0.75, bump=0.1, sheen=0.8)
flat(M["ceramic"], (0.78, 0.76, 0.72, 1), 0.3, coat=0.4)
flat(M["brass2"], (0.8, 0.58, 0.26, 1), 0.25, metal=1.0)
sheer(M["sheer"])
abstract_art(M["art"])
pbr(M["tiles_white"], "long_white_tiles", 0.6, rough=None, bump=0.3, coat=0.3)
glass(M["water2"], (0.5, 0.68, 0.7, 1), 0.02, 1.33)
flat(M["marigold"], (0.85, 0.3, 0.01, 1), 0.6)
flat(M["marigold2"], (0.95, 0.62, 0.03, 1), 0.6)
emissive(M["flame"], (1.0, 0.55, 0.15, 1), 30.0)
emissive(M["bulb"], (1.0, 0.85, 0.65, 1), 25.0)
log("materials built")

# Soften edges (real objects never have razor edges). Skip large planes and overlapping wall boxes (they bevel black).
NO_BEVEL = {"cream", "creamTrim", "slab", "coolRoof", "floorTile", "grass", "lawnBright", "road", "paver", "stone", "deck", "slate"}
for o in list(scene.objects):
    if (o.type == "MESH" and not o.hide_render and len(o.data.vertices) < 300000 and max(o.dimensions) < 120
            and not ({s.material.name.split(".")[0] for s in o.material_slots if s.material} & NO_BEVEL)):
        bev = o.modifiers.new("Bevel", "BEVEL")
        bev.width = 0.02
        bev.segments = 2
        bev.limit_method = "ANGLE"
        bev.angle_limit = math.radians(40)

# ================================================================ foliage: real leaves over the web model's canopy blobs
leaf_me = bpy.data.meshes.new("Leaf")
leaf_me.from_pydata([(-0.09, 0, 0), (0.09, 0, 0), (0.09, 0.32, 0), (-0.09, 0.32, 0)], [], [(0, 1, 2, 3)])
leaf_me.uv_layers.new(name="UVMap")
for i, uv in enumerate([(0, 0), (1, 0), (1, 1), (0, 1)]):
    leaf_me.uv_layers[0].data[i].uv = uv
leaf_obj = bpy.data.objects.new("Leaf", leaf_me)
scene.collection.objects.link(leaf_obj)
leaf_obj.hide_render = True
leaf_obj.location = (0, 0, -50)
lm = bpy.data.materials.new("LeafMat")
t = Tree(lm)
t.set({"Roughness": 0.55, "Subsurface Weight": 0.25})
oi = t.node("ShaderNodeObjectInfo")
ramp = t.node("ShaderNodeValToRGB")
ramp.color_ramp.elements[0].color = (0.04, 0.13, 0.03, 1)
ramp.color_ramp.elements[1].color = (0.2, 0.34, 0.07, 1)
t.link(oi.outputs["Random"], ramp.inputs["Fac"])
t.link(ramp.outputs["Color"], t.bsdf.inputs["Base Color"])
sep = t.node("ShaderNodeSeparateXYZ")
t.link(t.node("ShaderNodeTexCoord").outputs["UV"], sep.inputs["Vector"])
half = t.math("MULTIPLY", t.math("ABSOLUTE", t.math("SUBTRACT", sep.outputs["X"], 0.5)), 2.0)
width = t.math("POWER", t.math("SINE", t.math("MULTIPLY", sep.outputs["Y"], math.pi)), 0.7)
t.link(t.math("LESS_THAN", half, width), t.bsdf.inputs["Alpha"])
leaf_me.materials.append(lm)


def scatter_group(name, instance_socket_setup, density_default):
    ng = bpy.data.node_groups.new(name, "GeometryNodeTree")
    ng.interface.new_socket("Geometry", in_out="INPUT", socket_type="NodeSocketGeometry")
    ng.interface.new_socket("Density", in_out="INPUT", socket_type="NodeSocketFloat").default_value = density_default
    ng.interface.new_socket("Geometry", in_out="OUTPUT", socket_type="NodeSocketGeometry")
    N, L = ng.nodes, ng.links
    gi, go = N.new("NodeGroupInput"), N.new("NodeGroupOutput")
    dist = N.new("GeometryNodeDistributePointsOnFaces")
    inst = N.new("GeometryNodeInstanceOnPoints")
    rv_rot = N.new("FunctionNodeRandomValue")
    rv_rot.data_type = "FLOAT_VECTOR"
    rv_rot.inputs[1].default_value = (6.283, 6.283, 6.283)
    rv_s = N.new("FunctionNodeRandomValue")
    rv_s.inputs[2].default_value = 0.7
    rv_s.inputs[3].default_value = 1.35
    join = N.new("GeometryNodeJoinGeometry")
    L.new(gi.outputs["Geometry"], dist.inputs["Mesh"])
    L.new(gi.outputs["Density"], dist.inputs["Density"])
    L.new(dist.outputs["Points"], inst.inputs["Points"])
    instance_socket_setup(N, L, inst)
    L.new(rv_rot.outputs[0], inst.inputs["Rotation"])
    L.new(rv_s.outputs[1], inst.inputs["Scale"])
    L.new(gi.outputs["Geometry"], join.inputs["Geometry"])
    L.new(inst.outputs["Instances"], join.inputs["Geometry"])
    L.new(join.outputs["Geometry"], go.inputs["Geometry"])
    return ng


def leaf_setup(N, L, inst):
    ob = N.new("GeometryNodeObjectInfo")
    ob.inputs["Object"].default_value = leaf_obj
    L.new(ob.outputs["Geometry"], inst.inputs["Instance"])


leafify = scatter_group("Leafify", leaf_setup, 55.0)
for o in list(scene.objects):
    if o.type == "MESH" and any(s.material and s.material.name.startswith("foliage") for s in o.material_slots):
        mod = o.modifiers.new("Leaves", "NODES")
        mod.node_group = leafify
        for s in o.material_slots:
            s.material = s.material.copy()
            flat(s.material, (0.035, 0.09, 0.03, 1), 0.7)
log("foliage set up")

# ================================================================ Poly Haven assets (collection instances)
MODELS = os.path.join(args.assets, "models")
ASSETS = {}
ASSET_YAW = {}            # per-asset yaw corrections (radians) so the model's front matches the web furniture's front


def asset(mid, part=None):
    """Import a model once into a hidden collection. part="largest" keeps one variant of a multi-variant pack."""
    key = (mid, part)
    if key in ASSETS:
        return ASSETS[key]
    gl, bl = (os.path.abspath(os.path.join(MODELS, mid, f"{mid}.{e}")) for e in ("gltf", "blend"))
    if not (os.path.exists(gl) or os.path.exists(bl)):
        log(f"asset {mid} missing — skipped")
        ASSETS[key] = None
        return None
    coll = bpy.data.collections.new(f"A_{mid}_{part or ''}")
    scene.collection.children.link(coll)
    vl = bpy.context.view_layer
    vl.active_layer_collection = vl.layer_collection.children[coll.name]
    if os.path.exists(gl):
        bpy.ops.import_scene.gltf(filepath=gl)
    elif os.path.exists(bl):
        with bpy.data.libraries.load(bl, link=False) as (src, dst):
            dst.objects = list(src.objects)
        for o in dst.objects:
            if o is not None and o.type not in {"CAMERA", "LIGHT"}:
                coll.objects.link(o)
    vl.active_layer_collection = vl.layer_collection
    vl.update()
    for o in list(coll.objects):                           # flatten: every mesh becomes a top-level object of the collection
        if o.type == "MESH" and o.parent is not None:
            mw = o.matrix_world.copy()
            o.parent = None
            o.matrix_world = mw
    for o in list(coll.objects):
        if o.type != "MESH":
            coll.objects.unlink(o)
    vl.update()

    def bbox(objs):
        mn, mx = Vector((1e9,) * 3), Vector((-1e9,) * 3)
        for o in objs:
            for c in o.bound_box:
                w = o.matrix_world @ Vector(c)
                mn = Vector([min(a, b) for a, b in zip(mn, w)])
                mx = Vector([max(a, b) for a, b in zip(mx, w)])
        return mn, mx
    if part == "largest":
        meshes = list(coll.objects)
        keep = max(meshes, key=lambda o: math.prod(max(1e-4, v) for v in (bbox([o])[1] - bbox([o])[0])))
        for o in meshes:
            if o is not keep:
                coll.objects.unlink(o)
    mn, mx = bbox(coll.objects)
    coll.instance_offset = ((mn.x + mx.x) / 2, (mn.y + mx.y) / 2, mn.z)
    scene.collection.children.unlink(coll)
    ASSETS[key] = (coll, mn, mx)
    log(f"asset {mid}{' (' + part + ')' if part else ''}: {mx.x - mn.x:.2f} x {mx.y - mn.y:.2f} x {mx.z - mn.z:.2f} m")
    return ASSETS[key]


def place(mid, x, y, z, rot=0.0, fit=None, anchor="bottom", scale=1.0, part=None):
    """Instance a model at house-local feet (floor height y); rot = the web model's rotY. Returns the top height (ft)."""
    got = asset(mid, part)
    if got is None:
        return y
    coll, mn, mx = got
    size = mx - mn
    s = scale
    if fit:
        s = min(s, fit[0] * FT / max(size.x, 1e-3), fit[1] * FT / max(size.y, 1e-3))
    e = bpy.data.objects.new(mid, None)
    e.instance_type = "COLLECTION"
    e.instance_collection = coll
    e.scale = (s, s, s)
    loc = H(x, y, z)
    if anchor == "top":
        loc.z -= size.z * s
    e.location = loc
    e.rotation_euler = (0, 0, rot + ASSET_YAW.get(mid, 0.0))
    scene.collection.objects.link(e)
    return (loc.z + size.z * s) / FT


# ================================================================ modelled furniture (metres, local frame: front = −Y)
def group(name, x, y, z, rot=0.0):
    e = bpy.data.objects.new(name, None)
    e.location = H(x, y, z)
    e.rotation_euler = (0, 0, rot)
    scene.collection.objects.link(e)
    return e


def block(parent, name, size, loc, mat, bevel=0.005, seg=2, soft=0, rot=(0, 0, 0)):
    sx, sy, sz = (v / 2 for v in size)
    me = bpy.data.meshes.new(name)
    me.from_pydata([(-sx, -sy, -sz), (sx, -sy, -sz), (sx, sy, -sz), (-sx, sy, -sz), (-sx, -sy, sz), (sx, -sy, sz), (sx, sy, sz), (-sx, sy, sz)],
                   [], [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)])
    me.materials.append(mat)
    ob = bpy.data.objects.new(name, me)
    scene.collection.objects.link(ob)
    ob.parent, ob.location, ob.rotation_euler = parent, loc, rot
    if bevel:
        b = ob.modifiers.new("Bevel", "BEVEL")
        b.width, b.segments, b.limit_method = bevel, seg, "ANGLE"
    if soft:
        s = ob.modifiers.new("Soft", "SUBSURF")
        s.levels = s.render_levels = soft
        for p in me.polygons:
            p.use_smooth = True
    return ob


def cyl(parent, name, r1, r2, h, loc, mat, segs=32, rot=(0, 0, 0), cap=True):
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=cap, segments=segs, radius1=r1, radius2=r2, depth=h)
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = True
    me.materials.append(mat)
    ob = bpy.data.objects.new(name, me)
    scene.collection.objects.link(ob)
    ob.parent, ob.location, ob.rotation_euler = parent, loc, rot
    return ob


def ball(parent, name, r, loc, mat, scale=(1, 1, 1)):
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=12, v_segments=8, radius=r)
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = True
    me.materials.append(mat)
    ob = bpy.data.objects.new(name, me)
    scene.collection.objects.link(ob)
    ob.parent, ob.location, ob.scale = parent, loc, scale
    return ob


def point_light(name, loc, watts, radius=0.03, color=(1.0, 0.82, 0.6)):
    ld = bpy.data.lights.new(name, "POINT")
    ld.energy, ld.shadow_soft_size, ld.color = watts, radius, color
    ob = bpy.data.objects.new(name, ld)
    ob.location = loc
    scene.collection.objects.link(ob)
    return ob


def sofa(x, y, z, rot, w_ft, d_ft):
    g = group("Sofa", x, y, z, rot)
    W, D, arm = w_ft * FT, d_ft * FT, 0.14
    block(g, "plinth", (W - 0.08, D - 0.1, 0.07), (0, 0, 0.035), M["walnut"], 0.004)
    block(g, "base", (W, D, 0.2), (0, 0, 0.17), M["linen"], 0.02, 3)
    block(g, "back", (W, 0.16, 0.5), (0, D / 2 - 0.08, 0.52), M["linen"], 0.025, 3)
    for s in (-1, 1):
        block(g, f"arm{s}", (arm, D, 0.5), (s * (W / 2 - arm / 2), 0, 0.32), M["linen"], 0.03, 3)
    n = 3 if W > 1.7 else (2 if W > 1.1 else 1)
    cw = (W - 2 * arm) / n
    for i in range(n):
        cx = -W / 2 + arm + cw * (i + 0.5)
        block(g, f"seat{i}", (cw - 0.012, D - 0.2, 0.16), (cx, -0.08, 0.35), M["linen"], 0.035, 2, soft=2)
        block(g, f"backc{i}", (cw - 0.02, 0.18, 0.4), (cx, D / 2 - 0.24, 0.62), M["linen"], 0.045, 2, soft=2, rot=(-0.16, 0, 0))
    for i, (px, mat, ang) in enumerate(((-W / 2 + arm + 0.24, "velvet_mustard", 0.18), (W / 2 - arm - 0.24, "velvet_terracotta", -0.2),
                                        (-W / 2 + arm + 0.62, "linen_cream", 0.08))[: max(1, n)]):
        block(g, f"pillow{i}", (0.44, 0.13, 0.42), (px, D / 2 - 0.37, 0.66), M[mat], 0.06, 2, soft=2, rot=(-0.3, 0, ang))
    return g


def bed(x, y, z, rot, w_ft=5.4, l_ft=6.6):
    g = group("Bed", x, y, z, rot)
    W, L = w_ft * FT, l_ft * FT
    block(g, "plinth", (W - 0.12, L - 0.14, 0.06), (0, 0, 0.03), M["black"], 0.002)
    block(g, "base", (W + 0.04, L - 0.03, 0.24), (0, -0.005, 0.18), M["walnut"], 0.008, 3)
    block(g, "mattress", (W - 0.06, L - 0.14, 0.22), (0, -0.03, 0.4), M["sheet"], 0.04, 2, soft=2)
    block(g, "duvet", (W + 0.03, L * 0.64, 0.07), (0, -L / 2 + L * 0.32 - 0.02, 0.535), M["duvet"], 0.05, 2, soft=2)
    block(g, "throw", (W + 0.07, 0.5, 0.035), (0, -L / 2 + 0.36, 0.585), M["throw"], 0.03, 2, soft=1)
    for s in (-1, 1):
        block(g, f"pillow{s}", (W / 2 - 0.24, 0.42, 0.18), (s * (W / 4 + 0.02), L / 2 - 0.36, 0.6), M["sheet"], 0.07, 2, soft=2, rot=(-0.35, 0, 0))
    block(g, "cushion", (0.5, 0.13, 0.3), (0, L / 2 - 0.64, 0.62), M["velvet_mustard"], 0.05, 2, soft=2, rot=(-0.3, 0, 0))
    block(g, "headboard", (W + 0.12, 0.09, 0.9), (0, L / 2 - 0.06, 0.74), M["linen_grey"], 0.03, 3)
    block(g, "panel", (W + 0.95, 0.02, 2.2), (0, L / 2 + 0.005, 1.1), M["walnut"], 0.002)
    return g


def nightstand(x, y, z):
    g = group("Nightstand", x, y, z)
    block(g, "body", (0.5, 0.42, 0.42), (0, 0, 0.27), M["walnut"], 0.006, 3)
    block(g, "base", (0.44, 0.36, 0.06), (0, 0, 0.03), M["black"], 0.002)
    block(g, "gap", (0.46, 0.006, 0.006), (0, -0.212, 0.36), M["black"], 0)
    cyl(g, "lampbase", 0.06, 0.08, 0.26, (0.08, 0.04, 0.61), M["ceramic"])
    cyl(g, "shade", 0.12, 0.15, 0.2, (0.08, 0.04, 0.82), M["sheer"], cap=False)
    point_light("LampBulb", H(x, y, z) + Vector((0.08, 0.04, 0.8)), 6.0)
    return g


def stool(x, y, z):
    g = group("Stool", x, y, z, random.uniform(0, 1.5))
    cyl(g, "seat", 0.19, 0.19, 0.045, (0, 0, 0.66), M["oak"])
    for sx in (-1, 1):
        for sy in (-1, 1):
            cyl(g, "leg", 0.011, 0.011, 0.64, (sx * 0.11, sy * 0.11, 0.32), M["black"], 12)
    for a in (0, math.pi / 2):
        for s in (-1, 1):
            off = (0, s * 0.11, 0.24) if a else (s * 0.11, 0, 0.24)       # a = 0: rung along Y at x = ±0.11
            cyl(g, "rung", 0.008, 0.008, 0.22, off, M["black"], 10, rot=(math.pi / 2, 0, a))
    return g


def table(x, y, z, w_ft, d_ft, h_ft, top="oak"):
    g = group("Table", x, y, z)
    W, D, Hh = w_ft * FT, d_ft * FT, h_ft * FT
    block(g, "top", (W, D, 0.035), (0, 0, Hh - 0.0175), M[top], 0.003, 2)
    for sx in (-1, 1):
        for sy in (-1, 1):
            block(g, "leg", (0.035, 0.035, Hh - 0.035), (sx * (W / 2 - 0.06), sy * (D / 2 - 0.06), (Hh - 0.035) / 2), M["black"], 0.002)
    return Hh / FT + y


def console(x, y, z, w_ft, d_ft, h_ft):
    g = group("Console", x, y, z)
    W, D, Hh = w_ft * FT, d_ft * FT, h_ft * FT
    block(g, "top", (W, D, 0.04), (0, 0, Hh - 0.02), M["walnut"], 0.004)
    block(g, "shelf", (W - 0.08, D - 0.04, 0.025), (0, 0, 0.18), M["walnut"], 0.003)
    for s in (-1, 1):
        block(g, "side", (0.04, D, Hh - 0.04), (s * (W / 2 - 0.02), 0, (Hh - 0.04) / 2), M["walnut"], 0.004)
    return Hh / FT + y


def urli(x, y, z, dia_ft=2.0):
    """Brass urli on a stone pedestal: water with floating marigolds and a lit diya."""
    g = group("Urli", x, y, z)
    r = dia_ft * FT / 2
    cyl(g, "pedestal", r * 0.55, r * 0.62, 0.3, (0, 0, 0.15), bpy.data.materials.get("stone") or M["ceramic"])
    bowl = cyl(g, "bowl", r * 0.55, r, 0.16, (0, 0, 0.38), M["brass2"], 48, cap=False)
    sol = bowl.modifiers.new("Wall", "SOLIDIFY")
    sol.thickness = 0.012
    bowl.modifiers.new("Soft", "SUBSURF").levels = 1
    cyl(g, "base", r * 0.55, r * 0.55, 0.01, (0, 0, 0.305), M["brass2"], 48)
    cyl(g, "water", r * 0.93, r * 0.93, 0.004, (0, 0, 0.43), M["water2"], 48)
    for i in range(16):
        a, d = random.uniform(0, 6.283), r * 0.78 * math.sqrt(random.random())
        ball(g, "marigold", 0.03, (d * math.cos(a), d * math.sin(a), 0.44), M["marigold" if i % 3 else "marigold2"], (1, 1, 0.6))
    cyl(g, "diya", 0.035, 0.05, 0.03, (0.0, 0.0, 0.445), bpy.data.materials.get("terracotta") or M["ceramic"])
    ball(g, "flame", 0.008, (0.0, 0.0, 0.475), M["flame"], (1, 1, 2.2))
    return g


def curtain(x0, z0, x1, z1, y0, y1):
    """Sheer curtain hanging along (x0,z0)→(x1,z1) from height y0 to y1 (house-local feet)."""
    a, b = H(x0, 0, z0), H(x1, 0, z1)
    span = (b - a).length
    n = max(12, int(span / 0.01))
    dv = (b - a).normalized()
    nv = Vector((-dv.y, dv.x, 0))
    verts = []
    for i in range(n + 1):
        u = i / n
        p = a.lerp(b, u) + nv * (0.03 * math.sin(u * span / 0.1 * 2 * math.pi))
        verts += [(p.x, p.y, y0 * FT), (p.x, p.y, y1 * FT)]
    me = bpy.data.meshes.new("Curtain")
    me.from_pydata(verts, [], [(2 * i, 2 * i + 2, 2 * i + 3, 2 * i + 1) for i in range(n)])
    for p in me.polygons:
        p.use_smooth = True
    me.materials.append(M["sheer"])
    ob = bpy.data.objects.new("Curtain", me)
    scene.collection.objects.link(ob)
    return ob


def art(x, y, z, w_ft, h_ft, rot):
    g = group("Art", x, y, z, rot)
    W, Hh = w_ft * FT, h_ft * FT
    block(g, "frame", (W + 0.04, 0.03, Hh + 0.04), (0, 0.015, 0), M["black"], 0.003)
    block(g, "canvas", (W, 0.035, Hh), (0, 0.0, 0), M["art"], 0.002)
    return g


def books(x, y, z, rot):
    """A small stack of linen-bound books (house-local feet; y = surface height)."""
    g = group("Books", x, y, z, rot)
    h = 0.0
    for i, (w, d, t, col) in enumerate(((0.3, 0.23, 0.035, (0.55, 0.5, 0.42, 1)), (0.27, 0.21, 0.028, (0.2, 0.25, 0.22, 1)),
                                        (0.24, 0.18, 0.03, (0.75, 0.72, 0.66, 1)))):
        mat = bpy.data.materials.new(f"book{i}")
        flat(mat, col, 0.7)
        block(g, f"book{i}", (w, d, t), (0.01 * i, -0.005 * i, h + t / 2), mat, 0.003, 2, rot=(0, 0, 0.12 * (i - 1)))
        h += t
    return g


def hang(mid, x, z, ceil_y, drop_ft):
    """Pendant-style model hung drop_ft below the ceiling on a slim brass chain."""
    top = ceil_y - drop_ft
    place(mid, x, top, z, anchor="top")
    g = group("Chain", x, top, z)
    cyl(g, "chain", 0.004, 0.004, drop_ft * FT, (0, 0, drop_ft * FT / 2), M["brass2"], 8)


# ================================================================ furniture from the web model's placements
PROPS = json.load(open(args.props))
for pr in PROPS:
    k, (x, y, z), a = pr["kind"], pr["p"], pr["args"]
    if k == "sofa":
        rot, w, d = a[0], a[1], a[2]
        if y > 9.0:                                        # balcony / terrace seating → teak bistro set
            continue
        if w >= 5.0:
            sofa(x, y, z, rot, w, d)
        else:
            place("modern_arm_chair_01", x, y, z, rot, fit=(w * 1.15, d * 1.15))
    elif k == "table":
        w, d, h = a[0], a[1], a[2] if len(a) > 2 else 2.5
        if y > 9.0 and h <= 1.6:
            place("outdoor_table_chair_set_01", x, y, z, 0.0)
        elif h <= 1.45:
            top = place("modern_coffee_table_01", x, y, z, math.pi / 2, fit=(d * 1.3, w * 1.3))   # long side along the room
            books(x - 0.45, top, z + 0.05, 0.3)
            place("ceramic_vase_03", x + 0.6, top, z - 0.1, 0.0, fit=(0.7, 0.7))
        elif h <= 2.0:
            place("side_table_01", x, y, z, 0.0, fit=(w * 1.2, d * 1.2))
        elif w <= 3.2 and d <= 1.3:                        # foyer console
            top = console(x, y, z, w, d, h)
            place("carved_wooden_elephant", x - 0.6, top, z, math.pi / 2, scale=2.6)
            place("brass_vase_01", x + 0.8, top, z, 0.0, scale=0.6)
        else:
            table(x, y, z, w, d, h, "oak" if (len(a) > 3 and a[3] == "woodLight") else "walnut")
    elif k == "chair":
        place("modern_arm_chair_01", x, y, z, a[0])
    elif k == "stool":
        stool(x, y, z)
    elif k == "bed":
        bed(x, y, z, a[0])
    elif k == "nightstand":
        nightstand(x, y, z)
    elif k == "fan":
        place("ceiling_fan", x, y, z, random.uniform(0, 1.0), anchor="top")
    elif k == "plant":
        place(random.choice(["potted_plant_01", "potted_plant_02"]), x, y, z, random.uniform(0, 6.28), scale=1.0)
for pr in PROPS:                                           # balcony & terrace seating become teak bistro sets
    if pr["kind"] == "sofa" and pr["p"][1] > 18.0:
        place("outdoor_table_chair_set_01", pr["p"][0], pr["p"][1], pr["p"][2], 0.0)
log("furniture placed")

# ================================================================ decor and finishing touches (house-local feet)
art(14.3, 5.0, 4.0, 4.0, 2.8, math.pi / 2)                                     # living room: large abstract canvas
curtain(15.3, 0.6, 17.3, 0.6, 0.1, 9.35)                                       # sheers at the lounge's north slider
curtain(22.2, 0.6, 24.2, 0.6, 0.1, 9.35)
curtain(0.6, 2.6, 0.6, 4.3, 10.1, 18.9)                                        # master bedroom west window
curtain(0.6, 7.3, 0.6, 9.0, 10.1, 18.9)
urli(22.6, -0.12, 21.7, 1.9)                                                    # welcome urli on the porch
g = group("Backsplash", 39.68, 3.03, 9.8)                                       # white stacked tiles behind the hob
block(g, "tiles", (0.02, 2.75 * FT, 3.2 * FT), (0, 0, 1.6 * FT), M["tiles_white"], 0.001)
for px in (30.6, 32.0, 33.4):                                                   # globe pendants over the walnut island
    place("modern_ceiling_lamp_01", px, 9.5, 13.5, anchor="top")
for pz in (1.4, 4.6):                                                           # brass diya lanterns either side of the mandir
    hang("brass_diya_lantern", 37.7, pz, 9.5, 2.3)
place("mid_century_lounge_chair", 38.4, 10.04, 18.0, -math.pi * 0.6)            # library reading corner
place("calathea_orbifolia_01", 15.2, 10.04, 19.1, 0.3, part="largest")          # gallery
for px in (28.5, 34.5, 38.8):                                                   # L-balcony strip planters
    place("potted_plant_01", px, 10.04, 23.1, random.uniform(0, 6.28))
for px in (2.2, 13.8):                                                          # deck planter boxes
    place("shrub_04", px, 11.4, 28.9, random.uniform(0, 6.28), part="largest", scale=2.2)
for px in (23.2, 25.8, 28.3):                                                   # shrubs along the south wall
    place("shrub_01", px, -0.3, 29.7, random.uniform(0, 6.28), part="largest", scale=1.6)
# The web model's Buddha is built from primitives; remesh it (face included) into one smooth, weathered garden sculpture.
for o in scene.objects:
    if o.type == "MESH" and {s.material.name.split(".")[0] for s in o.material_slots if s.material} & {"buddhaStone", "buddhaFace"}:
        for mod in list(o.modifiers):
            o.modifiers.remove(mod)
        rm = o.modifiers.new("Carve", "REMESH")
        rm.mode, rm.voxel_size, rm.use_smooth_shade = "VOXEL", 0.025, True
        sm = o.modifiers.new("Soften", "SMOOTH")
        sm.factor, sm.iterations = 0.5, 4
log("decor placed")

# ================================================================ lawn grass + background trees
def plot_point_ok(x, z, inside):
    east = 47.5 - 5.0 * (z + 2.5) / 33.0
    in_plot = -3.0 < x < east - 0.4 and -2.1 < z < 30.1
    if inside != in_plot:
        return False
    if not inside:
        return x > -3.5 and -60 < z < 90 and x < east + 60
    for x0, x1, z0, z1 in ((-0.8, 40.8, -0.8, 20.8), (-0.5, 16.6, 19.5, 30.6), (17.3, 23.3, 19.7, 22.7), (18.6, 22.0, 22.6, 29.6),
                           (23.6, 40.4, 19.7, 24.4), (29.3, 40.3, 23.9, 30.7), (39.6, 43.6, 10.1, 19.9)):
        if x0 < x < x1 and z0 < z < z1:
            return False
    return True


if not args.fast:
    coll, mn, mx = asset("grass_medium_02")
    pts = []
    for inside, dens, box_ in ((True, 22.0, (-3.5, 47.5, -2.5, 30.5)), (False, 9.0, (-3.5, 108.0, -60.0, 90.0))):
        x0, x1, z0, z1 = box_
        n = int((x1 - x0) * (z1 - z0) * FT * FT * dens)
        for _ in range(n):
            x, z = random.uniform(x0, x1), random.uniform(z0, z1)
            if plot_point_ok(x, z, inside):
                pts.append(H(x, -0.3 if inside else -0.55, z))
    me = bpy.data.meshes.new("GrassPoints")
    me.from_pydata([tuple(p) for p in pts], [], [])
    gob = bpy.data.objects.new("Grass", me)
    scene.collection.objects.link(gob)
    ng = bpy.data.node_groups.new("GrassClumps", "GeometryNodeTree")
    ng.interface.new_socket("Geometry", in_out="INPUT", socket_type="NodeSocketGeometry")
    ng.interface.new_socket("Geometry", in_out="OUTPUT", socket_type="NodeSocketGeometry")
    N, Lk = ng.nodes, ng.links
    gi, go = N.new("NodeGroupInput"), N.new("NodeGroupOutput")
    ci = N.new("GeometryNodeCollectionInfo")
    ci.inputs["Collection"].default_value = coll
    ci.inputs["Separate Children"].default_value = True          # each clump of the pack is its own instance
    ci.inputs["Reset Children"].default_value = True
    inst = N.new("GeometryNodeInstanceOnPoints")
    inst.inputs["Pick Instance"].default_value = True
    ri = N.new("FunctionNodeRandomValue")
    ri.data_type = "INT"
    ri.inputs[4].default_value, ri.inputs[5].default_value = 0, 60
    Lk.new(ri.outputs[2], inst.inputs["Instance Index"])
    rr = N.new("FunctionNodeRandomValue")
    rr.data_type = "FLOAT_VECTOR"
    rr.inputs[1].default_value = (0.0, 0.0, 6.283)
    rs = N.new("FunctionNodeRandomValue")
    rs.inputs[2].default_value = 0.6
    rs.inputs[3].default_value = 1.25
    Lk.new(gi.outputs["Geometry"], inst.inputs["Points"])
    Lk.new(ci.outputs[0], inst.inputs["Instance"])
    Lk.new(rr.outputs[0], inst.inputs["Rotation"])
    Lk.new(rs.outputs[1], inst.inputs["Scale"])
    Lk.new(inst.outputs["Instances"], go.inputs["Geometry"])
    gob.modifiers.new("Grass", "NODES").node_group = ng
    log(f"grass: {len(pts)} clumps")
    def near_aerial(x, z, ax=-18.0, az=52.0, bx=58.0, bz=50.0):
        """Distance (ft) from the aerial camera's path, so no tree crosses the shot."""
        t_ = max(0.0, min(1.0, ((x - ax) * (bx - ax) + (z - az) * (bz - az)) / ((bx - ax) ** 2 + (bz - az) ** 2)))
        return math.hypot(x - (ax + t_ * (bx - ax)), z - (az + t_ * (bz - az)))

    n_trees = 0
    while n_trees < 70:                                    # a leafy neighbourhood of mixed trees (no buildings, as the owner asked)
        a, d = random.uniform(0, 2 * math.pi), random.uniform(48, 200)
        x, z = 21.5 + d * math.cos(a), 14 + d * math.sin(a)
        if (-36 < x < 0 and -220 < z < 240) or (-6 < x < 54 and -6 < z < 34) or near_aerial(x, z) < 40:
            continue
        kinds = ["island_tree_01", "island_tree_02", "island_tree_03", "tree_small_02"] if d > 70 else ["island_tree_01", "tree_small_02"]
        place(random.choice(kinds), x, -0.55, z, random.uniform(0, 6.28), scale=random.uniform(0.9, 1.4))
        n_trees += 1
    for x, z in ((66, 20), (-52, 48), (74, -18), (10, -40)):   # a few jacarandas, common in Indian neighbourhoods
        place("jacaranda_tree", x, -0.55, z, random.uniform(0, 6.28), scale=0.8)
    log("background trees placed")

# ================================================================ sky, sun and lights
HDRI = os.path.abspath(os.path.join(args.assets, "hdri", "kloofendal_48d_partly_cloudy_puresky.hdr"))
SUN_AZ, SUN_EL = math.radians(245), math.radians(32)          # late afternoon, from the south-west
sun_dir = Vector((math.sin(SUN_AZ) * math.cos(SUN_EL), math.cos(SUN_AZ) * math.cos(SUN_EL), math.sin(SUN_EL)))
world = bpy.data.worlds.new("World")
scene.world = world
world.use_nodes = True
wn, wl = world.node_tree.nodes, world.node_tree.links
wn.clear()
env = wn.new("ShaderNodeTexEnvironment")
env.image = bpy.data.images.load(HDRI)
px = np.empty(len(env.image.pixels), np.float32)
env.image.pixels.foreach_get(px)
w_, h_ = env.image.size
lum = (px.reshape(h_, w_, 4)[..., :3] @ np.array([0.2126, 0.7152, 0.0722], np.float32))
iy, ix = np.unravel_index(int(np.argmax(lum)), lum.shape)
phi_hdr = -((ix + 0.5) / w_ - 0.5) * 2 * math.pi            # azimuth of the HDRI sun (angle from +X towards +Y)
phi_tgt = math.atan2(sun_dir.y, sun_dir.x)
tc = wn.new("ShaderNodeTexCoord")
mp = wn.new("ShaderNodeMapping")
mp.inputs["Rotation"].default_value = (0, 0, phi_hdr - phi_tgt)
wl.new(tc.outputs["Generated"], mp.inputs["Vector"])
wl.new(mp.outputs[0], env.inputs["Vector"])
clamp = wn.new("ShaderNodeVectorMath")
clamp.operation = "MINIMUM"
clamp.inputs[1].default_value = (2.5, 2.5, 2.5)               # the HDRI's sun is replaced by a crisp sun lamp
wl.new(env.outputs["Color"], clamp.inputs[0])
lp = wn.new("ShaderNodeLightPath")
mixc = wn.new("ShaderNodeMix")
mixc.data_type = "RGBA"
mf, ma, mb, mo = mix_sockets(mixc)
wl.new(lp.outputs["Is Camera Ray"], mf)
wl.new(clamp.outputs[0], ma)
wl.new(env.outputs["Color"], mb)
bg = wn.new("ShaderNodeBackground")
bg.inputs["Strength"].default_value = 1.0
wl.new(mo, bg.inputs["Color"])
wout = wn.new("ShaderNodeOutputWorld")
wl.new(bg.outputs[0], wout.inputs["Surface"])
sun = bpy.data.objects.new("Sun", bpy.data.lights.new("Sun", "SUN"))
sun.data.energy = 4.2
sun.data.angle = math.radians(0.8)
sun.data.color = (1.0, 0.93, 0.84)
sun.rotation_euler = (-sun_dir).to_track_quat("-Z", "Y").to_euler()
scene.collection.objects.link(sun)


def area(name, p, size, watts, color=(1.0, 0.86, 0.7), portal=False):
    ld = bpy.data.lights.new(name, "AREA")
    ld.shape, (ld.size, ld.size_y), ld.energy, ld.color = "RECTANGLE", size, watts, color
    ld.cycles.is_portal = portal
    ob = bpy.data.objects.new(name, ld)
    ob.location = p
    ob.visible_camera = ob.visible_glossy = False
    scene.collection.objects.link(ob)


area("SkylightPortal", H(20.1, 19.6, 10.0), (11.6 * FT, 7.6 * FT), 0, portal=True)
for nm, (x, y, z), (w, d), wt in [
    ("FillHall", (19.5, 9.2, 3.2), (6, 4), 45), ("FillFoyer", (20.0, 9.2, 17.0), (5, 3), 35), ("FillKitchen", (32.5, 9.2, 10.5), (6, 4), 55),
    ("FillPooja", (37.0, 8.8, 3.0), (3, 3), 20), ("FillLobby", (12.0, 9.2, 16.0), (3, 4), 25), ("FillStair", (5.0, 18.6, 16.0), (5, 5), 30),
    ("FillGallery", (20.0, 18.7, 17.0), (6, 3), 35), ("FillStudy", (32.5, 18.7, 16.0), (6, 4), 45), ("FillMaster", (6.0, 18.7, 6.0), (5, 5), 40),
]:
    area(nm, H(x, y, z), (w * FT, d * FT), wt)
for ob in [o for o in scene.objects if o.instance_collection and o.instance_collection.name == "A_modern_ceiling_lamp_01"]:
    point_light("PendantBulb", ob.location + Vector((0, 0, 0.12)), 12.0, 0.04)
spot = bpy.data.lights.new("BuddhaUplight", "SPOT")
spot.energy, spot.spot_size, spot.spot_blend, spot.color = 25.0, math.radians(50), 0.6, (1.0, 0.8, 0.55)
so = bpy.data.objects.new("BuddhaUplight", spot)
so.location = H(33.6, 0.4, 27.2)
so.rotation_euler = (H(36.3, 3.8, 27.2) - so.location).to_track_quat("-Z", "Y").to_euler()
scene.collection.objects.link(so)
log("lights set")

# ================================================================ cameras (house-local feet; eye ≈ 5.3 ft above the floor)
FPS = 24
SHOTS = [  # (name, seconds, [(t, cam xyz, look xyz), ...], lens mm, exposure EV)
    ("Approach", 9, [(0, (-24, 6.2, 34), (10, 9, 20)), (0.5, (-9, 5.6, 28.0), (16, 8, 21)), (1, (3.0, 5.4, 25.8), (21, 6.2, 21.5))], 24, 0.0),
    ("Enter", 9, [(0, (3.0, 5.4, 25.8), (21, 6.2, 21.5)), (0.4, (15.5, 5.4, 26.0), (20.6, 6.0, 20.0)), (0.6, (20.3, 5.4, 24.6), (20.3, 6.0, 15.0)),
                  (0.8, (20.3, 5.4, 20.5), (20.3, 6.5, 12)), (1, (20.3, 5.4, 16.0), (19.5, 12.5, 7))], 22, 0.15),
    ("Living", 9, [(0, (21.5, 5.2, 13.5), (19.5, 3.6, 1.5)), (0.5, (19.0, 5.0, 9.8), (17.8, 3.4, 2.5)), (1, (17.4, 5.0, 8.6), (17.0, 3.4, 2.6))], 24, 0.45),
    ("Kitchen", 9, [(0, (24.8, 5.3, 17.5), (33, 3.8, 12.5)), (0.5, (27.0, 5.3, 11.0), (36, 3.8, 8.5)), (1, (27.6, 5.3, 7.2), (38.8, 4.2, 3.0))], 22, 0.45),
    ("Stairs", 8, [(0, (12.6, 5.4, 18.0), (4.0, 6.5, 18.0)), (0.36, (4.5, 9.4, 17.9), (1.5, 10.0, 14.0)), (0.57, (1.8, 10.3, 15.6), (8.0, 12.5, 14.0)),
                   (1, (10.5, 15.3, 14.1), (20.0, 14.5, 12.0))], 20, 0.55),
    ("Gallery", 8, [(0, (15.5, 15.3, 18.0), (19.5, 2.0, 9.5)), (0.5, (21.0, 15.3, 16.8), (21.5, 5.5, 8.0)), (1, (27.5, 15.3, 16.5), (35.0, 14.5, 12.8))], 20, 0.4),
    ("Bedroom", 7, [(0, (12.0, 15.2, 2.0), (5.5, 12.6, 10.5)), (1, (10.0, 15.0, 3.6), (5.0, 12.4, 10.8))], 22, 0.55),
    ("Balcony", 8, [(0, (18.0, 15.3, 18.0), (18.2, 14.5, 26)), (0.45, (18.4, 15.2, 22.2), (30, 13.5, 23.5)), (1, (23.0, 15.4, 22.6), (39.0, 11.5, 25.0))], 22, 0.1),
    ("Buddha", 6, [(0, (26.2, 3.0, 25.0), (36.0, 3.3, 27.2)), (1, (27.8, 3.1, 25.5), (36.0, 3.3, 27.2))], 35, -0.1),
    ("Aerial", 8, [(0, (-18, 28, 52), (20, 8, 12)), (1, (58, 44, 50), (20, 8, 12))], 24, 0.0),
]
frame = 1
for name, secs, keys, lens, ev in SHOTS:
    n = secs * FPS
    cd = bpy.data.cameras.new(name)
    cd.lens, cd.sensor_width, cd.clip_start, cd.clip_end = lens, 36, 0.05, 600
    cam = bpy.data.objects.new(name, cd)
    tgt = bpy.data.objects.new(name + "_look", None)
    scene.collection.objects.link(cam)
    scene.collection.objects.link(tgt)
    con = cam.constraints.new("TRACK_TO")
    con.target, con.track_axis, con.up_axis = tgt, "TRACK_NEGATIVE_Z", "UP_Y"
    cd.dof.use_dof, cd.dof.focus_object, cd.dof.aperture_fstop = True, tgt, {"Buddha": 3.5}.get(name, 8.0)
    for tk, c, look in keys:
        f = frame + round(tk * (n - 1))
        cam.location, tgt.location = H(*c), H(*look)
        cam.keyframe_insert("location", frame=f)
        tgt.keyframe_insert("location", frame=f)
    for ob in (cam, tgt):
        for fc in ob.animation_data.action.fcurves:
            for kp in fc.keyframe_points:
                kp.interpolation, kp.easing = "BEZIER", "EASE_IN_OUT"
    scene.view_settings.exposure = ev
    scene.view_settings.keyframe_insert("exposure", frame=frame)
    mk = scene.timeline_markers.new(name, frame=frame)
    mk.camera = cam
    if frame == 1:
        scene.camera = cam
    frame += n
for fc in scene.animation_data.action.fcurves:
    for kp in fc.keyframe_points:
        kp.interpolation = "CONSTANT"
scene.frame_start, scene.frame_end = 1, frame - 1
scene.render.fps = FPS
log(f"{len(SHOTS)} shots, {frame - 1} frames")

# ================================================================ render settings
r = scene.render
r.engine = "CYCLES"
w, h = (int(v) for v in args.res.split("x"))
r.resolution_x, r.resolution_y, r.resolution_percentage = w, h, 100
r.use_persistent_data = True
r.threads_mode, r.threads = "FIXED", args.threads
r.image_settings.file_format, r.image_settings.color_mode = "PNG", "RGB"
r.use_motion_blur, r.motion_blur_shutter = True, 0.5
c = scene.cycles
c.device = "CPU"
if args.device == "GPU":
    prefs = bpy.context.preferences.addons["cycles"].preferences
    prefs.compute_device_type = "OPTIX"
    prefs.get_devices()
    used = 0
    for d in prefs.devices:
        d.use = d.type == "OPTIX"
        used += d.use
    log(f"GPU devices enabled: {used}")
    if used:
        c.device = "GPU"
        c.denoising_use_gpu = True
c.samples = args.samples
c.use_adaptive_sampling, c.adaptive_threshold = True, 0.02
c.use_denoising, c.denoiser, c.denoising_input_passes = True, "OPENIMAGEDENOISE", "RGB_ALBEDO_NORMAL"
c.max_bounces, c.diffuse_bounces, c.glossy_bounces, c.transmission_bounces, c.transparent_max_bounces = 10, 4, 4, 8, 16
c.blur_glossy, c.caustics_reflective, c.caustics_refractive, c.sample_clamp_indirect = 1.0, False, False, 6.0
scene.view_settings.view_transform = "AgX"
try:
    scene.view_settings.look = "AgX - Medium High Contrast"
except TypeError:
    pass

if args.save:
    bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(args.save))

# ================================================================ render
starts, f = {}, 1
for name, secs, *_ in SHOTS:
    starts[name] = (f, f + secs * FPS - 1)
    f += secs * FPS
if args.preview:
    default = "Approach@0.8,Enter@0.97,Living@0.6,Kitchen@0.45,Kitchen@0.97,Stairs@0.95,Gallery@0.6,Bedroom@0.5,Balcony@0.9,Buddha@0.5,Aerial@0.3"
    for pick in (args.picks or default).split(","):
        name, _, at = pick.partition("@")
        a, b = starts[name]
        fr = round(a + float(at or 0.5) * (b - a))
        scene.frame_set(fr)
        scene.camera = bpy.data.objects[name]
        r.filepath = os.path.join(os.path.abspath(args.out), f"preview_{name}_{fr:04d}.png")
        t0 = time.time()
        bpy.ops.render.render(write_still=True)
        log(f"PREVIEW {name} f{fr} {time.time() - t0:.1f}s")
else:
    if args.frames:
        a, b = (int(v) for v in args.frames.split("-"))
        scene.frame_start, scene.frame_end = a, b
    r.filepath = os.path.join(os.path.abspath(args.out), "frames", "f_")
    r.use_overwrite, r.use_placeholder = False, True              # restartable; several processes can share the folder
    bpy.ops.render.render(animation=True)
