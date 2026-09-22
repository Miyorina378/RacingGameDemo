import bpy
import bmesh
import math
import os
from mathutils import Vector, Matrix, Euler

# ==============================================================================
# 1998 TOYOTA GT-ONE (TS020) LE MANS MASTER AUTOMOTIVE CRAFTSMANSHIP
#
# Faithfully sculpted directly to match the 1998 GT-One reference image:
# 1. Raised Formula 1 style central nose keel with crowned ridge (Z = 0.28 - 0.72m)
# 2. Open lower center radiator intake airway underneath the nose beak
# 3. Deep 39cm concave aero valleys scooping between keel and fender pontoons
# 4. Muscular arched front fender pontoons with flush polycarbonate headlights
# 5. Vertical rectangular brake cooling scoops directly below headlights
# 6. Organic fender-mounted teardrop racing mirrors on curved stalks
# 7. Complete solid vertical front fender skirts enclosing front wheels
# 8. Authentic Toyota nose tip emblem
# 9. 100% pure Super Red finish with high-gloss clearcoat (matching reference photo)
# 10. BBS Le Mans gold mesh wheels (16 radial cross-spokes, hollow barrels, open lips)
# 11. 4 separate Brembo calipers parented to ROOT (steer, no spin)
# 12. Strict compliance with BLENDER_NOTE.md and game engine standards
# ==============================================================================

# Reset scene
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
for col in list(bpy.data.collections):
    bpy.data.collections.remove(col)
for block_group in (bpy.data.meshes, bpy.data.curves, bpy.data.materials, bpy.data.cameras, bpy.data.lights):
    for block in list(block_group):
        block_group.remove(block)

SCENE = bpy.context.scene
ROOT_DIR = r"D:\RacingGameDemo"
BLEND_PATH = os.path.join(ROOT_DIR, "toyota_gt_one_1998.blend")
GLB_PATH = os.path.join(ROOT_DIR, "public", "models", "toyota_gt_one_1998.glb")

SCENE.unit_settings.system = 'METRIC'
SCENE.unit_settings.length_unit = 'METERS'
SCENE.render.engine = 'BLENDER_EEVEE'
SCENE.render.resolution_x = 1280
SCENE.render.resolution_y = 720
SCENE.render.resolution_percentage = 100
SCENE.render.image_settings.file_format = 'PNG'
SCENE.view_settings.look = 'AgX - Medium High Contrast'

ASSET_COLLECTION = bpy.data.collections.new("Toyota_GT_One_ASSETS")
STUDIO_COLLECTION = bpy.data.collections.new("Studio_Review")
SCENE.collection.children.link(ASSET_COLLECTION)
SCENE.collection.children.link(STUDIO_COLLECTION)

ROOT = bpy.data.objects.new("Toyota GT-One ROOT", None)
ASSET_COLLECTION.objects.link(ROOT)
ROOT.empty_display_type = 'PLAIN_AXES'

def link(obj, parent=ROOT):
    ASSET_COLLECTION.objects.link(obj)
    if parent:
        obj.parent = parent
    return obj

# ------------------------------------------------------------------------------
# Premium Materials (Super Red Matching Reference Photo)
# ------------------------------------------------------------------------------
def rgba(hex_val, alpha=1.0):
    if isinstance(hex_val, str):
        hex_val = int(hex_val.lstrip('#'), 16)
    return (((hex_val >> 16) & 255) / 255.0, ((hex_val >> 8) & 255) / 255.0, (hex_val & 255) / 255.0, alpha)

