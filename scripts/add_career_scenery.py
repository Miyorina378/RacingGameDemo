"""
Adds the extra scenery - new tree species, shrubs, rocks, flowers, grass and
the meadow tint - to the career valley that is open in Blender RIGHT NOW,
without rebuilding anything.

    python scripts/run_blender.py D:\\trifilpla\\scripts\\add_career_scenery.py

It only ever creates, and on a re-run replaces, objects whose names start
with "scenery_". The terrain, roads, arenas, lamps, existing trees and the
cliff are left exactly as they are; the meadow tint recolours grass on the
terrain once (a flag on the mesh stops it compounding) and never within a
butte's reach.

Afterwards run export_career_valley.py to put it in the game, and save the
.blend in Blender when you are happy with it - this script does not save.

The scenery code itself lives in build_career_valley.py (the SCENERY section),
so a full rebuild produces the same result.
"""

import bpy
import os

PROJECT_ROOT = os.environ.get("TRIFILPLA_ROOT", r"D:\trifilpla")
BUILD_SCRIPT = os.path.join(PROJECT_ROOT, "scripts", "build_career_valley.py")


def load_build_module():
    """The build script's functions, without running its build()."""
    with open(BUILD_SCRIPT, encoding="utf-8") as handle:
        source = handle.read()
    head, tail = source.rsplit("\nbuild()", 1)
    if tail.strip():
        raise RuntimeError("build_career_valley.py no longer ends with build()")
    module = {"__name__": "career_valley_build", "__file__": BUILD_SCRIPT}
    exec(compile(head, BUILD_SCRIPT, "exec"), module)
    return module


def main():
    valley = load_build_module()
    scene = bpy.data.scenes.get(valley["SCENE_NAME"])
    if scene is None:
        print({"error": "CareerValley scene not found - open career_valley.blend first"})
        return

    if bpy.context.mode != 'OBJECT':
        bpy.ops.object.mode_set(mode='OBJECT')

    previous = bpy.context.window.scene
    bpy.context.window.scene = scene
    try:
        markers = bpy.data.collections.get(valley["MARKER_COLLECTION"])
        if markers is not None:
            venues, lifts = valley["read_markers"](markers)
            if venues:
                valley["VENUES"] = venues
            valley["LIFTS"] = lifts
        valley["clear_height_caches"]()

        removed = valley["remove_scenery"](scene)
        tinted = valley["apply_meadow_tint_live"](scene.objects["terrain"])
        objects, protos, stats = valley["build_scenery"](scene)
    finally:
        bpy.context.window.scene = previous

    stats.update({"replaced_old_scenery_objects": removed,
                  "terrain_verts_tinted": tinted,
                  "objects_added": len(objects),
                  "hidden_prototypes": len(protos)})
    print(stats)


main()
