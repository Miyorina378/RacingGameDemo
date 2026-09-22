import bpy
import math
import os
import json
from mathutils import Vector, Euler

# ==============================================================================
# IN-GAME RACETRACK SHOWCASE SCENE GENERATOR FOR 2026 HONDA ACCORD
# Saves to a separate file: D:\trifilpla\honda_accord_2026_ingame_showcase.blend
# ==============================================================================

ORIGINAL_BLEND = r"D:\trifilpla\honda_accord_2026_game_ready.blend"
NEW_SHOWCASE_BLEND = r"D:\trifilpla\honda_accord_2026_ingame_showcase.blend"
OUTPUT_DIR = r"D:\trifilpla"
ARTIFACT_DIR = r"C:\Users\User\.gemini\antigravity-ide\brain\1fe2baac-f89a-4f77-a97d-7efb06dd58d3"

# Step 1: Ensure we are operating in the new separate file immediately
bpy.ops.wm.save_as_mainfile(filepath=NEW_SHOWCASE_BLEND)
print(f"Saved working file to: {NEW_SHOWCASE_BLEND}")

scene = bpy.context.scene

# Clean up old review studio if present
old_studio = bpy.data.collections.get("Accord_Review_Studio_NOT_FOR_EXPORT")
if old_studio:
    for obj in list(old_studio.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    bpy.data.collections.remove(old_studio)

# Remove any existing InGame showcase collection so it can be cleanly rebuilt
existing_showcase = bpy.data.collections.get("Accord_InGame_Track_Scene")
if existing_showcase:
    for obj in list(existing_showcase.all_objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    bpy.data.collections.remove(existing_showcase)

# Create dedicated InGame Showcase Collection
showcase_col = bpy.data.collections.new("Accord_InGame_Track_Scene")
scene.collection.children.link(showcase_col)

# Helper for materials
def get_or_create_mat(name):
    mat = bpy.data.materials.get(name)
    if not mat:
        mat = bpy.data.materials.new(name)
        mat.use_nodes = True
    return mat

def hex_to_rgb(hex_str, alpha=1.0):
    hex_str = hex_str.lstrip('#')
    return (
        int(hex_str[0:2], 16) / 255.0,
        int(hex_str[2:4], 16) / 255.0,
        int(hex_str[4:6], 16) / 255.0,
        alpha
    )

# ------------------------------------------------------------------------------
# 1. TUNE VEHICLE MATERIALS FOR IN-GAME GLAMOUR
# ------------------------------------------------------------------------------
# Car Paint: Sleek Sonic Gray Pearl / Modern Steel with deep clearcoat
paint_mat = bpy.data.materials.get("car_paint")
if paint_mat and paint_mat.use_nodes:
    bsdf = paint_mat.node_tree.nodes.get('Principled BSDF')
    if bsdf:
        # Metallic pearl gray with glossy coat
        if 'Base Color' in bsdf.inputs:
            bsdf.inputs['Base Color'].default_value = (0.28, 0.32, 0.36, 1.0)
        if 'Metallic' in bsdf.inputs:
            bsdf.inputs['Metallic'].default_value = 0.85
        if 'Roughness' in bsdf.inputs:
            bsdf.inputs['Roughness'].default_value = 0.20
        if 'Coat Weight' in bsdf.inputs:
            bsdf.inputs['Coat Weight'].default_value = 1.0
        if 'Coat Roughness' in bsdf.inputs:
            bsdf.inputs['Coat Roughness'].default_value = 0.03
        if 'IOR' in bsdf.inputs:
            bsdf.inputs['IOR'].default_value = 1.55

# Headlight DRLs: Crisp glowing LED daytime running lights
drl_mat = bpy.data.materials.get("headlight_drl")
if drl_mat and drl_mat.use_nodes:
    bsdf = drl_mat.node_tree.nodes.get('Principled BSDF')
    if bsdf:
        if 'Emission Color' in bsdf.inputs:
            bsdf.inputs['Emission Color'].default_value = (0.85, 0.95, 1.0, 1.0)
        elif 'Emission' in bsdf.inputs:
            bsdf.inputs['Emission'].default_value = (0.85, 0.95, 1.0, 1.0)
        if 'Emission Strength' in bsdf.inputs:
            bsdf.inputs['Emission Strength'].default_value = 12.0

# Taillight: Glowing ruby red LED continuous bar
tail_mat = bpy.data.materials.get("taillight")
if tail_mat and tail_mat.use_nodes:
    bsdf = tail_mat.node_tree.nodes.get('Principled BSDF')
    if bsdf:
        if 'Base Color' in bsdf.inputs:
            bsdf.inputs['Base Color'].default_value = (0.6, 0.02, 0.04, 1.0)
        if 'Emission Color' in bsdf.inputs:
            bsdf.inputs['Emission Color'].default_value = (1.0, 0.03, 0.05, 1.0)
        elif 'Emission' in bsdf.inputs:
            bsdf.inputs['Emission'].default_value = (1.0, 0.03, 0.05, 1.0)
        if 'Emission Strength' in bsdf.inputs:
            bsdf.inputs['Emission Strength'].default_value = 6.0

# Brake light: High intensity red
brake_mat = bpy.data.materials.get("brake_light")
if brake_mat and brake_mat.use_nodes:
    bsdf = brake_mat.node_tree.nodes.get('Principled BSDF')
    if bsdf:
        if 'Emission Color' in bsdf.inputs:
            bsdf.inputs['Emission Color'].default_value = (1.0, 0.02, 0.03, 1.0)
        elif 'Emission' in bsdf.inputs:
            bsdf.inputs['Emission'].default_value = (1.0, 0.02, 0.03, 1.0)
        if 'Emission Strength' in bsdf.inputs:
            bsdf.inputs['Emission Strength'].default_value = 8.0

# Glass: Deep tint with high specular reflections
glass_mat = bpy.data.materials.get("glass") or bpy.data.materials.get("windshield")
for gname in ["glass", "windshield"]:
    g_mat = bpy.data.materials.get(gname)
    if g_mat and g_mat.use_nodes:
        bsdf = g_mat.node_tree.nodes.get('Principled BSDF')
        if bsdf:
            if 'Roughness' in bsdf.inputs:
                bsdf.inputs['Roughness'].default_value = 0.03
            if 'Specular IOR Level' in bsdf.inputs:
                bsdf.inputs['Specular IOR Level'].default_value = 0.95
            elif 'Specular' in bsdf.inputs:
                bsdf.inputs['Specular'].default_value = 0.95

# Caliper red
caliper_mat = bpy.data.materials.get("caliper_red")
if caliper_mat and caliper_mat.use_nodes:
    bsdf = caliper_mat.node_tree.nodes.get('Principled BSDF')
    if bsdf:
        if 'Base Color' in bsdf.inputs:
            bsdf.inputs['Base Color'].default_value = (0.85, 0.04, 0.06, 1.0)
        if 'Roughness' in bsdf.inputs:
            bsdf.inputs['Roughness'].default_value = 0.25

# ------------------------------------------------------------------------------
# 2. BUILD HIGH-FIDELITY RACETRACK ENVIRONMENT
# ------------------------------------------------------------------------------
ROAD_LENGTH = 140.0
ROAD_WIDTH = 13.0
ROAD_Z = -0.002

# A. Asphalt Surface
asphalt_mesh = bpy.data.meshes.new("Track_Asphalt_Mesh")
asphalt_obj = bpy.data.objects.new("Track_Asphalt", asphalt_mesh)
showcase_col.objects.link(asphalt_obj)

# Create flat subdivided road
hw = ROAD_WIDTH * 0.5
hl = ROAD_LENGTH * 0.5
verts = [
    Vector((-hw, -hl, ROAD_Z)),
    Vector(( hw, -hl, ROAD_Z)),
    Vector(( hw,  hl, ROAD_Z)),
    Vector((-hw,  hl, ROAD_Z)),
]
faces = [(0, 1, 2, 3)]
asphalt_mesh.from_pydata(verts, [], faces)
asphalt_mesh.update()

# Asphalt Material with fine aggregate bump & specular sheen
asphalt_mat = get_or_create_mat("PBR_Track_Asphalt")
asphalt_mat.use_nodes = True
nodes = asphalt_mat.node_tree.nodes
links = asphalt_mat.node_tree.links
nodes.clear()

node_out = nodes.new('ShaderNodeOutputMaterial')
node_bsdf = nodes.new('ShaderNodeBsdfPrincipled')
node_texcoord = nodes.new('ShaderNodeTexCoord')
node_mapping = nodes.new('ShaderNodeMapping')
node_noise = nodes.new('ShaderNodeTexNoise')
node_bump = nodes.new('ShaderNodeBump')
node_coloramp = nodes.new('ShaderNodeValToRGB')

node_mapping.inputs['Scale'].default_value = (18.0, 18.0, 18.0)
node_noise.inputs['Scale'].default_value = 40.0
node_noise.inputs['Detail'].default_value = 8.0
node_noise.inputs['Roughness'].default_value = 0.7

node_bump.inputs['Strength'].default_value = 0.12
node_bump.inputs['Distance'].default_value = 0.05

node_coloramp.color_ramp.elements[0].position = 0.3
node_coloramp.color_ramp.elements[0].color = (0.04, 0.045, 0.05, 1.0)
node_coloramp.color_ramp.elements[1].position = 0.7
node_coloramp.color_ramp.elements[1].color = (0.065, 0.07, 0.075, 1.0)

links.new(node_texcoord.outputs['Object'], node_mapping.inputs['Vector'])
links.new(node_mapping.outputs['Vector'], node_noise.inputs['Vector'])
links.new(node_noise.outputs['Fac'], node_coloramp.inputs['Fac'])
links.new(node_coloramp.outputs['Color'], node_bsdf.inputs['Base Color'])
links.new(node_noise.outputs['Fac'], node_bump.inputs['Height'])
links.new(node_bump.outputs['Normal'], node_bsdf.inputs['Normal'])
node_bsdf.inputs['Roughness'].default_value = 0.42
if 'Specular IOR Level' in node_bsdf.inputs:
    node_bsdf.inputs['Specular IOR Level'].default_value = 0.5
links.new(node_bsdf.outputs['BSDF'], node_out.inputs['Surface'])

asphalt_obj.data.materials.append(asphalt_mat)

# B. Centerline Dashes (White Racetrack Paint)
dash_mat = get_or_create_mat("PBR_Track_Paint_White")
dash_mat.use_nodes = True
d_bsdf = dash_mat.node_tree.nodes.get('Principled BSDF')
if d_bsdf:
    if 'Base Color' in d_bsdf.inputs:
        d_bsdf.inputs['Base Color'].default_value = (0.92, 0.94, 0.96, 1.0)
    if 'Roughness' in d_bsdf.inputs:
        d_bsdf.inputs['Roughness'].default_value = 0.35
    if 'Emission Color' in d_bsdf.inputs:
        d_bsdf.inputs['Emission Color'].default_value = (0.1, 0.11, 0.12, 1.0)
        d_bsdf.inputs['Emission Strength'].default_value = 0.5

dash_len = 3.5
dash_gap = 3.5
dash_w = 0.18
num_dashes = int(ROAD_LENGTH / (dash_len + dash_gap))

for i in range(-num_dashes // 2, num_dashes // 2 + 1):
    y_center = i * (dash_len + dash_gap)
    m = bpy.data.meshes.new(f"Center_Dash_{i}")
    o = bpy.data.objects.new(f"Center_Dash_{i}", m)
    showcase_col.objects.link(o)
    v = [
        Vector((-dash_w * 0.5, y_center - dash_len * 0.5, 0.001)),
        Vector(( dash_w * 0.5, y_center - dash_len * 0.5, 0.001)),
        Vector(( dash_w * 0.5, y_center + dash_len * 0.5, 0.001)),
        Vector((-dash_w * 0.5, y_center + dash_len * 0.5, 0.001)),
    ]
    m.from_pydata(v, [], [(0, 1, 2, 3)])
    m.update()
    o.data.materials.append(dash_mat)

# C. Solid Outer Road Boundary Lines
for side_x in [-5.5, 5.5]:
    m = bpy.data.meshes.new(f"Edge_Line_{side_x}")
    o = bpy.data.objects.new(f"Edge_Line_{side_x}", m)
    showcase_col.objects.link(o)
    v = [
        Vector((side_x - 0.1, -hl, 0.001)),
        Vector((side_x + 0.1, -hl, 0.001)),
        Vector((side_x + 0.1,  hl, 0.001)),
        Vector((side_x - 0.1,  hl, 0.001)),
    ]
    m.from_pydata(v, [], [(0, 1, 2, 3)])
    m.update()
    o.data.materials.append(dash_mat)

# D. Red & White Racetrack Rumble Curbs (Apex Kerb stones)
curb_red = get_or_create_mat("PBR_Curb_Red")
curb_red.use_nodes = True
cr_bsdf = curb_red.node_tree.nodes.get('Principled BSDF')
if cr_bsdf:
    cr_bsdf.inputs['Base Color'].default_value = (0.82, 0.08, 0.10, 1.0)
    cr_bsdf.inputs['Roughness'].default_value = 0.45

curb_white = get_or_create_mat("PBR_Curb_White")
curb_white.use_nodes = True
cw_bsdf = curb_white.node_tree.nodes.get('Principled BSDF')
if cw_bsdf:
    cw_bsdf.inputs['Base Color'].default_value = (0.92, 0.92, 0.94, 1.0)
    cw_bsdf.inputs['Roughness'].default_value = 0.45

curb_block_len = 0.85
curb_w = 0.95
curb_h = 0.035
num_curbs = int(ROAD_LENGTH / curb_block_len)

# Create curbs on the right apex (X = +5.6 to +6.55)
for i in range(-num_curbs // 2, num_curbs // 2):
    y0 = i * curb_block_len
    y1 = y0 + curb_block_len
    mat = curb_red if (i % 2 == 0) else curb_white
    
    m = bpy.data.meshes.new(f"Curb_Right_{i}")
    o = bpy.data.objects.new(f"Curb_Right_{i}", m)
    showcase_col.objects.link(o)
    
    # Incline profile: low at road edge, slight raise outward
    x_in = 5.6
    x_out = x_in + curb_w
    v = [
        Vector((x_in,  y0, 0.001)),
        Vector((x_out, y0, curb_h)),
        Vector((x_out, y1, curb_h)),
        Vector((x_in,  y1, 0.001)),
    ]
    m.from_pydata(v, [], [(0, 1, 2, 3)])
    m.update()
    o.data.materials.append(mat)

# Also create curbs on the left side
for i in range(-num_curbs // 2, num_curbs // 2):
    y0 = i * curb_block_len
    y1 = y0 + curb_block_len
    mat = curb_white if (i % 2 == 0) else curb_red
    
    m = bpy.data.meshes.new(f"Curb_Left_{i}")
    o = bpy.data.objects.new(f"Curb_Left_{i}", m)
    showcase_col.objects.link(o)
    
    x_in = -5.6
    x_out = x_in - curb_w
    v = [
        Vector((x_in,  y0, 0.001)),
        Vector((x_out, y0, curb_h)),
        Vector((x_out, y1, curb_h)),
        Vector((x_in,  y1, 0.001)),
    ]
    m.from_pydata(v, [], [(0, 1, 2, 3)])
    m.update()
    o.data.materials.append(mat)

# E. Grass Verge / Runoff
grass_mat = get_or_create_mat("PBR_Track_Grass")
grass_mat.use_nodes = True
g_bsdf = grass_mat.node_tree.nodes.get('Principled BSDF')
if g_bsdf:
    g_bsdf.inputs['Base Color'].default_value = (0.045, 0.085, 0.035, 1.0)
    g_bsdf.inputs['Roughness'].default_value = 0.85

# Right grass
gm_r = bpy.data.meshes.new("Grass_Right_Mesh")
go_r = bpy.data.objects.new("Grass_Right", gm_r)
showcase_col.objects.link(go_r)
gm_r.from_pydata([
    Vector((6.55, -hl, 0.03)),
    Vector((35.0, -hl, -0.15)),
    Vector((35.0,  hl, -0.15)),
    Vector((6.55,  hl, 0.03)),
], [], [(0, 1, 2, 3)])
gm_r.update()
go_r.data.materials.append(grass_mat)

# Left grass
gm_l = bpy.data.meshes.new("Grass_Left_Mesh")
go_l = bpy.data.objects.new("Grass_Left", gm_l)
showcase_col.objects.link(go_l)
gm_l.from_pydata([
    Vector((-6.55, -hl, 0.03)),
    Vector((-35.0, -hl, -0.15)),
    Vector((-35.0,  hl, -0.15)),
    Vector((-6.55,  hl, 0.03)),
], [], [(0, 1, 2, 3)])
gm_l.update()
go_l.data.materials.append(grass_mat)

# F. Racetrack Armco Crash Barrier (Right side)
barrier_mat = get_or_create_mat("PBR_Armco_Steel")
barrier_mat.use_nodes = True
b_bsdf = barrier_mat.node_tree.nodes.get('Principled BSDF')
if b_bsdf:
    b_bsdf.inputs['Base Color'].default_value = (0.75, 0.78, 0.82, 1.0)
    b_bsdf.inputs['Metallic'].default_value = 0.95
    b_bsdf.inputs['Roughness'].default_value = 0.35

# Horizontal rail
bm = bpy.data.meshes.new("Armco_Rail_Mesh")
bo = bpy.data.objects.new("Armco_Rail", bm)
showcase_col.objects.link(bo)
bx = 7.6
bz_bot = 0.42
bz_top = 0.78
bm.from_pydata([
    Vector((bx, -hl, bz_bot)),
    Vector((bx,  hl, bz_bot)),
    Vector((bx,  hl, bz_top)),
    Vector((bx, -hl, bz_top)),
], [], [(0, 1, 2, 3)])
bm.update()
bo.data.materials.append(barrier_mat)

# Barrier posts every 4 meters
post_mat = barrier_mat
for py in range(-int(hl), int(hl), 4):
    pm = bpy.data.meshes.new(f"Barrier_Post_{py}")
    po = bpy.data.objects.new(f"Barrier_Post_{py}", pm)
    showcase_col.objects.link(po)
    pw = 0.08
    v = [
        Vector((bx, py - pw, 0.0)),
        Vector((bx + pw, py - pw, 0.0)),
        Vector((bx + pw, py + pw, 0.0)),
        Vector((bx, py + pw, 0.0)),
        Vector((bx, py - pw, bz_top)),
        Vector((bx + pw, py - pw, bz_top)),
        Vector((bx + pw, py + pw, bz_top)),
        Vector((bx, py + pw, bz_top)),
    ]
    f = [
        (0, 1, 2, 3), (4, 5, 6, 7),
        (0, 1, 5, 4), (2, 3, 7, 6),
        (0, 3, 7, 4), (1, 2, 6, 5)
    ]
    pm.from_pydata(v, [], f)
    pm.update()
    po.data.materials.append(post_mat)

# G. Distant Cyber City Silhouette Towers (Background atmosphere)
city_mat = get_or_create_mat("PBR_City_Silhouette")
city_mat.use_nodes = True
c_bsdf = city_mat.node_tree.nodes.get('Principled BSDF')
if c_bsdf:
    c_bsdf.inputs['Base Color'].default_value = (0.02, 0.03, 0.06, 1.0)
    c_bsdf.inputs['Roughness'].default_value = 0.8
    if 'Emission Color' in c_bsdf.inputs:
        c_bsdf.inputs['Emission Color'].default_value = (0.1, 0.25, 0.45, 1.0)
        c_bsdf.inputs['Emission Strength'].default_value = 0.4

# ------------------------------------------------------------------------------
# 3. EXQUISITE LIGHTING ARCHITECTURE (GOLDEN HOUR / SUNSET RACETRACK)
# ------------------------------------------------------------------------------
# A. World Sky Atmosphere (Physically Accurate Multiple Scattering / Nishita Sky)
world = scene.world
if not world:
    world = bpy.data.worlds.new("InGame_Track_World")
    scene.world = world
world.use_nodes = True
wnodes = world.node_tree.nodes
wlinks = world.node_tree.links
wnodes.clear()

w_out = wnodes.new('ShaderNodeOutputWorld')
w_bg = wnodes.new('ShaderNodeBackground')
w_sky = wnodes.new('ShaderNodeTexSky')
w_sky.sky_type = 'MULTIPLE_SCATTERING'
w_sky.sun_elevation = math.radians(14.0) # Golden hour low sun
w_sky.sun_rotation = math.radians(135.0) # Aligns with key sunlight direction
w_sky.altitude = 50.0
w_sky.air_density = 1.0
w_sky.aerosol_density = 1.2
w_sky.ozone_density = 1.0
w_sky.turbidity = 2.4
w_sky.ground_albedo = 0.2

w_bg.inputs['Strength'].default_value = 0.04 # Calibrated for physical atmospheric radiance
wlinks.new(w_sky.outputs['Color'], w_bg.inputs['Color'])
wlinks.new(w_bg.outputs['Background'], w_out.inputs['Surface'])

# B. Key Sunlight: Low-angle golden sun casting dramatic long shadows
sun_data = bpy.data.lights.new(name="Sun_Key_Light", type='SUN')
sun_data.energy = 4.2
sun_data.color = (1.0, 0.90, 0.78) # Warm golden sunlight
sun_data.angle = math.radians(0.54) # Realistic sharp solar disc
sun_obj = bpy.data.objects.new(name="Sun_Key_Light", object_data=sun_data)
showcase_col.objects.link(sun_obj)
# Angle: from front-left and low elevation (~22 deg)
sun_obj.rotation_euler = Euler((math.radians(24), math.radians(38), math.radians(135)), 'XYZ')

# C. Cool Cyan Rim / Kicker Light (High-tech edge outline)
rim_data = bpy.data.lights.new(name="Neon_Rim_Light", type='SUN')
rim_data.energy = 2.0
rim_data.color = (0.28, 0.75, 1.0) # Cool cyan sky rim
rim_data.angle = math.radians(2.0)
rim_obj = bpy.data.objects.new(name="Neon_Rim_Light", object_data=rim_data)
showcase_col.objects.link(rim_obj)
# Shine from opposite rear-right to catch roofline and shoulder crease
rim_obj.rotation_euler = Euler((math.radians(-25), math.radians(-35), math.radians(-45)), 'XYZ')

# D. Road Specular Highlight Fill (Low ground point light to produce asphalt road shine)
road_fill_data = bpy.data.lights.new(name="Road_Gleam_Light", type='POINT')
road_fill_data.energy = 200.0
road_fill_data.color = (1.0, 0.82, 0.65)
road_fill_data.shadow_soft_size = 0.5
road_fill_obj = bpy.data.objects.new(name="Road_Gleam_Light", object_data=road_fill_data)
road_fill_obj.location = Vector((1.2, -6.5, 0.35))
showcase_col.objects.link(road_fill_obj)

# E. Underchassis Ambient Bounce (Soft fill for wheel wells and red calipers)
under_data = bpy.data.lights.new(name="Underchassis_Bounce_Light", type='POINT')
under_data.energy = 50.0
under_data.color = (0.5, 0.65, 0.85)
under_data.shadow_soft_size = 1.2
under_obj = bpy.data.objects.new(name="Underchassis_Bounce_Light", object_data=under_data)
under_obj.location = Vector((0.0, 0.0, 0.18))
showcase_col.objects.link(under_obj)

# ------------------------------------------------------------------------------
# 4. RENDER ENGINE & EEVEE-NEXT RAYTRACING TUNING
# ------------------------------------------------------------------------------
scene.render.engine = 'BLENDER_EEVEE'
eevee = scene.eevee
eevee.use_raytracing = True # True screen-space reflections & GI in Blender 5.2
eevee.use_fast_gi = True
eevee.shadow_resolution_scale = 1.0
eevee.taa_render_samples = 64

# Color Management: AgX Medium High Contrast for automotive grade photorealism
scene.view_settings.view_transform = 'AgX'
scene.view_settings.look = 'AgX - Medium High Contrast'
scene.view_settings.exposure = 0.05

scene.render.resolution_x = 1920
scene.render.resolution_y = 1080
scene.render.resolution_percentage = 100

# ------------------------------------------------------------------------------
# 5. CINEMATIC IN-GAME CAMERAS
# ------------------------------------------------------------------------------
def create_camera(name, location, target, focal_length):
    cam_data = bpy.data.cameras.new(name)
    cam_data.lens = focal_length
    cam_data.sensor_width = 36.0
    cam_obj = bpy.data.objects.new(name, cam_data)
    showcase_col.objects.link(cam_obj)
    
    cam_obj.location = Vector(location)
    direction = Vector(target) - cam_obj.location
    rot_quat = direction.to_track_quat('-Z', 'Y')
    cam_obj.rotation_euler = rot_quat.to_euler()
    return cam_obj

cameras = {
    "InGame_Cam_Front34": {
        "loc": (3.4, -6.8, 0.92),
        "tgt": (0.1, -1.0, 0.55),
        "lens": 50,
        "filename": "accord_showcase_front34.png"
    },
    "InGame_Cam_Chase": {
        "loc": (-2.6, 6.2, 1.42),
        "tgt": (0.0, 0.2, 0.62),
        "lens": 40,
        "filename": "accord_showcase_chase.png"
    },
    "InGame_Cam_Trackside": {
        "loc": (9.2, -2.8, 1.45),
        "tgt": (0.0, -0.1, 0.55),
        "lens": 65,
        "filename": "accord_showcase_trackside.png"
    },
    "InGame_Cam_Hero_Nose": {
        "loc": (1.3, -4.6, 0.50),
        "tgt": (0.15, -2.2, 0.56),
        "lens": 62,
        "filename": "accord_showcase_hero_nose.png"
    }
}

created_cam_objs = {}
for cam_name, info in cameras.items():
    cam_obj = create_camera(cam_name, info["loc"], info["tgt"], info["lens"])
    created_cam_objs[cam_name] = cam_obj

# Set the active camera to Front34 default
scene.camera = created_cam_objs["InGame_Cam_Front34"]

# Step 6: Save the separate showcase .blend file!
bpy.ops.wm.save_as_mainfile(filepath=NEW_SHOWCASE_BLEND)
print(f"Showcase scene successfully written and saved to: {NEW_SHOWCASE_BLEND}")

# Step 7: Render the 4 showcase shots
rendered_paths = []
for cam_name, info in cameras.items():
    scene.camera = created_cam_objs[cam_name]
    out_file = os.path.join(OUTPUT_DIR, info["filename"])
    scene.render.filepath = out_file
    bpy.ops.render.render(write_still=True)
    print(f"Rendered: {out_file}")
    
    # Also save a copy in the artifact dir for walkthrough embedding
    art_file = os.path.join(ARTIFACT_DIR, info["filename"])
    try:
        import shutil
        shutil.copyfile(out_file, art_file)
        rendered_paths.append(art_file)
    except Exception as e:
        print(f"Copy error: {e}")
        rendered_paths.append(out_file)

result = {
    "status": "SUCCESS",
    "saved_blend": NEW_SHOWCASE_BLEND,
    "renders": rendered_paths
}
print(json.dumps(result, indent=2))
