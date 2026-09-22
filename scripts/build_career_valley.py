"""
CAREER VALLEY WORLD GENERATOR
==============================
Builds the ENTIRE career-map world as editable Blender geometry - terrain,
roads, trees, colosseum arenas and the east pass - then exports it as
public/models/career_valley.glb and saves career_valley.blend.

The game no longer generates any of this at runtime. components/objects/
CareerValley.ts just loads the GLB, so whatever you see in Blender is exactly
what the player sees.

    python scripts/run_blender.py D:\\trifilpla\\scripts\\build_career_valley.py

MARKERS
-------
The scene carries a MARKERS collection of empties that drive the build. Move
them in Blender, rebuild, and the world follows. They survive a rebuild - only
generated meshes are wiped - and they are empties, so they never reach the GLB.

    venue.<id>        a venue. XY places it, Z is the height of the shelf it
                      stands on, Z-rotation aims the arena. Custom properties:
                      flat_radius, steep_radius, theme, order,
                      ramp_half_width, ramp_feather
    ramp.<id>.<nn>    waypoints of that venue's access road, crown first.
                      The ground is carved along this line and the road is
                      generated from it, so they cannot drift apart.
    lift.<name>       raises the ground. Z is the height it pulls terrain up
                      to; custom properties radius (full-strength core) and
                      falloff (blend beyond it). A lift only ever raises.

Delete the MARKERS collection to fall back to the tables in this file; the next
build reseeds it from them.

WARNING: this rebuilds meshes from scratch and wipes generated objects in the
CareerValley scene. To keep hand-sculpted meshes, use
scripts/export_career_valley.py instead.

Everything is authored in "valley-local" coordinates: X right, Z toward the
camera, Y up - the same axes the game uses. Blender is Z-up and glTF's export
mirrors one axis, so positions are converted once, in bl(), and nowhere else.
"""

import bpy
import json
import math
import os
from mathutils import Matrix, Vector

# ============================================================================
# CONFIGURATION - the knobs worth touching
# ============================================================================

OUT_PATH = r"D:\trifilpla\public\models\career_valley.glb"
BLEND_PATH = r"D:\trifilpla\career_valley.blend"
LAMP_PATH = r"D:\trifilpla\public\models\career_valley_lamps.json"
# The forest layout, frozen. See plant_trees(). Delete it to roll a new one.
TREE_PATH = r"D:\trifilpla\career_valley_trees.json"
SCENE_NAME = "CareerValley"

# --- terrain shape
EXTENT = 620.0          # half-size of the terrain square
GRID = 288              # vertices per side; raise for smoother ground

R_FLOOR = 158.0         # bowl floor stays flat inside this radius
R_CREST = 248.0         # ridge crest radius
R_OUT = 500.0           # ridge has fallen away by here

GAP_HALF = math.pi * 0.16 * 1.15   # half-angle of the open valley mouth
GAP_FEATHER = 0.38                 # radians of soft ramp either side of the gap

PEAK_BASE = 62.0
PEAK_VARIANCE = 74.0

# --- venues. ONE source of truth: the pads carved into the terrain, the arena
#     placements and the ring road all read this table.
#     (id, x, z, pad_height, theme colour)
#     Positions MUST stay in step with SECTORS in components/ui/CareerMap.tsx.
VENUES = [
    {"id": "amateur", "x": 55.0, "z": 70.0, "height": 0.0, "theme": 0x38bdf8},
    {"id": "intermediate", "x": -88.0, "z": 34.0, "height": 5.0, "theme": 0xa855f7},
    {
        # Hand-placed in Blender - kept verbatim so a rebuild never moves it.
        # The hill underneath is carved to match: a level crown, sides too
        # steep to drive, and ONE access ramp running straight out of the
        # arena gate. That ramp is the only way up.
        "id": "professional",
        "x": -132.44, "z": -83.01, "height": 31.1,
        "theme": 0xf43f5e,
        "yaw_deg": -7.28,          # Blender Z rotation, as the artist left it
        "flat_radius": 40.0,       # level crown the arena stands on, with room around it
        "steep_radius": 88.0,      # face stops short of the ring road, so the
                                   # valley stays a valley; the climb is the ramp's job
        "ramp": {
            "half_width": 16.0,
            "feather": 14.0,
            # The road up, hand-routed in Blender and captured here so rebuilds
            # reproduce it. Listed crown-first. The ground is carved along this
            # line and the access road is generated from it, so the two can
            # never drift apart.
            "path": [
                (-131.07, -66.73, 31.10),
                (-132.22, -57.61, 31.10),
                (-131.40, -46.27, 31.10),
                (-128.67, -35.48, 28.47),
                (-128.02, -24.12, 23.39),
                (-128.10, -13.35, 17.91),
                (-126.88, -2.48, 12.32),
                (-122.85, 8.68, 7.18),
                (-119.77, 16.18, 4.50),
            ],
        },
    },
    {"id": "academy", "x": 92.0, "z": -18.0, "height": 9.0, "theme": 0x06b6d4},
    {"id": "editor", "x": 60.0, "z": -95.0, "height": 19.0, "theme": 0xf59e0b},
    {"id": "free_roam", "x": -52.0, "z": 92.0, "height": 7.0, "theme": 0x10b981},
]


def bearing_direction(degrees):
    """Unit vector for a bearing measured off +Z, in valley (x, z).

    0 points at the camera, +90 is screen-right, -90 is screen-left.
    """
    radians = math.radians(degrees)
    return math.sin(radians), math.cos(radians)


def ramp_polyline(venue):
    """A venue's access ramp as a crown-to-foot polyline of (x, z, height).

    A ramp is either an explicit hand-routed "path" or a straight run given as
    a bearing and length. Normalising both here means the terrain carver and
    the road builder read exactly the same line.

    Height is None where a waypoint does not state one, and the carver then
    falls back to an even descent from the crown to the valley floor.
    """
    ramp = venue["ramp"]
    path = ramp.get("path")
    if path:
        points = []
        for point in path:
            height = float(point[2]) if len(point) >= 3 else None
            points.append((float(point[0]), float(point[1]), height))
        return points

    ux, uz = bearing_direction(ramp["bearing_deg"])
    length = ramp["length"]
    return [
        (venue["x"], venue["z"], None),
        (venue["x"] + ux * length, venue["z"] + uz * length, None),
    ]


_RAMP_CACHE = {}


def ramp_segments(venue):
    """Cached ramp segments: (ax, az, vx, vz, length, start_s, h_from, h_to)."""
    key = venue["id"]
    cached = _RAMP_CACHE.get(key)
    if cached is not None:
        return cached

    points = ramp_polyline(venue)
    segments = []
    travelled = 0.0
    for i in range(len(points) - 1):
        ax, az, ah = points[i]
        bx, bz, bh = points[i + 1]
        vx, vz = bx - ax, bz - az
        length = math.hypot(vx, vz)
        if length <= 1e-6:
            continue
        segments.append((ax, az, vx, vz, length, travelled, ah, bh))
        travelled += length

    cached = (segments, travelled)
    _RAMP_CACHE[key] = cached
    return cached


def ramp_foot(venue):
    """Where a venue's access ramp meets the valley floor."""
    return ramp_polyline(venue)[-1]
PAD_FLAT_RADIUS = 27.0    # level shelf around each venue
PAD_BLEND_RADIUS = 68.0   # ramp blending the shelf into natural ground

# Free-standing elevation markers, seeded into MARKERS on a first build. After
# that the empties are the source of truth - drag them and rebuild.
DEFAULT_LIFTS = [
    # High ground off the professional hill's left flank as the player sees it.
    {"name": "prof_shoulder_inner", "x": -180.0, "z": -83.0, "height": 45.0,
     "radius": 34.0, "falloff": 34.0},
    {"name": "prof_shoulder_outer", "x": -212.0, "z": -83.0, "height": 62.0,
     "radius": 36.0, "falloff": 38.0},
]

LIFTS = list(DEFAULT_LIFTS)

MARKER_COLLECTION = "MARKERS"

# --- arenas
ARENA_RADIUS = 11.5
ARENA_WALL_HEIGHT = 8.0