def make_material(name, color, metallic=0.0, roughness=0.35, alpha=1.0, transmission=0.0, coat=0.0, coat_roughness=0.08, emission=None, emission_strength=0.0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    values = {
        'Base Color': rgba(color, 1.0), 'Metallic': metallic, 'Roughness': roughness,
        'Alpha': alpha, 'Transmission Weight': transmission, 'Coat Weight': coat,
        'Coat Roughness': coat_roughness, 'IOR': 1.50
    }
    for k, v in values.items():
        if k in bsdf.inputs:
            bsdf.inputs[k].default_value = v
    if emission is not None:
        if 'Emission Color' in bsdf.inputs:
            bsdf.inputs['Emission Color'].default_value = rgba(emission, 1.0)
        elif 'Emission' in bsdf.inputs:
            bsdf.inputs['Emission'].default_value = rgba(emission, 1.0)
        if 'Emission Strength' in bsdf.inputs:
            bsdf.inputs['Emission Strength'].default_value = emission_strength
    return mat

MAT_RED = make_material('car_paint', 0xD80816, metallic=0.35, roughness=0.12, coat=1.0, coat_roughness=0.03)
MAT_WHITE = make_material('paint_white', 0xF6F8FA, metallic=0.08, roughness=0.18, coat=1.0, coat_roughness=0.04)
MAT_GLASS = make_material('glass', 0x061018, metallic=0.08, roughness=0.03, alpha=0.92, transmission=0.20, coat=1.0)
MAT_WINDSHIELD = make_material('windshield', 0x060E16, metallic=0.06, roughness=0.02, alpha=0.90, transmission=0.22, coat=1.0)
MAT_CARBON = make_material('carbon_fiber', 0x101214, metallic=0.35, roughness=0.38, coat=0.35)
MAT_DARK = make_material('dark_trim', 0x080A0C, metallic=0.65, roughness=0.24)
MAT_GOLD = make_material('rim', 0xD8A826, metallic=0.95, roughness=0.18, coat=0.55)
MAT_TIRE = make_material('tire_rubber', 0x0A0B0D, roughness=0.72)
MAT_CHROME = make_material('chrome_trim', 0xE2E8EE, metallic=1.0, roughness=0.08, coat=0.50)
MAT_HEADLIGHT_LED = make_material('headlight_projector', 0xFFFFFF, emission=0xFFFFFF, emission_strength=16.0)
MAT_HEADLIGHT_LENS = make_material('headlight_lens', 0xDEF0FF, alpha=0.30, transmission=0.90, coat=1.0)
MAT_AMBER = make_material('turn_signal', 0xFF8800, emission=0xFF8800, emission_strength=3.0)
MAT_TAIL = make_material('taillight', 0x7E0206, metallic=0.08, roughness=0.12, coat=0.85, emission=0x880004, emission_strength=2.0)
MAT_BRAKE = make_material('brake_light', 0xFF0008, emission=0xFF0008, emission_strength=6.0)
MAT_CALIPER = make_material('caliper_gold', 0xC89C18, metallic=0.90, roughness=0.22, coat=0.60)
MAT_ROTOR = make_material('brake_rotor', 0x24282D, metallic=0.85, roughness=0.32)

# ==============================================================================
# 1. 10-COLUMN AUTHENTIC TS020 BODY SHELL (RAISED F1 NOSE KEEL & DEEP GULLIES)
# ==============================================================================
# 10 Columns:
# Col 0: Raised Keel centerline (X = 0.0)
# Col 1: Keel crown (X ~ 0.08)
# Col 2: Keel shoulder ridge (X ~ 0.15 - 0.22)
# Col 3: Valley inner wall / plunge (X ~ 0.25 - 0.32)
# Col 4: Valley trough (X ~ 0.38 - 0.46, deep 39cm concave gully!)
# Col 5: Valley outer floor (X ~ 0.54 - 0.58)
# Col 6: Inner fender pontoon wall (X ~ 0.70 - 0.74)
# Col 7: Fender pontoon crest (X ~ 0.85 - 0.88, muscular high arch!)
# Col 8: Outer fender flank / shoulder (X ~ 0.96 - 0.98)
# Col 9: Rocker panel sill / splitter corner (X ~ 0.99, Z = 0.048)

STATIONS_3D = [
    # S0: Front Splitter & Raised F1 Nose Beak (Swept aerodynamic planform)
    # Nose beak projects forward to Y = -2.48 at Z = 0.28m (air flows underneath!)
    [
        (0.00, -2.48, 0.280), (0.07, -2.47, 0.265), (0.14, -2.44, 0.220), (0.24, -2.38, 0.110),
        (0.36, -2.36, 0.052), (0.52, -2.38, 0.065), (0.68, -2.40, 0.110), (0.84, -2.42, 0.180),
        (0.96, -2.38, 0.085), (0.99, -2.32, 0.048)
    ],
    # S1: Forward Bumper & Brake Ducts (Y ~ -2.25)
    # Keel at 0.42m, deep valley at 0.095m (32.5cm drop!), pontoon at 0.46m
    [
        (0.00, -2.25, 0.420), (0.08, -2.25, 0.405), (0.15, -2.25, 0.350), (0.25, -2.25, 0.200),
        (0.38, -2.25, 0.095), (0.54, -2.25, 0.160), (0.70, -2.25, 0.300), (0.86, -2.25, 0.460),
        (0.96, -2.25, 0.220), (0.99, -2.25, 0.048)
    ],
    # S2: Headlight Slope & Mid Valley (Y ~ -1.95)
    # Keel at 0.54m, deep valley at 0.150m (39cm drop!), pontoon at 0.66m
    [
        (0.00, -1.95, 0.540), (0.08, -1.95, 0.525), (0.16, -1.95, 0.470), (0.26, -1.95, 0.300),
        (0.40, -1.95, 0.150), (0.56, -1.95, 0.240), (0.72, -1.95, 0.480), (0.86, -1.95, 0.660),
        (0.97, -1.95, 0.380), (0.99, -1.95, 0.048)
    ],
    # S3: Front Wheel Arch Leading Edge (Y = -1.74)
    # Complete solid vertical outer skirt down to Z = 0.048 in front of tire!
    [
        (0.00, -1.74, 0.630), (0.09, -1.74, 0.615), (0.18, -1.74, 0.570), (0.28, -1.74, 0.440),
        (0.42, -1.74, 0.290), (0.58, -1.74, 0.420), (0.74, -1.74, 0.600), (0.87, -1.74, 0.740),
        (0.98, -1.74, 0.600), (0.99, -1.74, 0.048)
    ],
    # S4: Front Arch Cutout Start (Y = -1.72)
    [
        (0.00, -1.72, 0.635), (0.09, -1.72, 0.620), (0.18, -1.72, 0.575), (0.28, -1.72, 0.450),
        (0.42, -1.72, 0.310), (0.58, -1.72, 0.440), (0.74, -1.72, 0.620), (0.87, -1.72, 0.745),
        (0.98, -1.72, 0.620), (0.99, -1.72, 0.480)
    ],
    # S5: Front Wheel Apex (Y = -1.40) - clears 0.670m tire
    [
        (0.00, -1.40, 0.690), (0.10, -1.40, 0.680), (0.22, -1.40, 0.650), (0.34, -1.40, 0.550),
        (0.46, -1.40, 0.480), (0.60, -1.40, 0.560), (0.74, -1.40, 0.690), (0.88, -1.40, 0.780),
        (0.98, -1.40, 0.760), (0.99, -1.40, 0.755)
    ],
    # S6: Front Arch Rear Lip (Y = -1.08)
    [
        (0.00, -1.08, 0.720), (0.11, -1.08, 0.710), (0.24, -1.08, 0.685), (0.36, -1.08, 0.635),
        (0.48, -1.08, 0.595), (0.62, -1.08, 0.625), (0.74, -1.08, 0.675), (0.86, -1.08, 0.715),
        (0.96, -1.08, 0.580), (0.99, -1.08, 0.480)
    ],
    # S7: Windshield Cowl & Wasp-Waist Entry (Y = -0.75)
    [
        (0.00, -0.75, 0.725), (0.12, -0.75, 0.720), (0.26, -0.75, 0.710), (0.38, -0.75, 0.690),
        (0.50, -0.75, 0.650), (0.60, -0.75, 0.520), (0.68, -0.75, 0.360), (0.72, -0.75, 0.220),
        (0.74, -0.75, 0.085), (0.76, -0.75, 0.048)
    ],
    # S8: Deepest Wasp-Waist Flank (Y = -0.30)
    [
        (0.00, -0.30, 0.730), (0.12, -0.30, 0.725), (0.26, -0.30, 0.715), (0.38, -0.30, 0.700),
        (0.48, -0.30, 0.670), (0.56, -0.30, 0.460), (0.62, -0.30, 0.300), (0.66, -0.30, 0.180),
        (0.70, -0.30, 0.080), (0.72, -0.30, 0.048)
    ],
    # S9: Radiator Side Pod Flare (Y = +0.15)
    [
        (0.00,  0.15, 0.740), (0.12,  0.15, 0.735), (0.24,  0.15, 0.730), (0.36,  0.15, 0.710),
        (0.48,  0.15, 0.670), (0.62,  0.15, 0.580), (0.76,  0.15, 0.480), (0.88,  0.15, 0.360),
        (0.94,  0.15, 0.090), (0.96,  0.15, 0.048)
    ],
    # S10: Engine Deck Shoulder (Y = +0.55)
    [
        (0.00,  0.55, 0.750), (0.10,  0.55, 0.745), (0.20,  0.55, 0.735), (0.34,  0.55, 0.710),
        (0.46,  0.55, 0.670), (0.64,  0.55, 0.640), (0.80,  0.55, 0.560), (0.92,  0.55, 0.440),
        (0.96,  0.55, 0.095), (0.98,  0.55, 0.048)
    ],
    # S11: Rear Dorsal Spine & Gullies (Y = +0.90)
    [
        (0.00,  0.90, 0.760), (0.08,  0.90, 0.755), (0.16,  0.90, 0.740), (0.30,  0.90, 0.670),
        (0.44,  0.90, 0.610), (0.62,  0.90, 0.680), (0.78,  0.90, 0.740), (0.95,  0.90, 0.540),
        (0.97,  0.90, 0.105), (0.99,  0.90, 0.048)
    ],
    # S12: Rear Arch Front Lip (Y = +1.08)
    [
        (0.00,  1.08, 0.745), (0.07,  1.08, 0.740), (0.14,  1.08, 0.725), (0.28,  1.08, 0.650),
        (0.44,  1.08, 0.580), (0.64,  1.08, 0.680), (0.80,  1.08, 0.765), (0.97,  1.08, 0.640),
        (0.98,  1.08, 0.520), (0.99,  1.08, 0.480)
    ],
    # S13: Rear Wheel Apex (Y = +1.40) - clears 0.670m rear tire
    [
        (0.00,  1.40, 0.710), (0.06,  1.40, 0.705), (0.12,  1.40, 0.695), (0.26,  1.40, 0.620),
        (0.44,  1.40, 0.550), (0.66,  1.40, 0.680), (0.84,  1.40, 0.785), (0.98,  1.40, 0.760),
        (0.99,  1.40, 0.755), (0.99,  1.40, 0.755)
    ],
    # S14: Rear Arch Rear Lip (Y = +1.72)
    [
        (0.00,  1.72, 0.670), (0.06,  1.72, 0.665), (0.12,  1.72, 0.655), (0.26,  1.72, 0.590),
        (0.44,  1.72, 0.520), (0.66,  1.72, 0.650), (0.82,  1.72, 0.745), (0.96,  1.72, 0.620),
        (0.97,  1.72, 0.520), (0.98,  1.72, 0.480)
    ],
    # S15: Rear Deck Slope & Diffuser (Y = +2.05)
    [
        (0.00,  2.05, 0.625), (0.05,  2.05, 0.620), (0.10,  2.05, 0.610), (0.26,  2.05, 0.550),
        (0.46,  2.05, 0.490), (0.64,  2.05, 0.580), (0.78,  2.05, 0.660), (0.90,  2.05, 0.480),
        (0.93,  2.05, 0.200), (0.94,  2.05, 0.150)
    ],
    # S16: Rear Bulkhead (Y = +2.38)
    [
        (0.00,  2.38, 0.570), (0.05,  2.38, 0.565), (0.10,  2.38, 0.555), (0.26,  2.38, 0.510),
        (0.46,  2.38, 0.450), (0.62,  2.38, 0.520), (0.74,  2.38, 0.580), (0.86,  2.38, 0.420),
        (0.90,  2.38, 0.280), (0.92,  2.38, 0.240)
    ],
]

bm_body = bmesh.new()
grid_verts = []
for s_idx, pts in enumerate(STATIONS_3D):
    row = []
    for c_idx, (x, y, z) in enumerate(pts):
        v = bm_body.verts.new((x, y, z))
        row.append(v)
    grid_verts.append(row)

bm_body.verts.ensure_lookup_table()

n_s = len(STATIONS_3D)
n_c = 10

for s in range(n_s - 1):
    for c in range(n_c - 1):
        # Skip outer arch faces over wheels only
        # Front wheel arch is between S4 and S6 (s = 4, 5)
        if (s in (4, 5)) and (c >= 7):
            continue
        # Rear wheel arch is between S12 and S14 (s = 12, 13)
        if (s in (12, 13)) and (c >= 7):
            continue

        v1 = grid_verts[s][c]
        v2 = grid_verts[s+1][c]
        v3 = grid_verts[s+1][c+1]
        v4 = grid_verts[s][c+1]
        f = bm_body.faces.new((v1, v2, v3, v4))
        f.material_index = 0 # 100% Pure Super Red matching reference photo

# Underfloor Tray closing bottom
floor_verts = []
for s in range(n_s):
    pt = STATIONS_3D[s][0]
    y = pt[1]
    z_floor = 0.048 if y < 1.70 else (0.048 + (y - 1.70) * 0.31)
    v_c = bm_body.verts.new((0.0, y, z_floor))
    floor_verts.append(v_c)

bm_body.verts.ensure_lookup_table()

for s in range(n_s - 1):
    if (s in (4, 5)) or (s in (12, 13)):
        v_tub1 = bm_body.verts.new((0.56, STATIONS_3D[s][0][1], 0.048))
        v_tub2 = bm_body.verts.new((0.56, STATIONS_3D[s+1][0][1], 0.048))
        f = bm_body.faces.new((floor_verts[s], floor_verts[s+1], v_tub2, v_tub1))
        f.material_index = 2 # Carbon
        continue
    f = bm_body.faces.new((floor_verts[s], floor_verts[s+1], grid_verts[s+1][9], grid_verts[s][9]))
    f.material_index = 2 # Carbon

# Front Lower Transom (closing under the valley & outer bumper)
f_nose = bm_body.faces.new((floor_verts[0], grid_verts[0][9], grid_verts[0][8], grid_verts[0][7], grid_verts[0][6], grid_verts[0][5], grid_verts[0][4], grid_verts[0][3], grid_verts[0][2], grid_verts[0][1], grid_verts[0][0]))
f_nose.material_index = 0

# Rear Bulkhead Cap
last_s = n_s - 1
f_rear = bm_body.faces.new((grid_verts[last_s][0], grid_verts[last_s][1], grid_verts[last_s][2], grid_verts[last_s][3], grid_verts[last_s][4], grid_verts[last_s][5], grid_verts[last_s][6], grid_verts[last_s][7], grid_verts[last_s][8], grid_verts[last_s][9], floor_verts[last_s]))
f_rear.material_index = 3 # Dark Bulkhead

# Crease Rocker Panel Bottom to keep sill dead-flat
bm_body.edges.ensure_lookup_table()
crease_layer = bm_body.edges.layers.float.new('crease_edge')
for s in range(n_s - 1):
    if s not in (4, 5, 12, 13):
        e = bm_body.edges.get((grid_verts[s][9], grid_verts[s+1][9]))
        if e:
            e[crease_layer] = 0.95

# Crease Wheel Arch Lips
for arch_s in (4, 5, 6, 12, 13, 14):
    e = bm_body.edges.get((grid_verts[arch_s-1][7], grid_verts[arch_s][7]))
    if e:
        e[crease_layer] = 0.85

# Crisp F1 nose keel shoulder ridge
for s in range(4):
    e = bm_body.edges.get((grid_verts[s][2], grid_verts[s+1][2]))
    if e:
        e[crease_layer] = 0.70

# Crisp aerodynamic valley trough for deep sculptural definition
for s in range(4):
    e = bm_body.edges.get((grid_verts[s][4], grid_verts[s+1][4]))
    if e:
        e[crease_layer] = 0.50

bmesh.ops.recalc_face_normals(bm_body, faces=bm_body.faces)
mesh_body = bpy.data.meshes.new("Toyota_GT_One_Body_Mesh")
bm_body.to_mesh(mesh_body)
bm_body.free()

for poly in mesh_body.polygons:
    poly.use_smooth = True

body_obj = bpy.data.objects.new("Toyota_GT_One_Body", mesh_body)
link(body_obj)
body_obj.data.materials.append(MAT_RED)
body_obj.data.materials.append(MAT_WHITE)
body_obj.data.materials.append(MAT_CARBON)
body_obj.data.materials.append(MAT_DARK)

mod_mirror = body_obj.modifiers.new("Mirror", 'MIRROR')
mod_mirror.use_axis[0] = True
mod_mirror.use_clip = True
mod_mirror.use_mirror_merge = True
mod_mirror.merge_threshold = 0.005

mod_subd = body_obj.modifiers.new("Subdivision", 'SUBSURF')
mod_subd.levels = 2
mod_subd.render_levels = 2

# ==============================================================================
# 2. TOYOTA NOSE TIP EMBLEM (MATCHING REFERENCE PHOTO)
# ==============================================================================
bm_emb = bmesh.new()
bmesh.ops.create_circle(bm_emb, cap_ends=True, radius=0.024, segments=16)
bmesh.ops.scale(bm_emb, vec=(1.35, 1.0, 1.0), verts=bm_emb.verts)
bmesh.ops.rotate(bm_emb, cent=(0, 0, 0), matrix=Euler((0.38, 0, 0), 'XYZ').to_matrix(), verts=bm_emb.verts)
bmesh.ops.translate(bm_emb, vec=(0.0, -2.465, 0.285), verts=bm_emb.verts)
m_emb = bpy.data.meshes.new("Toyota_Emblem_Mesh")
bm_emb.to_mesh(m_emb)
bm_emb.free()
o_emb = bpy.data.objects.new("Toyota_Emblem", m_emb)
link(o_emb, parent=body_obj)
o_emb.data.materials.append(MAT_WHITE)

# ==============================================================================
# 3. CARBON SPLITTER & FRONT UNDER-NOSE INTAKE
# ==============================================================================
sp_verts = [
    (0.00, -2.52, 0.038), (1.00, -2.52, 0.038), (1.00, -2.18, 0.040), (0.00, -2.18, 0.040),
    (0.00, -2.52, 0.052), (1.00, -2.52, 0.052), (1.00, -2.18, 0.054), (0.00, -2.18, 0.054),
]
sp_faces = [(0, 1, 2, 3), (7, 6, 5, 4), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)]
m_sp = bpy.data.meshes.new("Front_Splitter_Tray_Mesh")
m_sp.from_pydata(sp_verts, [], sp_faces)
m_sp.validate()
m_sp.update()
for p in m_sp.polygons:
    p.use_smooth = True
