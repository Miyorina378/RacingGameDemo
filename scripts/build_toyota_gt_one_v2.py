import bpy
import bmesh
import math
import os
from mathutils import Vector, Matrix, Euler

# ---------------------------------------------------------------------------
# Setup Scene & Paths
# ---------------------------------------------------------------------------
SCENE = bpy.context.scene
ROOT_DIR = r"D:\RacingGameDemo"
BLEND_PATH = os.path.join(ROOT_DIR, "toyota_gt_one_1998.blend")
GLB_PATH = os.path.join(ROOT_DIR, "public", "models", "toyota_gt_one_1998.glb")

# Real Dimensions of 1998 Toyota GT-One (TS020)
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
    'paint': make_material('car_paint', 0xD80010, metallic=0.35, roughness=0.18, coat=1.0),
    'white': make_material('paint_white', 0xF7FAFD, metallic=0.10, roughness=0.20, coat=1.0),
    'glass': make_material('glass', 0x081522, metallic=0.05, roughness=0.06, alpha=0.92, transmission=0.18, coat=0.95),
    'windshield': make_material('windshield', 0x0C1E2E, metallic=0.04, roughness=0.05, alpha=0.90, transmission=0.20, coat=0.95),
    'rim': make_material('rim', 0xD4AF37, metallic=0.95, roughness=0.20, coat=0.55),
    'tire': make_material('tire_rubber', 0x131416, roughness=0.80),
    'carbon': make_material('carbon_fiber', 0x101214, metallic=0.30, roughness=0.42, coat=0.35),
    'dark_trim': make_material('dark_trim', 0x0B0D0F, metallic=0.50, roughness=0.28),
    'headlight_cover': make_material('headlight', 0xD6ECFF, metallic=0.05, roughness=0.05, alpha=0.50, transmission=0.65, coat=0.95),
    'headlight_beam': make_material('headlight_lamp', 0xFFFFFF, emission=0xFFFFFF, emission_strength=8.0),
    'indicator': make_material('indicator_amber', 0xFF8800, emission=0xFF6600, emission_strength=3.5),
    'tail': make_material('taillight', 0x880006, emission=0x880004, emission_strength=0.9),
    'brake': make_material('brake_light', 0xD80008, emission=0xFF0008, emission_strength=3.0),
    'caliper': make_material('caliper_gold', 0xC8961E, metallic=0.88, roughness=0.26, coat=0.6),
    'rotor': make_material('dark_metal', 0x2A2D33, metallic=0.85, roughness=0.35),
    'exhaust': make_material('exhaust_metal', 0xC4CCD4, metallic=0.98, roughness=0.16, coat=0.5),
}

# ---------------------------------------------------------------------------
# Modeling Helper Utilities
# ---------------------------------------------------------------------------
def register_mesh_object(name, bm, material, parent=ROOT, use_smooth=True, use_weighted_normal=True):
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

def create_extruded_prism(name, profile_pts, extrude_vec, material, parent=ROOT, smooth=False, use_weighted_normal=True):
    bm = bmesh.new()
    n = len(profile_pts)
    v_bottom = [bm.verts.new(p) for p in profile_pts]
    v_top = [bm.verts.new(Vector(p) + Vector(extrude_vec)) for p in profile_pts]
    
    bm.verts.ensure_lookup_table()
    bm.faces.new(reversed(v_bottom))
    bm.faces.new(v_top)
    
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((v_bottom[i], v_bottom[j], v_top[j], v_top[i]))
        
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return register_mesh_object(name, bm, material, parent=parent, use_smooth=smooth, use_weighted_normal=use_weighted_normal)

def create_box(name, center, size, material, parent=ROOT, rotation=(0, 0, 0), smooth=False):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    
    dx, dy, dz = size
    bmesh.ops.scale(bm, vec=Vector((dx, dy, dz)), verts=bm.verts)
    
    rot_mat = Euler(rotation, 'XYZ').to_matrix()
    bmesh.ops.rotate(bm, matrix=rot_mat, verts=bm.verts)
    bmesh.ops.translate(bm, vec=Vector(center), verts=bm.verts)
    
    return register_mesh_object(name, bm, material, parent=parent, use_smooth=smooth, use_weighted_normal=True)

