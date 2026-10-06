import sys
sys.path.append(r"c:\Users\user\Documents\blacportal\backend")
from gee.auth import initialize_gee
initialize_gee()
import ee
img=ee.Image("NASA/NASADEM_HGT/001").unmask(1, False)
print("Unbounded?", img.geometry().isUnbounded().getInfo())
