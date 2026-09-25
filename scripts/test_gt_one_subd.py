import bpy
import bmesh
import math
import os
from mathutils import Vector, Matrix, Euler

# Clear scene
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
for col in list(bpy.data.collections):
    bpy.data.collections.remove(col)
for block_group in (bpy.data.meshes, bpy.data.curves, bpy.data.materials, bpy.data.cameras, bpy.data.lights):
    for block in list(block_group):
        block_group.remove(block)

SCENE = bpy.context.scene
ROOT_DIR = r"D:\RacingGameDemo"
SCENE.unit_settings.system = 'METRIC'
SCENE.render.engine = 'BLENDER_EEVEE'
SCENE.render.resolution_x = 1280
SCENE.render.resolution_y = 720
SCENE.view_settings.look = 'AgX - Medium High Contrast'

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

MAT_RED = make_material('paint_red', 0xDC0512, metallic=0.45, roughness=0.15, coat=1.0)
MAT_WHITE = make_material('paint_white', 0xF6F8FA, metallic=0.08, roughness=0.18, coat=1.0)
MAT_GLASS = make_material('glass', 0x08121A, metallic=0.08, roughness=0.04, alpha=0.92, transmission=0.18, coat=1.0)
MAT_CARBON = make_material('carbon', 0x101214, metallic=0.35, roughness=0.38, coat=0.35)
MAT_DARK = make_material('dark', 0x0A0C0E, metallic=0.65, roughness=0.24)
MAT_GOLD = make_material('gold', 0xD8A826, metallic=0.95, roughness=0.18, coat=0.55)
MAT_TIRE = make_material('tire', 0x0A0B0D, roughness=0.72)
MAT_CHROME = make_material('chrome', 0xE2E8EE, metallic=1.0, roughness=0.08, coat=0.50)
MAT_HEADLIGHT_LED = make_material('headlight_led', 0xFFFFFF, emission=0xFFFFFF, emission_strength=12.0)
MAT_HEADLIGHT_LENS = make_material('headlight_lens', 0xD8EEFF, alpha=0.42, transmission=0.78, coat=1.0)
MAT_TAIL = make_material('taillight', 0x880004, emission=0x880004, emission_strength=2.0)
MAT_BRAKE = make_material('brake', 0xFF0008, emission=0xFF0008, emission_strength=5.0)

# ==============================================================================
# UNIFIED SUBD BODY SHELL (RIGHT HALF + MIRROR MODIFIER)
# ==============================================================================
# 16 longitudinal stations from front nose lip to rear diffuser lip.
# At each station, 6 transverse vertices from Centerline (X=0) to Outermost Skirt (X=hw):
# Col 0: Centerline (X = 0)
# Col 1: Center Hood / Roof / Dorsal Spine (X ~ 0.18 - 0.35)
# Col 2: Aero Valley / Windshield Edge / Rear Trough (X ~ 0.35 - 0.55)
# Col 3: Fender Crest / Shoulder (X ~ 0.65 - 0.88)
# Col 4: Fender Upper Arch Lip / Flank Ridge (X ~ 0.85 - 1.00)
# Col 5: Rocker Panel / Skirt / Arch Cutout Lip (X ~ 0.60 - 0.98)

# Wheel coordinates:
# Front Wheel: Center Y = -1.40, Radius = 0.335 (Arch cut between Y = -1.75 and Y = -1.05)
# Rear Wheel: Center Y = +1.40, Radius = 0.335 (Arch cut between Y = +1.05 and Y = +1.75)

