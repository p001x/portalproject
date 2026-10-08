import ee  
ee.Initialize(project='blac-portal')  
geom = ee.Geometry.Point([0, 0])  
try:  
    print(geom.bounds(maxError=1000).coordinates().get(0).getInfo())  
except Exception as e:  
    print(type(e).__name__, ':', str(e))  
