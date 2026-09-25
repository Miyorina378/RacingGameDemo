import bpy
import math
import os
import json
from mathutils import Vector, Matrix, Euler

SCENE = bpy.context.scene
ROOT_DIR = r"D:\RacingGameDemo"
BLEND_PATH = os.path.join(ROOT_DIR, "toyota_gt_one_1998.blend")
GLB_PATH = os.path.join(ROOT_DIR, "public", "models", "toyota_gt_one_1998.glb")

LENGTH = 4.840
WIDTH = 2.000
HEIGHT = 1.125
WHEELBASE = 2.800
FRONT_TRACK = 1.690
REAR_TRACK = 1.610
WHEEL_RADIUS = 0.335
TIRE_WIDTH_FRONT = 0.310
TIRE_WIDTH_REAR = 0.335
GROUND_CLEARANCE = 0.065
FRONT_AXLE_Y = -WHEELBASE * 0.5  # -1.400
REAR_AXLE_Y = WHEELBASE * 0.5   # +1.400

def clear_scene():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    for collection in list(bpy.data.collections):
        bpy.data.collections.remove(collection)
    for blocks in (bpy.data.meshes, bpy.data.curves, bpy.data.materials, bpy.data.cameras, bpy.data.lights):
        for block in list(blocks):
            blocks.remove(block)

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

def mesh_object(name, vertices, faces, material=None, parent=ROOT, smooth=True):
    mesh = bpy.data.meshes.new(name + " Mesh")
    mesh.from_pydata([tuple(v) for v in vertices], [], [tuple(f) for f in faces])
    mesh.validate(verbose=False)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    ASSET_COLLECTION.objects.link(obj)
    if parent is not None:
        obj.parent = parent
    if material is not None:
        obj.data.materials.append(material)
    if smooth:
        for poly in mesh.polygons:
            poly.use_smooth = True
    return obj

def thick_polygon(name, points, extrusion, material, parent=ROOT, bevel=0.0, smooth=False):
    vec = Vector(extrusion) * 0.5
    n = len(points)
    vertices = [Vector(p) - vec for p in points] + [Vector(p) + vec for p in points]
    faces = [tuple(reversed(range(n))), tuple(range(n, 2 * n))]
    for i in range(n):
        j = (i + 1) % n
        faces.append((i, j, n + j, n + i))
    obj = mesh_object(name, vertices, faces, material, parent=parent, smooth=smooth)
    return obj

def box_object(name, center, dimensions, material, parent=ROOT, rotation=(0.0, 0.0, 0.0)):
    dx, dy, dz = (d * 0.5 for d in dimensions)
    points = [
        (-dx, -dy, -dz), (dx, -dy, -dz), (dx, dy, -dz), (-dx, dy, -dz),
        (-dx, -dy, dz), (dx, -dy, dz), (dx, dy, dz), (-dx, dy, dz),
    ]
    transform = Matrix.Translation(Vector(center)) @ Euler(rotation, 'XYZ').to_matrix().to_4x4()
    vertices = [transform @ Vector(p) for p in points]
    faces = [
        (0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4),
        (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7),
    ]
    return mesh_object(name, vertices, faces, material, parent=parent)

def cylinder_between(name, p1, p2, radius, material, parent=ROOT, segments=16, caps=True):
    a = Vector(p1)
    b = Vector(p2)
    axis = (b - a).normalized()
    ref = Vector((0.0, 0.0, 1.0))
    if abs(axis.dot(ref)) > 0.92:
        ref = Vector((0.0, 1.0, 0.0))
    u = axis.cross(ref).normalized()
    v = axis.cross(u).normalized()
    vertices = []
    for center in (a, b):
        for i in range(segments):
            angle = math.tau * i / segments
            vertices.append(center + radius * (math.cos(angle) * u + math.sin(angle) * v))
    faces = []
    for i in range(segments):
        j = (i + 1) % segments
        faces.append((i, j, segments + j, segments + i))
    if caps:
        faces += [tuple(reversed(range(segments))), tuple(range(segments, segments * 2))]
    return mesh_object(name, vertices, faces, material, parent=parent, smooth=True)