o_sp = bpy.data.objects.new("Front_Splitter_Tray", m_sp)
link(o_sp)
o_sp.data.materials.append(MAT_CARBON)
mod_sp_m = o_sp.modifiers.new("Mirror", 'MIRROR')
mod_sp_m.use_axis[0] = True

# Lower intake opening under raised nose keel
bm_nth = bmesh.new()
bmesh.ops.create_cube(bm_nth, size=1.0)
bmesh.ops.scale(bm_nth, vec=(0.28, 0.12, 0.14), verts=bm_nth.verts)
bmesh.ops.translate(bm_nth, vec=(0.0, -2.40, 0.14), verts=bm_nth.verts)
m_nth = bpy.data.meshes.new("Nose_Throat_Mesh")
bm_nth.to_mesh(m_nth)
bm_nth.free()
o_nth = bpy.data.objects.new("Nose_Throat", m_nth)
link(o_nth)
o_nth.data.materials.append(MAT_DARK)

# Rear Diffuser 4 Vertical Strakes
for x in (-0.55, -0.20, 0.20, 0.55):
    bm_st = bmesh.new()
    bmesh.ops.create_cube(bm_st, size=1.0)
    bmesh.ops.scale(bm_st, vec=(0.010, 0.70, 0.18), verts=bm_st.verts)
    bmesh.ops.rotate(bm_st, cent=(0, 0, 0), matrix=Euler((0.24, 0, 0), 'XYZ').to_matrix(), verts=bm_st.verts)
    bmesh.ops.translate(bm_st, vec=(x, 2.05, 0.15), verts=bm_st.verts)
    m_st = bpy.data.meshes.new(f"Diffuser_Strake_{x:.2f}")
    bm_st.to_mesh(m_st)
    bm_st.free()
    o_st = bpy.data.objects.new(f"Diffuser_Strake_{x:.2f}", m_st)
    link(o_st)
    o_st.data.materials.append(MAT_CARBON)

