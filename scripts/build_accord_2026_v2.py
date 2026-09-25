import bpy
import math
import os
import json
from mathutils import Vector, Matrix, Euler

# ==============================================================================
# 2026 Honda Accord Sport Hybrid (11th gen) - game model, v2
#
#   blender -b --factory-startup --python scripts/build_accord_2026_v2.py -- [--out-dir DIR] [--renders DIR]
#
# Writes honda_accord_2026_game_ready.blend and public/models/honda_accord_2026.glb
# (or both into --out-dir). --renders also saves review shots with the paint shown
# mid grey. The v1 generator (scripts/build_accord_2026.py) is kept for reference.
#
# Body: one shell from a box cage, subdivided, fitted to the official size.
# Glass, lamps, grille and trim are laid on it by ray casting; the shell is then
# opened under the glass and a full cabin is built behind it.
#
# Game contract (components/objects/Vehicle.ts): front at -Y; wheel parents
# wheel_front_left/right, wheel_rear_left/right sit at the hub and spin on local X;
# calipers are named caliper_*; materials car_paint, glass, windshield, rim,
# taillight, brake_light. Vehicle.ts repaints any node whose name contains
# "body", "paint", "chassis" or "exterior", gives "rim" nodes/materials the rim
# material and "brake"/"taillight" nodes the brake-lamp material, so other parts
# avoid those words ("trim" contains "rim"!).
# ==============================================================================

SCENE = bpy.context.scene
ROOT_DIR = r"D:\trifilpla"
BLEND_PATH = os.path.join(ROOT_DIR, "honda_accord_2026_game_ready.blend")
GLB_EXPORT_PATH = os.path.join(ROOT_DIR, "public", "models", "honda_accord_2026.glb")

import sys
_ARGS = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []


def _arg(flag):
    return _ARGS[_ARGS.index(flag) + 1] if flag in _ARGS else None


if _arg("--out-dir"):
    BLEND_PATH = os.path.join(_arg("--out-dir"), "honda_accord_2026_game_ready.blend")
    GLB_EXPORT_PATH = os.path.join(_arg("--out-dir"), "honda_accord_2026.glb")
RENDER_DIR = _arg("--renders")
SHELL_SUBDIV = 3          # subdivision of the body cage
SHELL_DECIMATE = 1.0      # below 1.0 the shell is decimated (the nose keeps full density)

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


# ==============================================================================
# 19-inch Sport wheels: lathed 235/40R19 tyre with tread grooves, ten machined
# twin spokes over a gunmetal dish, vented rotor, sector calipers.
# Wheel parents sit at the hub and spin on local X (game contract).
# Dark wheel parts use 'wheel_gunmetal', not a name containing "rim", which the
# game would swap for its bright rim material.
# ==============================================================================

MATS['gunmetal'] = make_pbr_material('wheel_gunmetal', 0x1C1E21, metallic=0.75, roughness=0.32, coat=0.6)
MATS['rotor'] = make_pbr_material('rotor_iron', 0x5B5E62, metallic=0.9, roughness=0.42)

WHEEL_SEG = 96


def lathe_x(name, profile, material, parent, segments=WHEEL_SEG, x_sign=1.0, smooth=True):
    """Revolve (x, r) points round the local X axis; x is mirrored by x_sign."""
    verts = []
    for i in range(segments):
        a = math.tau * i / segments
        ca, sa = math.cos(a), math.sin(a)
        for x, r in profile:
            verts.append((x * x_sign, r * ca, r * sa))
    n = len(profile)
    faces = []
    for i in range(segments):
        i2 = (i + 1) % segments
        for j in range(n - 1):
            f = (i * n + j, i2 * n + j, i2 * n + j + 1, i * n + j + 1)
            faces.append(f if x_sign > 0 else tuple(reversed(f)))
    return mesh_object(name, verts, faces, material, parent=parent, smooth=smooth)


def tyre_profile():
    R, rb, hw = WHEEL_RADIUS, 0.2413, TIRE_WIDTH * 0.5
    side = [(-hw + 0.012, rb + 0.004), (-hw - 0.004, rb + 0.030), (-hw - 0.010, rb + 0.055),
            (-hw - 0.008, R - 0.022), (-hw + 0.002, R - 0.007), (-hw + 0.014, R)]
    grooves = (-0.062, -0.022, 0.022, 0.062)
    tread = []
    for k in range(41):
        x = -hw + 0.014 + (2 * hw - 0.028) * k / 40
        depth = 0.008 if any(abs(x - g) < 0.0055 for g in grooves) else 0.0
        tread.append((x, R - depth))
    other = [(-x, r) for x, r in reversed(side)]
    return side + tread[1:-1] + other


def spoke_mesh(name, angle, sign, parent, twist=math.radians(4)):
    """One tapered spoke from hub to lip: machined face, gunmetal flanks."""
    stations = [0.070 + (0.214 - 0.070) * k / 7 for k in range(8)]
    verts, faces, mats = [], [], []
    for r in stations:
        f = (r - 0.070) / 0.144
        a = angle + twist * f
        u = Vector((0.0, math.cos(a), math.sin(a)))
        t = Vector((0.0, -math.sin(a), math.cos(a)))
        w_face = 0.0150 - 0.0040 * f
        w_back = w_face + 0.007
        x_face = sign * (0.066 + 0.034 * f ** 0.8)          # concave: the hub sits deeper
        x_back = x_face - sign * 0.030
        c = u * r
        for x, w in ((x_face, -w_face), (x_face, w_face), (x_back, w_back), (x_back, -w_back)):
            verts.append(Vector((x, 0, 0)) + c + t * w)
    n = len(stations)
    for k in range(n - 1):
        a, b = 4 * k, 4 * (k + 1)
        quads = [(a, b, b + 1, a + 1), (a + 1, b + 1, b + 2, a + 2), (a + 2, b + 2, b + 3, a + 3), (a + 3, b + 3, b, a)]
        for qi, q in enumerate(quads):
            faces.append(q if sign > 0 else tuple(reversed(q)))
            mats.append(0 if qi == 0 else 1)
    last = 4 * (n - 1)
    for cap in ((0, 1, 2, 3), (last + 3, last + 2, last + 1, last)):
        faces.append(cap if sign > 0 else tuple(reversed(cap)))
        mats.append(1)
    obj = mesh_object(name, verts, faces, [MATS['rim'], MATS['gunmetal']], parent=parent, smooth=False)
    for p, m in zip(obj.data.polygons, mats):
        p.material_index = m
    return obj


def create_accord_wheel(parent_name, corner, x, y, outboard_sign):
    parent = bpy.data.objects.new(parent_name, None)
    ASSET_COLLECTION.objects.link(parent)
    parent.parent = ROOT
    parent.location = (x, y, WHEEL_RADIUS)
    parent.empty_display_type = 'CIRCLE'
    parent.empty_display_size = 0.22
    parent['corner'] = corner
    parent['spin_axis'] = 'local_X'
    parent['origin_is_hub_center'] = True
    parent['wheel_radius_m'] = WHEEL_RADIUS
    parent['tire_size'] = '235/40R19'
    s = outboard_sign
    lathe_x(f"{parent_name} tyre", tyre_profile(), MATS['tire'], parent)
    # rim: bright lip, gunmetal barrel and dish
    lathe_x(f"{parent_name} rim lip", [(0.080, 0.2413), (0.098, 0.2440), (0.106, 0.2395), (0.104, 0.2300),
                                         (0.096, 0.2230), (0.090, 0.2200)], MATS['rim'], parent, x_sign=s)
    lathe_x(f"{parent_name} wheel barrel", [(-0.108, 0.2413), (-0.100, 0.2300), (0.085, 0.2300), (0.090, 0.2200)],
            MATS['gunmetal'], parent, x_sign=s)
    # open between the spokes: only a short inner lip, so the rotor and caliper show
    lathe_x(f"{parent_name} wheel inner lip", [(0.090, 0.2200), (0.080, 0.2140), (0.074, 0.2040)],
            MATS['gunmetal'], parent, x_sign=s)
    lathe_x(f"{parent_name} hub flange", [(0.046, 0.0980), (0.056, 0.0960), (0.062, 0.0760)],
            MATS['gunmetal'], parent, segments=48, x_sign=s)
    for i in range(5):
        base = math.tau * i / 5 + math.radians(18)
        for k, off in enumerate((-0.110, 0.110)):
            spoke_mesh(f"{parent_name} spoke {i + 1}_{k + 1}", base + off, s, parent)
    # hub, cap, lug nuts
    lathe_x(f"{parent_name} wheel hub", [(0.050, 0.0760), (0.070, 0.0760), (0.074, 0.0700), (0.074, 0.0)],
            MATS['gunmetal'], parent, segments=48, x_sign=s)
    lathe_x(f"{parent_name} center cap", [(0.074, 0.034), (0.080, 0.033), (0.082, 0.028), (0.082, 0.0)],
            MATS['black'], parent, segments=40, x_sign=s)
    ell = [(0.018 * math.cos(t), 0.013 * math.sin(t)) for t in [math.tau * k / 20 for k in range(20)]]
    pts = [(s * 0.0835, u, v) for u, v in ell]
    thick_polygon(f"{parent_name} cap badge", pts, (0.002, 0, 0), MATS['chrome'], parent=parent, smooth=False)
    for i in range(5):
        a = math.tau * i / 5
        c = (s * 0.074, 0.057 * math.cos(a), 0.057 * math.sin(a))
        cylinder_between(f"{parent_name} lug nut {i + 1}", c, (c[0] + s * 0.012, c[1], c[2]), 0.0095,
                         MATS['chrome'], parent=parent, segments=6)
    # vented rotor behind the spokes
    lathe_x(f"{parent_name} rotor disc", [(-0.014, 0.092), (-0.014, 0.172), (0.014, 0.172), (0.014, 0.092)],
            MATS['rotor'], parent, segments=64)
    lathe_x(f"{parent_name} rotor hat", [(0.014, 0.092), (0.030, 0.085), (0.034, 0.060), (0.034, 0.0)],
            MATS['dark_metal'], parent, segments=48)
    for k in range(12):
        a = math.tau * k / 12
        for side_x in (-1, 1):
            p1 = Vector((side_x * 0.0142, 0.110 * math.cos(a), 0.110 * math.sin(a)))
            p2 = Vector((side_x * 0.0142, 0.160 * math.cos(a + 0.12), 0.160 * math.sin(a + 0.12)))
            d = p2 - p1
            box_object(f"{parent_name} rotor slot {k + 1}_{side_x + 1}", tuple((p1 + p2) * 0.5),
                       (0.001, d.length, 0.004), MATS['black'], parent=parent,
                       rotation=(math.atan2(d.z, d.y), 0, 0))
    return parent


def caliper_mesh(name, x, y, sign, is_front):
    """Sector-shaped caliper hugging the rotor; fixed to the knuckle (does not spin)."""
    a0 = math.atan2(0.075 if is_front else 0.065, -0.110 if is_front else 0.110)
    half = math.radians(26)
    r_in, r_out = 0.138, 0.196
    x_in, x_out = -0.030, 0.050
    verts, faces = [], []
    seg = 12
    for i in range(seg + 1):
        a = a0 - half + 2 * half * i / seg
        for xx, rr in ((x_in, r_in), (x_out, r_in), (x_out, r_out), (x_in, r_out)):
            verts.append((x + sign * xx, y + rr * math.cos(a), WHEEL_RADIUS + rr * math.sin(a)))
    for i in range(seg):
        a, b = 4 * i, 4 * (i + 1)
        for q in ((a, b, b + 1, a + 1), (a + 1, b + 1, b + 2, a + 2), (a + 2, b + 2, b + 3, a + 3), (a + 3, b + 3, b, a)):
            faces.append(q if sign > 0 else tuple(reversed(q)))
    e = 4 * seg
    faces.append((0, 1, 2, 3))
    faces.append((e + 3, e + 2, e + 1, e))
    obj = mesh_object(name, verts, faces, MATS['caliper'], smooth=True)
    m = obj.modifiers.new("Bevel", 'BEVEL')
    m.width, m.segments, m.limit_method = 0.008, 2, 'ANGLE'
    return obj


