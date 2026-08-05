import React, { useState, useEffect, useRef, useMemo } from 'react';
import axios from 'axios';
import { MapContainer, TileLayer, FeatureGroup, Rectangle, useMap, ImageOverlay, GeoJSON } from 'react-leaflet';

import 'leaflet/dist/leaflet.css';
import 'leaflet-draw/dist/leaflet.draw.css';

const API = 'http://localhost:8000/api';

const TYPE_COLORS = {
  tiff: '#e74c3c', shapefile: '#2980b9', csv: '#27ae60',
  geojson: '#e67e22', geopackage: '#8e44ad', other: '#7f8c8d',
};
const TYPE_EMOJI = {
  tiff: '🗺', shapefile: '📐', csv: '📊',
  geojson: '🌐', geopackage: '📦', other: '📁',
};

function Badge({ type }) {
  const color = TYPE_COLORS[type] || TYPE_COLORS.other;
  const emoji = TYPE_EMOJI[type] || '📁';
  return (
    <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded font-medium"
      style={{ background: color + '33', color }}>
      {emoji} {type?.toUpperCase() || 'FILE'}
    </span>
  );
}

function Section({ title, children }) {
  return (
    <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-700">
        <h3 className="font-semibold text-slate-100 text-sm">{title}</h3>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

const inputCls = "w-full bg-slate-700 text-slate-100 border border-slate-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 placeholder-slate-500";
const btnPrimary = "bg-emerald-600 hover:bg-emerald-500 text-white font-semibold px-4 py-2 rounded-lg text-sm transition-colors";
const btnSecondary = "bg-slate-700 hover:bg-slate-600 text-slate-200 font-medium px-4 py-2 rounded-lg text-sm transition-colors";
const btnDanger = "bg-red-800 hover:bg-red-700 text-red-100 font-medium px-3 py-1.5 rounded text-xs transition-colors";

function DatasetCard({ record, source, onDelete, canDelete, onPreview, isSelected }) {
  const handleDownload = () => {
    window.open(`${API}/datasets/${record.id}/download?source=${source}`, '_blank');
  };

  return (
    <div 
      className={`bg-slate-800 rounded-xl border p-4 transition-colors ${
        isSelected ? 'border-emerald-500 ring-1 ring-emerald-500' : 'border-slate-700 hover:border-slate-500'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <Badge type={record.file_type} />
            {record.contributor && (
              <span className="text-xs text-slate-400">by {record.contributor}</span>
            )}
            {record.file_size_mb > 0 && (
              <span className="text-xs text-slate-500">{record.file_size_mb.toFixed(1)} MB</span>
            )}
          </div>
          <h4 className="font-semibold text-slate-100 text-sm truncate">{record.name}</h4>
          {record.description && (
            <p className="text-xs text-slate-400 mt-1 line-clamp-2">{record.description}</p>
          )}
          <p className="text-xs text-slate-500 mt-1">
            {record.original_filename} · {record.created_at ? new Date(record.created_at).toLocaleDateString() : ''}
          </p>
          {record.status && record.status !== 'ok' && (
            <span className="text-xs px-2 py-0.5 rounded bg-amber-900/40 text-amber-300 mt-1 inline-block">
              {record.status}
            </span>
          )}
        </div>
        <div className="flex flex-col gap-1.5 shrink-0">
          <button onClick={() => onPreview(isSelected ? null : record)} className={isSelected ? btnPrimary : btnSecondary}>
            {isSelected ? '✕ Close Map' : '🗺 Preview Map'}
          </button>
          <button onClick={handleDownload} className={btnSecondary}>⬇ Download</button>
          {canDelete && (
            <button onClick={() => onDelete(record.id)} className={btnDanger}>🗑 Delete</button>
          )}
        </div>
      </div>
    </div>
  );
}

function UploadForm({ source, adminPassword, onSuccess }) {
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [contributor, setContributor] = useState('');
  const [file, setFile] = useState(null);
  const [url, setUrl] = useState('');
  const [mode, setMode] = useState('upload');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [progress, setProgress] = useState('');

  const submit = async () => {
    if (!name.trim()) { setErr('Dataset name is required.'); return; }
    setBusy(true); setErr(''); setProgress('Uploading…');
    try {
      const headers = {};
      if (adminPassword) {
        headers['X-Admin-Password'] = adminPassword;
      }

      if (mode === 'upload') {
        if (!file) { setErr('Select a file first.'); setBusy(false); return; }
        setProgress('Storing dataset…');
        const fd = new FormData();
        fd.append('file', file);
        fd.append('name', name);
        fd.append('description', desc);
        fd.append('source', source);
        if (contributor) fd.append('contributor', contributor);
        
        headers['Content-Type'] = 'multipart/form-data';
        
        await axios.post(`${API}/datasets/upload`, fd, {
          headers: headers,
          timeout: 300000,
        });
      } else {
        if (!url.trim()) { setErr('Paste a URL first.'); setBusy(false); return; }
        setProgress('Registering link…');
        await axios.post(`${API}/datasets/link`, {
          url, name, description: desc, source,
          contributor: contributor || undefined,
        }, { 
          headers: headers,
          timeout: 120000 
        });
      }
      setName(''); setDesc(''); setContributor(''); setFile(null); setUrl('');
      setProgress('');
      onSuccess();
    } catch (e) {
      setErr(e.response?.data?.detail || e.message);
      setProgress('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        {['upload', 'link'].map(m => (
          <button key={m} onClick={() => setMode(m)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
              mode === m ? 'bg-emerald-600 text-white' : 'bg-slate-700 text-slate-400 hover:text-white'
            }`}>
            {m === 'upload' ? '📤 Upload File' : '🔗 Paste URL'}
          </button>
        ))}
      </div>

      {mode === 'upload' ? (
        <div className="border-2 border-dashed border-slate-600 rounded-xl p-6 text-center hover:border-emerald-600 transition-colors cursor-pointer relative">
          <input type="file" accept=".tif,.tiff,.shp,.zip,.csv,.geojson,.gpkg,.kml"
            onChange={e => setFile(e.target.files[0])}
            className="absolute inset-0 opacity-0 cursor-pointer w-full h-full" />
          <p className="text-slate-300 text-sm">
            {file ? `📁 ${file.name}` : 'Drag & drop or click to select'}
          </p>
          <p className="text-slate-500 text-xs mt-1">.tiff · .shp/.zip · .csv · .geojson · .gpkg · .kml</p>
        </div>
      ) : (
        <input type="url" placeholder="https://… direct file link"
          value={url} onChange={e => setUrl(e.target.value)} className={inputCls} />
      )}

      <div className="grid grid-cols-2 gap-3">
        <input placeholder="Dataset name *" value={name}
          onChange={e => setName(e.target.value)} className={inputCls} />
        <input placeholder="Contributor name (optional)" value={contributor}
          onChange={e => setContributor(e.target.value)} className={inputCls} />
      </div>
      <textarea placeholder="Description (optional)" value={desc}
        onChange={e => setDesc(e.target.value)}
        rows={2} className={inputCls + ' resize-none'} />

      {err && <p className="text-red-400 text-xs">{err}</p>}
      {progress && <p className="text-emerald-400 text-xs animate-pulse">{progress}</p>}

      <button onClick={submit} disabled={busy} className={btnPrimary}>
        {busy ? `⏳ ${progress || 'Processing…'}` : '✅ Submit Dataset'}
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Map Fit Bounds Hook
// ─────────────────────────────────────────────────────────────────
function MapFitter({ hoveredBbox }) {
  const map = useMap();
  useEffect(() => {
    if (hoveredBbox) {
      const [minx, miny, maxx, maxy] = hoveredBbox;
      if (Number.isFinite(miny) && Number.isFinite(minx) && Number.isFinite(maxy) && Number.isFinite(maxx)) {
          map.fitBounds([
            [miny, minx],
            [maxy, maxx]
          ], { padding: [50, 50], maxZoom: 10 });
      }
    }
  }, [hoveredBbox, map]);
  return null;
}


// ─────────────────────────────────────────────────────────────────
// Map Draw Control
// ─────────────────────────────────────────────────────────────────
function NativeDrawControl({ onCreated, onEdited, onDeleted, featureGroupRef }) {
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
        featureGroup: drawnItems
      },
      draw: {
        polygon: true,
        rectangle: true,
        circle: false,
        circlemarker: false,
        marker: false,
        polyline: false,
      }
    });
    
    map.addControl(drawControl);

    const handleCreated = (e) => {
      drawnItems.clearLayers();
      drawnItems.addLayer(e.layer);
      if (onCreated) onCreated({ layer: e.layer });
    };

    const handleEdited = (e) => {
      if (onEdited) onEdited(e);
    };

    const handleDeleted = (e) => {
      if (onDeleted) onDeleted(e);
    };

    map.on(L.Draw.Event.CREATED, handleCreated);
    map.on(L.Draw.Event.EDITED, handleEdited);
    map.on(L.Draw.Event.DELETED, handleDeleted);

    return () => {
      map.removeControl(drawControl);
      map.removeLayer(drawnItems);
      map.off(L.Draw.Event.CREATED, handleCreated);
      map.off(L.Draw.Event.EDITED, handleEdited);
      map.off(L.Draw.Event.DELETED, handleDeleted);
    };
  }, [map, featureGroupRef, onCreated, onEdited, onDeleted]);
  
  return null;
}

