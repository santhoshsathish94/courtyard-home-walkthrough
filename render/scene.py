"""Courtyard Home — photoreal walkthrough (Blender 4.5, Cycles).

Usage (headless):
  blender -b -P scene.py -- --glb courtyard.glb --out out/ [--preview [--picks Aerial,Stairs]] [--res 1280x720]
                            [--samples 64] [--threads 96] [--device CPU|GPU] [--frames 1-1272] [--save scene.blend]

--preview renders a few key stills; otherwise the animation frames are written as PNGs to <out>/frames/.
--device GPU renders with OptiX on the NVIDIA GPUs visible through CUDA_VISIBLE_DEVICES.
Model units are feet (three.js export); the import is scaled to metres. House-local feet (x, y, z) map to
Blender metres as X = 0.3048·(x − 21.5), Y = −0.3048·(z − 14), Z = 0.3048·y.
"""
import argparse
import math
import os
import sys

import bpy
from mathutils import Vector

FT = 0.3048
argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
ap = argparse.ArgumentParser()
ap.add_argument("--glb", default="courtyard.glb")
ap.add_argument("--out", default="out")
ap.add_argument("--preview", action="store_true")
ap.add_argument("--res", default="1280x720")
ap.add_argument("--samples", type=int, default=64)
ap.add_argument("--threads", type=int, default=96)
ap.add_argument("--frames", default="")
ap.add_argument("--save", default="")
ap.add_argument("--device", default="CPU", choices=["CPU", "GPU"])
ap.add_argument("--picks", default="")
args = ap.parse_args(argv)
os.makedirs(args.out, exist_ok=True)


def H(x, y, z):
    """House-local feet → Blender metres."""
    return Vector(((x - 21.5) * FT, -(z - 14.0) * FT, y * FT))


# ---------------------------------------------------------------- import
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
bpy.context.view_layer.update()

# ---------------------------------------------------------------- materials
def bsdf_of(m):
    if not m.use_nodes:
        m.use_nodes = True
    for n in m.node_tree.nodes:
        if n.type == "BSDF_PRINCIPLED":
            return n
    return None


def set_in(n, name, value):
    if name in n.inputs:
        n.inputs[name].default_value = value


def base_image(m, b):
    link = b.inputs["Base Color"].links
    return link[0].from_node if link and link[0].from_node.type == "TEX_IMAGE" else None


def add_bump(m, b, strength=0.08, distance=0.02, noise_scale=None):
    nt = m.node_tree
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = strength
    bump.inputs["Distance"].default_value = distance
    img = base_image(m, b)
    if img is not None and noise_scale is None:
        bw = nt.nodes.new("ShaderNodeRGBToBW")
        nt.links.new(img.outputs["Color"], bw.inputs["Color"])
        nt.links.new(bw.outputs["Val"], bump.inputs["Height"])
    else:
        nz = nt.nodes.new("ShaderNodeTexNoise")
        nz.inputs["Scale"].default_value = noise_scale or 40.0
        nz.inputs["Detail"].default_value = 6.0
        nt.links.new(nz.outputs["Fac"], bump.inputs["Height"])
    nt.links.new(bump.outputs["Normal"], b.inputs["Normal"])


def make_glass(m, tint=(0.92, 0.97, 1.0, 1.0), rough=0.02, ior=1.45):
    """Architectural glass: refractive for camera rays, transparent for shadow rays so sunlight enters rooms."""
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    glass = nt.nodes.new("ShaderNodeBsdfPrincipled")
    set_in(glass, "Base Color", tint)
    set_in(glass, "Roughness", rough)
    set_in(glass, "IOR", ior)
    set_in(glass, "Transmission Weight", 1.0)
    clear = nt.nodes.new("ShaderNodeBsdfTransparent")
    clear.inputs["Color"].default_value = tint
    lp = nt.nodes.new("ShaderNodeLightPath")
    mix = nt.nodes.new("ShaderNodeMixShader")
    nt.links.new(lp.outputs["Is Shadow Ray"], mix.inputs["Fac"])
    nt.links.new(glass.outputs["BSDF"], mix.inputs[1])
    nt.links.new(clear.outputs["BSDF"], mix.inputs[2])
    nt.links.new(mix.outputs["Shader"], out.inputs["Surface"])


