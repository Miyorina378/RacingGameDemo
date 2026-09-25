"""
Adds the meadow road, the pond (with its island) and the waterfall to the
career valley that is open in Blender, from career_valley_features.json.

    python scripts/run_blender.py D:\\trifilpla\\scripts\\apply_water_and_road.py

Headless: blender -b career_valley.blend --python scripts/apply_water_and_road.py -- --save

What it changes, and nothing else:
  - creates road_meadow + road_junction_meadow, lamps along it, waterfall_rock,
    water_pool / water_falls / water_foam / water_pond (re-running replaces them)
  - deletes the trees listed under meadow_road.removed_trees (the user chose to
    remove them; they stood on the road) and records their positions so a full
    rebuild leaves them out without renaming any other tree
  - digs the pond basin into the terrain inside the pond outline only; the
    island keeps its ground, so the trees on it do not move
  - re-plants the added scenery from its frozen manifest
The cliff, the buildings, the gate and every other tree are left exactly as
they are.
"""

import bpy
import json
import math
import os
import sys

PROJECT_ROOT = os.environ.get("TRIFILPLA_ROOT", r"D:\trifilpla")
BUILD_SCRIPT = os.path.join(PROJECT_ROOT, "scripts", "build_career_valley.py")
ARGS = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
OUTPUTS = ("road_meadow", "road_junction_meadow", "waterfall_", "water_")


def load(path, strip_call):
    with open(path, encoding="utf-8") as handle:
        source = handle.read()
    head, tail = source.rsplit("\n" + strip_call, 1)
    module = {"__name__": os.path.basename(path), "__file__": path}
    exec(compile(head, path, "exec"), module)
    return module


def remove(obj):
    data = obj.data
    bpy.data.objects.remove(obj, do_unlink=True)
    if data is not None and data.users == 0 and isinstance(data, bpy.types.Mesh):
        bpy.data.meshes.remove(data)


