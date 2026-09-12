import ee
ee.Initialize(project='ee-petersonyang87')
try:
    img = ee.Image(1).updateMask(ee.Image(1))
    dist = img.distance(ee.Kernel.euclidean(20000, "meters"))
    print("distance with kernel worked!")
except Exception as e:
    print(f"Error: {e}")