# (y, [(x0,z0), (x1,z1), (x2,z2), (x3,z3), (x4,z4), (x5,z5)])
STATIONS = [
    # Station 0: Front Nose Lip & Splitter Leading Edge (Y = -2.44)
    (-2.44, [
        (0.00, 0.165), (0.18, 0.165), (0.42, 0.160), (0.72, 0.145), (0.92, 0.120), (0.99, 0.045)
    ]),
    # Station 1: Nose Cone Rise / Forward Radiator Mouth (Y = -2.25)
    (-2.25, [
        (0.00, 0.280), (0.24, 0.280), (0.50, 0.320), (0.78, 0.380), (0.94, 0.280), (0.99, 0.048)
    ]),
    # Station 2: Headlight Slope / Forward Fender Pontoon (Y = -1.98)
    (-1.98, [
        (0.00, 0.440), (0.30, 0.440), (0.56, 0.470), (0.84, 0.580), (0.97, 0.480), (1.00, 0.050)
    ]),
    # Station 3: Front Arch Front Lip (Y = -1.74)
    (-1.74, [
        (0.00, 0.535), (0.35, 0.535), (0.60, 0.570), (0.87, 0.705), (0.98, 0.580), (1.00, 0.480) # arch front cutout
    ]),
    # Station 4: Front Wheel Apex (Y = -1.40) - Maximum front arch crest
    (-1.40, [
        (0.00, 0.630), (0.38, 0.630), (0.62, 0.620), (0.88, 0.745), (0.99, 0.720), (0.99, 0.720) # arch top cutout
    ]),
    # Station 5: Front Arch Rear Lip (Y = -1.06)
    (-1.06, [
        (0.00, 0.705), (0.38, 0.705), (0.60, 0.640), (0.85, 0.680), (0.96, 0.560), (0.98, 0.480) # arch rear cutout
    ]),
    # Station 6: Windshield Cowl / Front Door Waist Pinch (Y = -0.75)
    (-0.75, [
        (0.00, 0.940), (0.32, 0.920), (0.42, 0.840), (0.68, 0.540), (0.80, 0.380), (0.76, 0.050) # waist starts
    ]),
    # Station 7: Cockpit Roof Apex / Wasp Waist Narrowest (Y = -0.30)
    (-0.30, [
        (0.00, 1.050), (0.28, 1.045), (0.38, 0.880), (0.60, 0.500), (0.74, 0.320), (0.70, 0.050) # deepest undercut
    ]),
    # Station 8: Roof Trailing / Radiator Side Pod Flare (Y = +0.15)
    ( 0.15, [
        (0.00, 1.010), (0.26, 0.990), (0.36, 0.860), (0.64, 0.580), (0.92, 0.460), (0.96, 0.050) # pod flares out
    ]),
    # Station 9: Rear Glass Junction / Radiator Shoulder (Y = +0.55)
    ( 0.55, [
        (0.00, 0.880), (0.22, 0.860), (0.34, 0.760), (0.68, 0.660), (0.95, 0.560), (0.98, 0.050)
    ]),
    # Station 10: Engine Dorsal Spine / Twin Aero Gully (Y = +0.90)
    ( 0.90, [
        (0.00, 0.780), (0.16, 0.760), (0.36, 0.680), (0.74, 0.720), (0.96, 0.620), (0.99, 0.050)
    ]),
    # Station 11: Rear Arch Front Lip (Y = +1.08)
    ( 1.08, [
        (0.00, 0.745), (0.14, 0.730), (0.38, 0.650), (0.78, 0.750), (0.97, 0.640), (0.99, 0.480) # rear arch front cut
    ]),
    # Station 12: Rear Wheel Apex (Y = +1.40) - Maximum rear arch crest
    ( 1.40, [
        (0.00, 0.710), (0.12, 0.700), (0.40, 0.620), (0.82, 0.770), (0.99, 0.725), (0.99, 0.725) # rear arch apex cut
    ]),
    # Station 13: Rear Arch Rear Lip (Y = +1.72)
    ( 1.72, [
        (0.00, 0.670), (0.12, 0.660), (0.42, 0.580), (0.80, 0.730), (0.96, 0.620), (0.98, 0.480) # rear arch rear cut
    ]),
    # Station 14: Rear Deck Slope / Diffuser Upsweep (Y = +2.05)
    ( 2.05, [
        (0.00, 0.625), (0.10, 0.620), (0.44, 0.540), (0.76, 0.650), (0.92, 0.520), (0.94, 0.160)
    ]),
    # Station 15: Rear Bulkhead / Diffuser Trailing Edge (Y = +2.38)
    ( 2.38, [
        (0.00, 0.570), (0.10, 0.565), (0.46, 0.490), (0.72, 0.580), (0.88, 0.450), (0.92, 0.260)
    ]),
]

bm = bmesh.new()
grid_verts = []
for station_idx, (y, points) in enumerate(STATIONS):
    row = []
    for pt_idx, (x, z) in enumerate(points):
        v = bm.verts.new((x, y, z))
        row.append(v)
    grid_verts.append(row)