# --- roads
ROAD_SHOULDER_WIDTH = 13.5
ROAD_EDGING_WIDTH = 9.8   # white band; what shows past the asphalt draws the lines
ROAD_ASPHALT_WIDTH = 9.0
ROAD_RING_CLEARANCE = 30.0  # how far outside each venue the ring road passes

# --- street lamps
# Poles alternate sides down every road, so the light reads as a line rather
# than a wall. The runtime reads their positions out of the manifest this
# script writes and lights them the moment the player's clock says dusk.
LAMP_SPACING = 38.0       # metres of road between poles
LAMP_OFFSET = 9.4         # from the road centre line, clear of the shoulder
LAMP_HEIGHT = 7.4         # pole height above the ground
LAMP_ARM = 3.1            # how far the head leans over the road
DASH_SPACING = 11.0

# --- trees
TREE_STANDS = 34
TREE_PER_STAND = (4, 12)
TREE_LONERS = 45
TREE_MIN_RADIUS = 34.0
TREE_MAX_RADIUS = 150.0
TREE_MAX_GROUND = 38.0    # nothing grows above this height

# --- terrain colouring. Grass holds all the way to GRASS_CEILING, so raised
#     ground like a venue shoulder still reads green rather than turning to
#     rock the moment it climbs.
GRASS_CEILING = 100.0            # height where grass finally gives out
ROCK_SLOPE_RANGE = (1.25, 2.0)   # slope band where bare rock takes over
SNOW_RANGE = (112.0, 140.0)      # height band where snow builds up

# --- terrain colours (linear, written straight into vertex colours)
GRASS_LOW = (0.25, 0.53, 0.21)
GRASS_MID = (0.20, 0.45, 0.19)
GRASS_HIGH = (0.17, 0.38, 0.18)
ROCK = (0.30, 0.31, 0.32)
SNOW = (0.86, 0.89, 0.91)


# ============================================================================
# MATHS HELPERS
# ============================================================================

def bl(x, z, y=0.0):
    """Valley-local (x, z, height) to a Blender vector.

    Blender is Z-up, and the glTF exporter turns (x, y, z) into (x, z, -y).
    Negating Z here means the exported model's +Z lines up with the game's +Z,
    so no correcting rotation is needed at runtime.
    """
    return Vector((x, -z, y))


def srgb_to_linear(channel):
    if channel <= 0.04045:
        return channel / 12.92
    return ((channel + 0.055) / 1.055) ** 2.4


def hex_to_linear(value):
    r = ((value >> 16) & 0xFF) / 255.0
    g = ((value >> 8) & 0xFF) / 255.0
    b = (value & 0xFF) / 255.0
    return (srgb_to_linear(r), srgb_to_linear(g), srgb_to_linear(b))


def smoothstep(edge0, edge1, x):
    if edge1 <= edge0:
        return 0.0
    t = max(0.0, min(1.0, (x - edge0) / (edge1 - edge0)))
    return t * t * (3.0 - 2.0 * t)


def mix(a, b, t):
    t = max(0.0, min(1.0, t))
    return (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t)


def make_random(seed):
    """Deterministic RNG so the world is identical on every rebuild."""
    state = [seed & 0xFFFFFFFF]

    def rand():
        state[0] = (state[0] * 1664525 + 1013904223) & 0xFFFFFFFF
        return state[0] / 4294967296.0

    return rand


# ---------------------------------------------------------------- value noise

def _hash2(ix, iy, seed):
    n = ix * 374761393 + iy * 668265263 + seed * 1442695040888963407
    n = (n ^ (n >> 13)) * 1274126177
    n = n ^ (n >> 16)
    return (n & 0xFFFFFFFF) / 4294967295.0


def value_noise(x, y, seed=0):
    ix = math.floor(x)
    iy = math.floor(y)
    fx = (x - ix) * (x - ix) * (3.0 - 2.0 * (x - ix))
    fy = (y - iy) * (y - iy) * (3.0 - 2.0 * (y - iy))

    v00 = _hash2(ix, iy, seed)
    v10 = _hash2(ix + 1, iy, seed)
    v01 = _hash2(ix, iy + 1, seed)
    v11 = _hash2(ix + 1, iy + 1, seed)

    a = v00 + (v10 - v00) * fx
    b = v01 + (v11 - v01) * fx
    return a + (b - a) * fy


def fbm(x, y, octaves=4, seed=0):
    total = 0.0
    amplitude = 1.0
    frequency = 1.0
    norm = 0.0
    for o in range(octaves):
        total += value_noise(x * frequency, y * frequency, seed + o) * amplitude
        norm += amplitude
        amplitude *= 0.5
        frequency *= 2.05
    return total / norm


def ridge_noise(x, y, octaves=4, seed=0):
    """Sharp-crested noise - gives mountains an edge instead of soft blobs."""
    total = 0.0
    amplitude = 1.0
    frequency = 1.0
    norm = 0.0
    for o in range(octaves):
        n = value_noise(x * frequency, y * frequency, seed + o)
        n = 1.0 - abs(n * 2.0 - 1.0)
        total += n * n * amplitude
        norm += amplitude
        amplitude *= 0.52
        frequency *= 2.1
    return total / norm


# ============================================================================
# TERRAIN HEIGHT FIELD
# ============================================================================

def mouth_factor(angle):
    """0 inside the valley mouth, 1 once fully behind the ridge."""
    a = abs(angle)
    if a <= GAP_HALF:
        return 0.0
    return smoothstep(GAP_HALF, GAP_HALF + GAP_FEATHER, a)


def ridge_profile(radius):
    if radius <= R_FLOOR:
        return 0.0
    if radius <= R_CREST:
        return smoothstep(R_FLOOR, R_CREST, radius)
    return max(0.25, 1.0 - (radius - R_CREST) / (R_OUT - R_CREST))


def apply_pads(x, z, natural):
    """Carves each venue's ground: a level shelf, plus an access ramp if it has one."""
    height = natural

    for venue in VENUES:
        px, pz, pad_h = venue["x"], venue["z"], venue["height"]
        flat_r = venue.get("flat_radius", PAD_FLAT_RADIUS)
        outer_r = venue.get("steep_radius", PAD_BLEND_RADIUS)

        dx, dz = x - px, z - pz
        distance = math.hypot(dx, dz)

        # The shelf itself. A tight outer radius gives steep sides; a wide one
        # gives a gentle rise.
        shelf_weight = 1.0 - smoothstep(flat_r, outer_r, distance)
        carved = height + (pad_h - height) * shelf_weight

        ramp = venue.get("ramp")
        if ramp:
            segments, total = ramp_segments(venue)
            reach = ramp["half_width"] + ramp["feather"]

            # Nearest point on the route, how far along it is, and the
            # height the waypoints call for there.
            nearest = 1e18
            travelled = 0.0
            marked = None
            for ax, az, vx, vz, seg_len, start_s, h_from, h_to in segments:
                t = ((x - ax) * vx + (z - az) * vz) / (seg_len * seg_len)
                t = max(0.0, min(1.0, t))
                gap = math.hypot(x - (ax + vx * t), z - (az + vz * t))
                if gap < nearest:
                    nearest = gap
                    travelled = start_s + seg_len * t
                    marked = (
                        None if h_from is None or h_to is None
                        else h_from + (h_to - h_from) * t
                    )

            if nearest <= reach and total > 0.0:
                if marked is not None:
                    # The waypoints state the height, so the ground follows
                    # them exactly - drag a ramp marker up and the climb
                    # under the road rises with it.
                    target = marked
                    # ...but never above the venue's own shelf once inside it.
                    # A waypoint left high near the crown would otherwise raise
                    # a bank across the arena's entrance.
                    if distance <= flat_r:
                        target = min(target, pad_h)
                else:
                    # No stated heights: fall evenly from crown to floor.
                    descent = smoothstep(0.0, 1.0, travelled / total)
                    target = pad_h + (natural - pad_h) * descent
                across = 1.0 - smoothstep(
                    ramp["half_width"], ramp["half_width"] + ramp["feather"], nearest
                )
                # max(): the ramp only ever adds ground, never digs the hill away.
                carved = max(carved, height + (target - height) * across)

        height = carved

    return height


