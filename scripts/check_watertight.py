import bpy
import bmesh
import json

asset_col = bpy.data.collections.get("Honda_Accord_2026_GAME_ASSET")
results = {}
total_open_edges = 0

for obj in asset_col.all_objects:
    if obj.type == 'MESH':
        bm = bmesh.new()
        bm.from_mesh(obj.data)
        open_edges = [e for e in bm.edges if e.is_boundary or not e.is_manifold]
        if open_edges:
            results[obj.name] = len(open_edges)
            total_open_edges += len(open_edges)
        bm.free()

output = {
    "total_mesh_objects": len([o for o in asset_col.all_objects if o.type == 'MESH']),
    "total_open_edges": total_open_edges,
    "non_manifold_objects": results
}
print(json.dumps(output, indent=2))