def cylinder_x_local(name, radius, length, material, parent, segments=24, caps=True, x_center=0.0):
    half = length * 0.5
    vertices = []
    for x in (x_center - half, x_center + half):
        for i in range(segments):
            angle = math.tau * i / segments
            vertices.append((x, radius * math.cos(angle), radius * math.sin(angle)))
    faces = []
    for i in range(segments):
        j = (i + 1) % segments
        faces.append((i, j, segments + j, segments + i))
    if caps:
        faces.append(tuple(reversed(range(segments))))
        faces.append(tuple(range(segments, segments * 2)))
    return mesh_object(name, vertices, faces, material, parent=parent, smooth=True)

def torus_x(name, major_r, minor_r_y, minor_r_x, material, parent, major_segments=32, minor_segments=14, x_center=0.0):
    vertices = []
    for i in range(major_segments):
        theta = math.tau * i / major_segments
        c_y = major_r * math.cos(theta)
        c_z = major_r * math.sin(theta)
        for j in range(minor_segments):
            phi = math.tau * j / minor_segments
            x = x_center + minor_r_x * math.cos(phi)
            r_offset = minor_r_y * math.sin(phi)
            y = (major_r + r_offset) * math.cos(theta)
            z = (major_r + r_offset) * math.sin(theta)
            vertices.append((x, y, z))
    faces = []
    for i in range(major_segments):
        ni = (i + 1) % major_segments
        for j in range(minor_segments):
            nj = (j + 1) % minor_segments
            v1 = i * minor_segments + j
            v2 = ni * minor_segments + j
            v3 = ni * minor_segments + nj
            v4 = i * minor_segments + nj
            faces.append((v1, v2, v3, v4))
    return mesh_object(name, vertices, faces, material, parent=parent, smooth=True)

def interp_profile(control, value):
    if value <= control[0][0]:
        return control[0][1]
    if value >= control[-1][0]:
        return control[-1][1]
    for (a, va), (b, vb) in zip(control[:-1], control[1:]):
        if a <= value <= b:
            t = (value - a) / (b - a)
            t = t * t * (3.0 - 2.0 * t)
            return va + (vb - va) * t
    return control[-1][1]

# Aerodynamic Profiles
WIDTH_PROFILE = [
    (-2.42, 0.94), (-2.20, 0.98), (-1.80, 1.00), (-1.40, 0.99),
    (-0.95, 0.88), (-0.45, 0.80), (0.05, 0.84), (0.60, 0.94),
    (1.10, 0.98), (1.40, 0.99), (1.80, 0.96), (2.15, 0.92), (2.42, 0.86),
]

CENTERLINE_HEIGHT_PROFILE = [
    (-2.42, 0.16), (-2.25, 0.28), (-1.95, 0.44), (-1.55, 0.58),
    (-1.10, 0.72), (-0.75, 0.96), (-0.40, 1.08), (-0.10, 1.10),
    (0.20, 1.04), (0.65, 0.86), (1.10, 0.74), (1.55, 0.66),
    (2.00, 0.62), (2.42, 0.56),
]

FENDER_HEIGHT_PROFILE = [
    (-2.42, 0.24), (-2.25, 0.42), (-1.95, 0.64), (-1.60, 0.74),
    (-1.40, 0.75), (-1.10, 0.66), (-0.75, 0.54), (-0.40, 0.46),
    (0.20, 0.50), (0.75, 0.68), (1.10, 0.78), (1.40, 0.79),
    (1.70, 0.76), (2.05, 0.68), (2.42, 0.58),
]

def wheel_arch_height(y):
    result = GROUND_CLEARANCE
    for center in (FRONT_AXLE_Y, REAR_AXLE_Y):
        d = abs(y - center)
        if d <= 0.40:
            normalized = d / 0.40
            z = WHEEL_RADIUS + 0.045 * math.sqrt(max(0.0, 1.0 - normalized * normalized))
            result = max(result, z)
    return result

