import re

with open('backend/main.py', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Replace Depends(get_current_user_or_api_key) with Depends(check_gee_rate_limit) in endpoints tagged analysis
content = re.sub(
    r'(def [a-zA-Z0-9_]+_endpoint\(.*?user: dict = Depends\()get_current_user_or_api_key(\)\):)', 
    r'\1check_gee_rate_limit\2', 
    content
)

# 2. Add Depends(check_gee_rate_limit) to endpoints that don't have a user dependency
content = re.sub(
    r'(@app\.post\(\"/api/[^\"]+\", tags=\[\"analysis\"\]\)\n(?:@[^\n]+\n)*def [a-zA-Z0-9_]+_endpoint\(req: [a-zA-Z0-9_]+Request)\):', 
    r'\1, user: dict = Depends(check_gee_rate_limit)):', 
    content
)

with open('backend/main.py', 'w', encoding='utf-8') as f:
    f.write(content)

print('Patch applied successfully!')