def venue_protection(x, z):
    """0 on a venue's level shelf, 1 clear of it.

    Lifts are radial, so one parked near a venue would otherwise dome the
    shelf up and carry the arena with it. Scaling every lift by this keeps
    crowns exactly where the venue marker put them - to raise a venue, move
    its own marker.
    """
    factor = 1.0
    for venue in VENUES:
        flat_r = venue.get("flat_radius", PAD_FLAT_RADIUS)
        distance = math.hypot(x - venue["x"], z - venue["z"])
        # A short blend, not a proportional one: a wide crown would otherwise
        # reach far enough out to swallow the lifts parked beside the hill.
        factor = min(factor, smoothstep(flat_r, flat_r + 8.0, distance))
        if factor <= 0.0:
            break
    return factor


def ramp_protection(x, z):
    """0 on an access ramp, 1 clear of it.

    A lift parked beside a hill domes the ground under the ramp as well, which
    shoves the bottom of the climb up into a wall. Holding lifts off the
    corridor leaves the road the even grade its waypoints ask for, and the
    hillside beside it still rises.
    """
    factor = 1.0
    for venue in VENUES:
        ramp = venue.get("ramp")
        if not ramp:
            continue

        segments, _ = ramp_segments(venue)
        nearest = 1e18
        for ax, az, vx, vz, seg_len, _start, _hf, _ht in segments:
            t = ((x - ax) * vx + (z - az) * vz) / (seg_len * seg_len)
            t = max(0.0, min(1.0, t))
            gap = math.hypot(x - (ax + vx * t), z - (az + vz * t))
            if gap < nearest:
                nearest = gap

        half = ramp["half_width"]
        factor = min(factor, smoothstep(half, half + ramp["feather"] * 1.6, nearest))
        if factor <= 0.0:
            break
    return factor


def apply_lifts(x, z, height):
    """Raises the ground around each lift marker. Lifts never dig."""
    if not LIFTS:
        return height

    protection = venue_protection(x, z) * ramp_protection(x, z)
    if protection <= 0.0:
        return height

    for lift in LIFTS:
        distance = math.hypot(x - lift["x"], z - lift["z"])
        reach = lift["radius"] + lift["falloff"]
        if distance >= reach:
            continue
        weight = (1.0 - smoothstep(lift["radius"], reach, distance)) * protection
        height = max(height, height + (lift["height"] - height) * weight)
    return height


def terrain_height(x, z):
    """Ground height at a valley-local point. The single source of truth."""
    radius = math.hypot(x, z)
    angle = math.atan2(x, z)

    floor_roll = math.sin(x * 0.019) * math.cos(z * 0.017) * 1.15
    floor_roll += (fbm(x * 0.012, z * 0.012, 3, 11) - 0.5) * 1.6

    profile = ridge_profile(radius)
    gate = mouth_factor(angle)
    if profile <= 0.0 or gate <= 0.0:
        return apply_lifts(x, z, apply_pads(x, z, floor_roll))

    around = ridge_noise(math.cos(angle) * 1.7, math.sin(angle) * 1.7, 4, 3)
    peak = PEAK_BASE + PEAK_VARIANCE * around
    detail = (ridge_noise(x * 0.014, z * 0.014, 5, 7) - 0.4) * (4.0 + 26.0 * profile)

    return apply_lifts(
        x, z, apply_pads(x, z, floor_roll + profile * gate * peak + detail * profile * gate)
    )


def terrain_mesh_height(x, z):
    """Height of the rendered terrain SURFACE, not of the smooth height field.

    The terrain is a grid of quads, so between its vertices the ground is a
    flat panel that can sit above the exact height function - that gap is what
    let ridges poke up through the roads. Taking the highest corner of the
    surrounding quad fixed the poke-through but is constant across the whole
    cell, so a road laid on it climbed in 4.3-unit steps like a staircase.

    This reads the panel itself. A quad is drawn as two triangles and the
    splitting diagonal is not ours to pick, so take whichever of the two splits
    is higher here: still one continuous slope, and never below whatever the
    renderer actually draws.
    """
    step = (EXTENT * 2.0) / (GRID - 1)
    gx = (x + EXTENT) / step
    gz = (z + EXTENT) / step

    ix = max(0, min(GRID - 2, int(math.floor(gx))))
    iz = max(0, min(GRID - 2, int(math.floor(gz))))
    u = max(0.0, min(1.0, gx - ix))
    v = max(0.0, min(1.0, gz - iz))

    x0, x1 = -EXTENT + ix * step, -EXTENT + (ix + 1) * step
    z0, z1 = -EXTENT + iz * step, -EXTENT + (iz + 1) * step
    h00 = terrain_height(x0, z0)
    h10 = terrain_height(x1, z0)
    h01 = terrain_height(x0, z1)
    h11 = terrain_height(x1, z1)

    # Split across the 00-11 diagonal...
    if u >= v:
        across = h00 + (h10 - h00) * u + (h11 - h10) * v
    else:
        across = h00 + (h11 - h01) * u + (h01 - h00) * v

    # ...or across the 10-01 one.
    if u + v <= 1.0:
        other = h00 + (h10 - h00) * u + (h01 - h00) * v
    else:
        other = h11 + (h11 - h01) * (u - 1.0) + (h11 - h10) * (v - 1.0)

    return max(across, other)


def height_at_blender(bx, by):
    """Ground height for a road point, expressed in Blender XY."""
    return terrain_mesh_height(bx, -by)


def terrain_colour(x, z, height, slope):
    # Grass keeps its colour well up the slopes - the valley should read green,
    # not washed out, so rock and snow are pushed to genuinely high ground.
    if height < 20.0:
        base = mix(GRASS_LOW, GRASS_MID, smoothstep(0.0, 20.0, height))
    else:
        base = mix(GRASS_MID, GRASS_HIGH, smoothstep(20.0, GRASS_CEILING, height))

    patch = (fbm(x * 0.008, z * 0.008, 3, 23) - 0.5) * 0.12
    base = (
        max(0.0, base[0] + patch * 0.5),
        max(0.0, base[1] + patch),
        max(0.0, base[2] + patch * 0.4),
    )

    base = mix(base, ROCK, smoothstep(*ROCK_SLOPE_RANGE, slope) * 0.9)
    snow_amount = smoothstep(*SNOW_RANGE, height) * (1.0 - smoothstep(1.0, 1.5, slope))
    return mix(base, SNOW, snow_amount)


# ============================================================================
# MESH ASSEMBLY
# ============================================================================

class MeshBuilder:
    """Accumulates transformed primitives into one mesh with material slots."""

    def __init__(self):
        self.verts = []
        self.faces = []
        self.material_indices = []

    def add(self, verts, faces, matrix=None, material_index=0):
        base = len(self.verts)
        if matrix is None:
            self.verts.extend(tuple(v) for v in verts)
        else:
            for v in verts:
                co = matrix @ Vector(v)
                self.verts.append((co.x, co.y, co.z))
        for face in faces:
            self.faces.append(tuple(base + i for i in face))
            self.material_indices.append(material_index)

    def to_object(self, name, materials, scene, smooth=False):
        mesh = bpy.data.meshes.new(name)
        mesh.from_pydata(self.verts, [], self.faces)
        mesh.update()

        for mat in materials:
            mesh.materials.append(mat)
        for index, poly in enumerate(mesh.polygons):
            poly.use_smooth = smooth
            if index < len(self.material_indices):
                poly.material_index = self.material_indices[index]

        obj = bpy.data.objects.new(name, mesh)
        scene.collection.objects.link(obj)
        return obj


# ------------------------------------------------------------- primitives

def prim_box(width, height, depth):
    """Axis-aligned box centred on the origin. Height is along Blender Z."""
    hw, hh, hd = width * 0.5, depth * 0.5, height * 0.5
    verts = [
        (-hw, -hh, -hd), (hw, -hh, -hd), (hw, hh, -hd), (-hw, hh, -hd),
        (-hw, -hh, hd), (hw, -hh, hd), (hw, hh, hd), (-hw, hh, hd),
    ]
    faces = [
        (0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4),
        (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7),
    ]
    return verts, faces


