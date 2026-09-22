import bpy
import bmesh
import math
from mathutils import Vector, Matrix, Euler

def sweep_h(x_coord):
    return 0.240 * ((abs(x_coord) / 0.72) ** 1.45)

def get_front_nose_y(x_coord, z_coord):
    sw_h = sweep_h(x_coord)
    if z_coord >= 0.560:
        t = min(1.0, max(0.0, (z_coord - 0.560) / (0.690 - 0.560)))
        sw_z = 0.055 * (t ** 1.30)
    else:
        t = min(1.0, max(0.0, (0.560 - z_coord) / (0.560 - 0.185)))
        sw_z = 0.135 * (t ** 1.25)
    return -2.495 + sw_h + sw_z

def get_hex_z_bounds(x_val):
    ax = abs(x_val)
    zt = 0.672
    if ax <= 0.20:
        zb = 0.505
    else:
        t = (ax - 0.20) / (0.358 - 0.20)
        zb = 0.505 + (0.582 - 0.505) * t
    return zt, zb

def cylinder_between(name, p1, p2, radius, material=None, parent=None, collection=None, segments=12):
    v1, v2 = Vector(p1), Vector(p2)
    diff = v2 - v1
    length = diff.length
    if length < 1e-6:
        return None
    mid = (v1 + v2) * 0.5
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=segments,
        radius=radius,
        depth=length,
        location=(0, 0, 0)
    )
    obj = bpy.context.active_object
    obj.name = name
    phi = math.atan2(diff.y, diff.x)
    theta = math.acos(max(-1.0, min(1.0, diff.z / length)))
    obj.rotation_mode = 'XYZ'
    obj.rotation_euler = Euler((0.0, theta, phi), 'ZYX')
    obj.location = mid
    return obj

# Clear and test
for obj in list(bpy.data.objects):
    bpy.data.objects.remove(obj, do_unlink=True)
for mesh in list(bpy.data.meshes):
    bpy.data.meshes.remove(mesh)

created = []
# Test slats
slat_levels = (0.530, 0.565, 0.600, 0.635)
for l_z in slat_levels:
    if l_z >= 0.582:
        w_span = 0.355
    else:
        t_span = (l_z - 0.505) / (0.582 - 0.505)
        w_span = 0.200 + (0.355 - 0.200) * max(0.0, min(1.0, t_span))
    num_segs = 16
    for s_i in range(num_segs):
        t1 = s_i / num_segs
        t2 = (s_i + 1) / num_segs
        x1 = -w_span + 2.0 * w_span * t1
        x2 = -w_span + 2.0 * w_span * t2
        p1 = (x1, get_front_nose_y(x1, l_z) - 0.016, l_z)
        p2 = (x2, get_front_nose_y(x2, l_z) - 0.016, l_z)
        o = cylinder_between(f"grille_rib_{l_z:.3f}_{s_i}", p1, p2, 0.0055)
        if o:
            created.append(o)

print(f"Created {len(created)} curved slat cylinders successfully!")

# Check open edges on created cylinders
open_edges_count = 0
for o in created:
    bm = bmesh.new()
    bm.from_mesh(o.data)
    open_edges = [e for e in bm.edges if len(e.link_faces) == 1]
    open_edges_count += len(open_edges)
    bm.free()

print(f"Total open edges in created cylinders: {open_edges_count}")
