import bpy
result = {
    "version": bpy.app.version_string,
    "objects": len(bpy.data.objects),
    "active": bpy.context.active_object.name if bpy.context.active_object else None
}