def prim_cylinder(radius_bottom, radius_top, height, segments, caps=True):
    """Cylinder/cone frustum centred on the origin, axis along Blender Z."""
    verts = []
    faces = []
    half = height * 0.5

    for i in range(segments):
        angle = (i / segments) * math.tau
        verts.append((math.cos(angle) * radius_bottom, math.sin(angle) * radius_bottom, -half))
    for i in range(segments):
        angle = (i / segments) * math.tau
        verts.append((math.cos(angle) * radius_top, math.sin(angle) * radius_top, half))

    for i in range(segments):
        j = (i + 1) % segments
        faces.append((i, j, segments + j, segments + i))

    if caps:
        bottom_centre = len(verts)
        verts.append((0.0, 0.0, -half))
        top_centre = len(verts)
        verts.append((0.0, 0.0, half))
        for i in range(segments):
            j = (i + 1) % segments
            faces.append((bottom_centre, j, i))
            faces.append((top_centre, segments + i, segments + j))

    return verts, faces


def prim_cone(radius, height, segments):
    verts = []
    faces = []
    half = height * 0.5
    for i in range(segments):
        angle = (i / segments) * math.tau
        verts.append((math.cos(angle) * radius, math.sin(angle) * radius, -half))
    apex = len(verts)
    verts.append((0.0, 0.0, half))
    centre = len(verts)
    verts.append((0.0, 0.0, -half))
    for i in range(segments):
        j = (i + 1) % segments
        faces.append((i, j, apex))
        faces.append((centre, j, i))
    return verts, faces


_PHI = (1.0 + 5.0 ** 0.5) / 2.0


def prim_icosahedron(radius):
    raw = [
        (-1, _PHI, 0), (1, _PHI, 0), (-1, -_PHI, 0), (1, -_PHI, 0),
        (0, -1, _PHI), (0, 1, _PHI), (0, -1, -_PHI), (0, 1, -_PHI),
        (_PHI, 0, -1), (_PHI, 0, 1), (-_PHI, 0, -1), (-_PHI, 0, 1),
    ]
    scale = radius / math.sqrt(1 + _PHI * _PHI)
    verts = [(v[0] * scale, v[1] * scale, v[2] * scale) for v in raw]
    faces = [
        (0, 11, 5), (0, 5, 1), (0, 1, 7), (0, 7, 10), (0, 10, 11),
        (1, 5, 9), (5, 11, 4), (11, 10, 2), (10, 7, 6), (7, 1, 8),
        (3, 9, 4), (3, 4, 2), (3, 2, 6), (3, 6, 8), (3, 8, 9),
        (4, 9, 5), (2, 4, 11), (6, 2, 10), (8, 6, 7), (9, 8, 1),
    ]
    return verts, faces


def prim_plane(width, height):
    hw, hh = width * 0.5, height * 0.5
    return [(-hw, 0, -hh), (hw, 0, -hh), (hw, 0, hh), (-hw, 0, hh)], [(0, 1, 2, 3)]


# ---------------------------------------------------------------- splines

def catmull_rom(points, closed, samples_per_span):
    """Samples a Catmull-Rom spline through the given 2D control points."""
    count = len(points)
    if count < 2:
        return list(points)

    def control(index):
        if closed:
            return points[index % count]
        return points[max(0, min(count - 1, index))]

    spans = count if closed else count - 1
    out = []
    for span in range(spans):
        p0 = control(span - 1)
        p1 = control(span)
        p2 = control(span + 1)
        p3 = control(span + 2)
        for step in range(samples_per_span):
            t = step / samples_per_span
            t2 = t * t
            t3 = t2 * t
            x = 0.5 * (
                2 * p1[0]
                + (-p0[0] + p2[0]) * t
                + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2
                + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3
            )
            y = 0.5 * (
                2 * p1[1]
                + (-p0[1] + p2[1]) * t
                + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2
                + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3
            )
            out.append((x, y))
    if closed:
        out.append(out[0])
    else:
        out.append(points[-1])
    return out


def add_ribbon(builder, polyline, width, lift, material_index):
    """Sweeps a flat band along a Blender-XY polyline, draped on the terrain."""
    if len(polyline) < 2:
        return

    verts = []
    faces = []
    for i, (px, py) in enumerate(polyline):
        if i == 0:
            nx, ny = polyline[1]
            dx, dy = nx - px, ny - py
        elif i == len(polyline) - 1:
            qx, qy = polyline[i - 1]
            dx, dy = px - qx, py - qy
        else:
            nx, ny = polyline[i + 1]
            qx, qy = polyline[i - 1]
            dx, dy = nx - qx, ny - qy

        length = math.hypot(dx, dy) or 1.0
        sx, sy = -dy / length * width * 0.5, dx / length * width * 0.5

        lx, ly = px - sx, py - sy
        rx, ry = px + sx, py + sy
        verts.append((lx, ly, height_at_blender(lx, ly) + lift))
        verts.append((rx, ry, height_at_blender(rx, ry) + lift))

    for i in range(len(polyline) - 1):
        a = i * 2
        faces.append((a, a + 1, a + 3, a + 2))

    builder.add(verts, faces, None, material_index)


def clip_to_radius(points, cx, cz, radius):
    """Trims the tail of a polyline so it stops `radius` short of (cx, cz).

    The access road is generated from the ramp waypoints, and the last of
    those sits on the arena's crown - driving the road straight through the
    building. This cuts it at the terrace edge instead.
    """
    kept = []
    for px, pz in points:
        if math.hypot(px - cx, pz - cz) >= radius:
            kept.append((px, pz))
            continue

        if kept:
            # Solve |a + t*v| = radius along the segment that crosses inward,
            # so the road ends exactly on the terrace edge.
            ax, az = kept[-1]
            vx, vz = px - ax, pz - az
            qa = vx * vx + vz * vz
            qb = 2.0 * ((ax - cx) * vx + (az - cz) * vz)
            qc = (ax - cx) ** 2 + (az - cz) ** 2 - radius * radius
            disc = qb * qb - 4.0 * qa * qc
            if qa > 1e-9 and disc >= 0.0:
                t = (-qb - math.sqrt(disc)) / (2.0 * qa)
                if 0.0 <= t <= 1.0:
                    kept.append((ax + vx * t, az + vz * t))
        break

    return kept if len(kept) >= 2 else points


def polyline_length(polyline):
    total = 0.0
    for i in range(1, len(polyline)):
        total += math.dist(polyline[i - 1], polyline[i])
    return total


def sample_along(polyline, spacing):
    """Yields (point, heading) every `spacing` units along a polyline."""
    out = []
    carried = 0.0
    for i in range(1, len(polyline)):
        ax, ay = polyline[i - 1]
        bx, by = polyline[i]
        seg = math.hypot(bx - ax, by - ay)
        if seg <= 1e-6:
            continue
        heading = math.atan2(by - ay, bx - ax)
        travelled = spacing - carried
        while travelled < seg:
            t = travelled / seg
            out.append(((ax + (bx - ax) * t, ay + (by - ay) * t), heading))
            travelled += spacing
        carried = (carried + seg) % spacing
    return out


# ============================================================================
# MARKERS
# ============================================================================

def _empty(coll, name, location, display='PLAIN_AXES', size=4.0, props=None, yaw=0.0):
    obj = bpy.data.objects.new(name, None)
    obj.empty_display_type = display
    obj.empty_display_size = size
    obj.location = location
    obj.rotation_euler = (0.0, 0.0, yaw)
    obj.show_name = True
    for key, value in (props or {}).items():
        obj[key] = value
    coll.objects.link(obj)
    return obj


def seed_markers(coll):
    """Writes the tables in this file out as draggable empties."""
    for order, venue in enumerate(VENUES):
        props = {
            "order": order,
            "theme": "#%06x" % venue["theme"],
            "flat_radius": float(venue.get("flat_radius", PAD_FLAT_RADIUS)),
            "steep_radius": float(venue.get("steep_radius", PAD_BLEND_RADIUS)),
        }
        ramp = venue.get("ramp")
        if ramp:
            props["ramp_half_width"] = float(ramp["half_width"])
            props["ramp_feather"] = float(ramp["feather"])

        _empty(coll, "venue." + venue["id"],
               bl(venue["x"], venue["z"], venue["height"]),
               display='ARROWS', size=20.0, props=props,
               yaw=math.radians(venue.get("yaw_deg", 0.0)))

        if ramp:
            for index, (px, pz, py) in enumerate(ramp_polyline(venue), start=1):
                _empty(coll, "ramp.%s.%02d" % (venue["id"], index),
                       bl(px, pz, terrain_height(px, pz) if py is None else py),
                       display='SPHERE', size=7.0)

    for lift in DEFAULT_LIFTS:
        _empty(coll, "lift." + lift["name"],
               bl(lift["x"], lift["z"], lift["height"]),
               display='SPHERE', size=lift["radius"],
               props={"radius": lift["radius"], "falloff": lift["falloff"]})


