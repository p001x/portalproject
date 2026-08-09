import re

with open("main.py", "r", encoding="utf-8") as f:
    content = f.read()

# Add API Key endpoints
api_key_endpoints = """
@app.post("/api/auth/api-key", tags=["auth"])
def generate_api_key_endpoint(user: dict = Depends(get_current_user)):
    try:
        new_key = generate_api_key_for_user(user["email"])
        return {"api_key": new_key}
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))

@app.get("/api/auth/api-key", tags=["auth"])
def get_api_key_endpoint(user: dict = Depends(get_current_user)):
    import auth_db
    db_user = auth_db.get_user_by_email(user["email"])
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")
    return {"api_key": db_user.get("api_key")}

"""
if "def generate_api_key_endpoint" not in content:
    content = content.replace("# ── Meta", api_key_endpoints + "\n# ── Meta")

# Import get_current_user
if "get_current_user" not in content[:500]:
    content = content.replace("from auth_users import get_current_user_or_api_key, generate_api_key_for_user",
                              "from auth_users import get_current_user, get_current_user_or_api_key, generate_api_key_for_user")

# Patch endpoints
def replacer(match):
    decorator = match.group(1)
    func_def = match.group(2)
    req_param = match.group(3)
    
    # Check if tags contains "analysis" or "export"
    if 'tags=["analysis"]' in decorator or 'tags=["export"]' in decorator:
        if "Depends(get_current_user" not in req_param:
            # We want to add the auth dependency.
            # E.g., def ndvi_endpoint(req: NDVIRequest): -> def ndvi_endpoint(req: NDVIRequest, user: dict = Depends(get_current_user_or_api_key)):
            if req_param.endswith(")"):
                if req_param == "()":
                    new_param = "(user: dict = Depends(get_current_user_or_api_key))"
                else:
                    new_param = req_param[:-1] + ", user: dict = Depends(get_current_user_or_api_key))"
            else:
                new_param = req_param # fallback
            return f"{decorator}\n{func_def}{new_param}:"
    return match.group(0)

pattern = r"(@app\.(?:post|get)\(.*?\))\n(def \w+)(\(.*?\)):"
new_content = re.sub(pattern, replacer, content)

with open("main.py", "w", encoding="utf-8") as f:
    f.write(new_content)