bm.verts.ensure_lookup_table()

# Create Quad Faces between adjacent stations
# Material assignment:
# Col 0-1 from Y=-2.44 to -1.06: White Chevron livery!
# Col 0-2 from Y=-1.06 to +0.55: Cockpit Glass!
# Col 4-5 at Station 4 and 12: Skip quad where arch cutout is open!
body_faces = []
white_faces = []
glass_faces = []
red_faces = []

n_stations = len(STATIONS)
n_cols = len(STATIONS[0][1])

for s in range(n_stations - 1):
    y_mid = (STATIONS[s][0] + STATIONS[s+1][0]) * 0.5
    for c in range(n_cols - 1):
        # Check if this quad is in the wheel arch cutout
        # Front wheel arch cutout: between station 3 and 5 at col 4-5
        if (s in (3, 4)) and (c == 4):
            continue # Leave open wheel arch opening!
        # Rear wheel arch cutout: between station 11 and 13 at col 4-5
        if (s in (11, 12)) and (c == 4):
            continue # Leave open wheel arch opening!

        v1 = grid_verts[s][c]
        v2 = grid_verts[s+1][c]
        v3 = grid_verts[s+1][c+1]
        v4 = grid_verts[s][c+1]
        f = bm.faces.new((v1, v2, v3, v4))

        # Classify material
        if y_mid < -1.06 and c <= 1:
            white_faces.append(f)
            f.material_index = 1 # White
        elif (-1.10 < y_mid < 0.45) and c <= 1:
            glass_faces.append(f)
            f.material_index = 2 # Glass
        elif (-0.80 < y_mid < 0.20) and c == 2:
            glass_faces.append(f)
            f.material_index = 2 # Glass side
        else:
            red_faces.append(f)
            f.material_index = 0 # Red

# Underfloor bottom face strip from col 5 to centerline
# Creates the flat undertray closing the bottom
floor_verts = []
for s in range(n_stations):
    y = STATIONS[s][0]
    z_floor = 0.045 if y < 1.70 else (0.045 + (y - 1.70) * 0.32)
    v_center = bm.verts.new((0.0, y, z_floor))
    floor_verts.append(v_center)

bm.verts.ensure_lookup_table()

for s in range(n_stations - 1):
    # Skip floor under open wheel arches to leave wheel wells clear
    if (s in (3, 4)) or (s in (11, 12)):
        # connect inner tub at X = 0.55m
        v_tub1 = bm.verts.new((0.55, STATIONS[s][0], 0.045))
        v_tub2 = bm.verts.new((0.55, STATIONS[s+1][0], 0.045))
        f = bm.faces.new((floor_verts[s], floor_verts[s+1], v_tub2, v_tub1))
        f.material_index = 3 # Carbon
        continue
    f = bm.faces.new((floor_verts[s], floor_verts[s+1], grid_verts[s+1][5], grid_verts[s][5]))
    f.material_index = 3 # Carbon

# Front Nose Transom Cap
f_nose = bm.faces.new((floor_verts[0], grid_verts[0][5], grid_verts[0][4], grid_verts[0][3], grid_verts[0][2], grid_verts[0][1], grid_verts[0][0]))
f_nose.material_index = 3 # Carbon

# Rear Bulkhead Cap
last_s = n_stations - 1
f_rear = bm.faces.new((grid_verts[last_s][0], grid_verts[last_s][1], grid_verts[last_s][2], grid_verts[last_s][3], grid_verts[last_s][4], grid_verts[last_s][5], floor_verts[last_s]))
f_rear.material_index = 4 # Dark Bulkhead

bmesh.ops.recalc_face_normals(bm, faces=bm.faces)

mesh = bpy.data.meshes.new("Toyota_GT_One_Body_Mesh")
bm.to_mesh(mesh)
bm.free()

for poly in mesh.polygons:
    poly.use_smooth = True

body_obj = bpy.data.objects.new("Toyota_GT_One_Body", mesh)
SCENE.collection.objects.link(body_obj)
body_obj.data.materials.append(MAT_RED)
body_obj.data.materials.append(MAT_WHITE)
body_obj.data.materials.append(MAT_GLASS)
body_obj.data.materials.append(MAT_CARBON)
body_obj.data.materials.append(MAT_DARK)

