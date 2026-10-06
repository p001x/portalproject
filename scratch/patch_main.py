with open('backend/main.py', 'r', encoding='utf-8') as f:
    code = f.read()

# Replace 1
old_call = '''            reverse_cdd=req.reverse_cdd,
            reverse_evi=req.reverse_evi,
            method=req.method, custom_labels=req.custom_labels
        )'''
new_call = '''            reverse_cdd=req.reverse_cdd,
            reverse_evi=req.reverse_evi,
            method=req.method, custom_labels=req.custom_labels,
            weights=req.custom_weights
        )'''
code = code.replace(old_call, new_call)

new_endpoint = '''@app.post("/api/drought/ahp", tags=["analysis"])
def drought_ahp_endpoint(req: DroughtAhpRequest):
    try:
        from gee.drought import compute_ahp_data as compute_drought_ahp
        return compute_drought_ahp(req.custom_weights or {})
    except Exception as exc:
        logger.exception("Drought AHP computation failed")
        raise HTTPException(status_code=500, detail=str(exc)) from exc

@app.post("/api/drought", tags=["analysis"])'''

old_endpoint = '''@app.post("/api/drought", tags=["analysis"])'''
code = code.replace(old_endpoint, new_endpoint)

with open('backend/main.py', 'w', encoding='utf-8') as f:
    f.write(code)