ROUGH = {"teak": 0.42, "doorTeak": 0.38, "woodLight": 0.45, "soffitWood": 0.6, "cream": 0.88, "creamTrim": 0.85, "stone": 0.75,
         "paver": 0.85, "slab": 0.9, "coolRoof": 0.9, "floorTile": 0.18, "counter": 0.2, "porcelain": 0.12, "charcoal": 0.5,
         "brownRoof": 0.7, "terracotta": 0.8, "rug": 0.95, "bed": 0.9, "blanket": 0.95, "sofa": 0.9, "sofaCushion": 0.9,
         "grass": 0.95, "lawnBright": 0.95, "road": 0.92, "soil": 0.95, "tank": 0.45, "car": 0.25, "rubber": 0.8}
for m in bpy.data.materials:
    name = m.name.split(".")[0]
    b = bsdf_of(m)
    if name in {"glass", "glassClear", "carGlass"}:
        make_glass(m)
        continue
    if name == "water":
        make_glass(m, tint=(0.55, 0.78, 0.82, 1.0), rough=0.03, ior=1.33)
        continue
    if b is None:
        continue
    set_in(b, "Alpha", 1.0)
    if name in ROUGH:
        set_in(b, "Roughness", ROUGH[name])
    if name == "mirror":
        set_in(b, "Base Color", (0.95, 0.95, 0.95, 1)); set_in(b, "Metallic", 1.0); set_in(b, "Roughness", 0.02)
    elif name == "steel":
        set_in(b, "Metallic", 1.0); set_in(b, "Roughness", 0.22)
    elif name == "brass":
        set_in(b, "Base Color", (0.78, 0.56, 0.24, 1)); set_in(b, "Metallic", 1.0); set_in(b, "Roughness", 0.28)
    elif name == "solar":
        set_in(b, "Base Color", (0.02, 0.04, 0.12, 1)); set_in(b, "Roughness", 0.08); set_in(b, "Coat Weight", 1.0)
    elif name in {"floorTile", "counter", "porcelain"}:
        set_in(b, "Coat Weight", 0.3 if name == "floorTile" else 0.6)
        add_bump(m, b, strength=0.03, distance=0.01)
    elif name in {"teak", "doorTeak", "woodLight", "soffitWood"}:
        add_bump(m, b, strength=0.12, distance=0.02)
    elif name in {"cream", "creamTrim", "slab"}:
        add_bump(m, b, strength=0.06, distance=0.02, noise_scale=60.0)
    elif name in {"stone", "paver", "coolRoof", "road", "terracotta"}:
        add_bump(m, b, strength=0.25, distance=0.03)
    elif name in {"grass", "lawnBright"}:
        add_bump(m, b, strength=0.5, distance=0.05, noise_scale=180.0)
    elif name.startswith("foliage"):
        set_in(b, "Subsurface Weight", 0.15); set_in(b, "Roughness", 0.6)
        nt = m.node_tree
        vor = nt.nodes.new("ShaderNodeTexVoronoi"); vor.inputs["Scale"].default_value = 9.0
        bump = nt.nodes.new("ShaderNodeBump"); bump.inputs["Strength"].default_value = 0.9
        nt.links.new(vor.outputs["Distance"], bump.inputs["Height"]); nt.links.new(bump.outputs["Normal"], b.inputs["Normal"])
    # unlit materials from three.js (diya flames) glow
    col = b.inputs["Base Color"].default_value
    if m.name.startswith("Material") and col[0] > 0.9 and 0.5 < col[1] < 0.8 and col[2] < 0.35:
        set_in(b, "Emission Color", (1.0, 0.62, 0.25, 1)); set_in(b, "Emission Strength", 6.0)

