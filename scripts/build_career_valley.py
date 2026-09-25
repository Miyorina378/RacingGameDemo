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
    ring.<id>.<nn>    extra ring-road waypoints that steer the ring round a
                      venue (the professional butte). The venue's ramp foot
                      is slotted in after ring_foot_slot of them.

CLIFF VENUES (buttes)
---------------------
A venue with a cliff_rim property is not a smooth pad but a butte: a level
crown out to its rim (cliff_rim, or the bearing/radius pairs of
cliff_rim_table), a sheer drop, and a canyon cliff_moat wide cut round its
foot. With an access road the face runs from the road's cliff_side hand
round to cliff_open_deg; beyond that the crown eases off as a grassy
shoulder, like a pad. The ground under the road is SET to the waypoint
heights ("ramp_cut"): on the cliff hand the bed stops dead at the drop, on
the hill hand it is cut into the slope (ramp_soft_feather).

The faces themselves are a separate mesh, cliff_rock, built by
build_cliff_walls(): layered, faceted stone hung off the lip, which hides the
ground's own steep strip. The terrain round a butte and its road is built on
a finer grid (REFINE_SUBDIV) so the lip and the road bed stay crisp.

ring_point pins a venue's ring-road waypoint; the access road then runs out
to meet the ring wherever it passes.

MARKER_LAYOUT_VERSION: markers saved by an older layout of this script are
reseeded from the tables below on the next build.

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

# Project root. TRIFILPLA_ROOT overrides it, e.g. for a headless build.
PROJECT_ROOT = os.environ.get("TRIFILPLA_ROOT", r"D:\trifilpla")
OUT_PATH = os.path.join(PROJECT_ROOT, "public", "models", "career_valley.glb")
BLEND_PATH = os.path.join(PROJECT_ROOT, "career_valley.blend")
LAMP_PATH = os.path.join(PROJECT_ROOT, "public", "models", "career_valley_lamps.json")
# The forest layout, frozen. See plant_trees(). Delete it to roll a new one.
TREE_PATH = os.path.join(PROJECT_ROOT, "career_valley_trees.json")
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
        # The hill is a butte: a level crown whose whole valley face - the
        # front and east, round to the back - is a sheer rock wall, with the
        # grassy shoulder kept on the west. ONE road climbs it, down the west
        # edge, right along the lip of that wall.
        "id": "professional",
        "x": -132.44, "z": -83.01, "height": 31.1,
        "theme": 0xf43f5e,
        "yaw_deg": -7.28,          # Blender Z rotation, as the artist left it
        "flat_radius": 34.0,       # guaranteed-level crown
        "steep_radius": 88.0,      # the grassy shoulder eases out to here
        "cliff_rim": 40.0,         # crown edge where the table says nothing
        # Crown edge traced from the artist's sketch: bearing (deg), radius.
        "cliff_rim_table": [
            8.0, 44.0, 20.0, 45.5, 28.0, 44.2, 37.0, 44.0, 50.0, 42.5,
            63.0, 41.3, 72.0, 38.6, 92.0, 35.8, 107.0, 36.5, 137.0, 40.0,
            180.0, 39.0, 220.0, 38.5, 250.0, 40.0, 320.0, 40.0,
        ],
        "cliff_open_deg": 245.0,   # face runs from the road round to here
        "cliff_drop": 4.0,         # horizontal width of the rock face
        "cliff_moat": 16.0,        # canyon floor held round the foot
        "cliff_blend": 30.0,       # canyon wall rising back to natural ground
        "ramp": {
            "half_width": 8.5,     # level road bed: shoulder plus a verge
            "feather": 3.0,        # the drop on the cliff hand
            "soft_feather": 12.0,  # the cut bank on the hill hand
            "cliff_side": -1.0,    # cliff on the east (+X) hand
            "cut": True,           # set the ground to the road, don't just fill
            # Listed crown-first: out of the gate, along the crown, then down
            # the west edge of the face to the ring road's bend.
            "path": [
                (-134.20, -67.00, 31.10),
                (-133.60, -58.00, 31.10),
                (-133.00, -50.00, 31.10),
                (-132.80, -44.00, 31.10),
                (-133.30, -38.00, 30.15),
                (-135.10, -32.00, 28.67),
                (-137.60, -26.00, 26.68),
                (-139.50, -20.00, 24.42),
                (-140.20, -14.00, 22.02),
                (-140.00, -8.00, 19.51),
                (-139.60, -2.00, 16.95),
                (-139.20, 4.00, 14.41),
                (-139.00, 10.00, 11.99),
                (-138.80, 16.00, 9.76),
                (-136.80, 22.50, 7.57),
                (-131.80, 27.20, 5.84),
                (-125.00, 28.80, 4.70),
                (-119.30, 28.40, 4.70),
            ],
        },
        # The ring swings past the cliff's foot in one easy curve (the old
        # line folded back on itself here, which crumpled the road); the
        # access road turns off the bottom of the face to meet it.
        "ring_point": (-95.0, -15.0),
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
_DENSE_CACHE = {}
RAMP_SAMPLES = 8          # spline samples per waypoint span


def ramp_dense(venue):
    """The ramp as the smooth curve the road actually follows, crown first.

    The access road is a Catmull-Rom spline through the waypoints. Carving the
    ground along the straight lines between waypoints instead would leave the
    curve hanging off the carved bed on every bend - fatal on a narrow ledge.
    So both read this: the spline, densely sampled, heights splined with it.
    """
    key = venue["id"]
    cached = _DENSE_CACHE.get(key)
    if cached is not None:
        return cached

    points = ramp_polyline(venue)
    if len(points) < 3 or any(p[2] is None for p in points):
        dense = points
    else:
        plan = catmull_rom([(p[0], p[1]) for p in points], False, RAMP_SAMPLES)
        rise = catmull_rom([(float(i), p[2]) for i, p in enumerate(points)],
                           False, RAMP_SAMPLES)
        dense = [(px, pz, h) for (px, pz), (_, h) in zip(plan, rise)]

    _DENSE_CACHE[key] = dense
    return dense


def ramp_segments(venue):
    """Cached ramp segments: (ax, az, vx, vz, length, start_s, h_from, h_to)."""
    key = venue["id"]
    cached = _RAMP_CACHE.get(key)
    if cached is not None:
        return cached

    points = ramp_dense(venue)
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

    xs = [p[0] for p in points]
    zs = [p[1] for p in points]
    bounds = (min(xs), max(xs), min(zs), max(zs))
    cached = (segments, travelled, bounds)
    _RAMP_CACHE[key] = cached
    return cached


def ramp_nearest(venue, x, z):
    """(distance, travelled, height, side) of the closest point on a venue's ramp.

    side is the sign of the cross product of the ramp's crown-to-foot
    direction with the offset to the point: which hand of the road it is on.
    Distance is 1e18 when the point is nowhere near the ramp's bounding box,
    which spares the per-segment search for most of the map.
    """
    segments, _total, (x0, x1, z0, z1) = ramp_segments(venue)
    ramp = venue["ramp"]
    reach = ramp["half_width"] + max(ramp["feather"], ramp.get("soft_feather", 0.0)) * 2.0 + 2.0
    if x < x0 - reach or x > x1 + reach or z < z0 - reach or z > z1 + reach:
        return 1e18, 0.0, None, 0.0

    nearest = 1e18
    travelled = 0.0
    marked = None
    side = 0.0
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
            cross = vx * (z - az) - vz * (x - ax)
            side = 1.0 if cross >= 0.0 else -1.0
    return nearest, travelled, marked, side


def ramp_foot(venue):
    """Where a venue's access ramp meets the valley floor."""
    return ramp_polyline(venue)[-1]
PAD_FLAT_RADIUS = 27.0    # level shelf around each venue
PAD_BLEND_RADIUS = 68.0   # ramp blending the shelf into natural ground

# Free-standing elevation markers, seeded into MARKERS on a first build. After
# that the empties are the source of truth - drag them and rebuild.
DEFAULT_LIFTS = [
    # High ground off the professional hill's west flank - the grassy
    # shoulder the access road runs down beside. As the artist left it.
    {"name": "prof_shoulder_inner", "x": -164.72, "z": -40.02, "height": 24.68,
     "radius": 34.0, "falloff": 34.0},
    {"name": "prof_shoulder_outer", "x": -212.0, "z": -83.0, "height": 62.0,
     "radius": 36.0, "falloff": 38.0},
]

LIFTS = list(DEFAULT_LIFTS)

MARKER_COLLECTION = "MARKERS"
CLIFF_KEYS = ("cliff_rim", "cliff_drop", "cliff_moat", "cliff_blend", "cliff_open_deg")
# Bump when the tables above change shape; older marker sets get reseeded.
MARKER_LAYOUT_VERSION = 3

# --- butte detail
REFINE_HALF = 70.0        # half-size of the fine terrain patch round a butte
REFINE_SUBDIV = 3         # fine cells per coarse cell inside the patch
CLIFF_TALUS = 2.6         # scree apron height at the foot of a face
CLIFF_TALUS_WIDTH = 11.0
CLIFF_ROCK_A = (0.30, 0.20, 0.13)   # warm sandstone band
CLIFF_ROCK_B = (0.19, 0.13, 0.09)   # dark band
CLIFF_ROCK_C = (0.42, 0.32, 0.22)   # pale band
SCREE = (0.24, 0.21, 0.17)

# --- ledge road furniture
LEDGE_LAMP_OFFSET = 7.9   # lamps stand inside the level road bed on a ledge
BARRIER_OFFSET = 7.3      # crash barrier along the drop side of a ledge
BARRIER_DROP = 2.5        # only where the ground falls away by at least this

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
        if venue.get("cliff_rim"):
            # Buttes are carved last, in apply_buttes(), so nothing - a lift,
            # another pad - can soften their faces afterwards.
            continue

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
            _segments, total, _bounds = ramp_segments(venue)
            reach = ramp["half_width"] + ramp["feather"]

            # Nearest point on the route, how far along it is, and the
            # height the waypoints call for there.
            nearest, travelled, marked, _side = ramp_nearest(venue, x, z)

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

        nearest, _travelled, _marked, _side = ramp_nearest(venue, x, z)

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


def floor_roll_at(x, z):
    """The gentle roll of the valley floor, before any ridge or pad."""
    roll = math.sin(x * 0.019) * math.cos(z * 0.017) * 1.15
    roll += (fbm(x * 0.012, z * 0.012, 3, 11) - 0.5) * 1.6
    return roll


def _wrap_deg(value):
    """An angle in degrees folded into [-180, 180)."""
    return (value + 180.0) % 360.0 - 180.0


def butte_rim(venue, angle):
    """Crown-edge radius of a butte at a bearing (radians, off +Z).

    cliff_rim_table, when given, is a flat list of bearing/radius pairs
    (degrees, metres) traced from the artist's sketch; bearings between them
    are interpolated round the circle. A little noise keeps it from reading
    as a drawn curve.
    """
    table = venue.get("cliff_rim_table")
    base = venue["cliff_rim"]
    if table:
        deg = math.degrees(angle) % 360.0
        pairs = sorted((float(table[i]) % 360.0, float(table[i + 1]))
                       for i in range(0, len(table) - 1, 2))
        base = pairs[-1][1]
        for i in range(len(pairs)):
            d0, r0 = pairs[i - 1]
            d1, r1 = pairs[i]
            span = (d1 - d0) % 360.0 or 360.0
            into = (deg - d0) % 360.0
            if into <= span:
                t = into / span
                t = t * t * (3.0 - 2.0 * t)
                base = r0 + (r1 - r0) * t
                break
    c, s = math.cos(angle), math.sin(angle)
    wobble = (fbm(c * 1.6 + 7.3, s * 1.6 + 2.1, 3, 41) - 0.5) * 2.0 * 1.6
    notch = (value_noise(c * 9.0 + 11.0, s * 9.0 + 4.0, 43) - 0.5) * 2.0 * 0.9
    return base + wobble + notch


def butte_drop(venue, angle):
    """Horizontal width of the rock face at a bearing - where it is steepest."""
    c, s = math.cos(angle), math.sin(angle)
    return venue.get("cliff_drop", 4.0) * (0.75 + 0.5 * value_noise(c * 3.0 + 1.0, s * 3.0 + 9.0, 47))


def butte_reach(venue):
    """Beyond this distance from its centre a butte no longer touches the ground."""
    table = venue.get("cliff_rim_table")
    rim_max = max([float(v) for v in table[1::2]] + [venue["cliff_rim"]]) if table else venue["cliff_rim"]
    return max(rim_max + 4.0 + venue.get("cliff_drop", 4.0) * 1.3
               + venue.get("cliff_moat", 16.0) + venue.get("cliff_blend", 30.0),
               venue.get("steep_radius", 88.0) + 2.0)


_SPLIT_CACHE = {}


def road_split_bearing(venue, distance):
    """Bearing (degrees) of the access road where it is `distance` from centre.

    The road runs out from the crown, so at each distance it cuts the ground
    round the butte in two: cliff on one hand, hillside on the other. This
    is where that line falls.
    """
    table = _SPLIT_CACHE.get(venue["id"])
    if table is None:
        table = []
        for px, pz, _h in ramp_dense(venue):
            d = math.hypot(px - venue["x"], pz - venue["z"])
            b = math.degrees(math.atan2(px - venue["x"], pz - venue["z"]))
            if not table or d > table[-1][0] + 0.25:
                table.append((d, b))
        _SPLIT_CACHE[venue["id"]] = table
    if not table:
        return 0.0
    if distance <= table[0][0]:
        return table[0][1]
    for (d0, b0), (d1, b1) in zip(table, table[1:]):
        if distance <= d1:
            t = (distance - d0) / max(1e-6, d1 - d0)
            return b0 + _wrap_deg(b1 - b0) * t
    return table[-1][1]


def cliff_weight(venue, x, z):
    """1 where a butte ends in a rock face, 0 where it slopes off as hillside.

    With an access road, the face runs from the road's cliff hand round to
    cliff_open_deg; past that, and on the road's other hand, the old grassy
    shoulder is kept. Without a road the whole rim is cliff.
    """
    ramp = venue.get("ramp")
    if not ramp or venue.get("cliff_open_deg") is None:
        return 1.0
    dx, dz = x - venue["x"], z - venue["z"]
    distance = math.hypot(dx, dz)
    bearing = math.degrees(math.atan2(dx, dz))
    split = road_split_bearing(venue, distance)
    # Degrees round from the road toward the face. The road runs outward
    # from the crown, so its cliff_side -1 hand is the one of rising bearing
    # (toward +X for a road heading +Z).
    turn = 1.0 if ramp.get("cliff_side", -1.0) < 0 else -1.0
    into = ((bearing - split) * turn) % 360.0
    span = ((float(venue["cliff_open_deg"]) - split) * turn) % 360.0
    signed = into if into <= span + (360.0 - span) * 0.5 else into - 360.0
    return smoothstep(-2.0, 2.0, signed) * smoothstep(-15.0, 15.0, span - signed)


def apply_buttes(x, z, height, floor):
    """Carves each cliff venue: crown, sheer face, canyon, and the road.

    Runs after the pads and lifts, so the faces stay sheer whatever the
    ground round them was doing. Where cliff_weight says hillside, the crown
    instead eases down to natural ground across steep_radius, as a pad does.
    """
    for venue in VENUES:
        if not venue.get("cliff_rim"):
            continue

        pad_h = venue["height"]
        dx, dz = x - venue["x"], z - venue["z"]
        distance = math.hypot(dx, dz)
        ramp = venue.get("ramp")

        if distance < butte_reach(venue):
            angle = math.atan2(dx, dz)
            rim = butte_rim(venue, angle)
            toe = rim + butte_drop(venue, angle)
            weight = cliff_weight(venue, x, z)

            # Hillside: the crown easing down to natural ground, as a pad.
            shelf = 1.0 - smoothstep(rim, venue.get("steep_radius", 88.0), distance)
            shoulder = height + (pad_h - height) * shelf

            # Canyon: whatever stood round the foot is cut down to the valley
            # floor, plus a scree apron against the face, then it climbs back
            # to natural ground across cliff_blend.
            scree = CLIFF_TALUS * (1.0 - smoothstep(toe, toe + CLIFF_TALUS_WIDTH, distance))
            scree *= 0.55 + 0.9 * value_noise(math.cos(angle) * 5.0, math.sin(angle) * 5.0, 61)
            held = min(height, floor) + scree
            moat = toe + venue.get("cliff_moat", 16.0)
            outside = smoothstep(moat, moat + venue.get("cliff_blend", 30.0), distance)
            canyon = held + (height - held) * outside

            # What the face drops to: the canyon where it is cliff, the
            # shoulder where it is hillside. Where one hands over to the
            # other the face keeps its sheer profile and simply gets lower
            # as the ground outside rises to meet the crown - so a cliff
            # dies away instead of flattening into a half-height smear.
            ground = shoulder + (canyon - shoulder) * weight
            # The ground's own face sits just inside the rock wall that
            # build_cliff_walls() hangs off the lip, so it never pokes out.
            crown = 1.0 - smoothstep(rim - 0.3, toe - 1.2, distance)
            height = ground + (pad_h - ground) * crown

        if ramp and ramp.get("cut", True):
            nearest, travelled, marked, side = ramp_nearest(venue, x, z)
            half = ramp["half_width"]
            soft = ramp.get("soft_feather", ramp["feather"])
            cliff_hand = side == (1.0 if ramp.get("cliff_side", -1.0) > 0 else -1.0)
            feather = ramp["feather"] if cliff_hand else soft
            if marked is not None and nearest < half + feather * 1.6:
                # SET the ground to the road: on the cliff hand the bed stops
                # dead at a drop; on the hill hand it is cut into the slope.
                target = min(marked, pad_h)
                if cliff_hand:
                    feather *= 0.7 + 0.6 * value_noise(travelled * 0.12, 5.5, 53)
                across = 1.0 - smoothstep(half, half + feather, nearest)
                height = height + (target - height) * across

    return height


_HEIGHT_CACHE = {}


def terrain_height(x, z):
    """Ground height at a valley-local point. The single source of truth."""
    key = (x, z)
    cached = _HEIGHT_CACHE.get(key)
    if cached is not None:
        return cached

    radius = math.hypot(x, z)
    angle = math.atan2(x, z)

    floor_roll = floor_roll_at(x, z)

    profile = ridge_profile(radius)
    gate = mouth_factor(angle)
    if profile <= 0.0 or gate <= 0.0:
        natural = floor_roll
    else:
        around = ridge_noise(math.cos(angle) * 1.7, math.sin(angle) * 1.7, 4, 3)
        peak = PEAK_BASE + PEAK_VARIANCE * around
        detail = (ridge_noise(x * 0.014, z * 0.014, 5, 7) - 0.4) * (4.0 + 26.0 * profile)
        natural = floor_roll + profile * gate * peak + detail * profile * gate

    height = apply_buttes(x, z, apply_lifts(x, z, apply_pads(x, z, natural)),
                          apply_pads(x, z, floor_roll))
    _HEIGHT_CACHE[key] = height
    return height


def clear_height_caches():
    _RAMP_CACHE.clear()
    _DENSE_CACHE.clear()
    _HEIGHT_CACHE.clear()
    _REFINE.clear()
    _SPLIT_CACHE.clear()


# ---------------------------------------------------------- terrain grid

_REFINE = []


def refine_patches():
    """Fine-grid rectangles round each butte, in coarse-grid index space.

    Each is (ix0, ix1, iz0, iz1): the coarse cells ix0..ix1-1, iz0..iz1-1 are
    replaced by REFINE_SUBDIV x REFINE_SUBDIV finer ones.
    """
    if _REFINE:
        return _REFINE
    step = (EXTENT * 2.0) / (GRID - 1)
    for venue in VENUES:
        if not venue.get("cliff_rim"):
            continue
        x0, x1 = venue["x"] - REFINE_HALF, venue["x"] + REFINE_HALF
        z0, z1 = venue["z"] - REFINE_HALF, venue["z"] + REFINE_HALF
        if venue.get("ramp"):
            # Stretch the patch over the whole access road as well.
            margin = venue["ramp"]["half_width"] + 14.0
            for px, pz, _h in ramp_dense(venue):
                x0, x1 = min(x0, px - margin), max(x1, px + margin)
                z0, z1 = min(z0, pz - margin), max(z1, pz + margin)
        ix0 = max(0, int(math.floor((x0 + EXTENT) / step)))
        ix1 = min(GRID - 1, int(math.ceil((x1 + EXTENT) / step)))
        iz0 = max(0, int(math.floor((z0 + EXTENT) / step)))
        iz1 = min(GRID - 1, int(math.ceil((z1 + EXTENT) / step)))
        _REFINE.append((ix0, ix1, iz0, iz1))
    return _REFINE