def ensure_markers(scene):
    """Finds the marker collection, creating and seeding it on a first build."""
    coll = bpy.data.collections.get(MARKER_COLLECTION)
    if coll is None:
        coll = bpy.data.collections.new(MARKER_COLLECTION)
    if coll.name not in {child.name for child in scene.collection.children}:
        scene.collection.children.link(coll)
    if not coll.objects:
        seed_markers(coll)
    return coll


def read_markers(coll):
    """Reads the empties back into the venue and lift tables."""
    venue_empties = []
    ramp_empties = {}
    lift_empties = []

    for obj in coll.objects:
        if obj.name.startswith("venue."):
            venue_empties.append((obj, obj.name[len("venue."):]))
        elif obj.name.startswith("ramp."):
            venue_id, _, index = obj.name[len("ramp."):].rpartition(".")
            ramp_empties.setdefault(venue_id, []).append((index, obj))
        elif obj.name.startswith("lift."):
            lift_empties.append(obj)

    venues = []
    for obj, venue_id in venue_empties:
        theme = str(obj.get("theme", "#ffffff")).lstrip("#")
        record = {
            "id": venue_id,
            # Blender XY back to valley coordinates; Z is the shelf height.
            "x": obj.location.x,
            "z": -obj.location.y,
            "height": obj.location.z,
            "theme": int(theme, 16),
            "yaw_deg": math.degrees(obj.rotation_euler.z),
            "flat_radius": float(obj.get("flat_radius", PAD_FLAT_RADIUS)),
            "steep_radius": float(obj.get("steep_radius", PAD_BLEND_RADIUS)),
            "order": int(obj.get("order", 0)),
        }

        waypoints = ramp_empties.get(venue_id)
        if waypoints:
            waypoints.sort(key=lambda item: item[0])
            record["ramp"] = {
                "half_width": float(obj.get("ramp_half_width", 13.0)),
                "feather": float(obj.get("ramp_feather", 9.0)),
                # Z is carried through: a ramp marker's height is the height
                # of the ground under the road at that point.
                "path": [(way.location.x, -way.location.y, way.location.z)
                         for _, way in waypoints],
            }
        venues.append(record)

    venues.sort(key=lambda record: record["order"])

    lifts = [{
        "name": obj.name[len("lift."):],
        "x": obj.location.x,
        "z": -obj.location.y,
        "height": obj.location.z,
        "radius": float(obj.get("radius", 30.0)),
        "falloff": float(obj.get("falloff", 30.0)),
    } for obj in lift_empties]

    return venues, lifts


# ============================================================================
# MATERIALS
# ============================================================================

def make_material(name, colour_hex, roughness=0.85, metallic=0.0, emission=0.0):
    mat = bpy.data.materials.get(name)
    if mat is None:
        mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    nodes.clear()

    output = nodes.new("ShaderNodeOutputMaterial")
    output.location = (400, 0)
    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.location = (100, 0)

    colour = hex_to_linear(colour_hex)
    bsdf.inputs["Base Color"].default_value = (*colour, 1.0)
    if "Roughness" in bsdf.inputs:
        bsdf.inputs["Roughness"].default_value = roughness
    if "Metallic" in bsdf.inputs:
        bsdf.inputs["Metallic"].default_value = metallic
    if emission > 0.0:
        for key in ("Emission Color", "Emission"):
            if key in bsdf.inputs:
                bsdf.inputs[key].default_value = (*colour, 1.0)
                break
        if "Emission Strength" in bsdf.inputs:
            bsdf.inputs["Emission Strength"].default_value = emission

    mat.node_tree.links.new(bsdf.outputs[0], output.inputs["Surface"])
    return mat


def make_terrain_material():
    mat = bpy.data.materials.get("ValleyTerrain")
    if mat is None:
        mat = bpy.data.materials.new("ValleyTerrain")
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    nodes.clear()

    output = nodes.new("ShaderNodeOutputMaterial")
    output.location = (400, 0)
    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.location = (100, 0)
    attr = nodes.new("ShaderNodeVertexColor")
    attr.layer_name = "Col"
    attr.location = (-180, 0)

    mat.node_tree.links.new(attr.outputs["Color"], bsdf.inputs["Base Color"])
    if "Roughness" in bsdf.inputs:
        bsdf.inputs["Roughness"].default_value = 0.92
    mat.node_tree.links.new(bsdf.outputs[0], output.inputs["Surface"])
    return mat


# ============================================================================
# WORLD PARTS
# ============================================================================

def build_terrain(scene, terrain_mat):
    step = (EXTENT * 2.0) / (GRID - 1)

    heights = []
    for iz in range(GRID):
        z = -EXTENT + iz * step
        heights.append([terrain_height(-EXTENT + ix * step, z) for ix in range(GRID)])

    verts = []
    for iz in range(GRID):
        z = -EXTENT + iz * step
        for ix in range(GRID):
            x = -EXTENT + ix * step
            verts.append((x, -z, heights[iz][ix]))

    # The bl() mirror flips winding, so quads are wound the other way round.
    faces = []
    for iz in range(GRID - 1):
        for ix in range(GRID - 1):
            a = iz * GRID + ix
            faces.append((a, a + 1, a + GRID + 1, a + GRID))

    mesh = bpy.data.meshes.new("terrain")
    mesh.from_pydata(verts, [], faces)
    mesh.update()

    colour_layer = mesh.color_attributes.new(name="Col", type='FLOAT_COLOR', domain='POINT')
    for iz in range(GRID):
        for ix in range(GRID):
            index = iz * GRID + ix
            h = heights[iz][ix]

            hx0 = heights[iz][max(0, ix - 1)]
            hx1 = heights[iz][min(GRID - 1, ix + 1)]
            hz0 = heights[max(0, iz - 1)][ix]
            hz1 = heights[min(GRID - 1, iz + 1)][ix]
            slope = math.hypot((hx1 - hx0) / (2.0 * step), (hz1 - hz0) / (2.0 * step))

            # Concavity: sitting below your neighbours means less sky, so darker.
            neighbour_mean = (hx0 + hx1 + hz0 + hz1) * 0.25
            occlusion = 1.0 - max(0.0, min(1.0, (neighbour_mean - h) / 6.0)) * 0.35

            r, g, b = terrain_colour(-EXTENT + ix * step, -EXTENT + iz * step, h, slope)
            colour_layer.data[index].color = (r * occlusion, g * occlusion, b * occlusion, 1.0)

    for poly in mesh.polygons:
        poly.use_smooth = True

    mesh.materials.append(terrain_mat)
    obj = bpy.data.objects.new("terrain", mesh)
    scene.collection.objects.link(obj)
    return obj, len(verts)


