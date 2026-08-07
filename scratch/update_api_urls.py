import os
import re

src_dir = r"c:\Users\user\Documents\blacportal\artifacts\geoportal\src"

files_to_check = []
for root, dirs, files in os.walk(src_dir):
    for f in files:
        if f.endswith(".ts") or f.endswith(".tsx"):
            files_to_check.append(os.path.join(root, f))

for filepath in files_to_check:
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    original_content = content

    # Replace fetch("/api/..."), fetch('/api/...'), fetch(`/api/...`)
    # We will capture the quote type and the rest of the URL, and replace it with a template literal.
    
    # 1. fetch("/api/something") -> fetch(`${import.meta.env.VITE_API_URL || ""}/api/something`)
    def replacer_fetch(match):
        quote = match.group(1)
        url_rest = match.group(2)
        # If the original quote was already a backtick, we just insert the variable
        # If it was a double or single quote, we must use backticks for the whole string.
        # But wait, if it was a double quote, we can just replace it with backticks. Does url_rest contain variables? No, because it was a double/single quote.
        return f'fetch(`${{import.meta.env.VITE_API_URL || ""}}/api/{url_rest}`'

    # match fetch( followed by whitespace, then quote, then /api/, then everything until that same quote
    content = re.sub(r'fetch\(\s*(["\'`])/api/(.*?)\1', replacer_fetch, content)

    # 2. form.action = "/api/..."
    def replacer_form(match):
        quote = match.group(1)
        url_rest = match.group(2)
        return f'form.action = `${{import.meta.env.VITE_API_URL || ""}}/api/{url_rest}`'
        
    content = re.sub(r'form\.action\s*=\s*(["\'`])/api/(.*?)\1', replacer_form, content)

    # 3. setNativePreviewUrl(`/api/...`)
    def replacer_setNative(match):
        quote = match.group(1)
        url_rest = match.group(2)
        return f'setNativePreviewUrl(`${{import.meta.env.VITE_API_URL || ""}}/api/{url_rest}`'
        
    content = re.sub(r'setNativePreviewUrl\(\s*(["\'`])/api/(.*?)\1', replacer_setNative, content)

    # 4. Other fetch(`/api/...`) that might have missing closing parenthesis in the regex? The above regex covers it if the string is complete.
    
    # What about queryFn: async () => (await fetch(`/api/analytics/summary${daysQuery}`)).json()
    # The regex `(.*?)` might stop early or not capture the inner `${}` properly if not careful.
    # Actually, Javascript template literals can have nested variables.
    # A safer approach for backticks is just to replace `/api/` with `${import.meta.env.VITE_API_URL || ""}/api/`
    
    if content != original_content:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"Updated {filepath}")

print("Done")
