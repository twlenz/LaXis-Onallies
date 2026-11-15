"""Hand-authored board geometry and territory definitions for LaXis & OnAllies.

All coordinates are (lat, lon), WGS84. Shorelines and the city outline are
simplified by hand (positions checked against a georeferenced reference map,
see tools/README.md); roads and Kwik Trips come from open data in tools/data/.
"""

FRAME = dict(south=43.705, north=44.000, west=-91.400, east=-91.035)

# --- Water -------------------------------------------------------------------
# Mississippi floodplain incl. Lake Onalaska: everything between the Wisconsin
# shore (east edge, listed north -> south) and the Minnesota shore (west edge,
# listed south -> north). Backwater islands and marsh count as water.
WI_SHORE = [
    (44.000, -91.335), (43.985, -91.328), (43.970, -91.330), (43.962, -91.338), (43.958, -91.348),
    (43.951, -91.344), (43.943, -91.336), (43.936, -91.323), (43.929, -91.308), (43.922, -91.294),
    (43.918, -91.280), (43.917, -91.266), (43.915, -91.256), (43.908, -91.250), (43.898, -91.246),
    (43.888, -91.244), (43.878, -91.245), (43.868, -91.248), (43.858, -91.250), (43.845, -91.251),
    (43.832, -91.253), (43.822, -91.257), (43.812, -91.259), (43.802, -91.258), (43.792, -91.255),
    (43.782, -91.249), (43.772, -91.241), (43.762, -91.234), (43.752, -91.226), (43.742, -91.222),
    (43.728, -91.221), (43.718, -91.222), (43.705, -91.229),
]
MN_SHORE = [
    (43.705, -91.279), (43.720, -91.283), (43.735, -91.286), (43.750, -91.292), (43.765, -91.299),
    (43.780, -91.301), (43.795, -91.299), (43.810, -91.298), (43.825, -91.299), (43.840, -91.302),
    (43.852, -91.308), (43.862, -91.316), (43.875, -91.322), (43.890, -91.332), (43.905, -91.342),
    (43.915, -91.352), (43.925, -91.362), (43.940, -91.372), (43.960, -91.380), (43.980, -91.386),
    (44.000, -91.390),
]
# Land inside the floodplain
FRENCH_ISLAND = [
    (43.898, -91.276), (43.896, -91.263), (43.889, -91.257), (43.877, -91.256), (43.864, -91.257),
    (43.852, -91.258), (43.842, -91.260), (43.836, -91.264), (43.838, -91.271), (43.848, -91.275),
    (43.858, -91.283), (43.868, -91.287), (43.880, -91.289), (43.892, -91.285),
]
PETTIBONE = [
    (43.826, -91.267), (43.822, -91.262), (43.814, -91.263), (43.806, -91.266), (43.804, -91.273),
    (43.812, -91.279), (43.822, -91.277),
]
# Decorative rivers inside the city (drawn, not barriers)
LA_CROSSE_RIVER = [(43.822, -91.257), (43.824, -91.246), (43.826, -91.234), (43.828, -91.222),
                   (43.833, -91.210), (43.842, -91.196), (43.852, -91.180), (43.860, -91.160)]

# --- Inside the wall ------------------------------------------------------------
# Land-side outline of La Crosse + Onalaska, clockwise from the north-east corner
# of Lake Onalaska to the river south of the city. The west side follows WI_SHORE.
CITY_EDGE = [
    (43.915, -91.256), (43.926, -91.252), (43.932, -91.243), (43.928, -91.230), (43.920, -91.218),
    (43.912, -91.205), (43.903, -91.192), (43.896, -91.172), (43.893, -91.152), (43.882, -91.144),
    (43.870, -91.149), (43.862, -91.164), (43.857, -91.184), (43.851, -91.199), (43.841, -91.207),
    (43.828, -91.209), (43.815, -91.199), (43.802, -91.197), (43.792, -91.200), (43.783, -91.205),
    (43.775, -91.212), (43.767, -91.217), (43.761, -91.223), (43.759, -91.231),
]