# Mirror Modifier (X-axis symmetry with clipping)
mod_mirror = body_obj.modifiers.new("Mirror", 'MIRROR')
mod_mirror.use_axis[0] = True
mod_mirror.use_clip = True

# Subdivision Surface Modifier (Level 2 for silky smooth Le Mans prototype curves!)
mod_subd = body_obj.modifiers.new("Subdivision", 'SUBSURF')
mod_subd.levels = 2
mod_subd.render_levels = 2

# Edge Split Modifier (Keep panel seams crisp)
mod_split = body_obj.modifiers.new("EdgeSplit", 'EDGE_SPLIT')
mod_split.split_angle = math.radians(34.0)

# ==============================================================================
# 2. DETAIL AERO & HARDWARE COMPONENTS
# ==============================================================================
def mesh_from_pydata(name, verts, faces, mat):
    m = bpy.data.meshes.new(name + "_Mesh")
    m.from_pydata([tuple(v) for v in verts], [], [tuple(f) for f in faces])
    m.validate()
    m.update()
    o = bpy.data.objects.new(name, m)
    SCENE.collection.objects.link(o)
    o.data.materials.append(mat)
    for p in m.polygons:
        p.use_smooth = True
    return o

# 2.1 Front Splitter Carbon Undertray
sp_verts = [
    (0.00, -2.44, 0.038), (1.00, -2.44, 0.038), (1.00, -2.18, 0.040), (0.00, -2.18, 0.040),
    (0.00, -2.44, 0.052), (1.00, -2.44, 0.052), (1.00, -2.18, 0.054), (0.00, -2.18, 0.054),
]
sp_faces = [
    (0, 1, 2, 3), (7, 6, 5, 4), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)
]
sp_obj = mesh_from_pydata("Front_Splitter_Tray", sp_verts, sp_faces, MAT_CARBON)
mod_sp_m = sp_obj.modifiers.new("Mirror", 'MIRROR')
mod_sp_m.use_axis[0] = True

# Splitter Outer Winglets
w_verts = [
    (1.00, -2.44, 0.040), (1.00, -2.18, 0.040), (0.99, -2.18, 0.175), (0.99, -2.42, 0.155),
    (1.012, -2.44, 0.040), (1.012, -2.18, 0.040), (1.002, -2.18, 0.175), (1.002, -2.42, 0.155),
]
w_faces = [
    (0, 1, 2, 3), (7, 6, 5, 4), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)
]
w_obj = mesh_from_pydata("Splitter_Winglet", w_verts, w_faces, MAT_CARBON)
mod_w_m = w_obj.modifiers.new("Mirror", 'MIRROR')
mod_w_m.use_axis[0] = True

# 2.2 Roof Periscope Air Scoop
scoop_rows = [
    [(-0.11, -0.48, 1.05), (-0.08, -0.48, 1.130), (0.0, -0.48, 1.135), (0.08, -0.48, 1.130), (0.11, -0.48, 1.05)],
    [(-0.10, -0.22, 1.06), (-0.07, -0.22, 1.125), (0.0, -0.22, 1.130), (0.07, -0.22, 1.125), (0.10, -0.22, 1.06)],
    [(-0.08,  0.08, 1.02), (-0.05,  0.08, 1.065), (0.0,  0.08, 1.070), (0.05,  0.08, 1.065), (0.08,  0.08, 1.02)],
    [(-0.06,  0.38, 0.94), (-0.03,  0.38, 0.970), (0.0,  0.38, 0.975), (0.03,  0.38, 0.970), (0.06,  0.38, 0.94)],
]
sc_verts = [Vector(p) for row in scoop_rows for p in row]
sc_faces = []
for r in range(len(scoop_rows) - 1):
    for c in range(4):
        a = r * 5 + c
        sc_faces.append((a, a + 5, a + 6, a + 1))
sc_obj = mesh_from_pydata("Roof_Periscope_Air_Scoop", sc_verts, sc_faces, MAT_RED)
mod_sc_s = sc_obj.modifiers.new("Solidify", 'SOLIDIFY')
mod_sc_s.thickness = 0.008

