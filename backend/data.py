import requests

# ─── Try multiple Overpass mirrors ───────────────────────────────
OVERPASS_MIRRORS = [
    "https://overpass-api.de/api/interpreter",
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
]

BBOX = "51.044,-114.073,51.052,-114.058"

# Calgary Open Data - correct working endpoint
CALGARY_ASSESSMENT_URL = (
    "https://data.calgary.ca/resource/6zp6-pxei.json"
    "?$limit=500"
)

def fetch_calgary_buildings():
    osm_buildings = fetch_osm_buildings()
    calgary_properties = fetch_calgary_property_data()
    merged = merge_data(osm_buildings, calgary_properties)
    merged = enrich_with_simulated_values(merged)
    return merged

def enrich_with_simulated_values(buildings):
    """Add realistic assessed values for buildings missing them."""
    import random
    random.seed(99)
    zoning_codes = ["CC-X", "CC-MH", "RC-G", "M-C1", "M-C2", "C-COR1", "C-COR2"]
    for b in buildings:
        if b["assessed_value"] is None:
            # Taller buildings = higher value (realistic)
            base = b["height"] * 15000 + random.uniform(-50000, 100000)
            b["assessed_value"] = round(max(80000, base), 2)
        if not b["zoning_code"]:
            b["zoning_code"] = random.choice(zoning_codes)
    return buildings

# ─── OSM Footprints ───────────────────────────────────────────────
def fetch_osm_buildings():
    query = f"""
    [out:json][timeout:25];
    (
      way["building"]({BBOX});
    );
    out body;
    >;
    out skel qt;
    """
    headers = {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "CalgaryDashboard/1.0"
    }

    for mirror in OVERPASS_MIRRORS:
        try:
            print(f"Trying OSM mirror: {mirror}")
            response = requests.post(
                mirror,
                data={"data": query},
                headers=headers,
                timeout=60
            )
            if response.status_code == 200:
                data = response.json()
                buildings = parse_osm(data)
                print(f"Got {len(buildings)} buildings from {mirror}")
                return buildings
            else:
                print(f"Mirror {mirror} returned {response.status_code}")
        except Exception as e:
            print(f"Mirror {mirror} failed: {e}")
            continue

    print("All OSM mirrors failed — using sample data")
    return generate_sample_buildings()

