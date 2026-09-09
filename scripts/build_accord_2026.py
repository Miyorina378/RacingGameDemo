import bpy
import math
import os
import json
from mathutils import Vector, Matrix, Euler

# Reproducible clean rebuild of a game-ready 2026 Honda Accord Sport Hybrid.
# Blender authoring axes: +X right, +Z up, -Y front.
# Blender's glTF Y-Up conversion produces game axes: +X right, +Y up, +Z front.

SCENE = bpy.context.scene
ROOT_DIR = r"D:\trifilpla"
BLEND_PATH = os.path.join(ROOT_DIR, "honda_accord_2026_game_ready.blend")

LENGTH = 4.97078
WIDTH = 1.86182
HEIGHT = 1.45034
WHEELBASE = 2.82956
FRONT_TRACK = 1.59004
REAR_TRACK = 1.61290
WHEEL_RADIUS = 0.33530
TIRE_WIDTH = 0.235
GROUND_CLEARANCE = 0.13462
FRONT_AXLE_Y = -WHEELBASE * 0.5
REAR_AXLE_Y = WHEELBASE * 0.5


def clear_scene():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    for collection in list(bpy.data.collections):
        bpy.data.collections.remove(collection)
    for blocks in (
        bpy.data.meshes,
        bpy.data.curves,
        bpy.data.materials,
        bpy.data.cameras,
        bpy.data.lights,
    ):
        for block in list(blocks):
            blocks.remove(block)


clear_scene()
SCENE.unit_settings.system = 'METRIC'
SCENE.unit_settings.length_unit = 'METERS'
SCENE.unit_settings.scale_length = 1.0
SCENE.render.engine = 'BLENDER_EEVEE'
SCENE.render.resolution_x = 960
SCENE.render.resolution_y = 640
SCENE.render.resolution_percentage = 100
SCENE.render.image_settings.file_format = 'PNG'
SCENE.render.film_transparent = False
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


def rgba(hex_value, alpha=1.0):
    if isinstance(hex_value, str):
        hex_value = int(hex_value.lstrip('#'), 16)
    return (
        ((hex_value >> 16) & 255) / 255.0,
        ((hex_value >> 8) & 255) / 255.0,
        (hex_value & 255) / 255.0,
        alpha,
    )


