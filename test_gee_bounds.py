import ee
import traceback
ee.Initialize(project='ee-yves21')
fc = ee.FeatureCollection('FAO/GAUL/2015/level2').filter(ee.Filter.eq('ADM2_NAME', 'Gasabo'))
geom = fc.geometry()
bounds = geom.bounds()
try:
    print('Bounds info:', bounds.getInfo())
except Exception as e:
    print('Error:', e)
