import re
try:
    import magic
    HAS_MAGIC = True
except ImportError:
    HAS_MAGIC = False
try:
    from PIL import Image
    HAS_PIL = True
except ImportError:
    HAS_PIL = False

import io
import unicodedata
from fastapi import HTTPException
import logging

logger = logging.getLogger(__name__)

# --- LAYER 1 & 2: Regex & Unicode Filtering ---

DANGEROUS_PATTERNS = [
    r"<script.*?>.*?</script>",  # basic XSS
    r"eval\s*\(",                 # JS eval
    r"(?i)union\s+select",       # SQL injection
    r"(?i)drop\s+table",
    r"<\?php",                   # PHP tags
    r"\.\./\.\./",               # path traversal
    r"/bin/bash",                # shell command
    r"wget\s+http",              # shell command
    r"curl\s+-",                 # shell command
]

SPAM_PHRASES = [
    r"(?i)buy crypto",
    r"(?i)invest now",
    r"(?i)click here to win",
    r"(?i)hot singles",
]

def strip_zero_width(text: str) -> str:
    """Removes zero-width characters and hidden unicode tricks."""
    # Remove characters categorized as formatting or control (e.g. zero-width joiners)
    return ''.join(c for c in text if unicodedata.category(c)[0] not in ['C', 'Z'] or c == ' ')

def check_symbol_ratio(text: str) -> bool:
    """Returns True if the text has an unusually high amount of symbols/punctuation."""
    if not text:
        return False
    symbols = sum(1 for c in text if not c.isalnum() and not c.isspace())
    if len(text) > 20 and (symbols / len(text)) > 0.4:
        return True
    return False

def check_repeating_chars(text: str) -> bool:
    """Returns True if the text contains excessive repeating characters (e.g. aaaaaaa)."""
    return bool(re.search(r'(.)\1{7,}', text))

def validate_and_sanitize_text(text: str) -> str:
    """
    Passes the text through all security and moderation layers.
    Raises ValueError if malicious or spam text is detected.
    Returns the sanitized string.
    """
    if not text or not text.strip():
        raise ValueError("Comment cannot be empty.")
    
    # 1. Strip hidden unicode
    text = strip_zero_width(text).strip()
    
    # 1.5 Strict Alphanumeric check removed to allow Markdown and punctuation.
    
    # 2. Regex Blocking
    for pattern in DANGEROUS_PATTERNS:
        if re.search(pattern, text):
            logger.warning(f"Malicious pattern blocked: {pattern}")
            raise ValueError("Comment contains blocked or unsafe content.")
            
    # 3. Layer 3 Heuristics (Spam & Gibberish)
    if check_symbol_ratio(text):
        raise ValueError("Comment contains too many symbols.")
        
    if check_repeating_chars(text):
        raise ValueError("Comment contains excessive repeating characters.")
        
    for pattern in SPAM_PHRASES:
        if re.search(pattern, text):
            raise ValueError("Comment flagged as spam.")
            
    # Optional: ensure it has at least some normal readable letters
    letters = sum(1 for c in text if c.isalpha())
    if letters < 3:
        raise ValueError("Comment does not contain enough readable characters.")
        
    return text

# --- IMAGE SECURITY ---

def validate_and_reencode_image(file_bytes: bytes) -> bytes:
    """
    1. Checks the physical byte signature via python-magic.
    2. Opens and decodes the image via Pillow.
    3. Re-encodes from scratch (stripping EXIF and potential payloads).
    Returns safe JPG bytes.
    """
    if not file_bytes:
        raise ValueError("Empty file.")
        
    # 1. Byte-level verification using python-magic (if available)
    if HAS_MAGIC:
        file_mime = magic.from_buffer(file_bytes, mime=True)
        if file_mime not in ["image/jpeg", "image/png"]:
            raise ValueError(f"Invalid image type detected ({file_mime}). Only genuine PNG or JPG files are allowed.")
    else:
        logger.warning("python-magic is not installed. Skipping byte-level mime type check.")
        
    # 2. Decode via Pillow
    if HAS_PIL:
        try:
            img = Image.open(io.BytesIO(file_bytes))
            img.verify() # Verify it's not corrupt
        except Exception as e:
            logger.warning(f"Image verification failed: {e}")
            raise ValueError("Invalid or corrupted image file.")
            
        # Pillow's verify() doesn't actually read the whole file. We must re-open to load data.
        try:
            img = Image.open(io.BytesIO(file_bytes))
            # Convert to RGB to remove alpha channels (if PNG) and ensure standard format
            if img.mode != 'RGB':
                img = img.convert('RGB')
                
            # 3. Re-encode from scratch, omitting EXIF
            out_bytes = io.BytesIO()
            img.save(out_bytes, format='JPEG', quality=85)
            return out_bytes.getvalue()
        except Exception as e:
            logger.warning(f"Image processing failed: {e}")
            raise ValueError("Failed to process image safely.")
    else:
        logger.warning("Pillow is not installed. Returning original bytes.")
        return file_bytes
