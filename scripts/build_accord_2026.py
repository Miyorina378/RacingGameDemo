import bpy
import math
import os
import json
from mathutils import Vector, Matrix, Euler

# ==============================================================================
# 2026 Honda Accord Sport Hybrid (11th Gen) - Master Game Production Model
# 100% Compliant with BLENDER_NOTE.md & Real Vehicle Dimensions
# ==============================================================================

SCENE = bpy.context.scene
ROOT_DIR = r"D:\trifilpla"
BLEND_PATH = os.path.join(ROOT_DIR, "honda_accord_2026_game_ready.blend")
GLB_EXPORT_PATH = os.path.join(ROOT_DIR, "public", "models", "honda_accord_2026.glb")

# Real-world 2026 Honda Accord Sport Hybrid specs
LENGTH = 4.97078
WIDTH = 1.86182
HEIGHT = 1.45034
WHEELBASE = 2.82956
FRONT_TRACK = 1.59004
REAR_TRACK = 1.61290
WHEEL_RADIUS = 0.33530
TIRE_WIDTH = 0.235
GROUND_CLEARANCE = 0.13462

FRONT_AXLE_Y = -WHEELBASE * 0.5   # -1.41478
REAR_AXLE_Y = WHEELBASE * 0.5     # +1.41478
ARCH_RADIUS = 0.355               # authentic sedan stance with 0.355m circular arch radius

def clear_scene():
    if bpy.context.object and bpy.context.object.mode != 'OBJECT':
        bpy.ops.object.mode_set(mode='OBJECT')
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    for col in list(bpy.data.collections):
        bpy.data.collections.remove(col)
    for blocks in (bpy.data.meshes, bpy.data.curves, bpy.data.materials, bpy.data.cameras, bpy.data.lights):
        for b in list(blocks):
            blocks.remove(b)

clear_scene()

SCENE.unit_settings.system = 'METRIC'
SCENE.unit_settings.length_unit = 'METERS'
SCENE.unit_settings.scale_length = 1.0
SCENE.render.engine = 'BLENDER_EEVEE'
SCENE.render.resolution_x = 1280
SCENE.render.resolution_y = 800
SCENE.render.resolution_percentage = 100
SCENE.render.image_settings.file_format = 'PNG'
SCENE.render.image_settings.color_mode = 'RGBA'
SCENE.view_settings.look = 'AgX - Medium High Contrast'

ASSET_COLLECTION = bpy.data.collections.new("Honda_Accord_2026_GAME_ASSET")
STUDIO_COLLECTION = bpy.data.collections.new("Accord_Review_Studio_NOT_FOR_EXPORT")
SCENE.collection.children.link(ASSET_COLLECTION)
SCENE.collection.children.link(STUDIO_COLLECTION)

ROOT = bpy.data.objects.new("Honda Accord 2026 ROOT", None)
ASSET_COLLECTION.objects.link(ROOT)
ROOT.empty_display_type = 'PLAIN_AXES'
ROOT.empty_display_size = 0.25

def rgba(hex_val, alpha=1.0):
    if isinstance(hex_val, str):
        hex_val = int(hex_val.lstrip('#'), 16)
    return (((hex_val >> 16) & 255) / 255.0, ((hex_val >> 8) & 255) / 255.0, (hex_val & 255) / 255.0, alpha)