# Dark scoop intake throat
th_verts = [
    (-0.09, -0.485, 1.06), (0.09, -0.485, 1.06), (0.09, -0.485, 1.12), (-0.09, -0.485, 1.12),
    (-0.09, -0.460, 1.06), (0.09, -0.460, 1.06), (0.09, -0.460, 1.12), (-0.09, -0.460, 1.12),
]
th_faces = [(0, 1, 2, 3), (7, 6, 5, 4), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)]
mesh_from_pydata("Roof_Scoop_Throat", th_verts, th_faces, MAT_DARK)

# 2.3 Rear Wing & Giant Endplates
# Carbon Main Airfoil
rw_verts = [
    (-0.96, 2.02, 1.050), (0.96, 2.02, 1.050), (0.96, 2.38, 1.085), (-0.96, 2.38, 1.085),
    (-0.96, 2.02, 1.085), (0.96, 2.02, 1.085), (0.96, 2.38, 1.115), (-0.96, 2.38, 1.115),
]
rw_faces = [(0, 1, 2, 3), (7, 6, 5, 4), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)]
mesh_from_pydata("Rear_Wing_Airfoil", rw_verts, rw_faces, MAT_CARBON)

# Vertical Endplates (Left and Right)
ep_pts = [
    (0.98, 1.72, 0.44),
    (0.98, 1.76, 0.72),
    (0.98, 1.94, 1.12),
    (0.98, 2.42, 1.12),
    (0.98, 2.44, 0.32),
    (0.98, 2.10, 0.32),
]
ep_verts = [Vector((p[0], p[1], p[2])) for p in ep_pts] + [Vector((p[0] + 0.016, p[1], p[2])) for p in ep_pts]
n_ep = len(ep_pts)
ep_faces = [tuple(reversed(range(n_ep))), tuple(range(n_ep, 2 * n_ep))]
for i in range(n_ep):
    j = (i + 1) % n_ep
    ep_faces.append((i, j, n_ep + j, n_ep + i))
ep_obj = mesh_from_pydata("Rear_Wing_Endplate", ep_verts, ep_faces, MAT_RED)
mod_ep_m = ep_obj.modifiers.new("Mirror", 'MIRROR')
mod_ep_m.use_axis[0] = True

# White Number Plate on Endplates
np_pts = [
    (0.998, 2.02, 0.65), (0.998, 2.36, 0.65), (0.998, 2.36, 1.04), (0.998, 2.02, 1.04),
    (1.002, 2.02, 0.65), (1.002, 2.36, 0.65), (1.002, 2.36, 1.04), (1.002, 2.02, 1.04),
]
np_faces = [(0, 1, 2, 3), (7, 6, 5, 4), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)]
np_obj = mesh_from_pydata("Endplate_Number_Plate", np_pts, np_faces, MAT_WHITE)
mod_np_m = np_obj.modifiers.new("Mirror", 'MIRROR')
mod_np_m.use_axis[0] = True

# Carbon Wing Pylons
py_verts = [
    (0.32, 2.08, 0.62), (0.32, 2.18, 1.05), (0.32, 2.26, 1.05), (0.32, 2.20, 0.58),
    (0.335, 2.08, 0.62), (0.335, 2.18, 1.05), (0.335, 2.26, 1.05), (0.335, 2.20, 0.58),
]
py_faces = [(0, 1, 2, 3), (7, 6, 5, 4), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)]
py_obj = mesh_from_pydata("Wing_Pylons", py_verts, py_faces, MAT_CARBON)
mod_py_m = py_obj.modifiers.new("Mirror", 'MIRROR')
mod_py_m.use_axis[0] = True