def build_arena(scene, venue, materials, theme_mat):
    name, vx, vz = venue["id"], venue["x"], venue["z"]
    slots = list(materials) + [theme_mat]
    STONE, DARK, WHITE, BLACK, ASPHALT = 0, 1, 2, 3, 4
    THEME = len(materials)

    builder = MeshBuilder()
    r = ARENA_RADIUS
    wall_base = 1.1

    # --- terrace the arena stands on
    builder.add(*prim_cylinder(r * 1.62, r * 1.5, 1.1, 28),
                Matrix.Translation((0, 0, 0.55)), DARK)

    # --- outer wall
    builder.add(*prim_cylinder(r, r * 1.06, ARENA_WALL_HEIGHT, 28, caps=False),
                Matrix.Translation((0, 0, wall_base + ARENA_WALL_HEIGHT * 0.5)), STONE)

    # --- arcade piers and lintels around the outside
    arch_count = 20
    for i in range(arch_count):
        angle = (i / arch_count) * math.tau
        ax, ay = math.cos(angle) * r * 1.04, math.sin(angle) * r * 1.04
        rot = Matrix.Rotation(angle, 4, 'Z')
        for tier in (2.6, 5.6):
            builder.add(*prim_box(0.5, 2.4, 0.5),
                        Matrix.Translation((ax, ay, tier)) @ rot, DARK)
            builder.add(*prim_box(1.5, 0.35, 0.5),
                        Matrix.Translation((ax, ay, tier + 1.3)) @ rot, DARK)

    # --- checkered crown band (racing flag, not a crest)
    crown_segments = 36
    tile_width = (math.tau * r * 1.05) / crown_segments * 0.94
    for i in range(crown_segments):
        angle = (i / crown_segments) * math.tau
        builder.add(
            *prim_box(tile_width, 1.0, 0.6),
            Matrix.Translation((math.cos(angle) * r * 1.05,
                                math.sin(angle) * r * 1.05,
                                wall_base + ARENA_WALL_HEIGHT + 0.5))
            @ Matrix.Rotation(angle + math.pi / 2, 4, 'Z'),
            WHITE if i % 2 == 0 else BLACK,
        )

    # --- stepped seating rings inside the bowl
    for index, (tier_r, tier_z) in enumerate([(r * 0.94, 2.4), (r * 0.8, 3.9), (r * 0.66, 5.4)]):
        builder.add(*prim_cylinder(tier_r + 0.5, tier_r, 1.5, 28, caps=False),
                    Matrix.Translation((0, 0, tier_z)), STONE if index % 2 == 0 else DARK)

    # --- infield racing surface with an oval circuit on it
    builder.add(*prim_cylinder(r * 0.62, r * 0.62, 0.4, 28),
                Matrix.Translation((0, 0, 1.5)), ASPHALT)

    oval_segments = 36
    for i in range(oval_segments):
        angle = (i / oval_segments) * math.tau
        nxt = ((i + 1) / oval_segments) * math.tau
        ox, oy = math.cos(angle) * r * 0.46, math.sin(angle) * r * 0.30
        nx, ny = math.cos(nxt) * r * 0.46, math.sin(nxt) * r * 0.30
        seg_len = math.hypot(nx - ox, ny - oy)
        builder.add(*prim_box(seg_len * 1.1, 0.16, 1.5),
                    Matrix.Translation(((ox + nx) * 0.5, (oy + ny) * 0.5, 1.78))
                    @ Matrix.Rotation(math.atan2(ny - oy, nx - ox), 4, 'Z'), DARK)

    # start/finish checker strip
    for i in range(8):
        builder.add(*prim_box(0.5, 0.1, 0.5),
                    Matrix.Translation((-1.8 + i * 0.5, r * 0.30, 1.86)),
                    WHITE if i % 2 == 0 else BLACK)

    # --- theme banners on poles around the rim
    for i in range(8):
        angle = (i / 8) * math.tau + 0.2
        px, py = math.cos(angle) * r * 1.3, math.sin(angle) * r * 1.3
        builder.add(*prim_cylinder(0.11, 0.11, 5.0, 6),
                    Matrix.Translation((px, py, 3.6)), DARK)
        builder.add(*prim_plane(1.6, 2.4),
                    Matrix.Translation((px, py, 5.2)) @ Matrix.Rotation(angle, 4, 'Z'), THEME)

    # --- theme glow skirt round the terrace
    builder.add(*prim_cylinder(r * 1.66, r * 1.66, 0.34, 28, caps=False),
                Matrix.Translation((0, 0, 1.0)), THEME)

    # --- entrance gate facing the valley mouth (game +Z is Blender -Y)
    builder.add(*prim_box(5.0, 5.2, 1.4), Matrix.Translation((0, -r * 1.06, 3.6)), DARK)
    builder.add(*prim_box(6.2, 0.9, 1.9), Matrix.Translation((0, -r * 1.06, 6.5)), THEME)

    obj = builder.to_object(f"arena_{name}", slots, scene)
    obj.location = bl(vx, vz, terrain_height(vx, vz))
    obj.rotation_euler = (0.0, 0.0, math.radians(venue.get("yaw_deg", 0.0)))
    return obj


def build_roads(scene, materials):
    ASPHALT, SHOULDER, WHITE = 0, 1, 2
    objects = []

    # Ring road: waypoints pushed outward so it sweeps past the arenas, walked
    # in angular order - venue order would make the loop double back.
    ring = []
    for venue in VENUES:
        if venue.get("ramp"):
            # A venue on a hill is met at the foot of its ramp. Pushing a
            # waypoint straight out from the centre would send the ring road
            # climbing into the mountains behind it.
            point = ramp_foot(venue)
        else:
            distance = math.hypot(venue["x"], venue["z"]) or 1.0
            scale = (distance + ROAD_RING_CLEARANCE) / distance
            point = (venue["x"] * scale, venue["z"] * scale)
        ring.append((math.atan2(point[0], point[1]), point))
    ring.sort(key=lambda item: item[0])
    ring_points = [(bl(p[0], p[1]).x, bl(p[0], p[1]).y) for _, p in ring]

    # Approach road: enters from the valley mouth, straight out of the camera's
    # opening viewpoint, so it leads the eye into the bowl.
    gateway_local = max(ring, key=lambda item: item[1][1])[1]
    gateway = (bl(*gateway_local).x, bl(*gateway_local).y)
    entry = (bl(6.0, 400.0).x, bl(6.0, 400.0).y)
    approach_points = [entry]
    for t, lateral in ((0.26, 30), (0.5, -34), (0.74, 20), (0.9, -8)):
        approach_points.append((
            entry[0] + (gateway[0] - entry[0]) * t + lateral,
            entry[1] + (gateway[1] - entry[1]) * t,
        ))
    approach_points.append(gateway)

    # Exit spur toward the dealer pass, branching off the nearest ring point.
    pass_local = (58.0, 14.0)
    pass_point = (bl(*pass_local).x, bl(*pass_local).y)
    branch = min(ring_points, key=lambda p: math.dist(p, pass_point))
    exit_points = [
        branch,
        (branch[0] + (pass_point[0] - branch[0]) * 0.45, branch[1] + (pass_point[1] - branch[1]) * 0.45),
        (branch[0] + (pass_point[0] - branch[0]) * 0.8, branch[1] + (pass_point[1] - branch[1]) * 0.8),
        pass_point,
    ]

    road_specs = [
        ("road_ring", ring_points, True, 56),
        ("road_approach", approach_points, False, 80),
        ("road_exit", exit_points, False, 40),
    ]

    # One access road per hill venue: up the ramp, from its foot to the crown.
    for venue in VENUES:
        if not venue.get("ramp"):
            continue
        # Driven from the same polyline the ground was carved along, walked
        # foot-first so the road climbs toward the arena.
        # Foot-first, so the road climbs toward the arena.
        route = [(point[0], point[1]) for point in reversed(ramp_polyline(venue))]

        # Cut the top at the terrace edge so it never reaches the entrance.
        route = clip_to_radius(route, venue["x"], venue["z"], ARENA_RADIUS * 1.62 + 2.5)

        # Cut the bottom short of the ring road, which runs through the ramp
        # foot. Without this the two ribbons lie on top of each other at the
        # junction and fight for the same pixels.
        foot = ramp_foot(venue)
        route.reverse()
        route = clip_to_radius(route, foot[0], foot[1], ROAD_SHOULDER_WIDTH * 0.5 + 1.5)
        route.reverse()

        climb = [(bl(cx, cz).x, bl(cx, cz).y) for cx, cz in route]
        road_specs.append(("road_access_" + venue["id"], climb, False, 24))

    lamp_sites = []

    for name, control, closed, samples in road_specs:
        polyline = catmull_rom(control, closed, samples)

        # Lamp posts, alternating sides so the road is lit from both hands
        # without a pole every few metres.
        for index, ((lx, ly), heading) in enumerate(sample_along(polyline, LAMP_SPACING)):
            side = 1.0 if index % 2 == 0 else -1.0
            out_x = -math.sin(heading) * side
            out_y = math.cos(heading) * side
            pole = (lx + out_x * LAMP_OFFSET, ly + out_y * LAMP_OFFSET)
            lamp_sites.append({
                "road": name,
                "pole": pole,
                # The arm leans back the way the pole came, out over the road.
                "bearing": math.atan2(-out_y, -out_x),
                "ground": height_at_blender(*pole),
            })

        builder = MeshBuilder()
        # Gravel bed, a white band, then narrower asphalt on top - the band
        # showing past the asphalt edge is what draws the edge lines.
        add_ribbon(builder, polyline, ROAD_SHOULDER_WIDTH, 0.15, SHOULDER)
        add_ribbon(builder, polyline, ROAD_EDGING_WIDTH, 0.26, WHITE)
        add_ribbon(builder, polyline, ROAD_ASPHALT_WIDTH, 0.3, ASPHALT)

        DASH_LENGTH = 3.2
        for (dx, dy), heading in sample_along(polyline, DASH_SPACING):
            # A dash is a flat slab, so on a climb it has to be pitched to lie
            # along the slope. Lifting it clear instead leaves it hanging over
            # the asphalt like a rung.
            reach = DASH_LENGTH * 0.5
            ahead_x, ahead_y = math.cos(heading) * reach, math.sin(heading) * reach
            side = ROAD_ASPHALT_WIDTH * 0.5
            side_x, side_y = -math.sin(heading) * side, math.cos(heading) * side

            def crown(px, py):
                """Height of the asphalt's centre line, which is what paint sits on.

                The ribbon is swept from two rails, so down the middle its
                surface is the average of the two - not the ground directly
                below. On a cross slope those differ, and reading the ground
                is what left dashes half sunk into the road.
                """
                return (height_at_blender(px + side_x, py + side_y)
                        + height_at_blender(px - side_x, py - side_y)) * 0.5

            ahead = crown(dx + ahead_x, dy + ahead_y)
            behind = crown(dx - ahead_x, dy - ahead_y)
            ground = max(crown(dx, dy), (ahead + behind) * 0.5)

            # Negative, because a rotation about Y tips the nose (+X) down.
            pitch = -math.atan2(ahead - behind, reach * 2.0)
            builder.add(*prim_box(DASH_LENGTH, 0.08, 0.45),
                        Matrix.Translation((dx, dy, ground + 0.4))
                        @ Matrix.Rotation(heading, 4, 'Z')
                        @ Matrix.Rotation(pitch, 4, 'Y'), WHITE)

        objects.append(builder.to_object(name, materials, scene))

    return objects, lamp_sites


