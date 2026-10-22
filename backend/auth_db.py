from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, Any
import secrets
from sqlalchemy import func

from database import SessionLocal
from models import User, GeeUsage, UserActivity, UserAppeal
import community_db

def init_db():
    from database import init_db as _init
    _init()

# Ensure DB is initialized
init_db()

def _user_to_dict(user: User) -> Dict[str, Any]:
    if not user:
        return None
    return {
        "id": user.id,
        "name": user.name,
        "email": user.email,
        "password_hash": user.password_hash,
        "reset_token": user.reset_token,
        "reset_token_expiry": user.reset_token_expiry,
        "role": user.role,
        "created_at": user.created_at,
        "api_key": user.api_key,
        "google_id": user.google_id,
        "is_verified": user.is_verified,
        "profile_picture": user.profile_picture,
        "preferences": user.preferences,
        "is_blocked": bool(getattr(user, "is_blocked", False)),
        "blocked_reason": getattr(user, "blocked_reason", None),
        "blocked_at": getattr(user, "blocked_at", None),
        "last_active": getattr(user, "last_active", None)
    }

def get_user_by_email(email: str) -> Optional[Dict[str, Any]]:
    if not email:
        return None
    email_clean = email.strip().lower()
    with SessionLocal() as db:
        user = db.query(User).filter(func.lower(User.email) == email_clean).first()
        return _user_to_dict(user) if user else None

def get_user_by_reset_token(token: str) -> Optional[Dict[str, Any]]:
    with SessionLocal() as db:
        user = db.query(User).filter(User.reset_token == token).first()
        return _user_to_dict(user) if user else None

def get_all_users() -> list[Dict[str, Any]]:
    with SessionLocal() as db:
        users = db.query(User).filter(User.role == 'user').all()
        return [{"email": u.email, "name": u.name} for u in users]

def create_user(name: str, email: str, password_hash: str = None, role: str = 'user', google_id: str = None, is_verified: bool = False) -> None:
    created_at = datetime.now(timezone.utc).isoformat()
    with SessionLocal() as db:
        new_user = User(
            name=name,
            email=email,
            password_hash=password_hash,
            role=role,
            created_at=created_at,
            google_id=google_id,
            is_verified=is_verified
        )
        db.add(new_user)
        db.commit()

def get_user_by_google_id(google_id: str) -> Optional[Dict[str, Any]]:
    with SessionLocal() as db:
        user = db.query(User).filter(User.google_id == google_id).first()
        return _user_to_dict(user) if user else None

def mark_user_verified(email: str) -> None:
    if not email:
        return
    email_clean = email.strip().lower()
    with SessionLocal() as db:
        user = db.query(User).filter(func.lower(User.email) == email_clean).first()
        if user:
            user.is_verified = True
            db.commit()

from models import OTP
import random
from datetime import timedelta

def save_otp(email: str, expires_in_minutes: int = 10) -> str:
    code = f"{random.randint(0, 9999):04d}"
    expires_at = (datetime.now(timezone.utc) + timedelta(minutes=expires_in_minutes)).isoformat()
    email_clean = email.strip().lower()
    with SessionLocal() as db:
        # Invalidate old OTPs
        db.query(OTP).filter(func.lower(OTP.email) == email_clean, OTP.used == False).update({"used": True}, synchronize_session=False)
        
        new_otp = OTP(email=email_clean, code=code, expires_at=expires_at, used=False)
        db.add(new_otp)
        db.commit()
    return code

def verify_otp(email: str, code: str) -> bool:
    email_clean = email.strip().lower()
    with SessionLocal() as db:
        otp = db.query(OTP).filter(func.lower(OTP.email) == email_clean, OTP.code == code.strip(), OTP.used == False).order_by(OTP.id.desc()).first()
        if not otp:
            return False
            
        # Check expiration
        expiry = datetime.fromisoformat(otp.expires_at)
        if datetime.now(timezone.utc) > expiry:
            return False
            
        otp.used = True
        db.commit()
        return True