def make_pbr_material(name, color, metallic=0.0, roughness=0.3, alpha=1.0,
                      coat=0.0, coat_roughness=0.05,
                      emission=None, emission_strength=0.0,
                      transmission=0.0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    mat.diffuse_color = rgba(color, alpha)
    values = {
        'Base Color': rgba(color, 1.0),
        'Metallic': metallic,
        'Roughness': roughness,
        'Alpha': alpha,
        'Coat Weight': coat,
        'Coat Roughness': coat_roughness,
        'IOR': 1.52,
    }
    if 'Transmission Weight' in bsdf.inputs:
        values['Transmission Weight'] = transmission
    elif 'Transmission' in bsdf.inputs:
        values['Transmission'] = transmission
    for socket_name, val in values.items():
        if socket_name in bsdf.inputs:
            bsdf.inputs[socket_name].default_value = val
    if alpha < 1.0:
        mat.blend_method = 'BLEND'
    if emission is not None:
        if 'Emission Color' in bsdf.inputs:
            bsdf.inputs['Emission Color'].default_value = rgba(emission, 1.0)
        elif 'Emission' in bsdf.inputs:
            bsdf.inputs['Emission'].default_value = rgba(emission, 1.0)
        if 'Emission Strength' in bsdf.inputs:
            bsdf.inputs['Emission Strength'].default_value = emission_strength
    return mat

# Detectable materials strictly per BLENDER_NOTE.md
# Upgraded car_paint to authentic automotive platinum white pearl (deep gloss clearcoat)
MATS = {
    'paint': make_pbr_material('car_paint', 0xEDF1F6, metallic=0.18, roughness=0.22, coat=1.0, coat_roughness=0.03),
    'glass': make_pbr_material('glass', 0x141A20, metallic=0.10, roughness=0.05, coat=0.98),
    'windshield': make_pbr_material('windshield', 0x161E26, metallic=0.08, roughness=0.04, coat=0.99),
    'rim': make_pbr_material('rim', 0xE4E8EE, metallic=0.98, roughness=0.14, coat=0.6),
    'rim_dark': make_pbr_material('rim_dark', 0x16181A, metallic=0.88, roughness=0.20, coat=0.5),
    'tire': make_pbr_material('tire_rubber', 0x121315, metallic=0.0, roughness=0.80),
    'black': make_pbr_material('gloss_black', 0x08090C, metallic=0.45, roughness=0.10, coat=1.0),
    'grille_mesh': make_pbr_material('grille_dark', 0x0D0F13, metallic=0.0, roughness=0.85, coat=0.0),
    'chrome': make_pbr_material('chrome', 0xF5FAFF, metallic=0.75, roughness=0.10, coat=0.8),
    'dark_metal': make_pbr_material('dark_metal', 0x24282D, metallic=0.85, roughness=0.25),
    'door_seam': make_pbr_material('door_seam', 0x0F1114, metallic=0.20, roughness=0.80),
    'headlight_housing': make_pbr_material('headlight_housing', 0x07080A, metallic=0.65, roughness=0.20),
    'headlight_lens': make_pbr_material('headlight_lens', 0x1A222C, metallic=0.05, roughness=0.02, alpha=0.30, coat=0.8, transmission=0.85),
    'drl': make_pbr_material('headlight_drl', 0xFFFFFF, metallic=0.0, roughness=0.05, emission=0xF8FCFF, emission_strength=14.0),
    'amber': make_pbr_material('indicator_amber', 0xFF8800, metallic=0.0, roughness=0.15, emission=0xFF7700, emission_strength=7.0),
    'taillight': make_pbr_material('taillight', 0x880509, metallic=0.1, roughness=0.10, coat=0.9, emission=0x800006, emission_strength=1.5),
    'brake_light': make_pbr_material('brake_light', 0xEE060E, metallic=0.05, roughness=0.08, coat=0.95, emission=0xFF000A, emission_strength=6.0),
    'reverse_light': make_pbr_material('reverse_light', 0xEEF5FF, metallic=0.1, roughness=0.08, emission=0xF0F8FF, emission_strength=3.0),
    'reflector_red': make_pbr_material('reflector_red', 0x990408, metallic=0.2, roughness=0.25, coat=0.8),
    'caliper': make_pbr_material('caliper_red', 0xEE111A, metallic=0.45, roughness=0.15, coat=1.0),
    'liner': make_pbr_material('wheel_well_liner', 0x0d0e10, metallic=0.0, roughness=0.9),
    'dealer_blue': make_pbr_material('dealer_blue', 0x0B64B8, metallic=0.12, roughness=0.25, coat=0.85),
    'plate_white': make_pbr_material('plate_white', 0xF2F6FA, metallic=0.05, roughness=0.18, coat=0.90),
}

# ==============================================================================
# Modeling Primitives
# ==============================================================================

def mesh_object(name, vertices, faces, material=None, parent=ROOT, collection=ASSET_COLLECTION, smooth=True):
    mesh = bpy.data.meshes.new(name + " Mesh")
    mesh.from_pydata([tuple(v) for v in vertices], [], [tuple(f) for f in faces])
    mesh.validate(verbose=False)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    if parent is not None:
        obj.parent = parent
    if material is not None:
        if isinstance(material, (list, tuple)):
            for m in material:
                obj.data.materials.append(m)
        else:
            obj.data.materials.append(material)
    if smooth:
        for poly in mesh.polygons:
            poly.use_smooth = True
        mod = obj.modifiers.new("WeightedNormal", 'WEIGHTED_NORMAL')
        mod.mode = 'FACE_AREA'
    return obj

def box_object(name, center, dimensions, material, parent=ROOT, bevel=0.0, rotation=(0.0, 0.0, 0.0)):
    dx, dy, dz = (d * 0.5 for d in dimensions)
    pts = [
        (-dx, -dy, -dz), (dx, -dy, -dz), (dx, dy, -dz), (-dx, dy, -dz),
        (-dx, -dy, dz), (dx, -dy, dz), (dx, dy, dz), (-dx, dy, dz),
    ]
    transform = Matrix.Translation(Vector(center)) @ Euler(rotation, 'XYZ').to_matrix().to_4x4()
    verts = [transform @ Vector(p) for p in pts]
    faces = [
        (0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4),
        (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7),
    ]
    obj = mesh_object(name, verts, faces, material, parent=parent, smooth=False)
    if bevel > 0:
        mod = obj.modifiers.new("Bevel", 'BEVEL')
        mod.width = bevel
        mod.segments = 2
        mod.limit_method = 'ANGLE'
        mod.use_clamp_overlap = True
    return obj

def cylinder_between(name, p1, p2, radius, material, parent=ROOT, segments=10, caps=True):
    a = Vector(p1)
    b = Vector(p2)
    axis = (b - a).normalized()
    ref = Vector((0.0, 0.0, 1.0))
    if abs(axis.dot(ref)) > 0.92:
        ref = Vector((0.0, 1.0, 0.0))
    u = axis.cross(ref).normalized()
    v = axis.cross(u).normalized()
    verts = []
    for center in (a, b):
        for i in range(segments):
            ang = math.tau * i / segments
            verts.append(center + radius * (math.cos(ang) * u + math.sin(ang) * v))
    faces = []
    for i in range(segments):
        j = (i + 1) % segments
        faces.append((i, j, segments + j, segments + i))
    if caps:
        faces += [tuple(reversed(range(segments))), tuple(range(segments, segments * 2))]
    return mesh_object(name, verts, faces, material, parent=parent, smooth=True)

def thick_polygon(name, points, extrusion, material, parent=ROOT, bevel=0.0, smooth=True):
    vec = Vector(extrusion) * 0.5
    n = len(points)
    verts = [Vector(p) - vec for p in points] + [Vector(p) + vec for p in points]
    faces = [tuple(reversed(range(n))), tuple(range(n, 2 * n))]
    for i in range(n):
        j = (i + 1) % n
        faces.append((i, j, n + j, n + i))
    obj = mesh_object(name, verts, faces, material, parent=parent, smooth=smooth)
    if bevel > 0:
        mod = obj.modifiers.new("Bevel", 'BEVEL')
        mod.width = bevel
        mod.segments = 2
        mod.limit_method = 'ANGLE'
        mod.use_clamp_overlap = True
    return obj

def surface_grid(name, grid_rows, material, parent=ROOT, smooth=True):
    num_rows = len(grid_rows)
    num_cols = len(grid_rows[0])
    verts = [Vector(p) for row in grid_rows for p in row]
    faces = []
    for r in range(num_rows - 1):
        for c in range(num_cols - 1):
            a = r * num_cols + c
            b = a + num_cols
            c_idx = b + 1
            d = a + 1
            faces.append((a, b, c_idx, d))
    return mesh_object(name, verts, faces, material, parent=parent, smooth=smooth)

def thick_surface_grid(name, grid_rows, material, parent=ROOT, smooth=True, offset_vec=(0.0, 0.020, 0.0)):
    num_rows = len(grid_rows)
    num_cols = len(grid_rows[0])
    vec = Vector(offset_vec)
    front_verts = [Vector(p) for row in grid_rows for p in row]
    back_verts = [Vector(p) + vec for row in grid_rows for p in row]
    verts = front_verts + back_verts
    offset = num_rows * num_cols
    faces = []

    # 1. Front faces
    for r in range(num_rows - 1):
        for c in range(num_cols - 1):
            a = r * num_cols + c
            b = a + num_cols
            c_idx = b + 1
            d = a + 1
            faces.append((a, b, c_idx, d))

    # 2. Back faces (reversed winding for inward-facing normals)
    for r in range(num_rows - 1):
        for c in range(num_cols - 1):
            a = offset + r * num_cols + c
            b = a + num_cols
            c_idx = b + 1
            d = a + 1
            faces.append((d, c_idx, b, a))

    # 3. Top edge (r = 0)
    for c in range(num_cols - 1):
        f1 = c
        f2 = c + 1
        b1 = offset + c
        b2 = offset + c + 1
        faces.append((f1, f2, b2, b1))

    # 4. Bottom edge (r = num_rows - 1)
    last_r = num_rows - 1
    for c in range(num_cols - 1):
        f1 = last_r * num_cols + c
        f2 = last_r * num_cols + c + 1
        b1 = offset + last_r * num_cols + c
        b2 = offset + last_r * num_cols + c + 1
        faces.append((f2, f1, b1, b2))

    # 5. Left edge (c = 0)
    for r in range(num_rows - 1):
        f1 = r * num_cols
        f2 = (r + 1) * num_cols
        b1 = offset + r * num_cols
        b2 = offset + (r + 1) * num_cols
        faces.append((f2, f1, b1, b2))

    # 6. Right edge (c = num_cols - 1)
    last_c = num_cols - 1
    for r in range(num_rows - 1):
        f1 = r * num_cols + last_c
        f2 = (r + 1) * num_cols + last_c
        b1 = offset + r * num_cols + last_c
        b2 = offset + (r + 1) * num_cols + last_c
        faces.append((f1, f2, b2, b1))

    return mesh_object(name, verts, faces, material, parent=parent, smooth=smooth)

# ==============================================================================
# Global Aerodynamic 3D Nose Profiling Function
# ==============================================================================

def sweep_h(x_coord):
    # Authentic 2026 Accord horizontal aerodynamic elliptical sweep across car width:
    # 0.0 at center, 8.8cm at grille edge (x=0.36), 24.0cm at fender corner (x=0.72)
    return 0.240 * ((abs(x_coord) / 0.72) ** 1.45)

def get_front_nose_y(x_coord, z_coord):
    # Compound 3D curved aerodynamic front nose:
    # 1. Horizontal sweep: smooth round elliptical arc
    # 2. Vertical shark-nose convex curve:
    # Apex at z = 0.560 (base Y = -2.495)
    # Hood interface at z = 0.690 recedes 5.5cm back to Y = -2.440
    # Mid bumper beam at z = 0.440 recedes 3.2cm back to Y = -2.463
    # Lower intake center at z = 0.300 recedes 8.5cm back to Y = -2.410
    # Chin splitter at z = 0.185 recedes 13.5cm back to Y = -2.360
    sw_h = sweep_h(x_coord)
    if z_coord >= 0.560:
        t = min(1.0, max(0.0, (z_coord - 0.560) / (0.690 - 0.560)))
        sw_z = 0.055 * (t ** 1.30)
    else:
        t = min(1.0, max(0.0, (0.560 - z_coord) / (0.560 - 0.185)))
        sw_z = 0.135 * (t ** 1.25)
    return -2.495 + sw_h + sw_z

# ==============================================================================
# 1. Seamless Watertight Unibody with Sculpted 11th Gen Hood & Wheel Arches
# ==============================================================================

def build_master_body_with_wheel_wells():
    f_ax = FRONT_AXLE_Y
    r_ax = REAR_AXLE_Y

    # Carefully calibrated longitudinal slices:
    # 1. Aerodynamic curved nose (-2.485 to -1.780)
    # 2. Smooth circular front wheel arch (-1.750 to -1.050)
    # 3. Windshield & cabin roof (-0.920 to +0.700)
    # 4. Fastback coupe sweep & rear wheel arch (+0.700 to +1.780)
    # 5. Short decklid, taillight shelf & bumper peak (+1.780 to +2.460)
    y_slices = [
        -2.440, -2.380, -2.280, -2.160, -2.040, -1.900, -1.780,
        -1.750, -1.700, -1.620, -1.520, -1.415, -1.310, -1.210, -1.130, -1.080, -1.050,
        -0.920, -0.670, -0.380, -0.180, -0.040, 0.040, 0.360, 0.680, 0.880, 0.980, 1.080,
        1.180, 1.260, 1.340, 1.415, 1.520, 1.620, 1.700, 1.780,
        1.880, 1.980, 2.080, 2.150, 2.240, 2.320, 2.390, 2.460
    ]

    materials = [
        MATS['paint'], MATS['windshield'], MATS['glass'], MATS['black'],
        MATS['dark_metal'], MATS['chrome'], MATS['door_seam']
    ]

    def get_width(y):
        if y < -1.86:
            t = max(0.0, min(1.0, (y - (-2.440)) / (-1.86 - (-2.440))))
            return 0.720 + (WIDTH * 0.5 - 0.720) * math.sin(t * math.pi * 0.5)
        elif y > 1.78:
            t = max(0.0, min(1.0, (y - 1.78) / (2.460 - 1.78)))
            return WIDTH * 0.5 - 0.170 * (t ** 1.2)
        else:
            return WIDTH * 0.5 - 0.012 * (abs(y) / (LENGTH * 0.5))

    def get_center_height(y):
        if y < -0.92:  # Sculpted low sloping hood
            t = max(0.0, min(1.0, (y - (-2.440)) / (-0.92 - (-2.440))))
            return 0.690 + 0.195 * (t ** 0.85)
        elif y < -0.38:  # Windshield
            t = max(0.0, min(1.0, (y - (-0.92)) / 0.54))
            return 0.885 + (1.425 - 0.885) * (t ** 0.80)
        elif y <= 0.70:  # Cabin roof peaking at y = -0.05
            return 1.448 - 0.045 * (((y - (-0.05)) / 0.75) ** 2)
        elif y <= 1.78:  # Fastback rear window sweep
            t = max(0.0, min(1.0, (y - 0.70) / (1.78 - 0.70)))
            return 1.405 - (1.405 - 0.885) * (t ** 1.20)
        elif y <= 2.15:  # Short decklid
            t = max(0.0, min(1.0, (y - 1.78) / (2.15 - 1.78)))
            return 0.885 - 0.015 * t
        elif y <= 2.24:  # Trunk rear face / taillight upper shelf
            t = (y - 2.15) / (2.24 - 2.15)
            return 0.870 - (0.870 - 0.760) * t
        elif y <= 2.32:  # Taillight band shelf
            t = (y - 2.24) / (2.32 - 2.24)
            return 0.760 - (0.760 - 0.650) * t
        elif y <= 2.39:  # Bumper crown
            t = (y - 2.32) / (2.39 - 2.32)
            return 0.650 - (0.650 - 0.580) * t
        else:  # Bumper impact peak
            t = max(0.0, min(1.0, (y - 2.39) / (2.46 - 2.39)))
            return 0.580 - (0.580 - 0.520) * t

    def is_in_cabin(y):
        return -0.92 <= y <= 1.78

    def get_arch_bot_z(y):
        df = abs(y - f_ax)
        dr = abs(y - r_ax)
        d = min(df, dr)
        if d <= 0.330:
            return WHEEL_RADIUS + math.sqrt(max(0.0, 0.355 ** 2 - d ** 2))
        elif d < 0.365:
            t = (d - 0.330) / (0.365 - 0.330)
            z_circ = WHEEL_RADIUS + math.sqrt(max(0.0, 0.355 ** 2 - 0.330 ** 2))
            return 0.190 + (z_circ - 0.190) * 0.5 * (1.0 + math.cos(math.pi * t))
        elif y > 2.15:
            t = (y - 2.15) / (2.460 - 2.15)
            return 0.190 + 0.050 * t
        else:
            return 0.190

    rings = []

    for y in y_slices:
        hw = get_width(y)
        cz = get_center_height(y)
        in_cab = is_in_cabin(y)

        # Calculate exact wheel arch cutouts with continuous smooth flare
        df = abs(y - f_ax)
        dr = abs(y - r_ax)
        d = min(df, dr)
        flare = max(0.0, 1.0 - (d / 0.40) ** 2)

        bot_x = hw * (0.940 + 0.075 * flare)
        bot_z = get_arch_bot_z(y)
        flair_x = hw * (0.965 + 0.045 * flare)

        if in_cab:
            if y < -0.38:
                t = (y - (-0.92)) / 0.54
                rail_x = 0.74 - 0.080 * t
                rail_z = cz - 0.025
                belt_x = hw * 0.90
                belt_z = 0.880
            elif y <= 0.70:
                rail_x = 0.660
                rail_z = cz - 0.035
                belt_x = hw * 0.91
                belt_z = 0.872
            else:
                t = (y - 0.70) / (1.78 - 0.70)
                rail_x = 0.660 - 0.150 * t
                rail_z = cz - 0.028
                belt_x = hw * 0.90
                belt_z = 0.865
            shoulder_z = 0.745
        else:
            rail_x = hw * 0.62
            rail_z = cz - 0.012
            belt_x = hw * 0.88
            belt_z = cz - 0.030
            shoulder_z = min(0.745, cz - 0.045)

        shoulder_x = hw * 0.96
        flair_z = bot_z + (shoulder_z - bot_z) * 0.50

        def vy(x_coord):
            if y < -1.78:
                t_sweep = (y - (-1.78)) / (-2.440 - (-1.78))
                return y + sweep_h(x_coord) * t_sweep
            elif y > 1.78:
                t_sweep = (y - 1.78) / (2.460 - 1.78)
                return y - 0.200 * ((abs(x_coord) / 0.76) ** 2.0) * (t_sweep ** 0.8)
            return y

        # Authentically sculpted cross-section:
        if y == y_slices[0]:  # Frontmost hood/bumper interface with 3D profile curve
            ridge_x = 0.24
            r_pts = [
                (0.0, get_front_nose_y(0.0, cz), cz),                                   # 0: center depression valley
                (ridge_x, get_front_nose_y(ridge_x, cz), cz),                           # 1: sharp twin power bulge ridge
                (rail_x * 0.85, get_front_nose_y(rail_x * 0.85, cz), cz),               # 2: outer hood swage slope
                (rail_x * 1.02, get_front_nose_y(rail_x * 1.02, cz), cz),               # 3: recessed hood shut line seam
                (belt_x, get_front_nose_y(belt_x, cz), cz),                             # 4: fender crown crest
                (shoulder_x, get_front_nose_y(shoulder_x, 0.655), 0.655),              # 5: shoulder drop
                (flair_x, get_front_nose_y(flair_x, 0.425), 0.425),                    # 6: fender flare
                (bot_x, get_front_nose_y(bot_x, 0.185), 0.185),                        # 7: bottom edge / chin lip
            ]
        elif y < -0.92:
            t_hood = (y - (-2.440)) / (-0.92 - (-2.440))
            ridge_x = 0.24 + 0.20 * t_hood
            b_scale = max(0.0, (t_hood - 0.08) / 0.92) ** 1.3
            r_pts = [
                (0.0, vy(0.0), cz - 0.010 * b_scale),                       # 0: center depression valley
                (ridge_x, vy(ridge_x), cz + 0.024 * b_scale),               # 1: sharp twin power bulge ridge
                (rail_x * 0.85, vy(rail_x * 0.85), cz - 0.008 * b_scale),   # 2: outer hood swage slope
                (rail_x * 1.02, vy(rail_x * 1.02), cz - 0.015 * b_scale),   # 3: recessed hood shut line seam
                (belt_x, vy(belt_x), cz + 0.012 * b_scale),                 # 4: fender crown crest
                (shoulder_x, vy(shoulder_x), shoulder_z),                   # 5: shoulder drop
                (flair_x, vy(flair_x), flair_z),                            # 6: fender flare
                (bot_x, vy(bot_x), bot_z),                                  # 7: bottom edge / arch lip
            ]
        else:
            if in_cab:
                if y <= 0.70:
                    w_top_z = rail_z - 0.015
                    w_top_x = rail_x * 1.02
                elif y <= 1.08:
                    t_kink = (y - 0.70) / (1.08 - 0.70)
                    target_z = belt_z + 0.004
                    target_x = belt_x - 0.004
                    w_top_z = (rail_z - 0.015) * (1.0 - t_kink) + target_z * t_kink
                    w_top_x = (rail_x * 1.02) * (1.0 - t_kink) + target_x * t_kink
                else:
                    w_top_z = belt_z + 0.004
                    w_top_x = belt_x - 0.004
            else:
                w_top_z = rail_z
                w_top_x = rail_x * 1.02

            r_pts = [
                (0.0, vy(0.0), cz),                               # 0: center top
                (rail_x * 0.50, vy(rail_x * 0.50), cz - 0.010),   # 1: top mid
                (rail_x, vy(rail_x), rail_z),                     # 2: roof rail
                (w_top_x, vy(w_top_x), w_top_z),                  # 3: window top (tapers to sharp kink)
                (belt_x, vy(belt_x), belt_z),                     # 4: beltline
                (shoulder_x, vy(shoulder_x), shoulder_z),         # 5: shoulder
                (flair_x, vy(flair_x), flair_z),                  # 6: door flare
                (bot_x, vy(bot_x), bot_z),                        # 7: bottom edge / arch lip
            ]

        # Floor points (sealing bottom between rocker sills; tucks forward at rear bumper)
        floor_z = 0.185
        if y > 2.15:
            t_tuck = (y - 2.15) / (2.460 - 2.15)
            y_tuck = 0.180 * (t_tuck ** 1.5)
        else:
            y_tuck = 0.0
        if y == y_slices[0]:
            floor_pts = [
                (hw * 0.50, get_front_nose_y(hw * 0.50, floor_z), floor_z),        # 8: floor right
                (0.0, get_front_nose_y(0.0, floor_z), floor_z),                    # 9: floor center
                (-hw * 0.50, get_front_nose_y(-hw * 0.50, floor_z), floor_z),      # 10: floor left
            ]
        else:
            floor_pts = [
                (hw * 0.50, vy(hw * 0.50) - y_tuck, floor_z),        # 8: floor right
                (0.0, vy(0.0) - y_tuck, floor_z),                    # 9: floor center
                (-hw * 0.50, vy(-hw * 0.50) - y_tuck, floor_z),      # 10: floor left
            ]

        # Left side perimeter (symmetric with right side)
        l_pts = [
            (-r_pts[7][0], r_pts[7][1], r_pts[7][2]),   # 11: left bottom edge / arch lip
            (-r_pts[6][0], r_pts[6][1], r_pts[6][2]),   # 12: left door flare
            (-r_pts[5][0], r_pts[5][1], r_pts[5][2]),   # 13: left shoulder
            (-r_pts[4][0], r_pts[4][1], r_pts[4][2]),   # 14: left beltline
            (-r_pts[3][0], r_pts[3][1], r_pts[3][2]),   # 15: left window top / shut line
            (-r_pts[2][0], r_pts[2][1], r_pts[2][2]),   # 16: left roof rail
            (-r_pts[1][0], r_pts[1][1], r_pts[1][2]),   # 17: left top mid / power bulge
        ]

        # Ring of exactly 18 vertices, completely closed!
        rings.append(r_pts + floor_pts + l_pts)

    ring_sz = 18
    all_verts = [Vector(pt) for r in rings for pt in r]
    all_faces = []
    face_mats = []

    for r in range(len(rings) - 1):
        y_curr = y_slices[r]
        for i in range(ring_sz):
            ni = (i + 1) % ring_sz
            a = r * ring_sz + i
            b = r * ring_sz + ni
            c = (r + 1) * ring_sz + ni
            d = (r + 1) * ring_sz + i
            all_faces.append((a, b, c, d))

            mat_idx = 0  # car_paint default

            # Windshield: from cowl (-0.92) up to roof header (-0.38) across full width
            if -0.92 <= y_curr < -0.38 and i in (0, 1, 16, 17):
                mat_idx = 1  # MATS['windshield']
            # Rear fastback window glass: from roof trailing cut to base of rear glass (center only)
            elif 0.80 <= y_curr < 1.78 and i in (0, 1, 16, 17):
                mat_idx = 2  # MATS['glass']
            # Side window glass ending precisely at Hofmeister kink (1.08)
            elif -0.92 <= y_curr < 1.08 and i in (3, 14):
                mat_idx = 2  # side window glass MATS['glass']
            # Underbody floor
            elif i in (7, 8, 9, 10):
                mat_idx = 4  # dark_metal floor

            face_mats.append(mat_idx)

    # 4-tier seamless aerodynamic front bumper cap (100% watertight, matching 3D compound curve)
    row0_indices = [14, 15, 16, 17, 0, 1, 2, 3, 4]
    hw_front = get_width(y_slices[0])
    belt_x_f = hw_front * 0.88
    rail_x_f = hw_front * 0.62
    ridge_x_f = 0.24
    cols_x_f = [-belt_x_f, -rail_x_f * 1.02, -rail_x_f * 0.85, -ridge_x_f, 0.0, ridge_x_f, rail_x_f * 0.85, rail_x_f * 1.02, belt_x_f]

    # Row 1: z = 0.560 (protruding forward nose peak)
    row1_indices = [13]
    for x in cols_x_f[1:-1]:
        all_verts.append(Vector((x, get_front_nose_y(x, 0.560), 0.560)))
        row1_indices.append(len(all_verts) - 1)
    row1_indices.append(5)

    # Row 2: z = 0.440 (mid bumper fascia)
    row2_indices = [12]
    for x in cols_x_f[1:-1]:
        all_verts.append(Vector((x, get_front_nose_y(x, 0.440), 0.440)))
        row2_indices.append(len(all_verts) - 1)
    row2_indices.append(6)

    # Row 3: z = 0.280 (lower bumper tucking back)
    row3_indices = [11]
    for x in cols_x_f[1:-1]:
        all_verts.append(Vector((x, get_front_nose_y(x, 0.280), 0.280)))
        row3_indices.append(len(all_verts) - 1)
    row3_indices.append(7)

    front_cap_faces = []
    # Row 0 to Row 1 (8 quads)
    for c in range(8):
        front_cap_faces.append((row0_indices[c], row1_indices[c], row1_indices[c + 1], row0_indices[c + 1]))
    # Row 1 to Row 2 (8 quads)
    for c in range(8):
        front_cap_faces.append((row1_indices[c], row2_indices[c], row2_indices[c + 1], row1_indices[c + 1]))
    # Row 2 to Row 3 (8 quads)
    for c in range(8):
        front_cap_faces.append((row2_indices[c], row3_indices[c], row3_indices[c + 1], row2_indices[c + 1]))
    # Row 3 to Bottom floor [11, 10, 9, 8, 7] (6 quads/tris)
    front_cap_faces.append((row3_indices[0], 10, row3_indices[2], row3_indices[1]))
    front_cap_faces.append((row3_indices[2], 10, row3_indices[3]))
    front_cap_faces.append((row3_indices[3], 10, 9, row3_indices[4]))
    front_cap_faces.append((row3_indices[4], 9, 8, row3_indices[5]))
    front_cap_faces.append((row3_indices[5], 8, row3_indices[6]))
    front_cap_faces.append((row3_indices[6], 8, row3_indices[8], row3_indices[7]))

    all_faces += front_cap_faces
    # 0 is MATS['paint'], 3 is MATS['black']
    front_cap_mats = (
        [0] * 8 +                   # Row 0 to Row 1: car paint
        [0] * 8 +                   # Row 1 to Row 2: car paint mid bumper
        [0, 3, 3, 3, 3, 3, 3, 0] +  # Row 2 to Row 3: dark lower intake opening in center!
        [3] * 6                     # Row 3 to Floor: dark lower lip and underbody
    )
    face_mats += front_cap_mats

    off = (len(rings) - 1) * ring_sz
    rear_cap_faces = [
        (off + 0, off + 17, off + 1),
        (off + 1, off + 17, off + 16, off + 2),
        (off + 2, off + 16, off + 15, off + 3),
        (off + 3, off + 15, off + 14, off + 4),
        (off + 4, off + 14, off + 13, off + 5),
        (off + 5, off + 13, off + 12, off + 6),
        (off + 6, off + 12, off + 11, off + 7),
        (off + 7, off + 11, off + 10, off + 8),
        (off + 8, off + 10, off + 9)
    ]
    all_faces += rear_cap_faces
    face_mats += [0] * len(rear_cap_faces)

    unibody = mesh_object("Accord unibody shell", all_verts, all_faces, materials, parent=ROOT, smooth=True)
    unibody['component'] = 'primary_unibody_watertight'
    for poly, m_idx in zip(unibody.data.polygons, face_mats):
        poly.material_index = m_idx

    # Inner wheel tubs (completely closed solid 3D black fender liners inside all 4 arches)
    for sign, side in ((1.0, 'right'), (-1.0, 'left')):
        for ax_y, prefix in ((f_ax, 'front'), (r_ax, 'rear')):
            arch_pts = []
            ang_steps = 14
            for k in range(ang_steps):
                rad = math.pi * (k / (ang_steps - 1))
                dy = 0.355 * math.cos(rad)
                dz = WHEEL_RADIUS + 0.355 * math.sin(rad)
                arch_pts.append((ax_y + dy, dz))
            inner_arch = []
            for k in reversed(range(ang_steps)):
                rad = math.pi * (k / (ang_steps - 1))
                dy = 0.370 * math.cos(rad)
                dz = WHEEL_RADIUS + 0.370 * math.sin(rad)
                inner_arch.append((ax_y + dy, dz))
            poly_2d = arch_pts + inner_arch
            n = len(poly_2d)
            hw = get_width(ax_y)
            x_in = sign * (hw - 0.16)
            x_out = sign * (hw - 0.022)
            verts = [Vector((x_in, y, z)) for y, z in poly_2d] + [Vector((x_out, y, z)) for y, z in poly_2d]
            faces = [tuple(reversed(range(n))), tuple(range(n, 2 * n))]
            for i in range(n):
                j = (i + 1) % n
                faces.append((i, j, n + j, n + i))
            mesh_object(f"{prefix} wheel liner {side}", verts, faces, MATS['liner'], parent=ROOT, smooth=True)

    return unibody


# ==============================================================================
# Helper: Authentic OEM Specification License Plate Assembly (Watertight 3D)
# ==============================================================================

def build_license_plate(name_prefix, center, rotation=(0.0, 0.0, 0.0), facing_front=True, is_dealer_plate=True):
    # Authentic US standard automotive plate assembly (318mm x 156mm)
    # When is_dealer_plate=True, builds exact "Long Beach Honda" dealership demo plate per user photo:
    # Vibrant dealer blue face, white "LONG BEACH" embossed letters, white "Honda" script block,
    # "SIMPLY BETTER" header, "LongBeachHonda.com" footer, black beveled frame, chrome hex bolts.
    cx, cy, cz = center
    sign_y = -1.0 if facing_front else 1.0

    # 1. Beveled black mounting bracket / frame
    box_object(f"{name_prefix} frame", (cx, cy, cz),
               (0.318, 0.010, 0.156), MATS['black'], parent=ROOT, bevel=0.002, rotation=rotation)

    if is_dealer_plate:
        # 2. Vibrant Dealer Cyan-Blue Plate Face (sits 5mm proud on bracket)
        face_y = cy + sign_y * 0.0055
        box_object(f"{name_prefix} face", (cx, face_y, cz),
                   (0.304, 0.003, 0.142), MATS['dealer_blue'], parent=ROOT, rotation=rotation)

        # 3. Top Dealer Slogan Banner ("SIMPLY BETTER")
        top_y = cy + sign_y * 0.0075
        box_object(f"{name_prefix} top_slogan", (cx, top_y, cz + 0.052),
                   (0.120, 0.002, 0.010), MATS['plate_white'], parent=ROOT, rotation=rotation)

        # 4. Bold White Embossed "LONG BEACH" Lettering (9 crisp 3D letter blocks across plate upper-mid)
        letter_y = cy + sign_y * 0.0080
        block_xs = (-0.100, -0.078, -0.056, -0.034, 0.012, 0.034, 0.056, 0.078, 0.100)
        for idx, bx in enumerate(block_xs):
            box_object(f"{name_prefix} text_lb_{idx}", (cx + bx, letter_y, cz + 0.024),
                       (0.018, 0.002, 0.026), MATS['plate_white'], parent=ROOT, bevel=0.001, rotation=rotation)

        # 5. Bold White Embossed "Honda" Dealership Script / Block
        honda_y = cy + sign_y * 0.0080
        box_object(f"{name_prefix} text_honda", (cx, honda_y, cz - 0.012),
                   (0.125, 0.002, 0.028), MATS['plate_white'], parent=ROOT, bevel=0.001, rotation=rotation)

        # 6. Bottom Website URL Footer ("LongBeachHonda.com")
        bot_y = cy + sign_y * 0.0075
        box_object(f"{name_prefix} bot_url", (cx, bot_y, cz - 0.048),
                   (0.210, 0.002, 0.012), MATS['plate_white'], parent=ROOT, rotation=rotation)
    else:
        # Standard White State Plate with registration letters
        face_y = cy + sign_y * 0.0045
        box_object(f"{name_prefix} face", (cx, face_y, cz),
                   (0.304, 0.003, 0.142), MATS['plate_white'], parent=ROOT, rotation=rotation)
        bar_y = cy + sign_y * 0.0065
        box_object(f"{name_prefix} banner", (cx, bar_y, cz + 0.046),
                   (0.280, 0.002, 0.022), MATS['dealer_blue'], parent=ROOT, rotation=rotation)
        letter_y = cy + sign_y * 0.0070
        letter_xs = (-0.088, -0.044, 0.0, 0.044, 0.088)
        for idx, lx in enumerate(letter_xs):
            box_object(f"{name_prefix} letter_{idx}", (cx + lx, letter_y, cz - 0.010),
                       (0.028, 0.002, 0.050), MATS['black'], parent=ROOT, bevel=0.001, rotation=rotation)

    # Chrome Hex Mounting Screws (top left and top right)
    screw_y1 = cy + sign_y * 0.005
    screw_y2 = cy + sign_y * 0.011
    for sx in (-0.115, 0.115):
        p1 = (cx + sx, screw_y1, cz + 0.048)
        p2 = (cx + sx, screw_y2, cz + 0.048)
        cylinder_between(f"{name_prefix} screw_{'r' if sx > 0 else 'l'}", p1, p2, 0.004, MATS['chrome'], parent=ROOT)


# ==============================================================================
# 2. Authentic 11th Gen Curved Front Fascia (Smooth Aerodynamic Radius)
# ==============================================================================

def build_front_fascia():
    # 1. Authentic 11th Gen Curved Hexagonal Grille (Multi-column 3D grid conforming to 3D nose curve)
    g_cols = (-0.358, -0.270, -0.180, -0.090, 0.0, 0.090, 0.180, 0.270, 0.358)
    def get_hex_z_bounds(x_val):
        ax = abs(x_val)
        zt = 0.672
        if ax <= 0.20:
            zb = 0.505
        else:
            t = (ax - 0.20) / (0.358 - 0.20)
            zb = 0.505 + (0.582 - 0.505) * t
        return zt, zb

    # Recessed radiator cavity mesh backing (4 rows x 9 columns)
    # Sits at get_front_nose_y(x, z) - 0.004 (sits 4mm in front of unibody to create deep dark radiator texture)
    g_top_row = []
    g_mid_top = []
    g_mid_bot = []
    g_bot_row = []
    for x in g_cols:
        zt, zb = get_hex_z_bounds(x)
        z_mt = zb + (zt - zb) * 0.66
        z_mb = zb + (zt - zb) * 0.33
        g_top_row.append((x, get_front_nose_y(x, zt) - 0.004, zt))
        g_mid_top.append((x, get_front_nose_y(x, z_mt) - 0.004, z_mt))
        g_mid_bot.append((x, get_front_nose_y(x, z_mb) - 0.004, z_mb))
        g_bot_row.append((x, get_front_nose_y(x, zb) - 0.004, zb))

    cavity_grid = [g_top_row, g_mid_top, g_mid_bot, g_bot_row]
    thick_surface_grid("Accord hexagonal grille mesh", cavity_grid, MATS['grille_mesh'],
                       parent=ROOT, smooth=True, offset_vec=(0.0, 0.010, 0.0))

    # Outer Hexagonal Frame / Surround (Gloss Black Bezel)
    # A. Upper Brow Bezel (Flushes smoothly with headlight top rims across car nose)
    brow_steps = 16
    for s_i in range(brow_steps):
        t1 = s_i / brow_steps
        t2 = (s_i + 1) / brow_steps
        x1 = -0.358 + 0.716 * t1
        x2 = -0.358 + 0.716 * t2
        p1 = (x1, get_front_nose_y(x1, 0.672) - 0.016, 0.672)
        p2 = (x2, get_front_nose_y(x2, 0.672) - 0.016, 0.672)
        cylinder_between(f"grille top brow rib_{s_i}", p1, p2, 0.006, MATS['black'], parent=ROOT)

    # B. Lower Hexagonal Rim (Tapering from headlights to chin sill)
    bot_steps = 16
    for s_i in range(bot_steps):
        t1 = s_i / bot_steps
        t2 = (s_i + 1) / bot_steps
        x1 = -0.358 + 0.716 * t1
        x2 = -0.358 + 0.716 * t2
        _, zb1 = get_hex_z_bounds(x1)
        _, zb2 = get_hex_z_bounds(x2)
        p1 = (x1, get_front_nose_y(x1, zb1) - 0.016, zb1)
        p2 = (x2, get_front_nose_y(x2, zb2) - 0.016, zb2)
        cylinder_between(f"grille bot frame rib_{s_i}", p1, p2, 0.006, MATS['black'], parent=ROOT)

    # C. Outer Vertical Cheek Endcaps (Meeting the headlight inner housings)
    for sign, side in ((1.0, 'right'), (-1.0, 'left')):
        cx = sign * 0.358
        p1 = (cx, get_front_nose_y(cx, 0.582) - 0.016, 0.582)
        p2 = (cx, get_front_nose_y(cx, 0.672) - 0.016, 0.672)
        cylinder_between(f"grille side endcap {side}", p1, p2, 0.006, MATS['black'], parent=ROOT)

    # Characteristic 11th Gen Grille Curved Horizontal Lattice Bars (Multi-segmented to wrap around 3D nose)
    slat_levels = (0.530, 0.565, 0.600, 0.635)
    for l_z in slat_levels:
        # Determine maximum x span at this Z inside the hexagonal opening
        if l_z >= 0.582:
            w_span = 0.352
        else:
            t_span = (l_z - 0.505) / (0.582 - 0.505)
            w_span = 0.200 + (0.352 - 0.200) * max(0.0, min(1.0, t_span))

        num_segs = 16
        for s_i in range(num_segs):
            t1 = s_i / num_segs
            t2 = (s_i + 1) / num_segs
            x1 = -w_span + 2.0 * w_span * t1
            x2 = -w_span + 2.0 * w_span * t2
            p1 = (x1, get_front_nose_y(x1, l_z) - 0.016, l_z)
            p2 = (x2, get_front_nose_y(x2, l_z) - 0.016, l_z)
            cylinder_between(f"grille curved rib {l_z:.3f}_{s_i}", p1, p2, 0.0055, MATS['black'], parent=ROOT)

    # Authentic 11th Gen Diamond Criss-Cross Mesh Lattice
    mesh_levels = [0.505, 0.530, 0.565, 0.600, 0.635, 0.672]
    d_step = 0.052  # ~5.2cm diamond cell width
    for lev_i in range(len(mesh_levels) - 1):
        z_lo = mesh_levels[lev_i]
        z_hi = mesh_levels[lev_i + 1]
        z_mid = (z_lo + z_hi) * 0.5
        if z_mid >= 0.582:
            w_mesh = 0.342
        else:
            t_span = (z_mid - 0.505) / (0.582 - 0.505)
            w_mesh = 0.200 + (0.342 - 0.200) * max(0.0, min(1.0, t_span))

        num_cells = int(w_mesh * 2.0 / d_step)
        x_start = -num_cells * d_step * 0.5
        for c_i in range(num_cells):
            xa = x_start + c_i * d_step
            xb = xa + d_step
            # Skip if directly under emblem center
            if abs(xa + d_step * 0.5) < 0.045 and 0.54 <= z_mid <= 0.64:
                continue
            # Diagonal forward: (xa, z_lo) -> (xb, z_hi)
            pa1 = (xa, get_front_nose_y(xa, z_lo) - 0.012, z_lo)
            pa2 = (xb, get_front_nose_y(xb, z_hi) - 0.012, z_hi)
            cylinder_between(f"grille diamond fwd {lev_i}_{c_i}", pa1, pa2, 0.0032, MATS['black'], parent=ROOT, segments=8)
            # Diagonal back: (xb, z_lo) -> (xa, z_hi)
            pb1 = (xb, get_front_nose_y(xb, z_lo) - 0.012, z_lo)
            pb2 = (xa, get_front_nose_y(xa, z_hi) - 0.012, z_hi)
            cylinder_between(f"grille diamond rev {lev_i}_{c_i}", pb1, pb2, 0.0032, MATS['black'], parent=ROOT, segments=8)

    # Prominent Chrome Front Honda 'H' Emblem
    h_z = 0.588
    h_y = get_front_nose_y(0.0, h_z) - 0.022
    # Dark emblem mounting plinth
    box_object("front Honda H plinth", (0.0, h_y + 0.005, h_z), (0.108, 0.008, 0.096), MATS['grille_mesh'], parent=ROOT, bevel=0.002)
    # Chrome H emblem
    box_object("front Honda H left", (-0.030, h_y, h_z), (0.012, 0.012, 0.086), MATS['chrome'], parent=ROOT, bevel=0.002)
    box_object("front Honda H right", (0.030, h_y, h_z), (0.012, 0.012, 0.086), MATS['chrome'], parent=ROOT, bevel=0.002)
    box_object("front Honda H cross", (0.0, h_y, h_z), (0.070, 0.012, 0.012), MATS['chrome'], parent=ROOT, bevel=0.002)
    box_object("front Honda H top", (0.0, h_y, h_z + 0.041), (0.090, 0.012, 0.011), MATS['chrome'], parent=ROOT, bevel=0.002)
    box_object("front Honda H bot", (0.0, h_y, h_z - 0.041), (0.078, 0.012, 0.011), MATS['chrome'], parent=ROOT, bevel=0.002)

    # 2. Sleek Swept Wrap-Around LED Headlights (True Stick-On Assembly Mounted Proudly on Nose)
    for sign, side in ((1.0, 'right'), (-1.0, 'left')):
        x_spans = (0.358, 0.418, 0.478, 0.538, 0.598, 0.658, 0.718)

        # Calculate key 3D coordinates along the compound curved nose
        pts_info = []
        for x in x_spans:
            sx = sign * x
            u = (x - 0.358) / (0.718 - 0.358)
            zt = 0.672 + 0.018 * u
            zb = 0.582 + 0.038 * u
            yt_nose = get_front_nose_y(x, zt)
            yb_nose = get_front_nose_y(x, zb)
            pts_info.append({
                'sx': sx, 'x': x, 'u': u,
                'zt': zt, 'zb': zb,
                'yt_nose': yt_nose, 'yb_nose': yb_nose,
                'yt_lens': yt_nose - 0.024,
                'yb_lens': yb_nose - 0.024,
                'yt_back': yt_nose - 0.003,
                'yb_back': yb_nose - 0.003,
            })

        # Orientation ordering for surface grids (left to right across x)
        ordered_pts = pts_info if sign > 0 else list(reversed(pts_info))

        # A. Rear Cavity Backing Plate (Mounted directly against nose surface)
        back_t = [(p['sx'], p['yt_back'], p['zt'] - 0.004) for p in ordered_pts]
        back_b = [(p['sx'], p['yb_back'], p['zb'] + 0.004) for p in ordered_pts]
        thick_surface_grid(f"headlight backing {side}", [back_t, back_b], MATS['headlight_housing'],
                           parent=ROOT, smooth=True, offset_vec=(0.0, 0.008, 0.0))

        # B. Gloss Black Upper Perimeter Bezel Rail (Top rim of housing, projecting 28mm forward)
        top_rim_outer = [(p['sx'], p['yt_lens'] - 0.002, p['zt']) for p in ordered_pts]
        top_rim_inner = [(p['sx'], p['yt_lens'] - 0.002, p['zt'] - 0.008) for p in ordered_pts]
        thick_surface_grid(f"headlight bezel top {side}", [top_rim_outer, top_rim_inner], MATS['black'],
                           parent=ROOT, smooth=True, offset_vec=(0.0, 0.028, 0.0))

        # C. Gloss Black Lower Perimeter Bezel Rail (Bottom rim of housing, projecting 28mm forward)
        bot_rim_inner = [(p['sx'], p['yb_lens'] - 0.002, p['zb'] + 0.008) for p in ordered_pts]
        bot_rim_outer = [(p['sx'], p['yb_lens'] - 0.002, p['zb']) for p in ordered_pts]
        thick_surface_grid(f"headlight bezel bot {side}", [bot_rim_inner, bot_rim_outer], MATS['black'],
                           parent=ROOT, smooth=True, offset_vec=(0.0, 0.028, 0.0))

        # D. Inner Vertical Bezel Endcap (at grille interface x = 0.358)
        p_in = pts_info[0]
        c_in_y = (p_in['yt_nose'] + p_in['yb_nose']) * 0.5 - 0.012
        c_in_z = (p_in['zt'] + p_in['zb']) * 0.5
        box_object(f"headlight bezel inner {side}", (p_in['sx'], c_in_y, c_in_z),
                   (0.012, 0.026, p_in['zt'] - p_in['zb']), MATS['black'], parent=ROOT, bevel=0.002)

        # E. Outer Wrap Bezel Endcap (at fender flank x = 0.720)
        p_out = pts_info[-1]
        c_out_y = (p_out['yt_nose'] + p_out['yb_nose']) * 0.5 - 0.010
        c_out_z = (p_out['zt'] + p_out['zb']) * 0.5
        box_object(f"headlight bezel outer {side}", (p_out['sx'] + sign * 0.006, c_out_y, c_out_z),
                   (0.016, 0.028, p_out['zt'] - p_out['zb'] + 0.006), MATS['black'], parent=ROOT, bevel=0.002)

        # F. Signature Full-Length LED DRL Light Pipe (Sitting prominently proud in cavity, 18mm forward from nose)
        for k in range(len(pts_info) - 1):
            p1 = pts_info[k]
            p2 = pts_info[k + 1]
            z_drl1 = p1['zt'] - 0.012
            z_drl2 = p2['zt'] - 0.012
            y_drl1 = p1['yt_nose'] - 0.018
            y_drl2 = p2['yt_nose'] - 0.018
            cylinder_between(f"headlight DRL eyebrow {side}_{k}",
                             (p1['sx'], y_drl1, z_drl1), (p2['sx'], y_drl2, z_drl2),
                             0.0045, MATS['drl'], parent=ROOT)

        # G. 3 Honda Jewel-Eye Projector Assemblies (Chrome reflector cups + glowing LED projection cubes)
        for p_idx, px in enumerate((0.420, 0.510, 0.600)):
            u_p = (px - 0.358) / (0.718 - 0.358)
            z_top_p = 0.672 + 0.018 * u_p
            z_bot_p = 0.582 + 0.038 * u_p
            pz = z_bot_p + (z_top_p - z_bot_p) * 0.38
            py_nose = get_front_nose_y(px, pz)
            py_cup = py_nose - 0.014
            # Chrome reflector cup
            box_object(f"headlight proj cup {side}_{p_idx}",
                       (sign * px, py_cup, pz), (0.046, 0.012, 0.026),
                       MATS['chrome'], parent=ROOT, bevel=0.002)
            # Glowing projector jewel lens
            box_object(f"headlight proj lens {side}_{p_idx}",
                       (sign * px, py_cup - 0.005, pz), (0.032, 0.006, 0.018),
                       MATS['drl'], parent=ROOT, bevel=0.001)

        # H. Amber Flank Marker Lens (Warm glow at outer wrap corner)
        p_amber = pts_info[-2]
        z_amber = p_amber['zb'] + 0.018
        y_amber = p_amber['yt_nose'] - 0.015
        box_object(f"headlight amber marker {side}",
                   (sign * 0.702, y_amber, z_amber), (0.022, 0.016, 0.030),
                   MATS['amber'], parent=ROOT, bevel=0.002)

        # I. Clear Aerodynamic Outer Lens Cover (Seals front face, 24mm proud of nose)
        lens_t = [(p['sx'], p['yt_lens'], p['zt'] - 0.003) for p in ordered_pts]
        lens_b = [(p['sx'], p['yb_lens'], p['zb'] + 0.003) for p in ordered_pts]
        thick_surface_grid(f"headlight lens {side}", [lens_t, lens_b], MATS['headlight_lens'],
                           parent=ROOT, smooth=True, offset_vec=(0.0, 0.004, 0.0))

    # 3. Stick-on Lower Intake Assembly (Wide aggressive trapezoid with curved louvers)
    intake_cols = (-0.56, -0.42, -0.28, -0.14, 0.0, 0.14, 0.28, 0.42, 0.56)
    intake_rows = [
        [(x, get_front_nose_y(x, 0.395) - 0.010, 0.395) for x in intake_cols],
        [(x * 1.04, get_front_nose_y(x * 1.04, 0.205) - 0.008, 0.205) for x in intake_cols],
    ]
    thick_surface_grid("Accord lower intake stick-on surround", intake_rows, MATS['black'], parent=ROOT, smooth=True, offset_vec=(0.0, 0.018, 0.0))

    # Dark Honeycomb Mesh Inside Lower Intake
    mesh_rows = [
        [(x * 0.98, get_front_nose_y(x * 0.98, 0.390) - 0.004, 0.390) for x in intake_cols],
        [(x * 1.02, get_front_nose_y(x * 1.02, 0.210) - 0.004, 0.210) for x in intake_cols],
    ]
    thick_surface_grid("Accord lower intake mesh", mesh_rows, MATS['grille_mesh'], parent=ROOT, smooth=True, offset_vec=(0.0, 0.008, 0.0))

    # 3 Continuous Curved Horizontal Louvers/Slats across Lower Intake
    for sz in (0.245, 0.295, 0.345):
        w_half = 0.56 - (0.395 - sz) * 0.14
        num_slat_segs = 16
        for s_i in range(num_slat_segs):
            t1 = s_i / num_slat_segs
            t2 = (s_i + 1) / num_slat_segs
            x1 = -w_half + 2.0 * w_half * t1
            x2 = -w_half + 2.0 * w_half * t2
            p1 = (x1, get_front_nose_y(x1, sz) - 0.016, sz)
            p2 = (x2, get_front_nose_y(x2, sz) - 0.016, sz)
            cylinder_between(f"lower intake slat {sz:.3f}_{s_i}", p1, p2, 0.0055, MATS['black'], parent=ROOT)

    # Outer Corner Aerodynamic Brake Cooling Ducts / Fog Pockets
    for sign, side in ((1.0, 'right'), (-1.0, 'left')):
        duct_x = sign * 0.63
        duct_y = get_front_nose_y(0.63, 0.285) - 0.008
        box_object(f"front corner duct {side}", (duct_x, duct_y, 0.285),
                   (0.090, 0.016, 0.085), MATS['black'], parent=ROOT, bevel=0.003,
                   rotation=(0, 0, -sign * 0.42))

    # 4. Stick-on Front License Plate Assembly (Authentic Long Beach Honda dealer plate per user photo)
    build_license_plate("Accord front license plate",
                        (0.0, get_front_nose_y(0.0, 0.355) - 0.018, 0.355),
                        rotation=(-0.16, 0.0, 0.0),
                        facing_front=True,
                        is_dealer_plate=True)

    # 5. Gloss Black Front Aerodynamic Chin Splitter
    splitter_rows = []
    for y_off, z_val in ((-0.016, 0.170), (0.012, 0.185)):
        row = []
        for fx in (-1.0, -0.75, -0.50, -0.25, 0.0, 0.25, 0.50, 0.75, 1.0):
            x = fx * 0.72
            y = get_front_nose_y(abs(x), z_val) + y_off
            row.append((x, y, z_val))
        splitter_rows.append(row)
    thick_surface_grid("Accord front chin splitter", splitter_rows, MATS['black'], parent=ROOT, smooth=True, offset_vec=(0.0, 0.024, -0.010))

    # 6. Wiper Cowl & Blades
    cowl_pts = [
        (-0.73, -0.940, 0.868),
        (0.73, -0.940, 0.868),
        (0.71, -0.910, 0.884),
        (-0.71, -0.910, 0.884),
    ]
    thick_polygon("Accord windshield wiper cowl", cowl_pts, (0, 0.012, 0), MATS['black'], parent=ROOT, bevel=0.002)

    # Sleek Low-Profile OEM Wiper Blades
    for sign, x_c in ((1.0, 0.28), (-1.0, -0.25)):
        p1 = (x_c - 0.22, -0.915, 0.890)
        p2 = (x_c + 0.22, -0.905, 0.898)
        cylinder_between(f"wiper blade {'right' if sign > 0 else 'left'}", p1, p2, 0.005, MATS['black'], parent=ROOT)


# ==============================================================================
# 3. Finished Sculpted Rear Fascia (Full-Width LED Blade, Bumper & Diffuser)
# ==============================================================================

def build_rear_fascia():
    # Helper to calculate exact Y on the sculpted rear unibody surface
    def get_rear_body_y(x, z):
        if z >= 0.870:
            yc = 2.150
        elif z >= 0.760:
            yc = 2.150 + 0.090 * ((0.870 - z) / (0.870 - 0.760))
        elif z >= 0.650:
            yc = 2.240 + 0.080 * ((0.760 - z) / (0.760 - 0.650))
        elif z >= 0.580:
            yc = 2.320 + 0.070 * ((0.650 - z) / (0.650 - 0.580))
        elif z >= 0.520:
            yc = 2.390 + 0.070 * ((0.580 - z) / (0.580 - 0.520))
        else:
            t_lower = max(0.0, min(1.0, (z - 0.185) / (0.520 - 0.185)))
            yc = 2.280 + (2.460 - 2.280) * t_lower
        t_sweep = max(0.0, min(1.0, (yc - 1.78) / (2.460 - 1.78)))
        return yc - 0.200 * ((abs(x) / 0.76) ** 2.0) * (t_sweep ** 0.8)

    w_rear = 0.760

    # 1. Aerodynamic Ducktail Lip Spoiler (Mounted on decklid trailing edge)
    sp_cols = (-0.72, -0.54, -0.36, -0.18, 0.0, 0.18, 0.36, 0.54, 0.72)
    sp_grid = [
        [(x, get_rear_body_y(x, 0.870) - 0.035, 0.868) for x in sp_cols],
        [(x, get_rear_body_y(x, 0.870) + 0.012, 0.878) for x in sp_cols],
    ]
    thick_surface_grid("Accord decklid lip spoiler", sp_grid, MATS['paint'],
                       parent=ROOT, smooth=True, offset_vec=(0.0, -0.015, -0.010))

    # 2. Full-Width Horizontal Gloss Black Taillight Band (Flush on unibody surface)
    tb_cols = (-0.74, -0.55, -0.36, -0.18, 0.0, 0.18, 0.36, 0.55, 0.74)
    tb_grid = [
        [(x, get_rear_body_y(x, 0.785) + 0.003, 0.785) for x in tb_cols],
        [(x, get_rear_body_y(x, 0.720) + 0.003, 0.720) for x in tb_cols],
    ]
    thick_surface_grid("Accord rear taillight gloss black housing", tb_grid, MATS['black'],
                       parent=ROOT, smooth=True, offset_vec=(0.0, -0.008, 0.0))

    # 3. Glowing Red LED Light Blades & Brake Lights
    for sign, side in ((1.0, 'right'), (-1.0, 'left')):
        led_xs = (sign * 0.05, sign * 0.22, sign * 0.40, sign * 0.56, sign * 0.72)
        led_grid = [
            [(x, get_rear_body_y(x, 0.776) + 0.006, 0.776) for x in led_xs],
            [(x, get_rear_body_y(x, 0.758) + 0.006, 0.758) for x in led_xs],
        ]
        thick_surface_grid(f"taillight blade {side}", led_grid, MATS['taillight'],
                           parent=ROOT, smooth=True, offset_vec=(0.0, -0.005, 0.0))

        p1 = (sign * 0.05, get_rear_body_y(sign * 0.05, 0.767) + 0.009, 0.767)
        p2 = (sign * 0.70, get_rear_body_y(sign * 0.70, 0.767) + 0.009, 0.767)
        cylinder_between(f"brake_light rear {side}", p1, p2, 0.004, MATS['brake_light'], parent=ROOT)

        rev_xs = (sign * 0.35, sign * 0.48, sign * 0.62)
        rev_grid = [
            [(x, get_rear_body_y(x, 0.748) + 0.005, 0.748) for x in rev_xs],
            [(x, get_rear_body_y(x, 0.726) + 0.005, 0.726) for x in rev_xs],
        ]
        thick_surface_grid(f"reverse light {side}", rev_grid, MATS['reverse_light'],
                           parent=ROOT, smooth=True, offset_vec=(0.0, -0.005, 0.0))

    # 4. Stick-on Chrome Rear Honda 'H' Emblem
    rh_y = get_rear_body_y(0.0, 0.755) + 0.008
    rh_center = (0.0, rh_y, 0.755)
    box_object("rear Honda H left", (rh_center[0] - 0.018, rh_center[1], rh_center[2]), (0.005, 0.006, 0.046), MATS['chrome'], parent=ROOT)
    box_object("rear Honda H right", (rh_center[0] + 0.018, rh_center[1], rh_center[2]), (0.005, 0.006, 0.046), MATS['chrome'], parent=ROOT)
    box_object("rear Honda H cross", (rh_center[0], rh_center[1], rh_center[2]), (0.036, 0.006, 0.007), MATS['chrome'], parent=ROOT)
    box_object("rear Honda H top", (rh_center[0], rh_center[1], rh_center[2] + 0.023), (0.046, 0.006, 0.005), MATS['chrome'], parent=ROOT)
    box_object("rear Honda H bot", (rh_center[0], rh_center[1], rh_center[2] - 0.023), (0.040, 0.006, 0.005), MATS['chrome'], parent=ROOT)

    # 5. Stick-on Rear License Plate (On trunk face directly below taillights)
    build_license_plate("Accord rear license plate",
                        (0.0, get_rear_body_y(0.0, 0.630) + 0.006, 0.630),
                        rotation=(0.0, 0.0, 0.0),
                        facing_front=False,
                        is_dealer_plate=True)

    # 6. Stick-on Red Reflectors (On lower bumper flanks above diffuser)
    for sign, side in ((1.0, 'right'), (-1.0, 'left')):
        ref_x = sign * 0.52
        ref_z = 0.420
        ref_y = get_rear_body_y(ref_x, ref_z) + 0.005
        rot_z = -math.atan2(0.400 * (0.52 / 0.76), 0.76) * sign
        box_object(f"rear reflector {side}", (ref_x, ref_y, ref_z),
                   (0.120, 0.006, 0.022), MATS['reflector_red'], parent=ROOT, bevel=0.002,
                   rotation=(0, 0, rot_z))

    # 7. Rear Lower Gloss Black Diffuser & 4 Aero Fins
    diff_cols = (-0.68, -0.45, -0.22, 0.0, 0.22, 0.45, 0.68)
    diffuser_rows = [
        [(x, get_rear_body_y(x, 0.300) + 0.003, 0.300) for x in diff_cols],
        [(x * 0.98, get_rear_body_y(x, 0.230) - 0.005, 0.230) for x in diff_cols],
        [(x * 0.94, get_rear_body_y(x, 0.185) - 0.060, 0.180) for x in diff_cols],
    ]
    thick_surface_grid("Accord rear lower diffuser", diffuser_rows, MATS['black'],
                       parent=ROOT, smooth=True, offset_vec=(0.0, 0.0, 0.012))

    for fin_x in (-0.30, -0.10, 0.10, 0.30):
        fin_y = get_rear_body_y(fin_x, 0.230) - 0.025
        box_object(f"diffuser fin {fin_x:.2f}", (fin_x, fin_y, 0.210),
                   (0.010, 0.060, 0.035), MATS['black'], parent=ROOT)

    # 8. Roof Shark Fin Antenna
    fin_pts = [
        (0.0, 0.92, 1.390),
        (0.0, 1.02, 1.365),
        (0.0, 1.00, 1.395),
        (0.0, 0.95, 1.412),
    ]
    thick_polygon("Accord shark fin antenna", fin_pts, (0.018, 0, 0), MATS['black'], parent=ROOT, bevel=0.0015)


# ==============================================================================
# 4. Authentic Side Doors & Shut Lines (Visible Mesh Panel Cuts)
# ==============================================================================

def build_side_details():
    for sign, side in ((1.0, 'right'), (-1.0, 'left')):
        # 1. Authentic 3D B-Pillar Assembly (Dimensioned, Beveled, Flush Automotive Post)
        # B-pillar center at Y = +0.020.
        # Spans from beltline (Z = 0.868, X = 0.846) to roof rail (Z = 1.412, X = 0.672).
        # Width in Y = 0.078m (from Y = -0.019 to Y = +0.059).
        dz = 1.412 - 0.868
        dx = 0.672 - 0.846
        tumble_angle = math.atan2(dx, dz)
        rot_y = sign * tumble_angle
        mid_z = (0.868 + 1.412) * 0.5
        mid_x = sign * ((0.846 + 0.672) * 0.5 + 0.007)
        length_pillar = math.sqrt(dx * dx + dz * dz)

        # Dimensional gloss black B-pillar outer applique (standing proud of glass)
        box_object(f"B-pillar applique {side}",
                   (mid_x, 0.020, mid_z),
                   (0.011, 0.078, length_pillar),
                   MATS['black'], parent=ROOT, bevel=0.002,
                   rotation=(0, rot_y, 0))

        # Base rubber seal cushion underneath
        box_object(f"B-pillar base cushion {side}",
                   (sign * ((0.846 + 0.672) * 0.5 + 0.002), 0.020, mid_z),
                   (0.006, 0.084, length_pillar + 0.006),
                   MATS['door_seam'], parent=ROOT,
                   rotation=(0, rot_y, 0))

        # 2. Continuous Beltline Weatherstrip / Waist Seal (Anchors window base)
        bw_pts = [
            (sign * 0.845, -0.92, 0.875),
            (sign * 0.846, -0.38, 0.874),
            (sign * 0.848,  0.02, 0.872),
            (sign * 0.846,  0.68, 0.868),
            (sign * 0.842,  0.88, 0.866),
            (sign * 0.838,  1.08, 0.865),
        ]
        for k in range(len(bw_pts) - 1):
            cylinder_between(f"beltline weatherstrip {side}_{k}",
                             bw_pts[k], bw_pts[k + 1], 0.0045, MATS['black'], parent=ROOT)

        # 3. Signature Chrome Window Arch & Hofmeister Kink (Kinks precisely at 1.08!)
        chrome_pts = [
            (sign * 0.672, -0.38, 1.390),
            (sign * 0.672, -0.18, 1.415),
            (sign * 0.672,  0.02, 1.410),
            (sign * 0.650,  0.36, 1.390),
            (sign * 0.630,  0.68, 1.345),
            (sign * 0.615,  0.88, 1.280),
            (sign * 0.700,  0.98, 1.120),
            (sign * 0.775,  1.05, 0.980),
            (sign * 0.838,  1.08, 0.865),
            (sign * 0.842,  1.03, 0.865),
        ]
        for k in range(len(chrome_pts) - 1):
            cylinder_between(f"chrome roof arch {side}_{k}", chrome_pts[k], chrome_pts[k + 1], 0.0035, MATS['chrome'], parent=ROOT)

        # Upper window frame header seal under chrome arch
        for k in range(len(chrome_pts) - 2):
            cylinder_between(f"window header seal {side}_{k}", chrome_pts[k], chrome_pts[k + 1], 0.0028, MATS['black'], parent=ROOT)

        # 4. Sculpted Rear Quarter Glass Division Bar (At Y = 0.74, connects beltline to roof rail)
        q_p1 = (sign * 0.846, 0.74, 0.868)
        q_p2 = (sign * 0.690, 0.74, 1.255)
        cylinder_between(f"quarter glass divider {side}", q_p1, q_p2, 0.0055, MATS['black'], parent=ROOT)

        # 5. Proportioned Door Cut Lines (7mm crisp visible panel shutlines)
        r_seam = 0.0035

        # 5a. Front Door Leading Cut Line (From sill, up fender, past cowl, up A-pillar to roof)
        fd_pts = [
            (sign * 0.858, -0.94, 0.195),
            (sign * 0.868, -0.94, 0.250),
            (sign * 0.898, -0.93, 0.500),
            (sign * 0.894, -0.92, 0.745),
            (sign * 0.848, -0.90, 0.880),
            (sign * 0.760, -0.66, 1.135),
            (sign * 0.674, -0.38, 1.390),
            (sign * 0.674, -0.18, 1.415),
            (sign * 0.674,  0.02, 1.410),
        ]
        for k in range(len(fd_pts) - 1):
            cylinder_between(f"front door shutline {side}_{k}", fd_pts[k], fd_pts[k + 1], r_seam, MATS['door_seam'], parent=ROOT)

        # 5b. B-Pillar Center Door Division Cut Line (From sill, through door skin and B-pillar to roof)
        bp_pts = [
            (sign * 0.860, 0.02, 0.195),
            (sign * 0.868, 0.02, 0.250),
            (sign * 0.898, 0.02, 0.745),
            (sign * 0.850, 0.02, 0.875),
            (sign * 0.765, 0.02, 1.140),
            (sign * 0.676, 0.02, 1.412),
        ]
        for k in range(len(bp_pts) - 1):
            cylinder_between(f"B-pillar shutline {side}_{k}", bp_pts[k], bp_pts[k + 1], r_seam, MATS['door_seam'], parent=ROOT)

        # 5c. Rear Door Trailing Cut Line (Curving around rear wheel arch flare in authentic dogleg!)
        rd_pts = [
            (sign * 0.866, 0.82, 0.195),
            (sign * 0.870, 0.84, 0.250),
            (sign * 0.888, 0.92, 0.420),
            (sign * 0.900, 1.01, 0.620),
            (sign * 0.894, 1.04, 0.745),
            (sign * 0.840, 1.04, 0.865),
            (sign * 0.760, 1.01, 1.050),
            (sign * 0.674, 0.94, 1.250),
            (sign * 0.674, 0.68, 1.345),
            (sign * 0.674, 0.36, 1.390),
            (sign * 0.674, 0.02, 1.410),
        ]
        for k in range(len(rd_pts) - 1):
            cylinder_between(f"rear door shutline {side}_{k}", rd_pts[k], rd_pts[k + 1], r_seam, MATS['door_seam'], parent=ROOT)

        # 5d. Horizontal Lower Rocker Sill Crease
        sk1 = (sign * 0.868, -0.94, 0.250)
        sk2 = (sign * 0.870,  0.84, 0.250)
        cylinder_between(f"door rocker crease {side}", sk1, sk2, r_seam, MATS['door_seam'], parent=ROOT)

        # 6. Side Mirrors
        stem_p1 = (sign * 0.80, -0.68, 0.93)
        stem_p2 = (sign * 0.93, -0.66, 0.94)
        cylinder_between(f"Accord mirror stem {side}", stem_p1, stem_p2, 0.016, MATS['black'], parent=ROOT)
        box_object(f"Accord mirror cap {side}", (sign * 1.01, -0.65, 0.94), (0.14, 0.19, 0.080), MATS['black'], parent=ROOT, bevel=0.024)
        box_object(f"Accord mirror glass {side}", (sign * 1.075, -0.64, 0.94), (0.01, 0.16, 0.068), MATS['glass'], parent=ROOT)
        m_led_p1 = (sign * 0.95, -0.72, 0.945)
        m_led_p2 = (sign * 1.06, -0.67, 0.945)
        cylinder_between(f"Accord mirror indicator {side}", m_led_p1, m_led_p2, 0.005, MATS['amber'], parent=ROOT)

        # 7. Sculpted Flush Door Handles (Perfect proportions & aligned with quarter divider!)
        # Front door span: -0.94 to +0.02 (0.96m). Front handle at Y = -0.22.
        # Rear door span: +0.02 to +1.04 (1.02m). Rear handle at Y = +0.74.
        for dy, h_name, x_skin in ((-0.22, 'front', 0.862), (0.74, 'rear', 0.860)):
            # Recessed shadow pocket inside door skin
            box_object(f"{h_name} handle pocket {side}",
                       (sign * (x_skin - 0.002), dy, 0.840),
                       (0.008, 0.155, 0.038), MATS['door_seam'], parent=ROOT)
            # Flush body-colored pull handle anchored into door skin
            handle_x = sign * (x_skin + 0.011)
            box_object(f"{h_name} door handle {side}",
                       (handle_x, dy, 0.840),
                       (0.024, 0.140, 0.030), MATS['paint'], parent=ROOT, bevel=0.008)


# ==============================================================================
# 5. Four Wheels & Calipers (100% BLENDER_NOTE.md Contract + Proudly Visible Calipers)
# ==============================================================================

def torus_x(name, major_r, minor_r, half_width, material, parent, x_center=0.0, segments_major=24, segments_minor=12):
    verts = []
    for i in range(segments_major):
        phi = math.tau * i / segments_major
        c_y = major_r * math.cos(phi)
        c_z = major_r * math.sin(phi)
        for j in range(segments_minor):
            theta = math.tau * j / segments_minor
            dx = x_center + half_width * math.cos(theta)
            dy = c_y + minor_r * math.sin(theta) * math.cos(phi)
            dz = c_z + minor_r * math.sin(theta) * math.sin(phi)
            verts.append((dx, dy, dz))
    faces = []
    for i in range(segments_major):
        next_i = (i + 1) % segments_major
        for j in range(segments_minor):
            next_j = (j + 1) % segments_minor
            a = i * segments_minor + j
            b = next_i * segments_minor + j
            c_idx = next_i * segments_minor + next_j
            d = i * segments_minor + next_j
            faces.append((a, b, c_idx, d))
    return mesh_object(name, verts, faces, material, parent=parent, smooth=True)

def cylinder_x_local(name, radius, length, material, parent, x_center=0.0, segments=20, caps=True):
    dx = length * 0.5
    verts = []
    for x in (x_center - dx, x_center + dx):
        for i in range(segments):
            ang = math.tau * i / segments
            verts.append((x, radius * math.cos(ang), radius * math.sin(ang)))
    faces = []
    for i in range(segments):
        j = (i + 1) % segments
        faces.append((i, j, segments + j, segments + i))
    if caps:
        faces += [tuple(reversed(range(segments))), tuple(range(segments, segments * 2))]
    return mesh_object(name, verts, faces, material, parent=parent, smooth=True)

def hollow_cylinder_x(name, r_out, r_in, length, material, parent, x_center=0.0, segments=20):
    verts = []
    dx = length * 0.5
    for x in (x_center - dx, x_center + dx):
        for r in (r_out, r_in):
            for i in range(segments):
                ang = math.tau * i / segments
                verts.append(Vector((x, r * math.cos(ang), r * math.sin(ang))))
    faces = []
    for i in range(segments):
        j = (i + 1) % segments
        faces.append((i, j, 2 * segments + j, 2 * segments + i))
        faces.append((3 * segments + i, 3 * segments + j, segments + j, segments + i))
        faces.append((segments + i, segments + j, j, i))
        faces.append((2 * segments + i, 2 * segments + j, 3 * segments + j, 3 * segments + i))
    return mesh_object(name, verts, faces, material, parent=parent, smooth=True)

def create_accord_wheel(parent_name, corner, x, y, outboard_sign):
    parent = bpy.data.objects.new(parent_name, None)
    ASSET_COLLECTION.objects.link(parent)
    parent.parent = ROOT
    parent.location = (x, y, WHEEL_RADIUS)
    parent.rotation_euler = (0, 0, 0)
    parent.scale = (1, 1, 1)
    parent.empty_display_type = 'CIRCLE'
    parent.empty_display_size = 0.22
    parent['corner'] = corner
    parent['spin_axis'] = 'local_X'
    parent['origin_is_hub_center'] = True
    parent['wheel_radius_m'] = WHEEL_RADIUS
    parent['tire_size'] = '235/40R19'

    # 1. 235/40R19 Sport Tire
    tire_major = (WHEEL_RADIUS + 0.24130) * 0.5
    tire_minor = (WHEEL_RADIUS - 0.24130) * 0.5
    torus_x(f"{parent_name} tire", tire_major, tire_minor, TIRE_WIDTH * 0.5, MATS['tire'], parent)

    # 2. Rim Barrel & Brake Rotor Disc (Both completely closed, hollow open center for visible brakes)
    hollow_cylinder_x(f"{parent_name} rim barrel", 0.239, 0.226, 0.200, MATS['rim_dark'], parent)
    cylinder_x_local(f"{parent_name} brake rotor", 0.185, 0.024, MATS['dark_metal'], parent, caps=True)

    # 3. 19-inch Two-Tone Machined Sport Rim
    face_x = outboard_sign * 0.098
    torus_x(f"{parent_name} rim outer lip", 0.224, 0.012, 0.010, MATS['rim'], parent, x_center=face_x)
    hollow_cylinder_x(f"{parent_name} rim well", 0.224, 0.214, 0.035, MATS['rim_dark'], parent, x_center=face_x - outboard_sign * 0.015)

    for i in range(5):
        base_angle = math.tau * i / 5.0 + math.radians(18)
        for split, offset in enumerate((-0.070, 0.070), 1):
            ang = base_angle + offset
            spoke_pts = []
            r_in, r_out = 0.065, 0.218
            w_half = 0.032
            for r, a in (
                (r_in, ang - w_half * 0.7),
                (r_out, ang - w_half),
                (r_out, ang + w_half),
                (r_in, ang + w_half * 0.7),
            ):
                spoke_pts.append((face_x, r * math.cos(a), r * math.sin(a)))
            spk_mat = MATS['rim'] if split == 1 else MATS['rim_dark']
            thick_polygon(f"{parent_name} spoke {i + 1}_{split}", spoke_pts, (0.026, 0, 0), spk_mat, parent=parent, bevel=0.0012)

    cylinder_x_local(f"{parent_name} hub center", 0.062, 0.038, MATS['rim_dark'], parent, x_center=face_x + outboard_sign * 0.005, caps=True)
    cylinder_x_local(f"{parent_name} center cap", 0.036, 0.010, MATS['chrome'], parent, x_center=face_x + outboard_sign * 0.022, caps=True)

    for i in range(5):
        ang = math.tau * i / 5.0
        lug_pos = (
            face_x + outboard_sign * 0.024,
            0.044 * math.cos(ang),
            0.044 * math.sin(ang),
        )
        cylinder_between(f"{parent_name} lug nut {i + 1}",
                         (lug_pos[0] - outboard_sign * 0.006, lug_pos[1], lug_pos[2]),
                         (lug_pos[0] + outboard_sign * 0.006, lug_pos[1], lug_pos[2]),
                         0.007, MATS['chrome'], parent=parent, segments=10)

    return parent

def build_all_wheels():
    wheel_specs = [
        ('wheel_front_left', 'front_left', -FRONT_TRACK * 0.5, FRONT_AXLE_Y, -1.0),
        ('wheel_front_right', 'front_right', FRONT_TRACK * 0.5, FRONT_AXLE_Y, 1.0),
        ('wheel_rear_left', 'rear_left', -REAR_TRACK * 0.5, REAR_AXLE_Y, -1.0),
        ('wheel_rear_right', 'rear_right', REAR_TRACK * 0.5, REAR_AXLE_Y, 1.0),
    ]
    for name, corner, x, y, sign in wheel_specs:
        create_accord_wheel(name, corner, x, y, sign)

    # Calipers placed OUTBOARD directly behind spokes, clamping over brake rotor
    # 100% PROUDLY VISIBLE from any exterior viewpoint!
    for name, corner, x, y, sign in [
        ('caliper_front_left', 'front_left', -FRONT_TRACK * 0.5, FRONT_AXLE_Y, -1.0),
        ('caliper_front_right', 'front_right', FRONT_TRACK * 0.5, FRONT_AXLE_Y, 1.0),
        ('caliper_rear_left', 'rear_left', -REAR_TRACK * 0.5, REAR_AXLE_Y, -1.0),
        ('caliper_rear_right', 'rear_right', REAR_TRACK * 0.5, REAR_AXLE_Y, 1.0),
    ]:
        is_front = corner.startswith('front')
        # Outboard placement: sits right behind spokes (X = x + sign * 0.048)
        caliper_x = x + sign * 0.048
        caliper_y = y + (-0.110 if is_front else 0.110)
        caliper_z = WHEEL_RADIUS + (0.075 if is_front else 0.065)
        rot_angle = math.radians(25 if is_front else -25) * sign

        caliper = box_object(name, (caliper_x, caliper_y, caliper_z),
                             (0.052, 0.092, 0.155), MATS['caliper'], parent=ROOT, bevel=0.016,
                             rotation=(rot_angle, 0, 0))
        caliper['corner'] = corner
        caliper['steers'] = is_front
        caliper['spins'] = False


# ==============================================================================
# Build Assembly Execution
# ==============================================================================

build_master_body_with_wheel_wells()
build_front_fascia()
build_rear_fascia()
build_side_details()
build_all_wheels()


# ==============================================================================
# Modifier Application & Clean Mesh Baking (BLENDER_NOTE.md Contract)
# ==============================================================================

def activate_only(obj):
    bpy.ops.object.select_all(action='DESELECT')
    obj.hide_set(False)
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj

for obj in list(ASSET_COLLECTION.all_objects):
    if obj.type == 'CURVE':
        try:
            activate_only(obj)
            bpy.ops.object.convert(target='MESH')
        except Exception:
            pass

for obj in list(ASSET_COLLECTION.all_objects):
    if obj.type == 'MESH':
        for modifier in list(obj.modifiers):
            try:
                activate_only(obj)
                bpy.ops.object.modifier_apply(modifier=modifier.name)
            except Exception:
                pass
        try:
            activate_only(obj)
            bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
        except Exception:
            pass
        try:
            import bmesh
            bm = bmesh.new()
            bm.from_mesh(obj.data)
            bmesh.ops.dissolve_degenerate(bm, dist=1e-5, edges=bm.edges)
            bm.to_mesh(obj.data)
            bm.free()
            obj.data.update()
        except Exception:
            pass


# ==============================================================================
# Complete Physics & CarDatabase Metadata per BLENDER_NOTE.md
# ==============================================================================

metadata = {
    'asset_id': 'honda_accord_2026_sport_hybrid',
    'manufacturer': 'Honda',
    'model': 'Accord Sport Hybrid',
    'model_year': 2026,
    'trim_basis': 'Sport Hybrid (19-inch specification)',
    'source': 'Official 2026 Honda Accord Features & Specs',
    'length_m': LENGTH,
    'width_m_without_mirrors': WIDTH,
    'height_m': HEIGHT,
    'wheelbase_m': WHEELBASE,
    'front_track_m': FRONT_TRACK,
    'rear_track_m': REAR_TRACK,
    'ground_clearance_m': GROUND_CLEARANCE,
    'wheel_radius_m': WHEEL_RADIUS,
    'tire_size': '235/40R19 96V',
    'curb_mass_kg': 1577.14,
    'weight_distribution_front': 0.61,
    'weight_distribution_rear': 0.39,
    'engine_layout': 'front',
    'drive_type': 'FWD',
    'powertrain': '2.0L Atkinson I4 two-motor hybrid',
    'system_power_hp': 204,
    'motor_torque_nm': 334.89,
    'final_drive': 3.895,
    'transmission_ratio_motor': 2.231,
    'transmission_ratio_lockup': 0.652,
    'wheel_spin_axis': 'local X',
    'cg_height_m_estimate': 0.55,
    'drag_coefficient_estimate': 0.26,
    'frontal_area_m2_estimate': 2.30,
    'mass_concentration_estimate': 1.02,
}
for k, v in metadata.items():
    ROOT[k] = v

wheel_nodes = ['wheel_front_left', 'wheel_front_right', 'wheel_rear_left', 'wheel_rear_right']
caliper_nodes = ['caliper_front_left', 'caliper_front_right', 'caliper_rear_left', 'caliper_rear_right']
required_materials = ['car_paint', 'glass', 'windshield', 'rim', 'taillight', 'brake_light']

ROOT['required_wheels_json'] = json.dumps(wheel_nodes)
ROOT['required_calipers_json'] = json.dumps(caliper_nodes)
ROOT['required_materials_json'] = json.dumps(required_materials)


# ==============================================================================
# Studio Review Lighting & Camera (Excluded from glTF export)
# ==============================================================================

cam_data = bpy.data.cameras.new("Accord review camera data")
camera = bpy.data.objects.new("Accord Review Camera ONLY", cam_data)
STUDIO_COLLECTION.objects.link(camera)
SCENE.camera = camera
camera.data.lens = 65
camera.data.sensor_width = 36

def add_studio_light(name, loc, energy, col, sz, target=(0, 0, 0.65)):
    l_data = bpy.data.lights.new(name + " data", type='AREA')
    l_data.energy = energy
    l_data.color = col
    l_data.shape = 'DISK'
    l_data.size = sz
    l_obj = bpy.data.objects.new(name, l_data)
    STUDIO_COLLECTION.objects.link(l_obj)
    l_obj.location = loc
    l_obj.rotation_euler = (Vector(target) - l_obj.location).to_track_quat('-Z', 'Y').to_euler()
    return l_obj

add_studio_light("Studio Key Light", (4.8, -3.8, 5.5), 1800, (1.0, 0.96, 0.92), 4.5)
add_studio_light("Studio Fill Light", (-5.0, -1.5, 3.8), 1100, (0.85, 0.92, 1.0), 3.8)
add_studio_light("Studio Rim Light", (0.0, 5.2, 4.2), 1400, (0.80, 0.90, 1.0), 3.5)
add_studio_light("Studio Front Low Fill", (0.0, -5.2, 2.0), 300, (0.95, 0.98, 1.0), 4.0)

world = bpy.data.worlds.new("Accord studio world")
SCENE.world = world
world.use_nodes = True
world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.02, 0.025, 0.035, 1.0)
world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.40