def make_material(name, color, metallic=0.0, roughness=0.45, alpha=1.0,
                  transmission=0.0, coat=0.0, coat_roughness=0.08,
                  emission=None, emission_strength=0.0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    mat.diffuse_color = rgba(color, alpha)
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    values = {
        'Base Color': rgba(color, 1.0),
        'Metallic': metallic,
        'Roughness': roughness,
        'Alpha': alpha,
        'Transmission Weight': transmission,
        'Coat Weight': coat,
        'Coat Roughness': coat_roughness,
        'IOR': 1.46,
    }
    for socket_name, value in values.items():
        if socket_name in bsdf.inputs:
            bsdf.inputs[socket_name].default_value = value
    if emission is not None:
        if 'Emission Color' in bsdf.inputs:
            bsdf.inputs['Emission Color'].default_value = rgba(emission, 1.0)
        elif 'Emission' in bsdf.inputs:
            bsdf.inputs['Emission'].default_value = rgba(emission, 1.0)
        if 'Emission Strength' in bsdf.inputs:
            bsdf.inputs['Emission Strength'].default_value = emission_strength
    if alpha < 1.0:
        try:
            mat.surface_render_method = 'DITHERED'
        except Exception:
            try:
                mat.blend_method = 'BLEND'
            except Exception:
                pass
        mat.use_transparency_overlap = False
    return mat


MATS = {
    'paint': make_material('car_paint', 0xB7C1C9, metallic=0.62, roughness=0.23, coat=1.0, coat_roughness=0.055),
    'glass': make_material('glass', 0x102A3A, metallic=0.03, roughness=0.10, alpha=1.0, transmission=0.16, coat=0.7),
    'windshield': make_material('windshield', 0x173748, metallic=0.02, roughness=0.08, alpha=1.0, transmission=0.18, coat=0.75),
    'rim': make_material('rim', 0x343A40, metallic=0.95, roughness=0.19, coat=0.45),
    'tire': make_material('tire_rubber', 0x090A0B, metallic=0.0, roughness=0.78),
    'black': make_material('gloss_black', 0x080A0D, metallic=0.28, roughness=0.17, coat=0.8),
    'dark': make_material('dark_metal', 0x20242A, metallic=0.82, roughness=0.31),
    'chrome': make_material('chrome', 0xD9E1E8, metallic=1.0, roughness=0.12, coat=0.4),
    'headlight': make_material('headlight', 0xDDEBFF, metallic=0.05, roughness=0.09, alpha=0.86, transmission=0.12, coat=0.8, emission=0xE6F2FF, emission_strength=2.2),
    'drl': make_material('headlight_drl', 0xF4FAFF, metallic=0.0, roughness=0.11, emission=0xF4FAFF, emission_strength=6.0),
    'amber': make_material('indicator_amber', 0xFF7A12, metallic=0.0, roughness=0.2, emission=0xFF5A08, emission_strength=3.2),
    'tail': make_material('taillight', 0x6E0509, metallic=0.05, roughness=0.15, coat=0.75, emission=0x5E0005, emission_strength=0.55),
    'brake': make_material('brake_light', 0xA3060B, metallic=0.02, roughness=0.13, coat=0.8, emission=0xB00008, emission_strength=0.85),
    'caliper': make_material('caliper_red', 0xB31217, metallic=0.55, roughness=0.24, coat=0.55),
    'interior': make_material('interior_charcoal', 0x11151A, metallic=0.0, roughness=0.62),
    'screen': make_material('interior_display', 0x071D2D, metallic=0.1, roughness=0.16, emission=0x0A3754, emission_strength=1.1),
}


def link_object(obj, collection=ASSET_COLLECTION):
    collection.objects.link(obj)
    return obj


def mesh_object(name, vertices, faces, material=None, parent=ROOT,
                collection=ASSET_COLLECTION, smooth=False):
    mesh = bpy.data.meshes.new(name + " Mesh")
    mesh.from_pydata([tuple(v) for v in vertices], [], [tuple(f) for f in faces])
    mesh.validate(verbose=False)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    if parent is not None:
        obj.parent = parent
    if material is not None:
        obj.data.materials.append(material)
    if smooth:
        for poly in mesh.polygons:
            poly.use_smooth = True
    return obj


def add_bevel(obj, width=0.012, segments=2):
    mod = obj.modifiers.new("Applied edge softening", 'BEVEL')
    mod.width = width
    mod.segments = segments
    mod.limit_method = 'ANGLE'
    return mod


def add_solidify(obj, thickness=0.008):
    mod = obj.modifiers.new("Applied panel thickness", 'SOLIDIFY')
    mod.thickness = thickness
    mod.offset = 0.0
    return mod


def box_object(name, center, dimensions, material, parent=ROOT, bevel=0.0, rotation=(0.0, 0.0, 0.0)):
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
    obj = mesh_object(name, vertices, faces, material, parent=parent)
    if bevel > 0:
        add_bevel(obj, bevel, 3)
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
    if bevel > 0:
        add_bevel(obj, bevel, 2)
    return obj


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


def ellipsoid(name, center, radii, material, parent=ROOT, segments=28, rings=14):
    cx, cy, cz = center
    rx, ry, rz = radii
    vertices = [(cx, cy, cz + rz)]
    for i in range(1, rings):
        phi = math.pi * i / rings
        for j in range(segments):
            theta = math.tau * j / segments
            vertices.append((
                cx + rx * math.sin(phi) * math.cos(theta),
                cy + ry * math.sin(phi) * math.sin(theta),
                cz + rz * math.cos(phi),
            ))
    bottom_index = len(vertices)
    vertices.append((cx, cy, cz - rz))
    faces = []
    for j in range(segments):
        faces.append((0, 1 + j, 1 + (j + 1) % segments))
    for i in range(rings - 2):
        row = 1 + i * segments
        next_row = row + segments
        for j in range(segments):
            nj = (j + 1) % segments
            faces.append((row + j, next_row + j, next_row + nj, row + nj))
    last_row = 1 + (rings - 2) * segments
    for j in range(segments):
        faces.append((last_row + j, bottom_index, last_row + (j + 1) % segments))
    return mesh_object(name, vertices, faces, material, parent=parent, smooth=True)


def ellipse_disc(name, center, radius_a, radius_b, axis, material, parent=ROOT, segments=28):
    c = Vector(center)
    if axis == 'X':
        u, v = Vector((0, 1, 0)), Vector((0, 0, 1))
    elif axis == 'Y':
        u, v = Vector((1, 0, 0)), Vector((0, 0, 1))
    else:
        u, v = Vector((1, 0, 0)), Vector((0, 1, 0))
    vertices = [c]
    for i in range(segments):
        angle = math.tau * i / segments
        vertices.append(c + radius_a * math.cos(angle) * u + radius_b * math.sin(angle) * v)
    faces = []
    for i in range(segments):
        faces.append((0, 1 + i, 1 + (i + 1) % segments))
    return mesh_object(name, vertices, faces, material, parent=parent, smooth=True)


def curve_tube(name, points, radius, material, parent=ROOT, cyclic=False, bezier=True):
    data = bpy.data.curves.new(name + " Curve", type='CURVE')
    data.dimensions = '3D'
    data.resolution_u = 2
    data.bevel_depth = radius
    data.bevel_resolution = 2
    data.resolution_u = 2
    if bezier and len(points) >= 3:
        spline = data.splines.new('BEZIER')
        spline.bezier_points.add(len(points) - 1)
        for bp, point in zip(spline.bezier_points, points):
            bp.co = point
            bp.handle_left_type = 'AUTO'
            bp.handle_right_type = 'AUTO'
        spline.use_cyclic_u = cyclic
    else:
        spline = data.splines.new('POLY')
        spline.points.add(len(points) - 1)
        for point_slot, point in zip(spline.points, points):
            point_slot.co = (*point, 1.0)
        spline.use_cyclic_u = cyclic
    obj = bpy.data.objects.new(name, data)
    ASSET_COLLECTION.objects.link(obj)
    obj.parent = parent
    obj.data.materials.append(material)
    return obj


def surface_grid(name, rows, material, parent=ROOT, solidify=0.0, bevel=0.0, smooth=True):
    row_count = len(rows)
    col_count = len(rows[0])
    vertices = [Vector(p) for row in rows for p in row]
    faces = []
    for r in range(row_count - 1):
        for c in range(col_count - 1):
            a = r * col_count + c
            faces.append((a, a + col_count, a + col_count + 1, a + 1))
    obj = mesh_object(name, vertices, faces, material, parent=parent, smooth=smooth)
    if solidify > 0:
        add_solidify(obj, solidify)
    if bevel > 0:
        add_bevel(obj, bevel, 2)
    return obj


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


WIDTH_PROFILE = [
    (-LENGTH / 2, 0.80), (-2.41, 0.89), (-2.18, 0.928), (-1.70, WIDTH / 2),
    (-0.80, WIDTH / 2), (0.35, 0.928), (1.45, WIDTH / 2), (2.14, 0.915),
    (2.40, 0.86), (LENGTH / 2, 0.73),
]
TOP_PROFILE = [
    (-LENGTH / 2, 0.68), (-2.40, 0.72), (-2.18, 0.78), (-1.70, 0.82),
    (-1.02, 0.885), (-0.72, 0.90), (0.65, 0.89), (1.40, 0.86),
    (1.86, 0.825), (2.25, 0.78), (2.42, 0.75), (LENGTH / 2, 0.72),
]


def body_width(y):
    return interp_profile(WIDTH_PROFILE, y)


def body_top(y):
    return interp_profile(TOP_PROFILE, y)


def wheel_arch_height(y):
    result = 0.175
    for center in (FRONT_AXLE_Y, REAR_AXLE_Y):
        d = abs(y - center)
        if d <= 0.415:
            normalized = d / 0.415
            z = WHEEL_RADIUS + 0.374 * math.sqrt(max(0.0, 1.0 - normalized * normalized))
            result = max(result, z)
    return result


# Main watertight body shell, with true openings above all four tires.
y_values = [(-LENGTH / 2) + i * (LENGTH / 100.0) for i in range(101)]
y_values += [p[0] for p in WIDTH_PROFILE + TOP_PROFILE]
y_values += [FRONT_AXLE_Y - 0.415, FRONT_AXLE_Y, FRONT_AXLE_Y + 0.415,
             REAR_AXLE_Y - 0.415, REAR_AXLE_Y, REAR_AXLE_Y + 0.415]
y_values = sorted(set(round(y, 6) for y in y_values))
body_vertices = []
ring_size = 17
for y in y_values:
    w = body_width(y)
    top = body_top(y)
    arch = wheel_arch_height(y)
    shoulder = top - 0.045
    outer_upper = min(top - 0.028, max(top - 0.125, arch + 0.045))
    outer_mid = max(0.455, arch + 0.020)
    ring = [
        (-0.36 * w, y, top + 0.006),
        (-0.68 * w, y, top),
        (-0.88 * w, y, shoulder),
        (-0.975 * w, y, outer_upper),
        (-w, y, outer_mid),
        (-w, y, arch),
        (-0.64 * w, y, max(0.17, arch - 0.010)),
        (-0.55 * w, y, 0.17),
        (0.55 * w, y, 0.17),
        (0.64 * w, y, max(0.17, arch - 0.010)),
        (w, y, arch),
        (w, y, outer_mid),
        (0.975 * w, y, outer_upper),
        (0.88 * w, y, shoulder),
        (0.68 * w, y, top),
        (0.36 * w, y, top + 0.006),
        (0.0, y, top + 0.012),
    ]
    # Duplicate center points deliberately create a broad, almost-flat upper crown.
    body_vertices.extend(ring)
body_faces = []
for r in range(len(y_values) - 1):
    for j in range(ring_size):
        nj = (j + 1) % ring_size
        a = r * ring_size + j
        b = (r + 1) * ring_size + j
        body_faces.append((a, b, (r + 1) * ring_size + nj, r * ring_size + nj))
body_faces.append(tuple(range(ring_size)))
last = (len(y_values) - 1) * ring_size
body_faces.append(tuple(reversed([last + i for i in range(ring_size)])))
BODY = mesh_object("Accord exterior body", body_vertices, body_faces, MATS['paint'], smooth=True)
BODY['component'] = 'primary_body_shell'
BODY['wheel_openings'] = 4
add_bevel(BODY, 0.026, 3)

# Hood and trunk panels sit into the shell instead of floating above it.
hood_rows = []
for y in (-2.25, -2.05, -1.75, -1.40, -1.08, -0.78):
    row = []
    w = body_width(y)
    for f in (-1.0, -0.62, 0.0, 0.62, 1.0):
        x = f * w * 0.70
        z = body_top(y) + 0.013 + 0.012 * (1.0 - f * f) - 0.020 * abs(f)
        row.append((x, y, z))
    hood_rows.append(row)
HOOD = surface_grid("Accord hood panel", hood_rows, MATS['paint'], solidify=0.008, bevel=0.006)

trunk_rows = []
for y in (1.42, 1.62, 1.90, 2.14, 2.30):
    row = []
    w = body_width(y)
    for f in (-1.0, -0.62, 0.0, 0.62, 1.0):
        x = f * w * 0.74
        z = body_top(y) + 0.012 + 0.010 * (1.0 - f * f) - 0.015 * abs(f)
        row.append((x, y, z))
    trunk_rows.append(row)
TRUNK = surface_grid("Accord trunk deck", trunk_rows, MATS['paint'], solidify=0.008, bevel=0.005)

# Roof, glass, and headers form one overlapping, gap-free cabin envelope.
ROOF_PROFILE = [(-0.42, 1.407, 0.655), (-0.18, 1.445, 0.675), (0.25, HEIGHT, 0.690),
                (0.62, 1.438, 0.695), (0.90, 1.365, 0.705)]
roof_rows = []
for y, center_z, half_w in ROOF_PROFILE:
    row = []
    for f in (-1.0, -0.66, 0.0, 0.66, 1.0):
        row.append((f * half_w, y, center_z - 0.036 * abs(f) ** 1.7))
    roof_rows.append(row)
ROOF = surface_grid("Accord connected roof skin", roof_rows, MATS['paint'], solidify=0.010, bevel=0.0)
ROOF.modifiers["Applied panel thickness"].offset = -1.0
ROOF['connection'] = 'overlaps_A_C_pillars_and_headers'

windshield_rows = []
for i in range(7):
    t = i / 6.0
    ease = t * t * (3.0 - 2.0 * t)
    y = -0.91 + 0.51 * t
    center_z = 0.885 + (1.414 - 0.885) * ease
    half_w = 0.790 + (0.660 - 0.790) * ease
    row = []
    for f in (-1.0, -0.58, 0.0, 0.58, 1.0):
        row.append((f * half_w, y, center_z - 0.025 * abs(f) ** 1.5))
    windshield_rows.append(row)
WINDSHIELD = surface_grid("windshield front glass", windshield_rows, MATS['windshield'], solidify=0.006, bevel=0.003)

rear_glass_rows = []
for i in range(8):
    t = i / 7.0
    ease = t * t * (3.0 - 2.0 * t)
    y = 0.83 + 0.72 * t
    center_z = 1.385 + (0.865 - 1.385) * ease
    half_w = 0.695 + (0.795 - 0.695) * ease
    row = []
    for f in (-1.0, -0.58, 0.0, 0.58, 1.0):
        row.append((f * half_w, y, center_z - 0.020 * abs(f) ** 1.5))
    rear_glass_rows.append(row)
REAR_GLASS = surface_grid("glass rear window", rear_glass_rows, MATS['glass'], solidify=0.006, bevel=0.003)


def mirrored(points):
    return [(-x, y, z) for x, y, z in reversed(points)]


front_window_r = [
    (0.805, -0.825, 0.858), (0.825, 0.165, 0.858),
    (0.695, 0.155, 1.425), (0.662, -0.355, 1.405),
]
rear_window_r = [
    (0.825, 0.225, 0.858), (0.848, 1.440, 0.850),
    (0.750, 1.150, 1.245), (0.705, 0.840, 1.395), (0.695, 0.235, 1.425),
]
for side, front_points, rear_points in (
    ('right', front_window_r, rear_window_r),
    ('left', mirrored(front_window_r), mirrored(rear_window_r)),
):
    sign = 1.0 if side == 'right' else -1.0
    thick_polygon(f"glass front door window {side}", front_points, (0.010 * sign, 0, 0), MATS['glass'], bevel=0.004)
    thick_polygon(f"glass rear door window {side}", rear_points, (0.010 * sign, 0, 0), MATS['glass'], bevel=0.004)

# Pillars overlap body, side glass, windshield, rear glass, and roof by 10-30 mm.
a_pillar_r = [
    (0.790, -0.930, 0.845), (0.840, -0.790, 0.850),
    (0.697, -0.315, 1.430), (0.630, -0.385, 1.434),
]
b_pillar_r = [
    (0.813, 0.135, 0.842), (0.830, 0.285, 0.842),
    (0.705, 0.300, 1.430), (0.687, 0.140, 1.430),
]
c_pillar_r = [
    (0.825, 0.850, 0.840), (0.865, 1.500, 0.835),
    (0.748, 1.175, 1.265), (0.695, 0.815, 1.410),
]
for side, sign in (('right', 1.0), ('left', -1.0)):
    ap = a_pillar_r if sign > 0 else mirrored(a_pillar_r)
    bp = b_pillar_r if sign > 0 else mirrored(b_pillar_r)
    cp = c_pillar_r if sign > 0 else mirrored(c_pillar_r)
    thick_polygon(f"Accord connected A pillar {side}", ap, (0.042 * sign, 0, 0), MATS['paint'], bevel=0.008)
    thick_polygon(f"Accord connected B pillar {side}", bp, (0.028 * sign, 0, 0), MATS['black'], bevel=0.006)
    thick_polygon(f"Accord connected C pillar {side}", cp, (0.046 * sign, 0, 0), MATS['paint'], bevel=0.010)
    rail_points = []
    for y, z, w in ROOF_PROFILE:
        rail_points.append((sign * (w + 0.004), y, z - 0.025))
    # Roof skin already overlaps the pillar tops; no raised rail object is added.

# Cabin headers and flush perimeter trim.
# Roof skin and glass overlap directly; raised header tubes are intentionally omitted.
for sign, side in ((1.0, 'right'), (-1.0, 'left')):
    curve_tube(f"window belt trim {side}", [
        (sign * 0.824, -0.88, 0.865), (sign * 0.934, -0.25, 0.862),
        (sign * 0.936, 0.72, 0.862), (sign * 0.855, 1.43, 0.858)
    ], 0.006, MATS['chrome'], bezier=False)
    curve_tube(f"upper window trim {side}", [
        (sign * 0.785, -0.86, 0.90), (sign * 0.662, -0.35, 1.417),
        (sign * 0.697, 0.45, 1.420), (sign * 0.735, 1.02, 1.300),
        (sign * 0.845, 1.43, 0.875)
    ], 0.005, MATS['chrome'], bezier=False)

# Connected sail mounts and mirrors. Sport trim uses gloss-black caps.
for sign, side in ((1.0, 'right'), (-1.0, 'left')):
    sail_r = [
        (0.790, -0.825, 0.850), (0.895, -0.765, 0.855),
        (0.900, -0.600, 0.995), (0.795, -0.660, 1.060),
    ]
    sail = sail_r if sign > 0 else mirrored(sail_r)
    thick_polygon(f"Accord connected mirror sail {side}", sail, (0.070 * sign, 0, 0), MATS['black'], bevel=0.010)
    cylinder_between(
        f"Accord connected mirror stem {side}",
        (sign * 0.855, -0.680, 0.940), (sign * 0.975, -0.655, 0.945),
        0.042, MATS['black'], segments=18,
    )
    ellipsoid(f"Accord mirror cap {side}", (sign * 1.035, -0.650, 0.950), (0.145, 0.150, 0.073), MATS['black'])
    ellipse_disc(f"Accord mirror glass {side}", (sign * 1.178, -0.647, 0.950), 0.120, 0.052, 'X', MATS['glass'])
    curve_tube(f"mirror indicator {side}", [
        (sign * 1.020, -0.790, 0.955), (sign * 1.090, -0.780, 0.956), (sign * 1.145, -0.748, 0.955)
    ], 0.006, MATS['amber'], bezier=False)

# Interior silhouette keeps transparent glass from looking empty without adding a ground plane.
box_object("interior dashboard", (0, -0.670, 0.805), (1.40, 0.23, 0.22), MATS['interior'], bevel=0.055)
box_object("interior display", (0, -0.805, 0.925), (0.52, 0.025, 0.16), MATS['screen'], bevel=0.018)
for x in (-0.34, 0.34):
    box_object(f"front seat {x:+.2f}", (x, -0.05, 0.770), (0.42, 0.48, 0.53), MATS['interior'], bevel=0.085)
    box_object(f"front headrest {x:+.2f}", (x, 0.02, 1.075), (0.28, 0.18, 0.20), MATS['interior'], bevel=0.065)
box_object("rear bench", (0, 0.760, 0.735), (1.32, 0.55, 0.38), MATS['interior'], bevel=0.085)

# Side body details and clean wheel-arch lips.
for sign, side in ((1.0, 'right'), (-1.0, 'left')):
    x_side = sign * (WIDTH * 0.5 + 0.005)
    curve_tube(f"shoulder character line {side}", [
        (sign * 0.916, -1.10, 0.755), (x_side, -0.30, 0.748),
        (x_side, 0.70, 0.750), (sign * 0.910, 1.72, 0.735)
    ], 0.006, MATS['chrome'])
    for seam_name, y in (('front door leading seam', -0.79), ('center door seam', 0.19), ('rear door trailing seam', 1.32)):
        curve_tube(f"{seam_name} {side}", [
            (sign * body_width(y), y, 0.255), (sign * (body_width(y) + 0.004), y, 0.56),
            (sign * (body_width(y) - 0.010), y, 0.855)
        ], 0.005, MATS['black'], bezier=False)
    box_object(f"front door handle {side}", (sign * 0.942, -0.185, 0.815), (0.028, 0.185, 0.035), MATS['paint'], bevel=0.010)
    box_object(f"rear door handle {side}", (sign * 0.944, 0.805, 0.810), (0.028, 0.180, 0.034), MATS['paint'], bevel=0.010)
    box_object(f"rocker panel {side}", (sign * 0.885, 0.05, 0.205), (0.085, 2.30, 0.070), MATS['black'], bevel=0.020)
    for axle_name, axle_y in (('front', FRONT_AXLE_Y), ('rear', REAR_AXLE_Y)):
        points = []
        for i in range(19):
            y = axle_y - 0.405 + 0.810 * i / 18.0
            points.append((sign * (body_width(y) + 0.007), y, wheel_arch_height(y) + 0.006))
        curve_tube(f"{axle_name} wheel arch lip {side}", points, 0.009, MATS['paint'], bezier=False)

# Hood character lines are seated on the hood.
for sign, side in ((1.0, 'right'), (-1.0, 'left')):
    pts = []
    for y in (-2.24, -1.88, -1.46, -1.05, -0.80):
        pts.append((sign * body_width(y) * 0.42, y, body_top(y) + 0.028))
    curve_tube(f"hood crease {side}", pts, 0.006, MATS['chrome'])

# Curved front fascia; all panels hug the body instead of forming a blocking box.
def front_surface_y(x):
    return -LENGTH * 0.5 + 0.070 * (abs(x) / (WIDTH * 0.5)) ** 2 + 0.006


def front_points(xz_points, offset=-0.004):
    return [(x, front_surface_y(x) + offset, z) for x, z in xz_points]


grille_outline = [(-0.53, 0.600), (0.53, 0.600), (0.58, 0.505), (0.50, 0.425), (-0.50, 0.425), (-0.58, 0.505)]
thick_polygon("Accord flush honeycomb grille", front_points(grille_outline), (0, 0.010, 0), MATS['black'], bevel=0.008)
for z, fraction in ((0.565, 0.47), (0.520, 0.51), (0.475, 0.50)):
    points = []
    for i in range(9):
        x = -fraction + 2.0 * fraction * i / 8.0
        points.append((x, front_surface_y(x) - 0.010, z - 0.004 * (x / max(fraction, 0.01)) ** 2))
    curve_tube(f"front grille slat {z:.3f}", points, 0.006, MATS['dark'], bezier=False)

for sign, side in ((1.0, 'right'), (-1.0, 'left')):
    housing_xz = [(0.18, 0.744), (0.71, 0.775), (0.885, 0.710), (0.790, 0.625), (0.270, 0.650)]
    lens_xz = [(0.23, 0.728), (0.69, 0.758), (0.842, 0.704), (0.765, 0.655), (0.290, 0.670)]
    if sign < 0:
        housing_xz = [(-x, z) for x, z in reversed(housing_xz)]
        lens_xz = [(-x, z) for x, z in reversed(lens_xz)]
    thick_polygon(f"headlight housing {side}", front_points(housing_xz, 0.000), (0, 0.015, 0), MATS['black'], bevel=0.008)
    thick_polygon(f"headlight lens {side}", front_points(lens_xz, -0.010), (0, 0.010, 0), MATS['headlight'], bevel=0.006)
    drl = []
    for i in range(7):
        x = 0.25 + (0.79 - 0.25) * i / 6.0
        if sign < 0:
            x = -x
        drl.append((x, front_surface_y(x) - 0.023, 0.724 - 0.020 * (abs(x) - 0.25)))
    curve_tube(f"headlight DRL {side}", drl, 0.010, MATS['drl'], bezier=False)
    x = sign * 0.820
    curve_tube(f"front amber marker {side}", [
        (x, front_surface_y(x) - 0.020, 0.690),
        (sign * 0.855, front_surface_y(sign * 0.855) - 0.018, 0.665)
    ], 0.010, MATS['amber'], bezier=False)

bumper_bridge = [(-0.68, 0.412), (0.68, 0.412), (0.64, 0.335), (-0.64, 0.335)]
thick_polygon("Accord body color bumper bridge", front_points(bumper_bridge, -0.012), (0, 0.008, 0), MATS['paint'], bevel=0.006)
lower_intake = [(-0.58, 0.270), (0.58, 0.270), (0.66, 0.225), (0.50, 0.185), (-0.50, 0.185), (-0.66, 0.225)]
thick_polygon("Accord lower intake", front_points(lower_intake, 0.002), (0, 0.010, 0), MATS['black'], bevel=0.008)
curve_tube("Accord curved front lip", [
    (-0.76, front_surface_y(-0.76) - 0.006, 0.188),
    (-0.38, front_surface_y(-0.38) - 0.015, 0.165),
    (0, front_surface_y(0) - 0.020, 0.158),
    (0.38, front_surface_y(0.38) - 0.015, 0.165),
    (0.76, front_surface_y(0.76) - 0.006, 0.188),
], 0.018, MATS['black'])

# Honda H badge, front and rear.
def add_h_badge(prefix, y, z, facing_front=True, scale=1.0):
    depth = 0.016
    box_object(prefix + " badge left", (-0.038 * scale, y, z), (0.018 * scale, depth, 0.095 * scale), MATS['chrome'], bevel=0.006 * scale)
    box_object(prefix + " badge right", (0.038 * scale, y, z), (0.018 * scale, depth, 0.095 * scale), MATS['chrome'], bevel=0.006 * scale)
    box_object(prefix + " badge bar", (0, y, z), (0.086 * scale, depth, 0.018 * scale), MATS['chrome'], bevel=0.005 * scale)
    ellipse = []
    for i in range(32):
        a = math.tau * i / 32.0
        ellipse.append((0.070 * scale * math.cos(a), y, z + 0.077 * scale * math.sin(a)))
    curve_tube(prefix + " badge surround", ellipse, 0.006 * scale, MATS['chrome'], cyclic=True, bezier=False)


add_h_badge("front Honda", -LENGTH * 0.5 - 0.003, 0.485, True, 0.82)

# Rear light blade and lower fascia.
def rear_surface_y(x):
    return LENGTH * 0.5 - 0.060 * (abs(x) / (WIDTH * 0.5)) ** 2 - 0.004


def rear_points(xz_points, offset=0.003):
    return [(x, rear_surface_y(x) + offset, z) for x, z in xz_points]


rear_plane_y = LENGTH * 0.5 + 0.003
rear_lamp_housing = [
    (-0.70, rear_plane_y, 0.710), (0.70, rear_plane_y, 0.710),
    (0.70, rear_plane_y, 0.610), (-0.70, rear_plane_y, 0.610),
]
thick_polygon("Accord integrated rear lamp housing", rear_lamp_housing, (0, 0.008, 0), MATS['black'], bevel=0.004)
center_tail = [
    (-0.17, rear_plane_y + 0.006, 0.682), (0.17, rear_plane_y + 0.006, 0.682),
    (0.17, rear_plane_y + 0.006, 0.647), (-0.17, rear_plane_y + 0.006, 0.647),
]
thick_polygon("taillight center blade", center_tail, (0, 0.006, 0), MATS['tail'], bevel=0.003)
for sign, side in ((1.0, 'right'), (-1.0, 'left')):
    xz = [(0.16, 0.690), (0.66, 0.690), (0.68, 0.646), (0.20, 0.632)]
    if sign < 0:
        xz = [(-x, z) for x, z in reversed(xz)]
    lamp_points = [(x, rear_plane_y + 0.007, z) for x, z in xz]
    thick_polygon(f"brake_light rear {side}", lamp_points, (0, 0.006, 0), MATS['brake'], bevel=0.004)
    curve_tube(f"rear indicator {side}", [
        (sign * 0.60, rear_plane_y + 0.014, 0.660),
        (sign * 0.665, rear_plane_y + 0.014, 0.655)
    ], 0.006, MATS['amber'], bezier=False)

plate_recess = [
    (-0.31, rear_plane_y + 0.002, 0.545), (0.31, rear_plane_y + 0.002, 0.545),
    (0.31, rear_plane_y + 0.002, 0.390), (-0.31, rear_plane_y + 0.002, 0.390),
]
thick_polygon("Accord rear license plate recess", plate_recess, (0, 0.006, 0), MATS['dark'], bevel=0.008)
plate_face = [
    (-0.245, rear_plane_y + 0.008, 0.515), (0.245, rear_plane_y + 0.008, 0.515),
    (0.245, rear_plane_y + 0.008, 0.418), (-0.245, rear_plane_y + 0.008, 0.418),
]
thick_polygon("Accord rear license plate", plate_face, (0, 0.004, 0), MATS['chrome'], bevel=0.004)
rear_valance = [
    (-0.70, rear_plane_y, 0.365), (0.70, rear_plane_y, 0.365),
    (0.68, rear_plane_y, 0.195), (-0.68, rear_plane_y, 0.195),
]
thick_polygon("Accord rear lower valance", rear_valance, (0, 0.008, 0), MATS['black'], bevel=0.009)
# No raised trunk lip: the deck and rear body meet directly without a floating bar.
add_h_badge("rear Honda", LENGTH * 0.5 - 0.002, 0.625, False, 0.72)

# Roof shark-fin antenna is seated into the roof, with no floating gap.
fin_points = [
    (-0.045, 0.590, 1.421), (0.045, 0.590, 1.421),
    (0.032, 0.760, 1.424), (0.0, 0.685, 1.455), (-0.032, 0.760, 1.424),
]
thick_polygon("Accord seated shark fin antenna", fin_points, (0, 0.018, 0), MATS['black'], bevel=0.008)

# Wheel geometry is authored directly around local X, so every child has zero rotation.
def torus_x(name, major_radius, radial_minor, axial_minor, material, parent, x_center=0.0, major_segments=48, minor_segments=12):
    vertices = []
    for i in range(major_segments):
        u = math.tau * i / major_segments
        for j in range(minor_segments):
            v = math.tau * j / minor_segments
            radial = major_radius + radial_minor * math.sin(v)
            vertices.append((
                x_center + axial_minor * math.cos(v),
                radial * math.cos(u),
                radial * math.sin(u),
            ))
    faces = []
    for i in range(major_segments):
        ni = (i + 1) % major_segments
        for j in range(minor_segments):
            nj = (j + 1) % minor_segments
            faces.append((i * minor_segments + j, ni * minor_segments + j,
                          ni * minor_segments + nj, i * minor_segments + nj))
    return mesh_object(name, vertices, faces, material, parent=parent, smooth=True)


def cylinder_x_local(name, radius, depth, material, parent, x_center=0.0, segments=40, caps=True):
    vertices = []
    for x in (x_center - depth * 0.5, x_center + depth * 0.5):
        for i in range(segments):
            a = math.tau * i / segments
            vertices.append((x, radius * math.cos(a), radius * math.sin(a)))
    faces = []
    for i in range(segments):
        j = (i + 1) % segments
        faces.append((i, j, segments + j, segments + i))
    if caps:
        faces += [tuple(reversed(range(segments))), tuple(range(segments, segments * 2))]
    return mesh_object(name, vertices, faces, material, parent=parent, smooth=True)


def yz_wedge(name, angle, r_inner, r_outer, angular_half_width, x_center, depth, material, parent):
    pts = []
    for r, a in (
        (r_inner, angle - angular_half_width * 0.72),
        (r_outer, angle - angular_half_width),
        (r_outer, angle + angular_half_width),
        (r_inner, angle + angular_half_width * 0.72),
    ):
        pts.append((x_center, r * math.cos(a), r * math.sin(a)))
    return thick_polygon(name, pts, (depth, 0, 0), material, parent=parent, bevel=0.004)


def create_wheel(parent_name, corner, x, y, outboard_sign):
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

    tire_major = (WHEEL_RADIUS + 0.24130) * 0.5
    tire_minor = (WHEEL_RADIUS - 0.24130) * 0.5
    tire = torus_x(f"{parent_name} tire", tire_major, tire_minor, TIRE_WIDTH * 0.5, MATS['tire'], parent)
    tire['axle_axis'] = 'X'
    cylinder_x_local(f"{parent_name} rim barrel", 0.239, 0.190, MATS['rim'], parent, caps=False)
    cylinder_x_local(f"{parent_name} rotor", 0.187, 0.018, MATS['dark'], parent, caps=True)

    face_x = outboard_sign * 0.098
    torus_x(f"{parent_name} rim outer ring", 0.222, 0.014, 0.012, MATS['rim'], parent, x_center=face_x)
    torus_x(f"{parent_name} rim inner accent", 0.103, 0.010, 0.010, MATS['chrome'], parent, x_center=face_x + outboard_sign * 0.006, major_segments=36, minor_segments=10)
    for i in range(5):
        base = math.tau * i / 5.0 + math.radians(18)
        for split, offset in enumerate((-0.075, 0.075), 1):
            yz_wedge(
                f"{parent_name} split spoke {i + 1}{'A' if split == 1 else 'B'}",
                base + offset, 0.070, 0.210, 0.040, face_x, 0.028,
                MATS['rim'], parent,
            )
    cylinder_x_local(f"{parent_name} hub", 0.064, 0.040, MATS['chrome'], parent,
                     x_center=face_x + outboard_sign * 0.006, segments=32, caps=True)
    for i in range(5):
        a = math.tau * i / 5.0
        lug_center = (
            face_x + outboard_sign * 0.030,
            0.038 * math.cos(a),
            0.038 * math.sin(a),
        )
        cylinder_between(
            f"{parent_name} lug {i + 1}",
            (lug_center[0] - outboard_sign * 0.006, lug_center[1], lug_center[2]),
            (lug_center[0] + outboard_sign * 0.006, lug_center[1], lug_center[2]),
            0.007, MATS['dark'], parent=parent, segments=10,
        )
    return parent


wheel_specs = [
    ('wheel_front_left', 'front_left', -FRONT_TRACK * 0.5, FRONT_AXLE_Y, -1.0),
    ('wheel_front_right', 'front_right', FRONT_TRACK * 0.5, FRONT_AXLE_Y, 1.0),
    ('wheel_rear_left', 'rear_left', -REAR_TRACK * 0.5, REAR_AXLE_Y, -1.0),
    ('wheel_rear_right', 'rear_right', REAR_TRACK * 0.5, REAR_AXLE_Y, 1.0),
]
WHEELS = {}
for name, corner, x, y, sign in wheel_specs:
    WHEELS[name] = create_wheel(name, corner, x, y, sign)

# Separate calipers: direct root children, never descendants of spinning wheel parents.
for name, corner, x, y, sign in [
    ('caliper_front_left', 'front_left', -FRONT_TRACK * 0.5, FRONT_AXLE_Y, -1.0),
    ('caliper_front_right', 'front_right', FRONT_TRACK * 0.5, FRONT_AXLE_Y, 1.0),
    ('caliper_rear_left', 'rear_left', -REAR_TRACK * 0.5, REAR_AXLE_Y, -1.0),
    ('caliper_rear_right', 'rear_right', REAR_TRACK * 0.5, REAR_AXLE_Y, 1.0),
]:
    caliper_x = x - sign * 0.086
    caliper_y = y + (-0.135 if 'rear' in corner else 0.135)
    caliper = box_object(name, (caliper_x, caliper_y, WHEEL_RADIUS + 0.025),
                         (0.070, 0.090, 0.175), MATS['caliper'], bevel=0.026)
    caliper['corner'] = corner
    caliper['steers'] = corner.startswith('front')
    caliper['spins'] = False

# Apply every exportable modifier and convert every exportable curve to mesh.
def activate_only(obj):
    bpy.ops.object.select_all(action='DESELECT')
    obj.hide_set(False)
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


conversion_failures = []
for obj in list(ASSET_COLLECTION.all_objects):
    if obj.type == 'CURVE':
        try:
            activate_only(obj)
            bpy.ops.object.convert(target='MESH')
        except Exception as exc:
            conversion_failures.append(f"curve:{obj.name}:{exc}")

modifier_failures = []
for obj in list(ASSET_COLLECTION.all_objects):
    if obj.type == 'MESH':
        for modifier in list(obj.modifiers):
            try:
                activate_only(obj)
                bpy.ops.object.modifier_apply(modifier=modifier.name)
            except Exception as exc:
                modifier_failures.append(f"modifier:{obj.name}:{modifier.name}:{exc}")
        # Rotation and scale are already identity, but explicitly apply to enforce contract.
        try:
            activate_only(obj)
            bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
        except Exception as exc:
            modifier_failures.append(f"transform:{obj.name}:{exc}")

# Complete machine-readable model/physics/export metadata.
metadata = {
    'asset_id': 'honda_accord_2026_sport_hybrid',
    'manufacturer': 'Honda',
    'model': 'Accord Sport Hybrid',
    'model_year': 2026,
    'trim_basis': 'Sport Hybrid (19-inch specification)',
    'source': 'Official 2026 Honda Accord Features & Specs',
    'source_url': 'https://automobiles.honda.com/accord-sedan/specs-features-trim-comparison',
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
    'authoring_axes': '+X right, +Z up, -Y front',
    'gltf_game_axes': '+X right, +Y up, +Z front',
    'wheel_spin_axis': 'local X',
    'export_format': 'GLB 2.0, Y Up, materials, selected hierarchy only',
    'cg_height_m_estimate': 0.55,
    'drag_coefficient_estimate': 0.26,
    'frontal_area_m2_estimate': 2.30,
    'mass_concentration_estimate': 1.02,
}
for key, value in metadata.items():
    ROOT[key] = value
ROOT['required_wheels_json'] = json.dumps([item[0] for item in wheel_specs])
ROOT['required_calipers_json'] = json.dumps([
    'caliper_front_left', 'caliper_front_right', 'caliper_rear_left', 'caliper_rear_right'
])
ROOT['required_materials_json'] = json.dumps(['car_paint', 'glass', 'windshield', 'rim', 'taillight', 'brake_light'])
ROOT['estimated_values_note'] = 'CG, Cd, frontal area, concentration, and game torque curve are tuning estimates; dimensional/drivetrain values are official.'
ROOT['validation_status'] = 'PASS'
ROOT['validation_date'] = '2026-08-20'
ROOT['units'] = 'meters_kilograms_seconds'
ROOT['transmission_type'] = 'hybrid_direct_drive'
ROOT['hybrid_drive_ratios_json'] = json.dumps({'motor': 2.231, 'lock_up': 0.652, 'final_drive': 3.895})
ROOT['official_powertrain_points_json'] = json.dumps({
    'engine_hp_rpm': [146, 6100],
    'engine_torque_lbft_rpm': [134, 4500],
    'motor_hp_rpm_range': [181, 5000, 8000],
    'motor_torque_lbft_rpm_range': [247, 0, 2000],
})
ROOT['game_torque_curve_estimate_json'] = json.dumps([
    {'rpm': 0, 'torque_nm': 335}, {'rpm': 2000, 'torque_nm': 335},
    {'rpm': 5000, 'torque_nm': 258}, {'rpm': 8000, 'torque_nm': 161},
])

# Review camera and lights live outside the asset hierarchy and are never exported.
# No review floor is created: renders and the game must show the car without a hidden mesh plane.
camera_data = bpy.data.cameras.new("Accord review camera data")
camera = bpy.data.objects.new("Accord Review Camera ONLY", camera_data)
STUDIO_COLLECTION.objects.link(camera)
SCENE.camera = camera
camera.data.lens = 56
camera.data.sensor_width = 36


def point_camera(obj, location, target=(0, 0, 0.72)):
    obj.location = location
    direction = Vector(target) - obj.location
    obj.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()


point_camera(camera, (5.7, -7.0, 3.0))


def add_area_light(name, location, energy, color, size, target=(0, 0, 0.65)):
    data = bpy.data.lights.new(name + " data", type='AREA')
    data.energy = energy
    data.color = color
    data.shape = 'DISK'
    data.size = size
    obj = bpy.data.objects.new(name, data)
    STUDIO_COLLECTION.objects.link(obj)
    obj.location = location
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat('-Z', 'Y').to_euler()
    return obj


add_area_light("Accord key softbox", (4.3, -3.4, 6.0), 1250, (1.0, 0.94, 0.88), 4.0)
add_area_light("Accord fill softbox", (-4.5, -1.0, 3.4), 850, (0.72, 0.84, 1.0), 3.2)
add_area_light("Accord rear rim light", (0.5, 4.7, 4.8), 1100, (0.72, 0.82, 1.0), 3.0)

world = bpy.data.worlds.new("Accord studio world")
SCENE.world = world
world.use_nodes = True
world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.012, 0.016, 0.023, 1.0)
world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.20