def update_user_password(email: str, password_hash: str) -> None:
    if not email:
        return
    email_clean = email.strip().lower()
    with SessionLocal() as db:
        user = db.query(User).filter(func.lower(User.email) == email_clean).first()
        if user:
            user.password_hash = password_hash
            user.reset_token = None
            user.reset_token_expiry = None
            db.commit()

def set_reset_token(email: str, token: str, expiry_iso: str) -> None:
    if not email:
        return
    email_clean = email.strip().lower()
    with SessionLocal() as db:
        user = db.query(User).filter(func.lower(User.email) == email_clean).first()
        if user:
            user.reset_token = token
            user.reset_token_expiry = expiry_iso
            db.commit()

def update_user_name(email: str, name: str) -> None:
    with SessionLocal() as db:
        user = db.query(User).filter(User.email == email).first()
        if user:
            user.name = name
            db.commit()

def update_user_picture(email: str, url: str) -> None:
    with SessionLocal() as db:
        user = db.query(User).filter(User.email == email).first()
        if user:
            user.profile_picture = url
            db.commit()

def update_user_preferences(email: str, preferences: str) -> None:
    with SessionLocal() as db:
        user = db.query(User).filter(User.email == email).first()
        if user:
            user.preferences = preferences
            db.commit()

def update_user_role(email: str, role: str) -> bool:
    with SessionLocal() as db:
        user = db.query(User).filter(User.email == email).first()
        if user:
            user.role = role
            db.commit()
            return True
        return False

def create_admin_reset_token(email: str) -> Optional[str]:
    token = secrets.token_urlsafe(32)
    expiry = (datetime.now(timezone.utc) + timedelta(hours=24)).isoformat()
    with SessionLocal() as db:
        user = db.query(User).filter(User.email == email).first()
        if user:
            user.reset_token = token
            user.reset_token_expiry = expiry
            db.commit()
            return token
        return None

def increment_and_check_gee_usage(email: str, max_requests: int = 50) -> dict:
    date_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    with SessionLocal() as db:
        usage = db.query(GeeUsage).filter(GeeUsage.email == email, GeeUsage.date_str == date_str).first()
        if not usage:
            usage = GeeUsage(email=email, date_str=date_str, request_count=0)
            db.add(usage)
            db.commit()
            db.refresh(usage)
            
        if usage.request_count >= max_requests:
            return {"allowed": False, "count": usage.request_count}
            
        usage.request_count += 1
        db.commit()
        return {"allowed": True, "count": usage.request_count}

def get_gee_usage(email: str) -> int:
    date_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    with SessionLocal() as db:
        usage = db.query(GeeUsage).filter(GeeUsage.email == email, GeeUsage.date_str == date_str).first()
        return usage.request_count if usage else 0

# --- Notifications ---

import uuid

def create_notification(email: str, title: str, message: str, notif_type: str = "info") -> dict:
    from models import Notification
    n_id = str(uuid.uuid4())
    timestamp = datetime.now(timezone.utc).isoformat()
    with SessionLocal() as db:
        n = Notification(
            id=n_id,
            email=email,
            title=title,
            message=message,
            type=notif_type,
            read=False,
            timestamp=timestamp
        )
        db.add(n)
        db.commit()
    return {"id": n_id, "title": title, "message": message, "type": notif_type, "read": False, "timestamp": timestamp}

def get_notifications(email: str) -> list[dict]:
    from models import Notification
    with SessionLocal() as db:
        notifs = db.query(Notification).filter(Notification.email == email).order_by(Notification.timestamp.desc()).limit(50).all()
        return [
            {
                "id": n.id,
                "title": n.title,
                "message": n.message,
                "type": n.type,
                "read": n.read,
                "timestamp": n.timestamp
            } for n in notifs
        ]

def mark_notification_read(email: str, notif_id: str) -> None:
    from models import Notification
    with SessionLocal() as db:
        db.query(Notification).filter(Notification.email == email, Notification.id == notif_id).update({"read": True})
        db.commit()

