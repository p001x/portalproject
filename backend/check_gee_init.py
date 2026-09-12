import os
if os.name == 'nt' and os.path.exists(r"C:\Program Files\QGIS 3.40.11\bin"):
    os.add_dll_directory(r"C:\Program Files\QGIS 3.40.11\bin")
import sys

logging.basicConfig(level=logging.DEBUG)

try:
    from gee.auth import initialize_gee
    print("Import successful. Initializing...")
    initialize_gee()
    print("Done!")
except Exception as e:
    print(f"Failed: {e}")
