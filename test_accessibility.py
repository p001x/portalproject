import os
import sys

# Add backend to path
sys.path.insert(0, os.path.abspath("backend"))

from gee.accessibility import (
    fetch_local_points,
    fetch_sample_population,
    haversine,
    _safe_first_val,
)

print("--- Testing _safe_first_val ---")
assert _safe_first_val({}, 0) == 0
assert _safe_first_val({"a": 42}, 0) == 42
assert _safe_first_val({"a": None}, 0) == 0
print("PASSED _safe_first_val")

print("--- Testing haversine ---")
d = haversine(30.0, -1.9, 30.1, -1.9)
assert 10 < d < 12, f"Unexpected distance: {d}"
print(f"PASSED haversine: {d:.2f} km")

print("--- Testing fetch_sample_population from local villages.shp ---")
# Gasabo approx bbox: [29.98, -1.98, 30.2, -1.8]
bbox = [29.98, -1.98, 30.2, -1.8]
villages = fetch_sample_population(bbox, limit=10)
print(f"Sampled {len(villages)} villages:")
for v in villages[:3]:
    print(" ", v)
assert len(villages) > 0, "Expected villages to be sampled from local shapefile!"
print("PASSED fetch_sample_population")

print("--- Testing fetch_local_points for schools and markets ---")
# fetch_local_points expects (amenities: list[str], bbox: list[float])
gasabo_bbox = [29.98, -1.98, 30.2, -1.8]

schools = fetch_local_points(["primary_school"], gasabo_bbox)
features, raw = schools
print(f"Found {len(raw)} primary schools in Gasabo bbox")
assert len(raw) > 0, "Expected to find primary schools in Gasabo!"
for s in raw[:2]:
    print(" ", s)

markets = fetch_local_points(["marketplace"], gasabo_bbox)
_, market_raw = markets
print(f"Found {len(market_raw)} markets in Gasabo bbox")
assert len(market_raw) > 0, "Expected to find markets in Gasabo!"

hospitals = fetch_local_points(["hospital"], gasabo_bbox)
_, hosp_raw = hospitals
print(f"Found {len(hosp_raw)} hospitals in Gasabo bbox")
assert len(hosp_raw) > 0, "Expected to find hospitals in Gasabo!"
for h in hosp_raw[:2]:
    print(" ", h)

clinics = fetch_local_points(["clinic"], gasabo_bbox)
_, clinic_raw = clinics
print(f"Found {len(clinic_raw)} clinics/health centers in Gasabo bbox")
assert len(clinic_raw) > 0, "Expected to find clinics in Gasabo!"
for c in clinic_raw[:2]:
    print(" ", c)

all_health = fetch_local_points(["health_facility"], gasabo_bbox)
_, all_health_raw = all_health
print(f"Found {len(all_health_raw)} total health facilities in Gasabo bbox")
assert len(all_health_raw) >= len(hosp_raw), f"All health ({len(all_health_raw)}) should >= hospitals ({len(hosp_raw)})"

print(f"\nHospitals: {len(hosp_raw)}")
print(f"Clinics/Centers: {len(clinic_raw)}")
print(f"All Health Facilities: {len(all_health_raw)}")

print("\nALL OFFLINE/LOCAL VECTOR TESTS PASSED SUCCESSFULLY!")
