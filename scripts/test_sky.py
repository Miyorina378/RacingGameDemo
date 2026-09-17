import bpy
import json

world = bpy.context.scene.world
world.use_nodes = True
nodes = world.node_tree.nodes
nodes.clear()
sky = nodes.new('ShaderNodeTexSky')
sky.sky_type = 'MULTIPLE_SCATTERING'
bg = nodes.new('ShaderNodeBackground')
out = nodes.new('ShaderNodeOutputWorld')
world.node_tree.links.new(sky.outputs['Color'], bg.inputs['Color'])
world.node_tree.links.new(bg.outputs['Background'], out.inputs['Surface'])

props = [p for p in dir(sky) if not p.startswith("_")]
res = {
    "status": "ok",
    "sky_type": sky.sky_type,
    "props": {p: str(getattr(sky, p)) for p in props if not callable(getattr(sky, p))}
}
print(json.dumps(res, indent=2))
result = res
