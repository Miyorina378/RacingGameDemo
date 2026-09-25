"""
CAREER VALLEY RE-EXPORT
========================
Exports whatever currently sits in the "CareerValley" scene out to
public/models/career_valley.glb, without regenerating anything.

Use this after sculpting the terrain by hand in career_valley.blend, so your
edits reach the game. Running build_career_valley.py instead would rebuild the
mesh from the formula and throw hand-work away.

    python scripts/run_blender.py D:\\trifilpla\\scripts\\export_career_valley.py

Street lamps are individual objects (street_lamp_000, ...): move, rotate or
delete them in Blender and this also rewrites career_valley_lamps.json, so the
night-time glow follows them.

Reminder: if you change the terrain's overall size or grid density by hand, the
matching TERRAIN_EXTENT / HEIGHT_GRID constants in
components/objects/CareerValley.ts must be updated too, or everything placed on
the terrain (roads, arenas, trees) will sit at the wrong height.
"""

import bpy
from mathutils import Vector
import json
import os

PROJECT_ROOT = os.environ.get("TRIFILPLA_ROOT", r"D:\trifilpla")
OUT_PATH = os.path.join(PROJECT_ROOT, "public", "models", "career_valley.glb")
LAMP_PATH = os.path.join(PROJECT_ROOT, "public", "models", "career_valley_lamps.json")
SCENE_NAME = "CareerValley"

# Street lamps are separate objects (street_lamp_000, ...). Move, turn or
# delete them freely: the lamp manifest the game reads for the night glow is
# rewritten from wherever they now stand.


def is_helper(obj):
    """Build-time helpers that must never reach the GLB."""
    name = obj.name
    return (name.endswith("_proto")
            or name.startswith("tree_conifer_") or name.startswith("tree_broadleaf_"))


def write_lamp_manifest(scene):
    bpy.context.view_layer.update()   # pick up lamps moved since the last redraw
    lamps = []
    for obj in sorted(scene.objects, key=lambda o: o.name):
        if obj.type != 'MESH' or "lamp_head" not in obj or is_helper(obj):
            continue
        head = obj.matrix_world @ Vector(tuple(obj["lamp_head"]))
        # Blender (x, y, z) -> valley (x, height, -y), as the build script does.
        lamps.append({
            "x": round(head.x, 3),
            "z": round(-head.y, 3),
            "y": round(head.z, 3),
            "ground": round(obj.matrix_world.translation.z, 3),
        })
    if not lamps:
        return 0
    previous = {}
    if os.path.exists(LAMP_PATH):
        with open(LAMP_PATH, encoding="utf-8") as handle:
            previous = json.load(handle)
    payload = {
        "spacing": previous.get("spacing", 38.0),
        "poleHeight": previous.get("poleHeight", 7.4),
        "lensMaterial": "ValleyLampLens",
        "lamps": lamps,
    }
    with open(LAMP_PATH, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=1)
    return len(lamps)


def export():
    scene = bpy.data.scenes.get(SCENE_NAME)
    if scene is None:
        print({"error": f'scene "{SCENE_NAME}" not found - open career_valley.blend first'})
        return

    meshes = [obj for obj in scene.objects if obj.type == 'MESH' and not is_helper(obj)]
    if not meshes:
        print({"error": f'scene "{SCENE_NAME}" has no mesh objects to export'})
        return

    # There is no window when Blender runs headless (-b); the export then runs
    # with the scene handed to it through a context override instead.
    window = bpy.context.window
    previous_scene = window.scene if window else None
    if window:
        window.scene = scene

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
        mesh_obj.select_set(True, view_layer=scene.view_layers[0])
    scene.view_layers[0].objects.active = meshes[0]

    os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)

    export_kwargs = dict(
        filepath=OUT_PATH,
        export_format='GLB',
        use_selection=True,
        export_apply=True,
        export_yup=True,
        export_normals=True,
    )
    def run_export():
        try:
            bpy.ops.export_scene.gltf(export_vertex_color='ACTIVE', **export_kwargs)
        except TypeError:
            bpy.ops.export_scene.gltf(**export_kwargs)

    if window:
        run_export()
    else:
        with bpy.context.temp_override(scene=scene, view_layer=scene.view_layers[0]):
            run_export()

    lamp_count = write_lamp_manifest(scene)

    if window:
        window.scene = previous_scene

    print({
        "lamp_manifest": LAMP_PATH if lamp_count else "unchanged (no lamp objects)",
        "lamps": lamp_count,
        "exported": OUT_PATH,
        "bytes": os.path.getsize(OUT_PATH) if os.path.exists(OUT_PATH) else -1,
        "objects": [m.name for m in meshes],
        "scene_restored": window.scene.name if window else "headless",
    })


export()
