import bpy
import bmesh
import math
import os
from mathutils import Vector, Matrix, Euler

# ===========================================================================
# 1998 TOYOTA GT-ONE (TS020) LE MANS PROTOTYPE - HIGH-FIDELITY BUILDER
# ===========================================================================

SCENE = bpy.context.scene
ROOT_DIR = r"D:\RacingGameDemo"
BLEND_PATH = os.path.join(ROOT_DIR, "toyota_gt_one_1998.blend")
GLB_PATH = os.path.join(ROOT_DIR, "public", "models", "toyota_gt_one_1998.glb")

# Authentic TS020 Specifications
LENGTH = 4.840
WIDTH = 2.000
HEIGHT = 1.125
WHEELBASE = 2.800
FRONT_TRACK = 1.690
REAR_TRACK = 1.610
WHEEL_RADIUS = 0.335
TIRE_WIDTH_FRONT = 0.310
TIRE_WIDTH_REAR = 0.340
GROUND_CLEARANCE = 0.065
FRONT_AXLE_Y = -WHEELBASE * 0.5  # -1.400
REAR_AXLE_Y = WHEELBASE * 0.5   # +1.400

def clear_scene():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    for col in list(bpy.data.collections):
        bpy.data.collections.remove(col)
    for block_group in (bpy.data.meshes, bpy.data.curves, bpy.data.materials, bpy.data.cameras, bpy.data.lights):
        for block in list(block_group):
            block_group.remove(block)

clear_scene()
SCENE.unit_settings.system = 'METRIC'
SCENE.unit_settings.length_unit = 'METERS'
SCENE.render.engine = 'BLENDER_EEVEE'
SCENE.render.resolution_x = 1280
SCENE.render.resolution_y = 720
SCENE.render.resolution_percentage = 100
SCENE.render.image_settings.file_format = 'PNG'
SCENE.render.film_transparent = False
SCENE.view_settings.look = 'AgX - Medium High Contrast'

ASSET_COLLECTION = bpy.data.collections.new("Toyota_GT_One_GAME_ASSET")
STUDIO_COLLECTION = bpy.data.collections.new("Studio_Review_NOT_FOR_EXPORT")
SCENE.collection.children.link(ASSET_COLLECTION)
SCENE.collection.children.link(STUDIO_COLLECTION)

ROOT = bpy.data.objects.new("Toyota GT-One ROOT", None)
ASSET_COLLECTION.objects.link(ROOT)
ROOT.empty_display_type = 'PLAIN_AXES'

# ---------------------------------------------------------------------------
# Materials
# ---------------------------------------------------------------------------
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
        if 'Emission Strength' in bsdf.inputs:
            bsdf.inputs['Emission Strength'].default_value = emission_strength
    return mat

MATS = {
    'paint': make_material('car_paint', 0xD4000C, metallic=0.40, roughness=0.15, coat=1.0),
    'white': make_material('paint_white', 0xF8FAFD, metallic=0.08, roughness=0.18, coat=1.0),
    'glass': make_material('glass', 0x0A1218, metallic=0.08, roughness=0.04, alpha=0.92, transmission=0.20, coat=1.0),
    'windshield': make_material('windshield', 0x081018, metallic=0.05, roughness=0.03, alpha=0.90, transmission=0.25, coat=1.0),
    'rim': make_material('rim', 0xD0A838, metallic=0.95, roughness=0.18, coat=0.60),
    'tire': make_material('tire_rubber', 0x141517, roughness=0.82),
    'carbon': make_material('carbon_fiber', 0x111214, metallic=0.25, roughness=0.38, coat=0.30),
    'dark_trim': make_material('dark_trim', 0x0A0C0E, metallic=0.55, roughness=0.25),
    'headlight_cover': make_material('headlight', 0xD8EDFF, metallic=0.05, roughness=0.03, alpha=0.45, transmission=0.75, coat=1.0),
    'headlight_beam': make_material('headlight_lamp', 0xFFFFFF, emission=0xFFFFFF, emission_strength=10.0),
    'indicator': make_material('indicator_amber', 0xFF8800, emission=0xFF7700, emission_strength=4.0),
    'tail': make_material('taillight', 0x990008, emission=0x990008, emission_strength=1.2),
    'brake': make_material('brake_light', 0xFF0008, emission=0xFF0008, emission_strength=4.0),
    'caliper': make_material('caliper_gold', 0xC89E20, metallic=0.88, roughness=0.22, coat=0.6),
    'rotor': make_material('dark_metal', 0x24272C, metallic=0.85, roughness=0.32),
    'exhaust': make_material('exhaust_metal', 0xC8D0D8, metallic=0.98, roughness=0.12, coat=0.6),
}