# ==============================================================================
# 4. TEARDROP COCKPIT CANOPY, ROOF SCOOP & WIPER
# ==============================================================================
canopy_stations = [
    (-1.12, 0.700, 0.38, 0.705, 0.20, 0.710, 0.00),
    (-0.85, 0.720, 0.39, 0.860, 0.22, 0.890, 0.00),
    (-0.55, 0.730, 0.38, 0.980, 0.23, 1.020, 0.00),
    (-0.25, 0.735, 0.37, 1.010, 0.24, 1.050, 0.00),
    ( 0.05, 0.740, 0.36, 0.980, 0.23, 1.015, 0.00),
    ( 0.35, 0.745, 0.34, 0.900, 0.21, 0.930, 0.00),
    ( 0.65, 0.750, 0.32, 0.810, 0.18, 0.835, 0.00),
]

bm_canopy = bmesh.new()
canopy_verts = []
for y, zb, xb, zm, xm, zt, xt in canopy_stations:
    v0 = bm_canopy.verts.new((xt, y, zt))
    v1 = bm_canopy.verts.new((xm, y, zm))
    v2 = bm_canopy.verts.new((xb, y, zb))
    canopy_verts.append((v0, v1, v2))

bm_canopy.verts.ensure_lookup_table()

for s in range(len(canopy_stations) - 1):
    f0 = bm_canopy.faces.new((canopy_verts[s][0], canopy_verts[s+1][0], canopy_verts[s+1][1], canopy_verts[s][1]))
    f1 = bm_canopy.faces.new((canopy_verts[s][1], canopy_verts[s+1][1], canopy_verts[s+1][2], canopy_verts[s][2]))
    if s in (2, 3):
        f0.material_index = 0 # Red roof
        f1.material_index = 1 # Glass side
    elif s < 2:
        f0.material_index = 2 # Windshield glass
        f1.material_index = 2 # Windshield glass
    else:
        f0.material_index = 1 # Rear glass
        f1.material_index = 1 # Rear glass

bmesh.ops.recalc_face_normals(bm_canopy, faces=bm_canopy.faces)
mesh_canopy = bpy.data.meshes.new("Cockpit_Canopy_Mesh")
bm_canopy.to_mesh(mesh_canopy)
bm_canopy.free()

for poly in mesh_canopy.polygons:
    poly.use_smooth = True

canopy_obj = bpy.data.objects.new("Cockpit_Canopy", mesh_canopy)
link(canopy_obj)
canopy_obj.data.materials.append(MAT_RED)
canopy_obj.data.materials.append(MAT_GLASS)
canopy_obj.data.materials.append(MAT_WINDSHIELD)

mod_cm = canopy_obj.modifiers.new("Mirror", 'MIRROR')
mod_cm.use_axis[0] = True
mod_cm.use_clip = True

mod_cs = canopy_obj.modifiers.new("Subdivision", 'SUBSURF')
mod_cs.levels = 2
mod_cs.render_levels = 2

# Low Wide Roof Air Scoop (matching reference photo)
scoop_rows = [
    [(-0.14, -0.48, 1.04), (-0.10, -0.48, 1.100), (0.0, -0.48, 1.105), (0.10, -0.48, 1.100), (0.14, -0.48, 1.04)],
    [(-0.13, -0.22, 1.05), (-0.09, -0.22, 1.095), (0.0, -0.22, 1.100), (0.09, -0.22, 1.095), (0.13, -0.22, 1.05)],
    [(-0.10,  0.10, 1.01), (-0.06,  0.10, 1.045), (0.0,  0.10, 1.050), (0.06,  0.10, 1.045), (0.10,  0.10, 1.01)],
    [(-0.06,  0.42, 0.92), (-0.04,  0.42, 0.945), (0.0,  0.42, 0.950), (0.04,  0.42, 0.945), (0.06,  0.42, 0.92)],
]
sc_verts = [Vector(p) for row in scoop_rows for p in row]
sc_faces = []
for r in range(len(scoop_rows) - 1):
    for c in range(4):
        a = r * 5 + c
        sc_faces.append((a, a + 5, a + 6, a + 1))
m_sc = bpy.data.meshes.new("Roof_Scoop_Mesh")
m_sc.from_pydata(sc_verts, [], sc_faces)
m_sc.validate()
m_sc.update()
for p in m_sc.polygons:
    p.use_smooth = True
sc_obj = bpy.data.objects.new("Roof_Scoop", m_sc)
link(sc_obj)
sc_obj.data.materials.append(MAT_RED)
mod_sc_solid = sc_obj.modifiers.new("Solidify", 'SOLIDIFY')
mod_sc_solid.thickness = 0.008

# Dark scoop intake throat
th_bm = bmesh.new()
bmesh.ops.create_cube(th_bm, size=1.0)
bmesh.ops.scale(th_bm, vec=(0.24, 0.03, 0.055), verts=th_bm.verts)
bmesh.ops.translate(th_bm, vec=(0.0, -0.485, 1.072), verts=th_bm.verts)
m_th = bpy.data.meshes.new("Roof_Throat_Mesh")
th_bm.to_mesh(m_th)
th_bm.free()
o_th = bpy.data.objects.new("Roof_Throat", m_th)
link(o_th)
o_th.data.materials.append(MAT_DARK)