# 2.4 Headlight Clusters (Recessed Triple Projectors + Polycarbonate Cover)
for sign, side in [(-1, "L"), (1, "R")]:
    bx, by, bz = sign * 0.85, -1.98, 0.52
    for j, (dy, dz) in enumerate([(-0.11, -0.05), (0.00, 0.00), (0.11, 0.05)]):
        lamp_pos = (bx, by + dy, bz + dz)
        # Chrome reflector housing
        bm_l = bmesh.new()
        bmesh.ops.create_circle(bm_l, cap_ends=True, radius=0.034, segments=16)
        m_l = bpy.data.meshes.new(f"Headlight_Bezel_{side}_{j}")
        bm_l.to_mesh(m_l)
        bm_l.free()
        o_l = bpy.data.objects.new(f"Headlight_Bezel_{side}_{j}", m_l)
        SCENE.collection.objects.link(o_l)
        o_l.location = (lamp_pos[0], lamp_pos[1] - 0.02, lamp_pos[2])
        o_l.rotation_euler = (0.42, 0, 0)
        o_l.data.materials.append(MAT_CHROME)

        # Emissive bulb
        bm_b = bmesh.new()
        bmesh.ops.create_circle(bm_b, cap_ends=True, radius=0.024, segments=12)
        m_b = bpy.data.meshes.new(f"Headlight_Bulb_{side}_{j}")
        bm_b.to_mesh(m_b)
        bm_b.free()
        o_b = bpy.data.objects.new(f"Headlight_Bulb_{side}_{j}", m_b)
        SCENE.collection.objects.link(o_b)
        o_b.location = (lamp_pos[0], lamp_pos[1] - 0.022, lamp_pos[2])
        o_b.rotation_euler = (0.42, 0, 0)
        o_b.data.materials.append(MAT_HEADLIGHT_LED)

# 2.5 Rear Bulkhead Quad Round Taillights & Exhausts
for sign in (-1, 1):
    for lx in (0.62, 0.76):
        x = sign * lx
        bm_t = bmesh.new()
        bmesh.ops.create_circle(bm_t, cap_ends=True, radius=0.036, segments=16)
        m_t = bpy.data.meshes.new(f"Taillight_{x:.2f}")
        bm_t.to_mesh(m_t)
        bm_t.free()
        o_t = bpy.data.objects.new(f"Taillight_{x:.2f}", m_t)
        SCENE.collection.objects.link(o_t)
        o_t.location = (x, 2.395, 0.46)
        o_t.rotation_euler = (math.pi * 0.5, 0, 0)
        o_t.data.materials.append(MAT_TAIL)

    # Dual Polished Exhausts
    bm_e = bmesh.new()
    bmesh.ops.create_cone(bm_e, cap_ends=False, cap_tris=False, segments=16, radius1=0.042, radius2=0.042, depth=0.10)
    m_e = bpy.data.meshes.new(f"Exhaust_{sign}")
    bm_e.to_mesh(m_e)
    bm_e.free()
    o_e = bpy.data.objects.new(f"Exhaust_{sign}", m_e)
    SCENE.collection.objects.link(o_e)
    o_e.location = (sign * 0.22, 2.39, 0.33)
    o_e.rotation_euler = (math.pi * 0.5, 0, 0)
    o_e.data.materials.append(MAT_CHROME)

# ==============================================================================
# 3. AUTHENTIC BBS LE MANS WHEELS & BREMBO CALIPERS
# ==============================================================================
WHEEL_RADIUS = 0.335
FRONT_TRACK = 1.690
REAR_TRACK = 1.610
FRONT_AXLE_Y = -1.400
REAR_AXLE_Y = 1.400