# ---------------------------------------------------------------------------
# Modeling Helper Utilities
# ---------------------------------------------------------------------------
def register_mesh(name, bm, material, parent=ROOT, use_smooth=True, use_weighted_normal=True):
    mesh = bpy.data.meshes.new(name + "_Mesh")
    bm.to_mesh(mesh)
    bm.free()
    
    mesh.validate(verbose=False)
    if use_smooth:
        for p in mesh.polygons:
            p.use_smooth = True
            
    obj = bpy.data.objects.new(name, mesh)
    ASSET_COLLECTION.objects.link(obj)
    if parent is not None:
        obj.parent = parent
    if material is not None:
        obj.data.materials.append(material)
        
    if use_weighted_normal:
        wn = obj.modifiers.new("WeightedNormal", 'WEIGHTED_NORMAL')
        wn.keep_sharp = True
        
    return obj

def make_box(name, center, size, material, parent=ROOT, rotation=(0, 0, 0)):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    dx, dy, dz = size
    bmesh.ops.scale(bm, vec=Vector((dx, dy, dz)), verts=bm.verts)
    rot_mat = Euler(rotation, 'XYZ').to_matrix()
    bmesh.ops.rotate(bm, matrix=rot_mat, verts=bm.verts)
    bmesh.ops.translate(bm, vec=Vector(center), verts=bm.verts)
    return register_mesh(name, bm, material, parent=parent, use_smooth=False, use_weighted_normal=True)

def make_cylinder(name, center, radius, length, axis='X', material=None, parent=ROOT, segments=24, smooth=True):
    bm = bmesh.new()
    half = length * 0.5
    v_c1 = []
    v_c2 = []
    for i in range(segments):
        theta = math.tau * i / segments
        c = radius * math.cos(theta)
        s = radius * math.sin(theta)
        if axis == 'X':
            p1 = Vector((-half, c, s))
            p2 = Vector((half, c, s))
        elif axis == 'Y':
            p1 = Vector((c, -half, s))
            p2 = Vector((c, half, s))
        else:
            p1 = Vector((c, s, -half))
            p2 = Vector((c, s, half))
        v_c1.append(bm.verts.new(p1 + Vector(center)))
        v_c2.append(bm.verts.new(p2 + Vector(center)))
        
    bm.verts.ensure_lookup_table()
    bm.faces.new(reversed(v_c1))
    bm.faces.new(v_c2)
    for i in range(segments):
        j = (i + 1) % segments
        bm.faces.new((v_c1[i], v_c1[j], v_c2[j], v_c2[i]))
        
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return register_mesh(name, bm, material, parent=parent, use_smooth=smooth, use_weighted_normal=True)