# 1. Monocoque Body Shell
# Use 48 clean evenly-spaced Y stations
N_STATIONS = 48
y_stations = [(-LENGTH * 0.5) + i * (LENGTH / float(N_STATIONS - 1)) for i in range(N_STATIONS)]
body_vertices = []
RING_SIZE = 16

for y in y_stations:
    w = interp_profile(WIDTH_PROFILE, y)
    center_top = interp_profile(CENTERLINE_HEIGHT_PROFILE, y)
    fender_top = interp_profile(FENDER_HEIGHT_PROFILE, y)
    arch = wheel_arch_height(y)

    gully_depth = 0.08 if (0.40 < y < 2.10) else (0.05 if (-1.70 < y < -0.90) else 0.0)
    gully_z = max(arch + 0.05, (center_top + fender_top) * 0.5 - gully_depth)

    pinch = 0.82 if (-0.60 < y < 0.15) else 0.96
    sw = w * pinch

    # Perimeter ring of 16 points flowing continuously:
    # Top center -> left side down -> underfloor -> right side up -> back to top center
    ring = [
        (0.0, y, center_top),
        (-0.25 * w, y, center_top * 0.98),
        (-0.50 * w, y, gully_z),
        (-0.75 * w, y, fender_top),
        (-0.92 * sw, y, fender_top * 0.90),
        (-sw, y, max(arch + 0.04, fender_top * 0.60)),
        (-sw, y, arch),
        (-0.65 * sw, y, GROUND_CLEARANCE),
        (0.0, y, GROUND_CLEARANCE),
        (0.65 * sw, y, GROUND_CLEARANCE),
        (sw, y, arch),
        (sw, y, max(arch + 0.04, fender_top * 0.60)),
        (0.92 * sw, y, fender_top * 0.90),
        (0.75 * w, y, fender_top),
        (0.50 * w, y, gully_z),
        (0.25 * w, y, center_top * 0.98),
    ]
    body_vertices.extend(ring)

body_faces = []
for r in range(N_STATIONS - 1):
    for j in range(RING_SIZE):
        nj = (j + 1) % RING_SIZE
        v1 = r * RING_SIZE + j
        v2 = (r + 1) * RING_SIZE + j
        v3 = (r + 1) * RING_SIZE + nj
        v4 = r * RING_SIZE + nj
        body_faces.append((v1, v2, v3, v4))

# Front & rear caps
body_faces.append(tuple(range(RING_SIZE)))
last_offset = (N_STATIONS - 1) * RING_SIZE
body_faces.append(tuple(reversed([last_offset + j for j in range(RING_SIZE)])))

BODY = mesh_object("Toyota_GT_One_Body_Shell", body_vertices, body_faces, MATS['paint'], smooth=True)

# Add materials to BODY for multi-material assignment
BODY.data.materials.append(MATS['windshield'])  # index 1
BODY.data.materials.append(MATS['carbon'])      # index 2
BODY.data.materials.append(MATS['dark_trim'])   # index 3

# Assign specific materials to cockpit canopy, carbon skirts, and rear fascia
for poly in BODY.data.polygons:
    # Calculate face center
    center = Vector((0.0, 0.0, 0.0))
    for v_idx in poly.vertices:
        center += Vector(body_vertices[v_idx])
    center /= len(poly.vertices)
    cx, cy, cz = center.x, center.y, center.z

    # Cockpit windshield & canopy: -1.05 < y < 0.40, cz > 0.78, abs(cx) < 0.48
    if -1.08 < cy < 0.42 and cz > 0.78 and abs(cx) < 0.48:
        poly.material_index = 1
    # Carbon side waist undercut: -0.90 < cy < 0.35, cz < 0.42, abs(cx) > 0.62
    elif -0.95 < cy < 0.35 and cz < 0.45 and abs(cx) > 0.60:
        poly.material_index = 2
    # Rear tail fascia: cy > 2.30, cz < 0.54
    elif cy > 2.30 and cz < 0.54:
        poly.material_index = 3