def create_cylinder_axis(name, center, radius, length, axis='X', material=None, parent=ROOT, segments=24, smooth=True):
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
    return register_mesh_object(name, bm, material, parent=parent, use_smooth=smooth, use_weighted_normal=True)

# ---------------------------------------------------------------------------
# 1. Aerodynamic Underbody: Carbon Splitter & Venturi Diffuser
# ---------------------------------------------------------------------------
def build_underfloor():
    # Front Carbon Splitter
    splitter_pts = [
        (-0.99, -2.44, 0.050),
        ( 0.99, -2.44, 0.050),
        ( 1.00, -2.25, 0.050),
        ( 0.96, -1.82, 0.052),
        ( 0.85, -1.35, 0.055),
        (-0.85, -1.35, 0.055),
        (-0.96, -1.82, 0.052),
        (-1.00, -2.25, 0.050),
    ]
    create_extruded_prism("Underfloor_Front_Splitter", splitter_pts, (0, 0, 0.022), MATS['carbon'])

    # Front Splitter Side Dive Plates (Winglets)
    for sign, side in [(-1, "L"), (1, "R")]:
        winglet_pts = [
            (sign * 1.00, -2.44, 0.050),
            (sign * 1.00, -2.18, 0.050),
            (sign * 0.99, -2.18, 0.175),
            (sign * 0.99, -2.42, 0.160),
        ]
        create_extruded_prism(f"Splitter_Winglet_{side}", winglet_pts, (sign * 0.012, 0, 0), MATS['carbon'])

    # Central Flat Carbon Floor Plank
    floor_pts = [
        (-0.78, -1.35, 0.055),
        ( 0.78, -1.35, 0.055),
        ( 0.78,  1.15, 0.058),
        (-0.78,  1.15, 0.058),
    ]
    create_extruded_prism("Underfloor_Center_Pan", floor_pts, (0, 0, 0.018), MATS['carbon'])

    # Rear Venturi Ground-Effect Diffuser
    bm = bmesh.new()
    diff_stations = [
        ( 1.15, 0.058, 0.84),
        ( 1.55, 0.110, 0.86),
        ( 1.95, 0.190, 0.89),
        ( 2.38, 0.320, 0.92),
    ]
    prev_verts = None
    for y_val, z_val, half_w in diff_stations:
        v_l = bm.verts.new((-half_w, y_val, z_val))
        v_r = bm.verts.new(( half_w, y_val, z_val))
        v_rt = bm.verts.new(( half_w, y_val, z_val + 0.015))
        v_lt = bm.verts.new((-half_w, y_val, z_val + 0.015))
        curr_verts = [v_l, v_r, v_rt, v_lt]
        if prev_verts:
            bm.faces.new((prev_verts[0], prev_verts[1], curr_verts[1], curr_verts[0])) # bottom
            bm.faces.new((prev_verts[3], curr_verts[3], curr_verts[2], prev_verts[2])) # top
            bm.faces.new((prev_verts[0], curr_verts[0], curr_verts[3], prev_verts[3])) # left
            bm.faces.new((prev_verts[1], prev_verts[2], curr_verts[2], curr_verts[1])) # right
        prev_verts = curr_verts
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    register_mesh_object("Rear_Venturi_Diffuser", bm, MATS['carbon'], parent=ROOT)

    # 4 Vertical Diffuser Strakes
    for x in (-0.56, -0.19, 0.19, 0.56):
        strake_pts = [
            (x, 1.25, 0.060),
            (x, 2.38, 0.320),
            (x, 2.38, 0.090),
            (x, 1.25, 0.045),
        ]
        create_extruded_prism(f"Diffuser_Strake_{x:.2f}", strake_pts, (0.008, 0, 0), MATS['carbon'])