def mark_all_notifications_read(email: str) -> None:
    from models import Notification
    with SessionLocal() as db:
        db.query(Notification).filter(Notification.email == email, Notification.read == False).update({"read": True})
        db.commit()


# ── User Activity Tracking ──────────────────────────────────────────────────

def log_user_activity(email: str, action: str, module: str = None, details: str = None, ip_address: str = None, user_name: str = None) -> None:
    """Log an activity event for a user and update their last_active timestamp."""
    if not email:
        return
    now_iso = datetime.now(timezone.utc).isoformat()
    try:
        with SessionLocal() as db:
            # Update last_active on User
            db_user = db.query(User).filter(User.email == email).first()
            if db_user:
                db_user.last_active = now_iso
                if not user_name:
                    user_name = db_user.name

            activity = UserActivity(
                email=email,
                user_name=user_name or email.split("@")[0],
                action=action,
                module=module or "Platform",
                details=details,
                timestamp=now_iso,
                ip_address=ip_address
            )
            db.add(activity)
            db.commit()
    except Exception as e:
        # Don't let tracking failure break the main operation
        print(f"[ActivityLog] Warning: failed to log activity: {e}")

def get_user_activities(email: str = None, limit: int = 100) -> list[dict]:
    """Retrieve user activities, optionally filtered by user email."""
    with SessionLocal() as db:
        query = db.query(UserActivity)
        if email:
            query = query.filter(UserActivity.email == email)
        records = query.order_by(UserActivity.id.desc()).limit(limit).all()
        return [
            {
                "id": r.id,
                "email": r.email,
                "user_name": r.user_name,
                "action": r.action,
                "module": r.module,
                "details": r.details,
                "timestamp": r.timestamp,
                "ip_address": r.ip_address
            } for r in records
        ]


# ── Admin User Management & Inspection ──────────────────────────────────────

def get_all_users_admin() -> list[dict]:
    """Retrieve all users with aggregated activity stats, top tool used, and comments count."""
    with SessionLocal() as db:
        users = db.query(User).order_by(User.id.desc()).all()
        result = []
        
        for u in users:
            # Determine role override for configured admin accounts
            role = u.role
            if u.email.lower() in ["petersonyang8@gmail.com", "pierrendorimana16@gmail.com"]:
                role = "admin"

            # Count activities and find favorite module
            activities = db.query(UserActivity).filter(UserActivity.email == u.email).all()
            total_activities = len(activities)
            
            # Module frequency
            module_counts = {}
            for act in activities:
                m = act.module or "Platform"
                module_counts[m] = module_counts.get(m, 0) + 1
            
            favorite_tool = "Exploring Platform"
            if module_counts:
                # Pick module with max count
                favorite_tool = max(module_counts.items(), key=lambda x: x[1])[0]

            # Community comments count
            c_count = 0
            try:
                c_count = community_db.get_user_comment_count(u.email)
                if u.name and u.name.lower() != u.email.lower():
                    c_count += community_db.get_user_comment_count(u.name)
            except Exception:
                pass

            result.append({
                "id": u.id,
                "name": u.name,
                "email": u.email,
                "role": role,
                "created_at": u.created_at,
                "last_active": u.last_active or u.created_at,
                "is_verified": bool(u.is_verified),
                "is_blocked": bool(u.is_blocked),
                "blocked_reason": u.blocked_reason,
                "blocked_at": u.blocked_at,
                "profile_picture": u.profile_picture,
                "total_activities": total_activities,
                "favorite_tool": favorite_tool,
                "comments_count": c_count,
            })
        return result

