import bpy
import bmesh

# Test Blender 5.2 mesh creation and features
mesh = bpy.data.meshes.new("TestMesh")
obj = bpy.data.objects.new("TestObj", mesh)
bpy.context.scene.collection.objects.link(obj)

bm = bmesh.new()
bmesh.ops.create_cube(bm, size=2.0)
bm.to_mesh(mesh)
bm.free()

mod = obj.modifiers.new("Subsurf", 'SUBSURF')
mod.levels = 1

wn = obj.modifiers.new("WeightedNormal", 'WEIGHTED_NORMAL')

print("Blender 5.2 test success! Object created with modifiers:", [m.name for m in obj.modifiers])