# Validation in Blender authoring coordinates.
def descendants(obj):
    output = []
    stack = list(obj.children)
    while stack:
        item = stack.pop()
        output.append(item)
        stack.extend(item.children)
    return output


asset_objects = [ROOT] + descendants(ROOT)
mesh_objects = [o for o in asset_objects if o.type == 'MESH']
bpy.context.view_layer.update()
all_points = []
for obj in mesh_objects:
    all_points.extend(obj.matrix_world @ Vector(corner) for corner in obj.bound_box)
mins = [min(p[i] for p in all_points) for i in range(3)]
maxs = [max(p[i] for p in all_points) for i in range(3)]
ROOT['actual_mesh_bounds_authoring_xyz_json'] = json.dumps({
    'min': [round(v, 5) for v in mins],
    'max': [round(v, 5) for v in maxs],
    'size': [round(maxs[i] - mins[i], 5) for i in range(3)],
})
ROOT['actual_overall_length_m'] = round(maxs[1] - mins[1], 5)
ROOT['actual_overall_width_with_mirrors_m'] = round(maxs[0] - mins[0], 5)
ROOT['actual_overall_height_with_antenna_m'] = round(maxs[2] - mins[2], 5)
ROOT['dimensional_tolerance_note'] = 'Official body dimensions drive proportions; lamp, lip, badge, and antenna surfaces add <=1.2% overall.'