def make_prism(name, pts, extrude_vec, material, parent=ROOT, smooth=False, use_weighted_normal=True):
    bm = bmesh.new()
    n = len(pts)
    v_b = [bm.verts.new(p) for p in pts]
    v_t = [bm.verts.new(Vector(p) + Vector(extrude_vec)) for p in pts]
    bm.verts.ensure_lookup_table()
    bm.faces.new(reversed(v_b))
    bm.faces.new(v_t)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((v_b[i], v_b[j], v_t[j], v_t[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return register_mesh(name, bm, material, parent=parent, use_smooth=smooth, use_weighted_normal=use_weighted_normal)

# ===========================================================================
# 1. UNDERBODY, FRONT SPLITTER & VENTURI DIFFUSER
# ===========================================================================
def build_underbody():
    # 1.1 Front Carbon Splitter (Low aerodynamic tray)
    splitter_pts = [
        (-0.99, -2.44, 0.050),
        ( 0.99, -2.44, 0.050),
        ( 1.00, -2.25, 0.050),
        ( 0.97, -1.80, 0.052),
        ( 0.86, -1.35, 0.055),
        (-0.86, -1.35, 0.055),
        (-0.97, -1.80, 0.052),
        (-1.00, -2.25, 0.050),
    ]
    make_prism("Underfloor_Front_Splitter", splitter_pts, (0, 0, 0.024), MATS['carbon'])

    # 1.2 Splitter Outer Winglets / Dive Planes
    for sign, side in [(-1, "L"), (1, "R")]:
        winglet_pts = [
            (sign * 1.00, -2.44, 0.050),
            (sign * 1.00, -2.18, 0.050),
            (sign * 0.99, -2.18, 0.170),
            (sign * 0.99, -2.42, 0.155),
        ]
        make_prism(f"Splitter_Winglet_{side}", winglet_pts, (sign * 0.012, 0, 0), MATS['carbon'])

    # 1.3 Main Underfloor Carbon Tray
    tray_pts = [
        (-0.80, -1.35, 0.055),
        ( 0.80, -1.35, 0.055),
        ( 0.82,  1.15, 0.058),
        (-0.82,  1.15, 0.058),
    ]
    make_prism("Underfloor_Tray", tray_pts, (0, 0, 0.018), MATS['carbon'])

    # 1.4 Rear Venturi Ground-Effect Diffuser (Sweeps up from 0.058 to 0.320)
    bm = bmesh.new()
    stations = [
        (1.15, 0.058, 0.82),
        (1.55, 0.110, 0.85),
        (1.95, 0.190, 0.88),
        (2.40, 0.320, 0.92),
    ]
    prev = None
    for y_v, z_v, hw in stations:
        v_bl = bm.verts.new((-hw, y_v, z_v))
        v_br = bm.verts.new(( hw, y_v, z_v))
        v_tr = bm.verts.new(( hw, y_v, z_v + 0.016))
        v_tl = bm.verts.new((-hw, y_v, z_v + 0.016))
        curr = [v_bl, v_br, v_tr, v_tl]
        if prev:
            bm.faces.new((prev[0], prev[1], curr[1], curr[0]))
            bm.faces.new((prev[3], curr[3], curr[2], prev[2]))
            bm.faces.new((prev[0], curr[0], curr[3], prev[3]))
            bm.faces.new((prev[1], prev[2], curr[2], curr[1]))
        prev = curr
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    register_mesh("Rear_Venturi_Diffuser", bm, MATS['carbon'])

    # 4 Vertical Diffuser Strakes
    for x in (-0.56, -0.19, 0.19, 0.56):
        s_pts = [
            (x, 1.22, 0.060),
            (x, 2.39, 0.320),
            (x, 2.39, 0.100),
            (x, 1.22, 0.045),
        ]
        make_prism(f"Diffuser_Strake_{x:.2f}", s_pts, (0.008, 0, 0), MATS['carbon'])

# ===========================================================================
# 2. FRONT BUMPER, NOSE CLAMSHELL & WHITE CHEVRON
# ===========================================================================
def build_front_clamshell():
    # 2.1 Front Bumper Solid Vertical Fascia & Lower Radiator Mouth
    # Bumper Face
    make_box("Front_Bumper_Lower_Lip", (0.0, -2.40, 0.095), (1.96, 0.04, 0.05), MATS['carbon'])
    # Left & Right Bumper Corners
    for sign, side in [(-1, "L"), (1, "R")]:
        make_box(f"Front_Bumper_Corner_{side}", (sign * 0.72, -2.38, 0.18), (0.50, 0.06, 0.12), MATS['paint'])
    
    # Radiator Intake Mouth (Black interior with carbon framing)
    make_box("Front_Radiator_Intake_Mouth", (0.0, -2.38, 0.155), (0.86, 0.05, 0.08), MATS['dark_trim'])

    # 2.2 Sculpted Central Hood / Nose Cone
    # Dropping from Cowl (y = -1.10, z = 0.72) down to Nose Lip (y = -2.36, z = 0.20)
    bm_nose = bmesh.new()
    nose_stations = [
        (-2.36, 0.20, 0.38),
        (-2.15, 0.32, 0.40),
        (-1.85, 0.48, 0.42),
        (-1.50, 0.60, 0.44),
        (-1.10, 0.72, 0.45),
    ]
    grid = []
    for y, z, hw in nose_stations:
        row = [
            bm_nose.verts.new((-hw, y, z * 0.94)),
            bm_nose.verts.new((-hw * 0.5, y, z * 0.98)),
            bm_nose.verts.new(( 0.0, y, z)),
            bm_nose.verts.new(( hw * 0.5, y, z * 0.98)),
            bm_nose.verts.new(( hw, y, z * 0.94)),
        ]
        grid.append(row)
    bm_nose.verts.ensure_lookup_table()
    for r in range(len(grid) - 1):
        for c in range(len(grid[0]) - 1):
            bm_nose.faces.new((grid[r][c], grid[r+1][c], grid[r+1][c+1], grid[r][c+1]))
    bmesh.ops.recalc_face_normals(bm_nose, faces=bm_nose.faces)
    nose_obj = register_mesh("Nose_Center_Hood", bm_nose, MATS['paint'], use_smooth=True)
    sub = nose_obj.modifiers.new("Subsurf", 'SUBSURF')
    sub.levels = 1

    # 2.3 Iconic White Chevron Livery Arrow (Fitted precisely on nose)
    chev_pts = [
        ( 0.00, -2.38, 0.210),
        (-0.16, -2.22, 0.300),
        (-0.32, -1.95, 0.450),
        (-0.42, -1.60, 0.575),
        (-0.34, -1.30, 0.665),
        (-0.18, -1.12, 0.730),
        ( 0.00, -1.05, 0.745),
        ( 0.18, -1.12, 0.730),
        ( 0.34, -1.30, 0.665),
        ( 0.42, -1.60, 0.575),
        ( 0.32, -1.95, 0.450),
        ( 0.16, -2.22, 0.300),
    ]
    make_prism("Livery_White_Chevron_Front", chev_pts, (0, 0, 0.006), MATS['white'], smooth=True)

# ===========================================================================
# 3. FRONT FENDER PONTOONS, WHEEL ARCHES & PROJECTOR HEADLIGHTS
# ===========================================================================
def build_front_fenders():
    for sign, side in [(-1, "L"), (1, "R")]:
        # 3.1 Fender Pontoon Upper Surface & Crest
        # Sweeps from bumper (y=-2.36) up over wheel (y=-1.40, z=0.76) back to cowl (y=-1.05)
        bm_f = bmesh.new()
        f_stations = [
            (-2.36, 0.28, 0.22, 0.65, 0.98),
            (-2.15, 0.48, 0.40, 0.70, 0.98),
            (-1.90, 0.64, 0.56, 0.72, 0.98),
            (-1.65, 0.73, 0.66, 0.72, 0.97),
            (-1.40, 0.76, 0.71, 0.72, 0.96), # Apex
            (-1.15, 0.72, 0.64, 0.70, 0.94),
            (-0.95, 0.66, 0.58, 0.68, 0.90),
        ]
        grid = []
        for y, z_crest, z_outer, x_inner, x_outer in f_stations:
            row = [
                bm_f.verts.new((sign * x_inner, y, z_crest * 0.92)),
                bm_f.verts.new((sign * ((x_inner + x_outer) * 0.5), y, z_crest)),
                bm_f.verts.new((sign * x_outer, y, z_outer)),
            ]
            grid.append(row)
        bm_f.verts.ensure_lookup_table()
        for r in range(len(grid) - 1):
            for c in range(len(grid[0]) - 1):
                if sign < 0:
                    bm_f.faces.new((grid[r][c], grid[r][c+1], grid[r+1][c+1], grid[r+1][c]))
                else:
                    bm_f.faces.new((grid[r][c], grid[r+1][c], grid[r+1][c+1], grid[r][c+1]))
        bmesh.ops.recalc_face_normals(bm_f, faces=bm_f.faces)
        f_obj = register_mesh(f"Front_Fender_{side}", bm_f, MATS['paint'], use_smooth=True)
        sub = f_obj.modifiers.new("Subsurf", 'SUBSURF')
        sub.levels = 1

        # 3.2 Outer Vertical Fender Flank & Wheel Arch Cutout
        # Front Wheel Arch at Y = -1.40, Z = 0.335, R = 0.355
        # Solid vertical wall from z=0.08 up to z=z_outer
        make_box(f"Front_Wheel_Arch_Wall_Front_{side}", (sign * 0.98, -1.95, 0.28), (0.02, 0.40, 0.36), MATS['paint'])
        make_box(f"Front_Wheel_Arch_Wall_Top_{side}", (sign * 0.97, -1.40, 0.70), (0.02, 0.72, 0.08), MATS['paint'])
        make_box(f"Front_Wheel_Arch_Wall_Rear_{side}", (sign * 0.94, -0.95, 0.32), (0.02, 0.28, 0.44), MATS['paint'])
        # Wheel Arch Inner Tub Liner (Dark cavity so car looks solid)
        make_box(f"Front_Wheel_Tub_{side}", (sign * 0.85, -1.40, 0.42), (0.24, 0.72, 0.28), MATS['dark_trim'])

        # 3.3 Louvered Fender Cooling Vents on Top
        for l_idx in range(4):
            ly = -1.48 + l_idx * 0.05
            make_box(f"Fender_Louver_{side}_{l_idx+1}", (sign * 0.85, ly, 0.762), (0.16, 0.025, 0.008), MATS['dark_trim'])

        # 3.4 Triple-Stack Projector Headlight Assembly
        # Aerodynamic Clear Lens
        cover_pts = [
            (sign * 0.72, -2.16, 0.380),
            (sign * 0.88, -2.10, 0.410),
            (sign * 0.88, -1.78, 0.670),
            (sign * 0.72, -1.80, 0.630),
        ]
        make_prism(f"Headlight_Cover_{side}", cover_pts, (sign * 0.012, 0, 0.012), MATS['headlight_cover'], smooth=True)

        # 3 Projector Lamps in vertical cascade
        lamps = [
            (sign * 0.80, -2.08, 0.44),
            (sign * 0.79, -1.96, 0.52),
            (sign * 0.78, -1.84, 0.60),
        ]
        for idx, (lx, ly, lz) in enumerate(lamps):
            make_cylinder(f"Lamp_Bezel_{side}_{idx+1}", (lx, ly, lz), 0.028, 0.024, axis='Y', material=MATS['exhaust'], segments=16)
            make_cylinder(f"Lamp_Bulb_{side}_{idx+1}", (lx, ly - 0.008, lz), 0.020, 0.016, axis='Y', material=MATS['headlight_beam'], segments=16)

# ===========================================================================
# 4. COCKPIT CANOPY, ROOF SCOOP & AERO MIRRORS
# ===========================================================================
def build_cockpit_and_canopy():
    # 4.1 Teardrop Bubble Canopy (Panoramic Windshield + Roof)
    bm_c = bmesh.new()
    canopy_stations = [
        # y, base_w, top_w, base_z, top_z
        (-1.10, 0.44, 0.08, 0.72, 0.75), # Cowl
        (-0.90, 0.42, 0.30, 0.77, 0.95), # Windshield mid
        (-0.65, 0.40, 0.33, 0.81, 1.04), # Windshield upper
        (-0.35, 0.38, 0.32, 0.82, 1.05), # Roof peak
        (-0.05, 0.35, 0.28, 0.80, 1.02), # Rear glass start
        ( 0.30, 0.30, 0.22, 0.76, 0.92), # Rear glass taper
        ( 0.65, 0.24, 0.14, 0.72, 0.80), # Engine spine blend
    ]
    grid = []
    for y, bw, tw, bz, tz in canopy_stations:
        pts = [
            Vector((-bw, y, bz)),
            Vector((-tw * 1.06, y, (bz + tz) * 0.52)),
            Vector((-tw * 0.55, y, tz * 0.99)),
            Vector(( 0.0, y, tz)),
            Vector(( tw * 0.55, y, tz * 0.99)),
            Vector(( tw * 1.06, y, (bz + tz) * 0.52)),
            Vector(( bw, y, bz)),
        ]
        grid.append([bm_c.verts.new(p) for p in pts])
    bm_c.verts.ensure_lookup_table()
    for r in range(len(grid) - 1):
        for c in range(len(grid[0]) - 1):
            bm_c.faces.new((grid[r][c], grid[r+1][c], grid[r+1][c+1], grid[r][c+1]))
    bmesh.ops.recalc_face_normals(bm_c, faces=bm_c.faces)
    canopy = register_mesh("Cockpit_Windshield_Canopy", bm_c, MATS['windshield'], use_smooth=True)
    sub = canopy.modifiers.new("Subsurf", 'SUBSURF')
    sub.levels = 1

    # Black A-Pillars / Canopy Frame Outline
    make_box("Cockpit_A_Pillar_L", (-0.36, -0.85, 0.88), (0.03, 0.48, 0.03), MATS['dark_trim'], rotation=(math.radians(38), math.radians(-10), 0))
    make_box("Cockpit_A_Pillar_R", ( 0.36, -0.85, 0.88), (0.03, 0.48, 0.03), MATS['dark_trim'], rotation=(math.radians(38), math.radians(10), 0))

    # Single Racing Wiper
    make_box("Cockpit_Wiper_Arm", (0.04, -0.82, 0.91), (0.015, 0.46, 0.012), MATS['dark_trim'], rotation=(math.radians(36), math.radians(8), math.radians(-14)))

    # 4.2 Roof Periscope Scoop & Dorsal Spine
    scoop_pts = [
        (-0.11, -0.42, 1.05),
        ( 0.11, -0.42, 1.05),
        ( 0.09,  0.30, 0.97),
        (-0.09,  0.30, 0.97),
    ]
    make_prism("Roof_Periscope_Scoop_Body", scoop_pts, (0, 0, 0.080), MATS['white'], smooth=True)
    # Open Scoop Mouth
    make_box("Roof_Intake_Mouth", (0.0, -0.42, 1.09), (0.18, 0.03, 0.06), MATS['dark_trim'])

    # Aerodynamic Dorsal Spine
    spine_pts = [
        (0.0,  0.28, 1.02),
        (0.0,  1.65, 0.77),
        (0.0,  1.65, 0.72),
        (0.0,  0.28, 0.94),
    ]
    make_prism("Engine_Dorsal_Spine", spine_pts, (0.018, 0, 0), MATS['paint'], smooth=False)

    # 4.3 Wing Mirrors
    for sign, side in [(-1, "L"), (1, "R")]:
        stalk_pts = [
            (sign * 0.45, -0.92, 0.78),
            (sign * 0.58, -0.88, 0.94),
            (sign * 0.58, -0.86, 0.94),
            (sign * 0.45, -0.90, 0.78),
        ]
        make_prism(f"Mirror_Stalk_{side}", stalk_pts, (0, 0.012, 0), MATS['dark_trim'])
        make_box(f"Mirror_Housing_{side}", (sign * 0.58, -0.88, 0.94), (0.09, 0.15, 0.07), MATS['paint'], rotation=(0, 0, sign * math.radians(14)))
        make_box(f"Mirror_Glass_{side}", (sign * 0.58, -0.81, 0.94), (0.075, 0.01, 0.055), MATS['exhaust'])

# ===========================================================================
# 5. SIDE RADIATOR PODS, DEEP UNDERCUTS & REAR ENGINE CLAMSHELL
# ===========================================================================
def build_side_pods_and_rear():
    for sign, side in [(-1, "L"), (1, "R")]:
        # 5.1 Deep Wasp-Waist Aero Undercut (Signature TS020 air channel)
        # From Y = -0.90 to Y = 0.10, the lower body cuts sharply inward to X = ±0.70
        make_box(f"Side_Undercut_Wall_{side}", (sign * 0.72, -0.40, 0.28), (0.03, 0.88, 0.42), MATS['carbon'])

        # 5.2 Side Radiator Pod (Flares back out to X = ±0.97)
        make_box(f"Side_Radiator_Pod_{side}", (sign * 0.86, 0.35, 0.35), (0.24, 0.65, 0.54), MATS['paint'])
        # Forward-facing Radiator Air Intake Scoop (With dark cooling core mesh)
        make_box(f"Side_Radiator_Intake_{side}", (sign * 0.85, 0.02, 0.32), (0.20, 0.04, 0.32), MATS['dark_trim'])

        # 5.3 Rear Fender Aerodynamic Nacelle (Smooth hump over rear wheel)
        bm_r = bmesh.new()
        r_stations = [
            ( 0.70, 0.70, 0.64, 0.65, 0.96),
            ( 1.05, 0.76, 0.72, 0.68, 0.97),
            ( 1.40, 0.78, 0.74, 0.70, 0.97), # Rear wheel apex
            ( 1.75, 0.74, 0.68, 0.68, 0.96),
            ( 2.10, 0.68, 0.60, 0.65, 0.94),
            ( 2.40, 0.58, 0.52, 0.60, 0.90), # Tail fascia
        ]
        grid = []
        for y, z_crest, z_outer, x_inner, x_outer in r_stations:
            row = [
                bm_r.verts.new((sign * x_inner, y, z_crest * 0.92)),
                bm_r.verts.new((sign * ((x_inner + x_outer) * 0.5), y, z_crest)),
                bm_r.verts.new((sign * x_outer, y, z_outer)),
            ]
            grid.append(row)
        bm_r.verts.ensure_lookup_table()
        for r in range(len(grid) - 1):
            for c in range(len(grid[0]) - 1):
                if sign < 0:
                    bm_r.faces.new((grid[r][c], grid[r][c+1], grid[r+1][c+1], grid[r+1][c]))
                else:
                    bm_r.faces.new((grid[r][c], grid[r+1][c], grid[r+1][c+1], grid[r][c+1]))
        bmesh.ops.recalc_face_normals(bm_r, faces=bm_r.faces)
        r_obj = register_mesh(f"Rear_Fender_Nacelle_{side}", bm_r, MATS['paint'], use_smooth=True)
        sub = r_obj.modifiers.new("Subsurf", 'SUBSURF')
        sub.levels = 1

        # Rear Wheel Arch Wall & Inner Tub
        make_box(f"Rear_Wheel_Arch_Wall_Front_{side}", (sign * 0.97, 0.95, 0.32), (0.02, 0.28, 0.44), MATS['paint'])
        make_box(f"Rear_Wheel_Arch_Wall_Top_{side}", (sign * 0.97, 1.40, 0.72), (0.02, 0.72, 0.08), MATS['paint'])
        make_box(f"Rear_Wheel_Arch_Wall_Rear_{side}", (sign * 0.95, 1.85, 0.32), (0.02, 0.28, 0.44), MATS['paint'])
        make_box(f"Rear_Wheel_Tub_{side}", (sign * 0.82, 1.40, 0.42), (0.24, 0.72, 0.28), MATS['dark_trim'])

    # 5.4 Central Engine Valley & Heat Extractor Deck
    make_box("Engine_Deck_Valley", (0.0, 1.45, 0.65), (0.80, 1.35, 0.12), MATS['carbon'])

    # 5.5 Vertical Tail Bulkhead / Fascia
    make_box("Rear_Tail_Bulkhead", (0.0, 2.39, 0.45), (1.80, 0.04, 0.32), MATS['dark_trim'])

    # Circular Taillights & Exhausts
    for sign, side in [(-1, "L"), (1, "R")]:
        for idx, offset_x in enumerate([0.62, 0.74]):
            lx = sign * offset_x
            make_cylinder(f"Taillight_{side}_{idx+1}", (lx, 2.40, 0.52), 0.038, 0.022, axis='Y', material=MATS['tail'])
            make_cylinder(f"Taillight_Core_{side}_{idx+1}", (lx, 2.406, 0.52), 0.022, 0.016, axis='Y', material=MATS['brake'])
        
        # Chrome Exhaust Pipe
        make_cylinder(f"Exhaust_Pipe_{side}", (sign * 0.26, 2.38, 0.36), 0.040, 0.065, axis='Y', material=MATS['exhaust'])

    # Central FIA Rain Light
    make_box("Rear_Rain_Light", (0.0, 2.405, 0.36), (0.08, 0.02, 0.05), MATS['brake'])

# ===========================================================================
# 6. HIGH-MOUNT REAR WING & GIANT TS020 ENDPLATES
# ===========================================================================
def build_rear_wing():
    WING_Y = 2.22
    WING_Z = 1.05
    WING_SPAN = 1.96

    # 6.1 Main Carbon Airfoil Blade (Curved aerofoil profile with flap)
    make_box("Rear_Wing_Main_Element", (0.0, WING_Y, WING_Z), (WING_SPAN, 0.38, 0.032), MATS['carbon'], rotation=(math.radians(8.5), 0, 0))
    make_box("Rear_Wing_Gurney_Flap", (0.0, WING_Y + 0.17, WING_Z + 0.042), (WING_SPAN * 0.98, 0.012, 0.024), MATS['carbon'])

    # 6.2 Dual Swan-Neck Carbon Wing Mount Pylons
    for x in (-0.38, 0.38):
        pylon_pts = [
            (x, 1.88, 0.68),
            (x, 2.18, WING_Z - 0.01),
            (x, 2.22, WING_Z - 0.01),
            (x, 1.95, 0.68),
        ]
        make_prism(f"Wing_Pylon_{'L' if x < 0 else 'R'}", pylon_pts, (0.020, 0, 0), MATS['carbon'])

    # 6.3 Massive Vertical Rear Wing Endplates (Distinctive TS020 Contour)
    for sign, side in [(-1, "L"), (1, "R")]:
        endplate_pts = [
            (sign * 0.98, 1.88, 0.42),
            (sign * 0.98, 2.44, 0.42),
            (sign * 0.98, 2.44, 1.15),
            (sign * 0.98, 2.05, 1.15),
            (sign * 0.98, 1.88, 0.95),
        ]
        make_prism(f"Rear_Wing_Endplate_{side}", endplate_pts, (sign * 0.018, 0, 0), MATS['paint'], smooth=False)
        # White sponsor graphic rectangular inset
        white_pts = [
            (sign * 0.988, 2.08, 0.65),
            (sign * 0.988, 2.40, 0.65),
            (sign * 0.988, 2.40, 1.05),
            (sign * 0.988, 2.08, 1.05),
        ]
        make_prism(f"Endplate_White_Graphic_{side}", white_pts, (sign * 0.004, 0, 0), MATS['white'], smooth=False)

# ===========================================================================
# 7. AUTHENTIC BBS LE MANS WHEELS & BREMBO BRAKE CALIPERS (BLENDER_NOTE.md)
# ===========================================================================
def create_wheel(parent_name, corner, center_x, center_y, outboard_sign, is_rear):
    # Wheel root parent object strictly at hub center
    parent = bpy.data.objects.new(parent_name, None)
    ASSET_COLLECTION.objects.link(parent)
    parent.parent = ROOT
    parent.location = (center_x, center_y, WHEEL_RADIUS)
    parent.empty_display_type = 'CIRCLE'
    parent.empty_display_size = WHEEL_RADIUS
    
    # Required Engine Metadata
    parent['spin_axis'] = 'local_X'
    parent['origin_is_hub_center'] = True
    parent['wheel_radius_m'] = WHEEL_RADIUS

    tire_w = TIRE_WIDTH_REAR if is_rear else TIRE_WIDTH_FRONT
    rim_w = tire_w * 0.88
    rim_r = 0.235

    # 7.1 Racing Slick Tire with Rounded Shoulder
    bm_t = bmesh.new()
    segments = 32
    r_outer = WHEEL_RADIUS
    r_shoulder = WHEEL_RADIUS - 0.018
    half_tw = tire_w * 0.5
    half_sw = half_tw - 0.022
    
    profile = [
        (-half_tw, rim_r),
        (-half_tw, r_shoulder),
        (-half_sw, r_outer),
        ( half_sw, r_outer),
        ( half_tw, r_shoulder),
        ( half_tw, rim_r),
    ]
    rings = []
    for px, pr in profile:
        ring = []
        for i in range(segments):
            theta = math.tau * i / segments
            y = pr * math.cos(theta)
            z = pr * math.sin(theta)
            ring.append(bm_t.verts.new((px, y, z)))
        rings.append(ring)
    bm_t.verts.ensure_lookup_table()
    for r in range(len(rings) - 1):
        for i in range(segments):
            j = (i + 1) % segments
            bm_t.faces.new((rings[r][i], rings[r+1][i], rings[r+1][j], rings[r][j]))
    bmesh.ops.recalc_face_normals(bm_t, faces=bm_t.faces)
    tire_obj = register_mesh(f"{parent_name}_Tire", bm_t, MATS['tire'], parent=parent, use_smooth=True)
    tire_obj['axle_axis'] = 'X'

    # 7.2 BBS Rim Barrel
    make_cylinder(f"{parent_name}_Rim_Barrel", (0, 0, 0), rim_r, rim_w, axis='X', material=MATS['rim'], parent=parent, segments=32)

    # 7.3 Ventilated Brake Disc Rotor
    make_cylinder(f"{parent_name}_Brake_Rotor", (-outboard_sign * 0.02, 0, 0), 0.190, 0.024, axis='Y', material=MATS['rotor'], parent=parent, segments=24)

    # 7.4 BBS Rim Face & Spoke Network
    face_x = outboard_sign * (tire_w * 0.38)
    # Polished Outer Lip
    make_cylinder(f"{parent_name}_Rim_Lip", (face_x, 0, 0), rim_r * 0.96, 0.015, axis='X', material=MATS['rim'], parent=parent, segments=32)

    # 8 Double-Spoke BBS Le Mans Mesh (16 spokes)
    for i in range(8):
        base_angle = math.tau * i / 8.0
        for split, offset in enumerate((-0.07, 0.07)):
            angle = base_angle + offset
            c = math.cos(angle)
            s = math.sin(angle)
            spoke_center = Vector((face_x - outboard_sign * 0.012, (rim_r * 0.52) * c, (rim_r * 0.52) * s))
            make_box(
                f"{parent_name}_Spoke_{i+1}_{'A' if split == 0 else 'B'}",
                spoke_center,
                (0.018, 0.018, rim_r * 0.72),
                MATS['rim'],
                parent=parent,
                rotation=(angle, 0, 0)
            )

    # Center Hub & Endurance Center-Lock Nut
    make_cylinder(f"{parent_name}_Center_Hub", (face_x + outboard_sign * 0.008, 0, 0), 0.068, 0.035, axis='X', material=MATS['rim'], parent=parent, segments=24)
    nut_mat = MATS['brake'] if outboard_sign < 0 else MATS['glass'] # Red on left, Blue on right
    make_cylinder(f"{parent_name}_Center_Lock_Nut", (face_x + outboard_sign * 0.020, 0, 0), 0.038, 0.035, axis='X', material=nut_mat, parent=parent, segments=12)

    return parent

def build_wheels_and_calipers():
    specs = [
        ('wheel_front_left', 'front_left', -FRONT_TRACK * 0.5, FRONT_AXLE_Y, -1.0, False),
        ('wheel_front_right', 'front_right', FRONT_TRACK * 0.5, FRONT_AXLE_Y, 1.0, False),
        ('wheel_rear_left', 'rear_left', -REAR_TRACK * 0.5, REAR_AXLE_Y, -1.0, True),
        ('wheel_rear_right', 'rear_right', REAR_TRACK * 0.5, REAR_AXLE_Y, 1.0, True),
    ]
    for name, corner, x, y, sign, is_rear in specs:
        create_wheel(name, corner, x, y, sign, is_rear)

    # 4 Separate Brembo Gold Brake Calipers
    for name, corner, x, y, sign, is_rear in specs:
        caliper_name = name.replace('wheel_', 'caliper_')
        tire_w = TIRE_WIDTH_REAR if is_rear else TIRE_WIDTH_FRONT
        caliper_x = x - sign * (tire_w * 0.22)
        caliper_y = y + (0.135 if is_rear else -0.135)
        
        caliper = make_box(
            caliper_name,
            (caliper_x, caliper_y, WHEEL_RADIUS + 0.035),
            (0.065, 0.095, 0.175),
            MATS['caliper'],
            parent=ROOT
        )
        caliper['corner'] = corner
        caliper['steers'] = corner.startswith('front')
        caliper['spins'] = False

# ===========================================================================
# EXECUTE FULL BUILD
# ===========================================================================
print(">> Building 1998 Toyota GT-One (TS020)...")
build_underbody()
build_front_clamshell()
build_front_fenders()
build_cockpit_and_canopy()
build_side_pods_and_rear()
build_rear_wing()
build_wheels_and_calipers()

# Root Metadata
metadata = {
    'asset_id': 'toyota_gt_one_1998_ts020',
    'manufacturer': 'Toyota', 'model': 'GT-One (TS020)', 'model_year': 1998,
    'length_m': LENGTH, 'width_m': WIDTH, 'height_m': HEIGHT,
    'wheelbase_m': WHEELBASE, 'front_track_m': FRONT_TRACK, 'rear_track_m': REAR_TRACK,
    'wheel_radius_m': WHEEL_RADIUS, 'curb_mass_kg': 900.0,
    'weight_distribution_front': 0.44, 'weight_distribution_rear': 0.56,
    'engine_layout': 'mid', 'drive_type': 'RWD',
    'powertrain': '3.6L Twin-Turbo V8 (Toyota R36V)', 'power_hp': 600, 'torque_nm': 650,
    'authoring_axes': '+X right, +Z up, -Y front', 'gltf_game_axes': '+X right, +Y up, +Z front',
    'wheel_spin_axis': 'local X',
}
for k, v in metadata.items():
    ROOT[k] = v

# ---------------------------------------------------------------------------
# Studio Camera & Lighting for Diagnostic Renders
# ---------------------------------------------------------------------------
camera_data = bpy.data.cameras.new("Review_Camera_Data")
camera_data.lens = 54
camera_data.sensor_width = 36
camera = bpy.data.objects.new("Review_Camera", camera_data)
STUDIO_COLLECTION.objects.link(camera)
SCENE.camera = camera

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

world = bpy.data.worlds.new("GT_One_Studio_World")
SCENE.world = world
world.use_nodes = True
world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.015, 0.018, 0.024, 1.0)
world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.35

# Diagnostic Renders
point_camera(camera, (4.8, -6.2, 2.2), target=(0, -0.6, 0.45))
bpy.context.view_layer.update()
SCENE.render.filepath = os.path.join(ROOT_DIR, "toyota_gt_one_diagnostic_front_34.png")
bpy.ops.render.render(write_still=True)

point_camera(camera, (6.8, 0.0, 1.1), target=(0, 0.0, 0.50))
bpy.context.view_layer.update()
SCENE.render.filepath = os.path.join(ROOT_DIR, "toyota_gt_one_diagnostic_side.png")
bpy.ops.render.render(write_still=True)

point_camera(camera, (4.6, 5.8, 2.4), target=(0, 0.8, 0.50))
bpy.context.view_layer.update()
SCENE.render.filepath = os.path.join(ROOT_DIR, "toyota_gt_one_diagnostic_rear_34.png")
bpy.ops.render.render(write_still=True)

# Save .blend Project
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
print(">> SUCCESS: Toyota GT-One v3 generated and exported!")