def build_all_wheels():
    specs = [
        ('wheel_front_left', 'front_left', -FRONT_TRACK * 0.5, FRONT_AXLE_Y, -1.0),
        ('wheel_front_right', 'front_right', FRONT_TRACK * 0.5, FRONT_AXLE_Y, 1.0),
        ('wheel_rear_left', 'rear_left', -REAR_TRACK * 0.5, REAR_AXLE_Y, -1.0),
        ('wheel_rear_right', 'rear_right', REAR_TRACK * 0.5, REAR_AXLE_Y, 1.0),
    ]
    for name, corner, x, y, sign in specs:
        create_accord_wheel(name, corner, x, y, sign)
        cal = caliper_mesh(name.replace("wheel_", "caliper_"), x, y, sign, corner.startswith("front"))
        cal['corner'] = corner
        cal['steers'] = corner.startswith("front")
        cal['spins'] = False


# ==============================================================================
# 11th-gen Accord body shell (v2)
# One closed shell built as a box cage (stations along Y, a ring of 2*(NX+NZ)
# points round each station, a grid cap at each end) and smoothed with a
# Subdivision Surface. The profiles below are the real car's lines: long hood,
# 24-degree windshield, roof peak behind the B-pillar, fastback rear glass,
# short deck with a lip, shoulder crease through the handles.
# Front of the car is -Y.
# ==============================================================================

import bmesh
from mathutils.bvhtree import BVHTree

# Real overhangs: short front, long rear (the wheelbase is not centred).
FRONT_OVERHANG = 0.952
FRONT_AXLE_Y = -LENGTH * 0.5 + FRONT_OVERHANG
REAR_AXLE_Y = FRONT_AXLE_Y + WHEELBASE
ARCH_RADIUS = 0.358
ARCH_LIFT = 0.010
YF, YR = -LENGTH * 0.5, LENGTH * 0.5
HW = WIDTH * 0.5


def pchip(points):
    """Monotone cubic through (x, y) control points (Fritsch-Carlson); flat outside."""
    xs = [p[0] for p in points]
    ys = [p[1] for p in points]
    n = len(xs)
    h = [xs[i + 1] - xs[i] for i in range(n - 1)]
    d = [(ys[i + 1] - ys[i]) / h[i] for i in range(n - 1)]
    m = [0.0] * n
    m[0], m[-1] = d[0], d[-1]
    for i in range(1, n - 1):
        if d[i - 1] * d[i] <= 0:
            m[i] = 0.0
        else:
            w1, w2 = 2 * h[i] + h[i - 1], h[i] + 2 * h[i - 1]
            m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i])

    def f(x):
        if x <= xs[0]:
            return ys[0]
        if x >= xs[-1]:
            return ys[-1]
        lo, hi = 0, n - 1
        while hi - lo > 1:
            mid = (lo + hi) // 2
            if xs[mid] <= x:
                lo = mid
            else:
                hi = mid
        t = (x - xs[lo]) / h[lo]
        t2, t3 = t * t, t * t * t
        return ((2 * t3 - 3 * t2 + 1) * ys[lo] + (t3 - 2 * t2 + t) * h[lo] * m[lo]
                + (-2 * t3 + 3 * t2) * ys[hi] + (t3 - t2) * h[lo] * m[hi])
    return f


