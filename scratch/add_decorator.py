import os
import re
import json

cache_module = "backend/gee/persistent_cache.py"
with open(cache_module, "r") as f:
    content = f.read()

if "def with_cache" not in content:
    decorator_code = """
import functools
import json

def with_cache(func):
    @functools.wraps(func)
    def wrapper(*args, **kwargs):
        _cache = PersistentCache(ttl=3600)
        
        key_parts = [func.__name__]
        for a in args:
            if isinstance(a, dict):
                key_parts.append(json.dumps(a, sort_keys=True))
            else:
                key_parts.append(str(a))
        for k, v in sorted(kwargs.items()):
            if isinstance(v, dict):
                key_parts.append(json.dumps(v, sort_keys=True))
            else:
                key_parts.append(str(v))
                
        cache_key = json.dumps(key_parts, sort_keys=True)
        
        if cache_key in _cache:
            return _cache[cache_key]
            
        result = func(*args, **kwargs)
        _cache[cache_key] = result
        return result
    return wrapper
"""
    with open(cache_module, "a") as f:
        f.write(decorator_code)
    print("Added decorator to persistent_cache.py")

gee_dir = "backend/gee"
for file in os.listdir(gee_dir):
    if not file.endswith(".py") or file in ["persistent_cache.py", "drought.py", "auth.py", "aoi_utils.py", "classify_utils.py", "__init__.py"]:
        continue
        
    filepath = os.path.join(gee_dir, file)
    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()
        
    if "from gee.persistent_cache import with_cache" in content:
        continue
        
    lines = content.split('\n')
    
    # Find last import to insert our import
    last_import_idx = 0
    for i, line in enumerate(lines):
        if line.startswith("import ") or line.startswith("from "):
            last_import_idx = i
            
    # Insert import
    lines.insert(last_import_idx + 1, "from gee.persistent_cache import with_cache")
    
    # Insert decorator
    modified = False
    for i in range(len(lines)):
        if lines[i].startswith("def compute_"):
            if not lines[i-1].startswith("@with_cache"):
                lines.insert(i, "@with_cache")
                modified = True
                
    if modified:
        with open(filepath, "w", encoding="utf-8") as f:
            f.write("\n".join(lines))
        print(f"Patched {file}")
