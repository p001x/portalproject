import traceback
import sys

try:
    import main
    with open("import_error.txt", "w") as f:
        f.write("Imported successfully!")
except Exception as e:
    with open("import_error.txt", "w") as f:
        f.write(traceback.format_exc())