# Soften edges a little (real objects never have razor edges). Skip big ground planes and large architectural
# surfaces: overlapping wall boxes (parapet inside the stair-room wall) bevel badly and render black.
NO_BEVEL = {"cream", "creamTrim", "slab", "coolRoof", "floorTile", "grass", "lawnBright", "road", "paver", "stone"}
for o in scene.objects:
    if (o.type == "MESH" and len(o.data.vertices) < 300000 and max(o.dimensions) < 120
            and not ({s.material.name.split(".")[0] for s in o.material_slots if s.material} & NO_BEVEL)):
        bev = o.modifiers.new("Bevel", "BEVEL")
        bev.width = 0.02
        bev.segments = 2
        bev.limit_method = "ANGLE"
        bev.angle_limit = math.radians(40)


def mat_names(o):
    return {s.material.name.split(".")[0] for s in o.material_slots if s.material}


# The placeholder box car reads as a toy in a photoreal render: leave the carport empty.
for o in scene.objects:
    if o.type == "MESH" and mat_names(o) & {"car", "carGlass", "rubber"}:
        o.hide_render = True

# ---------------------------------------------------------------- foliage: scatter real leaves over the blob canopies
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
lm.use_nodes = True
nt = lm.node_tree
lb = nt.nodes["Principled BSDF"]
set_in(lb, "Roughness", 0.55)
set_in(lb, "Subsurface Weight", 0.25)
oi = nt.nodes.new("ShaderNodeObjectInfo")
ramp = nt.nodes.new("ShaderNodeValToRGB")
ramp.color_ramp.elements[0].color = (0.05, 0.16, 0.04, 1)
ramp.color_ramp.elements[1].color = (0.22, 0.38, 0.08, 1)
nt.links.new(oi.outputs["Random"], ramp.inputs["Fac"])
nt.links.new(ramp.outputs["Color"], lb.inputs["Base Color"])
tc = nt.nodes.new("ShaderNodeTexCoord")
sep = nt.nodes.new("ShaderNodeSeparateXYZ")
nt.links.new(tc.outputs["UV"], sep.inputs["Vector"])


def math_node(op, a, b=None):
    n = nt.nodes.new("ShaderNodeMath")
    n.operation = op
    for i, v in enumerate((a, b)):
        if v is None:
            continue
        if isinstance(v, (int, float)):
            n.inputs[i].default_value = v
        else:
            nt.links.new(v, n.inputs[i])
    return n.outputs[0]


# leaf outline: |u - 0.5| * 2 < sin(pi * v) ^ 0.7
half = math_node("MULTIPLY", math_node("ABSOLUTE", math_node("SUBTRACT", sep.outputs["X"], 0.5)), 2.0)
width = math_node("POWER", math_node("SINE", math_node("MULTIPLY", sep.outputs["Y"], math.pi)), 0.7)
nt.links.new(math_node("LESS_THAN", half, width), lb.inputs["Alpha"])
leaf_me.materials.append(lm)

ng = bpy.data.node_groups.new("Leafify", "GeometryNodeTree")
ng.interface.new_socket("Geometry", in_out="INPUT", socket_type="NodeSocketGeometry")
s_den = ng.interface.new_socket("Density", in_out="INPUT", socket_type="NodeSocketFloat")
s_den.default_value = 60.0
s_sc = ng.interface.new_socket("Scale", in_out="INPUT", socket_type="NodeSocketFloat")
s_sc.default_value = 1.0
ng.interface.new_socket("Geometry", in_out="OUTPUT", socket_type="NodeSocketGeometry")
gn = ng.nodes
gi, go = gn.new("NodeGroupInput"), gn.new("NodeGroupOutput")
dist = gn.new("GeometryNodeDistributePointsOnFaces")
gobj = gn.new("GeometryNodeObjectInfo")
gobj.inputs["Object"].default_value = leaf_obj
rv_rot = gn.new("FunctionNodeRandomValue")
rv_rot.data_type = "FLOAT_VECTOR"
rv_rot.inputs["Max"].default_value = (6.283, 6.283, 6.283)
rv_s = gn.new("FunctionNodeRandomValue")
rv_s.data_type = "FLOAT"
rv_s.inputs[2].default_value = 0.7
rv_s.inputs[3].default_value = 1.35
mul = gn.new("ShaderNodeMath")
mul.operation = "MULTIPLY"
inst = gn.new("GeometryNodeInstanceOnPoints")
join = gn.new("GeometryNodeJoinGeometry")
L = ng.links
L.new(gi.outputs["Geometry"], dist.inputs["Mesh"])
L.new(gi.outputs["Density"], dist.inputs["Density"])
L.new(dist.outputs["Points"], inst.inputs["Points"])
L.new(gobj.outputs["Geometry"], inst.inputs["Instance"])
L.new(rv_rot.outputs[0], inst.inputs["Rotation"])
L.new(rv_s.outputs[1], mul.inputs[0])
L.new(gi.outputs["Scale"], mul.inputs[1])
L.new(mul.outputs[0], inst.inputs["Scale"])
L.new(gi.outputs["Geometry"], join.inputs["Geometry"])
L.new(inst.outputs["Instances"], join.inputs["Geometry"])
L.new(join.outputs["Geometry"], go.inputs["Geometry"])

