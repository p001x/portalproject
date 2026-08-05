import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import axios from 'axios';

import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet-draw';
import 'leaflet-draw/dist/leaflet.draw.css';

// Fix Leaflet default icon
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

const API = 'http://localhost:8000/api';
const RWANDA_CENTER = [-1.94, 29.87];
const INITIAL_CLASSES = [
  { label: 'Forest', color: '#1a9850' },
  { label: 'Cropland', color: '#fdae61' },
  { label: 'Bare Ground', color: '#d73027' },
  { label: 'Water', color: '#2166ac' },
  { label: 'Urban', color: '#8c510a' },
  { label: 'Shrubland', color: '#762a83' }
];

const inputCls = "w-full bg-slate-700 text-slate-100 border border-slate-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 placeholder-slate-500";
const btnPrimary = "bg-emerald-600 hover:bg-emerald-500 text-white font-semibold px-4 py-2 rounded-lg text-sm transition-colors";
const btnSecondary = "bg-slate-700 hover:bg-slate-600 text-slate-200 font-medium px-4 py-2 rounded-lg text-sm transition-colors";
const btnDanger = "bg-red-800 hover:bg-red-700 text-red-100 font-medium px-3 py-1.5 rounded text-xs transition-colors";

function colorForClass(label, customClassesArray) {
  if (!customClassesArray) return '#94a3b8';
  const cls = customClassesArray.find(c => c.label === label);
  return cls ? cls.color : '#94a3b8';
}

// ─────────────────────────────────────────────────────────────────
// Map Draw Control
// ─────────────────────────────────────────────────────────────────
function NativeDrawControl({ onCreated, featureGroupRef, enabled }) {
  const map = useMap();
  useEffect(() => {
    if (!map) return;
    
    // Lazy load L and draw to avoid SSR/build issues
    const L = window.L;
    if (!L || !L.Control.Draw) return;

    const drawnItems = new L.FeatureGroup();
    map.addLayer(drawnItems);
    featureGroupRef.current = drawnItems;

    const drawControl = new L.Control.Draw({
      edit: {
        featureGroup: drawnItems,
        remove: false, // We'll manage deletion from the list
        edit: false,
      },
      draw: enabled ? {
        polygon: true,
        rectangle: true,
        circle: false,
        circlemarker: false,
        marker: true,
        polyline: true,
      } : false
    });
    
    if (enabled) {
      map.addControl(drawControl);
    }

    const handleCreated = (e) => {
      if (onCreated) onCreated({ layer: e.layer });
    };

    map.on(L.Draw.Event.CREATED, handleCreated);
    
    return () => {
      map.off(L.Draw.Event.CREATED, handleCreated);
      if (enabled) map.removeControl(drawControl);
      map.removeLayer(drawnItems);
    };
  }, [map, enabled, onCreated, featureGroupRef]);

  return null;
}

