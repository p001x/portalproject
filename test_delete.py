import sys; sys.path.append('backend')
from storage.dataset_storage import load_metadata, delete_record

records = load_metadata('admin')
if not records:
    print("No admin records")
else:
    print("First record:", records[0])
    try:
        res = delete_record(records[0]['id'], 'admin')
        print("Delete res:", res)
    except Exception as e:
        import traceback
        traceback.print_exc()

