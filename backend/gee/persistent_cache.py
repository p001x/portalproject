import os
import json
import hashlib
import time
import threading
import functools
from typing import Optional, Any

CACHE_DIR = os.path.join(os.path.dirname(__file__), "..", ".gee_cache")
os.makedirs(CACHE_DIR, exist_ok=True)


class CacheJSONEncoder(json.JSONEncoder):
    """
    Robust JSON encoder that handles NumPy numbers/arrays, sets, dates,
    and Pydantic/custom domain objects without crashing serialization.
    """
    def default(self, obj: Any) -> Any:
        try:
            import numpy as np
            if isinstance(obj, (np.integer, int)):
                return int(obj)
            if isinstance(obj, (np.floating, float)):
                return float(obj)
            if isinstance(obj, (np.bool_, bool)):
                return bool(obj)
            if isinstance(obj, np.ndarray):
                return obj.tolist()
        except ImportError:
            pass

        type_name = type(obj).__name__.lower()
        if "lock" in type_name or "future" in type_name or "semaphore" in type_name:
            return None
        if isinstance(obj, (set, frozenset)):
            return sorted(list(obj))
        if hasattr(obj, "isoformat"):
            return obj.isoformat()
        if hasattr(obj, "model_dump"):
            return obj.model_dump()
        if hasattr(obj, "dict"):
            return obj.dict()
        if hasattr(obj, "tolist"):
            return obj.tolist()
        if hasattr(obj, "__dict__"):
            return {k: v for k, v in obj.__dict__.items() if "lock" not in k.lower() and "lock" not in type(v).__name__.lower()}
        try:
            return super().default(obj)
        except Exception:
            return str(obj)


def _detect_caller_namespace() -> str:
    """
    Automatically detects the calling module's short name (e.g. 'ndvi', 'lst', 'slope')
    to ensure strict corridor isolation between modules.
    """
    try:
        import inspect
        stack = inspect.stack()
        for frame_info in stack[2:]:
            mod = inspect.getmodule(frame_info.frame)
            if mod and mod.__name__ != __name__ and not mod.__name__.startswith("importlib"):
                parts = mod.__name__.split(".")
                return parts[-1]
    except Exception:
        pass
    return "general"


def _normalize_key(key: Any) -> str:
    """
    Normalizes any key (tuple, dict, primitive) into a deterministic JSON string.
    """
    try:
        return json.dumps(key, sort_keys=True, cls=CacheJSONEncoder)
    except Exception:
        return str(key)


class PersistentCache:
    """
    Isolated, permanent disk cache for Google Earth Engine computations.
    Each module lives in its own corridor subfolder within .gee_cache/
    to guarantee zero cross-contamination.

    By default, entries are PERMANENTLY established (permanent=True) so
    previously computed study areas are never recalculated from zero.
    """
    def __init__(self, ttl: Optional[int] = None, namespace: Optional[str] = None, permanent: bool = True):
        self.permanent = permanent
        self.ttl = None if permanent else ttl
        self.namespace = namespace or _detect_caller_namespace()
        self._dir = os.path.join(CACHE_DIR, self.namespace)
        os.makedirs(self._dir, exist_ok=True)
        self._lock = threading.Lock()

    def _get_path(self, key: Any) -> str:
        key_str = _normalize_key(key)
        key_hash = hashlib.md5(key_str.encode("utf-8")).hexdigest()
        return os.path.join(self._dir, f"{key_hash}.json")

    def __contains__(self, key: Any) -> bool:
        return self.get(key) is not None

    def get(self, key: Any, default: Any = None) -> Any:
        path = self._get_path(key)
        if not os.path.exists(path):
            return default

        try:
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)

            # Check TTL only if explicit non-permanent mode is specified
            if not self.permanent and self.ttl is not None:
                if time.time() - data.get("timestamp", 0) > self.ttl:
                    try:
                        os.remove(path)
                    except Exception:
                        pass
                    return default

            return data.get("value", default)
        except Exception:
            return default

    def __getitem__(self, key: Any) -> Any:
        val = self.get(key)
        if val is None:
            raise KeyError(key)
        return val

    def __setitem__(self, key: Any, value: Any) -> None:
        path = self._get_path(key)
        data = {
            "timestamp": time.time(),
            "namespace": self.namespace,
            "value": value
        }
        tmp_path = f"{path}.{os.getpid()}.{time.time_ns()}.tmp"
        try:
            with self._lock:
                with open(tmp_path, "w", encoding="utf-8") as f:
                    json.dump(data, f, cls=CacheJSONEncoder)
                os.replace(tmp_path, path)
        except Exception as e:
            print(f"[PersistentCache:{self.namespace}] Failed to write cache: {e}")
        finally:
            if os.path.exists(tmp_path):
                try:
                    os.remove(tmp_path)
                except Exception:
                    pass

    def clear(self) -> None:
        """Removes only cached entries belonging to THIS module's isolated namespace."""
        try:
            with self._lock:
                if os.path.exists(self._dir):
                    for f in os.listdir(self._dir):
                        if f.endswith(".json"):
                            try:
                                os.remove(os.path.join(self._dir, f))
                            except Exception:
                                pass
        except Exception:
            pass

    def stats(self) -> dict:
        """Returns statistics for this module's cache."""
        try:
            files = [f for f in os.listdir(self._dir) if f.endswith(".json")]
            total_size = sum(os.path.getsize(os.path.join(self._dir, f)) for f in files)
            return {
                "namespace": self.namespace,
                "count": len(files),
                "size_kb": round(total_size / 1024, 2),
                "permanent": self.permanent
            }
        except Exception:
            return {"namespace": self.namespace, "count": 0, "size_kb": 0, "permanent": self.permanent}


def with_cache(func=None, *, namespace: Optional[str] = None, permanent: bool = True, ttl: Optional[int] = None):
    """
    Decorator for memoizing GEE computation functions with permanent, isolated caching.
    Can be used as `@with_cache` or `@with_cache(namespace='custom', permanent=True)`.
    """
    def decorator(fn):
        fn_ns = namespace or fn.__module__.split(".")[-1]
        _cache = PersistentCache(ttl=ttl, namespace=fn_ns, permanent=permanent)

        @functools.wraps(fn)
        def wrapper(*args, **kwargs):
            key_parts = [fn.__name__]
            for a in args:
                if isinstance(a, dict):
                    key_parts.append(_normalize_key(a))
                else:
                    key_parts.append(str(a))
            for k, v in sorted(kwargs.items()):
                if isinstance(v, dict):
                    key_parts.append(f"{k}:{_normalize_key(v)}")
                else:
                    key_parts.append(f"{k}:{str(v)}")

            cache_key = _normalize_key(key_parts)

            if cache_key in _cache:
                return _cache[cache_key]

            result = fn(*args, **kwargs)
            try:
                _cache[cache_key] = result
            except Exception as e:
                print(f"[with_cache:{fn_ns}] Could not store result: {e}")
            return result

        wrapper.cache = _cache
        return wrapper

    if func is not None:
        return decorator(func)
    return decorator