def get_user_admin_detail(email: str) -> Optional[dict]:
    """Get complete deep-dive for a specific user: info, comments, activity log, tool breakdown, appeals."""
    with SessionLocal() as db:
        u = db.query(User).filter(User.email == email).first()
        if not u:
            return None
            
        role = u.role
        if u.email.lower() in ["petersonyang8@gmail.com", "pierrendorimana16@gmail.com"]:
            role = "admin"

        # Activities
        activities = db.query(UserActivity).filter(UserActivity.email == email).order_by(UserActivity.id.desc()).limit(150).all()
        module_counts = {}
        activity_list = []
        for a in activities:
            m = a.module or "General"
            module_counts[m] = module_counts.get(m, 0) + 1
            activity_list.append({
                "id": a.id,
                "action": a.action,
                "module": a.module,
                "details": a.details,
                "timestamp": a.timestamp
            })

        # Comments
        comments = []
        try:
            comments = community_db.get_user_comments(u.email)
            if u.name and u.name.lower() != u.email.lower():
                name_comments = community_db.get_user_comments(u.name)
                existing_ids = {c["id"] for c in comments}
                for nc in name_comments:
                    if nc["id"] not in existing_ids:
                        comments.append(nc)
            comments.sort(key=lambda x: x.get("timestamp", ""), reverse=True)
        except Exception as e:
            print(f"[UserDetail] Warning: could not load comments: {e}")

        # Appeals
        appeals = db.query(UserAppeal).filter(UserAppeal.email == email).order_by(UserAppeal.id.desc()).all()
        appeal_list = [
            {
                "id": ap.id,
                "blocked_reason": ap.blocked_reason,
                "appeal_message": ap.appeal_message,
                "status": ap.status,
                "admin_note": ap.admin_note,
                "created_at": ap.created_at,
                "reviewed_at": ap.reviewed_at,
                "reviewed_by": ap.reviewed_by
            } for ap in appeals
        ]

        favorite_tool = "Exploring Platform"
        if module_counts:
            favorite_tool = max(module_counts.items(), key=lambda x: x[1])[0]

        return {
            "id": u.id,
            "name": u.name,
            "email": u.email,
            "role": role,
            "created_at": u.created_at,
            "last_active": u.last_active or u.created_at,
            "is_verified": bool(u.is_verified),
            "is_blocked": bool(u.is_blocked),
            "blocked_reason": u.blocked_reason,
            "blocked_at": u.blocked_at,
            "profile_picture": u.profile_picture,
            "favorite_tool": favorite_tool,
            "total_activities": len(activities),
            "tool_breakdown": module_counts,
            "activities": activity_list,
            "comments": comments,
            "appeals": appeal_list
        }


# ── Account Moderation (Block & Unblock) ────────────────────────────────────

def admin_block_user(email: str, reason: str, admin_email: str = "Admin") -> bool:
    """Block a user account, sync to community DB, and record moderation action."""
    now_iso = datetime.now(timezone.utc).isoformat()
    reason_text = reason or "Account suspended for violating platform standards."
    user_name = None
    with SessionLocal() as db:
        user = db.query(User).filter(User.email == email).first()
        if not user:
            return False
            
        user.is_blocked = True
        user.blocked_reason = reason_text
        user.blocked_at = now_iso
        user_name = user.name
        db.commit()

    # Sync to community blocked users
    try:
        community_db.block_user(email)
        if user_name:
            community_db.block_user(user_name)
    except Exception:
        pass

    # Send security notification
    try:
        create_notification(
            email=email,
            title="Account Suspended",
            message=f"Your account has been suspended: {reason_text}",
            notif_type="security"
        )
    except Exception:
        pass

    # Log admin moderation activity
    log_user_activity(
        email=admin_email,
        action="block_user",
        module="User Moderation",
        details=f"Suspended user {email}. Reason: {reason_text}"
    )
    return True

def admin_unblock_user(email: str, admin_email: str = "Admin") -> bool:
    """Unblock a user account and lift restrictions."""
    user_name = None
    with SessionLocal() as db:
        user = db.query(User).filter(User.email == email).first()
        if not user:
            return False
            
        user.is_blocked = False
        user.blocked_reason = None
        user.blocked_at = None
        user_name = user.name
        db.commit()

    # Sync to community blocked users
    try:
        community_db.unblock_user(email)
        if user_name:
            community_db.unblock_user(user_name)
    except Exception:
        pass

    # Send security notification
    try:
        create_notification(
            email=email,
            title="Account Reinstated",
            message="Your account access has been restored. You can now use all features and participate in community discussions.",
            notif_type="security"
        )
    except Exception:
        pass

    # Log admin moderation activity
    log_user_activity(
        email=admin_email,
        action="unblock_user",
        module="User Moderation",
        details=f"Reinstated user {email}."
    )
    return True