# 2. Splitter & Diffuser
splitter_pts = [
    (-0.99, -2.44, 0.048), (0.99, -2.44, 0.048),
    (1.00, -2.25, 0.048), (0.96, -1.82, 0.050),
    (0.85, -1.40, 0.052), (-0.85, -1.40, 0.052),
    (-0.96, -1.82, 0.050), (-1.00, -2.25, 0.048),
]
thick_polygon("Underfloor_Front_Splitter", splitter_pts, (0, 0, 0.018), MATS['carbon'])

for sign, side in [(-1, "L"), (1, "R")]:
    winglet_pts = [
        (sign * 1.00, -2.43, 0.044), (sign * 1.00, -2.20, 0.044),
        (sign * 0.99, -2.20, 0.160), (sign * 0.99, -2.41, 0.145),
    ]
    thick_polygon(f"Front_Splitter_Winglet_{side}", winglet_pts, (sign * 0.012, 0, 0), MATS['carbon'])

diffuser_pts = [
    (-0.86, 1.15, 0.058), (0.86, 1.15, 0.058),
    (0.92, 2.38, 0.320), (-0.92, 2.38, 0.320),
]
thick_polygon("Rear_Venturi_Diffuser", diffuser_pts, (0, 0, 0.016), MATS['carbon'])

for x in (-0.58, -0.20, 0.20, 0.58):
    strake_pts = [(x, 1.25, 0.058), (x, 2.36, 0.320), (x, 2.36, 0.110), (x, 1.25, 0.040)]
    thick_polygon(f"Diffuser_Strake_{x:.2f}", strake_pts, (0.008, 0, 0), MATS['carbon'])

# 3. Chevron Livery (Flowing from front splitter tip up over the nose cone)
chevron_pts = [
    (0.0, -2.42, 0.165),
    (-0.16, -2.28, 0.26), (-0.32, -2.05, 0.39), (-0.46, -1.70, 0.52),
    (-0.38, -1.35, 0.63), (-0.22, -1.10, 0.73),
    (0.0, -1.02, 0.78),
    (0.22, -1.10, 0.73), (0.38, -1.35, 0.63),
    (0.46, -1.70, 0.52), (0.32, -2.05, 0.39), (0.16, -2.28, 0.26),
]
thick_polygon("Livery_White_Chevron_Front", chevron_pts, (0, 0, 0.005), MATS['white'], smooth=True)

# 4. Triple Stacked Projector Headlights
for sign, side in [(-1, "L"), (1, "R")]:
    cover_pts = [
        (sign * 0.70, -2.18, 0.38), (sign * 0.88, -2.12, 0.40),
        (sign * 0.88, -1.80, 0.67), (sign * 0.70, -1.82, 0.63),
    ]
    thick_polygon(f"Headlight_Cover_{side}", cover_pts, (sign * 0.010, 0, 0.010), MATS['headlight_cover'], smooth=True)

    lamp_positions = [
        (sign * 0.79, -2.10, 0.44),
        (sign * 0.78, -1.98, 0.52),
        (sign * 0.77, -1.86, 0.60),
    ]
    for l_idx, (lx, ly, lz) in enumerate(lamp_positions):
        cylinder_between(f"Lamp_Bezel_{side}_{l_idx+1}", (lx, ly - 0.012, lz), (lx, ly + 0.012, lz), 0.028, MATS['exhaust'], segments=16)
        cylinder_between(f"Lamp_Bulb_{side}_{l_idx+1}", (lx, ly - 0.016, lz), (lx, ly + 0.008, lz), 0.020, MATS['headlight_beam'], segments=16)

# 5. Streamlined Roof Scoop & Wiper
scoop_pts = [
    (-0.11, -0.45, 1.10), (0.11, -0.45, 1.10),
    (0.08, 0.22, 1.04), (-0.08, 0.22, 1.04),
]
thick_polygon("Roof_Periscope_Intake_Body", scoop_pts, (0, 0, 0.085), MATS['white'], smooth=True)
box_object("Roof_Intake_Mouth", (0.0, -0.45, 1.10), (0.18, 0.03, 0.06), MATS['dark_trim'])
cylinder_between("Cockpit_Wiper_Arm", (0.0, -1.05, 0.79), (0.06, -0.68, 1.04), 0.006, MATS['dark_trim'], segments=8)