# ---------------------------------------------------------------------------
# 2. Main Clamshell: Clean Multi-Station Quad Aerodynamic Body
# ---------------------------------------------------------------------------
def build_bodywork():
    # Stations from front nose to rear tail
    # Each station defines half-cross-section from Center (x=0) to Outer Edge (x=W)
    # Profiles:
    # 0: Centerline spine
    # 1: Nose / hood gully (air tunnel)
    # 2: Fender pontoon peak (high crest)
    # 3: Fender outer drop / wheel arch top
    # 4: Lower waist / side skirt
    
    STATIONS = [
        # y, center_z, gully_x, gully_z, crest_x, crest_z, arch_x, arch_z, waist_x, waist_z
        (-2.42, 0.165, 0.35, 0.155, 0.75, 0.230, 0.94, 0.180, 0.98, 0.075), # Nose tip & splitter join
        (-2.30, 0.240, 0.40, 0.220, 0.78, 0.380, 0.96, 0.300, 0.99, 0.075), # Front bumper lower
        (-2.15, 0.340, 0.44, 0.310, 0.82, 0.520, 0.98, 0.440, 1.00, 0.080), # Headlight base
        (-1.95, 0.460, 0.46, 0.410, 0.84, 0.650, 0.98, 0.580, 0.99, 0.090), # Headlight mid
        (-1.70, 0.560, 0.47, 0.490, 0.85, 0.740, 0.97, 0.660, 0.98, 0.110), # Front wheel arch start
        (-1.40, 0.640, 0.46, 0.540, 0.85, 0.760, 0.96, 0.710, 0.96, 0.350), # Front wheel apex (open arch)
        (-1.10, 0.720, 0.44, 0.580, 0.84, 0.700, 0.94, 0.630, 0.90, 0.160), # Wheel rear / cowl entry
        (-0.85, 0.820, 0.42, 0.680, 0.80, 0.580, 0.88, 0.520, 0.74, 0.080), # Wasp-waist air undercut
        (-0.50, 0.920, 0.40, 0.780, 0.75, 0.520, 0.85, 0.460, 0.68, 0.080), # Maximum side undercut
        (-0.15, 0.960, 0.42, 0.820, 0.74, 0.540, 0.88, 0.480, 0.72, 0.080), # Cockpit waist
        ( 0.20, 0.920, 0.45, 0.800, 0.76, 0.600, 0.92, 0.560, 0.84, 0.080), # Radiator inlet flare
        ( 0.60, 0.840, 0.48, 0.720, 0.78, 0.680, 0.95, 0.640, 0.95, 0.085), # Rear engine cowl
        ( 1.05, 0.760, 0.48, 0.660, 0.80, 0.750, 0.96, 0.710, 0.97, 0.160), # Rear arch start
        ( 1.40, 0.720, 0.46, 0.630, 0.80, 0.780, 0.96, 0.730, 0.97, 0.350), # Rear wheel apex (open arch)
        ( 1.75, 0.680, 0.44, 0.590, 0.78, 0.740, 0.94, 0.670, 0.96, 0.160), # Rear wheel rear
        ( 2.10, 0.640, 0.42, 0.550, 0.75, 0.670, 0.92, 0.590, 0.93, 0.140), # Rear deck drop
        ( 2.40, 0.580, 0.38, 0.510, 0.72, 0.580, 0.88, 0.510, 0.90, 0.320), # Tail fascia bulkhead
    ]

    bm = bmesh.new()
    rows_l = []
    rows_r = []

    for y, cz, gx, gz, cx, cz_crest, ax, az, wx, wz in STATIONS:
        # Left side points (negative X) from center (x=0) to outer waist
        pts_left = [
            Vector(( 0.0, y, cz)),
            Vector((-gx * 0.55, y, (cz + gz) * 0.5)),
            Vector((-gx, y, gz)),
            Vector((-(gx + cx) * 0.5, y, (gz + cz_crest) * 0.52)),
            Vector((-cx, y, cz_crest)),
            Vector((-(cx + ax) * 0.5, y, (cz_crest + az) * 0.5)),
            Vector((-ax, y, az)),
            Vector((-wx, y, wz)),
        ]
        # Right side points (positive X)
        pts_right = [
            Vector(( 0.0, y, cz)),
            Vector(( gx * 0.55, y, (cz + gz) * 0.5)),
            Vector(( gx, y, gz)),
            Vector(( (gx + cx) * 0.5, y, (gz + cz_crest) * 0.52)),
            Vector(( cx, y, cz_crest)),
            Vector(( (cx + ax) * 0.5, y, (cz_crest + az) * 0.5)),
            Vector(( ax, y, az)),
            Vector(( wx, y, wz)),
        ]
        
        vl = [bm.verts.new(p) for p in pts_left]
        vr = [bm.verts.new(p) for p in pts_right]
        rows_l.append(vl)
        rows_r.append(vr)

    bm.verts.ensure_lookup_table()
    n_rows = len(STATIONS)
    n_cols = 8

    # Connect quads along Y stations
    for r in range(n_rows - 1):
        for c in range(n_cols - 1):
            # Left quad
            v1 = rows_l[r][c]
            v2 = rows_l[r][c+1]
            v3 = rows_l[r+1][c+1]
            v4 = rows_l[r+1][c]
            bm.faces.new((v1, v4, v3, v2))
            
            # Right quad
            v1r = rows_r[r][c]
            v2r = rows_r[r][c+1]
            v3r = rows_r[r+1][c+1]
            v4r = rows_r[r+1][c]
            bm.faces.new((v1r, v2r, v3r, v4r))

    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    body_obj = register_mesh_object("Toyota_GT_One_Body_Shell", bm, MATS['paint'], parent=ROOT, use_smooth=True, use_weighted_normal=True)
    
    # Subsurf modifier for high-end automotive curvature
    sub = body_obj.modifiers.new("Body_Subsurf", 'SUBSURF')
    sub.levels = 1
    sub.render_levels = 1
    
    return body_obj

