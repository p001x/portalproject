import os

gee_dir = "backend/gee"
for file in os.listdir(gee_dir):
    if not file.endswith(".py"):
        continue
        
    filepath = os.path.join(gee_dir, file)
    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()
        
    lines = content.split('\n')
    
    # Check if we have the import
    has_import = False
    import_idx = -1
    for i, line in enumerate(lines):
        if line.strip() == "from gee.persistent_cache import with_cache":
            has_import = True
            import_idx = i
            break
            
    if has_import and import_idx > 5:
        # It's too far down. Remove it and put it at the top.
        lines.pop(import_idx)
        
        # Find first line that isn't empty or a docstring
        insert_idx = 0
        for i, line in enumerate(lines):
            if line.startswith("import ") or line.startswith("from "):
                insert_idx = i
                break
                
        lines.insert(insert_idx, "from gee.persistent_cache import with_cache")
        
        with open(filepath, "w", encoding="utf-8") as f:
            f.write("\n".join(lines))
        print(f"Fixed import in {file}")