total_area = 0.0
for o in list(scene.objects):
    if o.type == "MESH" and any(n.startswith("foliage") for n in mat_names(o)):
        area = sum(p.area for p in o.data.polygons)
        total_area += area
        mod = o.modifiers.new("Leaves", "NODES")
        mod.node_group = ng
        for item in ng.interface.items_tree:
            if getattr(item, "in_out", "") == "INPUT" and item.name == "Density":
                mod[item.identifier] = 55.0
            if getattr(item, "in_out", "") == "INPUT" and item.name == "Scale":
                mod[item.identifier] = 1.0
        for s in o.material_slots:          # the blob becomes the shaded inner canopy
            b = bsdf_of(s.material)
            if b is not None:
                set_in(b, "Base Color", (0.035, 0.09, 0.03, 1))
print(f"FOLIAGE area {total_area:.0f} sq ft -> ~{int(total_area * 55):,} leaves", flush=True)

# ---------------------------------------------------------------- sun & sky (late afternoon, sun from the south-west)
SUN_AZ, SUN_EL = math.radians(235), math.radians(26)
sun_dir = Vector((math.sin(SUN_AZ) * math.cos(SUN_EL), math.cos(SUN_AZ) * math.cos(SUN_EL), math.sin(SUN_EL)))
world = bpy.data.worlds.new("World")
scene.world = world
world.use_nodes = True
wn = world.node_tree.nodes
wn.clear()
sky = wn.new("ShaderNodeTexSky")
sky.sky_type = "NISHITA"
sky.sun_disc = False
sky.sun_elevation = SUN_EL
sky.sun_rotation = math.atan2(sun_dir.x, sun_dir.y)
sky.air_density = 1.2
sky.dust_density = 2.5
bg = wn.new("ShaderNodeBackground")
bg.inputs["Strength"].default_value = 0.22
wout = wn.new("ShaderNodeOutputWorld")
world.node_tree.links.new(sky.outputs["Color"], bg.inputs["Color"])
world.node_tree.links.new(bg.outputs["Background"], wout.inputs["Surface"])

sun = bpy.data.objects.new("Sun", bpy.data.lights.new("Sun", "SUN"))
sun.data.energy = 3.6
sun.data.angle = math.radians(0.6)
sun.data.color = (1.0, 0.93, 0.84)
sun.rotation_euler = (-sun_dir).to_track_quat("-Z", "Y").to_euler()
scene.collection.objects.link(sun)


def area_light(name, p, size, watts, color=(1.0, 0.86, 0.7), portal=False, rot=None):
    ld = bpy.data.lights.new(name, "AREA")
    ld.shape = "RECTANGLE"
    ld.size, ld.size_y = size
    ld.energy = watts
    ld.color = color
    if portal:
        ld.cycles.is_portal = True
    ob = bpy.data.objects.new(name, ld)
    ob.location = p
    if rot is not None:
        ob.rotation_euler = rot
    ob.visible_camera = False
    ob.visible_glossy = False
    scene.collection.objects.link(ob)
    return ob


