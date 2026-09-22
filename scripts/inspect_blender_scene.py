import bpy
import json

scene = bpy.context.scene
res = {
    "filepath": bpy.data.filepath,
    "collections": [c.name for c in bpy.data.collections],
    "master_objects": [o.name for o in scene.collection.objects],
    "render_engine": scene.render.engine,
    "world": scene.world.name if scene.world else None,
    "objects_summary": {
        "meshes": len([o for o in bpy.data.objects if o.type == 'MESH']),
        "lights": [o.name for o in bpy.data.objects if o.type == 'LIGHT'],
        "cameras": [o.name for o in bpy.data.objects if o.type == 'CAMERA']
    }
}
print(json.dumps(res, indent=2))
result = res