# Center Windshield Wiper (matching reference photo)
bm_wip = bmesh.new()
bmesh.ops.create_cube(bm_wip, size=1.0)
bmesh.ops.scale(bm_wip, vec=(0.008, 0.44, 0.008), verts=bm_wip.verts)
bmesh.ops.rotate(bm_wip, cent=(0, 0, 0), matrix=Euler((0.68, 0.12, -0.28), 'XYZ').to_matrix(), verts=bm_wip.verts)
bmesh.ops.translate(bm_wip, vec=(0.05, -0.85, 0.88), verts=bm_wip.verts)
m_wip = bpy.data.meshes.new("Wiper_Mesh")
bm_wip.to_mesh(m_wip)
bm_wip.free()
o_wip = bpy.data.objects.new("Cockpit_Wiper", m_wip)
link(o_wip)
o_wip.data.materials.append(MAT_DARK)

# ==============================================================================
# 5. FENDER-MOUNTED ORGANIC SIDE MIRRORS (EXACTLY AS IN PHOTO)
# ==============================================================================
for sign in (-1, 1):
    m_base = (sign * 0.85, -1.22, 0.74)
    m_head = (sign * 0.94, -1.16, 0.82)
    
    # Curved aerodynamic stalk
    bm_stk = bmesh.new()
    bmesh.ops.create_cone(bm_stk, cap_ends=True, segments=12, radius1=0.012, radius2=0.008, depth=0.15)
    bmesh.ops.rotate(bm_stk, cent=(0, 0, 0), matrix=Euler((0.18, sign * 0.62, 0), 'XYZ').to_matrix(), verts=bm_stk.verts)
    bmesh.ops.translate(bm_stk, vec=((m_base[0] + m_head[0]) * 0.5, (m_base[1] + m_head[1]) * 0.5, (m_base[2] + m_head[2]) * 0.5), verts=bm_stk.verts)
    m_stk = bpy.data.meshes.new(f"Mirror_Stalk_{sign}")
    bm_stk.to_mesh(m_stk)
    bm_stk.free()
    o_stk = bpy.data.objects.new(f"Mirror_Stalk_{sign}", m_stk)
    link(o_stk, parent=body_obj)
    o_stk.data.materials.append(MAT_RED)

    # Sculpted teardrop aerodynamic housing
    bm_mh = bmesh.new()
    bmesh.ops.create_uvsphere(bm_mh, u_segments=16, v_segments=12, radius=0.038)
    bmesh.ops.scale(bm_mh, vec=(0.85, 1.85, 0.90), verts=bm_mh.verts)
    bmesh.ops.rotate(bm_mh, cent=(0, 0, 0), matrix=Euler((0.14, sign * 0.08, sign * 0.18), 'XYZ').to_matrix(), verts=bm_mh.verts)
    bmesh.ops.translate(bm_mh, vec=m_head, verts=bm_mh.verts)
    m_mh = bpy.data.meshes.new(f"Mirror_Housing_{sign}")
    bm_mh.to_mesh(m_mh)
    bm_mh.free()
    for p in m_mh.polygons:
        p.use_smooth = True
    o_mh = bpy.data.objects.new(f"Mirror_Housing_{sign}", m_mh)
    link(o_mh, parent=body_obj)
    o_mh.data.materials.append(MAT_RED)

    # Reflective Chrome Mirror Glass
    bm_mg = bmesh.new()
    bmesh.ops.create_circle(bm_mg, cap_ends=True, radius=0.032, segments=16)
    bmesh.ops.scale(bm_mg, vec=(1.0, 0.75, 1.0), verts=bm_mg.verts)
    bmesh.ops.rotate(bm_mg, cent=(0, 0, 0), matrix=Euler((math.pi * 0.5 + 0.14, 0, sign * 0.18), 'XYZ').to_matrix(), verts=bm_mg.verts)
    bmesh.ops.translate(bm_mg, vec=(m_head[0] - sign * 0.015, m_head[1] + 0.065, m_head[2]), verts=bm_mg.verts)
    m_mg = bpy.data.meshes.new(f"Mirror_Glass_{sign}")
    bm_mg.to_mesh(m_mg)
    bm_mg.free()
    o_mg = bpy.data.objects.new(f"Mirror_Glass_{sign}", m_mg)
    link(o_mg, parent=body_obj)
    o_mg.data.materials.append(MAT_CHROME)

# ==============================================================================
# 6. FLUSH PROJECTOR HEADLIGHTS & LOWER BRAKE DUCTS (REFERENCE ACCURACY)
# ==============================================================================
for sign in (-1, 1):
    bx = sign * 0.86
    by = -1.95
    bz = 0.54

    # 3 Stacked Chrome Projector Lamps inside fender pontoon
    for j, (dy, dz, sz) in enumerate([(-0.12, -0.09, 0.032), (0.00, 0.00, 0.032), (0.12, 0.08, 0.028)]):
        lamp_pos = (bx, by + dy, bz + dz)
        
        # Chrome bezel ring
        bm_l = bmesh.new()
        bmesh.ops.create_circle(bm_l, cap_ends=True, radius=sz, segments=16)
        m_l = bpy.data.meshes.new(f"Headlight_Bezel_{sign}_{j}")
        bm_l.to_mesh(m_l)
        bm_l.free()
        o_l = bpy.data.objects.new(f"Headlight_Bezel_{sign}_{j}", m_l)
        link(o_l, parent=body_obj)
        o_l.location = (lamp_pos[0], lamp_pos[1] - 0.012, lamp_pos[2])
        o_l.rotation_euler = (0.52, 0, sign * 0.06)
        o_l.data.materials.append(MAT_CHROME)

        # High-intensity Xenon LED bulb
        bm_b = bmesh.new()
        bmesh.ops.create_circle(bm_b, cap_ends=True, radius=sz * 0.70, segments=12)
        m_b = bpy.data.meshes.new(f"Headlight_Bulb_{sign}_{j}")
        bm_b.to_mesh(m_b)
        bm_b.free()
        o_b = bpy.data.objects.new(f"Headlight_Bulb_{sign}_{j}", m_b)
        link(o_b, parent=body_obj)
        o_b.location = (lamp_pos[0], lamp_pos[1] - 0.015, lamp_pos[2])
        o_b.rotation_euler = (0.52, 0, sign * 0.06)
        o_b.data.materials.append(MAT_HEADLIGHT_LED)

    # Amber Turn Signal at top corner
    bm_amb = bmesh.new()
    bmesh.ops.create_circle(bm_amb, cap_ends=True, radius=0.018, segments=12)
    m_amb = bpy.data.meshes.new(f"Headlight_Amber_{sign}")
    bm_amb.to_mesh(m_amb)
    bm_amb.free()
    o_amb = bpy.data.objects.new(f"Headlight_Amber_{sign}", m_amb)
    link(o_amb, parent=body_obj)
    o_amb.location = (sign * 0.90, -1.82, 0.65)
    o_amb.rotation_euler = (0.52, 0, sign * 0.06)
    o_amb.data.materials.append(MAT_AMBER)

    # Flush Curved Polycarbonate Fairing
    c_rows = []
    for ly in (-2.14, -2.00, -1.86, -1.74):
        t = (-ly - 1.74) / 0.40
        lz = 0.42 + t * 0.32
        lx = sign * (0.84 + t * 0.03)
        c_rows.append([
            (lx - sign * 0.055, ly, lz),
            (lx, ly, lz + 0.012),
            (lx + sign * 0.055, ly, lz * 0.98),
        ])
    m_cov = bpy.data.meshes.new(f"Headlight_Cover_{sign}")
    cov_v = [Vector(p) for row in c_rows for p in row]
    cov_f = []
    for r in range(len(c_rows) - 1):
        for c in range(2):
            a = r * 3 + c
            cov_f.append((a, a + 3, a + 4, a + 1))
    m_cov.from_pydata(cov_v, [], cov_f)
    m_cov.validate()
    m_cov.update()
    for p in m_cov.polygons:
        p.use_smooth = True
    o_cov = bpy.data.objects.new(f"Headlight_Cover_{sign}", m_cov)
    link(o_cov, parent=body_obj)
    o_cov.data.materials.append(MAT_HEADLIGHT_LENS)

    # Vertical Rectangular Brake Cooling Duct directly below headlight
    bm_bd = bmesh.new()
    bmesh.ops.create_cube(bm_bd, size=1.0)
    bmesh.ops.scale(bm_bd, vec=(0.045, 0.030, 0.085), verts=bm_bd.verts)
    bmesh.ops.translate(bm_bd, vec=(sign * 0.86, -2.25, 0.16), verts=bm_bd.verts)
    m_bd = bpy.data.meshes.new(f"Brake_Duct_{sign}")
    bm_bd.to_mesh(m_bd)
    bm_bd.free()
    o_bd = bpy.data.objects.new(f"Brake_Duct_{sign}", m_bd)
    link(o_bd, parent=body_obj)
    o_bd.data.materials.append(MAT_DARK)

    # 4 Fender Cooling Louvers on crest
    for i in range(4):
        ly = -1.55 + i * 0.075
        bm_lv = bmesh.new()
        bmesh.ops.create_cube(bm_lv, size=1.0)
        bmesh.ops.scale(bm_lv, vec=(0.09, 0.035, 0.006), verts=bm_lv.verts)
        bmesh.ops.rotate(bm_lv, cent=(0, 0, 0), matrix=Euler((0.18, 0, 0), 'XYZ').to_matrix(), verts=bm_lv.verts)
        bmesh.ops.translate(bm_lv, vec=(sign * 0.86, ly, 0.772), verts=bm_lv.verts)
        m_lv = bpy.data.meshes.new(f"Louver_{sign}_{i}")
        bm_lv.to_mesh(m_lv)
        bm_lv.free()
        o_lv = bpy.data.objects.new(f"Louver_{sign}_{i}", m_lv)
        link(o_lv, parent=body_obj)
        o_lv.data.materials.append(MAT_DARK)