# ---------------------------------------------------------------------------
# 3. Cockpit Canopy & High-Downforce Windshield
# ---------------------------------------------------------------------------
def build_cockpit():
    # Streamlined teardrop bubble canopy with black A-pillars and dark glass
    bm = bmesh.new()
    
    canopy_stations = [
        # y, base_w, top_w, base_z, top_z
        (-1.12, 0.44, 0.05, 0.72, 0.74), # Windshield cowl base
        (-0.95, 0.43, 0.28, 0.76, 0.94), # Lower windshield
        (-0.70, 0.41, 0.33, 0.81, 1.03), # Mid windshield
        (-0.40, 0.38, 0.32, 0.83, 1.05), # Roof peak
        (-0.05, 0.34, 0.28, 0.82, 1.03), # Rear glass start
        ( 0.30, 0.30, 0.22, 0.78, 0.93), # Rear glass taper
        ( 0.65, 0.25, 0.14, 0.74, 0.82), # Engine spine blend
    ]
    
    grid = []
    for y, bw, tw, bz, tz in canopy_stations:
        # Cross section ring: left base -> left mid -> center top -> right mid -> right base
        ring_pts = [
            Vector((-bw, y, bz)),
            Vector((-tw * 1.08, y, (bz + tz) * 0.52)),
            Vector((-tw * 0.55, y, tz * 0.99)),
            Vector(( 0.0, y, tz)),
            Vector(( tw * 0.55, y, tz * 0.99)),
            Vector(( tw * 1.08, y, (bz + tz) * 0.52)),
            Vector(( bw, y, bz)),
        ]
        grid.append([bm.verts.new(p) for p in ring_pts])
        
    bm.verts.ensure_lookup_table()
    for r in range(len(grid) - 1):
        for c in range(len(grid[0]) - 1):
            v1 = grid[r][c]
            v2 = grid[r][c+1]
            v3 = grid[r+1][c+1]
            v4 = grid[r+1][c]
            bm.faces.new((v1, v2, v3, v4))
            
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    canopy = register_mesh_object("Cockpit_Windshield_Canopy", bm, MATS['windshield'], parent=ROOT, use_smooth=True, use_weighted_normal=True)
    
    sub = canopy.modifiers.new("Canopy_Subsurf", 'SUBSURF')
    sub.levels = 1
    
    # Windshield Wiper
    bm_w = bmesh.new()
    bmesh.ops.create_cube(bm_w, size=1.0)
    bmesh.ops.scale(bm_w, vec=Vector((0.012, 0.48, 0.012)), verts=bm_w.verts)
    rot = Euler((math.radians(35), math.radians(12), math.radians(-15)), 'XYZ').to_matrix()
    bmesh.ops.rotate(bm_w, matrix=rot, verts=bm_w.verts)
    bmesh.ops.translate(bm_w, vec=Vector((0.04, -0.85, 0.90)), verts=bm_w.verts)
    register_mesh_object("Cockpit_Wiper_Arm", bm_w, MATS['dark_trim'], parent=ROOT)

