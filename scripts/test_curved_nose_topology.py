import bpy
import bmesh
import math
from mathutils import Vector

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

# Test Ring 0 setup
hw_front = 0.720
belt_x = hw_front * 0.88
rail_x = hw_front * 0.62
shoulder_x = hw_front * 0.96
flair_x = hw_front * 0.965
bot_x = hw_front * 0.940
ridge_x = 0.24
cz = 0.690

r_pts = [
    (0.0, get_front_nose_y(0.0, cz), cz),
    (ridge_x, get_front_nose_y(ridge_x, cz), cz),
    (rail_x * 0.85, get_front_nose_y(rail_x * 0.85, cz), cz),
    (rail_x * 1.02, get_front_nose_y(rail_x * 1.02, cz), cz),
    (belt_x, get_front_nose_y(belt_x, cz), cz),
    (shoulder_x, get_front_nose_y(shoulder_x, 0.655), 0.655),
    (flair_x, get_front_nose_y(flair_x, 0.425), 0.425),
    (bot_x, get_front_nose_y(bot_x, 0.185), 0.185),
]
floor_pts = [
    (bot_x * 0.70, get_front_nose_y(bot_x * 0.70, 0.185), 0.185),
    (0.0, get_front_nose_y(0.0, 0.185), 0.185),
    (-bot_x * 0.70, get_front_nose_y(-bot_x * 0.70, 0.185), 0.185),
]
l_pts = [(-p[0], p[1], p[2]) for p in reversed(r_pts[1:])]
ring0 = r_pts + floor_pts + l_pts
assert len(ring0) == 18, f"Ring 0 length is {len(ring0)}"

# Front cap indices
row0_indices = [14, 15, 16, 17, 0, 1, 2, 3, 4]
cols_x_f = [-belt_x, -rail_x * 1.02, -rail_x * 0.85, -ridge_x, 0.0, ridge_x, rail_x * 0.85, rail_x * 1.02, belt_x]

verts = [Vector(pt) for pt in ring0]
# Row 1
row1_indices = [13]
for x in cols_x_f[1:-1]:
    verts.append(Vector((x, get_front_nose_y(x, 0.560), 0.560)))
    row1_indices.append(len(verts) - 1)
row1_indices.append(5)

# Row 2
row2_indices = [12]
for x in cols_x_f[1:-1]:
    verts.append(Vector((x, get_front_nose_y(x, 0.440), 0.440)))
    row2_indices.append(len(verts) - 1)
row2_indices.append(6)

# Row 3
row3_indices = [11]
for x in cols_x_f[1:-1]:
    verts.append(Vector((x, get_front_nose_y(x, 0.280), 0.280)))
    row3_indices.append(len(verts) - 1)
row3_indices.append(7)

faces = []
for c in range(8):
    faces.append((row0_indices[c], row1_indices[c], row1_indices[c + 1], row0_indices[c + 1]))
for c in range(8):
    faces.append((row1_indices[c], row2_indices[c], row2_indices[c + 1], row1_indices[c + 1]))
for c in range(8):
    faces.append((row2_indices[c], row3_indices[c], row3_indices[c + 1], row2_indices[c + 1]))

faces.append((row3_indices[0], 10, row3_indices[2], row3_indices[1]))
faces.append((row3_indices[2], 10, row3_indices[3]))
faces.append((row3_indices[3], 10, 9, row3_indices[4]))
faces.append((row3_indices[4], 9, 8, row3_indices[5]))
faces.append((row3_indices[5], 8, row3_indices[6]))
faces.append((row3_indices[6], 8, row3_indices[8], row3_indices[7]))

bm = bmesh.new()
bm_verts = [bm.verts.new(v) for v in verts]
for f in faces:
    bm.faces.new([bm_verts[idx] for idx in f])
bm.verts.index_update()
bm.edges.index_update()
bm.verts.ensure_lookup_table()
bm.edges.ensure_lookup_table()

# Check open boundary edges
open_edges = [e for e in bm.edges if len(e.link_faces) == 1]
# Open boundary edges should ONLY be Ring 0 edges!
ring0_edges = set()
for i in range(18):
    j = (i + 1) % 18
    ring0_edges.add(tuple(sorted((i, j))))

actual_open_edges = set(tuple(sorted((e.verts[0].index, e.verts[1].index))) for e in open_edges)
diff = actual_open_edges.symmetric_difference(ring0_edges)
print("Topology test result:")
print(f"  Total cap faces: {len(faces)}")
print(f"  Open edges count: {len(open_edges)} (expected 18)")
print(f"  Diff with Ring 0: {diff}")
assert diff == set(), f"Ring 0 boundary mismatch: {diff}"
print("SUCCESS: 100% watertight boundary match with Ring 0!")