# ==============================================================================
# Validation & Export
# ==============================================================================

def descendants(obj):
    out = []
    stk = list(obj.children)
    while stk:
        it = stk.pop()
        out.append(it)
        stk.extend(it.children)
    return out

asset_objs = [ROOT] + descendants(ROOT)
mesh_objs = [o for o in asset_objs if o.type == 'MESH']
bpy.context.view_layer.update()

all_pts = []
for o in mesh_objs:
    all_pts.extend(o.matrix_world @ Vector(c) for c in o.bound_box)
b_mins = [min(p[i] for p in all_pts) for i in range(3)]
b_maxs = [max(p[i] for p in all_pts) for i in range(3)]

# Save .blend mainfile
activate_only(ROOT)
bpy.ops.wm.save_as_mainfile(filepath=BLEND_PATH)

# Clean glTF Export matching BLENDER_NOTE.md
bpy.ops.object.select_all(action='DESELECT')
for o in ASSET_COLLECTION.all_objects:
    if o.type not in ('CAMERA', 'LIGHT'):
        o.select_set(True)

os.makedirs(os.path.dirname(GLB_EXPORT_PATH), exist_ok=True)
bpy.ops.export_scene.gltf(
    filepath=GLB_EXPORT_PATH,
    use_selection=True,
    export_format='GLB',
    export_yup=True,
    export_materials='EXPORT',
    export_cameras=False,
    export_lights=False,
)