def refine_patch_at(gx, gz):
    """The fine patch holding coarse-grid coordinate (gx, gz), or None."""
    for patch in refine_patches():
        ix0, ix1, iz0, iz1 = patch
        if ix0 <= gx <= ix1 and iz0 <= gz <= iz1:
            return patch
    return None


def fine_vertex_height(patch, fx, fz):
    """Height of fine-patch vertex (fx, fz) exactly as the mesh stores it.

    Interior vertices sample the height field. Vertices on the patch border
    that fall between two coarse vertices are laid on the straight line
    between them, so the coarse quad next door meets them with no crack.
    """
    ix0, ix1, iz0, iz1 = patch
    k = REFINE_SUBDIV
    step = (EXTENT * 2.0) / (GRID - 1)
    nx, nz = (ix1 - ix0) * k, (iz1 - iz0) * k
    on_x_edge = fx == 0 or fx == nx
    on_z_edge = fz == 0 or fz == nz

    def coarse(ix, iz):
        return terrain_height(-EXTENT + ix * step, -EXTENT + iz * step)

    if on_x_edge and fz % k != 0:
        ix = ix0 + fx // k
        iz = iz0 + fz // k
        t = (fz % k) / k
        return coarse(ix, iz) + (coarse(ix, iz + 1) - coarse(ix, iz)) * t
    if on_z_edge and fx % k != 0:
        ix = ix0 + fx // k
        iz = iz0 + fz // k
        t = (fx % k) / k
        return coarse(ix, iz) + (coarse(ix + 1, iz) - coarse(ix, iz)) * t
    if fx % k == 0 and fz % k == 0:
        return coarse(ix0 + fx // k, iz0 + fz // k)
    fine = step / k
    return terrain_height(-EXTENT + ix0 * step + fx * fine, -EXTENT + iz0 * step + fz * fine)


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

    patch = refine_patch_at(gx, gz)
    if patch is not None:
        # Inside a butte's fine patch: same idea, on the finer cells.
        ix0, ix1, iz0, iz1 = patch
        k = REFINE_SUBDIV
        fgx = (gx - ix0) * k
        fgz = (gz - iz0) * k
        fx = max(0, min((ix1 - ix0) * k - 1, int(math.floor(fgx))))
        fz = max(0, min((iz1 - iz0) * k - 1, int(math.floor(fgz))))
        u = max(0.0, min(1.0, fgx - fx))
        v = max(0.0, min(1.0, fgz - fz))
        h00 = fine_vertex_height(patch, fx, fz)
        h10 = fine_vertex_height(patch, fx + 1, fz)
        h01 = fine_vertex_height(patch, fx, fz + 1)
        h11 = fine_vertex_height(patch, fx + 1, fz + 1)
    else:
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

    grass = base
    base = mix(base, ROCK, smoothstep(*ROCK_SLOPE_RANGE, slope) * 0.9)
    snow_amount = smoothstep(*SNOW_RANGE, height) * (1.0 - smoothstep(1.0, 1.5, slope))
    natural = mix(base, SNOW, snow_amount)

    # Round a butte the faces are layered sandstone, not the grey ridge rock,
    # and they take over at a gentler slope so the whole face reads as rock.
    for venue in VENUES:
        if not venue.get("cliff_rim"):
            continue
        dx, dz = x - venue["x"], z - venue["z"]
        distance = math.hypot(dx, dz)
        reach = butte_reach(venue)
        if distance > reach:
            continue
        angle = math.atan2(dx, dz)
        toe = butte_rim(venue, angle) + butte_drop(venue, angle)

        ground = grass
        # Scree on the canyon floor under the face.
        if height < venue["height"] - 3.0:
            apron = 1.0 - smoothstep(toe + 2.0, toe + CLIFF_TALUS_WIDTH * 1.4, distance)
            ground = mix(ground, SCREE, apron * 0.9)

        wave = math.sin(height * 0.62 + (fbm(x * 0.03, z * 0.03, 2, 71) - 0.5) * 5.0)
        band = 0.5 + 0.5 * wave
        strata = mix(CLIFF_ROCK_B, CLIFF_ROCK_A, smoothstep(0.15, 0.55, band))
        strata = mix(strata, CLIFF_ROCK_C, smoothstep(0.82, 0.97, band))
        butte = mix(ground, strata, smoothstep(0.7, 1.25, slope))
        # Anything under the rock wall, or just in front of it, is stone -
        # never a stray lick of grass showing between the ledges.
        if distance > toe - 6.0 and height < venue["height"] - 0.6:
            butte = mix(butte, mix(SCREE, strata, 0.5),
                        (1.0 - smoothstep(toe + 2.0, toe + 7.0, distance)) * cliff_weight(venue, x, z))

        # Fade back to the ridge's own colouring toward the edge of its reach,
        # and keep the grassy shoulder's own colours off the cliff side.
        keep = smoothstep(reach - 28.0, reach, distance)
        keep = 1.0 - (1.0 - keep) * cliff_weight(venue, x, z)
        return mix(butte, natural, keep)

    return natural


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


def road_section(px, py, ux, uy):
    """(centre height, cross slope) of a road's bed at a Blender-XY point.

    (ux, uy) is the unit normal across the road. The bed is one straight
    line across the full shoulder width: tilted to match the ground from edge
    to edge, and lifted just enough to clear every point of it in between.
    """
    half = ROAD_SHOULDER_WIDTH * 0.5
    offsets = (-half, -half * 0.66, -half * 0.33, 0.0, half * 0.33, half * 0.66, half)
    heights = [height_at_blender(px + ux * o, py + uy * o) for o in offsets]
    slope = (heights[-1] - heights[0]) / (2.0 * half)
    centre = max(h - slope * o for h, o in zip(heights, offsets))
    return centre, slope


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
        ux, uy = -dy / length, dx / length
        sx, sy = ux * width * 0.5, uy * width * 0.5

        # Every band of a road (gravel, edging, asphalt) sits on the same
        # flat cross-section, so a lower band can never ride up through a
        # higher one where the ground dips or humps across the road.
        centre, slope = road_section(px, py, ux, uy)
        half = width * 0.5
        lx, ly = px - sx, py - sy
        rx, ry = px + sx, py + sy
        verts.append((lx, ly, centre - slope * half + lift))
        verts.append((rx, ry, centre + slope * half + lift))

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
            props["ramp_cut"] = 1 if ramp.get("cut") else 0
            if ramp.get("soft_feather") is not None:
                props["ramp_soft_feather"] = float(ramp["soft_feather"])
            if ramp.get("cliff_side") is not None:
                props["ramp_cliff_side"] = float(ramp["cliff_side"])
        for key in CLIFF_KEYS:
            if venue.get(key) is not None:
                props[key] = float(venue[key])
        if venue.get("cliff_rim_table"):
            props["cliff_rim_table"] = [float(v) for v in venue["cliff_rim_table"]]
        if venue.get("ring_point"):
            props["ring_point"] = [float(v) for v in venue["ring_point"]]
        if venue.get("ring_via"):
            props["ring_foot_slot"] = int(venue.get("ring_foot_slot", 0))

        _empty(coll, "venue." + venue["id"],
               bl(venue["x"], venue["z"], venue["height"]),
               display='ARROWS', size=20.0, props=props,
               yaw=math.radians(venue.get("yaw_deg", 0.0)))

        if ramp:
            for index, (px, pz, py) in enumerate(ramp_polyline(venue), start=1):
                _empty(coll, "ramp.%s.%02d" % (venue["id"], index),
                       bl(px, pz, terrain_height(px, pz) if py is None else py),
                       display='SPHERE', size=7.0)

        for index, (px, pz) in enumerate(venue.get("ring_via", []), start=1):
            _empty(coll, "ring.%s.%02d" % (venue["id"], index),
                   bl(px, pz, 0.0), display='CUBE', size=5.0)

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
    if coll.objects and int(coll.get("layout_version", 1)) < MARKER_LAYOUT_VERSION:
        # Markers from an older layout of this script: the tables above have
        # moved on (new ramp route, cliff settings), so start them afresh.
        for obj in list(coll.objects):
            bpy.data.objects.remove(obj, do_unlink=True)
    if not coll.objects:
        seed_markers(coll)
    coll["layout_version"] = MARKER_LAYOUT_VERSION
    return coll


def read_markers(coll):
    """Reads the empties back into the venue and lift tables."""
    venue_empties = []
    ramp_empties = {}
    ring_empties = {}
    lift_empties = []

    for obj in coll.objects:
        if obj.name.startswith("venue."):
            venue_empties.append((obj, obj.name[len("venue."):]))
        elif obj.name.startswith("ramp."):
            venue_id, _, index = obj.name[len("ramp."):].rpartition(".")
            ramp_empties.setdefault(venue_id, []).append((index, obj))
        elif obj.name.startswith("ring."):
            venue_id, _, index = obj.name[len("ring."):].rpartition(".")
            ring_empties.setdefault(venue_id, []).append((index, obj))
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
        for key in CLIFF_KEYS:
            if key in obj:
                record[key] = float(obj[key])
        if "cliff_rim_table" in obj:
            record["cliff_rim_table"] = [float(v) for v in obj["cliff_rim_table"]]
        if "ring_point" in obj:
            record["ring_point"] = tuple(float(v) for v in obj["ring_point"])

        via = ring_empties.get(venue_id)
        if via:
            via.sort(key=lambda item: item[0])
            record["ring_via"] = [(way.location.x, -way.location.y) for _, way in via]
            record["ring_foot_slot"] = int(obj.get("ring_foot_slot", 0))

        waypoints = ramp_empties.get(venue_id)
        if waypoints:
            waypoints.sort(key=lambda item: item[0])
            record["ramp"] = {
                "half_width": float(obj.get("ramp_half_width", 13.0)),
                "feather": float(obj.get("ramp_feather", 9.0)),
                "cut": bool(obj.get("ramp_cut", 0)),
                "soft_feather": float(obj.get("ramp_soft_feather", obj.get("ramp_feather", 9.0))),
                "cliff_side": float(obj.get("ramp_cliff_side", -1.0)),
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
    """The ground: a coarse grid, with a fine patch spliced in round each butte.

    A sheer face needs small cells or it smears into a slope, but the whole
    map at that density would be a huge model. So the coarse cells under each
    patch are dropped and replaced by REFINE_SUBDIV x REFINE_SUBDIV finer
    ones. Border vertices of a patch that fall between two coarse vertices
    are laid on the line between them (see fine_vertex_height), so the seam
    closes without a crack.
    """
    step = (EXTENT * 2.0) / (GRID - 1)
    patches = refine_patches()

    heights = []
    for iz in range(GRID):
        z = -EXTENT + iz * step
        heights.append([terrain_height(-EXTENT + ix * step, z) for ix in range(GRID)])

    def in_patch_interior(ix, iz):
        for ix0, ix1, iz0, iz1 in patches:
            if ix0 < ix < ix1 and iz0 < iz < iz1:
                return True
        return False

    def cell_in_patch(ix, iz):
        for ix0, ix1, iz0, iz1 in patches:
            if ix0 <= ix < ix1 and iz0 <= iz < iz1:
                return True
        return False

    verts = []
    colours = []
    coarse_index = {}

    def coarse_colour(ix, iz):
        h = heights[iz][ix]
        hx0 = heights[iz][max(0, ix - 1)]
        hx1 = heights[iz][min(GRID - 1, ix + 1)]
        hz0 = heights[max(0, iz - 1)][ix]
        hz1 = heights[min(GRID - 1, iz + 1)][ix]
        slope = math.hypot((hx1 - hx0) / (2.0 * step), (hz1 - hz0) / (2.0 * step))
        neighbour_mean = (hx0 + hx1 + hz0 + hz1) * 0.25
        occlusion = 1.0 - max(0.0, min(1.0, (neighbour_mean - h) / 6.0)) * 0.35
        r, g, b = terrain_colour(-EXTENT + ix * step, -EXTENT + iz * step, h, slope)
        return (r * occlusion, g * occlusion, b * occlusion, 1.0)

    for iz in range(GRID):
        z = -EXTENT + iz * step
        for ix in range(GRID):
            if in_patch_interior(ix, iz):
                continue
            coarse_index[(ix, iz)] = len(verts)
            verts.append((-EXTENT + ix * step, -z, heights[iz][ix]))
            colours.append(coarse_colour(ix, iz))

    # The bl() mirror flips winding, so quads are wound the other way round.
    faces = []
    flat_faces = set()
    for iz in range(GRID - 1):
        for ix in range(GRID - 1):
            if cell_in_patch(ix, iz):
                continue
            faces.append((coarse_index[(ix, iz)], coarse_index[(ix + 1, iz)],
                          coarse_index[(ix + 1, iz + 1)], coarse_index[(ix, iz + 1)]))

    k = REFINE_SUBDIV
    fine = step / k
    for patch in patches:
        ix0, ix1, iz0, iz1 = patch
        nx, nz = (ix1 - ix0) * k, (iz1 - iz0) * k
        grid = [[fine_vertex_height(patch, fx, fz) for fx in range(nx + 1)] for fz in range(nz + 1)]

        index = {}
        for fz in range(nz + 1):
            for fx in range(nx + 1):
                if fx % k == 0 and fz % k == 0:
                    key = (ix0 + fx // k, iz0 + fz // k)
                    if key in coarse_index:
                        index[(fx, fz)] = coarse_index[key]
                        continue
                x = -EXTENT + ix0 * step + fx * fine
                z = -EXTENT + iz0 * step + fz * fine
                h = grid[fz][fx]
                hx0 = grid[fz][max(0, fx - 1)]
                hx1 = grid[fz][min(nx, fx + 1)]
                hz0 = grid[max(0, fz - 1)][fx]
                hz1 = grid[min(nz, fz + 1)][fx]
                slope = math.hypot((hx1 - hx0) / (2.0 * fine), (hz1 - hz0) / (2.0 * fine))
                # Occlusion over the same ~6 m as the coarse grid, not one fine cell.
                reach = min(k, fx, fz, nx - fx, nz - fz)
                if reach > 0:
                    mean = (grid[fz][fx - reach] + grid[fz][fx + reach]
                            + grid[fz - reach][fx] + grid[fz + reach][fx]) * 0.25
                else:
                    mean = h
                occlusion = 1.0 - max(0.0, min(1.0, (mean - h) / 6.0)) * 0.35
                r, g, b = terrain_colour(x, z, h, slope)
                index[(fx, fz)] = len(verts)
                verts.append((x, -z, h))
                colours.append((r * occlusion, g * occlusion, b * occlusion, 1.0))

        for fz in range(nz):
            for fx in range(nx):
                faces.append((index[(fx, fz)], index[(fx + 1, fz)],
                              index[(fx + 1, fz + 1)], index[(fx, fz + 1)]))

    mesh = bpy.data.meshes.new("terrain")
    mesh.from_pydata(verts, [], faces)
    mesh.update()

    colour_layer = mesh.color_attributes.new(name="Col", type='FLOAT_COLOR', domain='POINT')
    base_layer = mesh.attributes.new(name=MEADOW_BASE, type='FLOAT_VECTOR', domain='POINT')
    for index, colour in enumerate(colours):
        # verts are Blender XY, so valley z is -y.
        vx_, vz_ = verts[index][0], -verts[index][1]
        colour = shore_colour(vx_, vz_, colour, _terrain_height_unwatered(vx_, vz_) - verts[index][2])
        base_layer.data[index].vector = colour[:3]
        colour_layer.data[index].color = tint_grass_colour(vx_, vz_, colour, verts[index][2])
    keep_col_active(mesh)
    mesh["meadow_tint"] = MEADOW_TINT_VERSION

    for poly in mesh.polygons:
        poly.use_smooth = poly.index not in flat_faces

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
    ASPHALT, SHOULDER, WHITE, BARRIER = 0, 1, 2, 3
    objects = []

    # Ring road: waypoints pushed outward so it sweeps past the arenas, walked
    # in angular order - venue order would make the loop double back.
    groups = []
    for venue in VENUES:
        if venue.get("ring_point"):
            # Pinned: the ring keeps this line and the access road is snapped
            # onto it wherever its foot lands.
            point = (float(venue["ring_point"][0]), float(venue["ring_point"][1]))
        elif venue.get("ramp"):
            # A venue on a hill is met at the foot of its ramp. Pushing a
            # waypoint straight out from the centre would send the ring road
            # climbing into the mountains behind it.
            foot = ramp_foot(venue)
            point = (foot[0], foot[1])
        else:
            distance = math.hypot(venue["x"], venue["z"]) or 1.0
            scale = (distance + ROAD_RING_CLEARANCE) / distance
            point = (venue["x"] * scale, venue["z"] * scale)

        # Extra waypoints steer the ring round the venue. They travel as one
        # group, ordered as authored, so angular sorting cannot shuffle them.
        via = [(float(p[0]), float(p[1])) for p in venue.get("ring_via", [])]
        slot = max(0, min(len(via), int(venue.get("ring_foot_slot", 0))))
        sequence = via[:slot] + [point] + via[slot:]
        groups.append((math.atan2(point[0], point[1]), sequence))
    groups.sort(key=lambda item: item[0])
    ring = []
    for _angle, sequence in groups:
        for point in sequence:
            ring.append((math.atan2(point[0], point[1]), point))
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
    merge_into_ring = {}
    for venue in VENUES:
        if not venue.get("ramp"):
            continue
        # Driven from the very spline the ground was carved along (already
        # densely sampled), walked foot-first so the road climbs toward the
        # arena.
        route = [(point[0], point[1]) for point in reversed(ramp_dense(venue))]

        # Cut the top at the terrace edge so it never reaches the entrance.
        route = clip_to_radius(route, venue["x"], venue["z"], ARENA_RADIUS * 1.62 + 2.5)

        # Cut the bottom short of the ring road, which runs through the ramp
        # foot. Without this the two ribbons lie on top of each other at the
        # junction and fight for the same pixels.
        # (A venue with a pinned ring_point instead merges into the ring: its
        # foot is snapped onto the ring line below, and the access road is
        # laid a hair lower so the ring's paint wins where they overlap.)
        if not venue.get("ring_point"):
            foot = ramp_foot(venue)
            route.reverse()
            route = clip_to_radius(route, foot[0], foot[1], ROAD_SHOULDER_WIDTH * 0.5 + 1.5)
            route.reverse()

        climb = [(bl(cx, cz).x, bl(cx, cz).y) for cx, cz in route]
        # Already a dense spline sample - one "span" per point keeps it as is.
        dense = 1 if len(ramp_dense(venue)) > len(ramp_polyline(venue)) else 24
        road_specs.append(("road_access_" + venue["id"], climb, False, dense))
        merge_into_ring["road_access_" + venue["id"]] = bool(venue.get("ring_point"))

    lamp_sites = []
    polylines = []

    ring_line = None
    for name, control, closed, samples in road_specs:
        polyline = catmull_rom(control, closed, samples)
        if name == "road_ring":
            ring_line = polyline
        ledge = name.startswith("road_access_")
        merged = merge_into_ring.get(name, False)
        if merged and ring_line:
            # Merge into the ring: drop the foot's points that already lie
            # on the ring, so the access road runs out onto it and stops.
            def off_ring(p):
                return min(math.dist(p, q) for q in ring_line)
            while len(polyline) > 2 and off_ring(polyline[0]) < ROAD_EDGING_WIDTH * 0.5 + 0.6:
                polyline = polyline[1:]
        polylines.append(polyline)

        def drop_side(px, py, heading, reach=11.0):
            """+1 / -1 for the side the ground falls away on, 0 if neither."""
            sx, sy = -math.sin(heading), math.cos(heading)
            centre = height_at_blender(px, py)
            left = centre - height_at_blender(px + sx * reach, py + sy * reach)
            right = centre - height_at_blender(px - sx * reach, py - sy * reach)
            if max(left, right) < BARRIER_DROP:
                return 0.0, centre
            return (1.0 if left > right else -1.0), centre

        # Lamp posts, alternating sides so the road is lit from both hands
        # without a pole every few metres. On a ledge they all stand on the
        # rock side, inside the level road bed - out on the drop side a pole
        # would be planted on the canyon floor far below.
        for index, ((lx, ly), heading) in enumerate(sample_along(polyline, LAMP_SPACING)):
            side = 1.0 if index % 2 == 0 else -1.0
            offset = LAMP_OFFSET
            if ledge:
                offset = LEDGE_LAMP_OFFSET
                falls, _centre = drop_side(lx, ly, heading)
                if falls != 0.0:
                    side = -falls
            out_x = -math.sin(heading) * side
            out_y = math.cos(heading) * side
            pole = (lx + out_x * offset, ly + out_y * offset)
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
        lifts = (0.10, 0.20, 0.26) if merged else (0.15, 0.26, 0.3)
        add_ribbon(builder, polyline, ROAD_SHOULDER_WIDTH, lifts[0], SHOULDER)
        add_ribbon(builder, polyline, ROAD_EDGING_WIDTH, lifts[1], WHITE)
        add_ribbon(builder, polyline, ROAD_ASPHALT_WIDTH, lifts[2], ASPHALT)

        DASH_LENGTH = 3.2
        for (dx, dy), heading in sample_along(polyline, DASH_SPACING):
            if merged and math.dist((dx, dy), polyline[0]) < 14.0:
                continue   # the ring's own paint runs through the merge
            # A dash is a flat slab, so on a climb it has to be pitched to lie
            # along the slope. Lifting it clear instead leaves it hanging over
            # the asphalt like a rung.
            reach = DASH_LENGTH * 0.5
            ahead_x, ahead_y = math.cos(heading) * reach, math.sin(heading) * reach
            side = ROAD_ASPHALT_WIDTH * 0.5
            side_x, side_y = -math.sin(heading) * side, math.cos(heading) * side

            def crown(px, py):
                """Height of the asphalt's centre line, which is what paint sits on.

                The same flat cross-section the ribbons are swept on, so paint
                lies on the asphalt rather than on the ground below it.
                """
                return road_section(px, py, -math.sin(heading), math.cos(heading))[0]

            ahead = crown(dx + ahead_x, dy + ahead_y)
            behind = crown(dx - ahead_x, dy - ahead_y)
            ground = max(crown(dx, dy), (ahead + behind) * 0.5) - 0.02

            # Negative, because a rotation about Y tips the nose (+X) down.
            pitch = -math.atan2(ahead - behind, reach * 2.0)
            builder.add(*prim_box(DASH_LENGTH, 0.08, 0.45),
                        Matrix.Translation((dx, dy, ground + 0.4))
                        @ Matrix.Rotation(heading, 4, 'Z')
                        @ Matrix.Rotation(pitch, 4, 'Y'), WHITE)

        if ledge and len(materials) > BARRIER:
            # Crash barrier along the drop: short blocks in racing red and
            # white, only where the ground actually falls away.
            BLOCK = 2.3
            for index, ((bx, by), heading) in enumerate(sample_along(polyline, BLOCK + 0.35)):
                falls, _centre = drop_side(bx, by, heading)
                if falls == 0.0:
                    continue
                sx, sy = -math.sin(heading) * falls, math.cos(heading) * falls
                px, py = bx + sx * BARRIER_OFFSET, by + sy * BARRIER_OFFSET
                ax, ay = math.cos(heading) * BLOCK * 0.5, math.sin(heading) * BLOCK * 0.5
                ahead = height_at_blender(px + ax, py + ay)
                behind = height_at_blender(px - ax, py - ay)
                pitch = -math.atan2(ahead - behind, BLOCK)
                builder.add(*prim_box(BLOCK, 0.85, 0.5),
                            Matrix.Translation((px, py, (ahead + behind) * 0.5 + 0.38))
                            @ Matrix.Rotation(heading, 4, 'Z')
                            @ Matrix.Rotation(pitch, 4, 'Y'),
                            BARRIER if index % 2 == 0 else WHITE)

        objects.append(builder.to_object(name, materials, scene))

    return objects, lamp_sites, polylines


def build_street_lamps(scene, sites, materials):
    """Every street lamp as its own object: street_lamp_000, _001, ...

    They all share one mesh (pole, arm, housing and lens, built at the
    origin with the arm along +X), so each can be moved, turned or deleted in
    Blender on its own. Only the lens uses the emissive material, so the
    runtime switches the lights by touching one material.

    Each carries a lamp_head custom property - where its lens sits in its own
    space - which export_career_valley.py uses to rewrite the lamp manifest
    from wherever the lamps have been dragged to.
    """
    POST, LENS = 0, 1
    builder = MeshBuilder()
    top = LAMP_HEIGHT

    builder.add(*prim_cylinder(0.30, 0.20, LAMP_HEIGHT, 8),
                Matrix.Translation((0.0, 0.0, LAMP_HEIGHT * 0.5)), POST)
    # Arm out over the carriageway, then the housing on the end of it.
    builder.add(*prim_box(LAMP_ARM, 0.22, 0.22),
                Matrix.Translation((LAMP_ARM * 0.5, 0.0, top)), POST)
    builder.add(*prim_box(1.75, 0.42, 0.66),
                Matrix.Translation((LAMP_ARM, 0.0, top - 0.24)), POST)
    builder.add(*prim_box(1.40, 0.12, 0.48),
                Matrix.Translation((LAMP_ARM, 0.0, top - 0.49)), LENS)
    head_local = (LAMP_ARM, 0.0, top - 0.52)

    proto = builder.to_object("street_lamp_proto", materials, scene)
    proto.data.name = "street_lamp"
    proto.hide_set(True)
    proto.hide_render = True

    lamps = []
    for index, site in enumerate(sites):
        bx, by = site["pole"]
        ground = site["ground"]
        facing = site["bearing"]

        obj = bpy.data.objects.new("street_lamp_%03d" % index, proto.data)
        obj.location = (bx, by, ground)
        obj.rotation_euler = (0.0, 0.0, facing)
        obj["lamp_head"] = head_local
        obj["road"] = site["road"]
        scene.collection.objects.link(obj)
        lamps.append(obj)

        reach_x, reach_y = math.cos(facing), math.sin(facing)
        site["head"] = (bx + reach_x * head_local[0], by + reach_y * head_local[0],
                        ground + head_local[2])

    return lamps, proto


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


def plant_trees(scene, prototypes, road_polylines=None):
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

    # The layout is frozen, but the ground under it is not: a tree left on a
    # road, a rock face or a butte's crown edge is skipped rather than moved,
    # so every other tree keeps its place.
    road_points = [point for line in (road_polylines or []) for point in line]
    road_clear = ROAD_SHOULDER_WIDTH * 0.5 + 2.5

    def unfit(x, z):
        for venue in VENUES:
            if venue.get("cliff_rim"):
                d = math.hypot(x - venue["x"], z - venue["z"])
                rim = butte_rim(venue, math.atan2(x - venue["x"], z - venue["z"]))
                if d < rim + 2.0:
                    return True
                if cliff_weight(venue, x, z) > 0.3 and d < rim + venue.get("cliff_drop", 4.0) + 9.0:
                    return True
        e = 1.5
        slope = math.hypot(terrain_height(x + e, z) - terrain_height(x - e, z),
                           terrain_height(x, z + e) - terrain_height(x, z - e)) / (2.0 * e)
        if slope > 0.7:
            return True
        bx, by = x, -z
        for px, py in road_points:
            if abs(px - bx) < road_clear and abs(py - by) < road_clear \
                    and math.hypot(px - bx, py - by) < road_clear:
                return True
        return False

    planted = []
    skipped = 0
    # Trees the user chose to remove (they stood on the meadow road). Their
    # names are still used up, so every other tree keeps its name.
    removed = {(round(x, 2), round(z, 2)) for x, z in
               features().get("meadow_road", {}).get("removed_tree_positions", [])}
    serial = 0
    for record in layout:
        x, z = record["x"], record["z"]
        if unfit(x, z):
            skipped += 1
            continue
        if (round(x, 2), round(z, 2)) in removed:
            serial += 1
            continue
        source = prototypes[record["model"] % len(prototypes)]
        obj = bpy.data.objects.new(f"tree_{serial:03d}", source.data)
        serial += 1
        obj.location = bl(x, z, terrain_height(x, z))
        obj.rotation_euler = (0.0, 0.0, record["yaw"])
        scale = record["scale"]
        obj.scale = (scale, scale, scale)
        scene.collection.objects.link(obj)
        planted.append(obj)

    return planted, skipped


def _inverse_smoothstep(y):
    """t in [0, 1] with smoothstep(0, 1, t) == y."""
    y = max(0.0, min(1.0, y))
    return 0.5 - math.sin(math.asin(1.0 - 2.0 * y) / 3.0)


def _rock_colour(height, s, inset):
    """Layered sandstone, darker in the cracks, paler on what juts out."""
    wave = math.sin(height * 0.62 + (fbm(s * 0.03, height * 0.02, 2, 71) - 0.5) * 4.0)
    band = 0.5 + 0.5 * wave
    colour = mix(CLIFF_ROCK_B, CLIFF_ROCK_A, smoothstep(0.15, 0.55, band))
    colour = mix(colour, CLIFF_ROCK_C, smoothstep(0.82, 0.97, band))
    shade = 0.78 + 0.35 * max(0.0, min(1.0, inset))
    return (colour[0] * shade, colour[1] * shade, colour[2] * shade, 1.0)


def _wall_strip(builder_verts, builder_faces, colours, columns, rows=28, taper=(True, True)):
    """Adds one rock wall: a grid hung from a line of columns.

    Each column is (x, z, nx, nz, s, top, bottom, face_width): a point on the
    lip in valley coordinates, the outward normal, distance along the wall,
    the lip and foot heights, and how far the ground's own face leans out
    between them. The rock follows that lean, pushed out by layered noise:
    ledges every few metres, buttresses and gullies along its length.

    The first row is tucked in under the lip, below the ground, so the rock
    runs straight out of the grass: there is no slot between the lip and the
    wall to see down into. The rock also settles back against the ground
    over the last few columns of each end, rather than stopping as a flap.
    """
    if len(columns) < 2:
        return
    base = len(builder_verts)
    count = len(columns)
    for k, (x, z, nx, nz, s, top, bottom, lean) in enumerate(columns):
        tx, tz = -nz, nx
        ends = min(1.0, k / 4.0 if taper[0] else 1.0,
                   (count - 1 - k) / 4.0 if taper[1] else 1.0)
        # Buried row: 1.6 m back inside the lip, just under the surface.
        builder_verts.append(tuple(bl(x - nx * 1.6, z - nz * 1.6, top - 0.45)))
        colours.append(_rock_colour(top, s, 0.0))
        for j in range(rows + 1):
            v = j / rows
            h = top + (bottom - top) * v
            # Horizontal position of the ground's own face at this height
            # (the foot is 2.5 m above the buried bottom row).
            depth = (top - h) / max(0.5, top - (bottom + 2.5))
            out = lean * _inverse_smoothstep(1.0 - min(1.0, depth)) + max(0.0, depth - 1.0) * 1.5
            # Rock relief.
            relief = 0.45 + 1.9 * fbm(s * 0.075, h * 0.09, 3, 81)
            ledge = 0.9 * smoothstep(0.58, 0.74, (h * 0.21 + 0.5 * fbm(s * 0.03, 3.3, 2, 83)) % 1.0)
            buttress = 1.6 * (ridge_noise(s * 0.045, h * 0.03 + 1.7, 3, 85) - 0.3)
            push = max(0.6, relief + ledge + buttress)
            # A low wall (the road's, near its foot) keeps its rock tight to
            # the ground instead of bulging out like a skirt.
            push *= min(1.0, 0.2 + (top - bottom - 2.5) / 7.0)
            # Flush with the lip at the very top, so the crown's edge is clean.
            push *= min(1.0, 0.25 + v * 7.0)
            # ...and at each end the rock dives back into the ground's own
            # face (which sits ~1.3 m inside it), so a wall never ends in an
            # open pocket.
            push = -1.5 + (push + 1.5) * ends
            slide = (value_noise(s * 0.35, h * 0.35, 87) - 0.5) * 0.9 * (1.0 if j > 0 else 0.0)
            px = x + nx * (out + push) + tx * slide
            pz = z + nz * (out + push) + tz * slide
            ph = h + (value_noise(s * 0.5 + 3.0, h * 0.4, 89) - 0.5) * 0.35 * (1.0 if 0 < j < rows else 0.0)
            builder_verts.append(tuple(bl(px, pz, ph)))
            colours.append(_rock_colour(h, s, (push - 0.3) / 2.6))
    stride = rows + 2
    for i in range(count - 1):
        nx, nz = columns[i][2], columns[i][3]
        outward = Vector((nx, -nz, 0.0))       # the column normal, in Blender XY
        for j in range(rows + 1):
            a = base + i * stride + j
            quad = (a, a + 1, a + stride + 1, a + stride)
            p0, p1, p2, p3 = (Vector(builder_verts[q]) for q in quad)
            normal = (p2 - p0).cross(p3 - p1)
            # Faces out, whatever the relief did to the quad.
            builder_faces.append(quad if normal.dot(outward) >= 0.0 else quad[::-1])


def build_cliff_walls(scene, terrain_mat, keep_clear=None):
    """Rock faces for every cliff venue, as their own mesh.

    A height field can only stretch one long quad down a sheer drop, which
    is what made the first faces look like folded paper. These are real
    walls instead - rows and columns hung off the lip - that hide the ground's
    own steep strip behind them.
    """
    verts, faces, colours = [], [], []
    outline = []
    STEP = 1.3
    # Other roads (valley coordinates) the rock must stay off - the ring
    # road where the access road meets it.
    clear_points = [(px, -py) for line in (keep_clear or []) for px, py in line]

    for venue in VENUES:
        if not venue.get("cliff_rim"):
            continue
        cx, cz, pad_h = venue["x"], venue["z"], venue["height"]
        ramp = venue.get("ramp")

        def ground_out(x, z, nx, nz, reach):
            return terrain_height(x + nx * reach, z + nz * reach)

        # --- the crown's wall, from the road round to where the face ends
        start = 0.0
        if ramp:
            start = road_split_bearing(venue, venue["cliff_rim"])
            # Walk clockwise until the lip is clear of the road bed.
            for _ in range(90):
                a = math.radians(start)
                r = butte_rim(venue, a)
                near, _t, _h, _side = ramp_nearest(venue, cx + math.sin(a) * r, cz + math.cos(a) * r)
                if near > ramp["half_width"] + 0.8:
                    break
                start += 0.5
            # Tuck the first column in behind the road's own wall, so the two
            # overlap at the corner instead of leaving a slot between them.
            start -= 2.0
        stop = float(venue.get("cliff_open_deg", start + 360.0)) + 16.0
        if stop <= start:
            stop += 360.0

        columns = []
        first_strip = bool(ramp)
        bearing = start
        s = 0.0
        while bearing <= stop:
            a = math.radians(bearing)
            r = butte_rim(venue, a)
            nx, nz = math.sin(a), math.cos(a)
            x, z = cx + nx * r, cz + nz * r
            drop = butte_drop(venue, a)
            foot = ground_out(x, z, nx, nz, drop + 3.0)
            weight = cliff_weight(venue, x + nx * 4.0, z + nz * 4.0)
            top = pad_h - 0.05
            if weight > 0.02 and top - foot > 1.2:
                columns.append((x, z, nx, nz, s, top, foot - 2.5, drop))
                outline.append((x, z))
            elif len(columns) >= 2:
                _wall_strip(verts, faces, colours, columns, taper=(not first_strip, True))
                columns = []
                first_strip = False
            bearing += math.degrees(STEP / max(5.0, r))
            s += STEP
        _wall_strip(verts, faces, colours, columns, taper=(not first_strip, True))

        # --- the road's own wall: under the bed on its cliff hand
        if ramp:
            path = ramp_dense(venue)
            half = ramp["half_width"]
            hand = -1.0 if ramp.get("cliff_side", -1.0) < 0 else 1.0
            columns = []
            first_strip = True
            carried = 0.0
            for i in range(len(path) - 1):
                ax, az, ah = path[i]
                bx, bz, bh = path[i + 1]
                seg = math.hypot(bx - ax, bz - az)
                if seg < 1e-6:
                    continue
                ux, uz = (bx - ax) / seg, (bz - az) / seg
                # Normal toward the cliff hand: cross(dir, n) has sign `hand`.
                nx, nz = -uz * hand, ux * hand
                t = carried
                while t < seg:
                    f = t / seg
                    px, pz = ax + (bx - ax) * f, az + (bz - az) * f
                    road_h = min(pad_h, ah + (bh - ah) * f)
                    x, z = px + nx * (half + 0.3), pz + nz * (half + 0.3)
                    inside = math.hypot(x - cx, z - cz) < butte_rim(venue, math.atan2(x - cx, z - cz)) - 0.5
                    foot = ground_out(x, z, nx, nz, ramp["feather"] * 1.3 + 3.0)
                    clear = not any(abs(qx - x) < 11.0 and abs(qz - z) < 11.0
                                    and math.hypot(qx - x, qz - z) < 11.0
                                    for qx, qz in clear_points)
                    if not inside and clear and road_h - foot > 1.2:
                        columns.append((x, z, nx, nz, len(outline) * STEP, road_h - 0.04,
                                        foot - 2.5, ramp["feather"]))
                        outline.append((x, z))
                    elif len(columns) >= 2:
                        _wall_strip(verts, faces, colours, columns, taper=(not first_strip, True))
                        columns = []
                        first_strip = False
                    t += STEP
                carried = t - seg
            _wall_strip(verts, faces, colours, columns, taper=(not first_strip, True))

    if not faces:
        return None, outline

    mesh = bpy.data.meshes.new("cliff_rock")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    layer = mesh.color_attributes.new(name="Col", type='FLOAT_COLOR', domain='POINT')
    for index, colour in enumerate(colours):
        layer.data[index].color = colour
    for poly in mesh.polygons:
        poly.use_smooth = False       # faceted stone
    mesh.materials.append(terrain_mat)
    obj = bpy.data.objects.new("cliff_rock", mesh)
    scene.collection.objects.link(obj)
    return obj, outline


EAST_PASS_SETBACK = 12.0   # gate stands this far back from the road's end, clear of trees
EAST_PASS_HALF_SPAN = 9.2  # pillar centres from the road's centre line, outside the shoulders


def road_end_frame(road_obj):
    """(end point, unit direction) of a road ribbon, in Blender XY, read off its mesh.

    The shoulder ribbon is laid first as left/right vertex pairs a fixed width
    apart; the last pair is the road's end and a few pairs back gives its heading.
    """
    verts = [road_obj.matrix_world @ v.co for v in road_obj.data.vertices]
    rail = []
    for i in range(0, len(verts) - 1, 2):
        a, b = verts[i], verts[i + 1]
        if abs(math.hypot(a.x - b.x, a.y - b.y) - ROAD_SHOULDER_WIDTH) > 0.2:
            break
        rail.append(((a.x + b.x) * 0.5, (a.y + b.y) * 0.5))
    ex, ey = rail[-1]
    bx, by = rail[max(0, len(rail) - 8)]
    length = math.hypot(ex - bx, ey - by) or 1.0
    return (ex, ey), ((ex - bx) / length, (ey - by) / length)


def build_east_pass(scene, materials, road_obj=None):
    """The portal out to the dealer, straddling the end of the exit road.

    It stands square across the road with both pillars outside the shoulders,
    a sign beam over the carriageway, a guard booth and a raised boom, and the
    road runs on through it to a turnaround. Its frame: X across the road, Y
    along it pointing out of the valley.
    """
    from mathutils.bvhtree import BVHTree

    ROCK, DARK = 0, 1
    white = make_material("ValleyGateWhite", 0xeef1f4, roughness=0.55)
    accent = make_material("ValleyGateAccent", 0xf5b83d, roughness=0.4, emission=1.6)
    glass = make_material("LicenseGlass", 0x3f7394, roughness=0.12, metallic=0.1)
    asphalt = make_material("ValleyAsphalt", 0x3a3d43, roughness=0.72)
    red = make_material("ValleyBarrier", 0xd22f3c, roughness=0.55)
    slots = list(materials) + [white, accent, glass, asphalt, red]
    WHITE, ACCENT, GLASS, ASPHALT, RED = range(len(materials), len(materials) + 5)

    if road_obj is None:
        road_obj = scene.objects.get("road_exit")
    if road_obj is not None:
        (ex, ey), (dx, dy) = road_end_frame(road_obj)
    else:
        ex, ey, dx, dy = 58.0, -14.0, -0.859, -0.511
    cx, cy = ex - dx * EAST_PASS_SETBACK, ey - dy * EAST_PASS_SETBACK
    yaw = math.atan2(-dx, dy)                      # local +Y along the road, outward
    px, py = dy, -dx                               # local +X in Blender XY

    terrain = scene.objects["terrain"]
    tv = [terrain.matrix_world @ v.co for v in terrain.data.vertices]
    bvh = BVHTree.FromPolygons(tv, [list(poly.vertices) for poly in terrain.data.polygons])

    def ground_at(x, y):
        wx, wy = cx + px * x + dx * y, cy + py * x + dy * y
        hit = bvh.ray_cast(Vector((wx, wy, 1000.0)), Vector((0, 0, -1)))
        return hit[0].z if hit[0] is not None else 0.0

    h0 = ground_at(0.0, 0.0)
    g = lambda x, y: ground_at(x, y) - h0
    b = MeshBuilder()

    def box(x, y, z, sx, sy, sz, mat, rot=0.0):
        b.add(*prim_box(sx, sz, sy), Matrix.Translation((x, y, z)) @ Matrix.Rotation(rot, 4, 'Z'), mat)

    span = EAST_PASS_HALF_SPAN
    for side in (-1.0, 1.0):
        x = side * span
        gz = g(x, 0.0)
        box(x, 0.0, gz + 0.3, 3.4, 3.4, 1.2, ROCK)                  # plinth
        box(x, 0.0, gz + 2.1, 2.6, 2.6, 2.6, ROCK)                  # stone base
        b.add(*prim_cylinder(1.75, 1.3, 7.2, 4), Matrix.Translation((x, 0.0, gz + 7.0))
              @ Matrix.Rotation(math.pi / 4, 4, 'Z'), WHITE)       # tapered upper pillar
        box(x - side * 1.1, 0.0, gz + 7.0, 0.3, 1.0, 6.4, ACCENT)   # inner light strip
        box(x, 0.0, gz + 10.75, 2.8, 2.8, 0.3, DARK)                # cap

    top = max(g(-span, 0.0), g(span, 0.0))
    box(0.0, 0.0, top + 11.5, span * 2 + 2.8, 2.2, 1.5, WHITE)       # sign beam
    box(0.0, 0.0, top + 10.68, span * 2 - 2.4, 0.4, 0.14, ACCENT)    # underside light
    box(0.0, 0.0, top + 12.33, span * 2 + 2.8, 2.3, 0.16, DARK)      # top trim
    for k in range(6):                                                # down-lights
        b.add(*prim_cylinder(0.26, 0.2, 0.3, 10),
              Matrix.Translation((-6.25 + k * 2.5, 0.0, top + 10.6)), ACCENT)

    # sign on the valley-facing side: a dark panel, an outward chevron and a checker band
    box(0.0, -1.2, top + 11.55, 9.0, 0.2, 1.25, DARK)
    for sgn in (-1.0, 1.0):                                          # "^" = straight on
        b.add(*prim_box(1.05, 0.22, 0.08), Matrix.Translation((sgn * 0.42, -1.33, top + 11.55))
              @ Matrix.Rotation(sgn * math.radians(35), 4, 'Y'), ACCENT)
    for k in range(10):
        box(-4.05 + k * 0.9, -1.2, top + 10.82, 0.9, 0.2, 0.26, WHITE if k % 2 == 0 else DARK)

    # guard booth and boom on the side clear of the trees
    side = -1.0
    bxl, byl = side * (span + 3.8), 2.0
    gb = g(bxl, byl)
    box(bxl, byl, gb + 0.15, 3.0, 3.0, 0.5, ROCK)
    box(bxl, byl, gb + 1.1, 2.4, 2.4, 1.4, WHITE)
    box(bxl, byl, gb + 2.35, 2.45, 2.45, 1.1, GLASS)
    box(bxl, byl, gb + 3.05, 3.1, 3.1, 0.3, WHITE)
    box(bxl, byl, gb + 3.24, 3.12, 3.12, 0.1, ACCENT)
    post_x = side * 7.6
    gp = g(post_x, -1.6)
    box(post_x, -1.6, gp + 0.6, 0.5, 0.5, 1.2, DARK)
    arm = 8.0
    raise_to = math.radians(76.0)
    for k in range(8):                                               # raised red/white boom
        along = (k + 0.5) * arm / 8
        b.add(*prim_box(arm / 8, 0.16, 0.16),
              Matrix.Translation((post_x - side * math.cos(raise_to) * along, -1.6,
                                  gp + 1.2 + math.sin(raise_to) * along))
              @ Matrix.Rotation(side * raise_to, 4, 'Y'), RED if k % 2 == 0 else WHITE)

    # the road carries on through the portal to a turnaround
    # Draped over the ground, not a flat disc: the ground falls ~2 m across it.
    # It sits just under the road's own surface, so where they overlap the road wins.
    ty = EAST_PASS_SETBACK + 3.0
    rings, segs = (0.0, 2.0, 4.0, 6.0, 7.3, 7.7, 8.2), 40
    verts, faces = [], []
    for r in rings:
        for k in range(segs):
            a = k / segs * math.tau
            x, y = math.cos(a) * r, ty + math.sin(a) * r
            verts.append((x, y, g(x, y) + (0.24 if r < 8.0 else 0.05)))
    for ri in range(len(rings) - 1):
        for k in range(segs):
            j = (k + 1) % segs
            a0, a1 = ri * segs + k, ri * segs + j
            faces.append(((a0, a1, a1 + segs, a0 + segs), WHITE if rings[ri] == 7.3 else ASPHALT))
    for mat in (ASPHALT, WHITE):
        b.add(verts, [face for face, m in faces if m == mat], None, mat)

    obj = b.to_object("east_pass", slots, scene)
    obj.location = (cx, cy, h0)
    obj.rotation_euler = (0.0, 0.0, yaw)
    return obj


# ============================================================================
# FEATURES - the meadow road, the pond and the waterfall
# ============================================================================
#
# Traced from a screenshot the user marked up, and kept as data in
# FEATURES_PATH so a rebuild reproduces them: the road's control points, the
# pond's outline, island and water level, and the waterfall rock's size.
# Edit that file to adjust any of them.
#
# The pond is the one feature that changes the terrain: it digs a basin inside
# its outline, leaving the island (and the trees on it) at their own height.
# Nothing outside the outline moves.

FEATURES_PATH = os.path.join(PROJECT_ROOT, "career_valley_features.json")
_FEATURE_CACHE = {}


def features():
    if "data" not in _FEATURE_CACHE:
        data = {}
        if os.path.exists(FEATURES_PATH):
            with open(FEATURES_PATH, encoding="utf-8") as handle:
                data = json.load(handle)
        _FEATURE_CACHE["data"] = data
    return _FEATURE_CACHE["data"]


def _pond_shape():
    if "pond" not in _FEATURE_CACHE:
        pond = features().get("pond")
        if pond:
            outline = [tuple(p) for p in pond["outline"]]
            xs = [x for x, z in outline]
            zs = [z for x, z in outline]
            island = dict(pond["island"])
            if "outline" in island:
                island["outline"] = [tuple(p) for p in island["outline"]]
            pond = dict(pond, outline=outline, island=island, bbox=(min(xs), min(zs), max(xs), max(zs)))
        _FEATURE_CACHE["pond"] = pond
    return _FEATURE_CACHE["pond"]


def _inside(poly, x, z):
    hit = False
    for (ax, az), (bx, bz) in zip(poly, poly[1:] + poly[:1]):
        if (az > z) != (bz > z) and x < ax + (z - az) * (bx - ax) / (bz - az):
            hit = not hit
    return hit


def _edge_distance(poly, x, z):
    best = 1e18
    for (ax, az), (bx, bz) in zip(poly, poly[1:] + poly[:1]):
        vx, vz = bx - ax, bz - az
        t = max(0.0, min(1.0, ((x - ax) * vx + (z - az) * vz) / max(vx * vx + vz * vz, 1e-9)))
        best = min(best, math.hypot(x - ax - vx * t, z - az - vz * t))
    return best


def _island_distance(island, x, z):
    """Signed distance from the island's shore: negative on the island."""
    if "outline" in island:
        d = _edge_distance(island["outline"], x, z)
        return -d if _inside(island["outline"], x, z) else d
    return math.hypot(x - island["x"], z - island["z"]) - island["radius"]


def pond_carve(x, z, height):
    """The ground with the pond's basin dug out of it (a no-op outside the pond)."""
    pond = _pond_shape()
    if not pond:
        return height
    x0, z0, x1, z1 = pond["bbox"]
    if x < x0 or x > x1 or z < z0 or z > z1 or not _inside(pond["outline"], x, z):
        return height
    from_island = _island_distance(pond["island"], x, z)
    if from_island <= 0.0:
        return height                        # the island keeps its own ground
    d = min(_edge_distance(pond["outline"], x, z), from_island)
    floor = pond["level"] - pond["depth"]
    target = height + (floor - height) * smoothstep(0.0, pond["bank"], d)
    return min(height, target)


# The pond is applied on top of everything else that shapes the ground.
_terrain_height_unwatered = terrain_height


def terrain_height(x, z):
    return pond_carve(x, z, _terrain_height_unwatered(x, z))


WATER_COLOURS = {"water": 0x3c9dd0, "falls": 0x7cc6ea, "foam": 0xf4fbff}
SHORE = (0.40, 0.34, 0.22)
SHORE_REACH = 4.0   # the pond's water sheet runs this far past the outline, under the banks


def make_water_materials():
    return {
        "water": make_material("ValleyWater", WATER_COLOURS["water"], roughness=0.08, metallic=0.05),
        # Mid blue, not white: the game paints white streaks falling down it,
        # and white on white does not show.
        "falls": make_material("ValleyWaterfall", WATER_COLOURS["falls"], roughness=0.2, emission=0.25),
        "foam": make_material("ValleyFoam", WATER_COLOURS["foam"], roughness=0.6),
        "ripple": make_material("ValleyRipple", WATER_COLOURS["foam"], roughness=0.4),
    }


def shore_colour(x, z, colour, dug):
    """Wet sand on the pond's banks, where the ground was dug away."""
    if dug <= 0.05:
        return colour
    w = smoothstep(0.05, 0.8, dug)
    mixed = tuple(c + (s_ - c) * w for c, s_ in zip(colour[:3], SHORE))
    return mixed + tuple(colour[3:])


def build_meadow_road(scene, materials):
    """The road traced from the user's marks, laid exactly like the others.

    Returns (object, lamp sites). Its start sits on the ring road's centre
    line so build_road_junction can join it; its end runs into the east-pass
    turnaround.
    """
    spec = features().get("meadow_road")
    if not spec:
        return None, []
    ASPHALT, SHOULDER, WHITE = 0, 1, 2
    control = [(bl(x, z).x, bl(x, z).y) for x, z in spec["control"]]
    polyline = catmull_rom(control, False, 16)
    # Start where the ring's asphalt ends, not on its centre line: the stretch
    # inside the ring would lay this road's edge lines across the ring's lanes.
    ring = scene.objects.get("road_ring")
    if ring is not None:
        rail = road_rail(ring)
        off_ring = lambda p: min(math.hypot(p[0] - q.x, p[1] - q.y) for q in rail)
        while len(polyline) > 2 and off_ring(polyline[0]) < ROAD_ASPHALT_WIDTH * 0.5 + 0.2:
            polyline = polyline[1:]
    builder = MeshBuilder()
    add_ribbon(builder, polyline, ROAD_SHOULDER_WIDTH, 0.15, SHOULDER)
    add_ribbon(builder, polyline, ROAD_EDGING_WIDTH, 0.26, WHITE)
    add_ribbon(builder, polyline, ROAD_ASPHALT_WIDTH, 0.3, ASPHALT)
    DASH_LENGTH = 3.2
    for (dx, dy), heading in sample_along(polyline, DASH_SPACING):
        if math.dist((dx, dy), polyline[0]) < 14.0:
            continue                          # keep paint off the junction
        reach = DASH_LENGTH * 0.5
        ax, ay = math.cos(heading) * reach, math.sin(heading) * reach
        crown = lambda px, py: road_section(px, py, -math.sin(heading), math.cos(heading))[0]
        ahead, behind = crown(dx + ax, dy + ay), crown(dx - ax, dy - ay)
        ground = max(crown(dx, dy), (ahead + behind) * 0.5) - 0.02
        pitch = -math.atan2(ahead - behind, reach * 2.0)
        builder.add(*prim_box(DASH_LENGTH, 0.08, 0.45),
                    Matrix.Translation((dx, dy, ground + 0.4)) @ Matrix.Rotation(heading, 4, 'Z')
                    @ Matrix.Rotation(pitch, 4, 'Y'), WHITE)
    sites = []
    for index, ((lx, ly), heading) in enumerate(sample_along(polyline, LAMP_SPACING)):
        if index == 0:
            continue                          # the first lamp would stand in the junction
        side = 1.0 if index % 2 == 0 else -1.0
        ox, oy = -math.sin(heading) * side, math.cos(heading) * side
        pole = (lx + ox * LAMP_OFFSET, ly + oy * LAMP_OFFSET)
        sites.append({"road": spec["name"], "pole": pole, "bearing": math.atan2(-oy, -ox),
                      "ground": height_at_blender(*pole)})
    return builder.to_object(spec["name"], materials, scene), sites


def build_water_features(scene, rock_mat):
    """The waterfall cliff, its pool and spill channels, the falls, foam and
    ripples, and the pond's water.

    The cliff is built as stacked sandstone strata - each layer its own ring,
    stepped in or out from the one below, cut by a few vertical cracks - with
    an overhanging cap. The pool sits at the front of the top, and a channel
    for each fall is cut through the rim, so the water visibly leaves the pool,
    runs over the lip and drops as a curved sheet into the pond.

    Foam and ripples are one object per fall (water_foam_N / water_ripple_N_M,
    each with its origin at the splash) so the game can animate them.
    """
    spec = features().get("waterfall")
    pond = _pond_shape()
    mats = make_water_materials()
    objects = []
    if spec:
        ax, az = spec["axis"]
        fx, fz = spec["front"]
        cx, cz, base = spec["x"], spec["z"], spec["base"]
        H = spec["height"]
        hw, hd = spec["half_width"], spec["half_depth"]
        cap = spec["cap_width"] / hw
        level = (pond["level"] if pond else base) - base   # pond surface, rock-relative
        rand = make_random(0xc11ff)

        def at(u, v, h):
            """Rock-local width u, depth v (towards the pond), height h -> Blender point."""
            return bl(cx + ax * u + fx * v, cz + az * u + fz * v, base + h)

        profile = [(-3.0, 1.04), (0.0, 1.0), (6.0, 0.97), (12.0, 0.92), (18.0, 0.9), (22.0, 0.94),
                   (24.5, 1.08), (26.5, 1.22), (29.0, cap), (H, cap * 0.97)]

        def shape(h):
            for (h0, s0), (h1, s1) in zip(profile, profile[1:]):
                if h <= h1:
                    return s0 + (s1 - s0) * smoothstep(h0, h1, h)
            return profile[-1][1]

        cracks = [rand() * math.tau for _ in range(9)]

        def crack(a):
            d = min(abs((a - c + math.pi) % math.tau - math.pi) for c in cracks)
            return 1.0 - 0.08 * math.exp(-(d / 0.035) ** 2)

        SEGS = 96
        angles = [k / SEGS * math.tau for k in range(SEGS)]
        palette = [CLIFF_ROCK_A, CLIFF_ROCK_C, CLIFF_ROCK_B, mix(CLIFF_ROCK_A, CLIFF_ROCK_C, 0.5)]
        MOSS = (0.23, 0.36, 0.16)

        # layer heights: uneven strata, 1.6 - 3.2 m thick
        heights = [-3.0]
        while heights[-1] < H - 0.5:
            heights.append(min(H, heights[-1] + 1.6 + rand() * 1.6))
        heights[-1] = H

        # the falls' channels through the front rim
        channel_w = spec["falls_width"] * 0.55
        water_h = H - 0.45

        def in_channel(u, v):
            return v > 0 and any(abs(u - off) < channel_w for off in spec["falls"])

        verts, faces, cols = [], [], []

        def dip(a, h):
            """Strata are tilted beds, not flat rings: flat only at the foot and the top."""
            fade = smoothstep(-3.0, 3.0, h) * (1.0 - smoothstep(H - 5.0, H - 0.6, h))
            return 0.9 * math.sin(a + 0.8) * fade

        def ring(h, radii):
            first = len(verts)
            for a, r in zip(angles, radii):
                u, v = math.cos(a) * hw * r, math.sin(a) * hd * r
                hh = H - 0.9 if (h >= H - 0.01 and in_channel(u, v)) else h + dip(a, h)
                verts.append(tuple(at(u, v, hh)))
            return first

        # Vertical buttresses and gullies run through every layer, like a real
        # cliff face; each layer only adds a little wobble of its own.
        ridge = [fbm(math.cos(a) * 4.0, math.sin(a) * 4.0, 3, 911) for a in angles]
        layer_radii = []
        for i in range(len(heights) - 1):
            h0, h1 = heights[i], heights[i + 1]
            ledge_here = (i % 3 == 2) and h1 < 24.0
            jitter = 1.0 + (0.03 if ledge_here else 0.0) + (rand() - 0.5) * 0.012
            radii = []
            for k, a in enumerate(angles):
                wob = 1.0 + (fbm(math.cos(a) * 2.3 + i * 0.37, math.sin(a) * 2.3, 2, 900 + i) - 0.5) * 0.05
                buttress = 1.0 + (ridge[k] - 0.5) * 0.24
                radii.append(shape((h0 + h1) * 0.5) * jitter * wob * buttress * crack(a))
            layer_radii.append((h0, h1, radii))

        def add_band(h_bottom, r_bottom, h_top, r_top, colour, shade_bottom=0.75):
            """One wall of faces between two rings, coloured per vertex (own vertices, so layers stay crisp)."""
            b0 = ring(h_bottom, r_bottom)
            b1 = ring(h_top, r_top)
            for k in range(SEGS):
                j = (k + 1) % SEGS
                faces.append((b0 + k, b0 + j, b1 + j, b1 + k))
            for k in range(SEGS):
                g = (0.94 + rand() * 0.1) * (0.8 + 0.4 * ridge[k])
                cols.append(tuple(c * g * shade_bottom for c in colour))
            for k in range(SEGS):
                g = (0.94 + rand() * 0.1) * (0.8 + 0.4 * ridge[k])
                cols.append(tuple(c * g for c in colour))

        for i, (h0, h1, radii) in enumerate(layer_radii):
            colour = palette[i % len(palette)]
            add_band(h0, radii, h1, [r * 0.985 for r in radii], colour)
            if i + 1 < len(layer_radii):
                nxt = layer_radii[i + 1][2]
                ledge = mix(colour, (0.55, 0.47, 0.36), 0.35)
                if h1 > 20.0:
                    ledge = mix(ledge, MOSS, 0.55)
                add_band(h1, [r * 0.985 for r in radii], h1, nxt, ledge, shade_bottom=1.0)

        # top: rim -> grass -> pool edge -> pool floor
        top_r = [r * 0.985 for r in layer_radii[-1][2]]
        pool_u, pool_v = spec["pool_half_width"], 4.6
        front_rim = hd * min(r for a, r in zip(angles, top_r) if 1.2 < a < 1.95)
        pool_c = front_rim - 1.6 - pool_v
        pool_cu = sum(spec["falls"]) / len(spec["falls"])

        def pool_ring(factor, h):
            """A ring round the pool; in front of it, inside a channel, it drops to the channel bed."""
            first = len(verts)
            for a in angles:
                u = pool_cu + math.cos(a) * pool_u * factor
                v = pool_c + math.sin(a) * pool_v * factor
                hh = H - 0.9 if (factor >= 1.0 and math.sin(a) > 0.2 and in_channel(u, v)) else h
                verts.append(tuple(at(u, v, hh)))
            return first

        rim = ring(H, top_r)
        cols.extend([MOSS] * SEGS)
        grass = pool_ring(1.25, H)
        cols.extend([GRASS_MID] * SEGS)
        edge = pool_ring(1.0, H - 0.05)
        cols.extend([GRASS_LOW] * SEGS)
        bed = pool_ring(0.9, H - 1.2)
        cols.extend([SCREE] * SEGS)
        for r0, r1 in ((rim, grass), (grass, edge), (edge, bed)):
            for k in range(SEGS):
                j = (k + 1) % SEGS
                faces.append((r0 + k, r0 + j, r1 + j, r1 + k))
        centre = len(verts)
        verts.append(tuple(at(pool_cu, pool_c, H - 1.2)))
        cols.append(SCREE)
        for k in range(SEGS):
            faces.append((bed + k, bed + (k + 1) % SEGS, centre))

        mesh = bpy.data.meshes.new("waterfall_rock")
        mesh.from_pydata(verts, [], faces)
        mesh.update()
        layer = mesh.color_attributes.new(name="Col", type='FLOAT_COLOR', domain='POINT')
        for i, c in enumerate(cols):
            layer.data[i].color = tuple(c) + (1.0,)
        for poly in mesh.polygons:
            poly.use_smooth = False           # faceted, like the butte's rock
        mesh.materials.append(rock_mat)
        rock = bpy.data.objects.new("waterfall_rock", mesh)
        scene.collection.objects.link(rock)
        objects.append(rock)

        # boulders fallen at the foot, in and out of the water
        boulders = MeshBuilder()
        for k in range(26):
            a = rand() * math.tau
            r = 1.0 + rand() * 0.25
            u, v = math.cos(a) * hw * r, math.sin(a) * hd * r
            size = 0.8 + rand() * 2.2
            boulders.add(*prim_icosahedron(size),
                         Matrix.Translation(tuple(at(u, v, level + size * 0.2 if v > 0 else size * 0.3)))
                         @ Matrix.Rotation(rand() * math.pi, 4, 'Z')
                         @ Matrix.Diagonal((1.0 + rand() * 0.5, 1.0, 0.55 + rand() * 0.3, 1.0)), 0)
        stone = make_material("ValleyBoulder", 0x7d6a55, roughness=0.9)
        boulder_obj = boulders.to_object("waterfall_boulders", [stone], scene)
        objects.append(boulder_obj)

        # pool surface, joined to a channel of water running out to each lip
        b = MeshBuilder()
        pool_pts = [at(pool_cu + math.cos(a) * pool_u * 1.02, pool_c + math.sin(a) * pool_v * 1.02, water_h) for a in angles]
        b.add([tuple(q) for q in pool_pts] + [tuple(at(pool_cu, pool_c, water_h))],
              [(k, (k + 1) % SEGS, SEGS) for k in range(SEGS)], None, 0)
        lips = []
        for off in spec["falls"]:
            lip_v = hd * max(top_r[k] for k, a in enumerate(angles)
                             if abs(math.cos(a) * hw * top_r[k] - off) < channel_w and math.sin(a) > 0)
            lips.append(lip_v)
            # start at the pool's own edge, so the two surfaces never overlap and flicker
            across = max(0.0, 1.0 - ((off - pool_cu) / (pool_u * 1.02)) ** 2)
            v0 = pool_c + pool_v * 1.02 * math.sqrt(across) - 0.3
            quad = [at(off - channel_w * 0.9, v0, water_h), at(off + channel_w * 0.9, v0, water_h),
                    at(off + channel_w * 0.9, lip_v + 0.3, water_h), at(off - channel_w * 0.9, lip_v + 0.3, water_h)]
            b.add([tuple(q) for q in quad], [(0, 1, 2, 3)], None, 0)
        objects.append(b.to_object("water_pool", [mats["water"]], scene))

        # the falls: curved, thick sheets that arc out from the lip and widen as they drop
        falls = MeshBuilder()
        drop = water_h - level
        rows, cols_n = 40, 8
        for off, lip_v in zip(spec["falls"], lips):
            half0 = channel_w * 0.85
            for back in (0.0, 0.3):
                grid = []
                for j in range(rows + 1):
                    t = j / rows
                    d = drop * t
                    out = 1.1 * math.sqrt(d) + 0.3
                    half = half0 * (1.0 + 0.8 * t)
                    row = []
                    for i in range(cols_n + 1):
                        a = i / cols_n * 2.0 - 1.0
                        bulge = 0.22 * (1.0 - a * a)
                        row.append(tuple(at(off + a * half, lip_v + out + bulge - back, water_h - d)))
                    grid.append(row)
                vs = [p for row in grid for p in row]
                fs = []
                for j in range(rows):
                    for i in range(cols_n):
                        a0 = j * (cols_n + 1) + i
                        f = (a0, a0 + 1, a0 + cols_n + 2, a0 + cols_n + 1)
                        fs.append(f if back == 0.0 else tuple(reversed(f)))
                falls.add(vs, fs, None, 0)
        objects.append(falls.to_object("water_falls", [mats["falls"]], scene))

        # foam and ripples: one object per splash, origin at the splash
        for n, (off, lip_v) in enumerate(zip(spec["falls"], lips)):
            splash = at(off, lip_v + 1.1 * math.sqrt(drop) + 0.3 + 0.3, level)
            foam = MeshBuilder()
            for k in range(11):
                r = 0.8 + rand() * 1.6
                foam.add(*prim_icosahedron(r),
                         Matrix.Translation(((rand() - 0.5) * 5.0, (rand() - 0.5) * 3.6, 0.15))
                         @ Matrix.Diagonal((1.0, 1.0, 0.45, 1.0)), 0)
            obj = foam.to_object("water_foam_%d" % n, [mats["foam"]], scene)
            obj.location = splash
            objects.append(obj)
            for m in range(3):
                ring_b = MeshBuilder()
                inner, outer = 0.82, 1.0
                vs, fs = [], []
                for k in range(40):
                    a = k / 40 * math.tau
                    vs += [(math.cos(a) * inner, math.sin(a) * inner, 0.0), (math.cos(a) * outer, math.sin(a) * outer, 0.0)]
                for k in range(40):
                    a0, a1 = 2 * k, 2 * ((k + 1) % 40)
                    fs.append((a0, a1, a1 + 1, a0 + 1))
                ring_b.add(vs, fs, None, 0)
                ripple = ring_b.to_object("water_ripple_%d_%d" % (n, m), [mats["ripple"]], scene)
                # a hair apart, so each ring gets its own phase from its position
                ripple.location = splash + Vector((m * 0.37, m * 0.23, 0.05 + m * 0.01))
                objects.append(ripple)

    if pond:
        x0, z0, x1, z1 = (v + d for v, d in zip(pond["bbox"], (-SHORE_REACH, -SHORE_REACH, SHORE_REACH, SHORE_REACH)))
        island = pond["island"]
        step = 0.75                           # fine enough that the shoreline does not stair-step
        b = MeshBuilder()
        vs, fs = [], []
        z = z0
        while z < z1:
            x = x0
            while x < x1:
                mx, mz = x + step / 2, z + step / 2
                # Past the outline too, by a few metres: where the bank is higher
                # the water stays hidden under it, and where the dug bank dips
                # the water fills it - so the shore follows the ground, not a grid.
                if (_inside(pond["outline"], mx, mz) or _edge_distance(pond["outline"], mx, mz) < SHORE_REACH)                         and _island_distance(island, mx, mz) > -2.0:
                    base_i = len(vs)
                    for px, pz in ((x, z), (x + step, z), (x + step, z + step), (x, z + step)):
                        vs.append(tuple(bl(px, pz, pond["level"])))
                    fs.append((base_i, base_i + 1, base_i + 2, base_i + 3))
                x += step
            z += step
        b.add(vs, fs, None, 0)
        objects.append(b.to_object("water_pond", [mats["water"]], scene))

        # Shore band: the terrain's vertices are ~4 m apart, so the line where
        # the water meets it zig-zags across its triangles. Find that line on the
        # actual terrain mesh all round the outline and lay a smooth strip of
        # wet sand over it.
        from mathutils.bvhtree import BVHTree
        terrain = scene.objects["terrain"]
        tb = BVHTree.FromPolygons([terrain.matrix_world @ v.co for v in terrain.data.vertices],
                                  [list(q.vertices) for q in terrain.data.polygons])

        def ground(x, z):
            hit = tb.ray_cast(Vector((x, -z, 1000.0)), Vector((0.0, 0.0, -1.0)))
            return hit[0].z if hit[0] is not None else pond["level"]

        outline = pond["outline"]
        ring_pts = []
        for (ax_, az_), (bx_, bz_) in zip(outline, outline[1:] + outline[:1]):
            seg = math.hypot(bx_ - ax_, bz_ - az_)
            for k in range(max(1, int(seg / 1.0))):
                t = k / max(1, int(seg / 1.0))
                ring_pts.append((ax_ + (bx_ - ax_) * t, az_ + (bz_ - az_) * t))
        cx_ = sum(p[0] for p in ring_pts) / len(ring_pts)
        cz_ = sum(p[1] for p in ring_pts) / len(ring_pts)
        band = []
        n_pts = len(ring_pts)
        for i, (px_, pz_) in enumerate(ring_pts):
            qx, qz = ring_pts[(i + 1) % n_pts]
            rx, rz = ring_pts[i - 1]
            tx_, tz_ = qx - rx, qz - rz
            ln = math.hypot(tx_, tz_) or 1.0
            nx_, nz_ = -tz_ / ln, tx_ / ln
            if _inside(outline, px_ + nx_ * 0.5, pz_ + nz_ * 0.5) is False:
                nx_, nz_ = -nx_, -nz_                 # point the normal into the pond
            d = 0.0
            while d < 10.0 and ground(px_ + nx_ * d, pz_ + nz_ * d) > pond["level"]:
                d += 0.1
            band.append((px_, pz_, nx_, nz_, d))
        # smooth the waterline distance so the band's own edge is a clean curve
        smooth = [sum(band[(i + k) % n_pts][4] for k in range(-3, 4)) / 7.0 for i in range(n_pts)]
        across = (-1.6, -0.6, 0.4, 1.3)             # metres from the waterline, outward is negative
        sverts, sfaces = [], []
        for i, (px_, pz_, nx_, nz_, _d) in enumerate(band):
            for a in across:
                dd = max(-0.8, smooth[i] + a)
                x_, z_ = px_ + nx_ * dd, pz_ + nz_ * dd
                sverts.append(tuple(bl(x_, z_, max(ground(x_, z_), pond["level"]) + 0.1)))
        cols_n = len(across)
        for i in range(n_pts):
            j = (i + 1) % n_pts
            for k in range(cols_n - 1):
                a0, b0 = i * cols_n + k, j * cols_n + k
                sfaces.append((a0, b0, b0 + 1, a0 + 1))
        shore_mat = make_material("ValleyShore", 0x9b8a64, roughness=0.95)
        sb = MeshBuilder()
        sb.add(sverts, sfaces, None, 0)
        objects.append(sb.to_object("water_shore", [shore_mat], scene))
    return objects


# ============================================================================
# ROAD JUNCTIONS - a real T where a spur road meets the ring road
# ============================================================================
#
# A spur starts on the ring road's centre line, so without this the ring's
# gravel shoulder and white edge line run straight across the spur's mouth and
# the two roads read as not joined. The junction is a draped asphalt patch
# over that mouth, with rounded kerb corners, the edge lines carried round the
# corners and a give-way line across the spur. It sits a few centimetres above
# both road surfaces, sampled from the road meshes themselves.

JUNCTION_FILLET = 6.0      # kerb corner radius
JUNCTION_LIFT = 0.1        # above the higher road bed it covers


def road_rail(road_obj):
    """Centre line of a road ribbon, in Blender XY, from its shoulder vertex pairs."""
    verts = [road_obj.matrix_world @ v.co for v in road_obj.data.vertices]
    rail = []
    for i in range(0, len(verts) - 1, 2):
        a, b = verts[i], verts[i + 1]
        if abs(math.hypot(a.x - b.x, a.y - b.y) - ROAD_SHOULDER_WIDTH) > 0.2:
            break
        rail.append(Vector(((a.x + b.x) * 0.5, (a.y + b.y) * 0.5)))
    return rail


def build_road_junction(scene, main_obj, spur_obj, name, asphalt_mat, white_mat, avoid=()):
    """Joins the start of `spur_obj` onto `main_obj` with a proper T junction."""
    from mathutils.bvhtree import BVHTree

    def bvh_of(objs):
        vs, ps = [], []
        for o in objs:
            base = len(vs)
            vs += [o.matrix_world @ v.co for v in o.data.vertices]
            ps += [[base + i for i in poly.vertices] for poly in o.data.polygons]
        return BVHTree.FromPolygons(vs, ps) if ps else None

    for view_layer in scene.view_layers:
        view_layer.update()
    roads = bvh_of([main_obj, spur_obj])
    ground = bvh_of([scene.objects["terrain"]])
    blockers = bvh_of([o for o in avoid if o is not None and o.type == 'MESH'])
    down = Vector((0.0, 0.0, -1.0))

    spur = road_rail(spur_obj)
    main = road_rail(main_obj)

    def bed_table(rail, indices):
        """Road bed (centre height, cross slope, across-normal) at rail points, as the ribbons use."""
        table = []
        for i in indices:
            a, b = rail[max(0, i - 1)], rail[min(len(rail) - 1, i + 1)]
            d = (b - a).normalized()
            u = Vector((-d.y, d.x))
            centre, slope = road_section(rail[i].x, rail[i].y, u.x, u.y)
            table.append((rail[i], u, centre, slope))
        return table

    def bed_at(table, p):
        """The road's asphalt plane under p, extended past its edges."""
        best = None
        for (a, ua, ca, sa), (b, ub, cb, sb) in zip(table, table[1:]):
            ab = b - a
            t = max(0.0, min(1.0, (p - a).dot(ab) / max(ab.length_squared, 1e-9)))
            foot = a + ab * t
            dist = (p - foot).length
            if best is None or dist < best[0]:
                u = (ua * (1 - t) + ub * t).normalized()
                best = (dist, ca + (cb - ca) * t + (sa + (sb - sa) * t) * u.dot(p - foot))
        return best[1] + 0.3

    def surface(p):
        # Above BOTH road beds everywhere. Each bed is a flat cross-section
        # lifted clear of the ground (road_section), so neither the terrain nor
        # a single sampled layer is a safe height: take the higher bed, which is
        # continuous, and lift it. Over the grass corners the beds carry on.
        return max(bed_at(main_bed, p), bed_at(spur_bed, p)) + JUNCTION_LIFT
    start = spur[0]
    e = (spur[min(8, len(spur) - 1)] - start).normalized()
    k = min(range(len(main)), key=lambda i: (main[i] - start).length)
    main_bed = bed_table(main, [(k + j) % len(main) for j in range(-40, 41)])
    spur_bed = bed_table(spur, range(0, min(len(spur), 40)))
    t = (main[(k + 1) % len(main)] - main[k - 1]).normalized()
    n = Vector((-t.y, t.x))
    if n.dot(e) < 0:
        n = -n
    origin = main[k] + t * t.dot(start - main[k])
    q = Vector((-e.y, e.x))

    shoulder = ROAD_SHOULDER_WIDTH * 0.5
    lane = ROAD_ASPHALT_WIDTH * 0.5
    inside = lane - 0.6                         # patch reaches just inside the ring asphalt

    def solve(dn, dq):
        """Point with n.(P - origin) = dn and q.(P - origin) = dq."""
        det = n.x * q.y - n.y * q.x
        return origin + Vector(((dn * q.y - dq * n.y) / det, (n.x * dq - q.x * dn) / det))

    corners = {}
    report = {}
    for side in (1.0, -1.0):
        radius = JUNCTION_FILLET
        # Shrink a corner that would run under a building.
        while radius > 2.0:
            c = solve(shoulder + radius, side * (lane + radius))
            probe = [c - n * radius * 0.7 - q * side * radius * 0.7, c - n * radius, c - q * side * radius]
            if blockers is None or all(blockers.ray_cast(Vector((p.x, p.y, 1000.0)), down)[0] is None for p in probe):
                break
            radius -= 1.0
        c = solve(shoulder + radius, side * (lane + radius))
        t1, t2 = c - n * radius, c - q * side * radius
        a1 = math.atan2((t1 - c).y, (t1 - c).x)
        a2 = math.atan2((t2 - c).y, (t2 - c).x)
        sweep = (a2 - a1 + math.pi) % math.tau - math.pi
        arc = [c + Vector((math.cos(a1 + sweep * i / 12), math.sin(a1 + sweep * i / 12))) * radius for i in range(13)]
        corners[side] = (t1 - n * (shoulder - inside), arc, c, radius)
        report["fillet_" + ("left" if side > 0 else "right")] = radius

    lp, larc, _, _ = corners[1.0]
    rp, rarc, _, _ = corners[-1.0]
    outline = [lp] + larc + list(reversed(rarc)) + [rp]
    hub = origin + n * shoulder

    verts, faces = [], []

    def tri(a, b, c, depth=3):
        if depth == 0:
            base = len(verts)
            verts.extend([(a.x, a.y, surface(a)), (b.x, b.y, surface(b)), (c.x, c.y, surface(c))])
            faces.append((base, base + 1, base + 2))
            return
        ab, bc, ca = (a + b) / 2, (b + c) / 2, (c + a) / 2
        for x, y, z in ((a, ab, ca), (ab, b, bc), (ca, bc, c), (ab, bc, ca)):
            tri(x, y, z, depth - 1)

    for i in range(len(outline)):
        a, b = outline[i], outline[(i + 1) % len(outline)]
        if (b - a).length > 1e-4:
            tri(hub, a, b)

    builder = MeshBuilder()
    builder.add(verts, faces, None, 0)

    def strip(points, width):
        """A thin painted line along a polyline, draped just above the patch."""
        for a, b in zip(points, points[1:]):
            d = (b - a)
            if d.length < 1e-4:
                continue
            side_v = Vector((-d.y, d.x)).normalized() * width * 0.5
            quad = [a - side_v, b - side_v, b + side_v, a + side_v]
            builder.add([(p.x, p.y, surface(p) + 0.02) for p in quad], [(0, 1, 2, 3)], None, 1)

    for side in (1.0, -1.0):
        _, arc, c, radius = corners[side]
        strip([c + (p - c).normalized() * (radius + 0.45) for p in arc], 0.26)
    # Oblique spur: push the line out until its nearer end also clears the shoulder.
    stop = shoulder + 1.4 + lane * abs(q.dot(n))
    along = stop / n.dot(e)
    for i in range(7):
        centre = origin + e * along + q * (-3.6 + i * 1.2)
        strip([centre - q * 0.4, centre + q * 0.4], 0.32)

    obj = builder.to_object(name, [asphalt_mat, white_mat], scene)
    report.update({"object": name, "faces": len(builder.faces),
                   "spur_angle_deg": round(math.degrees(math.acos(max(-1, min(1, n.dot(e))))), 1)})
    return obj, report


# ============================================================================
# LICENSE CENTER - the academy venue as a campus instead of a colosseum
# ============================================================================
#
# Layout is in the venue's own frame: X east, N north (away from the camera),
# metres from the venue marker. It was fitted to the ground as it stands: the
# east-pass road cuts diagonally south of the marker (north edge N = 0.6 X -
# 4.8), the ring road runs down X ~ +22, and the ground rises from N ~ +16 in
# the west. Nothing here moves a road, a lamp, a tree or the terrain - each
# part only reads the ground under its own footprint and stands on it.

LICENSE_CENTER_VENUE = "academy"
LICENSE_PREFIX = "license_"
LICENSE_PARTS = ("main_hall", "heli_building", "garage", "plaza", "parking", "cone_course", "watch_tower")


def license_part_transforms(scene):
    """Where the License Center parts stand now, so a rebuild can keep them there."""
    return {o.name: (o.location.copy(), o.rotation_euler.copy())
            for o in scene.objects if o.name.startswith(LICENSE_PREFIX)}
LICENSE_COLOURS = {
    "white": 0xeef1f4, "concrete": 0xc2c7ce, "plaza": 0xc9ced5, "frame": 0x5a6270,
    "glass": 0x3f7394, "window": 0x9fe8ff, "solar": 0x2c4a73, "cone": 0xf2711c,
    "car_0": 0xe8ecef, "car_1": 0xd8342c, "car_2": 0x2f7fd6, "car_3": 0xb8bec6,
    "car_4": 0xf2c230, "car_5": 0x2fb89a, "planting": 0x4f8f3e,
}
# The window material is re-lit by the game at dusk (components/objects/CareerValley.ts).
LICENSE_WINDOW_MATERIAL = "LicenseWindow"


def make_license_materials():
    mats = {}
    for name, colour in LICENSE_COLOURS.items():
        if name == "window":
            mats[name] = make_material(LICENSE_WINDOW_MATERIAL, colour, roughness=0.2, emission=0.6)
        elif name == "glass":
            mats[name] = make_material("LicenseGlass", colour, roughness=0.12, metallic=0.1)
        else:
            mats[name] = make_material("License_" + name, colour,
                                       roughness=0.35 if name.startswith("car") else 0.8)
    return mats


def prim_lathe(profile, segments):
    """Surface of revolution round Z from a list of (radius, z)."""
    verts, faces = [], []
    for radius, z in profile:
        for i in range(segments):
            a = i / segments * math.tau
            verts.append((math.cos(a) * radius, math.sin(a) * radius, z))
    for ring in range(len(profile) - 1):
        for i in range(segments):
            j = (i + 1) % segments
            a0, a1 = ring * segments + i, ring * segments + j
            faces.append((a0, a1, a1 + segments, a0 + segments))
    return verts, faces


def prim_prism(polygon, z0, z1):
    """A flat-topped slab from a 2D polygon (any winding)."""
    area = sum(polygon[i][0] * polygon[(i + 1) % len(polygon)][1]
               - polygon[(i + 1) % len(polygon)][0] * polygon[i][1] for i in range(len(polygon)))
    if area < 0:
        polygon = list(reversed(polygon))
    n = len(polygon)
    verts = [(x, y, z0) for x, y in polygon] + [(x, y, z1) for x, y in polygon]
    faces = [tuple(range(n, 2 * n))]
    for i in range(n):
        j = (i + 1) % n
        faces.append((i, j, n + j, n + i))
    return verts, faces


def clip_polygon(polygon, keep):
    """Sutherland-Hodgman against one half-plane: keep(x, y) -> signed distance."""
    out = []
    for i in range(len(polygon)):
        a, b = polygon[i], polygon[(i + 1) % len(polygon)]
        da, db = keep(*a), keep(*b)
        if da >= 0:
            out.append(a)
        if (da >= 0) != (db >= 0):
            t = da / (da - db)
            out.append((a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t))
    return out


def build_license_center(scene, venue, arena_mats, theme_mat, keep=None):
    """The academy's License Center campus, as separate part objects.

    Each part - main hall, heli building, garage, plaza, parking, cone course,
    watch tower - is its own object with its origin on its own floor, so it can be
    moved or turned by hand in Blender. `keep` maps a part name to the
    (location, rotation) it should take instead of the default, which is how
    hand placement survives a rebuild.
    """
    from mathutils.bvhtree import BVHTree

    L = make_license_materials()
    slots = [L[k] for k in LICENSE_COLOURS] + [theme_mat, arena_mats[4], arena_mats[3]]
    idx = {k: i for i, k in enumerate(LICENSE_COLOURS)}
    idx["theme"], idx["asphalt"], idx["black"] = len(LICENSE_COLOURS), len(LICENSE_COLOURS) + 1, len(LICENSE_COLOURS) + 2
    parts = {name: MeshBuilder() for name in LICENSE_PARTS}
    cur = {"b": None}

    def use(name):
        cur["b"] = parts[name]

    vx, vz = venue["x"], venue["z"]
    h0 = terrain_height(vx, vz)

    terrain = scene.objects["terrain"]
    tv = [terrain.matrix_world @ v.co for v in terrain.data.vertices]
    ground_bvh = BVHTree.FromPolygons(tv, [list(p.vertices) for p in terrain.data.polygons])

    def ground(X, N):
        """Terrain height under a local point, relative to the venue base."""
        hit = ground_bvh.ray_cast(Vector((vx + X, -vz + N, 1000.0)), Vector((0, 0, -1)))
        return (hit[0].z if hit[0] is not None else h0) - h0

    def span(points):
        hs = [ground(x, y) for x, y in points]
        return min(hs), max(hs)

    def circle_pts(cx, cy, r, n=24):
        return [(cx + math.cos(i / n * math.tau) * r, cy + math.sin(i / n * math.tau) * r) for i in range(n)]

    def box(cx, cy, cz, sx, sy, sz, mat, rot=0.0):
        cur["b"].add(*prim_box(sx, sz, sy),
              Matrix.Translation((cx, cy, cz)) @ Matrix.Rotation(rot, 4, 'Z'), idx[mat])

    def cyl(cx, cy, z0, z1, r0, r1, mat, segs=32, caps=True):
        cur["b"].add(*prim_cylinder(r0, r1, z1 - z0, segs, caps),
              Matrix.Translation((cx, cy, (z0 + z1) * 0.5)), idx[mat])

    def lathe(cx, cy, profile, mat, segs=40):
        cur["b"].add(*prim_lathe(profile, segs), Matrix.Translation((cx, cy, 0)), idx[mat])

    def prism(poly, z0, z1, mat):
        cur["b"].add(*prim_prism(poly, z0, z1), None, idx[mat])

    def beam(a, b, width, mat):
        """A square bar from 3D point a to b."""
        va, vb = Vector(a), Vector(b)
        d = vb - va
        rot = d.to_track_quat('X', 'Z').to_matrix().to_4x4()
        cur["b"].add(*prim_box(d.length, width, width),
              Matrix.Translation((va + vb) * 0.5) @ rot, idx[mat])

    def slab_under(poly, top, mat):
        """A ground slab whose top sits at `top`, sunk far enough to never float."""
        lo, _ = span(poly)
        prism(poly, min(lo, top) - 0.6, top, mat)

    report = {}

    # ------------------------------------------------------------ main hall
    use("main_hall")
    PX, PY = -3.0, 11.0
    f = ground(PX, PY - 9.0)                       # floor meets the plaza at the door
    lo, hi = span(circle_pts(PX, PY, 12.2))
    report["pavilion_ground"] = (round(lo, 2), round(hi, 2), round(f, 2))

    cyl(PX, PY, min(lo, f) - 1.2, f + 0.35, 12.6, 12.2, "concrete", 48)
    cyl(PX, PY, f + 0.35, f + 3.95, 9.0, 9.0, "glass", 48, caps=False)
    for i in range(24):
        a = i / 24 * math.tau
        box(PX + math.cos(a) * 9.05, PY + math.sin(a) * 9.05, f + 2.15, 0.2, 0.2, 3.6, "frame", a)
    cyl(PX, PY, f + 3.95, f + 4.4, 10.4, 10.4, "white", 48)
    cyl(PX, PY, f + 4.1, f + 4.26, 10.43, 10.43, "theme", 48, caps=False)
    cyl(PX, PY, f + 4.4, f + 7.4, 9.6, 9.9, "window", 48, caps=False)
    for i in range(32):
        a = (i + 0.5) / 32 * math.tau
        box(PX + math.cos(a) * 9.8, PY + math.sin(a) * 9.8, f + 5.9, 0.16, 0.16, 3.0, "frame", a)
    cyl(PX, PY, f + 5.3, f + 5.42, 10.28, 10.28, "white", 48, caps=False)
    for i in range(12):
        a = (i + 0.5) / 12 * math.tau
        cyl(PX + math.cos(a) * 11.0, PY + math.sin(a) * 11.0, f + 0.35, f + 7.4, 0.22, 0.2, "white", 8)
    cyl(PX, PY, f + 7.4, f + 8.1, 11.2, 11.6, "white", 56)
    cyl(PX, PY, f + 7.66, f + 7.86, 11.63, 11.63, "theme", 56, caps=False)

    dome = [(10.6, 8.1), (9.8, 8.9), (8.4, 9.6), (6.4, 10.2), (4.2, 10.6), (3.0, 10.75)]
    lathe(PX, PY, [(r, f + z) for r, z in dome], "white", 48)
    lathe(PX, PY, [(3.0, f + 10.75), (2.2, f + 11.3), (1.0, f + 11.6), (0.0, f + 11.65)], "glass", 32)
    cyl(PX, PY, f + 10.72, f + 10.9, 3.1, 3.1, "theme", 32, caps=False)
    for i in range(16):
        a = i / 16 * math.tau
        ca, sa = math.cos(a), math.sin(a)
        for (r0, z0), (r1, z1) in zip(dome, dome[1:]):
            beam((PX + ca * (r0 + 0.08), PY + sa * (r0 + 0.08), f + z0 + 0.1),
                 (PX + ca * (r1 + 0.08), PY + sa * (r1 + 0.08), f + z1 + 0.1), 0.22, "frame")

    # entrance canopy and doors, facing the camera (-N)
    front = PY - 9.0
    box(PX, front - 1.75, f + 3.75, 8.4, 4.5, 0.35, "white")
    box(PX, front - 4.0, f + 3.75, 8.4, 0.16, 0.3, "theme")
    for side in (-3.5, 3.5):
        cyl(PX + side, front - 3.6, f + 0.35, f + 3.58, 0.2, 0.2, "white", 10)
    box(PX, front - 0.05, f + 1.75, 3.6, 0.4, 2.8, "frame")
    box(PX, front - 0.3, f + 1.7, 3.1, 0.2, 2.4, "glass")
    box(PX, front - 2.2, f + 0.2, 7.0, 3.0, 0.3, "concrete")

    # hovering holographic license badge
    cyl(PX, PY, f + 11.6, f + 13.3, 0.35, 0.28, "theme", 12)
    bz, br = f + 14.6, 1.7
    hexagon = [(math.cos(math.pi / 6 + i * math.pi / 3) * br, math.sin(math.pi / 6 + i * math.pi / 3) * br)
               for i in range(6)]
    for i in range(6):
        (ax, az), (cx_, cz_) = hexagon[i], hexagon[(i + 1) % 6]
        beam((PX + ax, PY, bz + az), (PX + cx_, PY, bz + cz_), 0.26, "theme")
    cur["b"].add(*prim_prism([(x * 0.78, z * 0.78) for x, z in hexagon], -0.06, 0.06),
          Matrix.Translation((PX, PY, bz)) @ Matrix.Rotation(math.pi / 2, 4, 'X'), idx["white"])
    beam((PX - 0.7, PY - 0.1, bz + 0.1), (PX, PY - 0.1, bz - 0.6), 0.22, "theme")
    beam((PX, PY - 0.1, bz - 0.6), (PX + 0.9, PY - 0.1, bz + 0.6), 0.22, "theme")

    # ------------------------------------------------------------ heli building
    use("heli_building")
    AXc, ANc = 14.0, 16.0                          # rotunda centre; block runs north
    fa = ground(AXc, ANc - 4.5)
    footprint = [(9.5, 16.0), (18.5, 16.0), (18.5, 26.5), (9.5, 26.5)]
    lo, hi = span(footprint + circle_pts(AXc, ANc, 4.8))
    report["annex_ground"] = (round(lo, 2), round(hi, 2), round(fa, 2))
    prism(footprint, min(lo, fa) - 1.0, fa + 0.3, "concrete")
    cyl(AXc, ANc, min(lo, fa) - 1.0, fa + 0.3, 4.8, 4.8, "concrete", 36)
    for z0, z1, mat, grow in ((0.3, 3.3, "glass", 0.0), (3.3, 3.8, "white", 0.3),
                              (3.8, 6.8, "window", 0.0), (6.8, 7.4, "white", 0.45)):
        box(AXc, 21.25, fa + (z0 + z1) * 0.5, 8.6 + grow * 2, 10.5 + grow, z1 - z0, mat)
        cyl(AXc, ANc, fa + z0, fa + z1, 4.3 + grow, 4.3 + grow, mat, 36, caps=(mat == "white"))
    cyl(AXc, ANc, fa + 7.02, fa + 7.18, 4.77, 4.77, "theme", 36, caps=False)
    box(AXc, 21.25, fa + 7.1, 9.62, 11.07, 0.14, "theme")
    for i in range(8):                            # vertical sun fins
        n = 17.0 + i * 1.3
        for x in (9.45, 18.55):
            box(x, n, fa + 3.6, 0.5, 0.14, 6.6, "white")
    for x0, x1, y0, y1 in ((9.3, 18.7, 26.35, 26.6), (9.3, 9.55, 16.0, 26.6), (18.45, 18.7, 16.0, 26.6)):
        box((x0 + x1) / 2, (y0 + y1) / 2, fa + 7.85, x1 - x0, y1 - y0, 0.9, "white")
    cyl(AXc, 22.3, fa + 7.4, fa + 7.5, 3.3, 3.3, "frame", 32)
    cyl(AXc, 22.3, fa + 7.5, fa + 7.56, 3.05, 3.05, "theme", 32, caps=False)
    for bx, by, sx, sy in ((AXc - 0.9, 22.3, 0.35, 2.4), (AXc + 0.9, 22.3, 0.35, 2.4), (AXc, 22.3, 1.5, 0.35)):
        box(bx, by, fa + 7.55, sx, sy, 0.04, "white")
    for x in (11.0, 17.0):
        box(x, 17.6, fa + 7.9, 1.6, 1.5, 1.0, "concrete")
        box(x, 17.6, fa + 8.42, 1.3, 1.2, 0.05, "frame")

    # glass skybridge, pavilion upper floor to the rotunda
    ux, uy = AXc - PX, ANc - PY
    ul = math.hypot(ux, uy)
    ux, uy = ux / ul, uy / ul
    sx_, sy_ = PX + ux * 9.4, PY + uy * 9.4
    ex_, ey_ = AXc - ux * 4.1, ANc - uy * 4.1
    ang = math.atan2(uy, ux)
    blen = math.hypot(ex_ - sx_, ey_ - sy_) + 0.8
    mx, my = (sx_ + ex_) / 2, (sy_ + ey_) / 2
    zb = f + 4.4
    box(mx, my, zb + 1.3, blen, 2.2, 2.4, "glass", ang)
    box(mx, my, zb + 0.05, blen, 2.6, 0.3, "white", ang)
    box(mx, my, zb + 2.6, blen, 2.6, 0.25, "white", ang)
    box(mx, my, zb + 2.6, blen, 0.2, 0.3, "theme", ang)

    # ------------------------------------------------------------ garage
    use("garage")
    HX, HN0, HN1, HW = -24.0, -5.0, 11.0, 6.0
    fh = ground(HX, HN0)
    hangar = [(HX - HW - 0.5, HN0 - 0.5), (HX + HW + 0.5, HN0 - 0.5),
              (HX + HW + 0.5, HN1 + 0.5), (HX - HW - 0.5, HN1 + 0.5)]
    lo, hi = span(hangar)
    report["hangar_ground"] = (round(lo, 2), round(hi, 2), round(fh, 2))
    prism(hangar, min(lo, fh) - 1.0, fh + 0.3, "concrete")
    for x in (HX - HW + 0.2, HX + HW - 0.2):
        box(x, (HN0 + HN1) / 2, fh + 1.3, 0.4, HN1 - HN0, 2.0, "white")
    arc = [(math.cos(math.pi * k / 12) * HW, fh + 2.3 + math.sin(math.pi * k / 12) * 4.0) for k in range(13)]
    vv, ff, mi = [], [], []
    for k in range(12):
        (x0, z0), (x1, z1) = arc[k], arc[k + 1]
        base = len(vv)
        vv += [(HX + x0, HN0, z0), (HX + x1, HN0, z1), (HX + x1, HN1, z1), (HX + x0, HN1, z0)]
        ff.append((base, base + 1, base + 2, base + 3))
        cur["b"].add([vv[base], vv[base + 1], vv[base + 2], vv[base + 3]], [(0, 1, 2, 3)], None,
              idx["window"] if k in (5, 6) else idx["white"])
    for n in (HN0 + 0.2, HN0 + 5.4, HN0 + 10.6, HN1 - 0.2):
        for (x0, z0), (x1, z1) in zip(arc, arc[1:]):
            beam((HX + x0 * 1.02, n, z0 + 0.06), (HX + x1 * 1.02, n, z1 + 0.06), 0.24, "frame")
    for n, mat in ((HN0, "glass"), (HN1, "white")):
        fan = [(HX, n, fh + 2.3)] + [(HX + x, n, z) for x, z in arc] + [(HX - HW, n, fh + 0.3), (HX + HW, n, fh + 0.3)]
        faces = [(0, k + 1, k + 2) for k in range(12)]
        cur["b"].add(fan, faces, None, idx[mat])
        cur["b"].add([(HX - HW, n, fh + 0.3), (HX + HW, n, fh + 0.3), (HX + HW, n, fh + 2.3), (HX - HW, n, fh + 2.3)],
              [(0, 1, 2, 3)], None, idx[mat])
    box(HX, HN0 - 0.15, fh + 2.1, 6.2, 0.3, 3.6, "frame")
    for k in range(6):
        box(HX, HN0 - 0.32, fh + 0.7 + k * 0.6, 6.0, 0.06, 0.08, "concrete")
    box(HX, HN0 - 0.2, fh + 4.3, 7.4, 0.25, 0.35, "theme")

    # hangar apron and car park
    apron = [(-31.0, -13.0), (-16.0, -13.0), (-16.0, -5.2), (-31.0, -5.2)]
    slab_under(apron, fh + 0.12, "asphalt")
    for k in range(6):
        box(-30.25 + k * 2.5, -9.0, fh + 0.15, 0.12, 5.0, 0.04, "white")

    # ------------------------------------------------------------ plaza
    use("plaza")
    road_edge = lambda x, y: y - (0.6 * x - 4.8) - 1.2
    plaza = clip_polygon(circle_pts(PX, PY, 16.5, 48), road_edge)
    plaza = clip_polygon(plaza, lambda x, y: 8.4 - x)
    plaza = clip_polygon(plaza, lambda x, y: x + 17.2)
    slab_under(plaza, f + 0.12, "plaza")
    for i in range(22):                            # cyan inlay ring round the south side
        a = math.radians(200 + i * 140 / 21)
        box(PX + math.cos(a) * 13.6, PY + math.sin(a) * 13.6, f + 0.14, 1.3, 0.35, 0.05, "theme", a + math.pi / 2)
    for x in (-15.0, -10.5, -6.0, -1.5, 3.0):      # flags along the road
        y = 0.6 * x - 4.8 + 2.4
        g = ground(x, y)
        cyl(x, y, g - 0.2, g + 7.2, 0.1, 0.07, "frame", 8)
        cur["b"].add(*prim_plane(1.2, 2.6), Matrix.Translation((x + 0.62, y, g + 5.7)), idx["theme"])
    for x, y in ((-13.0, -2.0), (-8.5, -6.5), (5.5, 0.8)):
        g = ground(x, y)
        cyl(x, y, g - 0.2, g + 0.6, 1.15, 1.05, "concrete", 16)
        for dx, dy, r in ((0, 0, 0.9), (0.45, 0.3, 0.6), (-0.4, -0.35, 0.55)):
            cur["b"].add(*prim_icosahedron(r), Matrix.Translation((x + dx, y + dy, g + 0.6 + r * 0.6)), idx["planting"])

    # drop-off and parked cars in front of the annex
    use("parking")
    dropoff = [(8.6, 3.9), (19.6, 3.9), (19.6, 10.3), (8.6, 10.3)]
    drop_top = ground(14.0, 7.0) + 0.12
    slab_under(dropoff, drop_top, "plaza")

    def car(x, y, heading, paint, g):
        frame = Matrix.Translation((x, y, g)) @ Matrix.Rotation(heading, 4, 'Z')
        cur["b"].add(*prim_box(4.3, 0.72, 1.85), frame @ Matrix.Translation((0, 0, 0.66)), idx[paint])
        cur["b"].add(*prim_box(2.3, 0.55, 1.6), frame @ Matrix.Translation((-0.25, 0, 1.28)), idx["glass"])
        cur["b"].add(*prim_box(1.9, 0.08, 1.5), frame @ Matrix.Translation((-0.3, 0, 1.58)), idx[paint])
        for wx in (-1.35, 1.35):
            for wy in (-0.86, 0.86):
                cur["b"].add(*prim_cylinder(0.36, 0.36, 0.28, 10),
                      frame @ Matrix.Translation((wx, wy, 0.36)) @ Matrix.Rotation(math.pi / 2, 4, 'X'),
                      idx["frame"])

    for k, x in enumerate((10.4, 12.9, 15.4, 17.9)):
        car(x, 7.0, -math.pi / 2, f"car_{k}", drop_top)
    use("garage")
    for k, x in enumerate((-29.0, -26.5, -21.5, -19.0)):
        car(x, -9.2, math.pi / 2, f"car_{(k + 3) % 6}", fh + 0.12)

    # ------------------------------------------------------------ cone course
    use("cone_course")
    TX, TY, TR = 10.0, -22.0, 6.0
    lo, hi = span(circle_pts(TX, TY, TR + 0.3))
    top = hi + 0.1
    report["test_pad_ground"] = (round(lo, 2), round(hi, 2))
    cyl(TX, TY, lo - 0.6, top, TR + 0.3, TR + 0.3, "asphalt", 40)
    for r in (5.6, 2.2):
        lathe(TX, TY, [(r + 0.12, top + 0.02), (r - 0.12, top + 0.02)], "white", 48)
    for i in range(10):
        a = i / 10 * math.tau
        cur["b"].add(*prim_box(0.9, 0.03, 0.3), Matrix.Translation((TX + math.cos(a) * 4.0, TY + math.sin(a) * 4.0, top + 0.03))
              @ Matrix.Rotation(a, 4, 'Z'), idx["theme"])

    def cone(x, y, g=None):
        g = ground(x, y) if g is None else g
        cur["b"].add(*prim_box(0.6, 0.06, 0.6), Matrix.Translation((x, y, g + 0.03)), idx["cone"])
        cur["b"].add(*prim_cone(0.26, 0.75, 8), Matrix.Translation((x, y, g + 0.43)), idx["cone"])
        cur["b"].add(*prim_cylinder(0.17, 0.12, 0.12, 8), Matrix.Translation((x, y, g + 0.5)), idx["white"])

    cone(TX, TY, top)
    for k in range(5):
        cone(-6.0 + k * 2.4, -27.0)

    # ------------------------------------------------------------ watch tower
    use("watch_tower")
    tx, ty = 16.5, -15.8
    g = ground(tx, ty)
    box(tx, ty, g + 2.3, 2.2, 2.2, 5.2, "white")
    box(tx, ty, g + 5.3, 2.35, 2.35, 1.2, "window")
    box(tx, ty, g + 6.05, 2.6, 2.6, 0.3, "theme")
    for k in range(8):
        a = k / 8 * math.tau
        box(tx + math.cos(a) * 1.12, ty + math.sin(a) * 1.12, g + 4.3, 0.85, 0.08, 0.5,
            "white" if k % 2 == 0 else "black", a + math.pi / 2)

    # Each part gets its origin on its own floor, so it turns about itself.
    anchors = {
        "main_hall": (PX, PY, f),
        "heli_building": (AXc, 19.0, fa),
        "garage": (HX, (HN0 + HN1) / 2, fh),
        "plaza": (PX, 0.0, f),
        "parking": (14.0, 7.0, drop_top),
        "cone_course": (TX, TY, top),
        "watch_tower": (tx, ty, g),
    }
    keep = keep or {}
    base = bl(vx, vz, h0)
    objects = []
    faces = 0
    for name in LICENSE_PARTS:
        builder = parts[name]
        if not builder.faces:
            continue
        ax, ay, az = anchors[name]
        builder.verts = [(x - ax, y - ay, z - az) for x, y, z in builder.verts]
        obj = builder.to_object(LICENSE_PREFIX + name, slots, scene)
        obj.location = base + Vector((ax, ay, az))
        obj.rotation_euler = (0.0, 0.0, 0.0)      # the layout is authored in the venue frame
        if obj.name in keep:
            obj.location, obj.rotation_euler = keep[obj.name]
            report.setdefault("kept_hand_placement", []).append(obj.name)
        obj["license_part"] = name
        objects.append(obj)
        faces += len(builder.faces)
    report["faces"] = faces
    report["parts"] = [o.name for o in objects]
    return objects, report


# ============================================================================
# SCENERY - extra tree species, shrubs, rocks and ground cover
# ============================================================================
#
# Everything in this section is ADDED on top of the base valley. It never
# moves, removes or re-colours an existing tree, and it keeps well clear of
# every butte and its cliff: nothing new is placed inside a butte's reach, and
# the meadow tint fades to nothing before it gets there.
#
# Placement is decided per grid cell from a hash of the cell, not from one
# shared random stream, so a change to the ground in one corner of the map
# cannot reshuffle the rest. The trees, shrubs and rocks that were chosen are
# then frozen in SCENERY_PATH, exactly like the forest; delete that file to
# roll them again. Flowers and grass are re-derived from the same hashes on
# every run.
#
# To add the scenery to an open career_valley.blend without rebuilding it, run
# scripts/add_career_scenery.py.

SCENERY_PATH = os.path.join(PROJECT_ROOT, "career_valley_scenery.json")
SCENERY_PREFIX = "scenery_"
SCENERY_MAX_RADIUS = 250.0      # nothing new beyond this from the valley centre
BUTTE_KEEP_OUT = 8.0            # extra margin past a butte's reach
MEADOW_TINT_VERSION = 3
MEADOW_BASE = "meadow_base"      # untinted terrain colours, kept for re-tinting

# Per-cell odds. Raise them for a busier valley.
SCENERY_TREE_CELL = 9.0
SCENERY_TREE_CHANCE = 0.55
SCENERY_SHRUB_CELL = 6.5
SCENERY_ROCK_CELL = 13.0
SCENERY_FLOWER_CELL = 1.7
SCENERY_GRASS_CELL = 3.4
SCENERY_GRASS_CHANCE = 0.2

# Linear luminance of every foliage tone here stays above the 0.06 floor the
# runtime grade lifts toward grey, so none of them wash out in the game.
SCENERY_COLOURS = {
    "trunk": 0x6e4c31, "birch_bark": 0xe6e1d3,
    "oak_0": 0x4c7a2e, "oak_1": 0x5f8a34,
    "birch_0": 0x9cc05a, "birch_1": 0xb3c85c,
    "poplar_0": 0x3f7534,
    "maple_0": 0xd9652b, "maple_1": 0xc2412c, "maple_2": 0xe2aa35,
    "pine_0": 0x3a6a3c,
    "spruce_0": 0x2f6650,
    "blossom_0": 0xef9fbe, "blossom_1": 0xf3e3ec,
    "shrub_0": 0x44803a, "shrub_1": 0x5f9340, "shrub_2": 0x386f3a,
    "rock_0": 0x8b8e90, "rock_1": 0x727579, "rock_2": 0x9d968a,
    "flower_0": 0xf3f0e6, "flower_1": 0xf0c93a, "flower_2": 0x9a70d0, "flower_3": 0xd84a3c,
    "grass_0": 0x4f8c3e, "grass_1": 0x6a9c45, "grass_2": 0x3f7a3a,
}

# species: (variants, scale range, max ground height)
SCENERY_SPECIES = {
    "oak": (2, (0.85, 1.35)),
    "birch": (2, (0.8, 1.2)),
    "poplar": (1, (0.85, 1.2)),
    "maple": (3, (0.8, 1.2)),
    "pine": (1, (0.85, 1.25)),
    "spruce": (1, (0.8, 1.3)),
    "blossom": (2, (0.8, 1.1)),
}


def _cell_hash(ix, iz, salt):
    return _hash2(ix, iz, 0x5c0 + salt)


def meadow_tint(x, z):
    """Colour multiplier for the grass: broad lush, dry and clover patches.

    Exactly (1, 1, 1) inside any butte's reach plus a margin, fading in beyond
    it, so the cliff and the ground around it keep the colours they have.
    """
    keep = 1.0
    for venue in VENUES:
        if not venue.get("cliff_rim"):
            continue
        reach = butte_reach(venue) + BUTTE_KEEP_OUT
        d = math.hypot(x - venue["x"], z - venue["z"])
        keep = min(keep, smoothstep(reach, reach + 26.0, d))
    if keep <= 0.0:
        return (1.0, 1.0, 1.0)

    broad = fbm(x * 0.0065, z * 0.0065, 3, 611)
    dry = smoothstep(0.52, 0.68, broad)
    lush = 1.0 - smoothstep(0.30, 0.44, broad)
    clover = smoothstep(0.56, 0.76, fbm(x * 0.018, z * 0.018, 2, 617)) * (1.0 - dry)
    speck = (value_noise(x * 0.21, z * 0.21, 619) - 0.5) * 0.10

    # Grass here is about 2.3x greener than it is red, so a patch only reads as
    # dry once red climbs most of the way to green.
    r = 1.0 + dry * 0.85 - lush * 0.28 + clover * 0.05 + speck
    g = 1.0 - dry * 0.04 - lush * 0.16 + clover * 0.10 + speck
    b = 1.0 - dry * 0.40 - lush * 0.05 + clover * 0.05 + speck * 0.6
    return (1.0 + (r - 1.0) * keep, 1.0 + (g - 1.0) * keep, 1.0 + (b - 1.0) * keep)


def tint_grass_colour(x, z, colour, height=0.0):
    """Applies meadow_tint to one vertex colour, but only as far as it is grass.

    Rock, scree, snow and anything already brown or grey pass through untouched,
    and the tint fades out up the mountains: their steep, stretched faces turn
    patches into streaks.
    """
    r, g, b = colour[0], colour[1], colour[2]
    grass = max(0.0, min(1.0, (g - max(r, b)) / 0.12))
    grass *= 1.0 - smoothstep(32.0, 58.0, height)
    if grass <= 0.0:
        return colour
    tr, tg, tb = meadow_tint(x, z)
    if tr == 1.0 and tg == 1.0 and tb == 1.0:
        return colour
    tr = 1.0 + (tr - 1.0) * grass
    tg = 1.0 + (tg - 1.0) * grass
    tb = 1.0 + (tb - 1.0) * grass
    return (r * tr, g * tg, b * tb) + tuple(colour[3:])


def keep_col_active(mesh):
    """Makes "Col" the colour layer the viewport shows and the GLB exports."""
    names = [attr.name for attr in mesh.color_attributes]
    if "Col" in names:
        mesh.color_attributes.active_color_name = "Col"
        mesh.color_attributes.render_color_index = names.index("Col")


def apply_meadow_tint_live(terrain_obj):
    """Tints an existing terrain mesh in place, from its untinted colours.

    The untinted colours are kept in a plain data attribute, "meadow_base"
    (made from "Col" the first time), and "Col" is always rebuilt from it - so
    this can be re-run or re-tuned as often as needed and never compounds. It
    is deliberately not a colour layer: the glTF exporter ships every colour
    layer, and the game only wants the tinted one.
    """
    mesh = terrain_obj.data
    layer = mesh.color_attributes.get("Col")
    if layer is None or layer.domain != 'POINT':
        return 0
    base = mesh.attributes.get(MEADOW_BASE)
    if base is None:
        legacy = mesh.color_attributes.get("Col_base")
        if legacy is None and mesh.get("meadow_tint", 0):
            raise RuntimeError("terrain is already tinted but has no untinted copy to tint from")
        source = legacy if legacy is not None else mesh.color_attributes["Col"]
        values = [tuple(source.data[i].color)[:3] for i in range(len(mesh.vertices))]
        base = mesh.attributes.new(name=MEADOW_BASE, type='FLOAT_VECTOR', domain='POINT')
        for index, rgb in enumerate(values):
            base.data[index].vector = rgb
        if legacy is not None:
            mesh.color_attributes.remove(legacy)
    base = mesh.attributes[MEADOW_BASE]
    layer = mesh.color_attributes["Col"]
    mw = terrain_obj.matrix_world
    changed = 0
    for index, vertex in enumerate(mesh.vertices):
        world = mw @ vertex.co
        original = tuple(base.data[index].vector) + (1.0,)
        after = tint_grass_colour(world.x, -world.y, original, world.z)
        if tuple(layer.data[index].color) != tuple(after):
            layer.data[index].color = after
        if after != original:
            changed += 1
    keep_col_active(mesh)
    mesh["meadow_tint"] = MEADOW_TINT_VERSION
    mesh.update()
    return changed


def make_scenery_materials():
    return {name: make_material("Scenery_" + name, colour,
                                roughness=0.6 if name.startswith("rock") else 0.85)
            for name, colour in SCENERY_COLOURS.items()}


def _lumps(builder, lumps, material, rand, squash=0.85):
    for lx, ly, lz, radius in lumps:
        builder.add(*prim_icosahedron(radius),
                    Matrix.Translation((lx, ly, lz))
                    @ Matrix.Rotation(rand() * math.pi, 4, 'Z')
                    @ Matrix.Diagonal((1.0, 1.0, squash, 1.0)), material)


def build_scenery_prototypes(scene, mats):
    """One hidden mesh per species variant; planted trees share its data."""
    rand = make_random(0x5ce7e)
    protos = {}

    def finish(builder, species, variant, canopy, bark="trunk"):
        name = f"{SCENERY_PREFIX}{species}_{variant}_proto"
        obj = builder.to_object(name, [mats[bark], mats[canopy]], scene)
        try:
            obj.hide_set(True)
        except RuntimeError:
            obj.hide_viewport = True
        protos[(species, variant)] = obj

    for v in range(2):
        b = MeshBuilder()
        b.add(*prim_cylinder(0.48, 0.30, 2.8, 7), Matrix.Translation((0, 0, 1.4)), 0)
        _lumps(b, [(0, 0, 3.9, 2.1), (1.3, 0.4, 3.5, 1.5), (-1.1, 0.8, 3.6, 1.6),
                   (0.3, -1.2, 3.5, 1.5), (-0.4, -0.3, 4.7, 1.5)], 1, rand, 0.82)
        finish(b, "oak", v, f"oak_{v}")

    for v in range(2):
        b = MeshBuilder()
        b.add(*prim_cylinder(0.20, 0.11, 5.2, 6), Matrix.Translation((0, 0, 2.6)), 0)
        _lumps(b, [(0.2, 0, 3.9, 1.05), (-0.25, 0.2, 4.7, 0.95),
                   (0.1, -0.2, 5.5, 0.8), (0, 0.1, 6.1, 0.55)], 1, rand, 1.0)
        finish(b, "birch", v, f"birch_{v}", bark="birch_bark")

    b = MeshBuilder()
    b.add(*prim_cylinder(0.22, 0.14, 1.4, 6), Matrix.Translation((0, 0, 0.7)), 0)
    b.add(*prim_icosahedron(1.25), Matrix.Translation((0, 0, 4.9))
          @ Matrix.Diagonal((1.0, 1.0, 3.1, 1.0)), 1)
    b.add(*prim_icosahedron(0.95), Matrix.Translation((0.25, 0.1, 5.8))
          @ Matrix.Rotation(0.6, 4, 'Z') @ Matrix.Diagonal((1.0, 1.0, 2.4, 1.0)), 1)
    finish(b, "poplar", 0, "poplar_0")

    for v in range(3):
        b = MeshBuilder()
        b.add(*prim_cylinder(0.34, 0.20, 2.4, 6), Matrix.Translation((0, 0, 1.2)), 0)
        _lumps(b, [(0, 0, 3.4, 1.7), (0.9, 0.5, 3.1, 1.25),
                   (-0.8, -0.6, 3.2, 1.3), (0.1, 0.3, 4.2, 1.25)], 1, rand, 0.9)
        finish(b, "maple", v, f"maple_{v}")

    b = MeshBuilder()
    b.add(*prim_cylinder(0.30, 0.13, 7.0, 6), Matrix.Translation((0, 0, 3.5)), 0)
    for radius, height, z in ((1.2, 1.0, 5.0), (1.9, 1.4, 6.1), (1.5, 1.3, 6.9), (0.9, 1.1, 7.7)):
        b.add(*prim_cone(radius, height, 7), Matrix.Translation((0, 0, z))
              @ Matrix.Rotation(rand() * math.pi, 4, 'Z'), 1)
    finish(b, "pine", 0, "pine_0")

    b = MeshBuilder()
    b.add(*prim_cylinder(0.26, 0.14, 1.4, 6), Matrix.Translation((0, 0, 0.7)), 0)
    for tier in range(5):
        radius = 1.9 - tier * 0.32
        b.add(*prim_cone(radius, 2.2, 8), Matrix.Translation((0, 0, 2.0 + tier * 1.25))
              @ Matrix.Rotation(rand() * math.pi, 4, 'Z'), 1)
    finish(b, "spruce", 0, "spruce_0")

    for v in range(2):
        b = MeshBuilder()
        b.add(*prim_cylinder(0.30, 0.18, 2.0, 6), Matrix.Translation((0, 0, 1.0)), 0)
        _lumps(b, [(0, 0, 2.9, 1.45), (0.8, 0.3, 2.7, 1.05),
                   (-0.7, -0.5, 2.8, 1.1), (0.1, 0.2, 3.6, 1.0)], 1, rand, 0.9)
        finish(b, "blossom", v, f"blossom_{v}")

    return protos


class SceneryGround:
    """Where new scenery may go, read from the scene as it actually stands.

    Everything is measured against the live objects - the terrain surface, the
    road meshes, the cliff rock, the lamps and the existing trees - so it works
    the same inside a full build and when adding to a hand-edited valley.
    """

    def __init__(self, scene):
        from mathutils.bvhtree import BVHTree
        from mathutils.kdtree import KDTree

        def bvh_of(objects):
            verts, polys = [], []
            for obj in objects:
                mw = obj.matrix_world
                base = len(verts)
                verts.extend(mw @ v.co for v in obj.data.vertices)
                polys.extend([base + i for i in poly.vertices] for poly in obj.data.polygons)
            return BVHTree.FromPolygons(verts, polys) if polys else None

        def kd_of(points):
            tree = KDTree(max(1, len(points)))
            for i, (px, py) in enumerate(points):
                tree.insert((px, py, 0.0), i)
            tree.balance()
            return tree, len(points)

        # Objects made in this same run still carry an identity world matrix
        # until the view layer is refreshed - measuring before that puts a
        # brand-new arena at the world origin.
        for view_layer in scene.view_layers:
            view_layer.update()

        objs = list(scene.objects)
        meshes = [o for o in objs if o.type == 'MESH']
        terrain = scene.objects.get("terrain")
        self.terrain = bvh_of([terrain]) if terrain else None
        self.roads = bvh_of([o for o in meshes if o.name.startswith("road_")])
        self.cliff = bvh_of([o for o in meshes if o.name.startswith("cliff_")])
        self.arenas = bvh_of([o for o in meshes
                              if o.name.startswith(("arena_", "license_", "east_pass", "water", "waterfall"))])

        lamp_pts = [(o.matrix_world.translation.x, o.matrix_world.translation.y)
                    for o in meshes if o.name.startswith("street_lamp") and not o.name.endswith("_proto")]
        self.lamps, self.lamp_count = kd_of(lamp_pts)

        tree_pts = [(o.matrix_world.translation.x, o.matrix_world.translation.y)
                    for o in meshes
                    if o.name.startswith("tree_") and o.name[5:].isdigit()]
        self.trees, self.tree_count = kd_of(tree_pts)
        self.existing_trees = len(tree_pts)

        self.buttes = [(v["x"], v["z"], butte_reach(v) + BUTTE_KEEP_OUT)
                       for v in VENUES if v.get("cliff_rim")]
        plaza = ARENA_RADIUS * 1.62
        self.venues = [(v["x"], v["z"], plaza, v.get("flat_radius", PAD_FLAT_RADIUS))
                       for v in VENUES if not v.get("cliff_rim")]
        pass_obj = scene.objects.get("east_pass")
        if pass_obj:
            self.east_pass = (pass_obj.location.x, -pass_obj.location.y)
        else:
            self.east_pass = (58.0, 14.0)

    def _hits(self, bvh, bx, by, margin):
        if bvh is None:
            return False
        down = Vector((0.0, 0.0, -1.0))
        for ox, oy in ((0, 0), (margin, 0), (-margin, 0), (0, margin), (0, -margin)):
            hit = bvh.ray_cast(Vector((bx + ox, by + oy, 2000.0)), down)
            if hit[0] is not None:
                return True
        return False

    def _near(self, tree, count, bx, by, radius):
        if count == 0:
            return False
        found = tree.find((bx, by, 0.0))
        return found[2] is not None and found[2] < radius

    def ground(self, x, z):
        """(height, upness) of the terrain surface at a valley point, or None."""
        if self.terrain is None:
            return None
        hit = self.terrain.ray_cast(Vector((x, -z, 2000.0)), Vector((0.0, 0.0, -1.0)))
        if hit[0] is None:
            return None
        return hit[0].z, abs(hit[1].z)

    # kind: (road margin, lamp, tree, plaza extra, max height, min upness)
    RULES = {
        "tree":   (3.8, 3.5, 4.4, None, TREE_MAX_GROUND, 0.82),
        "shrub":  (2.2, 1.6, 2.3, 2.0, 48.0, 0.74),
        "rock":   (2.6, 1.6, 1.9, 4.0, 42.0, 0.6),
        "flower": (1.1, 1.0, 1.0, 0.8, 26.0, 0.9),
        "grass":  (0.9, 0.8, 0.9, 0.6, 40.0, 0.86),
    }

    def fit(self, x, z, kind):
        """Ground height if `kind` may stand at valley (x, z), otherwise None."""
        if math.hypot(x, z) > SCENERY_MAX_RADIUS:
            return None
        for cx, cz, reach in self.buttes:
            if math.hypot(x - cx, z - cz) < reach:
                return None
        road_m, lamp_m, tree_m, plaza_extra, max_h, min_up = self.RULES[kind]
        for vx, vz, plaza, flat_r in self.venues:
            clear = flat_r + 5.0 if plaza_extra is None else plaza + plaza_extra
            if math.hypot(x - vx, z - vz) < clear:
                return None
        if math.hypot(x - self.east_pass[0], z - self.east_pass[1]) < 14.0:
            return None
        bx, by = x, -z
        if self._near(self.lamps, self.lamp_count, bx, by, lamp_m):
            return None
        if self._near(self.trees, self.tree_count, bx, by, tree_m):
            return None
        surface = self.ground(x, z)
        if surface is None or surface[0] > max_h or surface[1] < min_up:
            return None
        if self._hits(self.roads, bx, by, road_m):
            return None
        if self._hits(self.cliff, bx, by, BUTTE_KEEP_OUT):
            return None
        if self._hits(self.arenas, bx, by, 3.0 if kind == "tree" else 1.0):
            return None
        return surface[0]


def _cells(cell):
    n = int(math.ceil(SCENERY_MAX_RADIUS / cell))
    for iz in range(-n, n + 1):
        for ix in range(-n, n + 1):
            yield ix, iz


def roll_scenery_layout(ground):
    """Chooses new trees, shrubs and rocks. Deterministic, per-cell."""
    trees, shrubs, rocks = [], [], []
    spacing = {}

    def crowded(x, z, radius):
        key = (int(math.floor(x / 8.0)), int(math.floor(z / 8.0)))
        for dz in (-1, 0, 1):
            for dx in (-1, 0, 1):
                for px, pz in spacing.get((key[0] + dx, key[1] + dz), ()):
                    if math.hypot(px - x, pz - z) < radius:
                        return True
        return False

    def remember(x, z):
        spacing.setdefault((int(math.floor(x / 8.0)), int(math.floor(z / 8.0))), []).append((x, z))

    names = list(SCENERY_SPECIES)

    # --- trees, in groves
    c = SCENERY_TREE_CELL
    for ix, iz in _cells(c):
        x = (ix + _cell_hash(ix, iz, 1)) * c
        z = (iz + _cell_hash(ix, iz, 2)) * c
        grove = smoothstep(0.50, 0.68, fbm(x * 0.011, z * 0.011, 3, 301))
        if _cell_hash(ix, iz, 3) > grove * SCENERY_TREE_CHANCE + 0.03:
            continue
        if crowded(x, z, 4.6):
            continue
        h = ground.fit(x, z, "tree")
        if h is None:
            continue

        pick = value_noise(x * 0.018, z * 0.018, 409)
        if pick < 0.17:
            species = "birch"
        elif pick < 0.36:
            species = "oak"
        elif pick < 0.50:
            species = "spruce"
        elif pick < 0.62:
            species = "pine"
        elif pick < 0.75:
            species = "maple"
        elif pick < 0.88:
            species = "oak"
        else:
            species = "birch"
        # Poplars line the roads.
        near_road = ground._hits(ground.roads, x, -z, 16.0)
        if near_road and _cell_hash(ix, iz, 4) < 0.55:
            species = "poplar"
        # Blossom only close to the arenas, as a small welcome.
        for vx, vz, plaza, flat_r in ground.venues:
            if math.hypot(x - vx, z - vz) < flat_r + 26.0 and _cell_hash(ix, iz, 5) < 0.35:
                species = "blossom"
        # A share of every grove is mixed, so no stand is a monoculture.
        if species not in ("poplar", "blossom") and _cell_hash(ix, iz, 6) < 0.2:
            species = names[int(_cell_hash(ix, iz, 7) * 6) % 6]

        variants, (lo, hi) = SCENERY_SPECIES[species]
        remember(x, z)
        trees.append({
            "species": species,
            "variant": int(_cell_hash(ix, iz, 8) * variants) % variants,
            "x": round(x, 3), "z": round(z, 3),
            "yaw": round(_cell_hash(ix, iz, 9) * math.tau, 4),
            "scale": round(lo + _cell_hash(ix, iz, 10) * (hi - lo), 4),
        })

    # --- shrubs: grove edges, arena surrounds and a sprinkle
    c = SCENERY_SHRUB_CELL
    for ix, iz in _cells(c):
        x = (ix + _cell_hash(ix, iz, 21)) * c
        z = (iz + _cell_hash(ix, iz, 22)) * c
        g = fbm(x * 0.011, z * 0.011, 3, 301)
        edge = smoothstep(0.40, 0.52, g) * (1.0 - smoothstep(0.62, 0.74, g))
        chance = 0.01 + edge * 0.32
        for vx, vz, plaza, flat_r in ground.venues:
            d = math.hypot(x - vx, z - vz)
            if plaza + 2.0 < d < plaza + 9.0:
                chance += 0.3
        if _cell_hash(ix, iz, 23) > chance:
            continue
        if crowded(x, z, 2.0):
            continue
        if ground.fit(x, z, "shrub") is None:
            continue
        shrubs.append({
            "variant": int(_cell_hash(ix, iz, 24) * 3) % 3,
            "x": round(x, 3), "z": round(z, 3),
            "yaw": round(_cell_hash(ix, iz, 25) * math.tau, 4),
            "scale": round(0.7 + _cell_hash(ix, iz, 26) * 0.8, 4),
        })

    # --- rocks: more of them on the slopes, in small clusters
    c = SCENERY_ROCK_CELL
    for ix, iz in _cells(c):
        cx = (ix + _cell_hash(ix, iz, 31)) * c
        cz = (iz + _cell_hash(ix, iz, 32)) * c
        rim = smoothstep(120.0, 210.0, math.hypot(cx, cz))
        if _cell_hash(ix, iz, 33) > 0.08 + rim * 0.2:
            continue
        for k in range(1 + int(_cell_hash(ix, iz, 34) * 3.5)):
            x = cx + (_cell_hash(ix * 7 + k, iz, 35) - 0.5) * 7.0
            z = cz + (_cell_hash(ix, iz * 7 + k, 36) - 0.5) * 7.0
            if ground.fit(x, z, "rock") is None:
                continue
            rocks.append({
                "variant": int(_cell_hash(ix + k, iz, 37) * 3) % 3,
                "x": round(x, 3), "z": round(z, 3),
                "yaw": round(_cell_hash(ix, iz + k, 38) * math.tau, 4),
                "scale": round((0.55 if k else 0.9) + _cell_hash(ix + k, iz + k, 39) * 1.4, 4),
                "shape": [round(0.8 + _cell_hash(ix, iz, 40 + k) * 0.6, 3),
                          round(0.8 + _cell_hash(ix, iz, 44 + k) * 0.6, 3),
                          round(0.45 + _cell_hash(ix, iz, 48 + k) * 0.35, 3)],
            })

    return {"trees": trees, "shrubs": shrubs, "rocks": rocks}


def remove_scenery(scene):
    """Deletes everything this section made, and nothing else."""
    removed = 0
    for obj in [o for o in scene.objects if o.name.startswith(SCENERY_PREFIX)]:
        data = obj.data
        bpy.data.objects.remove(obj, do_unlink=True)
        if data is not None and data.users == 0 and isinstance(data, bpy.types.Mesh):
            bpy.data.meshes.remove(data)
        removed += 1
    for mesh in [m for m in bpy.data.meshes if m.name.startswith(SCENERY_PREFIX) and m.users == 0]:
        bpy.data.meshes.remove(mesh)
    return removed


def build_scenery(scene):
    """Adds the extra species, shrubs, rocks, flowers and grass to `scene`.

    Returns (objects, prototypes, stats). Prototypes are hidden helpers that
    must not be exported; their names end in "_proto".
    """
    mats = make_scenery_materials()
    protos = build_scenery_prototypes(scene, mats)
    ground = SceneryGround(scene)

    layout = None
    if os.path.exists(SCENERY_PATH):
        with open(SCENERY_PATH, encoding="utf-8") as handle:
            layout = json.load(handle)
    if not layout:
        layout = roll_scenery_layout(ground)
        with open(SCENERY_PATH, "w", encoding="utf-8") as handle:
            json.dump(layout, handle, indent=1)

    objects = []
    skipped = 0

    # Trees stay individual objects, so they can be moved by hand in Blender.
    for record in layout.get("trees", []):
        h = ground.fit(record["x"], record["z"], "tree")
        if h is None:
            skipped += 1
            continue
        source = protos[(record["species"], record["variant"])]
        obj = bpy.data.objects.new(f"{SCENERY_PREFIX}tree_{len(objects):03d}", source.data)
        obj.location = bl(record["x"], record["z"], h - 0.08)
        obj.rotation_euler = (0.0, 0.0, record["yaw"])
        obj.scale = (record["scale"],) * 3
        obj["species"] = record["species"]
        scene.collection.objects.link(obj)
        objects.append(obj)
    tree_count = len(objects)

    # Small things are merged, one mesh per kind, to keep draw calls down.
    shrub_b = MeshBuilder()
    rand = make_random(0x5b5b)
    shrub_count = 0
    for record in layout.get("shrubs", []):
        h = ground.fit(record["x"], record["z"], "shrub")
        if h is None:
            skipped += 1
            continue
        base = Matrix.Translation(tuple(bl(record["x"], record["z"], h))) \
            @ Matrix.Rotation(record["yaw"], 4, 'Z') \
            @ Matrix.Scale(record["scale"], 4)
        for k in range(2 + int(rand() * 2)):
            r = 0.6 + rand() * 0.45
            off = (rand() - 0.5) * 1.1, (rand() - 0.5) * 1.1
            shrub_b.add(*prim_icosahedron(r),
                        base @ Matrix.Translation((off[0], off[1], r * 0.5))
                        @ Matrix.Diagonal((1.0, 1.0, 0.75, 1.0)), record["variant"])
        shrub_count += 1
    if shrub_b.faces:
        objects.append(shrub_b.to_object(f"{SCENERY_PREFIX}shrubs",
                                         [mats["shrub_0"], mats["shrub_1"], mats["shrub_2"]],
                                         scene, smooth=True))

    rock_b = MeshBuilder()
    rock_count = 0
    for record in layout.get("rocks", []):
        h = ground.fit(record["x"], record["z"], "rock")
        if h is None:
            skipped += 1
            continue
        sx, sy, sz = record["shape"]
        scale = record["scale"]
        rock_b.add(*prim_icosahedron(1.0),
                   Matrix.Translation(tuple(bl(record["x"], record["z"], h - sz * scale * 0.3)))
                   @ Matrix.Rotation(record["yaw"], 4, 'Z')
                   @ Matrix.Rotation(sx - 1.1, 4, 'X')
                   @ Matrix.Diagonal((sx * scale, sy * scale, sz * scale, 1.0)), record["variant"])
        rock_count += 1
    if rock_b.faces:
        objects.append(rock_b.to_object(f"{SCENERY_PREFIX}rocks",
                                        [mats["rock_0"], mats["rock_1"], mats["rock_2"]], scene))

    # Flowers: patches of one colour, with a few strays.
    flower_b = MeshBuilder()
    flower_count = 0
    c = SCENERY_FLOWER_CELL
    for ix, iz in _cells(c):
        x = (ix + _cell_hash(ix, iz, 61)) * c
        z = (iz + _cell_hash(ix, iz, 62)) * c
        patch = fbm(x * 0.03, z * 0.03, 2, 503)
        if patch < 0.66 or _cell_hash(ix, iz, 63) > 0.5:
            continue
        h = ground.fit(x, z, "flower")
        if h is None:
            continue
        colour = int(value_noise(x * 0.025, z * 0.025, 509) * 4) % 4
        if _cell_hash(ix, iz, 64) < 0.15:
            colour = int(_cell_hash(ix, iz, 65) * 4) % 4
        flower_b.add(*prim_cone(0.30, 0.34, 3),
                     Matrix.Translation(tuple(bl(x, z, h + 0.22)))
                     @ Matrix.Rotation(_cell_hash(ix, iz, 66) * math.tau, 4, 'Z')
                     @ Matrix.Rotation(math.pi, 4, 'X'), colour)
        flower_count += 1
    if flower_b.faces:
        objects.append(flower_b.to_object(f"{SCENERY_PREFIX}flowers",
                                          [mats[f"flower_{i}"] for i in range(4)], scene))

    # Grass tufts give the flat floor some grain.
    grass_b = MeshBuilder()
    grass_count = 0
    c = SCENERY_GRASS_CELL
    for ix, iz in _cells(c):
        x = (ix + _cell_hash(ix, iz, 71)) * c
        z = (iz + _cell_hash(ix, iz, 72)) * c
        chance = SCENERY_GRASS_CHANCE * (0.5 + fbm(x * 0.02, z * 0.02, 2, 521))
        if _cell_hash(ix, iz, 73) > chance:
            continue
        h = ground.fit(x, z, "grass")
        if h is None:
            continue
        tall = 0.5 + _cell_hash(ix, iz, 74) * 0.35
        grass_b.add(*prim_cone(0.46, tall, 4),
                    Matrix.Translation(tuple(bl(x, z, h + tall * 0.5 - 0.06)))
                    @ Matrix.Rotation(_cell_hash(ix, iz, 75) * math.tau, 4, 'Z')
                    @ Matrix.Rotation((_cell_hash(ix, iz, 76) - 0.5) * 0.35, 4, 'X'),
                    int(_cell_hash(ix, iz, 77) * 3) % 3)
        grass_count += 1
    if grass_b.faces:
        objects.append(grass_b.to_object(f"{SCENERY_PREFIX}grass",
                                         [mats[f"grass_{i}"] for i in range(3)], scene))

    species_count = {}
    for obj in objects[:tree_count]:
        species_count[obj["species"]] = species_count.get(obj["species"], 0) + 1

    stats = {
        "existing_trees_seen": ground.existing_trees,
        "new_trees": tree_count,
        "species": species_count,
        "shrubs": shrub_count,
        "rocks": rock_count,
        "flowers": flower_count,
        "grass_tufts": grass_count,
        "skipped_from_manifest": skipped,
        "manifest": SCENERY_PATH,
    }
    return objects, list(protos.values()), stats


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
    kept_parts = {}
    if SCENE_NAME in bpy.data.scenes:
        scene = bpy.data.scenes[SCENE_NAME]
        kept_parts = license_part_transforms(scene)
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
    globals()["LIFTS"] = marker_lifts
    clear_height_caches()

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
    barrier = make_material("ValleyBarrier", 0xd22f3c, roughness=0.55)
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
    road_objs, lamp_sites, road_lines = build_roads(scene, [asphalt, shoulder, white, barrier])
    meadow, meadow_sites = build_meadow_road(scene, [asphalt, shoulder, white])
    if meadow is not None:
        road_objs.append(meadow)
        lamp_sites.extend(meadow_sites)
    by_name = {o.name: o for o in road_objs}
    if "road_ring" in by_name and "road_exit" in by_name:
        road_objs.append(build_road_junction(scene, by_name["road_ring"], by_name["road_exit"],
                                             "road_junction_exit", asphalt, white)[0])
    if "road_ring" in by_name and meadow is not None:
        road_objs.append(build_road_junction(scene, by_name["road_ring"], meadow,
                                             "road_junction_meadow", asphalt, white)[0])
    lamp_objs, lamp_proto = build_street_lamps(scene, lamp_sites, [lamp_post, lamp_lens])
    lamps = write_lamp_manifest(lamp_sites)

    arena_objs = []
    for venue in VENUES:
        theme = make_material("ValleyTheme_" + venue["id"], venue["theme"],
                              roughness=0.45, metallic=0.25, emission=1.4)
        if venue["id"] == LICENSE_CENTER_VENUE:
            arena_objs.extend(build_license_center(scene, venue, arena_mats, theme, kept_parts)[0])
        else:
            arena_objs.append(build_arena(scene, venue, arena_mats, theme))

    cliff_obj, cliff_outline = build_cliff_walls(
        scene, terrain_mat,
        [line for obj, line in zip(road_objs, road_lines) if not obj.name.startswith("road_access_")])

    prototypes = build_tree_prototypes(scene, trunk, foliage, conifer)
    # Keep trees off the rock lip too: the outline rides along with the roads.
    trees, trees_skipped = plant_trees(scene, prototypes,
                                       road_lines + [[(x, -z) for x, z in cliff_outline]])
    water_objs = build_water_features(scene, terrain_mat)
    pass_obj = build_east_pass(scene, [rock, stone_dark],
                               next((o for o in road_objs if o.name == "road_exit"), None))
    # Added last, so it can see every road, lamp, tree and rock face it must avoid.
    scenery_objs, scenery_protos, scenery_stats = build_scenery(scene)

    # --- export everything visible in the scene
    for other_scene in bpy.data.scenes:
        for view_layer in other_scene.view_layers:
            for obj in other_scene.objects:
                try:
                    obj.select_set(False, view_layer=view_layer)
                except Exception:
                    pass

    helpers = set(prototypes) | {lamp_proto} | set(scenery_protos)
    exportable = [o for o in scene.objects if o.type == 'MESH' and o not in helpers]
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
        "scenery": scenery_stats,
        "trees_skipped": trees_skipped,
        "east_pass": pass_obj.name,
        "cliff_rock_faces": len(cliff_obj.data.polygons) if cliff_obj else 0,
        "street_lamps": len(lamps),
        "street_lamp_objects": len(lamp_objs),
        "lamp_manifest": LAMP_PATH,
        "exported_objects": len(exportable),
        "scene_restored": bpy.context.window.scene.name,
    })


build()