// ── Sample marker ─────────────────────────────────────────────────────────────
function SampleMarker({ sample, color, onDelete }) {
  const geom = sample.geometry;
  if (!geom) return null;

  const pos = geom.type === 'Point'
    ? [geom.coordinates[1], geom.coordinates[0]]
    : null;

  if (!pos) return null;

  const icon = L.divIcon({
    className: '',
    html: `<div style="width:14px;height:14px;border-radius:50%;background:${color};border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,.5)"></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });

  return (
    <Marker position={pos} icon={icon}
      eventHandlers={{ click: () => onDelete(sample.id) }}>
    </Marker>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Digitization Page
// ─────────────────────────────────────────────────────────────────────────────
export default function DigitizationPage() {


  // Samples state
  const [samples, setSamples] = useState([]);
  const [loadingSamples, setLoadingSamples] = useState(false);
  const [hiddenClasses, setHiddenClasses] = useState(new Set());

  // Current drawing config
  const [activeClass, setActiveClass] = useState(INITIAL_CLASSES[0].label);
  const [customClasses, setCustomClasses] = useState(INITIAL_CLASSES);
  const [newClass, setNewClass] = useState('');
  const [newClassColor, setNewClassColor] = useState('#10b981');
  const [digitizing, setDigitizing] = useState(false);
  const [creator, setCreator] = useState('');

  // Context layer (optional XYZ tile URL to overlay while digitizing)
  const [contextTileUrl, setContextTileUrl] = useState('');
  const [datasets, setDatasets] = useState([]);
  const [selectedDatasetId, setSelectedDatasetId] = useState('');
  const [previewData, setPreviewData] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState(null);
  const [activeContextDataset, setActiveContextDataset] = useState(null); // {id, name}

  // GEE Push state
  const [geeFile, setGeeFile] = useState(null);
  const [geeAssetName, setGeeAssetName] = useState('');
  const [pushingGee, setPushingGee] = useState(false);
  const [geeStatus, setGeeStatus] = useState('');

  // Quick Add via Link state
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [quickAddUrl, setQuickAddUrl] = useState('');
  const [quickAddName, setQuickAddName] = useState('');
  const [quickAddBusy, setQuickAddBusy] = useState(false);
  const [quickAddStatus, setQuickAddStatus] = useState('');

  // Classification state
  const [classifyLoading, setClassifyLoading] = useState(false);
  const [classifyResult, setClassifyResult] = useState(null);
  const [classifyError, setClassifyError] = useState('');

  // Panel tab
  const [panel, setPanel] = useState('digitize'); // 'digitize' | 'samples' | 'geepush' | 'classify' | 'export'
  
  const featureGroupRef = useRef(null);



  const loadSamples = useCallback(async () => {
    setLoadingSamples(true);
    try {
      const res = await axios.get(`${API}/samples`);
      setSamples(res.data.samples || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingSamples(false);
    }
  }, []);

  const loadDatasets = useCallback(async () => {
    try {
      const resA = await axios.get(`${API}/datasets?source=admin`);
      const resC = await axios.get(`${API}/datasets?source=community`);
      setDatasets([...(resA.data.records || []), ...(resC.data.records || [])]);
    } catch (e) {
      console.error("Failed to load datasets for context layer", e);
    }
  }, []);

  const handleQuickAdd = async (e) => {
    e.preventDefault();
    if (!quickAddUrl || !quickAddName) return;
    setQuickAddBusy(true);
    setQuickAddStatus('Fetching dataset...');
    try {
      const res = await axios.post(`${API}/datasets/link`, {
        url: quickAddUrl,
        name: quickAddName,
        description: 'Added via Digitization Quick Link',
        source: 'community'
      });
      setQuickAddStatus('✅ Added!');
      // Reload datasets
      const resA = await axios.get(`${API}/datasets?source=admin`);
      const resC = await axios.get(`${API}/datasets?source=community`);
      setDatasets([...(resA.data.records || []), ...(resC.data.records || [])]);
      if (res.data && res.data.id) {
         setSelectedDatasetId(res.data.id);
      }
      setTimeout(() => {
         setShowQuickAdd(false);
         setQuickAddStatus('');
         setQuickAddUrl('');
         setQuickAddName('');
      }, 2000);
    } catch (err) {
      setQuickAddStatus(`❌ ${err.response?.data?.detail || err.message}`);
    } finally {
      setQuickAddBusy(false);
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setQuickAddBusy(true);
    setQuickAddStatus('Uploading file...');
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('name', file.name);
      formData.append('source', 'community');
      formData.append('description', 'Uploaded via Digitization Page');
      
      const res = await axios.post(`${API}/datasets/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setQuickAddStatus('✅ Uploaded!');
      
      const resA = await axios.get(`${API}/datasets?source=admin`);
      const resC = await axios.get(`${API}/datasets?source=community`);
      setDatasets([...(resA.data.records || []), ...(resC.data.records || [])]);
      
      if (res.data && res.data.id) {
         setSelectedDatasetId(res.data.id);
      }
      setTimeout(() => setQuickAddStatus(''), 2000);
    } catch (err) {
      setQuickAddStatus(`❌ ${err.response?.data?.detail || err.message}`);
    } finally {
      setQuickAddBusy(false);
      e.target.value = ''; // reset file input
    }
  };

  useEffect(() => { loadSamples(); loadDatasets(); }, [loadSamples, loadDatasets]);

  // Load preview if a context dataset is selected
  useEffect(() => {
    if (!selectedDatasetId) {
      setPreviewData(null);
      setPreviewLoading(false);
      return;
    }
    const d = datasets.find(x => x.id === selectedDatasetId);
    if (!d) return;

    // Step 1: instantly show the bounding box (no file download needed)
    axios.get(`${API}/datasets/${d.id}/bbox?source=${d.source}`)
      .then(res => {
        setPreviewData(res.data);
      })
      .catch(() => {
        // bbox not available – try full preview
        axios.get(`${API}/datasets/${d.id}/preview?source=${d.source}`)
          .then(res => setPreviewData(res.data))
          .catch(err => {
            console.error('Failed to load preview', err);
          });
      });

    // Step 2: also load full preview data on top of the bbox (image or geojson)
    if (['geojson', 'shapefile', 'csv', 'tiff'].includes(d.file_type)) {
      setPreviewLoading(true);
      setPreviewError(null);
      axios.get(`${API}/datasets/${d.id}/preview?source=${d.source}`)
        .then(res => {
           if (res.data.type === 'bbox') {
             // Backend fell back to bbox because full preview failed
             setPreviewError(`Full image preview unavailable for "${d.name}". Showing bounding box instead.`);
           } else {
             setPreviewError(null);
           }
           setPreviewData(res.data);
           setPreviewLoading(false);
        })
        .catch(err => {
           console.error('Full preview failed', err);
           setPreviewError(`Failed to load preview for "${d.name}".`);
           setPreviewLoading(false);
        });
    }
  }, [selectedDatasetId, datasets]);

  // Handle a new drawn feature from NativeDrawControl
  const handleCreated = useCallback(async ({ layer }) => {
    try {
      const geojson = layer.toGeoJSON();
      // Only keep the geometry
      await axios.post(`${API}/samples`, {
        geometry: geojson.geometry,
        class_label: activeClass,
        creator: creator || 'anonymous',
        color: colorForClass(activeClass, customClasses),
      });
      loadSamples();
      
      // We don't keep the temporary layer in the draw FeatureGroup
      // because we re-render everything from the `samples` state.
      if (featureGroupRef.current) {
         featureGroupRef.current.removeLayer(layer);
      }
    } catch (e) {
      alert(e.response?.data?.detail || 'Failed to save sample');
    }
  }, [activeClass, creator, customClasses, loadSamples]);

  // Delete sample
  const handleDeleteSample = async (id) => {
    if (!window.confirm('Remove this sample?')) return;
    try {
      await axios.delete(`${API}/samples/${id}`);
      loadSamples();
    } catch (e) {
      alert('Delete failed');
    }
  };

  const handleGeePush = async (e) => {
    e.preventDefault();
    if (!geeFile || !geeAssetName) return;
    setPushingGee(true);
    setGeeStatus('Uploading & pushing...');
    
    const formData = new FormData();
    formData.append('file', geeFile);
    formData.append('asset_name', geeAssetName);

    try {
      const res = await axios.post(`${API}/samples/push-to-gee`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setGeeStatus(`✅ ${res.data.detail}`);
    } catch (err) {
      setGeeStatus(`❌ ${err.response?.data?.detail || err.message}`);
    } finally {
      setPushingGee(false);
    }
  };

  const handleClassify = async () => {
    setClassifyLoading(true);
    setClassifyError('');
    setClassifyResult(null);
    try {
      // Use the preview bounds if available, else let backend use sample bounds
      let aoi = null;
      if (previewData && previewData.bounds) {
        aoi = { type: 'bbox', bounds: previewData.bounds };
      }
      const res = await axios.post(`${API}/classify/supervised`, { aoi });
      setClassifyResult(res.data);
      // Auto switch to show context layer if it's not already active so they can see the classification tile
      setContextTileUrl(res.data.tile_url);
    } catch (err) {
      setClassifyError(err.response?.data?.detail || err.message);
    } finally {
      setClassifyLoading(false);
    }
  };

  // Export GeoJSON
  const exportGeoJSON = () => {
    window.open(`${API}/samples/export/geojson`, '_blank');
  };

  // Export Shapefile
  const exportShapefile = () => {
    window.open(`${API}/samples/export/shapefile`, '_blank');
  };

  // Add custom class
  const addCustomClass = () => {
    const c = newClass.trim();
    if (!c || customClasses.some(x => x.label === c)) return;
    setCustomClasses(prev => [...prev, { label: c, color: newClassColor }]);
    setActiveClass(c);
    setNewClass('');
  };

  // Build a simple GeoJSON FeatureCollection of all samples for the GeoJSON layer
  const samplesGeojson = {
    type: 'FeatureCollection',
    features: samples
      .filter(s => s.geometry?.type !== 'Point') // points shown as markers
      .map(s => ({
        type: 'Feature',
        geometry: s.geometry,
        properties: { class_label: s.class_label, id: s.id },
      })),
  };

  const classCounts = samples.reduce((acc, s) => {
    acc[s.class_label] = (acc[s.class_label] || 0) + 1;
    return acc;
  }, {});


  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const layersRef = useRef({
    base: null,
    context: null,
    preview: null,
    previewVector: null,
    previewBbox: null,
    samplesGeojson: null,
    markers: null,
    drawnItems: null
  });

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;
    
    window.L = L;
    
    const map = L.map(mapContainerRef.current).setView(RWANDA_CENTER, 9);
    mapInstanceRef.current = map;
    
    layersRef.current.base = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);

    // Force Leaflet to recalculate the map size since flex-1 might delay width allocation
    setTimeout(() => {
      map.invalidateSize();
    }, 250);

    layersRef.current.drawnItems = new L.FeatureGroup();
    map.addLayer(layersRef.current.drawnItems);
    
    layersRef.current.markers = L.layerGroup();
    map.addLayer(layersRef.current.markers);

    if (window.L.Control.Draw) {
      const drawControl = new window.L.Control.Draw({
        edit: {
          featureGroup: layersRef.current.drawnItems,
          remove: false,
          edit: false,
        },
        draw: {
          polygon: true,
          rectangle: true,
          circle: false,
          circlemarker: false,
          marker: true,
          polyline: true,
        }
      });
      map.addControl(drawControl);
    }

    map.on('draw:created', (e) => {
      // Send to API
      const geojson = e.layer.toGeoJSON();
      axios.post(`${API}/samples`, {
        geometry: geojson.geometry,
        class_label: activeClassRef.current, // We need a ref for activeClass
        creator: creatorRef.current || 'anonymous',
        color: colorForClass(activeClassRef.current, customClassesRef.current),
      }).then(() => {
        loadSamplesRef.current();
      }).catch(err => {
        alert(err?.response?.data?.detail || 'Failed to save sample');
      });
    });

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []); // Run once
  
  // Refs for callbacks
  const activeClassRef = useRef(activeClass);
  const customClassesRef = useRef(customClasses);
  const creatorRef = useRef(creator);
  const loadSamplesRef = useRef(loadSamples);
  
  useEffect(() => { activeClassRef.current = activeClass; }, [activeClass]);
  useEffect(() => { customClassesRef.current = customClasses; }, [customClasses]);
  useEffect(() => { creatorRef.current = creator; }, [creator]);
  useEffect(() => { loadSamplesRef.current = loadSamples; }, [loadSamples]);

  // Sync context layer
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !window.L) return;
    
    if (layersRef.current.context) {
      map.removeLayer(layersRef.current.context);
    }
    
    if (contextTileUrl) {
      layersRef.current.context = window.L.tileLayer(contextTileUrl, { opacity: 0.7, maxZoom: 20 }).addTo(map);
    }
  }, [contextTileUrl]);

  // Sync preview data to map
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !window.L) return;

    // Remove old layers
    if (layersRef.current.preview) { map.removeLayer(layersRef.current.preview); layersRef.current.preview = null; }
    if (layersRef.current.previewVector) { map.removeLayer(layersRef.current.previewVector); layersRef.current.previewVector = null; }
    if (layersRef.current.previewBbox) { map.removeLayer(layersRef.current.previewBbox); layersRef.current.previewBbox = null; }

    if (!previewData) return;

    if (previewData.type === 'bbox' && previewData.bounds) {
      // Draw a dashed rectangle showing the dataset footprint
      const rect = window.L.rectangle(previewData.bounds, {
        color: '#f59e0b',
        weight: 2,
        dashArray: '6 4',
        fillColor: '#f59e0b',
        fillOpacity: 0.08,
      });
      rect.bindTooltip(
        `<strong>${previewData.name || 'Dataset'}</strong><br><span style="text-transform:uppercase;font-size:10px;color:#f59e0b">${previewData.file_type}</span>`,
        { permanent: false, direction: 'center', className: 'leaflet-tooltip-dataset' }
      );
      rect.addTo(map);
      layersRef.current.previewBbox = rect;
      map.fitBounds(previewData.bounds, { padding: [40, 40] });
    }

    if (previewData.type === 'image' && previewData.bounds) {
      layersRef.current.preview = window.L.imageOverlay(previewData.data, previewData.bounds, { opacity: 0.8 }).addTo(map);
      map.fitBounds(previewData.bounds, { padding: [40, 40] });
    }

    if (previewData.type === 'FeatureCollection') {
      layersRef.current.previewVector = window.L.geoJSON(previewData, {
        style: { color: '#3b82f6', weight: 2, fillOpacity: 0.15 },
        pointToLayer: (f, latlng) => window.L.circleMarker(latlng, { radius: 5, color: '#3b82f6' }),
      }).addTo(map);
      try { map.fitBounds(layersRef.current.previewVector.getBounds(), { padding: [40, 40] }); } catch (_) {}
    }
  }, [previewData]);

  // Sync samples geojson (polygons)
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !window.L || !samplesGeojson) return;

    if (layersRef.current.samplesGeojson) {
      map.removeLayer(layersRef.current.samplesGeojson);
    }

    // Filter out hidden classes
    const visibleFeatures = samplesGeojson.features.filter(f => !hiddenClasses.has(f.properties.class_label));

    if (visibleFeatures.length > 0) {
      const fc = { type: 'FeatureCollection', features: visibleFeatures };
      layersRef.current.samplesGeojson = window.L.geoJSON(fc, {
        style: (f) => ({
          color: colorForClass(f.properties.class_label, customClasses),
          weight: 2,
          fillOpacity: 0.4
        })
      }).addTo(map);
    }
  }, [samplesGeojson, customClasses, hiddenClasses]);

  // Sync sample markers (points)
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !window.L || !layersRef.current.markers) return;

    layersRef.current.markers.clearLayers();
    
    const visibleSamples = samples.filter(s => !hiddenClasses.has(s.class_label));
    
    visibleSamples.filter(s => s.geometry?.type === 'Point').forEach(s => {
      const pos = [s.geometry.coordinates[1], s.geometry.coordinates[0]];
      const color = colorForClass(s.class_label, customClasses);
      const icon = window.L.divIcon({
        className: '',
        html: `<div style="width:14px;height:14px;border-radius:50%;background:${color};border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,.5)"></div>`,
        iconSize: [14, 14],
        iconAnchor: [7, 7],
      });
      const marker = window.L.marker(pos, { icon }).addTo(layersRef.current.markers);
      marker.on('click', () => handleDeleteSample(s.id));
    });
  }, [samples, customClasses, hiddenClasses]);

  return (
    <div className="flex w-full h-full overflow-hidden">
      {/* Left panel */}
      <div className="w-72 bg-slate-900 border-r border-slate-700 flex flex-col overflow-hidden shrink-0">
        {/* Panel tab switcher */}
        <div className="flex flex-wrap border-b border-slate-700 bg-slate-900">
          {[['digitize','✏️ Draw'],['samples','🗂 Data'],['classify','🧠 Classify'],['export','⬇ Export']].map(([key, label]) => (
            <button key={key} onClick={() => setPanel(key)}
              className={`flex-1 min-w-[25%] py-2.5 text-[10px] uppercase tracking-wider font-bold transition-colors ${
                panel === key ? 'border-b-2 border-emerald-500 text-emerald-400 bg-slate-800' : 'text-slate-400 hover:text-slate-200'
              }`}>
              {label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">

          {/* ── DIGITIZE PANEL ── */}
          {panel === 'digitize' && (
            <>
              <div>
                <label className="text-xs font-medium text-slate-400 uppercase tracking-wide block mb-2">Active Class</label>
                <div className="flex flex-wrap gap-1.5">
                  {customClasses.map((cls, i) => {
                    const color = cls.color;
                    const isActive = activeClass === cls.label;
                    return (
                      <button key={cls.label} onClick={() => setActiveClass(cls.label)}
                        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all border ${
                          isActive
                            ? 'text-white border-transparent shadow'
                            : 'bg-slate-800 text-slate-300 border-slate-600 hover:border-slate-400'
                        }`}
                        style={isActive ? { background: color } : {}}>
                        {!isActive && <span className="w-2 h-2 rounded-full" style={{ background: color }} />}
                        {cls.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Add new class */}
              <div className="flex gap-2">
                <input placeholder="New class…" value={newClass}
                  onChange={e => setNewClass(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addCustomClass()}
                  className={inputCls} />
                <button onClick={addCustomClass} className={btnSecondary}>+</button>
              </div>

              {/* Creator name */}
              <div>
                <label className="text-xs text-slate-400 block mb-1">Your name (optional)</label>
                <input placeholder="anonymous" value={creator} onChange={e => setCreator(e.target.value)} className={inputCls} />
              </div>

              {/* Toggle digitizing */}
              <button
                onClick={() => setDigitizing(v => !v)}
                className={`w-full py-2.5 rounded-lg font-semibold text-sm transition-all ${
                  digitizing
                    ? 'bg-amber-600 hover:bg-amber-500 text-white'
                    : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                }`}>
                {digitizing ? '⏸ Stop Drawing Tools' : '▶ Enable Drawing Tools'}
              </button>

              {digitizing && (
                <div className="bg-emerald-900/40 border border-emerald-700 rounded-lg p-3 text-xs text-emerald-300">
                  <p className="font-semibold mb-1">🖱 Drawing tools active!</p>
                  <p>Use the toolbar on the map to draw points, lines, or polygons. They will be saved as <strong>{activeClass}</strong>.</p>
                </div>
              )}

              {/* Context layer */}
              <div className="mt-4 pt-4 border-t border-slate-700">
                <div className="flex items-center justify-between mb-3">
                  <label className="text-xs font-medium text-slate-400 uppercase tracking-wide">Map Context Layer</label>
                  <div className="flex gap-2">
                    <label className="flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300 transition-colors cursor-pointer" title="Upload Image / Data to view map for training">
                      <span className="text-base leading-none">📁</span> Add Data
                      <input type="file" className="hidden" onChange={handleFileUpload} accept=".tif,.tiff,.geojson,.zip,.csv" />
                    </label>
                    <button
                      onClick={() => setShowQuickAdd(!showQuickAdd)}
                      className="flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300 transition-colors"
                      title="Add dataset via link"
                    >
                      <span className="text-base leading-none">🔗</span> Add via Link
                    </button>
                  </div>
                </div>

                {showQuickAdd && (
                  <form onSubmit={handleQuickAdd} className="mb-3 bg-slate-800 p-3 rounded-lg border border-slate-700 space-y-2 shadow-inner">
                    <input placeholder="Dataset Name" required value={quickAddName} onChange={e => setQuickAddName(e.target.value)} className={inputCls} />
                    <input placeholder="Paste share link (Drive, Dropbox, etc)" required value={quickAddUrl} onChange={e => setQuickAddUrl(e.target.value)} className={inputCls} />
                    <button type="submit" disabled={quickAddBusy} className={btnPrimary + ' w-full text-xs py-1.5'}>
                      {quickAddBusy ? 'Adding...' : '✅ Add & Select'}
                    </button>
                    {quickAddStatus && <div className="text-[10px] text-slate-300 mt-1">{quickAddStatus}</div>}
                  </form>
                )}

                {/* Dataset list */}
                {datasets.length === 0 ? (
                  <p className="text-xs text-slate-500 italic text-center py-2">No datasets uploaded yet.</p>
                ) : (
                  <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
                    {datasets.map(d => {
                      const isActive = activeContextDataset?.id === d.id;
                      const typeColors = {
                        tiff: '#e74c3c', shapefile: '#2980b9', csv: '#27ae60',
                        geojson: '#e67e22', geopackage: '#8e44ad'
                      };
                      const typeColor = typeColors[d.file_type] || '#7f8c8d';
                      return (
                        <div
                          key={d.id}
                          className={`flex items-center gap-2 rounded-lg px-2.5 py-2 border transition-all ${
                            isActive
                              ? 'bg-emerald-900/30 border-emerald-600'
                              : 'bg-slate-800 border-slate-700 hover:border-slate-500'
                          }`}
                        >
                          {/* Active indicator dot */}
                          <span
                            className={`w-2 h-2 rounded-full shrink-0 transition-all ${
                              isActive ? 'bg-emerald-400 shadow-[0_0_6px_#34d399]' : 'bg-slate-600'
                            }`}
                          />
                          {/* Name + type badge */}
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-slate-200 truncate" title={d.name}>{d.name}</p>
                            <span
                              className="text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide"
                              style={{ background: typeColor + '33', color: typeColor }}
                            >
                              {d.file_type || 'file'}
                            </span>
                          </div>
                          {/* Add to map / Remove button */}
                          {isActive ? (
                            <button
                              onClick={() => {
                                setActiveContextDataset(null);
                                setSelectedDatasetId('');
                                setPreviewData(null);
                              }}
                              title="Remove from map"
                              className="shrink-0 w-7 h-7 flex items-center justify-center rounded-md bg-red-800/60 hover:bg-red-700 text-red-300 hover:text-white text-sm transition-colors"
                            >
                              ✕
                            </button>
                          ) : (
                            <button
                              onClick={() => {
                                setActiveContextDataset({ id: d.id, name: d.name });
                                setSelectedDatasetId(d.id);
                              }}
                              title="Add to map"
                              className="shrink-0 w-7 h-7 flex items-center justify-center rounded-md bg-slate-700 hover:bg-emerald-700 text-slate-300 hover:text-white text-base transition-colors"
                            >
                              🗺
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Active layer badge */}
                {activeContextDataset && (
                  <div className="mt-2 flex items-center gap-2 bg-emerald-900/20 border border-emerald-700/50 rounded-lg px-2.5 py-1.5">
                    <span className="text-emerald-400 text-xs">🗺 On map:</span>
                    <span className="text-xs text-emerald-200 font-medium truncate flex-1">{activeContextDataset.name}</span>
                  </div>
                )}

                <div className="text-center text-slate-600 text-xs my-3">— OR custom tile —</div>
                <label className="text-xs text-slate-400 block mb-1">XYZ Tile URL:</label>
                <input
                  placeholder="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  value={contextTileUrl}
                  onChange={e => setContextTileUrl(e.target.value)}
                  className={inputCls}
                />
              </div>
            </>
          )}

          {/* ── SAMPLES PANEL ── */}
          {panel === 'samples' && (
            <>
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-white">{samples.length} samples</span>
                <button onClick={loadSamples} className={btnSecondary} disabled={loadingSamples}>
                  {loadingSamples ? '⏳' : '🔄'}
                </button>
              </div>

              {/* Class summary */}
              {Object.keys(classCounts).length > 0 && (
                <div className="space-y-2">
                  {Object.entries(classCounts).map(([cls, count]) => {
                    const isHidden = hiddenClasses.has(cls);
                    return (
                      <div key={cls} className={`flex items-center gap-2 transition-opacity ${isHidden ? 'opacity-50' : 'opacity-100'}`}>
                        <button 
                          onClick={() => {
                            setHiddenClasses(prev => {
                              const next = new Set(prev);
                              if (next.has(cls)) next.delete(cls);
                              else next.add(cls);
                              return next;
                            });
                          }}
                          className="text-slate-400 hover:text-white"
                          title={isHidden ? "Show on map" : "Hide from map"}
                        >
                          {isHidden ? '🕶️' : '👁️'}
                        </button>
                        <span className="w-3 h-3 rounded-full shrink-0"
                          style={{ background: colorForClass(cls, customClasses) }} />
                        <span className="text-sm text-slate-300 flex-1">{cls}</span>
                        <span className="text-xs font-mono bg-slate-700 text-slate-300 px-2 py-0.5 rounded">{count}</span>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="space-y-2 max-h-80 overflow-y-auto">
                {samples.map(s => (
                  <div key={s.id}
                    className="flex items-center gap-2 bg-slate-800 rounded-lg px-3 py-2 border border-slate-700">
                    <span className="w-3 h-3 rounded-full shrink-0"
                      style={{ background: colorForClass(s.class_label, customClasses) }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-slate-200 truncate">{s.class_label}</p>
                      <p className="text-xs text-slate-500 truncate">
                        {s.geometry?.type} · {s.creator || 'anon'}
                      </p>
                    </div>
                    <button onClick={() => handleDeleteSample(s.id)} className="text-red-400 hover:text-red-300 text-xs">
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* ── CLASSIFY PANEL ── */}
          {panel === 'classify' && (
            <div className="space-y-4">
              <p className="text-sm text-slate-300">
                Train a Random Forest classifier on-the-fly using your drawn samples and Sentinel-2 satellite imagery over Rwanda.
              </p>
              
              <button 
                onClick={handleClassify} 
                disabled={classifyLoading || samples.length === 0} 
                className={btnPrimary + ' w-full disabled:opacity-50'}
              >
                {classifyLoading ? 'Training & Classifying...' : '🚀 Run Classification'}
              </button>

              {samples.length === 0 && (
                <p className="text-xs text-amber-400">Please draw some training samples first.</p>
              )}

              {classifyError && (
                <div className="bg-red-900/50 text-red-200 p-3 rounded text-sm break-words">
                  {classifyError}
                </div>
              )}

              {classifyResult && (
                <div className="bg-slate-800 border border-emerald-700/50 rounded-lg p-3 text-sm text-slate-300 space-y-3 shadow-inner">
                  <div className="flex items-center gap-2 text-emerald-400 font-medium">
                    <span>✅</span> Classification Complete
                  </div>
                  <p className="text-xs text-slate-400">
                    The resulting map overlay has been automatically added to the Map Context Layer.
                  </p>
                  
                  <div className="space-y-1.5 pt-2 border-t border-slate-700">
                    <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-2">Class Areas (km²)</p>
                    {classifyResult.classes.map(cls => (
                      <div key={cls} className="flex justify-between items-center text-xs">
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full" style={{background: classifyResult.colors[cls]}}></span>
                          <span>{cls}</span>
                        </div>
                        <span className="font-mono bg-slate-900 px-1.5 py-0.5 rounded text-emerald-300">
                          {classifyResult.areas[cls] || 0}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── GEE PUSH PANEL ── */}
          {panel === 'geepush' && (
            <div className="space-y-4">
              <p className="text-sm text-slate-300">
                Push a local GeoTIFF raster, Shapefile zip, or GeoJSON vector directly into Google Earth Engine as a permanent asset.
              </p>
              
              <form onSubmit={handleGeePush} className="space-y-4">
                <div>
                   <label className="text-xs font-medium text-slate-400 block mb-1">Local File</label>
                   <input 
                     type="file" 
                     required 
                     onChange={e => setGeeFile(e.target.files[0])} 
                     className="block w-full text-sm text-slate-300 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-emerald-600 file:text-white hover:file:bg-emerald-500 cursor-pointer"
                   />
                </div>
                
                <div>
                   <label className="text-xs font-medium text-slate-400 block mb-1">GEE Asset Path</label>
                   <input 
                     type="text" 
                     placeholder="users/username/my_asset"
                     required
                     value={geeAssetName}
                     onChange={e => setGeeAssetName(e.target.value)}
                     className={inputCls} 
                   />
                   <p className="text-[10px] text-slate-500 mt-1">Must start with users/ or projects/</p>
                </div>
                
                <button type="submit" disabled={pushingGee} className={btnPrimary + ' w-full disabled:opacity-50'}>
                  {pushingGee ? 'Pushing...' : '📤 Push to GEE'}
                </button>
              </form>
              
              {geeStatus && (
                <div className={`p-3 rounded text-sm ${geeStatus.startsWith('❌') ? 'bg-red-900/50 text-red-200' : 'bg-emerald-900/50 text-emerald-200'}`}>
                  {geeStatus}
                </div>
              )}
            </div>
          )}

          {/* ── EXPORT PANEL ── */}
          {panel === 'export' && (
            <div className="space-y-3">
              <p className="text-sm text-slate-300">
                Download all <strong className="text-white">{samples.length}</strong> digitized samples as GeoJSON.
              </p>
              <button onClick={exportGeoJSON} className={btnSecondary + ' w-full'}>
                ⬇ Download GeoJSON
              </button>
              <button onClick={exportShapefile} className={btnPrimary + ' w-full mt-2'}>
                ⬇ Download Shapefile (.zip)
              </button>
              <div className="bg-slate-800 border border-slate-700 rounded-lg p-3 text-xs text-slate-400 space-y-1 mt-3">
                <p className="font-semibold text-slate-300">Class summary</p>
                {Object.entries(classCounts).map(([cls, n]) => (
                  <div key={cls} className="flex justify-between">
                    <span>{cls}</span>
                    <span className="font-mono">{n}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Map */}
      <div className="flex-1 relative z-0 bg-red-500">
        <div ref={mapContainerRef} className="absolute inset-0 bg-green-500" style={{ zIndex: 0 }} />
        
        {/* Error overlay */}
        {previewError && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1000] bg-red-900/90 text-red-100 px-4 py-2 rounded-full shadow-lg text-sm flex items-center gap-2 border border-red-700/50 backdrop-blur">
            <span>⚠️</span> {previewError}
          </div>
        )}

        {/* Sample count pill */}
        <div className="absolute bottom-4 left-4 z-40 bg-slate-900/80 backdrop-blur rounded-lg px-3 py-1.5 text-xs text-slate-300 border border-slate-700 pointer-events-none">
          {samples.length} samples · {Object.keys(classCounts).length} classes
        </div>
      </div>
    </div>
  );
}
