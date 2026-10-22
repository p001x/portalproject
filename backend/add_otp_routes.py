import os
from pathlib import Path

_HERE = Path(__file__).resolve().parent
main_file = _HERE / "main.py"

routes_to_add = """

# --- NEW OTP AND GOOGLE LOGIN ROUTES ---

class OTPRequest(BaseModel):
    email: str = Field(..., min_length=3)

class OTPVerifyRequest(BaseModel):
    email: str = Field(..., min_length=3)
    code: str = Field(..., min_length=6, max_length=6)

class GoogleAuthRequest(BaseModel):
    token: str

@app.post("/api/auth/otp/request", tags=["auth"])
def request_otp(req: OTPRequest):
    email = req.email.strip().lower()
    from auth_db import save_otp
    from email_sender import send_otp_email
    try:
        code = save_otp(email, expires_in_minutes=10)
        send_otp_email(email, code)
        return {"ok": True, "message": "Verification code sent."}
    except Exception as e:
        logger.error(f"Error requesting OTP: {e}")
        raise HTTPException(500, "Could not process OTP request.")

@app.post("/api/auth/otp/verify", tags=["auth"])
def verify_otp_endpoint(req: OTPVerifyRequest):
    email = req.email.strip().lower()
    code = req.code.strip()
    
    from auth_db import verify_otp, get_user_by_email, create_user, mark_user_verified
    from auth_users import create_access_token
    
    if not verify_otp(email, code):
        raise HTTPException(400, "Invalid or expired verification code.")
        
    user = get_user_by_email(email)
    
    if not user:
        # Auto-create user if they don't exist yet (passwordless signup)
        name = email.split("@")[0].replace(".", " ").title()
        create_user(name=name, email=email, password_hash=None, is_verified=True)
        user = get_user_by_email(email)
    else:
        # Mark as verified
        mark_user_verified(email)
        user["is_verified"] = True
        
    token = create_access_token({"sub": user["email"], "name": user["name"], "role": user["role"]})
    
    user_dict = {
        "id": str(user.get("id") or user.get("email")),
        "email": str(user["email"]),
        "name": str(user["name"]),
        "role": str(user.get("role", "user")),
    }
    
    return {"ok": True, "token": str(token), "user": user_dict}

@app.post("/api/auth/google", tags=["auth"])
def google_auth(req: GoogleAuthRequest):
    try:
        from google.oauth2 import id_token
        from google.auth.transport import requests as google_requests
        
        # In a real app, define GOOGLE_CLIENT_ID in .env
        CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID", "YOUR_GOOGLE_CLIENT_ID_HERE")
        
        if CLIENT_ID == "YOUR_GOOGLE_CLIENT_ID_HERE":
            logger.warning("Using mock Google auth validation. Client ID not set.")
            # For mock testing, just trust the token if it's our test token or decode it manually without verification
            import jwt
            try:
                idinfo = jwt.decode(req.token, options={"verify_signature": False})
            except Exception:
                raise ValueError("Invalid mock token")
        else:
            idinfo = id_token.verify_oauth2_token(req.token, google_requests.Request(), CLIENT_ID)
            
        email = idinfo.get("email").lower()
        name = idinfo.get("name", email.split("@")[0])
        google_id = idinfo.get("sub")
        
        from auth_db import get_user_by_email, create_user, mark_user_verified
        from auth_users import create_access_token
        
        user = get_user_by_email(email)
        if not user:
            create_user(name=name, email=email, password_hash=None, google_id=google_id, is_verified=True)
            user = get_user_by_email(email)
        elif not user.get("google_id"):
            # Link existing account to Google
            import auth_db
            with auth_db.SessionLocal() as db:
                db_user = db.query(auth_db.User).filter(auth_db.User.email == email).first()
                db_user.google_id = google_id
                db_user.is_verified = True
                db.commit()
            user = get_user_by_email(email)
            
        token = create_access_token({"sub": user["email"], "name": user["name"], "role": user["role"]})
        
        user_dict = {
            "id": str(user.get("id") or user.get("email")),
            "email": str(user["email"]),
            "name": str(user["name"]),
            "role": str(user.get("role", "user")),
        }
        
        return {"ok": True, "token": str(token), "user": user_dict}

    except ValueError as e:
        logger.error(f"Google Token Verification failed: {e}")
        raise HTTPException(401, "Invalid Google token.")
    except Exception as e:
        logger.error(f"Google auth error: {e}")
        raise HTTPException(500, "Error during Google authentication.")

"""

def append_routes():
    content = main_file.read_text(encoding="utf-8")
    if "def request_otp(" not in content:
        with open(main_file, "a", encoding="utf-8") as f:
            f.write(routes_to_add)
        print("Routes appended to main.py")
    else:
        print("Routes already exist in main.py")

if __name__ == "__main__":
    append_routes()
