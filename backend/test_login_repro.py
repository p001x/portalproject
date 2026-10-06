import sys
sys.path.append('.')
from auth_users import verify_user, create_new_user

try:
    print("Testing create user...")
    create_new_user("Test User", "test_login@example.com", "password123")
except Exception as e:
    print("Create user error or already exists:", e)

try:
    print("Testing verify_user...")
    user = verify_user("test_login@example.com", "password123")
    print("User:", user)
except Exception as e:
    import traceback
    traceback.print_exc()