// ─────────────────────────────────────────────────────────────────
// Main RareData Page
// ─────────────────────────────────────────────────────────────────
export default function RareDataPage() {
  const [tab, setTab] = useState('official');
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showUploadForm, setShowUploadForm] = useState(false);
  const [search, setSearch] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminPassword, setAdminPassword] = useState('');
  
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [previewData, setPreviewData] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [drawnMask, setDrawnMask] = useState(null);
  const [clipLoading, setClipLoading] = useState(false);
  const featureGroupRef = useRef(null);

  const source = tab === 'manage' ? 'admin' : tab === 'official' ? 'admin' : 'community';

  useEffect(() => {
    if (!selectedRecord) {
      setPreviewData(null);
      return;
    }
    const fetchPreview = async () => {
      setPreviewLoading(true);
      setPreviewData(null);
      try {
        const res = await axios.get(`${API}/datasets/${selectedRecord.id}/preview?source=${source}`);
        setPreviewData(res.data);
      } catch(e) {
        console.error(e);
      } finally {
        setPreviewLoading(false);
      }
    };
    fetchPreview();
  }, [selectedRecord, source]);

  const loadDatasets = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API}/datasets?source=${source}`);
      setRecords(res.data.records || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadDatasets(); }, [tab]);

  // Ensure window.L is available and leaflet-draw is imported on mount
  useEffect(() => {
    import('leaflet').then((L) => {
      window.L = L;
      import('leaflet-draw');
    });
  }, []);


  const handleDelete = async (id) => {
    if (!window.confirm('Delete this dataset?')) return;
    try {
      await axios.delete(`${API}/datasets/${id}?source=${source}`, {
        headers: {
          'X-Admin-Password': adminPassword
        }
      });
      if (selectedRecord?.id === id) setSelectedRecord(null);
      loadDatasets();
    } catch (e) {
      alert(e.response?.data?.detail || 'Delete failed');
    }
  };

  const downloadAll = () => window.open(`${API}/datasets/download-all?source=${source}`, '_blank');

  const onCreated = (e) => {
    // Keep only the latest layer to simplify
    const fg = featureGroupRef.current;
    if (fg) {
      fg.clearLayers();
      fg.addLayer(e.layer);
      setDrawnMask(e.layer.toGeoJSON().geometry);
    }
  };

  const onEdited = () => {
    const fg = featureGroupRef.current;
    if (fg) {
      const layers = fg.getLayers();
      if (layers.length > 0) {
        setDrawnMask(layers[0].toGeoJSON().geometry);
      }
    }
  };

  const onDeleted = () => {
    setDrawnMask(null);
  };

  const handleClipAndDownload = async (record) => {
    if (!drawnMask) {
      alert("Please draw a study area polygon or rectangle on the map first to use as a clipping mask.");
      return;
    }
    
    setClipLoading(true);
    try {
      const res = await axios.post(`${API}/datasets/${record.id}/clip?source=${source}`, {
        mask: drawnMask
      }, {
        responseType: 'blob' // important for file download
      });
      
      const contentDisposition = res.headers['content-disposition'];
      let filename = `clipped_${record.original_filename}`;
      if (contentDisposition) {
        const match = contentDisposition.match(/filename="(.+)"/);
        if (match && match.length === 2) filename = match[1];
      }
      
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.parentNode.removeChild(link);
    } catch (e) {
      alert("Failed to clip dataset. It might not overlap with your mask, or the file type is unsupported.");
      console.error(e);
    } finally {
      setClipLoading(false);
    }
  };

  const filtered = records.filter(r =>
    !search || r.name?.toLowerCase().includes(search.toLowerCase()) ||
    r.description?.toLowerCase().includes(search.toLowerCase())
  );

  const TABS = [
    ['official',   '📦 Official Datasets'],
    ['community',  '🤝 Community Uploads'],
    ['manage',     '🛠 Manage'],
  ];
  
  // Memoize bounds
  const hoveredBboxBounds = useMemo(() => {
    if (!selectedRecord || !selectedRecord.bbox) return null;
    const [minx, miny, maxx, maxy] = selectedRecord.bbox;
    return [
      [miny, minx],
      [maxy, maxx]
    ];
  }, [selectedRecord]);

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden p-6 gap-4">
      {/* Header */}
      <div className="shrink-0">
        <h1 className="text-2xl font-bold text-white">🗄 RARE DATA — Dataset Repository</h1>
        <p className="text-slate-400 text-sm mt-1">
          Browse and download geospatial datasets covering Rwanda.
          Click <b>🗺 Preview Map</b> to interactively view the dataset footprint and clip to a custom study area.
        </p>
      </div>

      <div className="flex-1 flex gap-6 min-h-0">
        {/* Left column: Data List */}
        <div className={`${selectedRecord ? 'w-1/2' : 'w-full max-w-4xl'} flex flex-col gap-4 overflow-y-auto pr-2 transition-all duration-300`}>
          {/* Tab bar */}
          <div className="flex gap-2 border-b border-slate-700 pb-2 shrink-0">
            {TABS.map(([key, label]) => (
              <button key={key} onClick={() => { 
                if (key === 'manage' && !isAdmin) {
                  const pwd = prompt("Enter Admin Password (default: admin123):");
                  if (pwd === "admin123") {
                    setIsAdmin(true);
                    setAdminPassword(pwd);
                    setTab(key);
                  } else if (pwd !== null) {
                    alert("Incorrect password!");
                  }
                } else {
                  setTab(key); 
                }
                setShowUploadForm(false); 
                setSelectedRecord(null); 
              }}
                className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  tab === key
                    ? 'bg-emerald-600 text-white'
                    : 'bg-slate-800 text-slate-400 hover:text-white border border-slate-700'
                }`}>
                {label}
              </button>
            ))}
          </div>

          <div className="flex gap-3 items-center shrink-0">
            <input placeholder="🔍 Search datasets…" value={search}
              onChange={e => setSearch(e.target.value)} className={inputCls + ' flex-1'} />
            <button onClick={downloadAll} className={btnSecondary}>⬇ DL All</button>
            {tab !== 'official' && (
              <button onClick={() => setShowUploadForm(v => !v)} className={btnPrimary}>
                {showUploadForm ? '✕ Cancel' : '+ Upload'}
              </button>
            )}
          </div>

          {showUploadForm && (
            <div className="shrink-0">
              <Section title={tab === 'manage' ? "Upload Official Dataset" : "Contribute a Dataset"}>
                <UploadForm source={tab === 'manage' ? 'admin' : 'community'}
                  adminPassword={adminPassword}
                  onSuccess={() => { setShowUploadForm(false); loadDatasets(); }} />
              </Section>
            </div>
          )}

          {loading ? (
            <div className="text-center text-slate-400 py-12">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="text-center text-slate-500 py-12">
              <p className="text-4xl mb-3">📭</p>
              <p>No datasets found.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-4 pb-12">
              {filtered.map(r => (
                <DatasetCard 
                  key={r.id} 
                  record={r} 
                  source={source}
                  onDelete={handleDelete} 
                  canDelete={tab === 'manage'} 
                  isSelected={selectedRecord?.id === r.id}
                  onPreview={setSelectedRecord}
                  onClip={handleClipAndDownload}
                />
              ))}
            </div>
          )}
        </div>

        {/* Right column: Map Preview (Only visible when a dataset is selected) */}
        {selectedRecord && (
          <div className="w-1/2 bg-slate-800 border border-emerald-600 rounded-xl overflow-hidden relative flex flex-col shadow-[0_0_15px_rgba(16,185,129,0.2)] transition-all animate-in fade-in slide-in-from-right-4 duration-300">
             <div className="p-3 border-b border-emerald-600/30 bg-slate-800/80 backdrop-blur z-10 flex justify-between items-center">
               <span className="text-sm font-semibold text-emerald-400">
                 🗺 Map Preview & Clipping — {selectedRecord.name}
               </span>
               <div className="flex gap-3 items-center">
                 {previewLoading && <span className="text-xs text-blue-400 animate-pulse">Loading preview…</span>}
                 {clipLoading && <span className="text-xs text-emerald-400 animate-pulse">Clipping dataset…</span>}
                 <button onClick={() => setSelectedRecord(null)} className="text-slate-400 hover:text-white transition-colors">
                   ✕ Close
                 </button>
               </div>
             </div>
             <div className="flex-1 relative z-0">
               <MapContainer
                 center={[-1.9403, 29.8739]} // Rwanda
                 zoom={9}
                 style={{ height: '100%', width: '100%' }}
               >
                 <TileLayer
                   attribution='&copy; OpenStreetMap'
                   url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                 />
                 
                 <FeatureGroup ref={featureGroupRef} />
                 <NativeDrawControl
                   onCreated={onCreated}
                   onEdited={onEdited}
                   onDeleted={onDeleted}
                   featureGroupRef={featureGroupRef}
                 />
                 
                 {hoveredBboxBounds && (
                   <Rectangle bounds={hoveredBboxBounds} pathOptions={{ color: '#10b981', weight: 2, fillOpacity: 0.1, dashArray: '4' }} />
                 )}

                 {previewData?.type === 'image' && (
                   <ImageOverlay url={previewData.data} bounds={previewData.bounds} opacity={0.8} />
                 )}

                 {previewData?.type === 'FeatureCollection' && (
                   <GeoJSON data={previewData} style={{ color: '#3b82f6', weight: 2 }} />
                 )}
                 
                 <MapFitter hoveredBbox={selectedRecord?.bbox} />
               </MapContainer>
             </div>
          </div>
        )}
      </div>
    </div>
  );
}