# Skylight portal over the courtyard (helps Cycles sample daylight entering the house)
area_light("SkylightPortal", H(20.1, 19.6, 10.0), (11.6 * FT, 7.6 * FT), 0, portal=True)
# Soft warm fill lights near the ceilings (lamps you'd have on in the late afternoon)
for nm, (x, y, z), (w, d), wt in [
    ("FillHall", (20.0, 9.2, 3.5), (6, 4), 60), ("FillFoyer", (20.0, 9.2, 17.0), (5, 3), 45), ("FillKitchen", (33.0, 9.2, 12.0), (6, 4), 70),
    ("FillPooja", (37.0, 8.8, 3.0), (3, 3), 25), ("FillLobby", (12.0, 9.2, 16.0), (3, 4), 30), ("FillStair", (5.0, 18.6, 16.0), (5, 5), 35),
    ("FillGallery", (20.0, 18.7, 17.0), (6, 3), 45), ("FillStudy", (32.5, 18.7, 16.0), (6, 4), 55), ("FillMaster", (6.0, 18.7, 6.0), (5, 5), 40),
]:
    area_light(nm, H(x, y, z), (w * FT, d * FT), wt)

# ---------------------------------------------------------------- cameras (house-local feet; eye ≈ 5.3 ft above the floor)
FPS = 24
SHOTS = [  # (name, seconds, [(t 0..1, cam xyz, look xyz), ...], lens mm)
    ("Approach", 7, [(0, (-14, 5.6, 33), (12, 6, 18)), (1, (2.0, 5.4, 22.6), (20.3, 5.0, 21.0))], 24),
    ("Enter", 8, [(0, (20.3, 5.4, 25.5), (20.3, 5.4, 17)), (0.5, (20.3, 5.4, 19.2), (20.3, 7.0, 8.0)), (1, (20.3, 5.4, 15.6), (19.0, 12.0, 6.0))], 20),
    ("Courtyard", 9, [(0, (17.5, 5.4, 13.0), (20.0, 6.5, 2.0)), (0.5, (22.0, 5.4, 12.6), (30.0, 5.0, 4.0)), (1, (27.5, 5.4, 9.0), (39.0, 4.0, 3.0))], 20),
    ("Stairs", 8, [(0, (12.6, 5.4, 18.0), (4.0, 6.5, 18.0)), (0.36, (4.5, 9.4, 17.9), (1.5, 10.0, 14.0)), (0.57, (1.8, 10.3, 15.6), (8.0, 12.5, 14.0)),
                   (1, (10.5, 15.3, 14.1), (20.0, 14.5, 12.0))], 20),
    ("Gallery", 9, [(0, (15.5, 15.3, 18.0), (19.5, 2.0, 9.5)), (0.5, (21.0, 15.3, 16.8), (21.5, 5.5, 8.0)), (1, (27.5, 15.3, 16.5), (35.0, 14.5, 12.8))], 20),
    ("Fountain", 5, [(0, (33.0, 5.6, 22.2), (36.0, 2.6, 27.2)), (1, (35.4, 5.6, 22.4), (36.0, 3.0, 27.2))], 28),
    ("Aerial", 7, [(0, (62, 30, 46), (20, 8, 12)), (1, (24, 46, 56), (20, 10, 10))], 24),
]
frame = 1
for name, secs, keys, lens in SHOTS:
    n = secs * FPS
    cd = bpy.data.cameras.new(name)
    cd.lens = lens
    cd.sensor_width = 36
    cd.clip_start = 0.05
    cd.clip_end = 400
    cam = bpy.data.objects.new(name, cd)
    tgt = bpy.data.objects.new(name + "_look", None)
    scene.collection.objects.link(cam)
    scene.collection.objects.link(tgt)
    con = cam.constraints.new("TRACK_TO")
    con.target = tgt
    con.track_axis = "TRACK_NEGATIVE_Z"
    con.up_axis = "UP_Y"
    cd.dof.use_dof = True
    cd.dof.focus_object = tgt
    cd.dof.aperture_fstop = 8.0
    for t, c, l in keys:
        f = frame + round(t * (n - 1))
        cam.location = H(*c)
        tgt.location = H(*l)
        cam.keyframe_insert("location", frame=f)
        tgt.keyframe_insert("location", frame=f)
    for ob in (cam, tgt):
        for fc in ob.animation_data.action.fcurves:
            for kp in fc.keyframe_points:
                kp.interpolation = "BEZIER"
                kp.easing = "EASE_IN_OUT"
    mk = scene.timeline_markers.new(name, frame=frame)
    mk.camera = cam
    if frame == 1:
        scene.camera = cam
    frame += n
