import sys
import os

sys.path.insert(0, os.path.dirname(__file__))

try:
    import main
    print("Main imported successfully!")
    print("App title:", main.app.title)
except Exception as e:
    import traceback
    print("Error importing main:")
    traceback.print_exc()