def parse_osm(osm_data):
    nodes = {}
    for el in osm_data.get("elements", []):
        if el["type"] == "node":
            nodes[el["id"]] = {"lat": el["lat"], "lon": el["lon"]}

    buildings = []
    for el in osm_data.get("elements", []):
        if el["type"] != "way":
            continue
        tags = el.get("tags", {})
        if "building" not in tags:
            continue

        coords = [nodes[n] for n in el.get("nodes", []) if n in nodes]
        if len(coords) < 3:
            continue

        height = None
        if tags.get("height"):
            try:
                height = float(tags["height"].replace("m", "").strip())
            except:
                pass
        if height is None and tags.get("building:levels"):
            try:
                height = float(tags["building:levels"]) * 3.5
            except:
                pass
        if height is None:
            height = 10.0

        lats = [c["lat"] for c in coords]
        lons = [c["lon"] for c in coords]
        centroid_lat = sum(lats) / len(lats)
        centroid_lon = sum(lons) / len(lons)

        buildings.append({
            "id": el["id"],
            "coords": coords,
            "centroid_lat": centroid_lat,
            "centroid_lon": centroid_lon,
            "height": round(height, 1),
            "height_feet": round(height * 3.28084, 1),
            "name": tags.get("name", f"Building {el['id']}"),
            "address": tags.get("addr:street", "Unknown Street"),
            "housenumber": tags.get("addr:housenumber", ""),
            "zoning": tags.get("landuse", tags.get("building", "unknown")),
            "levels": tags.get("building:levels", str(max(1, int(height // 3.5)))),
            "amenity": tags.get("amenity", ""),
            "assessed_value": None,
            "zoning_code": None,
        })
    return buildings

# ─── Calgary Property Data ────────────────────────────────────────
def fetch_calgary_property_data():
    try:
        response = requests.get(
            CALGARY_ASSESSMENT_URL,
            headers={"User-Agent": "CalgaryDashboard/1.0"},
            timeout=20
        )
        response.raise_for_status()
        data = response.json()
        print(f"Calgary API returned {len(data)} records")
        return data
    except Exception as e:
        print(f"Calgary API error: {e}")
        return []

# ─── Merge by proximity ───────────────────────────────────────────
def merge_data(osm_buildings, calgary_props):
    if not calgary_props:
        return osm_buildings

    props_with_coords = []
    for p in calgary_props:
        try:
            lat = float(p.get("latitude") or p.get("lat") or 0)
            lon = float(p.get("longitude") or p.get("lon") or 0)
            if lat == 0 or lon == 0:
                continue
            props_with_coords.append({
                "lat": lat,
                "lon": lon,
                "assessed_value": extract_value(p),
                "zoning_code": p.get("land_use_designation", p.get("zoning", "")),
                "address": p.get("address", ""),
            })
        except:
            continue

    print(f"{len(props_with_coords)} properties with coordinates")

    for building in osm_buildings:
        blat = building["centroid_lat"]
        blon = building["centroid_lon"]
        best = None
        best_dist = float("inf")
        for prop in props_with_coords:
            dist = ((prop["lat"] - blat) ** 2 + (prop["lon"] - blon) ** 2) ** 0.5
            if dist < best_dist:
                best_dist = dist
                best = prop
        if best and best_dist < 0.0015:
            building["assessed_value"] = best["assessed_value"]
            building["zoning_code"] = best["zoning_code"]
            if best["address"] and building["address"] == "Unknown Street":
                building["address"] = best["address"]

    return osm_buildings

def extract_value(prop):
    for field in ["assessed_value", "total_assessed_value",
                  "assessment_value", "current_assessed_value", "value"]:
        v = prop.get(field)
        if v is not None:
            try:
                return float(str(v).replace(",", "").replace("$", ""))
            except:
                pass
    return None

# ─── Sample data fallback (if ALL APIs fail) ─────────────────────
def generate_sample_buildings():
    """Generate realistic Calgary downtown sample buildings."""
    import random
    random.seed(42)

    base_lat = 51.0447
    base_lon = -114.0719
    buildings = []

    zonings = ["commercial", "residential", "office", "retail", "mixed"]
    zoning_codes = ["CC-X", "CC-MH", "RC-G", "M-C1", "M-C2", "C-COR1"]

    for i in range(60):
        row = i // 10
        col = i % 10
        lat = base_lat + (row * 0.001)
        lon = base_lon + (col * 0.001)
        size = random.uniform(0.0001, 0.0003)
        height = random.uniform(5, 120)

        coords = [
            {"lat": lat, "lon": lon},
            {"lat": lat + size, "lon": lon},
            {"lat": lat + size, "lon": lon + size},
            {"lat": lat, "lon": lon + size},
            {"lat": lat, "lon": lon},
        ]

        buildings.append({
            "id": 1000000 + i,
            "coords": coords,
            "centroid_lat": lat + size / 2,
            "centroid_lon": lon + size / 2,
            "height": round(height, 1),
            "height_feet": round(height * 3.28084, 1),
            "name": f"Building {i+1}",
            "address": f"{100 + i * 10} Centre Street",
            "housenumber": str(100 + i * 10),
            "zoning": random.choice(zonings),
            "levels": str(max(1, int(height // 3.5))),
            "amenity": "",
            "assessed_value": round(random.uniform(200000, 5000000), 2),
            "zoning_code": random.choice(zoning_codes),
        })

    print(f"Generated {len(buildings)} sample buildings")
    return buildings