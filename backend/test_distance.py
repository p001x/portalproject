import ee
from gee.auth import initialize_gee

initialize_gee()
img = ee.Image(1)
try:
    print(dir(img))
    dist = img.distance(50000)
    print("img.distance exists!")
except Exception as e:
    print("Error:", e)
