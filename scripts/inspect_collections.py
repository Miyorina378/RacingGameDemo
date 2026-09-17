import bpy
import json

res = {}
for col in bpy.data.collections:
    res[col.name] = {
        "objects": [f"{o.name} ({o.type})" for o in col.objects],
        "children": [c.name for c in col.children]
    }

# Also list materials
materials = [m.name for m in bpy.data.materials]
res["materials"] = materials

# Check camera and render settings
cam = bpy.data.cameras.get("Accord Review Camera ONLY") or (bpy.data.cameras[0] if bpy.data.cameras else None)
res["camera_settings"] = {
    "name": cam.name if cam else None,
    "lens": cam.lens if cam else None
}

print(json.dumps(res, indent=2))
result = res
