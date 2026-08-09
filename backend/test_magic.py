import sys
try:
    import magic
    print("magic works")
except Exception as e:
    import traceback
    print("magic failed:", e)
    traceback.print_exc()
