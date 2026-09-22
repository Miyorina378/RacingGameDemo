import bpy
import json

root = bpy.data.objects.get("Honda Accord 2026 ROOT")
shell = bpy.data.objects.get("Accord unibody shell")

res = {
    "root_loc": list(root.location) if root else None,
    "shell_dim": list(shell.dimensions) if shell else None,
    "shell_bb": [list(v) for v in shell.bound_box] if shell else None,
}
print(json.dumps(res, indent=2))
result = res