# Side Radiator Pod Intake Mouth (at Y = +0.15)
for sign in (-1, 1):
    bm_rad = bmesh.new()
    bmesh.ops.create_cube(bm_rad, size=1.0)
    bmesh.ops.scale(bm_rad, vec=(0.14, 0.03, 0.22), verts=bm_rad.verts)
    bmesh.ops.translate(bm_rad, vec=(sign * 0.82, 0.14, 0.35), verts=bm_rad.verts)
    m_rad = bpy.data.meshes.new(f"Radiator_Mouth_{sign}")
    bm_rad.to_mesh(m_rad)
    bm_rad.free()
    o_rad = bpy.data.objects.new(f"Radiator_Mouth_{sign}", m_rad)
    link(o_rad, parent=body_obj)
    o_rad.data.materials.append(MAT_DARK)

# ==============================================================================
# 7. REAR WING, VERTICAL ENDPLATES, REAR FASCIA & EXHAUST
# ==============================================================================
rw_verts = [
    (-0.96, 2.02, 1.050), (0.96, 2.02, 1.050), (0.96, 2.38, 1.085), (-0.96, 2.38, 1.085),
    (-0.96, 2.02, 1.085), (0.96, 2.02, 1.085), (0.96, 2.38, 1.115), (-0.96, 2.38, 1.115),
]
rw_faces = [(0, 1, 2, 3), (7, 6, 5, 4), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)]
m_rw = bpy.data.meshes.new("Rear_Wing_Airfoil_Mesh")
m_rw.from_pydata(rw_verts, [], rw_faces)
m_rw.validate()
m_rw.update()
o_rw = bpy.data.objects.new("Rear_Wing_Airfoil", m_rw)
link(o_rw)
o_rw.data.materials.append(MAT_CARBON)

# Vertical Endplates (pure Super Red as in reference photo)
ep_pts = [
    (0.98, 1.72, 0.44), (0.98, 1.76, 0.72), (0.98, 1.94, 1.12),
    (0.98, 2.42, 1.12), (0.98, 2.44, 0.32), (0.98, 2.10, 0.32),
]
ep_verts = [Vector((p[0], p[1], p[2])) for p in ep_pts] + [Vector((p[0] + 0.016, p[1], p[2])) for p in ep_pts]
n_ep = len(ep_pts)
ep_faces = [tuple(reversed(range(n_ep))), tuple(range(n_ep, 2 * n_ep))]
for i in range(n_ep):
    j = (i + 1) % n_ep
    ep_faces.append((i, j, n_ep + j, n_ep + i))
m_ep = bpy.data.meshes.new("Rear_Wing_Endplate_Mesh")
m_ep.from_pydata(ep_verts, [], ep_faces)
m_ep.validate()
m_ep.update()
o_ep = bpy.data.objects.new("Rear_Wing_Endplate", m_ep)
link(o_ep)
o_ep.data.materials.append(MAT_RED)
mod_ep_m = o_ep.modifiers.new("Mirror", 'MIRROR')
mod_ep_m.use_axis[0] = True

# Wing Pylons
py_verts = [
    (0.32, 2.08, 0.62), (0.32, 2.18, 1.05), (0.32, 2.26, 1.05), (0.32, 2.20, 0.58),
    (0.335, 2.08, 0.62), (0.335, 2.18, 1.05), (0.335, 2.26, 1.05), (0.335, 2.20, 0.58),
]
py_faces = [(0, 1, 2, 3), (7, 6, 5, 4), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)]
m_py = bpy.data.meshes.new("Wing_Pylon_Mesh")
m_py.from_pydata(py_verts, [], py_faces)
m_py.validate()
m_py.update()
o_py = bpy.data.objects.new("Wing_Pylon", m_py)
link(o_py)
o_py.data.materials.append(MAT_CARBON)
mod_py_m = o_py.modifiers.new("Mirror", 'MIRROR')
mod_py_m.use_axis[0] = True

# Rear Bulkhead Quad Taillights
for sign in (-1, 1):
    for lx in (0.62, 0.76):
        x = sign * lx
        bm_t = bmesh.new()
        bmesh.ops.create_circle(bm_t, cap_ends=True, radius=0.036, segments=16)
        m_t = bpy.data.meshes.new(f"Taillight_{x:.2f}")
        bm_t.to_mesh(m_t)
        bm_t.free()
        o_t = bpy.data.objects.new(f"Taillight_{x:.2f}", m_t)
        link(o_t)
        o_t.location = (x, 2.395, 0.46)
        o_t.rotation_euler = (math.pi * 0.5, 0, 0)
        o_t.data.materials.append(MAT_TAIL)

    # Dual Titanium Exhausts
    bm_e = bmesh.new()
    bmesh.ops.create_cone(bm_e, cap_ends=False, cap_tris=False, segments=16, radius1=0.042, radius2=0.042, depth=0.10)
    m_e = bpy.data.meshes.new(f"Exhaust_{sign}")
    bm_e.to_mesh(m_e)
    bm_e.free()
    o_e = bpy.data.objects.new(f"Exhaust_{sign}", m_e)
    link(o_e)
    o_e.location = (sign * 0.22, 2.39, 0.33)
    o_e.rotation_euler = (math.pi * 0.5, 0, 0)
    o_e.data.materials.append(MAT_CHROME)

