import sys; sys.path.append('backend')
from storage.dataset_storage import load_metadata
print("Admin datasets:", len(load_metadata('admin')))
print("Community datasets:", len(load_metadata('community')))
