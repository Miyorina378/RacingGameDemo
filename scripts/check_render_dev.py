import bpy
import json

res = {
    "render_engine": bpy.context.scene.render.engine,
    "cycles_device": bpy.context.scene.cycles.device if hasattr(bpy.context.scene, "cycles") else None,
    "eevee_settings": {},
    "compute_devices": []
}

try:
    cpref = bpy.context.preferences.addons['cycles'].preferences
    for dev in cpref.devices:
        res["compute_devices"].append({
            "name": dev.name,
            "type": dev.type,
            "use": dev.use
        })
except Exception as e:
    res["cycles_error"] = str(e)

print(json.dumps(res, indent=2))
result = res