scene.frame_start, scene.frame_end = 1, frame - 1
scene.render.fps = FPS

# ---------------------------------------------------------------- render settings (Cycles, CPU)
r = scene.render
r.engine = "CYCLES"
w, h = (int(v) for v in args.res.split("x"))
r.resolution_x, r.resolution_y, r.resolution_percentage = w, h, 100
r.use_persistent_data = True
r.threads_mode = "FIXED"
r.threads = args.threads
r.image_settings.file_format = "PNG"
r.image_settings.color_mode = "RGB"
r.film_transparent = False
c = scene.cycles
c.device = "CPU"
if args.device == "GPU":
    # OptiX on the visible NVIDIA GPU(s) (restrict with CUDA_VISIBLE_DEVICES); the scene needs only ~1 GB of VRAM.
    prefs = bpy.context.preferences.addons["cycles"].preferences
    prefs.compute_device_type = "OPTIX"
    prefs.get_devices()
    used = 0
    for d in prefs.devices:
        d.use = d.type == "OPTIX"
        used += d.use
    print(f"GPU devices enabled: {used}", flush=True)
    if used:
        c.device = "GPU"
        c.denoising_use_gpu = True
c.samples = args.samples
c.use_adaptive_sampling = True
c.adaptive_threshold = 0.03
c.use_denoising = True
c.denoiser = "OPENIMAGEDENOISE"
c.denoising_input_passes = "RGB_ALBEDO_NORMAL"
c.max_bounces = 8
c.diffuse_bounces = 4
c.glossy_bounces = 4
c.transmission_bounces = 8
c.transparent_max_bounces = 8
c.blur_glossy = 1.0
c.caustics_reflective = False
c.caustics_refractive = False
c.sample_clamp_indirect = 8.0
scene.view_settings.view_transform = "AgX"
try:
    scene.view_settings.look = "AgX - Medium High Contrast"
except TypeError:
    pass
scene.view_settings.exposure = 0.0

if args.save:
    bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(args.save))

# ---------------------------------------------------------------- render
if args.preview:
    starts = {}
    f = 1
    for name, secs, _, _ in SHOTS:
        starts[name] = (f, f + secs * FPS - 1)
        f += secs * FPS
    picks = [("Approach", 0.6), ("Enter", 0.95), ("Courtyard", 0.95), ("Stairs", 0.5), ("Gallery", 0.45), ("Fountain", 0.5), ("Aerial", 0.4)]
    if args.picks:
        picks = [p for p in picks if p[0] in args.picks.split(",")]
    import time
    for name, t in picks:
        a, b = starts[name]
        scene.frame_set(round(a + t * (b - a)))
        scene.camera = bpy.data.objects[name]
        r.filepath = os.path.join(os.path.abspath(args.out), f"preview_{name}.png")
        t0 = time.time()
        bpy.ops.render.render(write_still=True)
        print(f"PREVIEW {name} {time.time() - t0:.1f}s", flush=True)
else:
    if args.frames:
        a, b = (int(v) for v in args.frames.split("-"))
        scene.frame_start, scene.frame_end = a, b
    r.filepath = os.path.join(os.path.abspath(args.out), "frames", "f_")
    # Skip frames that already exist so a restarted render resumes where it stopped.
    r.use_overwrite = False
    r.use_placeholder = True
    bpy.ops.render.render(animation=True)