# ── Appeals System ──────────────────────────────────────────────────────────

def create_user_appeal(email: str, appeal_message: str) -> dict:
    """Create a new suspension appeal for a blocked user."""
    now_iso = datetime.now(timezone.utc).isoformat()
    appeal_id = None
    user_name = None
    with SessionLocal() as db:
        user = db.query(User).filter(User.email == email).first()
        if not user:
            raise ValueError("No account found with this email.")
        if not user.is_blocked:
            raise ValueError("Account is not currently suspended.")

        user_name = user.name
        blocked_reason = user.blocked_reason or "Account suspended"

        appeal = UserAppeal(
            email=email,
            user_name=user_name,
            blocked_reason=blocked_reason,
            appeal_message=appeal_message.strip(),
            status="pending",
            created_at=now_iso
        )
        db.add(appeal)
        db.commit()
        appeal_id = appeal.id

    # Notify admins
    for admin_email in ["petersonyang8@gmail.com", "pierrendorimana16@gmail.com"]:
        try:
            create_notification(
                email=admin_email,
                title="New User Appeal Submitted",
                message=f"Suspended user {user_name} ({email}) submitted an appeal: \"{appeal_message[:70]}...\"",
                notif_type="system"
            )
        except Exception:
            pass

    return {
        "id": appeal_id,
        "email": email,
        "status": "pending",
        "created_at": now_iso,
        "message": "Appeal submitted successfully."
    }

def get_all_appeals(status: str = None) -> list[dict]:
    """Retrieve user appeals, optionally filtered by status (pending, approved, rejected)."""
    with SessionLocal() as db:
        query = db.query(UserAppeal)
        if status and status != "all":
            query = query.filter(UserAppeal.status == status)
        appeals = query.order_by(UserAppeal.id.desc()).all()
        return [
            {
                "id": a.id,
                "email": a.email,
                "user_name": a.user_name,
                "blocked_reason": a.blocked_reason,
                "appeal_message": a.appeal_message,
                "status": a.status,
                "admin_note": a.admin_note,
                "created_at": a.created_at,
                "reviewed_at": a.reviewed_at,
                "reviewed_by": a.reviewed_by
            } for a in appeals
        ]

def review_user_appeal(appeal_id: int, action: str, admin_note: str = "", admin_email: str = "Admin") -> dict:
    """Admin reviews an appeal: approve (restores user) or reject."""
    now_iso = datetime.now(timezone.utc).isoformat()
    target_email = None
    note_text = admin_note.strip() if admin_note else None
    with SessionLocal() as db:
        appeal = db.query(UserAppeal).filter(UserAppeal.id == appeal_id).first()
        if not appeal:
            raise ValueError("Appeal not found.")

        target_email = appeal.email
        appeal.reviewed_at = now_iso
        appeal.reviewed_by = admin_email
        appeal.admin_note = note_text

        if action == "approve":
            appeal.status = "approved"
            db.commit()
        elif action == "reject":
            appeal.status = "rejected"
            db.commit()
        else:
            raise ValueError(f"Invalid review action: {action}. Must be 'approve' or 'reject'.")

    if action == "approve":
        admin_unblock_user(target_email, admin_email=admin_email)
    elif action == "reject":
        try:
            create_notification(
                email=target_email,
                title="Appeal Decision: Declined",
                message=f"Your suspension appeal has been reviewed and declined. Note: {admin_note or 'Decision upheld.'}",
                notif_type="security"
            )
        except Exception:
            pass

    return {
        "id": appeal_id,
        "email": target_email,
        "status": "approved" if action == "approve" else "rejected",
        "admin_note": note_text,
        "reviewed_at": now_iso
    }