def create_wheel(parent_name, corner, center_x, center_y, outboard_sign, is_rear):
    parent = bpy.data.objects.new(parent_name, None)
    SCENE.collection.objects.link(parent)
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
    SCENE.collection.objects.link(tire_obj)
    tire_obj.parent = parent
    tire_obj.data.materials.append(MAT_TIRE)

    # BBS Rim Barrel (Hollow cylinder)
    face_x = outboard_sign * (tire_w * 0.40)
    bm_rb = bmesh.new()
    bmesh.ops.create_cone(bm_rb, cap_ends=False, cap_tris=False, segments=32, radius1=rim_r, radius2=rim_r, depth=rim_w)
    m_rb = bpy.data.meshes.new(f"{parent_name}_barrel_Mesh")
    bm_rb.to_mesh(m_rb)
    bm_rb.free()
    for p in m_rb.polygons:
        p.use_smooth = True
    barrel_obj = bpy.data.objects.new(f"{parent_name}_barrel", m_rb)
    SCENE.collection.objects.link(barrel_obj)
    barrel_obj.parent = parent
    barrel_obj.rotation_euler = (0, math.pi * 0.5, 0)
    barrel_obj.data.materials.append(MAT_GOLD)

    # Open BBS Rim Lip (Open ring, NO solid cap!)
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
    SCENE.collection.objects.link(lip_obj)
    lip_obj.parent = parent
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
            SCENE.collection.objects.link(o_sp)
            o_sp.parent = parent
            o_sp.data.materials.append(MAT_GOLD)

    # Center Hub & Center-Lock Nut
    bm_hub = bmesh.new()
    bmesh.ops.create_cone(bm_hub, cap_ends=True, segments=24, radius1=hub_r, radius2=hub_r, depth=0.035)
    m_hub = bpy.data.meshes.new(f"{parent_name}_hub_Mesh")
    bm_hub.to_mesh(m_hub)
    bm_hub.free()
    o_hub = bpy.data.objects.new(f"{parent_name}_hub", m_hub)
    SCENE.collection.objects.link(o_hub)
    o_hub.parent = parent
    o_hub.location = (face_x - outboard_sign * 0.005, 0, 0)
    o_hub.rotation_euler = (0, math.pi * 0.5, 0)
    o_hub.data.materials.append(MAT_GOLD)

    # Center-lock nut (Red on left, Blue on right)
    nut_mat = MAT_BRAKE if outboard_sign < 0 else MAT_GLASS
    bm_nut = bmesh.new()
    bmesh.ops.create_cone(bm_nut, cap_ends=True, segments=12, radius1=0.032, radius2=0.032, depth=0.030)
    m_nut = bpy.data.meshes.new(f"{parent_name}_nut_Mesh")
    bm_nut.to_mesh(m_nut)
    bm_nut.free()
    o_nut = bpy.data.objects.new(f"{parent_name}_nut", m_nut)
    SCENE.collection.objects.link(o_nut)
    o_nut.parent = parent
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
    SCENE.collection.objects.link(o_rot)
    o_rot.parent = parent
    o_rot.location = (-outboard_sign * 0.020, 0, 0)
    o_rot.rotation_euler = (0, math.pi * 0.5, 0)
    o_rot.data.materials.append(MAT_DARK)

    # Separate Brembo Caliper (parent is None / Scene root, DOES NOT spin with wheel!)
    cal_x = center_x - outboard_sign * (tire_w * 0.22)
    cal_y = center_y + (0.130 if is_rear else -0.130)
    bm_cal = bmesh.new()
    bmesh.ops.create_cube(bm_cal, size=1.0)
    bmesh.ops.scale(bm_cal, vec=(0.065, 0.095, 0.165), verts=bm_cal.verts)
    m_cal = bpy.data.meshes.new(f"caliper_{corner}_Mesh")
    bm_cal.to_mesh(m_cal)
    bm_cal.free()
    o_cal = bpy.data.objects.new(f"caliper_{corner}", m_cal)
    SCENE.collection.objects.link(o_cal)
    o_cal.location = (cal_x, cal_y, WHEEL_RADIUS + 0.040)
    o_cal.data.materials.append(MAT_GOLD)
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

# ==============================================================================
# STUDIO CAMERA & LIGHTS FOR DIAGNOSTIC RENDERS
# ==============================================================================
cam_data = bpy.data.cameras.new("Cam_Data")
cam_data.lens = 54
cam_obj = bpy.data.objects.new("Camera", cam_data)
SCENE.collection.objects.link(cam_obj)
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
    SCENE.collection.objects.link(obj)
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

# Render 1: Front 3/4 Dynamic
point_camera(cam_obj, (4.8, -6.2, 2.2), target=(0, -0.6, 0.45))
bpy.context.view_layer.update()
SCENE.render.filepath = os.path.join(ROOT_DIR, "toyota_gt_one_diagnostic_front_34.png")
bpy.ops.render.render(write_still=True)

# Render 2: Side Profile
point_camera(cam_obj, (6.8, 0.0, 1.1), target=(0, 0.0, 0.50))
bpy.context.view_layer.update()
SCENE.render.filepath = os.path.join(ROOT_DIR, "toyota_gt_one_diagnostic_side.png")
bpy.ops.render.render(write_still=True)

# Render 3: Rear 3/4 Dynamic
point_camera(cam_obj, (4.6, 5.8, 2.4), target=(0, 0.8, 0.50))
bpy.context.view_layer.update()
SCENE.render.filepath = os.path.join(ROOT_DIR, "toyota_gt_one_diagnostic_rear_34.png")
bpy.ops.render.render(write_still=True)

print(">> SUCCESS: SubD Prototype Rendered!")
