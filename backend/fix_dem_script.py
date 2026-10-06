import os

backend_dir = r"c:\Users\user\Documents\blacportal\backend\gee"
files = ["flood.py", "habitat.py", "landfill.py", "landslide.py", "lst.py", "rusle.py", "slope.py", "supervised_classify.py", "wellscope.py"]

for f in files:
    path = os.path.join(backend_dir, f)
    with open(path, 'r', encoding='utf-8') as file:
        content = file.read()
    
    comp = 'ee.Image("USGS/SRTMGL1_003").select("elevation").unmask(ee.Image("COPERNICUS/DEM/GLO30").select("DEM"))'
    
    content = content.replace('ee.Image("COPERNICUS/DEM/GLO30").select("DEM")', comp)
    content = content.replace("ee.Image('COPERNICUS/DEM/GLO30').select('DEM')", comp)
    
    with open(path, 'w', encoding='utf-8') as file:
        file.write(content)
print("Updated all to use SRTM unmasked with Copernicus DEM.")