# --- Territories ----------------------------------------------------------------
# Inside: Voronoi cells around these seeds, clipped to the land inside the wall.
LAX = [
    dict(id="lax_downtown", name="Downtown La Crosse", short="Downtown", seed=(43.8135, -91.2520), value=4,
         special=["cityhall"], start={"inf": 3, "tank": 1}),
    dict(id="lax_lnds", name="Lower North Side & Depot", short="Lower North Side", seed=(43.8320, -91.2465), value=2),
    dict(id="lax_logan", name="Logan Northside", short="Logan Northside", seed=(43.8460, -91.2430), value=1),
    dict(id="lax_grandcrossing", name="Grand Crossing", short="Grand Crossing", seed=(43.8520, -91.2260), value=2),
    dict(id="lax_campus", name="UW–La Crosse & River Marsh", short="UW–L", seed=(43.8160, -91.2310), value=2),
    dict(id="lax_washburn", name="Washburn", short="Washburn", seed=(43.8085, -91.2435), value=1),
    dict(id="lax_grandview", name="Grandview–Emerson", short="Grandview–Emerson", seed=(43.8020, -91.2310), value=1),
    dict(id="lax_pph", name="Powell–Poage–Hamilton", short="Powell–Poage–Hamilton", seed=(43.7995, -91.2520), value=1),
    dict(id="lax_gundersen", name="Gundersen Campus", short="Gundersen", seed=(43.7935, -91.2410), value=2,
         special=["gundersen"]),
    dict(id="lax_htl", name="Holy Trinity–Longfellow", short="Holy Trinity–Longfellow", seed=(43.7845, -91.2465), value=1),
    dict(id="lax_weigent", name="Weigent–Hogan", short="Weigent–Hogan", seed=(43.7905, -91.2240), value=1),
    dict(id="lax_hintgen", name="Hintgen", short="Hintgen", seed=(43.7790, -91.2320), value=1),
    dict(id="lax_stateroad", name="State Road & Ebner Coulee", short="State Road", seed=(43.7900, -91.2075), value=1),
    dict(id="lax_bluff", name="Grandad Bluff & Hixon Forest", short="Grandad Bluff", seed=(43.8150, -91.2080), value=1),
    dict(id="lax_south", name="Mormon Coulee & South Side", short="South Side", seed=(43.7670, -91.2270), value=1),
    dict(id="lax_valleyview", name="Valley View", short="Valley View", seed=(43.8640, -91.1720), value=3),
]
ONA = [
    dict(id="ona_downtown", name="Downtown Onalaska (Main Street)", short="Downtown Onalaska", seed=(43.8845, -91.2380),
         value=4, special=["cityhall"], start={"inf": 3, "tank": 1}),
    dict(id="ona_lakeshore", name="Great River Road North", short="Great River Rd", seed=(43.9020, -91.2445), value=2),
    dict(id="ona_north", name="Hwy 35 / 53 North End", short="North End", seed=(43.9225, -91.2400), value=1),
    dict(id="ona_sandlake", name="Sand Lake Road", short="Sand Lake", seed=(43.9050, -91.2250), value=2),
    dict(id="ona_greencoulee", name="Green Coulee", short="Green Coulee", seed=(43.9120, -91.2090), value=1),
    dict(id="ona_menards", name="Hwy 53 & Menards", short="Menards", seed=(43.8935, -91.2195), value=3),
    dict(id="ona_eastmain", name="East Main Street", short="East Main", seed=(43.8860, -91.2040), value=2),
    dict(id="ona_theater", name="Theater Road", short="Theater Rd", seed=(43.8850, -91.1850), value=2),
    dict(id="ona_hwy16", name="Hwy 16 East", short="Hwy 16 East", seed=(43.8850, -91.1600), value=2),
    dict(id="ona_crossing", name="Crossing Meadows", short="Crossing Meadows", seed=(43.8715, -91.2050), value=3),
    dict(id="ona_south", name="South Onalaska", short="South Onalaska", seed=(43.8720, -91.2390), value=2),
    dict(id="ona_i90", name="Oak Forest & I-90", short="Oak Forest", seed=(43.8740, -91.2235), value=2),
]
FI = [
    dict(id="fi_airport", name="La Crosse Regional Airport", short="Airport", seed=(43.8800, -91.2700), value=2,
         special=["airport"]),
    dict(id="fi_westlax", name="West La Crosse (French Island)", short="West La Crosse", seed=(43.8480, -91.2650), value=1),
]
# Starting garrison for every city territory without an explicit `start`
DEFAULT_START = {"inf": 1}
EXTRA_START = {"ona_south": {"inf": 2}, "ona_north": {"inf": 2}, "ona_hwy16": {"inf": 2}, "ona_crossing": {"inf": 2}}