# Central Red Rain Light
bm_rl = bmesh.new()
bmesh.ops.create_cube(bm_rl, size=1.0)
bmesh.ops.scale(bm_rl, vec=(0.10, 0.015, 0.05), verts=bm_rl.verts)
bmesh.ops.translate(bm_rl, vec=(0.0, 2.405, 0.35), verts=bm_rl.verts)
m_rl = bpy.data.meshes.new("Rain_Light_Mesh")
bm_rl.to_mesh(m_rl)
bm_rl.free()
o_rl = bpy.data.objects.new("Rain_Light", m_rl)
link(o_rl)
o_rl.data.materials.append(MAT_BRAKE)

# ==============================================================================
# 8. BBS LE MANS WHEELS & BREMBO CALIPERS (BLENDER_NOTE.md)
# ==============================================================================
WHEEL_RADIUS = 0.335
FRONT_TRACK = 1.690
REAR_TRACK = 1.610
FRONT_AXLE_Y = -1.400
REAR_AXLE_Y = 1.400

def create_wheel(parent_name, corner, center_x, center_y, outboard_sign, is_rear):
    parent = bpy.data.objects.new(parent_name, None)
    link(parent)
    parent.location = (center_x, center_y, WHEEL_RADIUS)
    parent.empty_display_type = 'CIRCLE'
    parent.empty_display_size = WHEEL_RADIUS
    parent['spin_axis'] = 'local_X'
    parent['origin_is_hub_center'] = True
    parent['wheel_radius_m'] = WHEEL_RADIUS

    tire_w = 0.340 if is_rear else 0.310
    rim_w = tire_w * 0.88
    rim_r = 0.232

    # Racing Slick Tire
    bm_t = bmesh.new()
    segments = 32
    r_outer = WHEEL_RADIUS
    r_shoulder = WHEEL_RADIUS - 0.016
    half_tw = tire_w * 0.5
    half_sw = half_tw - 0.022
    profile = [
        (-half_tw, rim_r), (-half_tw, r_shoulder), (-half_sw, r_outer),
        ( half_sw, r_outer), ( half_tw, r_shoulder), ( half_tw, rim_r),
    ]
    rings = []
    for px, pr in profile:
        ring = []
        for i in range(segments):
            theta = math.tau * i / segments
            ring.append(bm_t.verts.new((px, pr * math.cos(theta), pr * math.sin(theta))))
        rings.append(ring)
    bm_t.verts.ensure_lookup_table()
    for r in range(len(rings) - 1):
        for i in range(segments):
            j = (i + 1) % segments
            bm_t.faces.new((rings[r][i], rings[r+1][i], rings[r+1][j], rings[r][j]))
    bmesh.ops.recalc_face_normals(bm_t, faces=bm_t.faces)
    mesh_t = bpy.data.meshes.new(f"{parent_name}_tire_Mesh")
    bm_t.to_mesh(mesh_t)
    bm_t.free()
    for p in mesh_t.polygons:
        p.use_smooth = True
    tire_obj = bpy.data.objects.new(f"{parent_name}_tire", mesh_t)
    link(tire_obj, parent=parent)
    tire_obj.data.materials.append(MAT_TIRE)

    # BBS Rim Barrel
    face_x = outboard_sign * (tire_w * 0.40)
    bm_rb = bmesh.new()
    bmesh.ops.create_cone(bm_rb, cap_ends=False, cap_tris=False, segments=32, radius1=rim_r, radius2=rim_r, depth=rim_w)
    m_rb = bpy.data.meshes.new(f"{parent_name}_barrel_Mesh")
    bm_rb.to_mesh(m_rb)
    bm_rb.free()
    for p in m_rb.polygons:
        p.use_smooth = True
    barrel_obj = bpy.data.objects.new(f"{parent_name}_barrel", m_rb)
    link(barrel_obj, parent=parent)
    barrel_obj.rotation_euler = (0, math.pi * 0.5, 0)
    barrel_obj.data.materials.append(MAT_GOLD)

    # Open BBS Rim Lip (NO solid cap)
    bm_lip = bmesh.new()
    lip_r_outer = rim_r * 0.98
    lip_r_inner = rim_r * 0.88
    lip_v_in = []
    lip_v_out = []
    for i in range(segments):
        theta = math.tau * i / segments
        cy = math.cos(theta)
        sz = math.sin(theta)
        lip_v_in.append(bm_lip.verts.new((face_x, lip_r_inner * cy, lip_r_inner * sz)))
        lip_v_out.append(bm_lip.verts.new((face_x, lip_r_outer * cy, lip_r_outer * sz)))
    bm_lip.verts.ensure_lookup_table()
    for i in range(segments):
        j = (i + 1) % segments
        bm_lip.faces.new((lip_v_in[i], lip_v_in[j], lip_v_out[j], lip_v_out[i]))
    bmesh.ops.recalc_face_normals(bm_lip, faces=bm_lip.faces)
    m_lip = bpy.data.meshes.new(f"{parent_name}_lip_Mesh")
    bm_lip.to_mesh(m_lip)
    bm_lip.free()
    for p in m_lip.polygons:
        p.use_smooth = True
    lip_obj = bpy.data.objects.new(f"{parent_name}_lip", m_lip)
    link(lip_obj, parent=parent)
    lip_obj.data.materials.append(MAT_GOLD)

    # BBS 16-Spoke Mesh (8 paired Y-spokes)
    hub_r = 0.058
    spoke_outer_r = lip_r_inner * 0.98
    spoke_len = spoke_outer_r - hub_r
    spoke_mid_r = (hub_r + spoke_outer_r) * 0.5
    spoke_x = face_x - outboard_sign * 0.008

    for i in range(8):
        base_angle = math.tau * i / 8.0
        for split, offset in enumerate((-0.075, 0.075)):
            angle = base_angle + offset
            c = math.cos(angle)
            s = math.sin(angle)
            sp_center = (spoke_x, spoke_mid_r * c, spoke_mid_r * s)
            bm_sp = bmesh.new()
            bmesh.ops.create_cube(bm_sp, size=1.0)
            bmesh.ops.scale(bm_sp, vec=(0.014, 0.016, spoke_len), verts=bm_sp.verts)
            bmesh.ops.rotate(bm_sp, cent=(0, 0, 0), matrix=Euler((angle - math.pi * 0.5, 0, 0), 'XYZ').to_matrix(), verts=bm_sp.verts)
            bmesh.ops.translate(bm_sp, vec=sp_center, verts=bm_sp.verts)
            m_sp = bpy.data.meshes.new(f"{parent_name}_spoke_{i}_{split}")
            bm_sp.to_mesh(m_sp)
            bm_sp.free()
            o_sp = bpy.data.objects.new(f"{parent_name}_spoke_{i}_{split}", m_sp)
            link(o_sp, parent=parent)
            o_sp.data.materials.append(MAT_GOLD)

    # Center Hub & Nut
    bm_hub = bmesh.new()
    bmesh.ops.create_cone(bm_hub, cap_ends=True, segments=24, radius1=hub_r, radius2=hub_r, depth=0.035)
    m_hub = bpy.data.meshes.new(f"{parent_name}_hub_Mesh")
    bm_hub.to_mesh(m_hub)
    bm_hub.free()
    o_hub = bpy.data.objects.new(f"{parent_name}_hub", m_hub)
    link(o_hub, parent=parent)
    o_hub.location = (face_x - outboard_sign * 0.005, 0, 0)
    o_hub.rotation_euler = (0, math.pi * 0.5, 0)
    o_hub.data.materials.append(MAT_GOLD)

    nut_mat = MAT_BRAKE if outboard_sign < 0 else MAT_GLASS
    bm_nut = bmesh.new()
    bmesh.ops.create_cone(bm_nut, cap_ends=True, segments=12, radius1=0.032, radius2=0.032, depth=0.030)
    m_nut = bpy.data.meshes.new(f"{parent_name}_nut_Mesh")
    bm_nut.to_mesh(m_nut)
    bm_nut.free()
    o_nut = bpy.data.objects.new(f"{parent_name}_nut", m_nut)
    link(o_nut, parent=parent)
    o_nut.location = (face_x + outboard_sign * 0.012, 0, 0)
    o_nut.rotation_euler = (0, math.pi * 0.5, 0)
    o_nut.data.materials.append(nut_mat)

    # Brake Rotor (child of wheel)
    bm_rot = bmesh.new()
    bmesh.ops.create_cone(bm_rot, cap_ends=True, segments=24, radius1=0.185, radius2=0.185, depth=0.022)
    m_rot = bpy.data.meshes.new(f"{parent_name}_rotor_Mesh")
    bm_rot.to_mesh(m_rot)
    bm_rot.free()
    o_rot = bpy.data.objects.new(f"{parent_name}_rotor", m_rot)
    link(o_rot, parent=parent)
    o_rot.location = (-outboard_sign * 0.020, 0, 0)
    o_rot.rotation_euler = (0, math.pi * 0.5, 0)
    o_rot.data.materials.append(MAT_ROTOR)

    # Brembo Caliper (child of ROOT, NOT wheel)
    cal_x = center_x - outboard_sign * (tire_w * 0.22)
    cal_y = center_y + (0.130 if is_rear else -0.130)
    bm_cal = bmesh.new()
    bmesh.ops.create_cube(bm_cal, size=1.0)
    bmesh.ops.scale(bm_cal, vec=(0.065, 0.095, 0.165), verts=bm_cal.verts)
    m_cal = bpy.data.meshes.new(f"caliper_{corner}_Mesh")
    bm_cal.to_mesh(m_cal)
    bm_cal.free()
    o_cal = bpy.data.objects.new(f"caliper_{corner}", m_cal)
    link(o_cal, parent=ROOT)
    o_cal.location = (cal_x, cal_y, WHEEL_RADIUS + 0.040)
    o_cal.data.materials.append(MAT_CALIPER)
    o_cal['corner'] = corner
    o_cal['steers'] = corner.startswith('front')
    o_cal['spins'] = False

