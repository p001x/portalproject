import os

def optimize_gee_scripts(directory):
    for root, dirs, files in os.walk(directory):
        for file in files:
            if file.endswith(".py"):
                filepath = os.path.join(root, file)
                with open(filepath, "r", encoding="utf-8") as f:
                    content = f.read()
                
                # We also change tileScale if needed, but just changing maxPixels is the key
                new_content = content.replace("maxPixels=1e6", "maxPixels=10000")
                new_content = new_content.replace("maxPixels=1000000", "maxPixels=10000")
                
                if new_content != content:
                    with open(filepath, "w", encoding="utf-8") as f:
                        f.write(new_content)
                    print(f"Optimized {file}")

if __name__ == "__main__":
    gee_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "backend", "gee")
    optimize_gee_scripts(gee_dir)