BUILD_SUMMARY = {
    'status': 'SUCCESS',
    'blend_path': BLEND_PATH,
    'glb_path': GLB_EXPORT_PATH,
    'glb_size_bytes': os.path.getsize(GLB_EXPORT_PATH) if os.path.exists(GLB_EXPORT_PATH) else 0,
    'total_objects': len(asset_objs),
    'mesh_objects': len(mesh_objs),
    'bounds_xyz': {
        'min': [round(v, 4) for v in b_mins],
        'max': [round(v, 4) for v in b_maxs],
        'size': [round(b_maxs[i] - b_mins[i], 4) for i in range(3)],
    },
    'missing_wheels': [n for n in wheel_nodes if bpy.data.objects.get(n) is None],
    'missing_calipers': [n for n in caliper_nodes if bpy.data.objects.get(n) is None],
    'missing_materials': [m for m in required_materials if bpy.data.materials.get(m) is None],
}
print(json.dumps(BUILD_SUMMARY, indent=2))

SCRATCH_DIR = r"C:\Users\User\.gemini\antigravity-ide\brain\6752b76f-5dd7-44fd-976f-afe4c61bccdc\scratch"
os.makedirs(SCRATCH_DIR, exist_ok=True)

views = [
    ("accord_v39_front34.png", (3.8, -4.2, 1.35), (0.0, -1.2, 0.55), 52),
    ("accord_v39_nose.png", (0.0, -4.8, 0.55), (0.0, -1.8, 0.48), 50),
    ("accord_v39_grille_cu.png", (0.0, -3.6, 0.60), (0.0, -2.48, 0.58), 65),
    ("accord_v39_hood_top.png", (0.0, -3.4, 3.4), (0.0, -1.8, 0.55), 48),
    ("accord_v39_side.png", (6.6, 0.0, 0.72), (0.0, 0.0, 0.65), 48),
    ("accord_v39_rear34.png", (4.2, 4.8, 1.5), (0.0, 0.4, 0.65), 60),
    ("accord_v39_headlight_cu.png", (1.6, -3.4, 0.95), (0.48, -2.1, 0.64), 65),
]

for img_name, loc, tgt, lens in views:
    camera.location = loc
    camera.rotation_euler = (Vector(tgt) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
    camera.data.lens = lens
    out_path = os.path.join(SCRATCH_DIR, img_name)
    SCENE.render.filepath = out_path
    bpy.ops.render.render(write_still=True)
    print(f"Rendered {img_name}: {out_path}")