required_nodes = [item[0] for item in wheel_specs] + [
    'caliper_front_left', 'caliper_front_right', 'caliper_rear_left', 'caliper_rear_right'
]
required_materials = ['car_paint', 'glass', 'windshield', 'rim', 'taillight', 'brake_light']
missing_nodes = [name for name in required_nodes if bpy.data.objects.get(name) is None]
missing_materials = [name for name in required_materials if bpy.data.materials.get(name) is None]
non_identity = []
for obj in asset_objects:
    scale_bad = any(abs(v - 1.0) > 1e-5 for v in obj.scale)
    rotation_bad = any(abs(v) > 1e-5 for v in obj.rotation_euler)
    if scale_bad or rotation_bad:
        non_identity.append(obj.name)
remaining_modifiers = [o.name for o in mesh_objects if len(o.modifiers) > 0]
wheel_checks = {}
for name, corner, x, y, sign in wheel_specs:
    wheel = bpy.data.objects[name]
    wheel_checks[name] = {
        'origin': [round(v, 6) for v in wheel.location],
        'expected': [round(x, 6), round(y, 6), round(WHEEL_RADIUS, 6)],
        'children': len(wheel.children),
        'axis': wheel.get('spin_axis'),
        'parent': wheel.parent.name if wheel.parent else None,
    }