# Wing Mirrors
for sign, side in [(-1, "L"), (1, "R")]:
    stalk_start = (sign * 0.44, -0.92, 0.79)
    mirror_pos = (sign * 0.56, -0.88, 0.94)
    cylinder_between(f"Mirror_Stalk_{side}", stalk_start, mirror_pos, 0.012, MATS['dark_trim'], segments=12)
    box_object(f"Mirror_Housing_{side}", mirror_pos, (0.09, 0.14, 0.07), MATS['paint'], rotation=(0, 0, sign * math.radians(12)))

# 6. Rear Wing & Giant Endplates
WING_Y = 2.22
WING_Z = 1.05
WING_SPAN = 1.96
main_wing = box_object("Rear_Wing_Main_Element", (0.0, WING_Y, WING_Z), (WING_SPAN, 0.38, 0.032), MATS['carbon'], rotation=(math.radians(7), 0, 0))

for sign, side in [(-1, "L"), (1, "R")]:
    endplate_x = sign * (WING_SPAN * 0.5)
    ep_pts = [
        (endplate_x, 1.84, 0.55), (endplate_x, 1.84, 1.12),
        (endplate_x, 2.44, 1.12), (endplate_x, 2.44, 0.34),
        (endplate_x, 2.15, 0.34), (endplate_x, 2.00, 0.48),
    ]
    thick_polygon(f"Rear_Wing_Endplate_{side}", ep_pts, (sign * 0.018, 0, 0), MATS['paint'], smooth=True)

for sign in (-1, 1):
    pylon_pts = [
        (sign * 0.28, 1.95, 0.68), (sign * 0.28, WING_Y - 0.04, WING_Z - 0.01),
        (sign * 0.28, WING_Y + 0.08, WING_Z - 0.01), (sign * 0.28, 2.05, 0.68),
    ]
    thick_polygon(f"Wing_Mount_Pylon_{'L' if sign < 0 else 'R'}", pylon_pts, (0.014, 0, 0), MATS['carbon'])

# 7. Rear Fascia & Exhaust
box_object("Rear_Fascia_Bulkhead", (0.0, 2.38, 0.46), (1.65, 0.06, 0.24), MATS['dark_trim'])
for sign, side in [(-1, "L"), (1, "R")]:
    tx = sign * 0.70
    cylinder_between(f"Taillight_Outer_{side}", (tx, 2.38, 0.48), (tx, 2.43, 0.48), 0.040, MATS['tail'], segments=18)
    cylinder_between(f"Taillight_Outer_Core_{side}", (tx, 2.40, 0.48), (tx, 2.44, 0.48), 0.026, MATS['brake'], segments=18)
    cylinder_between(f"Taillight_Inner_{side}", (tx - sign * 0.09, 2.38, 0.48), (tx - sign * 0.09, 2.43, 0.48), 0.032, MATS['indicator'], segments=16)

box_object("Rear_Center_Rain_Light", (0.0, 2.42, 0.52), (0.16, 0.02, 0.06), MATS['brake'])
for sign in (-0.14, 0.14):
    cylinder_between(f"Exhaust_Pipe_{sign:.2f}", (sign, 2.34, 0.36), (sign, 2.45, 0.36), 0.044, MATS['exhaust'], segments=20)

# 8. Wheels & Calipers
def yz_wedge(name, angle, r_inner, r_outer, angular_half_width, x_center, depth, material, parent):
    pts = []
    for r, a in (
        (r_inner, angle - angular_half_width * 0.72), (r_outer, angle - angular_half_width),
        (r_outer, angle + angular_half_width), (r_inner, angle + angular_half_width * 0.72),
    ):
        pts.append((x_center, r * math.cos(a), r * math.sin(a)))
    return thick_polygon(name, pts, (depth, 0, 0), material, parent=parent)

