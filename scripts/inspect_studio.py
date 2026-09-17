import bpy
import json

studio_col = bpy.data.collections.get("Accord_Review_Studio_NOT_FOR_EXPORT")
studio_objs = [o.name for o in studio_col.objects] if studio_col else []

mats = [m.name for m in bpy.data.materials]

world = bpy.context.scene.world
world_nodes = []
if world and world.use_nodes:
    world_nodes = [n.name + " (" + n.type + ")" for n in world.node_tree.nodes]

res = {
    "studio_objects": studio_objs,
    "materials": mats,
    "world_name": world.name if world else None,
    "world_nodes": world_nodes
}
print(json.dumps(res, indent=2))
result = res