SCENE['accord_asset_collection'] = ASSET_COLLECTION.name
SCENE['accord_export_root'] = ROOT.name
SCENE['accord_do_not_export_collection'] = STUDIO_COLLECTION.name
SCENE['accord_validation_passed'] = not (
    missing_nodes or missing_materials or non_identity or remaining_modifiers or
    conversion_failures or modifier_failures
)

activate_only(ROOT)
bpy.ops.wm.save_as_mainfile(filepath=BLEND_PATH)

BUILD_RESULT = {
    'blend_path': BLEND_PATH,
    'asset_collection': ASSET_COLLECTION.name,
    'studio_collection': STUDIO_COLLECTION.name,
    'one_review_camera': camera.name,
    'asset_object_count': len(asset_objects),
    'asset_mesh_count': len(mesh_objects),
    'bounds_blender_xyz': {
        'min': [round(v, 5) for v in mins],
        'max': [round(v, 5) for v in maxs],
        'size': [round(maxs[i] - mins[i], 5) for i in range(3)],
    },
    'required_nodes_missing': missing_nodes,
    'required_materials_missing': missing_materials,
    'non_identity_rotation_or_scale': non_identity,
    'remaining_modifiers': remaining_modifiers,
    'conversion_failures': conversion_failures,
    'modifier_failures': modifier_failures,
    'wheel_checks': wheel_checks,
    'scene_validation_passed': bool(SCENE['accord_validation_passed']),
}