def main():
    v = load(BUILD_SCRIPT, "build()")
    scene = bpy.data.scenes[v["SCENE_NAME"]]
    window = bpy.context.window
    previous = window.scene if window else None
    if window:
        window.scene = scene
    report = {}
    try:
        venues, lifts = v["read_markers"](bpy.data.collections[v["MARKER_COLLECTION"]])
        if venues:
            v["VENUES"] = venues
        v["LIFTS"] = lifts
        v["clear_height_caches"]()
        feats = v["features"]()
        road = feats["meadow_road"]

        # --- record where the removed trees stood, then delete them
        if "removed_tree_positions" not in road:
            road["removed_tree_positions"] = []
            for name in road["removed_trees"]:
                obj = scene.objects.get(name)
                if obj is not None:
                    road["removed_tree_positions"].append(
                        [round(obj.location.x, 3), round(-obj.location.y, 3)])
            with open(v["FEATURES_PATH"], "w", encoding="utf-8") as handle:
                json.dump(feats, handle, indent=1)
        deleted = []
        for name in road["removed_trees"]:
            obj = scene.objects.get(name)
            if obj is not None:
                remove(obj)
                deleted.append(name)
        report["trees_removed"] = deleted

        # --- previous run's outputs
        for obj in [o for o in scene.objects if o.name.startswith(OUTPUTS)
                    or o.get("road") == road["name"]]:
            remove(obj)

        # --- dig the pond, from the untouched ground formula (so re-runs never dig deeper)
        terrain = scene.objects["terrain"]
        mesh = terrain.data
        pond = v["_pond_shape"]()
        x0, z0, x1, z1 = pond["bbox"]
        base = mesh.attributes.get(v["MEADOW_BASE"])
        col = mesh.color_attributes["Col"]
        # Every vertex's height before any digging, kept in a hidden layer so a
        # re-run digs from the same starting point - and a vertex that never
        # matched the formula is dug from its own height, not replaced by it.
        undug = mesh.attributes.get("pond_base_z")
        if undug is None:
            undug = mesh.attributes.new(name="pond_base_z", type='FLOAT', domain='POINT')
            for i, vert in enumerate(mesh.vertices):
                x, z = vert.co.x, -vert.co.y
                natural = v["_terrain_height_unwatered"](x, z)
                already = mesh.get("pond_dug") and abs(vert.co.z - v["pond_carve"](x, z, natural)) < 1e-3
                undug.data[i].value = natural if already else vert.co.z
        dug = 0
        for i, vert in enumerate(mesh.vertices):
            x, z = vert.co.x, -vert.co.y
            if x < x0 - 1 or x > x1 + 1 or z < z0 - 1 or z > z1 + 1:
                continue
            start = undug.data[i].value
            new = v["pond_carve"](x, z, start)
            if start - new <= 1e-4:
                continue                   # outside the dig: never touched
            if abs(new - vert.co.z) > 1e-4:
                vert.co.z = new
                dug += 1
            if start - new > 0.05 and base is not None:
                shore = v["shore_colour"](x, z, tuple(base.data[i].vector) + (1.0,), start - new)
                base.data[i].vector = shore[:3]
                col.data[i].color = v["tint_grass_colour"](x, z, shore, new)
        mesh["pond_dug"] = 1
        mesh.update()
        report["terrain_vertices_dug"] = dug

        # --- the road, its junction and lamps
        make = v["make_material"]
        asphalt = make("ValleyAsphalt", 0x3a3d43, roughness=0.72)
        shoulder = make("ValleyShoulder", 0x8a8471, roughness=0.95)
        white = make("ValleyWhite", 0xf1f5f9, roughness=0.5)
        meadow, sites = v["build_meadow_road"](scene, [asphalt, shoulder, white])
        avoid = [o for o in scene.objects if o.name.startswith(("license_", "arena_", "east_pass", "street_lamp_"))
                 and not o.name.endswith("_proto")]
        _, junction = v["build_road_junction"](scene, scene.objects["road_ring"], meadow,
                                               "road_junction_meadow", asphalt, white, avoid)
        proto = scene.objects.get("street_lamp_proto")
        head = tuple(next(o for o in scene.objects if o.name.startswith("street_lamp_0"))["lamp_head"])
        trees = [(o.matrix_world.translation.x, o.matrix_world.translation.y) for o in scene.objects
                 if o.type == 'MESH' and (o.name.startswith("tree_") or o.name.startswith("scenery_tree_"))]
        serial = 1 + max(int(o.name[len("street_lamp_"):]) for o in scene.objects
                         if o.name.startswith("street_lamp_") and o.name[len("street_lamp_"):].isdigit())
        lamps = []
        for site in sites:
            bx, by = site["pole"]
            if min(math.hypot(bx - tx, by - ty) for tx, ty in trees) < 2.5:
                continue                   # never plant a lamp inside a tree
            obj = bpy.data.objects.new("street_lamp_%03d" % serial, proto.data)
            obj.location = (bx, by, site["ground"])
            obj.rotation_euler = (0.0, 0.0, site["bearing"])
            obj["lamp_head"] = head
            obj["road"] = site["road"]
            scene.collection.objects.link(obj)
            lamps.append(obj.name)
            serial += 1
        report["road"] = {"object": meadow.name, "junction": junction, "lamps": lamps}

        # --- rock, pool, falls, pond
        water = v["build_water_features"](scene, bpy.data.materials["ValleyTerrain"])
        report["water"] = [o.name for o in water]

        removed = v["remove_scenery"](scene)
        v["apply_meadow_tint_live"](terrain)
        _, _, stats = v["build_scenery"](scene)
        report["scenery"] = {k: stats[k] for k in ("new_trees", "shrubs", "flowers", "skipped_from_manifest")}
    finally:
        if window:
            window.scene = previous
    print({"water_and_road": report})
    if "--save" in ARGS:
        bpy.ops.wm.save_mainfile()
        print({"saved": bpy.data.filepath})


main()
