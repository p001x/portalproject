from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

try:
    print("Hashing short password...")
    h = pwd_context.hash("petersonyang")
    print(h)
    
    print("Hashing 73 bytes...")
    pwd_context.hash("a" * 73)
except Exception as e:
    print(f"Exception: {type(e).__name__} - {e}")
