"""
CAREER VALLEY RE-EXPORT
========================
Exports whatever currently sits in the "CareerValley" scene out to
public/models/career_valley.glb, without regenerating anything.

Use this after sculpting the terrain by hand in career_valley.blend, so your
edits reach the game. Running build_career_valley.py instead would rebuild the
mesh from the formula and throw hand-work away.

    python scripts/run_blender.py D:\\trifilpla\\scripts\\export_career_valley.py

Reminder: if you change the terrain's overall size or grid density by hand, the
matching TERRAIN_EXTENT / HEIGHT_GRID constants in
components/objects/CareerValley.ts must be updated too, or everything placed on
the terrain (roads, arenas, trees) will sit at the wrong height.
"""

import bpy
import os

OUT_PATH = r"D:\trifilpla\public\models\career_valley.glb"
SCENE_NAME = "CareerValley"


def export():
    scene = bpy.data.scenes.get(SCENE_NAME)
    if scene is None:
        print({"error": f'scene "{SCENE_NAME}" not found - open career_valley.blend first'})
        return

    meshes = [obj for obj in scene.objects if obj.type == 'MESH']
    if not meshes:
        print({"error": f'scene "{SCENE_NAME}" has no mesh objects to export'})
        return

    previous_scene = bpy.context.window.scene
    bpy.context.window.scene = scene

    # Selection is global across scenes, so clear every scene's selection before
    # picking out the terrain - otherwise stray selected objects ride along.
    for other_scene in bpy.data.scenes:
        for view_layer in other_scene.view_layers:
            for obj in other_scene.objects:
                try:
                    obj.select_set(False, view_layer=view_layer)
                except Exception:
                    pass

    for mesh_obj in meshes:
        mesh_obj.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]

    os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)

    export_kwargs = dict(
        filepath=OUT_PATH,
        export_format='GLB',
        use_selection=True,
        export_apply=True,
        export_yup=True,
        export_normals=True,
    )
    try:
        bpy.ops.export_scene.gltf(export_vertex_color='ACTIVE', **export_kwargs)
    except TypeError:
        bpy.ops.export_scene.gltf(**export_kwargs)

    bpy.context.window.scene = previous_scene

    print({
        "exported": OUT_PATH,
        "bytes": os.path.getsize(OUT_PATH) if os.path.exists(OUT_PATH) else -1,
        "objects": [m.name for m in meshes],
        "scene_restored": bpy.context.window.scene.name,
    })


export()
