"""
Adds (or re-adds) the T junction where the east-pass road meets the ring road,
to the career valley that is open in Blender, without touching anything else.

    python scripts/run_blender.py D:\trifilpla\scripts\apply_road_junction.py

Headless: blender -b career_valley.blend --python scripts/apply_road_junction.py -- --save --export

Only the object road_junction_exit is created or replaced; kerb corners shrink
rather than run under a building. The added scenery is re-planted from its
frozen manifest so nothing grows on the new asphalt or inside any building
where it now stands. Everything else - including hand-placed buildings, the
gate and every original tree - is left exactly as it is.
"""

import bpy
import os
import sys

PROJECT_ROOT = os.environ.get("TRIFILPLA_ROOT", r"D:\trifilpla")
BUILD_SCRIPT = os.path.join(PROJECT_ROOT, "scripts", "build_career_valley.py")
EXPORT_SCRIPT = os.path.join(PROJECT_ROOT, "scripts", "export_career_valley.py")
ARGS = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []


def load(path, strip_call):
    with open(path, encoding="utf-8") as handle:
        source = handle.read()
    head, tail = source.rsplit("\n" + strip_call, 1)
    if tail.strip():
        raise RuntimeError(f"{os.path.basename(path)} no longer ends with {strip_call}")
    module = {"__name__": os.path.basename(path), "__file__": path}
    exec(compile(head, path, "exec"), module)
    return module


def main():
    valley = load(BUILD_SCRIPT, "build()")
    scene = bpy.data.scenes[valley["SCENE_NAME"]]
    window = bpy.context.window
    previous = window.scene if window else None
    if window:
        window.scene = scene
    try:
        venues, lifts = valley["read_markers"](bpy.data.collections[valley["MARKER_COLLECTION"]])
        if venues:
            valley["VENUES"] = venues
        valley["LIFTS"] = lifts
        valley["clear_height_caches"]()

        old = scene.objects.get("road_junction_exit")
        if old is not None:
            data = old.data
            bpy.data.objects.remove(old, do_unlink=True)
            if data.users == 0:
                bpy.data.meshes.remove(data)

        make = valley["make_material"]
        asphalt = make("ValleyAsphalt", 0x3a3d43, roughness=0.72)
        white = make("ValleyWhite", 0xf1f5f9, roughness=0.5)
        avoid = [o for o in scene.objects
                 if o.name.startswith(("license_", "arena_", "east_pass", "street_lamp_"))
                 and not o.name.endswith("_proto")]
        _, report = valley["build_road_junction"](scene, scene.objects["road_ring"], scene.objects["road_exit"],
                                                  "road_junction_exit", asphalt, white, avoid)

        removed = valley["remove_scenery"](scene)
        valley["apply_meadow_tint_live"](scene.objects["terrain"])
        _, _, stats = valley["build_scenery"](scene)
    finally:
        if window:
            window.scene = previous

    report.update({"scenery": stats, "scenery_objects_replanted": removed})
    print({"road_junction": report})
    if "--save" in ARGS:
        bpy.ops.wm.save_mainfile()
        print({"saved": bpy.data.filepath})
    if "--export" in ARGS:
        load(EXPORT_SCRIPT, "export()")["export"]()


main()
