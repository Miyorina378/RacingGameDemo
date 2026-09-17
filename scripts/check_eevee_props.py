import bpy
import json

eevee = bpy.context.scene.eevee
props = [p for p in dir(eevee) if not p.startswith("_")]
res = {p: str(getattr(eevee, p)) for p in props if not callable(getattr(eevee, p))}
print(json.dumps(res, indent=2))
result = res