def create_wheel(parent_name, corner, x, y, outboard_sign, is_rear=False):
    parent = bpy.data.objects.new(parent_name, None)
    ASSET_COLLECTION.objects.link(parent)
    parent.parent = ROOT
    parent.location = (x, y, WHEEL_RADIUS)
    parent.rotation_euler = (0, 0, 0)
    parent.scale = (1, 1, 1)
    parent.empty_display_type = 'CIRCLE'
    parent.empty_display_size = 0.25
    parent['corner'] = corner
    parent['spin_axis'] = 'local_X'
    parent['origin_is_hub_center'] = True
    parent['wheel_radius_m'] = WHEEL_RADIUS

    tire_w = TIRE_WIDTH_REAR if is_rear else TIRE_WIDTH_FRONT
    rim_w = tire_w * 0.88
    rim_r = 0.238

    tire_major = (WHEEL_RADIUS + rim_r) * 0.5
    tire_minor = (WHEEL_RADIUS - rim_r) * 0.5
    tire = torus_x(f"{parent_name} tire", tire_major, tire_minor, tire_w * 0.48, MATS['tire'], parent)
    tire['axle_axis'] = 'X'

    cylinder_x_local(f"{parent_name} rim barrel", rim_r, rim_w, MATS['rim'], parent, caps=False)
    cylinder_x_local(f"{parent_name} rotor", 0.195, 0.022, MATS['rotor'], parent, caps=True)

    face_x = outboard_sign * (tire_w * 0.38)
    torus_x(f"{parent_name} rim outer ring", rim_r * 0.94, 0.012, 0.010, MATS['rim'], parent, x_center=face_x)

    num_spokes = 6
    for i in range(num_spokes):
        base_angle = math.tau * i / num_spokes
        for split, offset in enumerate((-0.08, 0.08), 1):
            yz_wedge(f"{parent_name} spoke {i+1}_{'A' if split == 1 else 'B'}",
                     base_angle + offset, 0.065, rim_r * 0.92, 0.038, face_x, 0.024, MATS['rim'], parent)

    nut_color = MATS['brake'] if outboard_sign < 0 else MATS['glass']
    cylinder_x_local(f"{parent_name} center hub", 0.065, 0.035, MATS['rim'], parent, x_center=face_x + outboard_sign * 0.008, segments=24)
    cylinder_x_local(f"{parent_name} center lock nut", 0.040, 0.045, nut_color, parent, x_center=face_x + outboard_sign * 0.016, segments=12)
    return parent

wheel_specs = [
    ('wheel_front_left', 'front_left', -FRONT_TRACK * 0.5, FRONT_AXLE_Y, -1.0, False),
    ('wheel_front_right', 'front_right', FRONT_TRACK * 0.5, FRONT_AXLE_Y, 1.0, False),
    ('wheel_rear_left', 'rear_left', -REAR_TRACK * 0.5, REAR_AXLE_Y, -1.0, True),
    ('wheel_rear_right', 'rear_right', REAR_TRACK * 0.5, REAR_AXLE_Y, 1.0, True),
]

for name, corner, x, y, sign, is_rear in wheel_specs:
    create_wheel(name, corner, x, y, sign, is_rear)

for name, corner, x, y, sign, is_rear in wheel_specs:
    caliper_name = name.replace('wheel_', 'caliper_')
    tire_w = TIRE_WIDTH_REAR if is_rear else TIRE_WIDTH_FRONT
    caliper_x = x - sign * (tire_w * 0.22)
    caliper_y = y + (0.135 if is_rear else -0.135)
    caliper = box_object(caliper_name, (caliper_x, caliper_y, WHEEL_RADIUS + 0.035), (0.065, 0.095, 0.180), MATS['caliper'])
    caliper['corner'] = corner
    caliper['steers'] = corner.startswith('front')
    caliper['spins'] = False

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

# Studio Lighting & Renders
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

# Save & Export
bpy.ops.wm.save_as_mainfile(filepath=BLEND_PATH)

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
print("SUCCESS: Masterpiece Toyota GT-One generated!")
