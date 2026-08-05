import sys
sys.path.append('.')
from main import app

with open("routes.txt", "w") as f:
    for route in app.routes:
        if hasattr(route, "path"):
            f.write(f"{route.path} - {route.name}\n")
