"""Territory definitions for the LaXis & OnAllies board.

Each territory is grown (Voronoi) from a seed point inside its parent area,
then clipped to real municipal boundaries and shorelines from OpenStreetMap.

group:  LAX | ONA | FI (French Island, neutral, inside the wall) | OUT
muni:   optional exact municipal polygon to use for an OUT territory
spawn:  1-6 for the zombie entry territories
"""

# La Crosse neighborhoods (City of La Crosse). Association names per the
# City of La Crosse Neighborhoods page; seeds placed at each area's core.
LAX = [
    dict(id="lax_downtown", name="Downtown La Crosse", short="Downtown", seed=(43.8132, -91.2500), value=4,
         special=["cityhall"], start={"inf": 3, "tank": 1}),
    dict(id="lax_lndn", name="Lower Northside & Depot", short="Lower Northside", seed=(43.8335, -91.2470), value=2,
         start={"inf": 1}),
    dict(id="lax_logan", name="Logan Northside", short="Logan Northside", seed=(43.8500, -91.2400), value=2,
         start={"inf": 2}),
    dict(id="lax_washburn", name="Washburn", short="Washburn", seed=(43.8095, -91.2410), value=2,
         start={"inf": 1}),
    dict(id="lax_pph", name="Powell–Poage–Hamilton", short="Powell-Poage-Hamilton", seed=(43.8010, -91.2500), value=2,
         start={"inf": 1}),
    dict(id="lax_campus", name="UW–La Crosse Campus", short="UW-L", seed=(43.8160, -91.2300), value=2,
         start={"inf": 1}),
    dict(id="lax_gundersen", name="Gundersen Campus", short="Gundersen", seed=(43.7950, -91.2420), value=2,
         special=["gundersen"], start={"inf": 1}),
    dict(id="lax_htl", name="Holy Trinity–Longfellow", short="Holy Trinity-Longfellow", seed=(43.7860, -91.2440), value=1,
         start={"inf": 1}),
    dict(id="lax_grandview", name="Grandview–Emerson", short="Grandview-Emerson", seed=(43.8030, -91.2300), value=1,
         start={"inf": 1}),
    dict(id="lax_weigent", name="Weigent–Hogan", short="Weigent-Hogan", seed=(43.7920, -91.2260), value=1,
         start={"inf": 1}),
    dict(id="lax_hintgen", name="Hintgen", short="Hintgen", seed=(43.7780, -91.2250), value=1,
         start={"inf": 1}),
    dict(id="lax_southside", name="Southern Bluffs & Mormon Coulee", short="Southern Bluffs", seed=(43.7640, -91.2240), value=1,
         start={"inf": 1}),
    dict(id="lax_bluffs", name="Grandad Bluff & Hixon Forest", short="Grandad Bluff", seed=(43.8120, -91.2080), value=1,
         start={"inf": 1}),
    dict(id="lax_stateroad", name="State Road & Ebner Coulee", short="State Road", seed=(43.7880, -91.2060), value=1,
         start={"inf": 1}),
    dict(id="lax_valleyview", name="Valley View", short="Valley View", seed=(43.8480, -91.1950), value=3,
         start={"inf": 1}),
]

# Onalaska (City of Onalaska)
ONA = [
    dict(id="ona_downtown", name="Downtown Onalaska (Main Street)", short="Downtown Onalaska", seed=(43.8845, -91.2350), value=4,
         special=["cityhall"], start={"inf": 3, "tank": 1}),
    dict(id="ona_lakeshore", name="Lakeshore & Hwy 35 North", short="Lakeshore", seed=(43.9050, -91.2420), value=2,
         start={"inf": 1}),
    dict(id="ona_sandlake", name="Sand Lake", short="Sand Lake", seed=(43.8880, -91.2150), value=2,
         start={"inf": 1}),
    dict(id="ona_greencoulee", name="Green Coulee", short="Green Coulee", seed=(43.9060, -91.2080), value=2,
         start={"inf": 1}),
    dict(id="ona_south", name="South Onalaska", short="South Onalaska", seed=(43.8690, -91.2340), value=2,
         start={"inf": 2}),
    dict(id="ona_crossing", name="Crossing Meadows & Hwy 16", short="Crossing Meadows", seed=(43.8700, -91.2000), value=3,
         start={"inf": 2}),
    dict(id="ona_theater", name="Theater Road & Hwy 157", short="Theater Road", seed=(43.8830, -91.1830), value=2,
         start={"inf": 1}),
]

# French Island (Town of Campbell) — neutral, inside the wall
FI = [
    dict(id="fi_airport", name="La Crosse Regional Airport", short="Airport", seed=(43.8790, -91.2570), value=2,
         special=["airport"]),
    dict(id="fi_village", name="French Island", short="French Island", seed=(43.8540, -91.2620), value=1),
]

# Outside the wall
OUT = [
    dict(id="out_holmen", name="Holmen", short="Holmen", seed=(43.9630, -91.2560), value=3, muni="Holmen"),
    dict(id="out_brice", name="Brice Prairie", short="Brice Prairie", seed=(43.9370, -91.2990), value=1),
    dict(id="out_midway", name="Midway & Hwy 53", short="Midway", seed=(43.9290, -91.2390), value=1),
    dict(id="out_townona", name="Town of Onalaska (East)", short="Town of Onalaska", seed=(43.9220, -91.1800), value=1),
    dict(id="out_medary", name="Medary", short="Medary", seed=(43.8620, -91.1450), value=1),
    dict(id="out_westsalem", name="West Salem", short="West Salem", seed=(43.8990, -91.0830), value=2, muni="West Salem"),
    dict(id="out_barre", name="Barre Mills", short="Barre Mills", seed=(43.8380, -91.0800), value=1),
    dict(id="out_bluffcountry", name="Bliss Road Bluffs", short="Bliss Road", seed=(43.8000, -91.1650), value=1),
    dict(id="out_shelby", name="Shelby", short="Shelby", seed=(43.7620, -91.1800), value=1),
    dict(id="out_gooseisland", name="Goose Island & Chipmunk Coulee", short="Goose Island", seed=(43.7400, -91.2300), value=1),
    dict(id="sp_53north", name="US-53 North (Galesville road)", short="US-53 North", seed=(43.9950, -91.2500), value=0, spawn=1),
    dict(id="sp_35north", name="WI-35 North (Trempealeau road)", short="WI-35 North", seed=(43.9920, -91.3300), value=0, spawn=2),
    dict(id="sp_i90east", name="I-90 East (toward Sparta)", short="I-90 East", seed=(43.9300, -91.0400), value=0, spawn=3),
    dict(id="sp_33east", name="WI-33 East (St. Joseph Ridge)", short="WI-33 East", seed=(43.7950, -91.0700), value=0, spawn=4),
    dict(id="sp_1461south", name="US-14/61 South (Coon Valley road)", short="US-14/61 South", seed=(43.7200, -91.1300), value=0, spawn=5),
    dict(id="sp_35south", name="WI-35 South (Stoddard road)", short="WI-35 South", seed=(43.7050, -91.2350), value=0, spawn=6),
]

# OSM municipal names (admin_level 8 / 7) per group
MUNI = {
    "LAX": ["La Crosse"],
    "ONA": ["Onalaska"],
    "FI": ["Campbell"],
}
WISCONSIN_COUNTIES = ["La Crosse County", "Vernon County", "Trempealeau County", "Monroe County"]