def smoothstep(a, b, x):
    t = min(1.0, max(0.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


# --- side profile of the centreline (hood - windshield - roof - backlight - deck)
# traced from a true side view of the 2026 car (roof scaled to the official 1.450 m)
ZTOP = pchip([(-2.485, 0.800), (-2.285, 0.832), (-2.115, 0.872), (-1.955, 0.900), (-1.785, 0.925),
              (-1.625, 0.944), (-1.455, 0.958), (-1.295, 0.972), (-1.16, 0.980), (-1.10, 0.990),
              (-0.965, 1.064), (-0.805, 1.157), (-0.635, 1.246), (-0.475, 1.322), (-0.305, 1.386),
              (-0.145, 1.418), (0.025, 1.433), (0.185, 1.445), (0.355, 1.450), (0.515, 1.442),
              (0.685, 1.433), (0.845, 1.418), (1.015, 1.395), (1.175, 1.360), (1.335, 1.318),
              (1.505, 1.262), (1.665, 1.204), (1.835, 1.141), (1.995, 1.082), (2.165, 1.054),
              (2.325, 1.046), (2.420, 1.048), (2.485, 1.042)])
# the corner line (hood edge - A-pillar - roof rail - C-pillar - deck edge)
CORNER_SHIFT = pchip([(-2.5, 0.0), (-1.17, 0.0), (-1.04, 0.10), (-0.18, 0.10), (0.05, 0.0),
                      (0.95, 0.0), (1.10, 0.09), (1.85, 0.09), (2.05, 0.0), (2.5, 0.0)])
CROWN = pchip([(-2.5, 0.022), (-1.15, 0.028), (-1.00, 0.036), (-0.10, 0.038), (0.95, 0.038),
               (1.95, 0.026), (2.5, 0.018)])
X_CORNER = pchip([(-2.5, 0.800), (-1.15, 0.800), (-1.06, 0.792), (-0.60, 0.738), (-0.08, 0.676),
                  (1.00, 0.660), (1.45, 0.718), (2.00, 0.800), (2.5, 0.800)])
# waist: beltline under the side glass, its x, the shoulder crease, the floor
BELT = pchip([(-1.20, 0.985), (-0.70, 0.995), (0.30, 1.008), (1.00, 1.028), (1.35, 1.052),
              (1.50, 1.058), (1.95, 1.046), (2.20, 1.040)])
X_BELT = pchip([(-1.20, 0.885), (0.00, 0.876), (1.00, 0.869), (1.50, 0.878), (2.00, 0.900)])
SHOULDER = pchip([(-2.30, 0.800), (-1.50, 0.832), (-0.50, 0.852), (0.50, 0.866), (1.50, 0.888),
                  (2.20, 0.922), (2.485, 0.930)])
FLOOR = pchip([(-2.485, 0.215), (-2.40, 0.186), (-2.20, 0.176), (-1.00, 0.180), (1.00, 0.180),
               (1.90, 0.195), (2.20, 0.222), (2.485, 0.245)])
# how far the front / rear faces lean from vertical, by height
# face profiles traced from the side photo, same as ZTOP
LEAN_F = pchip([(0.10, 0.100), (0.20, 0.060), (0.28, 0.050), (0.35, 0.040), (0.42, 0.0), (0.50, 0.028),
                (0.58, 0.064), (0.65, 0.075), (0.72, 0.085), (0.78, 0.120), (0.84, 0.150), (0.90, 0.170)])
LEAN_R = pchip([(0.20, -0.200), (0.28, -0.120), (0.35, -0.030), (0.42, 0.0), (0.50, 0.0), (0.58, -0.010),
                (0.65, -0.070), (0.72, -0.090), (0.78, -0.090), (0.84, -0.072), (0.90, -0.062),
                (0.96, -0.080), (1.02, -0.100), (1.07, -0.120)])

# plan view: superelliptic front / rear sweeps plus a gentle taper towards the ends
SWEEP_F, W0_F, P_F = 0.42, 0.45, 2.4
SWEEP_R, W0_R, P_R = 0.36, 0.52, 2.6
TAPER = pchip([(-2.10, 0.975), (-1.50, 0.990), (-0.80, 1.0), (1.20, 1.0), (1.80, 0.993), (2.20, 0.982)])


def _sweep(d, depth, w0, p):
    if d >= depth:
        return 1.0
    return w0 + (1 - w0) * (1 - (1 - max(d, 0.0) / depth) ** p) ** (1 / p)


def plan_factor(y):
    return TAPER(y) * min(_sweep(y - YF, SWEEP_F, W0_F, P_F), _sweep(YR - y, SWEEP_R, W0_R, P_R))


def lean(y, z):
    d = y - YF
    if d < 0.5:
        return LEAN_F(z) * (1 - d / 0.5) ** 2
    d = YR - y
    if d < 0.5:
        return LEAN_R(z) * (1 - d / 0.5) ** 2
    return 0.0


def corner(y):
    """(x, z) of the corner line at station y, before the plan fillet."""
    z = ZTOP(y - CORNER_SHIFT(y)) - CROWN(y)
    return X_CORNER(y), z


def waist(y):
    """(x, z) of the belt row. Where the corner drops below the beltline (hood,
    deck) the belt row becomes the outer edge of the fender-top ledge."""
    xc, zc = corner(y)
    glass = zc - BELT(y)
    t = smoothstep(0.0, 0.06, glass)
    ledge_x, ledge_z = min(xc + 0.11, HW * 0.95), zc - 0.006
    return ledge_x + (X_BELT(y) - ledge_x) * t, ledge_z + (BELT(y) - ledge_z) * t


# columns across the top / bottom (dense at the corners), rows up the side
U_COLS = [-1.0, -0.93, -0.80, -0.60, -0.33, 0.0, 0.33, 0.60, 0.80, 0.93, 1.0]
NX = len(U_COLS) - 1
# shoulder line proud of a shadowed ledge; a rising lower crease over a concave door
SIDE_X = [0.840, 0.915, 0.948, 0.972, 0.950, 0.955, 0.966, 1.000, 0.955]   # rows 0-8, x HW
SIDE_F = [0.0, 0.05, 0.18, 0.33, 0.50, 0.68, 0.86]                          # rows 0-6 up to the shoulder
LOWER_CREASE = pchip([(-1.20, 0.25), (0.90, 0.40)])      # rises towards the rear
GLASS_T = [0.30, 0.62, 0.90]                                                 # rows 10-12
NZ = 13
ROW_SHOULDER, ROW_LOWER, ROW_BELT, ROW_CORNER = 7, 3, 9, 13


def side_rows(y):
    """(x, z) of rows 0..13 up the right side at station y (plan fillet applied)."""
    zf = FLOOR(y)
    xb, zb = waist(y)
    xc, zc = corner(y)
    zs = min(SHOULDER(y), zb - 0.045)
    f3 = LOWER_CREASE(y)
    fr = [0.0, 0.05, f3 - 0.14, f3, f3 + 0.17, 0.5 * (f3 + 0.17) + 0.43, 0.88]
    rows = []
    for k, f in enumerate(fr):
        rows.append((SIDE_X[k] * HW, zf + (zs - zf) * f))
    rows.append((SIDE_X[7] * HW, zs))
    rows.append((SIDE_X[8] * HW, zs + 0.4 * (zb - zs)))
    rows.append((xb, zb))
    for t in GLASS_T:
        rows.append((xb + (xc - xb) * t ** 1.3, zb + (zc - zb) * t))
    rows.append((xc, zc))
    p = plan_factor(y)
    return [(x * p, z) for x, z in rows]


def top_row(y):
    xc, zc = corner(y)
    zt = ZTOP(y)
    p = plan_factor(y)
    return [(u * xc * p, zt - (zt - zc) * abs(u) ** 2.0) for u in U_COLS]


def ring_lattice():
    """Perimeter lattice cells (i, k) in loop order."""
    cells = [(i, 0) for i in range(NX + 1)]
    cells += [(NX, k) for k in range(1, NZ + 1)]
    cells += [(i, NZ) for i in range(NX - 1, -1, -1)]
    cells += [(0, k) for k in range(NZ - 1, 0, -1)]
    return cells


RING = ring_lattice()


def ring_points(y):
    """Lattice (i, k) -> (x, y, z) for the perimeter of station y."""
    side = side_rows(y)
    top = top_row(y)
    xf = side[0][0]
    zf = side[0][1]
    pts = {}
    for i, u in enumerate(U_COLS):
        pts[(i, 0)] = (u * xf, zf)
        pts[(i, NZ)] = top[i]
    for k in range(NZ + 1):
        x, z = side[k]
        pts[(NX, k)] = (x, z)
        pts[(0, k)] = (-x, z)
    return {c: (x, y + lean(y, z), z) for c, (x, z) in pts.items()}


def cap_points(ring, y_end, bulge, sign):
    """Coons patch over an end ring; the centre bulges outwards by `bulge`."""
    out = {}
    for i in range(1, NX):
        for k in range(1, NZ):
            u, v = i / NX, k / NZ
            B, T = Vector(ring[(i, 0)]), Vector(ring[(i, NZ)])
            Lp, Rp = Vector(ring[(0, k)]), Vector(ring[(NX, k)])
            c00, c10 = Vector(ring[(0, 0)]), Vector(ring[(NX, 0)])
            c01, c11 = Vector(ring[(0, NZ)]), Vector(ring[(NX, NZ)])
            p = ((1 - v) * B + v * T + (1 - u) * Lp + u * Rp
                 - ((1 - u) * (1 - v) * c00 + u * (1 - v) * c10 + (1 - u) * v * c01 + u * v * c11))
            edge = max(abs(Rp.x), 1e-4)
            p.y = p.y - sign * bulge * max(0.0, 1 - (p.x / edge) ** 2)
            out[(i, k)] = tuple(p)
    return out


def body_stations():
    ys = [YF + d for d in (0.0, 0.012, 0.04, 0.085, 0.15, 0.23, 0.32, 0.43)]
    ys += [-1.96 + 0.09 * i for i in range(10)]                      # front arch
    ys += [-1.22, -1.15, -1.09, -1.03, -0.97, -0.90, -0.82, -0.72, -0.60, -0.46, -0.30, -0.15, 0.0, 0.12, 0.26,
           0.42, 0.58, 0.74, 0.86]
    ys += [0.92 + 0.09 * i for i in range(10)]                       # rear arch
    ys += [1.84, 1.93, 2.03]
    ys += [YR - d for d in (0.37, 0.27, 0.18, 0.11, 0.055, 0.02, 0.0)]
    return sorted(set(round(y, 5) for y in ys))


def build_shell():
    stations = body_stations()
    rings = [ring_points(y) for y in stations]
    verts, index = [], {}
    for j, ring in enumerate(rings):
        for cell in RING:
            index[(j, cell)] = len(verts)
            verts.append(ring[cell])
    front_cap = cap_points(rings[0], YF, 0.035, +1)
    rear_cap = cap_points(rings[-1], YR, 0.030, -1)
    for tag, cap in (("F", front_cap), ("R", rear_cap)):
        for cell, p in cap.items():
            index[(tag, cell)] = len(verts)
            verts.append(p)
    faces = []
    M = len(RING)
    for j in range(len(rings) - 1):
        for p in range(M):
            a, b = RING[p], RING[(p + 1) % M]
            faces.append((index[(j, a)], index[(j, b)], index[(j + 1, b)], index[(j + 1, a)]))

    def cap_index(tag, j, i, k):
        if i in (0, NX) or k in (0, NZ):
            return index[(j, (i, k))]
        return index[(tag, (i, k))]
    for tag, j in (("F", 0), ("R", len(rings) - 1)):
        for i in range(NX):
            for k in range(NZ):
                faces.append((cap_index(tag, j, i, k), cap_index(tag, j, i + 1, k),
                              cap_index(tag, j, i + 1, k + 1), cap_index(tag, j, i, k + 1)))

    mesh = bpy.data.meshes.new("accord_shell Mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.validate(verbose=False)
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(mesh)
    bm.free()

    # creases along the character lines (edges between stations on one row)
    crease_rows = {ROW_SHOULDER: 1.0, ROW_LOWER: 0.7, ROW_BELT: 0.85, ROW_CORNER: 0.7}
    wanted = {}
    for j in range(len(rings) - 1):
        for k, w in crease_rows.items():
            for i in (0, NX):
                a, b = index[(j, (i, k))], index[(j + 1, (i, k))]
                wanted[frozenset((a, b))] = w
    # hood leading edge and the deck lip: the top row of each end ring
    for j, w in ((0, 0.5), (len(rings) - 1, 0.8)):
        for i in range(NX):
            wanted[frozenset((index[(j, (i, NZ))], index[(j, (i + 1, NZ))]))] = w
    attr = mesh.attributes.get("crease_edge") or mesh.attributes.new("crease_edge", 'FLOAT', 'EDGE')
    for e in mesh.edges:
        attr.data[e.index].value = wanted.get(frozenset(e.vertices), 0.0)

    obj = bpy.data.objects.new("accord_shell", mesh)
    ASSET_COLLECTION.objects.link(obj)
    obj.parent = ROOT
    obj.data.materials.append(MATS['paint'])
    for poly in mesh.polygons:
        poly.use_smooth = True
    sub = obj.modifiers.new("Subsurf", 'SUBSURF')
    sub.levels = SHELL_SUBDIV
    sub.render_levels = SHELL_SUBDIV
    return obj


def apply_all_modifiers(obj):
    bpy.ops.object.select_all(action='DESELECT')
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    for m in list(obj.modifiers):
        bpy.ops.object.modifier_apply(modifier=m.name)


def fit_shell(obj):
    """Scale the smoothed shell to the official length / width / height."""
    me = obj.data
    xs = [v.co.x for v in me.vertices]
    ys = [v.co.y for v in me.vertices]
    zs = [v.co.z for v in me.vertices]
    sx = HW / max(abs(min(xs)), max(xs))
    sy = LENGTH / (max(ys) - min(ys))
    cy = (max(ys) + min(ys)) * 0.5
    sz = HEIGHT / max(zs)
    for v in me.vertices:
        v.co = Vector((v.co.x * sx, (v.co.y - cy) * sy, v.co.z * sz))
    me.update()
    global FIT_SX, FIT_SY, FIT_CY, FIT_SZ
    FIT_SX, FIT_SY, FIT_CY, FIT_SZ = sx, sy, cy, sz
    return {"scale": (round(sx, 4), round(sy, 4), round(sz, 4))}


def wy(y_nom):
    """profile (nominal) y -> finished-shell y"""
    return (y_nom - FIT_CY) * FIT_SY


def ny(y_world):
    return y_world / FIT_SY + FIT_CY


# grille opening in front view: half-width by height
# 11th gen: a wide, low hexagon tucked under the headlamps
GRILLE = pchip([(0.470, 0.370), (0.492, 0.428), (0.560, 0.468), (0.630, 0.482), (0.665, 0.440)])
GRILLE_Z = (0.470, 0.665)
GRILLE_DEPTH = 0.0      # flush: a shallow press read as a smear at this size
GRILLE_RAMP = 0.006


def recess_grille(obj):
    """Press the grille opening into the nose so the grille sits behind the bumper."""
    z0, z1 = GRILLE_Z
    moved = 0
    for v in obj.data.vertices:
        x, y, z = v.co
        if y > YF + 0.30 or z < z0 - 0.03 or z > z1 + 0.03:
            continue
        zc = min(max(z, z0), z1)
        half = GRILLE(zc)
        # distance inside the outline (negative outside), in x and in z
        inside = min(half - abs(x), z - z0, z1 - z)
        f = smoothstep(-0.004, GRILLE_RAMP, inside)
        if f > 0:
            v.co.y += GRILLE_DEPTH * f
            moved += 1
    obj.data.update()
    return moved


def hood_creases(obj):
    """Two raised character lines running back from the headlamps' inner ends."""
    y0, y1 = YF + 0.10, wy(-1.19)
    me = obj.data
    me.update()
    moved = 0
    for v in me.vertices:
        x, y, z = v.co
        if not (y0 < y < y1) or v.normal.z < 0.75:
            continue
        f = (y - y0) / (y1 - y0)
        line = 0.40 - 0.10 * f
        d = abs(abs(x) - line)
        if d < 0.032:
            fade = smoothstep(0.0, 0.12, f) * (1 - smoothstep(0.85, 1.0, f))
            v.co.z += 0.0055 * (1 - d / 0.032) * fade
            moved += 1
    me.update()
    return moved


def cut_arches(obj):
    """Boolean the four wheel openings out of the shell."""
    cutters = []
    for y in (FRONT_AXLE_Y, REAR_AXLE_Y):
        for side in (-1, 1):
            c = cylinder_between("_arch_cutter", (side * 0.60, y, WHEEL_RADIUS + ARCH_LIFT),
                                 (side * 1.30, y, WHEEL_RADIUS + ARCH_LIFT), ARCH_RADIUS, None,
                                 parent=None, segments=64)
            c.modifiers.clear()
            cutters.append(c)
    # one cutter object keeps the boolean to a single pass
    bpy.ops.object.select_all(action='DESELECT')
    for c in cutters:
        c.select_set(True)
    bpy.context.view_layer.objects.active = cutters[0]
    bpy.ops.object.join()
    cutter = cutters[0]
    mod = obj.modifiers.new("Arches", 'BOOLEAN')
    mod.operation = 'DIFFERENCE'
    mod.solver = 'EXACT'
    mod.object = cutter
    apply_all_modifiers(obj)
    me = cutter.data
    bpy.data.objects.remove(cutter, do_unlink=True)
    bpy.data.meshes.remove(me)


def build_wheel_wells():
    """Black liners closing the arch openings (inner arch + inboard wall)."""
    for y in (FRONT_AXLE_Y, REAR_AXLE_Y):
        cz = WHEEL_RADIUS + ARCH_LIFT
        for side, tag in ((-1, "left"), (1, "right")):
            corner = "front" if y < 0 else "rear"
            r = ARCH_RADIUS - 0.004
            x_in, x_out = side * 0.60, side * (HW - 0.012)
            verts, faces = [], []
            seg = 40
            angs = [math.radians(-20 + 220 * i / seg) for i in range(seg + 1)]
            for a in angs:
                py, pz = y - r * math.cos(a), cz + r * math.sin(a)
                verts.append((x_in, py, pz))
                verts.append((x_out, py, pz))
            for i in range(seg):
                a, b = 2 * i, 2 * i + 2
                faces.append((a, b, b + 1, a + 1) if side > 0 else (a + 1, b + 1, b, a))
            mesh_object(f"wheel_well_{corner}_{tag}", verts, faces, MATS['liner'], smooth=True)
            wall = [(x_in, y - r * math.cos(a), cz + r * math.sin(a)) for a in angs]
            wall += [(x_in, y + r, cz - 0.23), (x_in, y - r, cz - 0.23)]
            mesh_object(f"wheel_well_{corner}_{tag}_wall", wall, [tuple(range(len(wall)))], MATS['liner'], smooth=False)


def build_underbody():
    y0, y1 = FRONT_AXLE_Y - 0.62, REAR_AXLE_Y + 0.72
    z = FLOOR(0.0) - 0.006
    box_object("floor_pan", (0.0, (y0 + y1) * 0.5, z - 0.012), (1.18, y1 - y0, 0.024), MATS['liner'])


class Shell:
    """Ray casting onto the finished shell (world space == object space here)."""

    def __init__(self, obj):
        me = obj.data
        self.bvh = BVHTree.FromPolygons([v.co.copy() for v in me.vertices],
                                        [tuple(p.vertices) for p in me.polygons])

    def hit(self, origin, direction):
        d = Vector(direction).normalized()
        loc, nor, _, _ = self.bvh.ray_cast(Vector(origin), d, 10.0)
        if loc is not None and nor.dot(d) > 0:
            nor = -nor
        return loc, nor

    def side(self, y, z, sign=1):
        return self.hit((sign * 3.0, y, z), (-sign, 0, 0))

    def top(self, x, y):
        return self.hit((x, y, 3.0), (0, 0, -1))

    def front(self, x, z):
        return self.hit((x, -4.0, z), (0, 1, 0))

    def rear(self, x, z):
        return self.hit((x, 4.0, z), (0, -1, 0))

    def radial(self, cy, theta, z, rear=False):
        """Horizontal ray towards the vertical axis at (0, cy); theta 0 = straight
        ahead (or straight back when rear), 90 = the right side."""
        s, c = math.sin(theta), math.cos(theta)
        d = Vector((s, c if rear else -c, 0.0))
        o = Vector((0.0, cy, z)) + d * 4.0
        return self.hit(o, -d)


# ==============================================================================
# Build
# ==============================================================================

shell = build_shell()
apply_all_modifiers(shell)
fit = fit_shell(shell)
fit["grille_verts"] = recess_grille(shell)
fit["hood_crease_verts"] = hood_creases(shell)
cut_arches(shell)
if SHELL_DECIMATE < 1.0:
    # keep full density on the nose (grille recess, lamp edges)
    _grp = shell.vertex_groups.new(name="keep_dense")
    _grp.add([v.index for v in shell.data.vertices if v.co.y < YF + 0.34], 1.0, 'REPLACE')
    _dec = shell.modifiers.new("Decimate", 'DECIMATE')
    _dec.ratio = SHELL_DECIMATE
    _dec.vertex_group = "keep_dense"
    _dec.invert_vertex_group = True
    apply_all_modifiers(shell)
    if "keep_dense" in shell.vertex_groups:
        shell.vertex_groups.remove(shell.vertex_groups["keep_dense"])
build_wheel_wells()
build_underbody()
build_all_wheels()
SHELL = Shell(shell)


# ==============================================================================
# Details conformed onto the finished shell by ray casting: glass and DLO,
# lamps, grille, badges, plates, seams, handles, mirrors, wipers, antenna.
# Object names avoid the words the game's material swapper keys on
# ("body", "paint", "rim", "glass", "taillight", "brake") unless that swap is wanted.
# ==============================================================================

MISSES = []
GLASS_OBJS, SURROUND_OBJS = [], []


def conform(name, fn, ns, nt, offset, mat, wall=0.0, closed_s=False):
    """fn(s, t) -> (origin, direction). A (ns+1) x (nt+1) grid laid on the shell
    `offset` above it; `wall` adds a skirt pushed back into the shell so the
    part reads as a solid inset piece."""
    grid, nors = [], []
    for i in range(ns + 1):
        row, nrow = [], []
        for j in range(nt + 1):
            o, d = fn(i / ns, j / nt)
            loc, nor = SHELL.hit(o, d)
            if loc is None:
                MISSES.append(name)
                loc, nor = Vector(o) + Vector(d).normalized() * 3.0, -Vector(d).normalized()
            row.append(loc + nor * offset)
            nrow.append(nor)
        grid.append(row)
        nors.append(nrow)
    cols = ns + 1 if not closed_s else ns
    verts = [grid[i][j] for i in range(cols) for j in range(nt + 1)]
    idx = lambda i, j: (i % cols) * (nt + 1) + j
    faces = []
    for i in range(ns):
        for j in range(nt):
            faces.append((idx(i, j), idx(i + 1, j), idx(i + 1, j + 1), idx(i, j + 1)))
    # outward winding
    a, b, c = verts[faces[0][0]], verts[faces[0][1]], verts[faces[0][2]]
    if (b - a).cross(c - a).dot(nors[0][0]) < 0:
        faces = [tuple(reversed(f)) for f in faces]
    if wall > 0:
        loop = [(i, 0) for i in range(cols)] + ([] if closed_s else [(ns, j) for j in range(1, nt + 1)])
        if not closed_s:
            loop += [(i, nt) for i in range(ns - 1, -1, -1)] + [(0, j) for j in range(nt - 1, 0, -1)]
            rings = [loop]
        else:
            rings = [[(i, 0) for i in range(cols)], [(i, nt) for i in range(cols)]]
        for ring in rings:
            base = len(verts)
            for (i, j) in ring:
                verts.append(grid[i % (ns + 1)][j] - nors[i % (ns + 1)][j] * wall)
            n = len(ring)
            for k in range(n if (closed_s or ring is rings[0]) else n - 1):
                p, q = ring[k], ring[(k + 1) % n]
                faces.append((idx(*p), idx(*q), base + (k + 1) % n, base + k))
    obj = mesh_object(name, verts, faces, mat, smooth=True)
    obj["grid_ns_nt"] = (ns, nt)
    return obj


def frame_at(loc, nor, along):
    """Orthonormal frame on the surface: x along `along` (projected), z = normal."""
    z = Vector(nor).normalized()
    x = (Vector(along) - z * Vector(along).dot(z)).normalized()
    y = z.cross(x)
    return x, y, z


def flat_shape(name, loc, nor, along, pts2d, depth, mat, lift=0.0):
    """Extrude a 2D outline (in the surface frame) by `depth` along the normal."""
    x, y, z = frame_at(loc, nor, along)
    base = Vector(loc) + z * lift
    ring = [base + x * u + y * v for u, v in pts2d]
    return thick_polygon(name, [tuple(p + z * depth * 0.5) for p in ring], tuple(z * depth), mat, smooth=False)


def stamp_box(name, loc, nor, along, size, mat, lift=0.0, bevel=0.0):
    x, y, z = frame_at(loc, nor, along)
    c = Vector(loc) + z * (lift + size[2] * 0.5)
    hx, hy, hz = size[0] * 0.5, size[1] * 0.5, size[2] * 0.5
    pts = [c + x * sx * hx + y * sy * hy + z * sz * hz
           for sz in (-1, 1) for (sx, sy) in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
    faces = [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
    obj = mesh_object(name, pts, faces, mat, smooth=False)
    if bevel:
        m = obj.modifiers.new("Bevel", 'BEVEL')
        m.width, m.segments, m.limit_method = bevel, 2, 'ANGLE'
    return obj


def seam(name, rays, width=0.0045, lift=0.0012, mat=None):
    """Thin dark strip through a list of (origin, direction) rays."""
    hits = [SHELL.hit(o, d) for o, d in rays]
    hits = [(l, n) for l, n in hits if l is not None]
    if len(hits) < 2:
        MISSES.append(name)
        return None
    verts, faces = [], []
    for k, (l, n) in enumerate(hits):
        a = hits[max(k - 1, 0)][0]
        b = hits[min(k + 1, len(hits) - 1)][0]
        t = (b - a).normalized()
        w = n.cross(t).normalized() * width * 0.5
        verts += [l + n * lift - w, l + n * lift + w]
    for k in range(len(hits) - 1):
        f = (2 * k, 2 * k + 2, 2 * k + 3, 2 * k + 1)
        faces.append(f)
    obj = mesh_object(name, verts, faces, mat or MATS['door_seam'], smooth=True)
    return obj


def resample(pts, step=0.02):
    out = [Vector(pts[0])]
    for a, b in zip(pts, pts[1:]):
        a, b = Vector(a), Vector(b)
        n = max(1, int((b - a).length / step))
        out += [a.lerp(b, (k + 1) / n) for k in range(n)]
    return out


def side_ray(y, z, sign):
    return (sign * 3.0, y, z), (-sign, 0.0, 0.0)


def top_ray(x, y):
    return (x, y, 3.0), (0.0, 0.0, -1.0)


def front_ray(x, z):
    return (x, -4.0, z), (0.0, 1.0, 0.0)


def rear_ray(x, z):
    return (x, 4.0, z), (0.0, -1.0, 0.0)


def radial_ray(cy, theta, z, rear=False):
    s, c = math.sin(theta), math.cos(theta)
    d = Vector((s, c if rear else -c, 0.0))
    return tuple(Vector((0.0, cy, z)) + d * 4.0), tuple(-d)


def facing(ray, cos_min):
    loc, nor = SHELL.hit(*ray)
    return loc is not None and -nor.dot(Vector(ray[1]).normalized()) >= cos_min


def scan_down(make_ray, z_hi, z_lo, cos_min, step=0.003):
    """Highest z (scanning down) where the shell faces the ray at least cos_min."""
    z = z_hi
    while z > z_lo:
        if facing(make_ray(z), cos_min):
            return z
        z -= step
    return z_lo


def scan_out(make_ray, x_lo, x_hi, cos_min, step=0.004):
    """Largest x (scanning out) still facing the ray at least cos_min."""
    x = x_lo
    while x < x_hi and facing(make_ray(x), cos_min):
        x += step
    return x - step


SIDES = ((-1, "left"), (1, "right"))


def corner_x(y):
    """x of the cage corner line (hood edge / pillars / deck edge) at shell y."""
    yn = ny(y)
    return X_CORNER(yn) * plan_factor(yn) * FIT_SX


# ------------------------------------------------------------------ side glass
def smoothed(f, a, b, n, win):
    """Sample f on [a, b], moving-average it, return a linear interpolator.
    Scanned edges step in 3-4 mm jumps; this keeps outlines clean."""
    xs = [a + (b - a) * i / n for i in range(n + 1)]
    vs = [f(x) for x in xs]
    h = win // 2
    sm = [sum(vs[max(0, i - h):i + h + 1]) / len(vs[max(0, i - h):i + h + 1]) for i in range(len(vs))]

    def g(x):
        u = min(max((x - a) / (b - a), 0.0), 1.0) * n
        i = min(int(u), n - 1)
        return sm[i] + (sm[i + 1] - sm[i]) * (u - i)
    return g


DLO_END = wy(1.45)
DLO_SCAN = (wy(-1.10), DLO_END + 0.02)


def dlo_profile(sign):
    """Smoothed (z_low(y), z_high(y), y_start) of the side daylight opening."""
    def low(y):
        return waist(ny(y))[1] * FIT_SZ + 0.014

    def high_raw(y):
        yn = ny(y)
        zc = corner(yn)[1] * FIT_SZ - 0.012
        z_top = scan_down(lambda z: side_ray(y, z, sign), 1.46, low(y), 0.40) - 0.006
        return min(z_top, zc)
    hi = smoothed(high_raw, DLO_SCAN[0], DLO_SCAN[1], 260, 11)

    def high(y):
        z = min(hi(y), low(y) + max(0.0, DLO_END - y) * 1.15)   # quarter window closes to a point
        return max(low(y), z)
    y = DLO_SCAN[0]
    while y < 0 and high(y) - low(y) < 0.012:
        y += 0.004
    return low, high, y


def build_side_glass():
    for sign, tag in SIDES:
        low, high, y_start = dlo_profile(sign)
        windows = [("front_door", y_start + 0.01, wy(0.075)), ("rear_door", wy(0.165), wy(1.035)),
                   ("quarter", wy(1.075), DLO_END)]

        def dlo_fn(y0, y1, grow):
            def fn(s, t):
                y = y0 + (y1 - y0) * s
                lo, hi = low(y), high(y)
                if hi - lo < 0.004:
                    hi = lo + 0.004
                z = (lo - grow) + ((hi + grow) - (lo - grow)) * t
                return side_ray(y, z, sign)
            return fn
        SURROUND_OBJS.append(conform(f"window_surround_{tag}", dlo_fn(y_start - 0.004, DLO_END + 0.014, 0.016),
                                     260, 44, 0.0022, MATS['black']))
        for wname, y0, y1 in windows:
            GLASS_OBJS.append(conform(f"window_{wname}_{tag}", dlo_fn(y0, y1, 0.0), 90, 16, 0.0048, MATS['glass']))
        # chrome strip along the top of the daylight opening, down to the quarter-glass point
        seam(f"window_chrome_{tag}", [side_ray(y, high(y) + 0.019, sign)
                                      for y in [y_start + 0.03 + k * (DLO_END - y_start - 0.03) / 90 for k in range(91)]],
             width=0.008, lift=0.0034, mat=MATS['chrome'])
        # belt molding under the glass
        seam(f"belt_molding_{tag}", [side_ray(y, low(y) - 0.011, sign)
                                     for y in [y_start + k * (DLO_END - y_start) / 80 for k in range(81)]],
             width=0.010, lift=0.0032, mat=MATS['chrome'])


# ------------------------------------------------------------ front / rear glass
def top_glass(name, y_a, y_b, bow_a, bow_b, inset, mat, surround_mat, ns=60, nt=48):
    """Glass seen from above between centre y_a and y_b; its sides stop `inset`
    inside the point where the surface turns down into the pillars."""
    lo_y, hi_y = min(y_a, y_b) - 0.05, max(y_a, y_b) + 0.05
    x_edge = smoothed(lambda y: min(scan_out(lambda x: top_ray(x, y), 0.0, 1.0, 0.60, 0.002),
                                    corner_x(y) - 0.03), lo_y, hi_y, 120, 9)

    def fn_for(grow):
        def fn(s, t):
            u = 2 * t - 1
            y = (y_a - grow) + ((y_b + grow) - (y_a - grow)) * s
            y += (bow_a + (bow_b - bow_a) * s) * u * u
            x = u * (x_edge(y) - inset + grow)
            return top_ray(x, y)
        return fn
    # "windshield" in a node name makes the game swap in glass, so the frame is named apart
    SURROUND_OBJS.append(conform(name.replace("windshield", "front_screen") + "_surround", fn_for(0.016),
                                 ns * 2, nt * 2, 0.0022, surround_mat))
    GLASS_OBJS.append(conform(name, fn_for(0.0), ns, nt, 0.0048, mat))
    return GLASS_OBJS[-1]


def build_front_rear_glass():
    top_glass("windshield", wy(-1.065), wy(-0.135), 0.11, 0.07, 0.018, MATS['windshield'], MATS['black'])
    top_glass("rear_window", wy(1.945), wy(1.055), -0.10, -0.06, 0.036, MATS['glass'], MATS['black'])
    # cowl panel between hood and windshield
    conform("cowl_panel", lambda s, t: top_ray((2 * t - 1) * 0.60, wy(-1.160) + (wy(-1.075) - wy(-1.160)) * s
                                               + 0.11 * (2 * t - 1) ** 2), 4, 20, 0.0015, MATS['grille_mesh'])


# ------------------------------------------------------------------ headlights
HEAD_AXIS = -1.80
TAIL_AXIS = 1.78


def lamp_band(axis, rear, th0, th1, top_margin, height_fn, z_hi, z_lo):
    """Returns fn(s, t) for a lamp band hugging the top of the front / rear face."""
    top = smoothed(lambda th: scan_down(lambda z: radial_ray(axis, th, z, rear), z_hi, z_lo, 0.55, 0.002),
                   th0, th1, 90, 9)

    def band(s0=0.0, s1=1.0, t0=0.0, t1=1.0, grow=0.0):
        def fn(s, t):
            ss = s0 + (s1 - s0) * s
            th = th0 + (th1 - th0) * ss
            zt = top(th) - top_margin + grow
            zb = top(th) - top_margin - height_fn(ss) - grow
            tt = t0 + (t1 - t0) * t
            return radial_ray(axis, th, zb + (zt - zb) * tt, rear)
        return fn
    return band, top


def build_headlights():
    for sign, tag in SIDES:
        th0, th1 = math.radians(24), math.radians(78)
        height = pchip([(0.0, 0.092), (0.30, 0.070), (0.80, 0.050), (1.0, 0.036)])
        band, top = lamp_band(HEAD_AXIS, False, sign * th0, sign * th1, 0.012, height, 0.95, 0.45)
        conform(f"headlamp_housing_{tag}", band(grow=0.006), 40, 6, 0.0025, MATS['headlight_housing'], wall=0.012)
        conform(f"headlamp_drl_{tag}", band(0.02, 0.985, 0.80, 0.94), 40, 2, 0.0050, MATS['drl'])
        conform(f"headlamp_lower_drl_{tag}", band(0.62, 0.97, 0.10, 0.20), 16, 1, 0.0050, MATS['drl'])
        # LED projector modules
        for k, s in enumerate((0.20, 0.31, 0.42, 0.53)):
            o, d = band(t0=0.25, t1=0.55)(s, 0.5)
            loc, nor = SHELL.hit(o, d)
            if loc is None:
                continue
            stamp_box(f"headlamp_led_{tag}_{k + 1}", loc, nor, (sign, 0, 0), (0.026, 0.018, 0.004),
                      MATS['dark_metal'], lift=0.003, bevel=0.002)


# --------------------------------------------------------------------- grille
# GRILLE / GRILLE_Z live with the shell (the shell is recessed there)


def grille_outline(n=240):
    """Closed front-view outline of the grille opening, evenly spaced, with
    outward 2D normals."""
    z0, z1 = GRILLE_Z
    raw = [(GRILLE(z0 + (z1 - z0) * k / 40), z0 + (z1 - z0) * k / 40) for k in range(41)]
    raw += [(GRILLE(z1) * (1 - 2 * k / 30), z1) for k in range(1, 30)]
    raw += [(-GRILLE(z1 - (z1 - z0) * k / 40), z1 - (z1 - z0) * k / 40) for k in range(41)]
    raw += [(-GRILLE(z0) * (1 - 2 * k / 30), z0) for k in range(1, 30)]
    pts = [Vector(p) for p in raw]
    seg = [(pts[(i + 1) % len(pts)] - pts[i]).length for i in range(len(pts))]
    total = sum(seg)
    out, acc, i = [], 0.0, 0
    for k in range(n):
        target = total * k / n
        while acc + seg[i] < target:
            acc += seg[i]
            i += 1
        out.append(pts[i].lerp(pts[(i + 1) % len(pts)], (target - acc) / seg[i]))
    nors = []
    for k in range(n):
        t = (out[(k + 1) % n] - out[k - 1]).normalized()
        nors.append(Vector((t.y, -t.x)))
    # soften the corners of the normal field
    nors = [(nors[k - 2] + nors[k - 1] + nors[k] + nors[(k + 1) % n] + nors[(k + 2) % n]).normalized() for k in range(n)]
    return out, nors


def build_grille():
    z0, z1 = GRILLE_Z
    inset = GRILLE_RAMP                 # the recess floor starts this far inside the outline
    outline, onor = grille_outline(180)
    n = len(outline)

    def bezel(s, t):
        k = min(int(s * n), n - 1)
        p = outline[k % n] + onor[k % n] * (-inset + (inset + 0.016) * t)
        return front_ray(p.x, p.y)
    conform("grille_bezel", bezel, n, 3, 0.0042, MATS["black"])

    def floor(s, t):
        z = z0 + inset + (z1 - z0 - 2 * inset) * t
        return front_ray((2 * s - 1) * (GRILLE(z) - inset + 0.004), z)
    conform("grille_mesh", floor, 36, 14, 0.0030, MATS['grille_mesh'])
    # fine staggered mesh
    rows = 6
    for r in range(rows):
        zc = z0 + GRILLE_RAMP + (z1 - z0 - 2 * GRILLE_RAMP) * (r + 0.5) / rows
        half = GRILLE(zc) - GRILLE_RAMP - 0.006
        pitch = 0.046
        x = -half + (pitch * 0.5 if r % 2 else 0.0)
        k = 0
        while x + 0.030 <= half:
            def bar(s, t, x=x, zc=zc):
                return front_ray(x + 0.030 * s, zc - 0.0045 + 0.009 * t)
            conform(f"grille_bar_{r + 1}_{k + 1}", bar, 2, 1, 0.0060, MATS['black'])
            x += pitch
            k += 1
    # H badge at the top of the grille
    loc, nor = SHELL.hit(*front_ray(0.0, 0.600))
    if loc is not None:
        ell = [(0.052 * math.cos(a), 0.040 * math.sin(a)) for a in [math.tau * i / 28 for i in range(28)]]
        flat_shape("badge_front_ring", loc, nor, (1, 0, 0), ell, 0.003, MATS['chrome'], lift=0.004)
        flat_shape("badge_front_face", loc, nor, (1, 0, 0), [(u * 0.9, v * 0.9) for u, v in ell], 0.004,
                   MATS['black'], lift=0.005)
        for k, pts in enumerate(([(-0.028, -0.026), (-0.017, -0.026), (-0.014, 0.026), (-0.025, 0.026)],
                                 [(0.017, -0.026), (0.028, -0.026), (0.025, 0.026), (0.014, 0.026)],
                                 [(-0.017, -0.004), (0.017, -0.004), (0.016, 0.004), (-0.016, 0.004)])):
            flat_shape(f"badge_front_h_{k + 1}", loc, nor, (1, 0, 0), pts, 0.003, MATS['chrome'], lift=0.007)
    # wide lower intake: black surround, dark mesh, two slats
    def intake(grow, t0=0.0, t1=1.0, shrink=0.0):
        def fn(s, t):
            tt = t0 + (t1 - t0) * t
            z = 0.245 - grow + (0.150 + 2 * grow) * tt
            half = 0.64 - 0.05 * tt + grow - shrink
            return front_ray((2 * s - 1) * half, z)
        return fn
    conform("front_intake_surround", intake(0.014), 40, 6, 0.0018, MATS['black'], wall=0.015)
    conform("front_intake_mesh", intake(0.0), 40, 6, 0.0032, MATS['grille_mesh'])
    for k, t in enumerate((0.36, 0.68)):
        conform(f"front_intake_slat_{k + 1}", intake(0.0, t - 0.06, t + 0.06, 0.02), 30, 1, 0.0055, MATS['black'])
    # front plate on the body-colour bar between grille and intake
    # front plate on the lower intake, where the US car mounts it
    loc, nor = SHELL.hit(*front_ray(0.0, 0.320))
    if loc is not None:
        build_license_plate("front_plate", (0.0, loc.y - 0.014, 0.320), facing_front=True)
    # full-width splitter lip
    conform("front_lower_lip", lambda s, t: front_ray((2 * s - 1) * 0.74, 0.190 + 0.040 * t), 40, 2, 0.002,
            MATS['black'], wall=0.012)


# ------------------------------------------------------------------ tail lamps
def build_taillights():
    """Slim L-signature lamps set well below the deck lip, joined across the
    trunk by a black garnish with a thin light bar and the H badge."""
    margin = 0.125
    bar_z = {}
    for sign, tag in SIDES:
        th0, th1 = math.radians(37), math.radians(78)
        height = pchip([(0.0, 0.058), (0.45, 0.072), (0.78, 0.105), (1.0, 0.085)])
        band, top = lamp_band(TAIL_AXIS, True, sign * th0, sign * th1, margin, height, 1.12, 0.60)
        conform(f"rear_lamp_housing_{tag}", band(grow=0.005), 44, 8, 0.0025, MATS['headlight_housing'], wall=0.012)
        conform(f"taillight_{tag}", band(0.0, 1.0, 0.06, 0.94), 44, 6, 0.0045, MATS['taillight'])
        # L-shaped LED signature: a top strip plus the outer vertical leg
        conform(f"brake_light_{tag}", band(0.02, 0.97, 0.72, 0.86), 44, 1, 0.0058, MATS['brake_light'])
        conform(f"brake_light_leg_{tag}", band(0.80, 0.86, 0.18, 0.86), 4, 6, 0.0058, MATS['brake_light'])
        conform(f"reverse_lamp_{tag}", band(0.05, 0.30, 0.14, 0.42), 10, 1, 0.0058, MATS['reverse_light'])
        o, d = band()(0.0, 1.0)
        bar_z[tag] = o[2]
        conform(f"rear_reflector_{tag}", lambda s, t, sign=sign: radial_ray(TAIL_AXIS, sign * math.radians(50 + 10 * s),
                                                                            0.500 + 0.016 * t, True),
                8, 1, 0.0025, MATS['reflector_red'], wall=0.006)
    # garnish and light bar between the lamps
    zt = min(bar_z.values())
    half = 0.53

    def garnish(t0, t1):
        return lambda s, t: rear_ray((2 * s - 1) * half, zt - 0.070 + 0.070 * (t0 + (t1 - t0) * t))
    conform("rear_garnish", garnish(0.0, 1.0), 60, 4, 0.0030, MATS['black'], wall=0.010)
    conform("taillight_bar", garnish(0.80, 0.93), 60, 1, 0.0045, MATS['taillight'])
    loc, nor = SHELL.hit(*rear_ray(0.0, zt - 0.036))
    if loc is not None:
        ell = [(0.044 * math.cos(a), 0.033 * math.sin(a)) for a in [math.tau * i / 28 for i in range(28)]]
        flat_shape("badge_rear_ring", loc, nor, (-1, 0, 0), ell, 0.004, MATS['chrome'], lift=0.004)
        for k, pts in enumerate(([(-0.024, -0.022), (-0.015, -0.022), (-0.012, 0.022), (-0.021, 0.022)],
                                 [(0.015, -0.022), (0.024, -0.022), (0.021, 0.022), (0.012, 0.022)],
                                 [(-0.015, -0.004), (0.015, -0.004), (0.014, 0.004), (-0.014, 0.004)])):
            flat_shape(f"badge_rear_h_{k + 1}", loc, nor, (-1, 0, 0), pts, 0.004, MATS['chrome'], lift=0.006)
    # ACCORD script (car's left, +X) and hybrid badge (right)
    for k in range(6):
        x = 0.385 + 0.030 * k
        loc, nor = SHELL.hit(*rear_ray(x, 0.708))
        if loc is not None:
            stamp_box(f"script_accord_{k + 1}", loc, nor, (-1, 0, 0), (0.022, 0.018, 0.003), MATS['chrome'], lift=0.001)
    loc, nor = SHELL.hit(*rear_ray(-0.45, 0.705))
    if loc is not None:
        stamp_box("badge_hybrid", loc, nor, (-1, 0, 0), (0.105, 0.030, 0.003), MATS['chrome'], lift=0.001)
    plate_z = 0.760
    loc, nor = SHELL.hit(*rear_ray(0.0, plate_z))
    if loc is not None:
        conform("rear_plate_recess", lambda s, t: rear_ray((2 * s - 1) * 0.20, plate_z - 0.090 + 0.180 * t), 10, 6,
                0.0012, MATS['black'])
        build_license_plate("rear_plate", (0.0, min(loc.y + 0.010, LENGTH * 0.5 - 0.0125), plate_z),
                            facing_front=False, is_dealer_plate=True)
    # black lower bumper
    conform("rear_lower_valance", lambda s, t: rear_ray((2 * s - 1) * 0.76, 0.250 + 0.115 * t), 44, 4, 0.002,
            MATS['grille_mesh'], wall=0.014)

    # ducktail spoiler lip on the deck
    def lip(s, t):
        y = 2.315 + 0.040 * t
        return top_ray((2 * s - 1) * 0.60, y)
    conform("deck_spoiler", lip, 48, 2, 0.005, MATS['black'], wall=0.007)


# ---------------------------------------------------------------- side details
def build_side_details():
    for sign, tag in SIDES:
        zs = lambda y: min(SHOULDER(ny(y)), waist(ny(y))[1] - 0.045) * FIT_SZ
        belt = lambda y: waist(ny(y))[1] * FIT_SZ
        fa, ra = FRONT_AXLE_Y, REAR_AXLE_Y
        R = ARCH_RADIUS + 0.045
        cz = WHEEL_RADIUS + ARCH_LIFT
        # front door leading edge, B split, rear door trailing edge round the arch
        front_edge = [(-0.975, 0.215), (-0.99, 0.45), (-0.985, 0.70), (-0.955, 0.86), (-0.90, belt(-0.90) - 0.01)]
        b_split = [(0.105, 0.205), (0.110, 0.60), (0.118, belt(0.12) - 0.01)]
        arc = [(ra - R * math.cos(math.radians(a)), cz + R * math.sin(math.radians(a))) for a in range(-12, 72, 6)]
        rear_edge = [(arc[0][0], 0.205)] + arc + [(arc[-1][0] + 0.02, 0.86), (arc[-1][0] + 0.07, belt(arc[-1][0] + 0.07) - 0.01)]
        sill = [(-0.975, 0.215), (arc[0][0], 0.215)]
        for nm, pts in (("front_door_edge", front_edge), ("b_split", b_split), ("rear_door_edge", rear_edge),
                        ("door_sill", sill)):
            seam(f"shutline_{nm}_{tag}", [side_ray(y, z, sign) for y, z in [tuple(p) for p in resample(pts, 0.015)]])
        # fender to bumper split behind the headlamp
        fb = [(fa - 0.43, 0.84), (fa - 0.47, 0.66), (fa - 0.50, 0.50)]
        seam(f"shutline_front_bumper_{tag}", [side_ray(y, z, sign) for y, z in [tuple(p) for p in resample(fb, 0.015)]])
        rb = [(ra + 0.52, 0.86), (ra + 0.50, 0.66), (ra + 0.47, 0.50)]
        seam(f"shutline_rear_bumper_{tag}", [side_ray(y, z, sign) for y, z in [tuple(p) for p in resample(rb, 0.015)]])
        # rolled arch lips, body coloured, hiding the boolean edge
        for nm, ay in (("front", fa), ("rear", ra)):
            def lip(s_, t, ay=ay):
                a = math.radians(-8 + 196 * s_)
                r = ARCH_RADIUS + 0.002 + 0.026 * t
                return side_ray(ay - r * math.cos(a), cz + r * math.sin(a), sign)
            conform(f"arch_lip_{nm}_{tag}", lip, 70, 2, 0.0028, MATS['paint'], wall=0.03)
        # black side-sill garnish between the arches
        conform(f"sill_garnish_{tag}", lambda s_, t, sign=sign: side_ray(fa + 0.40 + (ra - fa - 0.80) * s_,
                                                                         0.205 + 0.060 * t, sign),
                60, 3, 0.002, MATS['black'], wall=0.010)
        # door handles on the shoulder line
        for nm, y in (("front", -0.30), ("rear", 0.64)):
            z = zs(y) + 0.030
            loc, nor = SHELL.hit(*side_ray(y, z, sign))
            if loc is None:
                continue
            conform(f"door_handle_pocket_{nm}_{tag}", lambda s, t, y=y, z=z: side_ray(y - 0.085 + 0.17 * s, z - 0.022 + 0.044 * t, sign),
                    8, 3, 0.0010, MATS['door_seam'])
            stamp_box(f"door_handle_{nm}_{tag}", loc, nor, (0, 1, 0), (0.160, 0.026, 0.012), MATS['paint'],
                      lift=-0.002, bevel=0.005)
        # mirror: stalk from the door, housing, glass, repeater
        y_m = wy(-0.80)
        z_m = belt(y_m) + 0.022
        loc, nor = SHELL.hit(*side_ray(y_m, z_m, sign))
        if loc is not None:
            base = loc
            head = Vector((sign * (abs(base.x) + 0.100), base.y + 0.040, base.z + 0.040))
            stamp_box(f"mirror_mount_{tag}", base, nor, (0, 1, 0), (0.075, 0.045, 0.016), MATS['black'], bevel=0.005)
            cylinder_between(f"mirror_arm_{tag}", base + nor * 0.01, head - Vector((sign * 0.05, 0, 0.01)), 0.018,
                             MATS['black'], segments=12)
            superellipsoid(f"mirror_cap_{tag}", head, (0.094, 0.050, 0.058), 0.70, 0.65, MATS['black'])
            mirror_face(f"mirror_face_{tag}", head, sign)
            box_object(f"mirror_repeater_{tag}", (head.x + sign * 0.02, head.y - 0.044, head.z - 0.030),
                       (0.10, 0.012, 0.010), MATS['amber'])
        # fuel door (right rear quarter)
        if sign > 0:
            c = (wy(1.73), 0.845)
            ring = [(c[0] + 0.082 * math.cos(a), c[1] + 0.062 * math.sin(a)) for a in [math.tau * k / 40 for k in range(41)]]
            seam("shutline_fuel_door", [side_ray(y, z, sign) for y, z in ring], width=0.0035)


def superellipsoid(name, center, radii, e1, e2, mat, seg=24, rings=14):
    def spow(v, e):
        return math.copysign(abs(v) ** e, v)
    verts, faces = [], []
    for i in range(rings + 1):
        phi = -math.pi / 2 + math.pi * i / rings
        for j in range(seg):
            th = math.tau * j / seg
            x = radii[0] * spow(math.cos(phi), e1) * spow(math.cos(th), e2)
            y = radii[1] * spow(math.cos(phi), e1) * spow(math.sin(th), e2)
            z = radii[2] * spow(math.sin(phi), e1)
            verts.append(Vector(center) + Vector((x, y, z)))
    for i in range(rings):
        for j in range(seg):
            a, b = i * seg + j, i * seg + (j + 1) % seg
            faces.append((a, b, b + seg, a + seg))
    return mesh_object(name, verts, faces, mat, smooth=True)


def mirror_face(name, head, sign):
    """The mirror glass on the rearward face of the housing (+Y)."""
    pts = []
    for k in range(24):
        a = math.tau * k / 24
        u, v = math.cos(a), math.sin(a)
        pts.append((head.x + 0.080 * math.copysign(abs(u) ** 0.5, u), head.y + 0.049,
                    head.z + 0.048 * math.copysign(abs(v) ** 0.5, v)))
    return thick_polygon(name, pts, (0, 0.004, 0), MATS['chrome'], smooth=False)


# -------------------------------------------------------------- top details
def build_top_details():
    # hood shut lines: along both hood edges, across the rear, across the front
    hood_x = corner_x
    ys = [wy(-2.30) + k * (wy(-1.165) - wy(-2.30)) / 50 for k in range(51)]
    for sign, tag in SIDES:
        seam(f"shutline_hood_{tag}", [top_ray(sign * (hood_x(y) - 0.006), y) for y in ys])
    seam("shutline_hood_rear", [top_ray(x, wy(-1.162) + 0.11 * (x / 0.66) ** 2) for x in [-0.70 + k * 0.035 for k in range(41)]])
    # trunk lid lines
    ys = [wy(1.97) + k * (wy(2.36) - wy(1.97)) / 24 for k in range(25)]
    for sign, tag in SIDES:
        seam(f"shutline_deck_{tag}", [top_ray(sign * (hood_x(y) - 0.010), y) for y in ys])
    seam("shutline_deck_rear", [rear_ray(x, 0.655) for x in [-0.64 + k * 0.032 for k in range(41)]])
    # wipers
    for k, (x0, x1) in enumerate(((-0.62, 0.02), (-0.05, 0.55))):
        y0 = wy(-1.04) + 0.11 * (x0 / 0.66) ** 2
        y1 = wy(-0.92)
        a, na = SHELL.hit(*top_ray(x0, y0))
        b, nb = SHELL.hit(*top_ray(x1, y1))
        if a is None or b is None:
            continue
        n = (na + nb).normalized()
        mid = (a + b) * 0.5
        stamp_box(f"wiper_blade_{k + 1}", mid, n, b - a, ((b - a).length, 0.016, 0.012), MATS['black'], lift=0.006)
    # shark-fin antenna on the roof, body coloured
    loc, nor = SHELL.hit(*top_ray(0.0, wy(1.17)))
    if loc is not None:
        prof = [(-0.085, 0.0), (0.075, 0.0), (0.060, 0.012), (0.020, 0.040), (-0.010, 0.060), (-0.030, 0.060)]
        pts = [(0.0, loc.y + py, loc.z - 0.004 + pz) for py, pz in prof]
        thick_polygon("antenna_fin", pts, (0.058, 0, 0), MATS['paint'], smooth=False)


build_side_glass()
build_front_rear_glass()
build_headlights()
build_grille()
build_taillights()
build_side_details()
build_top_details()
REPORT_DETAILS = {"misses": sorted(set(MISSES))}
print("DETAILS", REPORT_DETAILS)


# ==============================================================================
# Window openings and the cabin
# The glass is laid on the closed shell first; here the shell is opened under
# each pane, the black surrounds become frit rings (hiding the cut), an inward
# facing liner gives the cabin walls and headliner, and the interior is built.
# Driver sits on +X (left-hand drive, front of the car is -Y).
# ==============================================================================

from mathutils.kdtree import KDTree

MATS.update({
    'leather': make_pbr_material('cabin_leather', 0x17181A, roughness=0.52, coat=0.15),
    'leather_red': make_pbr_material('cabin_leather_red', 0x5A1216, roughness=0.5, coat=0.15),
    'plastic': make_pbr_material('cabin_plastic', 0x1C1D20, roughness=0.72),
    'headliner': make_pbr_material('headliner', 0x77746F, roughness=0.95),
    'carpet': make_pbr_material('carpet', 0x121315, roughness=1.0),
    'screen': make_pbr_material('cabin_screen', 0x04070B, metallic=0.1, roughness=0.08, coat=1.0,
                                emission=0x163A5C, emission_strength=1.2),
    'accent': make_pbr_material('cabin_accent', 0x2F3337, metallic=0.85, roughness=0.3),
})


# the panes are see-through now that there is a cabin behind them
for _m in (MATS['glass'], MATS['windshield']):
    _b = _m.node_tree.nodes['Principled BSDF']
    _b.inputs['Alpha'].default_value = 0.38
    _m.blend_method = 'BLEND'
    if hasattr(_m, "surface_render_method"):
        _m.surface_render_method = 'BLENDED'


def _glass_bvh():
    verts, polys = [], []
    for o in GLASS_OBJS:
        base = len(verts)
        verts += [v.co.copy() for v in o.data.vertices]
        polys += [[base + i for i in p.vertices] for p in o.data.polygons]
    return BVHTree.FromPolygons(verts, polys)


def _glass_edges():
    pts = []
    for o in GLASS_OBJS:
        me = o.data
        count = {}
        for p in me.polygons:
            for e in p.edge_keys:
                count[e] = count.get(e, 0) + 1
        for (a, b), c in count.items():
            if c == 1:
                A, B = me.vertices[a].co, me.vertices[b].co
                n = max(1, int((B - A).length / 0.003))
                pts += [A.lerp(B, k / n) for k in range(n + 1)]
    kd = KDTree(len(pts))
    for i, p in enumerate(pts):
        kd.insert(p, i)
    kd.balance()
    return kd


def _cut_under_glass(obj, bvh, kd, margin):
    """Delete faces that lie under a pane and more than `margin` inside its edge."""
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.normal_update()
    dead = []
    for f in bm.faces:
        c, n = f.calc_center_median(), f.normal
        if kd.find(c)[2] <= margin:
            continue
        if bvh.ray_cast(c - n * 0.001, n, 0.03)[0] is not None:
            dead.append(f)
    bmesh.ops.delete(bm, geom=dead, context='FACES')
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()
    return len(dead)


def frit_ring(glass, inside=0.032, outside=0.006, lift=0.0036, suffix="_frit", mat=None):
    """Black ceramic band round a pane: a clean strip following the pane's
    edge, from `outside` beyond it to `inside` under it."""
    ns, nt = glass["grid_ns_nt"]
    me = glass.data
    P = lambda i, j: me.vertices[i * (nt + 1) + j].co
    loop = [(i, 0, i, 1) for i in range(ns + 1)] + [(ns, j, ns - 1, j) for j in range(1, nt + 1)]
    loop += [(i, nt, i, nt - 1) for i in range(ns - 1, -1, -1)] + [(0, j, 1, j) for j in range(nt - 1, 0, -1)]
    offsets = (-outside, 0.0, inside * 0.35, inside * 0.7, inside)
    rows, d_prev = [], Vector((0, 0, 1))
    for i, j, qi, qj in loop:
        p = P(i, j)
        o, n = SHELL.bvh.find_nearest(p)[:2]
        d = P(qi, qj) - p
        d -= n * d.dot(n)
        if d.length < 1e-4:
            d = d_prev
        d = d.normalized()
        d_prev = d
        row = []
        for off in offsets:
            q = p + d * off
            loc, nor = SHELL.hit(q + n * 0.05, -n)
            if loc is None:
                loc, nor = SHELL.bvh.find_nearest(q)[:2]
            row.append(loc + nor * lift)
        rows.append(row)
    k = len(offsets)
    verts = [v for row in rows for v in row]
    faces = []
    m = len(rows)
    for a in range(m):
        b = (a + 1) % m
        for c in range(k - 1):
            faces.append((a * k + c, b * k + c, b * k + c + 1, a * k + c + 1))
    base = glass.name.replace("windshield", "front_screen")   # keep "windshield" off non-glass nodes
    return mesh_object(base + suffix, verts, faces, mat or MATS['black'], smooth=True)


def open_windows(shell):
    bvh, kd = _glass_bvh(), _glass_edges()
    report = {"shell_faces_cut": _cut_under_glass(shell, bvh, kd, 0.018)}
    # surrounds keep only what lies outside the panes (B-pillar, edges); the
    # stair-stepped cut is covered by a clean frit band on every pane
    report["surround_faces_cut"] = sum(_cut_under_glass(o, bvh, kd, 0.018) for o in SURROUND_OBJS)
    for g in GLASS_OBJS:
        frit_ring(g)
        # the cabin side: a moulding just inside the liner hides its cut edge
        frit_ring(g, inside=0.036, outside=0.004, lift=-0.0145, suffix="_inner_moulding", mat=MATS['plastic'])
    return report


def build_liner(shell):
    """Inward-facing copy of the cabin part of the shell: door cards, pillars,
    headliner. Paint is single sided in game, so without it the roof would
    vanish when seen through the glass."""
    y0, y1 = wy(-1.13), wy(2.02)
    src = shell.data
    bm = bmesh.new()
    bm.from_mesh(src)
    bm.normal_update()
    keep = [f for f in bm.faces if y0 < f.calc_center_median().y < y1 and f.calc_center_median().z > 0.30]
    out = bmesh.new()
    vmap = {}
    for f in keep:
        vs = []
        for v in f.verts:
            nv = vmap.get(v.index)
            if nv is None:
                nv = out.verts.new(v.co - v.normal * 0.012)
                vmap[v.index] = nv
            vs.append(nv)
        nf = out.faces.new(list(reversed(vs)))
        nf.material_index = 1 if f.calc_center_median().z > 1.16 else 0
        nf.smooth = True
    bm.free()
    me = bpy.data.meshes.new("cabin_liner Mesh")
    out.to_mesh(me)
    out.free()
    obj = bpy.data.objects.new("cabin_liner", me)
    ASSET_COLLECTION.objects.link(obj)
    obj.parent = ROOT
    me.materials.append(MATS['plastic'])
    me.materials.append(MATS['headliner'])
    return obj


def rounded_box(name, center, size, mat, rot=(0.0, 0.0, 0.0), radius=0.03, segments=3):
    obj = box_object(name, center, size, mat, rotation=rot)
    m = obj.modifiers.new("Round", 'BEVEL')
    m.width, m.segments, m.limit_method = radius, segments, 'NONE'
    m.use_clamp_overlap = True
    for p in obj.data.polygons:
        p.use_smooth = True
    obj.modifiers.new("WeightedNormal", 'WEIGHTED_NORMAL').keep_sharp = True
    return obj


def torus_frame(name, center, axis_up, normal, R, r, mat, seg=48, tube=12, arc=(0.0, math.tau)):
    X = axis_up.cross(normal).normalized()
    Y = normal.cross(X).normalized()
    Z = normal.normalized()
    closed = abs(arc[1] - arc[0] - math.tau) < 1e-6
    n_u = seg if closed else seg + 1
    verts = []
    for i in range(n_u):
        u = arc[0] + (arc[1] - arc[0]) * i / seg
        for j in range(tube):
            v = math.tau * j / tube
            rr = R + r * math.cos(v)
            p = X * (rr * math.cos(u)) + Y * (rr * math.sin(u)) + Z * (r * math.sin(v))
            verts.append(Vector(center) + p)
    faces = []
    for i in range(seg):
        i2 = (i + 1) % n_u
        for j in range(tube):
            j2 = (j + 1) % tube
            faces.append((i * tube + j, i2 * tube + j, i2 * tube + j2, i * tube + j2))
    return mesh_object(name, verts, faces, mat, smooth=True)


def build_front_seat(tag, x):
    rounded_box(f"seat_{tag}_cushion", (x, 0.12, 0.47), (0.50, 0.52, 0.13), MATS['leather'], radius=0.045)
    rounded_box(f"seat_{tag}_cushion_bolster_l", (x - 0.21, 0.12, 0.52), (0.08, 0.50, 0.10), MATS['leather'], radius=0.035)
    rounded_box(f"seat_{tag}_cushion_bolster_r", (x + 0.21, 0.12, 0.52), (0.08, 0.50, 0.10), MATS['leather'], radius=0.035)
    tilt = (-0.27, 0.0, 0.0)
    rounded_box(f"seat_{tag}_back", (x, 0.47, 0.84), (0.50, 0.13, 0.66), MATS['leather'], rot=tilt, radius=0.05)
    for side in (-1, 1):
        rounded_box(f"seat_{tag}_back_bolster_{'l' if side < 0 else 'r'}", (x + side * 0.215, 0.45, 0.80),
                    (0.08, 0.15, 0.52), MATS['leather'], rot=tilt, radius=0.035)
    rounded_box(f"seat_{tag}_stitch_panel", (x, 0.405, 0.82), (0.26, 0.01, 0.46), MATS['leather_red'], rot=tilt, radius=0.004, segments=1)
    rounded_box(f"seat_{tag}_headrest", (x, 0.58, 1.24), (0.26, 0.10, 0.17), MATS['leather'], rot=tilt, radius=0.04)
    cylinder_between(f"seat_{tag}_headrest_post_a", (x - 0.07, 0.56, 1.12), (x - 0.07, 0.575, 1.17), 0.006, MATS['chrome'])
    cylinder_between(f"seat_{tag}_headrest_post_b", (x + 0.07, 0.56, 1.12), (x + 0.07, 0.575, 1.17), 0.006, MATS['chrome'])
    box_object(f"seat_{tag}_frame", (x, 0.12, 0.36), (0.40, 0.46, 0.08), MATS['plastic'])


def build_dashboard():
    # main dash: a section in (y, z) swept across the car
    sec = [(-1.12, 0.960), (-0.84, 0.995), (-0.64, 0.975), (-0.50, 0.935), (-0.43, 0.890), (-0.41, 0.800),
           (-0.45, 0.640), (-0.55, 0.520), (-1.12, 0.520)]
    pts = [(0.0, y, z) for y, z in sec]
    dash = thick_polygon("dashboard", pts, (1.62, 0, 0), MATS['plastic'], smooth=True)
    m = dash.modifiers.new("Round", 'BEVEL')
    m.width, m.segments, m.limit_method = 0.02, 3, 'ANGLE'
    # soft upper pad in leather with red stitching line
    rounded_box("dash_pad", (0.0, -0.58, 0.945), (1.56, 0.26, 0.05), MATS['leather'], rot=(0.30, 0, 0), radius=0.02)
    rounded_box("dash_stitch", (0.0, -0.47, 0.905), (1.50, 0.006, 0.006), MATS['leather_red'], radius=0.002, segments=1)
    # full-width honeycomb vent band (11th gen signature)
    rounded_box("dash_vent_band", (0.0, -0.415, 0.83), (1.46, 0.02, 0.045), MATS['black'], radius=0.006)
    for k in range(40):
        x = -0.70 + k * 1.40 / 39
        box_object(f"dash_vent_fin_{k + 1}", (x, -0.405, 0.83), (0.004, 0.01, 0.036), MATS['accent'])
    # floating 12.3in touchscreen and 10.2in digital cluster
    rounded_box("center_screen_bezel", (0.0, -0.55, 1.075), (0.31, 0.016, 0.18), MATS['black'], rot=(-0.18, 0, 0), radius=0.008)
    box_object("center_screen", (0.0, -0.541, 1.075), (0.29, 0.004, 0.16), MATS['screen'], rotation=(-0.18, 0, 0))
    rounded_box("cluster_hood", (0.37, -0.50, 0.975), (0.30, 0.10, 0.06), MATS['plastic'], radius=0.02)
    box_object("cluster_screen", (0.37, -0.455, 0.945), (0.26, 0.004, 0.085), MATS['screen'], rotation=(-0.25, 0, 0))
    # climate panel and console
    rounded_box("climate_panel", (0.0, -0.44, 0.71), (0.32, 0.03, 0.09), MATS['black'], radius=0.01)
    for k, x in enumerate((-0.11, 0.11)):
        cylinder_between(f"climate_knob_{k + 1}", (x, -0.43, 0.71), (x, -0.405, 0.71), 0.022, MATS['accent'], segments=20)
    rounded_box("center_console", (0.0, -0.05, 0.53), (0.26, 0.84, 0.17), MATS['plastic'], radius=0.03)
    rounded_box("console_armrest", (0.0, 0.25, 0.63), (0.22, 0.30, 0.05), MATS['leather'], radius=0.02)
    rounded_box("console_shift_panel", (0.0, -0.30, 0.62), (0.18, 0.20, 0.02), MATS['black'], radius=0.006)
    for k in range(4):
        box_object(f"shift_button_{k + 1}", (-0.045 + 0.03 * k, -0.30, 0.633), (0.022, 0.03, 0.008), MATS['accent'])
    # glovebox seam and door speakers read from outside at night: keep simple


def build_steering_wheel():
    c = Vector((0.37, -0.35, 0.90))
    up = Vector((0.0, -math.sin(math.radians(24)), math.cos(math.radians(24))))
    n = Vector((0.0, math.cos(math.radians(24)), math.sin(math.radians(24))))
    torus_frame("steering_wheel_ring", c, up, n, 0.182, 0.016, MATS['leather'], seg=56, tube=12)
    hub = c - n * 0.02
    cylinder_between("steering_wheel_hub", hub - n * 0.03, hub + n * 0.02, 0.058, MATS['plastic'], segments=24)
    cylinder_between("steering_column", hub - n * 0.03, hub - n * 0.24, 0.04, MATS['plastic'], segments=16)
    X = up.cross(n).normalized()
    for k, dirv in enumerate((X, -X, -up)):
        a = hub + dirv * 0.05
        b = c + dirv * 0.172
        cylinder_between(f"steering_wheel_spoke_{k + 1}", a, b, 0.012, MATS['plastic'], segments=10)
    ell = [(0.024 * math.cos(t), 0.018 * math.sin(t)) for t in [math.tau * i / 20 for i in range(20)]]
    flat_shape("steering_badge", hub + n * 0.02, n, X, ell, 0.003, MATS['chrome'])


def build_rear_bench():
    rounded_box("rear_seat_cushion", (0.0, 1.00, 0.47), (1.34, 0.50, 0.14), MATS['leather'], radius=0.05)
    tilt = (-0.40, 0.0, 0.0)
    for k, x in enumerate((-0.44, 0.0, 0.44)):
        rounded_box(f"rear_seat_back_{k + 1}", (x, 1.30, 0.78), (0.43, 0.13, 0.56), MATS['leather'], rot=tilt, radius=0.05)
        rounded_box(f"rear_headrest_{k + 1}", (x, 1.42, 1.08), (0.22 if k != 1 else 0.18, 0.09, 0.12),
                    MATS['leather'], rot=tilt, radius=0.035)
    rounded_box("parcel_shelf", (0.0, 1.62, 1.04), (1.40, 0.50, 0.02), MATS['carpet'], rot=(0.05, 0, 0), radius=0.008, segments=1)


def build_cabin_floor():
    rounded_box("carpet_floor", (0.0, 0.27, 0.30), (1.56, 2.46, 0.03), MATS['carpet'], radius=0.01, segments=1)
    rounded_box("firewall", (0.0, -1.10, 0.62), (1.56, 0.03, 0.66), MATS['carpet'], radius=0.01, segments=1)
    for tag, x in (("left", 0.72), ("right", -0.72)):
        rounded_box(f"door_card_armrest_{tag}", (x, -0.40, 0.70), (0.08, 0.60, 0.05), MATS['leather'], radius=0.02)
        rounded_box(f"door_card_armrest_rear_{tag}", (x * 1.0, 0.62, 0.70), (0.08, 0.50, 0.05), MATS['leather'], radius=0.02)


def build_mirror_and_visors():
    cylinder_between("rear_view_mirror_stem", (0.0, -0.17, 1.385), (0.0, -0.20, 1.335), 0.008, MATS['black'])
    rounded_box("rear_view_mirror", (0.0, -0.205, 1.32), (0.25, 0.035, 0.068), MATS['black'], radius=0.015)
    box_object("rear_view_mirror_face", (0.0, -0.1865, 1.32), (0.23, 0.002, 0.052), MATS['chrome'])
    for tag, x in (("left", 0.36), ("right", -0.36)):
        rounded_box(f"sun_visor_{tag}", (x, 0.03, 1.37), (0.38, 0.16, 0.02), MATS['headliner'], rot=(0.25, 0, 0), radius=0.008)


INTERIOR_REPORT = open_windows(shell)
build_liner(shell)
build_dashboard()
build_steering_wheel()
build_front_seat("driver", 0.37)
build_front_seat("passenger", -0.37)
build_rear_bench()
build_cabin_floor()
build_mirror_and_visors()
print("INTERIOR", INTERIOR_REPORT)


# ==============================================================================
# Bake modifiers, stamp metadata, save the .blend and export the GLB
# ==============================================================================


def activate_only(obj):
    bpy.ops.object.select_all(action='DESELECT')
    obj.hide_set(False)
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


for obj in list(ASSET_COLLECTION.all_objects):
    if obj.type != 'MESH':
        continue
    activate_only(obj)
    for modifier in list(obj.modifiers):
        bpy.ops.object.modifier_apply(modifier=modifier.name)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.dissolve_degenerate(bm, dist=1e-6, edges=bm.edges)
    bm.to_mesh(obj.data)
    bm.free()
    for name in ("crease_edge", "crease_vert"):
        a = obj.data.attributes.get(name)
        if a is not None:
            obj.data.attributes.remove(a)
    obj.data.update()

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
ROOT['front_axle_y_m'] = FRONT_AXLE_Y
ROOT['rear_axle_y_m'] = REAR_AXLE_Y
ROOT['front_overhang_m'] = FRONT_OVERHANG
ROOT['model_revision'] = 'v2 body shell (subdivided box cage, 2026-09-24)'

asset_objs = [o for o in ASSET_COLLECTION.all_objects]
mesh_objs = [o for o in asset_objs if o.type == 'MESH']
bpy.context.view_layer.update()
pts = [o.matrix_world @ Vector(c) for o in mesh_objs for c in o.bound_box]
b_min = [min(p[i] for p in pts) for i in range(3)]
b_max = [max(p[i] for p in pts) for i in range(3)]

activate_only(ROOT)
bpy.ops.wm.save_as_mainfile(filepath=BLEND_PATH)
bpy.ops.object.select_all(action='DESELECT')
for o in asset_objs:
    if o.type not in ('CAMERA', 'LIGHT'):
        o.select_set(True)
bpy.ops.export_scene.gltf(filepath=GLB_EXPORT_PATH, use_selection=True, export_format='GLB', export_yup=True,
                          export_materials='EXPORT', export_cameras=False, export_lights=False)
EXPORT_SUMMARY = {
    'blend': BLEND_PATH, 'glb': GLB_EXPORT_PATH, 'glb_bytes': os.path.getsize(GLB_EXPORT_PATH),
    'objects': len(asset_objs), 'meshes': len(mesh_objs),
    'verts': sum(len(o.data.vertices) for o in mesh_objs),
    'tris': sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in mesh_objs),
    'bounds_min': [round(v, 4) for v in b_min], 'bounds_max': [round(v, 4) for v in b_max],
    'missing_wheels': [n for n in wheel_nodes if bpy.data.objects.get(n) is None],
    'missing_calipers': [n for n in caliper_nodes if bpy.data.objects.get(n) is None],
    'missing_materials': [m for m in required_materials if bpy.data.materials.get(m) is None],
}
print("EXPORT", json.dumps(EXPORT_SUMMARY))

def review_renders(out_dir):
    """Studio shots for checking the shape (runs after the export)."""
    # --- review studio (not exported); paint shown mid grey so the shape reads
    _bsdf = MATS['paint'].node_tree.nodes['Principled BSDF']
    _paint_colour = tuple(_bsdf.inputs['Base Color'].default_value)
    _bsdf.inputs['Base Color'].default_value = (0.20, 0.235, 0.27, 1.0)
    for _m in ('glass', 'windshield'):
        _g = bpy.data.materials[_m].node_tree.nodes['Principled BSDF']
        _g.inputs['Base Color'].default_value = (0.012, 0.016, 0.02, 1.0)
        _g.inputs['Coat Weight'].default_value = 0.25
        _g.inputs['Roughness'].default_value = 0.18
    cam_data = bpy.data.cameras.new("rev cam")
    camera = bpy.data.objects.new("rev cam", cam_data)
    STUDIO_COLLECTION.objects.link(camera)
    SCENE.camera = camera


    def light(name, loc, energy, size, target=(0, 0, 0.6)):
        d = bpy.data.lights.new(name, 'AREA')
        d.energy, d.size = energy, size
        o = bpy.data.objects.new(name, d)
        STUDIO_COLLECTION.objects.link(o)
        o.location = loc
        o.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()


    light("key", (4.5, -4.0, 5.5), 1400, 5.0)
    light("fill", (-5.0, -1.0, 4.0), 700, 5.0)
    light("rim", (0.5, 5.5, 4.5), 1000, 4.0)
    light("low", (0.0, -5.5, 1.2), 250, 4.0)
    light("top", (0.0, 0.0, 6.0), 900, 6.0)
    world = bpy.data.worlds.new("rev world")
    SCENE.world = world
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.55, 0.58, 0.62, 1.0)
    world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.55
    floor_obj = mesh_object("_floor", [(-20, -20, 0), (20, -20, 0), (20, 20, 0), (-20, 20, 0)], [(0, 1, 2, 3)],
                        make_pbr_material("_floor_mat", 0x9aa0a6, roughness=0.9), parent=None,
                        collection=STUDIO_COLLECTION, smooth=False)
    SCENE.render.resolution_x, SCENE.render.resolution_y = 1100, 640
    VIEWS = {
        "side": ((7.2, 0.0, 0.75), (0.0, 0.0, 0.68), 50, True),
        "front34": ((4.3, -4.9, 1.45), (0.0, -0.5, 0.62), 42, False),
        "rear34": ((4.4, 5.0, 1.55), (0.0, 0.5, 0.65), 42, False),
        "front": ((0.0, -7.5, 0.80), (0.0, 0.0, 0.66), 50, False),
        "rear": ((0.0, 7.5, 0.90), (0.0, 0.0, 0.70), 50, False),
        "top": ((0.0, 0.0, 9.0), None, 50, True),
        "low34": ((3.2, -3.9, 0.55), (0.0, -1.2, 0.60), 36, False),
        "apillar": ((2.3, -1.9, 1.55), (0.75, -0.55, 1.05), 45, False),
        "cpillar": ((2.5, 2.9, 1.65), (0.6, 1.35, 1.10), 45, False),
        "nose": ((1.5, -4.2, 0.85), (0.25, -2.3, 0.55), 45, False),
        "cabin": ((1.9, -0.9, 1.30), (0.2, 0.0, 0.85), 40, False),
        "wheel": ((2.0, -1.9, 0.45), (0.85, -1.53, 0.33), 40, False),
        "cockpit": ((0.37, 0.40, 1.15), (0.3, -0.8, 0.95), 24, False),
    }
    for name, (eye, tgt, lens, ortho) in VIEWS.items():
        camera.location = eye
        camera.rotation_euler = (0.0, 0.0, math.pi / 2) if tgt is None else (Vector(tgt) - Vector(eye)).to_track_quat('-Z', 'Y').to_euler()
        cam_data.type = 'ORTHO' if ortho else 'PERSP'
        cam_data.ortho_scale = 5.6
        cam_data.lens = lens
        SCENE.render.filepath = os.path.join(out_dir, "accord_v2_%s.png" % name)
        bpy.ops.render.render(write_still=True)



if RENDER_DIR:
    os.makedirs(RENDER_DIR, exist_ok=True)
    review_renders(RENDER_DIR)
