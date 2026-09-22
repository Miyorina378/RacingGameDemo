"""
Blender MCP Server bridge for Antigravity.
Connects to Blender's TCP socket on localhost:9876.
"""

import json
import socket
from typing import Any, Dict
from mcp.server.fastmcp import FastMCP

mcp = FastMCP("blender-bridge")

BLENDER_HOST = "127.0.0.1"
BLENDER_PORT = 9876

def send_blender_request(code: str) -> Dict[str, Any]:
    """Send python code to Blender's MCP socket and return parsed response."""
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.settimeout(30.0)
    try:
        s.connect((BLENDER_HOST, BLENDER_PORT))
        req = {
            "type": "execute",
            "strict_json": True,
            "code": code
        }
        s.sendall(json.dumps(req).encode("utf-8") + b"\x00")
        
        data = b""
        while True:
            chunk = s.recv(8192)
            if not chunk:
                break
            data += chunk
            if b"\x00" in chunk:
                break
        
        cleaned = data.split(b"\x00")[0].decode("utf-8", errors="replace")
        return json.loads(cleaned)
    finally:
        s.close()

@mcp.tool()
def execute_blender_code(code: str) -> str:
    """Execute Python code in the active Blender session.
    Ensure code defines a `result = {...}` dict with return values if needed.
    Example:
    code = '''
    import bpy
    result = {"active": bpy.context.active_object.name if bpy.context.active_object else None}
    '''
    """
    try:
        res = send_blender_request(code)
        return json.dumps(res, indent=2)
    except Exception as e:
        return json.dumps({"status": "error", "message": str(e)})

@mcp.tool()
def get_scene_info() -> str:
    """Get active Blender scene summary, object names, and selection."""
    code = """
import bpy
result = {
    "version": bpy.app.version_string,
    "blend_file": bpy.data.filepath,
    "active_object": bpy.context.active_object.name if bpy.context.active_object else None,
    "selected_objects": [o.name for o in bpy.context.selected_objects],
    "object_count": len(bpy.data.objects),
    "objects": [o.name for o in bpy.data.objects],
    "collections": [c.name for c in bpy.data.collections]
}
"""
    try:
        res = send_blender_request(code)
        return json.dumps(res, indent=2)
    except Exception as e:
        return json.dumps({"status": "error", "message": str(e)})

@mcp.tool()
def inspect_object(object_name: str) -> str:
    """Inspect detailed information about a specific Blender object."""
    code = f'''
import bpy
obj = bpy.data.objects.get({repr(object_name)})
if not obj:
    result = {{"error": "Object not found"}}
else:
    result = {{
        "name": obj.name,
        "type": obj.type,
        "location": list(obj.location),
        "rotation_euler": list(obj.rotation_euler),
        "scale": list(obj.scale),
        "dimensions": list(obj.dimensions),
        "modifiers": [m.name + " (" + m.type + ")" for m in obj.modifiers],
        "materials": [m.name for m in obj.data.materials if m] if hasattr(obj.data, "materials") else [],
        "parent": obj.parent.name if obj.parent else None,
        "children": [c.name for c in obj.children]
    }}
'''
    try:
        res = send_blender_request(code)
        return json.dumps(res, indent=2)
    except Exception as e:
        return json.dumps({"status": "error", "message": str(e)})

@mcp.tool()
def export_car_glb(output_path: str, collection_name: str = "Honda_Accord_2026_GAME_ASSET") -> str:
    """Export the game asset collection as a clean GLB file matching project rules."""
    code = f"""
import bpy
col = bpy.data.collections.get({repr(collection_name)})
if not col:
    result = {{"status": "error", "message": f"Collection not found: {collection_name}"}}
else:
    bpy.ops.object.select_all(action='DESELECT')
    for obj in col.all_objects:
        if obj.type not in ('CAMERA', 'LIGHT'):
            obj.select_set(True)
    
    out_file = {repr(output_path)}
    bpy.ops.export_scene.gltf(
        filepath=out_file,
        use_selection=True,
        export_format='GLB',
        export_yup=True,
        export_materials='EXPORT',
        export_cameras=False,
        export_lights=False
    )
    result = {{"status": "ok", "exported_path": out_file, "selected_count": len([o for o in bpy.context.selected_objects])}}
"""
    try:
        res = send_blender_request(code)
        return json.dumps(res, indent=2)
    except Exception as e:
        return json.dumps({"status": "error", "message": str(e)})

if __name__ == "__main__":
    mcp.run(transport="stdio")

