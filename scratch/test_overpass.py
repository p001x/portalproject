import requests

def get_overpass_points(amenities, bbox):
    # bbox: [minx, miny, maxx, maxy]
    # Overpass bbox format: south,west,north,east -> miny,minx,maxy,maxx
    overpass_bbox = f"{bbox[1]},{bbox[0]},{bbox[3]},{bbox[2]}"
    
    amenity_query = "".join([f'node["amenity"="{a}"]({overpass_bbox});way["amenity"="{a}"]({overpass_bbox});relation["amenity"="{a}"]({overpass_bbox});' for a in amenities])
    
    query = f"""
    [out:json][timeout:25];
    (
      {amenity_query}
    );
    out center;
    """
    print(query)
    url = "http://overpass-api.de/api/interpreter"
    response = requests.post(url, data={'data': query})
    response.raise_for_status()
    data = response.json()
    
    points = []
    for element in data['elements']:
        if element['type'] == 'node':
            points.append([element['lon'], element['lat']])
        elif 'center' in element:
            points.append([element['center']['lon'], element['center']['lat']])
            
    return points

if __name__ == "__main__":
    bbox = [30.0, -2.0, 30.1, -1.9] # approx Kigali center
    pts = get_overpass_points(["school", "hospital"], bbox)
    print(f"Found {len(pts)} facilities")
