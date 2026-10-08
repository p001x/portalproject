import os
import json
import hashlib
import time
import threading

CACHE_DIR = os.path.join(os.path.dirname(__file__), "..", ".gee_cache")
os.makedirs(CACHE_DIR, exist_ok=True)

class PersistentCache:
    def __init__(self, ttl=3600):
        self.ttl = ttl
        self._lock = threading.Lock()

    def _get_path(self, key):
        key_str = json.dumps(key, sort_keys=True)
        key_hash = hashlib.md5(key_str.encode()).hexdigest()
        return os.path.join(CACHE_DIR, f"{key_hash}.json")

    def __contains__(self, key):
        return self.get(key) is not None

    def get(self, key, default=None):
        path = self._get_path(key)
        if not os.path.exists(path):
            return default
            
        try:
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
            
            # Check TTL
            if time.time() - data.get("timestamp", 0) > self.ttl:
                os.remove(path)
                return default
                
            return data.get("value", default)
        except Exception:
            return default

    def __getitem__(self, key):
        val = self.get(key)
        if val is None:
            raise KeyError(key)
        return val

    def __setitem__(self, key, value):
        path = self._get_path(key)
        data = {
            "timestamp": time.time(),
            "value": value
        }
        try:
            with self._lock:
                with open(path + ".tmp", "w", encoding="utf-8") as f:
                    json.dump(data, f)
                os.replace(path + ".tmp", path)
        except Exception as e:
            print(f"[PersistentCache] Failed to write cache: {e}")

    def clear(self):
        """Remove all cached entries from disk."""
        try:
            for f in os.listdir(CACHE_DIR):
                if f.endswith(".json"):
                    os.remove(os.path.join(CACHE_DIR, f))
        except Exception:
            pass

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