specs = [
    ('wheel_front_left', 'front_left', -FRONT_TRACK * 0.5, FRONT_AXLE_Y, -1.0, False),
    ('wheel_front_right', 'front_right', FRONT_TRACK * 0.5, FRONT_AXLE_Y, 1.0, False),
    ('wheel_rear_left', 'rear_left', -REAR_TRACK * 0.5, REAR_AXLE_Y, -1.0, True),
    ('wheel_rear_right', 'rear_right', REAR_TRACK * 0.5, REAR_AXLE_Y, 1.0, True),
]
for name, corner, x, y, sign, is_rear in specs:
    create_wheel(name, corner, x, y, sign, is_rear)

# Metadata
metadata = {
    'asset_id': 'toyota_gt_one_1998_ts020',
    'manufacturer': 'Toyota', 'model': 'GT-One (TS020)', 'model_year': 1998,
    'length_m': 4.840, 'width_m': 2.000, 'height_m': 1.125,
    'wheelbase_m': 2.800, 'front_track_m': FRONT_TRACK, 'rear_track_m': REAR_TRACK,
    'wheel_radius_m': WHEEL_RADIUS, 'curb_mass_kg': 900.0,
    'weight_distribution_front': 0.44, 'weight_distribution_rear': 0.56,
    'engine_layout': 'mid', 'drive_type': 'RWD',
    'powertrain': '3.6L Twin-Turbo V8 (Toyota R36V)', 'power_hp': 600, 'torque_nm': 650,
    'authoring_axes': '+X right, +Z up, -Y front', 'gltf_game_axes': '+X right, +Y up, +Z front',
    'wheel_spin_axis': 'local X',
}
for k, v in metadata.items():
    ROOT[k] = v

# ==============================================================================
# STUDIO CAMERAS & MULTI-ANGLE RENDERS
# ==============================================================================
cam_data = bpy.data.cameras.new("Cam_Data")
cam_data.lens = 54
cam_obj = bpy.data.objects.new("Camera", cam_data)
STUDIO_COLLECTION.objects.link(cam_obj)
SCENE.camera = cam_obj

def point_camera(obj, loc, target=(0, 0, 0.55)):
    obj.location = loc
    direction = Vector(target) - obj.location
    obj.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()

def add_area_light(name, location, energy, color, size, target=(0, 0, 0.55)):
    data = bpy.data.lights.new(name + " Data", type='AREA')
    data.energy = energy
    data.color = color
    data.shape = 'DISK'
    data.size = size
    obj = bpy.data.objects.new(name, data)
    STUDIO_COLLECTION.objects.link(obj)
    obj.location = location
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat('-Z', 'Y').to_euler()

add_area_light("Key_Light_FrontRight", (4.8, -4.5, 4.2), 1400, (1.0, 0.95, 0.90), 3.5)
add_area_light("Fill_Light_FrontLeft", (-4.8, -3.2, 3.2), 900, (0.85, 0.92, 1.0), 3.0)
add_area_light("Rim_Light_RearTop", (0.0, 4.8, 4.5), 1200, (0.90, 0.95, 1.0), 3.0)

world = bpy.data.worlds.new("Studio_World")
SCENE.world = world
world.use_nodes = True
world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.015, 0.018, 0.024, 1.0)
world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.35

# Render 1: Front 3/4 Dynamic (matching reference photo angle)
point_camera(cam_obj, (4.2, -5.8, 2.4), target=(0, -0.6, 0.45))
bpy.context.view_layer.update()
SCENE.render.filepath = os.path.join(ROOT_DIR, "toyota_gt_one_diagnostic_front_34.png")
bpy.ops.render.render(write_still=True)

# Render 2: Side Profile (Eye-level, wheel hub height Z=0.45)
point_camera(cam_obj, (6.8, 0.0, 0.45), target=(0, 0.0, 0.45))
bpy.context.view_layer.update()
SCENE.render.filepath = os.path.join(ROOT_DIR, "toyota_gt_one_diagnostic_side.png")
bpy.ops.render.render(write_still=True)

# Render 3: Rear 3/4 Dynamic
point_camera(cam_obj, (4.6, 5.8, 2.4), target=(0, 0.8, 0.50))
bpy.context.view_layer.update()
SCENE.render.filepath = os.path.join(ROOT_DIR, "toyota_gt_one_diagnostic_rear_34.png")
bpy.ops.render.render(write_still=True)

# Save .blend
bpy.ops.wm.save_as_mainfile(filepath=BLEND_PATH)

# Export Game GLB
bpy.ops.object.select_all(action='DESELECT')
for obj in ASSET_COLLECTION.all_objects:
    obj.select_set(True)
ROOT.select_set(True)
bpy.context.view_layer.objects.active = ROOT

os.makedirs(os.path.dirname(GLB_PATH), exist_ok=True)
bpy.ops.export_scene.gltf(
    filepath=GLB_PATH,
    export_format='GLB',
    use_selection=True,
    export_yup=True,
    export_materials='EXPORT',
    export_cameras=False,
    export_lights=False,
    export_apply=True,
)

print(">> SUCCESS: Authentic Toyota GT-One Masterpiece exported to GLB and rendered!")