# ---------------------------------------------------------------------------
# 4. Roof Periscope Scoop & Dorsal Spine
# ---------------------------------------------------------------------------
def build_roof_scoop():
    # White/Red Periscope Scoop on roof
    scoop_pts = [
        (-0.12, -0.45, 1.04),
        ( 0.12, -0.45, 1.04),
        ( 0.10,  0.28, 0.96),
        (-0.10,  0.28, 0.96),
    ]
    create_extruded_prism("Roof_Periscope_Intake_Body", scoop_pts, (0, 0, 0.088), MATS['white'], smooth=True)
    
    # Dark open mouth intake opening
    create_box("Roof_Intake_Mouth", (0.0, -0.45, 1.085), (0.19, 0.03, 0.065), MATS['dark_trim'])
    
    # Aerodynamic Dorsal Spine running along engine cover
    spine_pts = [
        (0.0,  0.25, 1.02),
        (0.0,  1.60, 0.76),
        (0.0,  1.60, 0.71),
        (0.0,  0.25, 0.94),
    ]
    create_extruded_prism("Engine_Cover_Dorsal_Fin", spine_pts, (0.016, 0, 0), MATS['paint'], smooth=False)

# ---------------------------------------------------------------------------
# 5. Iconic Front Livery Chevron & Aerodynamic Headlights
# ---------------------------------------------------------------------------
def build_front_details():
    # Distinct white chevron arrow conforming directly onto nose cone
    chev_pts = [
        ( 0.00, -2.43, 0.170),
        (-0.18, -2.26, 0.275),
        (-0.35, -2.00, 0.410),
        (-0.46, -1.65, 0.540),
        (-0.36, -1.30, 0.650),
        (-0.20, -1.10, 0.740),
        ( 0.00, -1.02, 0.780),
        ( 0.20, -1.10, 0.740),
        ( 0.36, -1.30, 0.650),
        ( 0.46, -1.65, 0.540),
        ( 0.35, -2.00, 0.410),
        ( 0.18, -2.26, 0.275),
    ]
    create_extruded_prism("Livery_White_Chevron_Front", chev_pts, (0, 0, 0.006), MATS['white'], smooth=True)

    # Triple Stack Projector Headlights
    for sign, side in [(-1, "L"), (1, "R")]:
        # Aerodynamic Clear Lens Fairing
        cover_pts = [
            (sign * 0.70, -2.18, 0.380),
            (sign * 0.88, -2.12, 0.405),
            (sign * 0.88, -1.78, 0.680),
            (sign * 0.70, -1.80, 0.640),
        ]
        create_extruded_prism(f"Headlight_Cover_{side}", cover_pts, (sign * 0.010, 0, 0.010), MATS['headlight_cover'], smooth=True)

        # 3 Projector Lamps in vertical stack
        lamp_positions = [
            (sign * 0.79, -2.10, 0.44),
            (sign * 0.78, -1.98, 0.52),
            (sign * 0.77, -1.86, 0.60),
        ]
        for idx, (lx, ly, lz) in enumerate(lamp_positions):
            # Chrome Bezel Ring
            create_cylinder_axis(f"Lamp_Bezel_{side}_{idx+1}", (lx, ly, lz), 0.028, 0.024, axis='Y', material=MATS['exhaust'], segments=16)
            # Emissive Projector Core
            create_cylinder_axis(f"Lamp_Bulb_{side}_{idx+1}", (lx, ly - 0.008, lz), 0.020, 0.016, axis='Y', material=MATS['headlight_beam'], segments=16)

    # Side Mirrors
    for sign, side in [(-1, "L"), (1, "R")]:
        # Mirror Stalk
        stalk_pts = [
            (sign * 0.45, -0.92, 0.78),
            (sign * 0.58, -0.88, 0.94),
            (sign * 0.58, -0.86, 0.94),
            (sign * 0.45, -0.90, 0.78),
        ]
        create_extruded_prism(f"Mirror_Stalk_{side}", stalk_pts, (0, 0.012, 0), MATS['dark_trim'])
        
        # Mirror Housing
        create_box(f"Mirror_Housing_{side}", (sign * 0.58, -0.88, 0.94), (0.09, 0.15, 0.07), MATS['paint'], rotation=(0, 0, sign * math.radians(14)))
        # Mirror Glass Face
        create_box(f"Mirror_Glass_{side}", (sign * 0.58, -0.81, 0.94), (0.075, 0.01, 0.055), MATS['exhaust'])

