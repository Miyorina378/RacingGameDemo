import bpy
import bmesh
import math
from mathutils import Vector

def sweep_h(x_val):
    return 0.220 * ((abs(x_val) / 0.72) ** 1.5)

def get_front_nose_y(x, z):
    sw_h = sweep_h(x)
    if z >= 0.580:
        t = (z - 0.580) / (0.690 - 0.580) if z <= 0.690 else 1.0
        sw_z = 0.040 * (t ** 1.3)
    else:
        t = (0.580 - z) / (0.580 - 0.185)
        sw_z = 0.125 * (t ** 1.25)
    return -2.485 + sw_h + sw_z

print("Nose Y coordinates at X=0:")
for z in (0.690, 0.640, 0.580, 0.480, 0.380, 0.280, 0.185):
    print(f"  Z={z:.3f} -> Y={get_front_nose_y(0.0, z):.4f}")

print("\nNose Y coordinates at Z=0.580 (peak):")
for x in (0.0, 0.20, 0.38, 0.55, 0.72):
    print(f"  X={x:.2f} -> Y={get_front_nose_y(x, 0.580):.4f}")