def build_street_lamps(scene, sites, materials):
    """One mesh holding every street lamp: pole, arm, housing and lens.

    Only the lens uses the emissive material, so the runtime can switch the
    lights on and off by touching one material rather than hunting geometry.
    """
    POST, LENS = 0, 1
    builder = MeshBuilder()

    for site in sites:
        bx, by = site["pole"]
        ground = site["ground"]
        facing = site["bearing"]
        reach_x, reach_y = math.cos(facing), math.sin(facing)
        top = ground + LAMP_HEIGHT

        builder.add(*prim_cylinder(0.30, 0.20, LAMP_HEIGHT, 8),
                    Matrix.Translation((bx, by, ground + LAMP_HEIGHT * 0.5)), POST)

        # Arm out over the carriageway, then the housing on the end of it.
        arm_x = bx + reach_x * LAMP_ARM * 0.5
        arm_y = by + reach_y * LAMP_ARM * 0.5
        builder.add(*prim_box(LAMP_ARM, 0.22, 0.22),
                    Matrix.Translation((arm_x, arm_y, top))
                    @ Matrix.Rotation(facing, 4, 'Z'), POST)

        head_x = bx + reach_x * LAMP_ARM
        head_y = by + reach_y * LAMP_ARM
        builder.add(*prim_box(1.75, 0.42, 0.66),
                    Matrix.Translation((head_x, head_y, top - 0.24))
                    @ Matrix.Rotation(facing, 4, 'Z'), POST)
        builder.add(*prim_box(1.40, 0.12, 0.48),
                    Matrix.Translation((head_x, head_y, top - 0.49))
                    @ Matrix.Rotation(facing, 4, 'Z'), LENS)

        site["head"] = (head_x, head_y, top - 0.52)

    return builder.to_object("street_lamps", materials, scene)


def write_lamp_manifest(sites):
    """Publishes the lamp positions for the runtime, in valley coordinates.

    The model is authored pre-flipped, so a valley point (x, z, height) lands
    in the browser at (x, height, z) inside the career-valley group - which is
    exactly what is written here. No axis juggling on the other side.
    """
    lamps = [{
        "x": round(site["head"][0], 3),
        "z": round(-site["head"][1], 3),
        "y": round(site["head"][2], 3),
        "ground": round(site["ground"], 3),
    } for site in sites]

    payload = {
        "spacing": LAMP_SPACING,
        "poleHeight": LAMP_HEIGHT,
        "lensMaterial": "ValleyLampLens",
        "lamps": lamps,
    }
    with open(LAMP_PATH, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=1)
    return lamps


def build_tree_prototypes(scene, trunk_mat, foliage_mats, conifer_mats):
    """A handful of tree meshes; every planted tree reuses one of them."""
    prototypes = []
    rand = make_random(0x7bee)

    for index, tone in enumerate(conifer_mats):
        builder = MeshBuilder()
        builder.add(*prim_cylinder(0.34, 0.16, 2.2, 6), Matrix.Translation((0, 0, 1.1)), 0)
        for skirt, (radius, height) in enumerate(((1.75, 2.6), (1.35, 2.4), (0.92, 2.1))):
            builder.add(*prim_cone(radius, height, 7),
                        Matrix.Translation((0, 0, 2.4 + skirt * 1.45))
                        @ Matrix.Rotation(rand() * math.pi, 4, 'Z'), 1)
        obj = builder.to_object(f"tree_conifer_{index}", [trunk_mat, tone], scene)
        obj.hide_set(True)
        prototypes.append(obj)

    for index, tone in enumerate(foliage_mats):
        builder = MeshBuilder()
        builder.add(*prim_cylinder(0.34, 0.18, 2.4, 6), Matrix.Translation((0, 0, 1.2)), 0)
        for lump, radius in enumerate((1.5, 1.15, 0.95)):
            builder.add(*prim_icosahedron(radius),
                        Matrix.Translation(((rand() - 0.5) * 1.5,
                                            (rand() - 0.5) * 1.5,
                                            2.7 + lump * 0.75))
                        @ Matrix.Rotation(rand() * math.pi, 4, 'Z'), 1)
        obj = builder.to_object(f"tree_broadleaf_{index}", [trunk_mat, tone], scene)
        obj.hide_set(True)
        prototypes.append(obj)

    return prototypes


def roll_tree_layout(prototype_count):
    """Rolls a fresh forest: stands of trees, plus a thin scatter of loners.

    Returns plain records, not objects, so the result can be frozen to disk.
    """
    rand = make_random(0x51a7d)
    layout = []

    def plant(x, z):
        for venue in VENUES:
            clearance = venue.get("flat_radius", PAD_FLAT_RADIUS) + 8.0
            if math.hypot(x - venue["x"], z - venue["z"]) < clearance:
                return
        if terrain_height(x, z) > TREE_MAX_GROUND:
            return

        layout.append({
            "x": round(x, 3),
            "z": round(z, 3),
            "model": int(rand() * prototype_count) % prototype_count,
            "yaw": round(rand() * math.tau, 5),
            "scale": round(0.7 + rand() * 0.85, 5),
        })

    # Trees grow in stands, not on an even sprinkle.
    low, high = TREE_PER_STAND
    for _ in range(TREE_STANDS):
        angle = rand() * math.tau
        radius = TREE_MIN_RADIUS + rand() * (TREE_MAX_RADIUS - TREE_MIN_RADIUS)
        cx, cz = math.sin(angle) * radius, math.cos(angle) * radius
        spread = 7.0 + rand() * 16.0
        for _ in range(low + int(rand() * (high - low))):
            plant(cx + (rand() - 0.5) * spread * 2, cz + (rand() - 0.5) * spread * 2)

    # Plus a thin scatter of loners so the stands do not look placed.
    for _ in range(TREE_LONERS):
        angle = rand() * math.tau
        radius = TREE_MIN_RADIUS + rand() * (TREE_MAX_RADIUS - TREE_MIN_RADIUS)
        plant(math.sin(angle) * radius, math.cos(angle) * radius)

    return layout


