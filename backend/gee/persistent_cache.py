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
