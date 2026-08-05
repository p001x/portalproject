"""
GeoVault — Git Auto-Backup Manager.

Handles:
- Auto-commit + push on every mutating action
- Retry with exponential backoff on push failure
- Background scheduled commits every 3 minutes
- Sync-log writing to config/sync-log.md
- Startup pull from remote
"""
import os
import time
import logging
import threading
import datetime

logger = logging.getLogger(__name__)

_REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_push_lock = threading.Lock()
_last_push_status = {"ok": True, "message": "Not yet synced", "timestamp": None}


def _get_token():
    """Read GITHUB_TOKEN from env (loaded from .env at startup)."""
    return os.environ.get("GITHUB_TOKEN", "").strip()


def _run_git(*args, cwd=None):
    """Run a git command and return (success, output)."""
    import subprocess
    try:
        result = subprocess.run(
            ["git"] + list(args),
            cwd=cwd or _REPO_ROOT,
            capture_output=True,
            text=True,
            timeout=60,
            env={**os.environ, "GIT_ASKPASS": "echo"},
        )
        return result.returncode == 0, result.stdout + result.stderr
    except Exception as e:
        return False, str(e)


def get_sync_status():
    """Return current sync status for the UI badge."""
    return dict(_last_push_status)


def pull_latest():
    """Pull latest from remote on startup. Non-fatal on failure."""
    token = _get_token()
    if not token:
        logger.warning("GITHUB_TOKEN not set — skipping pull.")
        return False

    ok, out = _run_git("remote", "get-url", "origin")
    if not ok:
        logger.warning("No git remote 'origin' configured.")
        return False

    remote_url = out.strip()
    if "github.com" in remote_url and remote_url.startswith("https://"):
        base = remote_url.split("https://")[1]
        if "@" in base:
            base = base.split("@")[1]
        auth_url = f"https://{token}@{base}"
        ok, out = _run_git("pull", auth_url, "main", "--rebase", "--autostash")
        if ok:
            logger.info("Pulled latest from GitHub.")
        else:
            logger.warning("Pull failed (non-fatal): %s", out[:200])
        return ok
    return False


def commit_and_push(message: str = "Auto-save", max_retries: int = 3) -> bool:
    """
    Stage all changes, commit, and push to GitHub.
    Retries with exponential backoff on failure.
    Thread-safe via lock.
    """
    global _last_push_status

    with _push_lock:
        # Check for changes
        ok, status_out = _run_git("status", "--porcelain")
        if ok and not status_out.strip():
            return True  # Nothing to commit

        # Stage all
        _run_git("add", "-A")

        # Commit
        ts = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%MZ")
        full_msg = f"{message} {ts}"
        ok, out = _run_git("commit", "-m", full_msg)
        if not ok:
            if "nothing to commit" in out:
                return True
            logger.error("Commit failed: %s", out[:200])
            _last_push_status = {"ok": False, "message": f"Commit failed: {out[:100]}", "timestamp": ts}
            return False

        logger.info("Committed: %s", full_msg)

        # Push with retry
        token = _get_token()
        if not token:
            _last_push_status = {"ok": False, "message": "GITHUB_TOKEN not set", "timestamp": ts}
            logger.error("GITHUB_TOKEN not found — cannot push.")
            _log_sync_entry(ts, full_msg, False, "No token")
            return False

        ok_remote, remote_out = _run_git("remote", "get-url", "origin")
        if not ok_remote:
            _last_push_status = {"ok": False, "message": "No remote configured", "timestamp": ts}
            _log_sync_entry(ts, full_msg, False, "No remote")
            return False

        remote_url = remote_out.strip()
        if "github.com" not in remote_url:
            _last_push_status = {"ok": False, "message": "Remote is not GitHub", "timestamp": ts}
            _log_sync_entry(ts, full_msg, False, "Not GitHub")
            return False

        base = remote_url.split("https://")[1] if "https://" in remote_url else remote_url
        if "@" in base:
            base = base.split("@")[1]
        push_url = f"https://{token}@{base}"

        for attempt in range(1, max_retries + 1):
            ok, out = _run_git("push", push_url, "main")
            if ok:
                logger.info("Push successful (attempt %d).", attempt)
                _last_push_status = {"ok": True, "message": "Backed up ✓", "timestamp": ts}
                _log_sync_entry(ts, full_msg, True, "github")
                return True
            else:
                wait = 2 ** attempt
                logger.warning("Push attempt %d failed, retrying in %ds: %s", attempt, wait, out[:150])
                if attempt < max_retries:
                    time.sleep(wait)

        _last_push_status = {"ok": False, "message": f"Push failed after {max_retries} attempts", "timestamp": ts}
        _log_sync_entry(ts, full_msg, False, f"Failed after {max_retries} retries")
        return False


def _log_sync_entry(timestamp: str, message: str, success: bool, backend: str):
    """Append to config/sync-log.md."""
    from backend.storage.storage_service import StorageService
    status = "✅" if success else "❌"
    entry = f"| {timestamp} | {status} | {backend} | {message} |"
    try:
        StorageService.append_sync_log(entry)
    except Exception as e:
        logger.error("Failed to write sync log: %s", e)


def auto_commit(message: str = "Auto-save"):
    """Fire-and-forget commit+push in a background thread."""
    thread = threading.Thread(target=commit_and_push, args=(message,), daemon=True)
    thread.start()


def start_scheduled_backup(interval_seconds: int = 180):
    """
    Start a background thread that commits + pushes every `interval_seconds`.
    Call once at app startup.
    """
    def _loop():
        while True:
            time.sleep(interval_seconds)
            try:
                commit_and_push("Scheduled backup")
            except Exception as e:
                logger.error("Scheduled backup error: %s", e)

    t = threading.Thread(target=_loop, daemon=True)
    t.start()
    logger.info("Scheduled backup started (every %ds).", interval_seconds)


if __name__ == "__main__":
    from dotenv import load_dotenv
    load_dotenv()
    success = commit_and_push("Manual test push")
    print("Test push:", "OK" if success else "FAILED")
