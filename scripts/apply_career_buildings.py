"""
Rebuilds the east pass gate and the License Center parts in the career valley,
without rebuilding anything else.

Live, with career_valley.blend open in Blender:

    python scripts/run_blender.py D:\\trifilpla\\scripts\\apply_career_buildings.py

Headless, with Blender closed:

    blender -b D:\\trifilpla\\career_valley.blend --python D:\\trifilpla\\scripts\\apply_career_buildings.py -- --save --export

License Center parts that already exist are left exactly as they are - your
placement AND any mesh edits - and only missing parts are built. Pass --reset
to regenerate every part where the build script puts it (this throws away
hand edits to those meshes). The east_pass gate is only rebuilt with --gate
(or --reset). Nothing else is replaced; the added scenery is re-planted from its frozen manifest so nothing
stands inside the new footprints. Terrain, roads, lamps, the other arenas, the
cliff and every original tree are left exactly as they are.
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


def remove(scene, obj):
    data = obj.data
    bpy.data.objects.remove(obj, do_unlink=True)
    if data is not None and data.users == 0:
        bpy.data.meshes.remove(data)


def main():
    valley = load(BUILD_SCRIPT, "build()")
    scene = bpy.data.scenes.get(valley["SCENE_NAME"])
    if scene is None:
        print({"error": "CareerValley scene not found"})
        return

    window = bpy.context.window
    if window and bpy.context.mode != 'OBJECT':
        bpy.ops.object.mode_set(mode='OBJECT')
    previous = window.scene if window else None
    if window:
        window.scene = scene

    try:
        markers = bpy.data.collections.get(valley["MARKER_COLLECTION"])
        venues, lifts = valley["read_markers"](markers)
        if venues:
            valley["VENUES"] = venues
        valley["LIFTS"] = lifts
        valley["clear_height_caches"]()

        reset = "--reset" in ARGS
        rebuild_gate = reset or "--gate" in ARGS
        venue = next(v for v in valley["VENUES"] if v["id"] == valley["LICENSE_CENTER_VENUE"])
        prefix = valley["LICENSE_PREFIX"]
        existing = {o.name for o in scene.objects if o.name.startswith(prefix)}

        doomed = [o for o in scene.objects if o.name == "arena_" + venue["id"]]
        if reset:
            doomed += [o for o in scene.objects if o.name.startswith(prefix)]
            existing = set()
        if rebuild_gate:
            doomed += [o for o in scene.objects if o.name == "east_pass"]
        for obj in doomed:
            remove(scene, obj)

        make = valley["make_material"]
        stone = make("ValleyStone", 0x3a3d45, roughness=0.82, metallic=0.1)
        stone_dark = make("ValleyStoneDark", 0x22242a, roughness=0.86)
        arena_mats = [stone, stone_dark,
                      make("ValleyWhite", 0xf1f5f9, roughness=0.5),
                      make("ValleyBlack", 0x14151a, roughness=0.6),
                      make("ValleyAsphalt", 0x3a3d43, roughness=0.72)]
        theme = make("ValleyTheme_" + venue["id"], venue["theme"],
                     roughness=0.45, metallic=0.25, emission=1.4)
        rock = make("ValleyRock", 0x6b7d83, roughness=0.95)

        missing = [n for n in valley["LICENSE_PARTS"] if prefix + n not in existing]
        report = {"kept_as_is": sorted(existing), "built": []}
        if missing:
            parts, built_report = valley["build_license_center"](scene, venue, arena_mats, theme)
            for obj in parts:
                # build_license_center makes every part; keep only the missing ones.
                if obj.name.split(".")[0] in existing or obj.name[len(prefix):].split(".")[0] not in missing:
                    remove(scene, obj)
                else:
                    report["built"].append(obj.name)
        gate = scene.objects.get("east_pass")
        if rebuild_gate or gate is None:
            gate = valley["build_east_pass"](scene, [rock, stone_dark], scene.objects.get("road_exit"))

        removed = valley["remove_scenery"](scene)
        valley["apply_meadow_tint_live"](scene.objects["terrain"])
        _, _, stats = valley["build_scenery"](scene)
    finally:
        if window:
            window.scene = previous

    report.update({"east_pass_rebuilt": bool(rebuild_gate), "scenery": stats,
                   "scenery_objects_replanted": removed})
    print({"career_buildings": report})

    if "--save" in ARGS:
        bpy.ops.wm.save_mainfile()
        print({"saved": bpy.data.filepath})
    if "--export" in ARGS:
        load(EXPORT_SCRIPT, "export()")["export"]()


main()