# ---------------------------------------------------------------------------
# 6. High-Downforce Rear Wing, Giant Endplates & Exhaust
# ---------------------------------------------------------------------------
def build_rear_wing_and_fascia():
    WING_Y = 2.22
    WING_Z = 1.05
    WING_SPAN = 1.96
    
    # 1. Main Airfoil Blade
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=Vector((WING_SPAN, 0.38, 0.032)), verts=bm.verts)
    rot = Euler((math.radians(8.5), 0, 0), 'XYZ').to_matrix()
    bmesh.ops.rotate(bm, matrix=rot, verts=bm.verts)
    bmesh.ops.translate(bm, vec=Vector((0.0, WING_Y, WING_Z)), verts=bm.verts)
    register_mesh_object("Rear_Wing_Main_Element", bm, MATS['carbon'], parent=ROOT)

    # Secondary Gurney Flap
    create_box("Rear_Wing_Gurney_Flap", (0.0, WING_Y + 0.17, WING_Z + 0.04), (WING_SPAN * 0.98, 0.012, 0.024), MATS['carbon'])

    # Dual Swan-Neck Carbon Wing Mount Pylons
    for x in (-0.38, 0.38):
        pylon_pts = [
            (x, 1.85, 0.68),
            (x, 2.18, WING_Z - 0.01),
            (x, 2.22, WING_Z - 0.01),
            (x, 1.92, 0.68),
        ]
        create_extruded_prism(f"Wing_Pylon_{'L' if x < 0 else 'R'}", pylon_pts, (0.020, 0, 0), MATS['carbon'])

    # Massive Vertical Rear Wing Endplates (Distinctive TS020 Profile)
    for sign, side in [(-1, "L"), (1, "R")]:
        endplate_pts = [
            (sign * 0.98, 1.88, 0.42),
            (sign * 0.98, 2.44, 0.42),
            (sign * 0.98, 2.44, 1.15),
            (sign * 0.98, 2.05, 1.15),
            (sign * 0.98, 1.88, 0.95),
        ]
        create_extruded_prism(f"Rear_Wing_Endplate_{side}", endplate_pts, (sign * 0.018, 0, 0), MATS['paint'], smooth=False)
        # Inner white sponsor graphic box
        white_box_pts = [
            (sign * 0.988, 2.08, 0.65),
            (sign * 0.988, 2.40, 0.65),
            (sign * 0.988, 2.40, 1.05),
            (sign * 0.988, 2.08, 1.05),
        ]
        create_extruded_prism(f"Endplate_White_Graphic_{side}", white_box_pts, (sign * 0.004, 0, 0), MATS['white'], smooth=False)

    # Rear Fascia Details: Tail lights, exhaust tips, rain light
    # Dual Circular Taillights on each side
    for sign, side in [(-1, "L"), (1, "R")]:
        for idx, (offset_x, offset_z) in enumerate([(0.64, 0.54), (0.76, 0.54)]):
            lx = sign * offset_x
            create_cylinder_axis(f"Taillight_{side}_{idx+1}", (lx, 2.40, offset_z), 0.038, 0.020, axis='Y', material=MATS['tail'])
            create_cylinder_axis(f"Taillight_Core_{side}_{idx+1}", (lx, 2.405, offset_z), 0.024, 0.016, axis='Y', material=MATS['brake'])

    # Dual Chrome Exhaust Pipes
    for sign, side in [(-1, "L"), (1, "R")]:
        ex_x = sign * 0.26
        create_cylinder_axis(f"Exhaust_Pipe_{side}", (ex_x, 2.38, 0.38), 0.042, 0.065, axis='Y', material=MATS['exhaust'])

    # FIA Center Rain Light
    create_box("Rear_Center_Rain_Light", (0.0, 2.40, 0.38), (0.08, 0.02, 0.05), MATS['brake'])

