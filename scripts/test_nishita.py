import bpy
import json

world = bpy.context.scene.world
world.use_nodes = True
nodes = world.node_tree.nodes
nodes.clear()
sky = nodes.new('ShaderNodeTexSky')
sky.sky_type = 'NISHITA'
bg = nodes.new('ShaderNodeBackground')
out = nodes.new('ShaderNodeOutputWorld')
world.node_tree.links.new(sky.outputs['Color'], bg.inputs['Color'])
world.node_tree.links.new(bg.outputs['Background'], out.inputs['Surface'])

res = {
    "status": "ok",
    "sky_type": sky.sky_type,
    "sun_elevation": sky.sun_elevation
}
print(json.dumps(res))
result = res
