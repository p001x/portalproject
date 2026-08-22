import shutil
import os

source_logo = r"C:\Users\user\.gemini\antigravity-ide\brain\c06c4ee4-0cc3-4575-a133-a9130c3c456d\media__1786609255846.png"
streamlit_dest = r"C:\Users\user\Documents\blacportal\rwanda-geoportal\assets\logo.png"
react_dest = r"C:\Users\user\Documents\blacportal\artifacts\geoportal\public\logo.png"

# Create directories if they don't exist
os.makedirs(os.path.dirname(streamlit_dest), exist_ok=True)
os.makedirs(os.path.dirname(react_dest), exist_ok=True)

# Copy files
shutil.copy2(source_logo, streamlit_dest)
shutil.copy2(source_logo, react_dest)

print("New uploaded logo copied successfully to both frontends!")