# ---------------------------------------------------------------------------
# 7. BBS Le Mans Racing Wheels & Brake Calipers (Strict BLENDER_NOTE.md)
# ---------------------------------------------------------------------------
def create_wheel(parent_name, corner, center_x, center_y, outboard_sign, is_rear):
    parent = bpy.data.objects.new(parent_name, None)
    ASSET_COLLECTION.objects.link(parent)
    parent.parent = ROOT
    parent.location = (center_x, center_y, WHEEL_RADIUS)
    parent.empty_display_type = 'CIRCLE'
    parent.empty_display_size = WHEEL_RADIUS
    
    # Metadata for physics engine
    parent['spin_axis'] = 'local_X'
    parent['origin_is_hub_center'] = True
    parent['wheel_radius_m'] = WHEEL_RADIUS

    tire_w = TIRE_WIDTH_REAR if is_rear else TIRE_WIDTH_FRONT
    rim_w = tire_w * 0.88
    rim_r = 0.235

    # 1. Racing Slick Tire
    # Smooth curved cylinder with rounded shoulder
    bm_t = bmesh.new()
    segments = 32
    r_outer = WHEEL_RADIUS
    r_inner = rim_r
    r_shoulder = WHEEL_RADIUS - 0.018
    half_tw = tire_w * 0.5
    half_sw = half_tw - 0.022
    
    # Ring profiles along X
    profile = [
        (-half_tw, r_inner),
        (-half_tw, r_shoulder),
        (-half_sw, r_outer),
        ( half_sw, r_outer),
        ( half_tw, r_shoulder),
        ( half_tw, r_inner),
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
    tire_obj = register_mesh_object(f"{parent_name}_Tire", bm_t, MATS['tire'], parent=parent, use_smooth=True)
    tire_obj['axle_axis'] = 'X'

    # 2. Deep-Dish BBS Rim Barrel
    create_cylinder_axis(f"{parent_name}_Rim_Barrel", (0, 0, 0), rim_r, rim_w, axis='X', material=MATS['rim'], parent=parent, segments=32)

    # 3. Ventilated Brake Disc Rotor
    create_cylinder_axis(f"{parent_name}_Brake_Rotor", (-outboard_sign * 0.02, 0, 0), 0.190, 0.024, axis='Y', material=MATS['rotor'], parent=parent, segments=24)

    # 4. BBS Le Mans Spoke Face
    face_x = outboard_sign * (tire_w * 0.38)
    # Outer Rim Lip
    create_cylinder_axis(f"{parent_name}_Rim_Lip", (face_x, 0, 0), rim_r * 0.96, 0.015, axis='X', material=MATS['rim'], parent=parent, segments=32)

    # BBS Multi-Spoke Array (8 paired Y-spokes = 16 spokes)
    num_spokes = 8
    for i in range(num_spokes):
        base_angle = math.tau * i / num_spokes
        for split, offset in enumerate((-0.07, 0.07)):
            angle = base_angle + offset
            c = math.cos(angle)
            s = math.sin(angle)
            spoke_center = Vector((face_x - outboard_sign * 0.012, (rim_r * 0.52) * c, (rim_r * 0.52) * s))
            create_box(
                f"{parent_name}_Spoke_{i+1}_{'A' if split == 0 else 'B'}",
                spoke_center,
                (0.018, 0.018, rim_r * 0.72),
                MATS['rim'],
                parent=parent,
                rotation=(angle, 0, 0)
            )

    # Center Lug & Hub
    create_cylinder_axis(f"{parent_name}_Center_Hub", (face_x + outboard_sign * 0.008, 0, 0), 0.068, 0.035, axis='X', material=MATS['rim'], parent=parent, segments=24)
    # Anodized lock nut: Red on left, Blue on right (authentic Le Mans endurance standard)
    nut_mat = MATS['brake'] if outboard_sign < 0 else MATS['glass']
    create_cylinder_axis(f"{parent_name}_Center_Lock_Nut", (face_x + outboard_sign * 0.020, 0, 0), 0.038, 0.035, axis='X', material=nut_mat, parent=parent, segments=12)

    return parent

def build_all_wheels():
    wheel_specs = [
        ('wheel_front_left', 'front_left', -FRONT_TRACK * 0.5, FRONT_AXLE_Y, -1.0, False),
        ('wheel_front_right', 'front_right', FRONT_TRACK * 0.5, FRONT_AXLE_Y, 1.0, False),
        ('wheel_rear_left', 'rear_left', -REAR_TRACK * 0.5, REAR_AXLE_Y, -1.0, True),
        ('wheel_rear_right', 'rear_right', REAR_TRACK * 0.5, REAR_AXLE_Y, 1.0, True),
    ]

    for name, corner, x, y, sign, is_rear in wheel_specs:
        create_wheel(name, corner, x, y, sign, is_rear)

    # 4 Separate Brake Calipers
    for name, corner, x, y, sign, is_rear in wheel_specs:
        caliper_name = name.replace('wheel_', 'caliper_')
        tire_w = TIRE_WIDTH_REAR if is_rear else TIRE_WIDTH_FRONT
        caliper_x = x - sign * (tire_w * 0.22)
        caliper_y = y + (0.135 if is_rear else -0.135)
        
        caliper = create_box(
            caliper_name,
            (caliper_x, caliper_y, WHEEL_RADIUS + 0.035),
            (0.065, 0.095, 0.175),
            MATS['caliper'],
            parent=ROOT
        )
        caliper['corner'] = corner
        caliper['steers'] = corner.startswith('front')
        caliper['spins'] = False

# ---------------------------------------------------------------------------
# Execute Full Assembly
# ---------------------------------------------------------------------------
build_underfloor()
build_bodywork()
build_cockpit()
build_roof_scoop()
build_front_details()
build_rear_wing_and_fascia()
build_all_wheels()

# Metadata
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

# Save Blender Project
bpy.ops.wm.save_as_mainfile(filepath=BLEND_PATH)

# Export Game-Ready GLB
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
print("SUCCESS: Masterpiece Toyota GT-One v2 successfully generated and exported!")
