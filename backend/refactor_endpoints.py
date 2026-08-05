import re

path = "c:/Users/user/Documents/blacportal/backend/main.py"
with open(path, "r", encoding="utf-8") as f:
    content = f.read()

# Replace compute_*(req.district, ...) with compute_*(req.aoi, ...)
# For compute_flood_susceptibility:
content = re.sub(r'district_name=req.district,', r'aoi_config=req.aoi,', content)

# For others:
# compute_ndvi(req.district, -> compute_ndvi(req.aoi,
content = re.sub(r'compute_(\w+)\(\s*req.district,', r'compute_\1(req.aoi,', content)

# Remove the district validation block
validation_block = r"""    if req.district not in RWANDA_DISTRICTS:
        raise HTTPException\(400, f"Unknown district '\{req.district\}'."\)
"""
content = re.sub(validation_block, "", content)

# For landfill
content = re.sub(r'compute_landfill_suitability\(\s*req.district,', r'compute_landfill_suitability(req.aoi,', content)

with open(path, "w", encoding="utf-8") as f:
    f.write(content)
print("main.py endpoints updated")