# Bridges over the Black River to French Island (both inside the wall; no gate needed)
FI_BRIDGES = [((43.8625, -91.2565), (43.8640, -91.2470), "I-90"),
              ((43.8420, -91.2595), (43.8420, -91.2510), "Clinton St")]

# --- Outside: three concentric rings (north / east / south) ------------------------
RING_KM = [1.4, 3.9]          # ring 1: 0-1.4 km from the wall, ring 2: 1.4-3.9 km, ring 3: beyond
RING_SECTORS = [10, 8, 6]     # sectors per ring; ring 3 sectors are the six spawn points
RING_VALUE = [1, 1, 0]
# Names for outside sectors: first listed place inside the sector wins
PLACES = [
    ("Holmen", 43.963, -91.256, 3), ("Midway", 43.928, -91.252, 1), ("Brice Prairie", 43.937, -91.300, 1),
    ("New Amsterdam", 43.988, -91.310, 0), ("Halfway Creek", 43.950, -91.205, 1), ("Mindoro Road", 43.975, -91.170, 0),
    ("West Salem", 43.899, -91.081, 0), ("Medary", 43.885, -91.120, 1), ("Barre Mills", 43.835, -91.115, 1),
    ("Hixon Forest", 43.832, -91.190, 1), ("Bliss Road", 43.805, -91.185, 1), ("St. Joseph Ridge", 43.790, -91.110, 0),
    ("Shelby", 43.772, -91.165, 1), ("Mt. La Crosse", 43.750, -91.212, 1), ("Goose Island", 43.735, -91.222, 1),
    ("Chipmunk Coulee", 43.720, -91.195, 0), ("Pleasant Valley", 43.725, -91.155, 0), ("Mormon Coulee", 43.752, -91.190, 1),
    ("Hwy 33 Coulee", 43.800, -91.160, 1), ("Valley View East", 43.870, -91.135, 1), ("Sand Lake Coulee", 43.925, -91.200, 1),
]

# --- West: three territories across the Cass Street bridge ---------------------------
WEST = [
    dict(id="w_pettibone", name="Pettibone Park (Barron Island)", short="Pettibone", ring=1, value=1),
    dict(id="w_lacrescent", name="La Crescent, MN", short="La Crescent", ring=2, value=2, radius_km=(0, 2.8)),
    dict(id="w_mnbluffs", name="Minnesota Bluffs", short="MN Bluffs", ring=3, value=0, radius_km=(2.8, 6.5), spawn=7),
]
CASS_STREET_BRIDGE = ((43.8130, -91.2585), (43.8150, -91.2635))
PETTIBONE_LACRESCENT_BRIDGE = ((43.8190, -91.2765), (43.8230, -91.2990))
WEST_CENTER = (43.8250, -91.3020)  # La Crescent bridge landing

# Caricature landmarks (kind, (lat, lon))
DOODLES = [
    ("sixpack", (43.7900, -91.2760)),     # City Brewery: World's Largest Six-Pack (drawn in the river margin)
    ("bluff", (43.7970, -91.1830)),       # Grandad Bluff
    ("riverboat", (43.8400, -91.2850)),   # Mississippi riverboat
    ("biplane", (43.9050, -91.2900)),     # over Lake Onalaska
    ("zombiehand", (43.9800, -91.1500)),
    ("zombiehand", (43.7250, -91.1000)),
]

# --- Oil -----------------------------------------------------------------------------------
# Only territories with one of the area's biggest Kwik Trips give oil (1 per territory per turn).
# "Biggest" = most amenities in Kwik Trip's store list (diesel, DEF, car wash, E85; CNG/LNG x2).
OIL_MIN_SCORE = 3
# Onalaska has only one top-tier station, so its next two largest (Sand Lake Rd, State Road 16)
# also count, to keep the two cities' oil even (3 each).
OIL_BALANCE = ["ona_menards", "ona_theater"]