def plant_trees(scene, prototypes):
    """Plants the forest from the frozen layout in TREE_PATH.

    The layout is frozen because rolling it is not safe to repeat: the planting
    loop shares one random stream and only draws from it for a tree it keeps,
    so a single tree turned away - by a venue's clearance ring, which is
    flat_radius + 8, or by the TREE_MAX_GROUND ceiling - reshuffles the model,
    rotation and scale of every tree after it. Reshaping a hill would quietly
    redraw the whole forest.

    Height is the one thing still read from the terrain: a tree has to stand on
    the ground. Raise the ground under a tree and the tree goes up with it.

    Delete career_valley_trees.json to roll a new forest.
    """
    layout = None
    if os.path.exists(TREE_PATH):
        with open(TREE_PATH, encoding="utf-8") as handle:
            layout = json.load(handle).get("trees")

    if not layout:
        layout = roll_tree_layout(len(prototypes))
        with open(TREE_PATH, "w", encoding="utf-8") as handle:
            json.dump({"seed": "0x51a7d", "trees": layout}, handle, indent=1)

    planted = []
    for record in layout:
        x, z = record["x"], record["z"]
        source = prototypes[record["model"] % len(prototypes)]
        obj = bpy.data.objects.new(f"tree_{len(planted):03d}", source.data)
        obj.location = bl(x, z, terrain_height(x, z))
        obj.rotation_euler = (0.0, 0.0, record["yaw"])
        scale = record["scale"]
        obj.scale = (scale, scale, scale)
        scene.collection.objects.link(obj)
        planted.append(obj)

    return planted


def build_east_pass(scene, materials):
    builder = MeshBuilder()
    ROCK_MAT, DARK = 0, 1
    for offset in (-8, 8):
        builder.add(*prim_box(3.4, 16, 3.4), Matrix.Translation((offset, 0, 8)), ROCK_MAT)
    builder.add(*prim_box(20, 2.4, 4.2), Matrix.Translation((0, 0, 17)), DARK)

    obj = builder.to_object("east_pass", materials, scene)
    obj.location = bl(58.0, 14.0, terrain_height(58.0, 14.0))
    obj.rotation_euler = (0.0, 0.0, math.pi * 0.22)
    return obj


# ============================================================================
# BUILD
# ============================================================================

def build():
    # Leaving Edit Mode first: unlinking objects while a mesh is open for
    # editing is a good way to lose the edit or crash the session.
    if bpy.context.mode != 'OBJECT':
        try:
            bpy.ops.object.mode_set(mode='OBJECT')
        except Exception:
            pass

    # Fresh scene so the artist's current scene is never disturbed.
    if SCENE_NAME in bpy.data.scenes:
        scene = bpy.data.scenes[SCENE_NAME]
        for obj in list(scene.collection.objects):
            scene.collection.objects.unlink(obj)
            bpy.data.objects.remove(obj, do_unlink=True)
    else:
        scene = bpy.data.scenes.new(SCENE_NAME)

    previous_scene = bpy.context.window.scene
    bpy.context.window.scene = scene

    for mesh in list(bpy.data.meshes):
        if mesh.users == 0:
            bpy.data.meshes.remove(mesh)

    # Markers live in their own collection, so the wipe above (which only
    # touches objects linked straight to the scene) leaves them alone. Read
    # them back over the tables in this file - once seeded, they win.
    markers = ensure_markers(scene)
    marker_venues, marker_lifts = read_markers(markers)
    if marker_venues:
        globals()["VENUES"] = marker_venues
        _RAMP_CACHE.clear()
    globals()["LIFTS"] = marker_lifts

    # --- materials
    terrain_mat = make_terrain_material()
    stone = make_material("ValleyStone", 0x3a3d45, roughness=0.82, metallic=0.1)
    stone_dark = make_material("ValleyStoneDark", 0x22242a, roughness=0.86)
    white = make_material("ValleyWhite", 0xf1f5f9, roughness=0.5)
    black = make_material("ValleyBlack", 0x14151a, roughness=0.6)
    asphalt = make_material("ValleyAsphalt", 0x3a3d43, roughness=0.72)
    shoulder = make_material("ValleyShoulder", 0x8a8471, roughness=0.95)
    trunk = make_material("ValleyTrunk", 0x4d3421, roughness=0.95)
    rock = make_material("ValleyRock", 0x6b7d83, roughness=0.95)
    lamp_post = make_material("ValleyLampPost", 0x2b3038, roughness=0.55, metallic=0.6)
    # The runtime overrides this strength every frame, so the value here only
    # decides how the lamps look inside Blender.
    lamp_lens = make_material("ValleyLampLens", 0xffe2ad, roughness=0.3, emission=2.5)

    foliage = [make_material(f"ValleyFoliage{i}", hexcol, roughness=0.82)
               for i, hexcol in enumerate((0x2f7a38, 0x388a3f, 0x44954a))]
    conifer = [make_material(f"ValleyConifer{i}", hexcol, roughness=0.86)
               for i, hexcol in enumerate((0x1f4a26, 0x24592c, 0x1a3f20))]

    arena_mats = [stone, stone_dark, white, black, asphalt]

    # --- world
    terrain_obj, terrain_verts = build_terrain(scene, terrain_mat)
    road_objs, lamp_sites = build_roads(scene, [asphalt, shoulder, white])
    lamp_obj = build_street_lamps(scene, lamp_sites, [lamp_post, lamp_lens])
    lamps = write_lamp_manifest(lamp_sites)

    arena_objs = []
    for venue in VENUES:
        theme = make_material("ValleyTheme_" + venue["id"], venue["theme"],
                              roughness=0.45, metallic=0.25, emission=1.4)
        arena_objs.append(build_arena(scene, venue, arena_mats, theme))

    prototypes = build_tree_prototypes(scene, trunk, foliage, conifer)
    trees = plant_trees(scene, prototypes)
    pass_obj = build_east_pass(scene, [rock, stone_dark])

    # --- export everything visible in the scene
    for other_scene in bpy.data.scenes:
        for view_layer in other_scene.view_layers:
            for obj in other_scene.objects:
                try:
                    obj.select_set(False, view_layer=view_layer)
                except Exception:
                    pass

    exportable = [o for o in scene.objects if o.type == 'MESH' and o not in prototypes]
    for obj in exportable:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = terrain_obj

    os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
    export_kwargs = dict(
        filepath=OUT_PATH,
        export_format='GLB',
        use_selection=True,
        export_apply=True,
        export_yup=True,
        export_normals=True,
    )
    try:
        bpy.ops.export_scene.gltf(export_vertex_color='ACTIVE', **export_kwargs)
    except TypeError:
        bpy.ops.export_scene.gltf(**export_kwargs)

    # --- save an editable .blend, with this scene active so it opens on it
    restore = []
    for area in bpy.context.window.screen.areas:
        if area.type == 'VIEW_3D':
            for space in area.spaces:
                if space.type == 'VIEW_3D':
                    restore.append((space, space.clip_start, space.clip_end))
                    space.clip_start = 1.0
                    space.clip_end = 20000.0

    bpy.ops.wm.save_as_mainfile(filepath=BLEND_PATH, copy=True)

    for space, start, end in restore:
        space.clip_start = start
        space.clip_end = end
    bpy.context.window.scene = previous_scene

    print({
        "markers": len(markers.objects),
        "venues_from_markers": [v["id"] for v in marker_venues],
        "lifts": [l["name"] for l in marker_lifts],
        "glb": OUT_PATH,
        "glb_bytes": os.path.getsize(OUT_PATH) if os.path.exists(OUT_PATH) else -1,
        "blend": BLEND_PATH,
        "blend_bytes": os.path.getsize(BLEND_PATH) if os.path.exists(BLEND_PATH) else -1,
        "terrain_verts": terrain_verts,
        "roads": [o.name for o in road_objs],
        "arenas": [o.name for o in arena_objs],
        "trees": len(trees),
        "east_pass": pass_obj.name,
        "street_lamps": len(lamps),
        "lamp_manifest": LAMP_PATH,
        "exported_objects": len(exportable),
        "scene_restored": bpy.context.window.scene.name,
    })


build()
