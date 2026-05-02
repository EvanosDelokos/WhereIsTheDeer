// GPX manager module loaded
window.__WITD_GPX_MANAGER_VERSION__ = '2026-05-01-gpx-terrain-upload';

// Remove ES6 import - use global functions instead
// import { saveGpxFiles, loadGpxFiles } from './storeManager.js';

// Global functions for storage (fallback if storeManager not available)
function saveGpxFiles(files) {
  try {
    if (window.saveGpxFiles) {
      window.saveGpxFiles(files);
    } else {
      localStorage.setItem('witd_gpx_files', JSON.stringify(files));
      // Saved to localStorage
    }
  } catch (error) {
    console.warn("[GPX] Could not save GPX files:", error);
  }
}

/**
 * Sync read of persisted GPX list for gpxManager init.
 * map.html assigns `window.loadGpxFiles` to a no-arg stub that returns undefined — never call that here.
 * storeManager's 3-arg `loadGpxFiles(map, ...)` is async; init must read localStorage directly.
 */
function loadPersistedGpxFilesFromStorage() {
  try {
    const saved = localStorage.getItem('witd_gpx_files');
    if (!saved) return [];
    const parsed = JSON.parse(saved);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn('[GPX] Could not read witd_gpx_files:', error);
    return [];
  }
}

// Test function to verify GPX manager is working
window.testGPXManager = function() {
  // Testing GPX Manager
  
  if (window.WITD?.map) {
    const styleSources = window.WITD.map.getStyle()?.sources || {};
    const hasPerFileSources = Object.keys(styleSources).some((key) => key.startsWith('gpx-source-'));
    if (!hasPerFileSources && (!window.gpxFiles || window.gpxFiles.length > 0)) {
      console.warn("GPX per-file sources not yet present");
    }
  }
  
  return "GPX Manager test completed";
};

// Test function to add a sample track
window.testGPXTrack = function() {
  // Testing GPX track addition
  
  if (!window.WITD?.map) {
    console.error("Map not available");
    return;
  }
  
  if (!window.renderGPX || typeof window.renderGPX !== 'function') {
    console.error("renderGPX not available");
    return;
  }
  
  // Create a simple test track (Melbourne CBD area)
  const testTrack = {
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      properties: {
        name: 'Test Track',
        type: 'gpx-track'
      },
      geometry: {
        type: 'LineString',
        coordinates: [
          [144.9631, -37.8136], // Melbourne CBD
          [144.9731, -37.8236], // Slightly east
          [144.9531, -37.8036]  // Slightly west
        ]
      }
    }]
  };
  
  try {
    const testFile = { id: (window.generateGPXId ? window.generateGPXId() : `gpx-${Date.now()}`), geojson: testTrack, name: 'Test Track' };
    window.gpxFiles = window.gpxFiles || [];
    window.gpxFiles.push(testFile);
    window.renderGPX(window.WITD.map, testFile, 'manual-test');
    
    // Fit map to show the test track
    window.WITD.map.fitBounds([
      [144.9531, -37.8236], // SW
      [144.9731, -37.8036]  // NE
    ], { padding: 50 });
    
  } catch (error) {
    console.error("❌ Error adding test track:", error);
  }
};

// Manual initialization function
window.initGPXManager = function() {
  // Manual initialization requested
  if (window.WITD && window.WITD.map) {
    // Map available, initializing now
    initGpxManager(window.WITD.map);
  } else {
    console.warn("[GPX] Map not available for manual init");
  }
};

// Always wait for the map to be ready - don't check immediately
// GPX Manager loaded, waiting for map to be ready

if (window.WITD && window.WITD.map) {
  initGpxManager(window.WITD.map);
} else {
  window.addEventListener('witd:map-ready', (event) => {
    const readyMap = event.detail?.map || window.WITD?.map;
    if (readyMap) {
      initGpxManager(readyMap);
    }
  }, { once: true });
}

function initGpxManager(map) {
  // initGpxManager called with map
  
  if (!map) {
    console.warn("Map not available for GPX manager");
    return;
  }

  function generateGPXId() {
    return 'gpx-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
  }
  window.generateGPXId = window.generateGPXId || generateGPXId;
  window.gpxFiles = window.gpxFiles || [];
  let gpxFiles = window.gpxFiles;
      const GPX_DEBUG = false;
      const gpxlog = (...args) => {
        if (GPX_DEBUG) console.log(...args);
      };
      const ELEVATION_THRESHOLD_METERS = 1.5;
      /** Skip only duplicate/near-duplicate points (not dense GPS/traces — drawn exports often have many sub‑2 m legs). */
      const MIN_STEP_DISTANCE_METERS = 0.05;
  const GPX_UPHILL_COLOR = '#ff0000';
  const GPX_DOWNHILL_COLOR = '#0066ff';
  const GPX_FLAT_COLOR = '#888888';
  const GPX_DEFAULT_COLOR = '#000000';
  let gpxPopup = null;
  let gpxStyleImageMissingBound = false;
  let gpxMapClickHideLabelsBound = false;
  const gpxTrackLabelElements = new Map();
  const gpxHiddenLabelIds = new Set();
  const gpxLineClickHandlers = new Map();
  const gpxIconDefs = [
    { name: 'StartPin', url: 'Images/Pins/StartPin.svg' },
    { name: 'RedMarkerPin', url: 'Images/Pins/RedMarkerPin.svg' }
  ];
  // Expose early so storeManager callbacks can resolve it during init.
  window.addGpxToMap = addGpxToMap;

  ensureGpxStyleImageHandler();
  addGpxIcons();
  setupFileInput();
  const persistedRawFiles = loadPersistedGpxFilesFromStorage();
  const persistedFiles = Array.isArray(persistedRawFiles) ? persistedRawFiles : [];
  const normalizePersistedGpxFile = (file) => {
    if (!file || typeof file !== 'object') return null;
    if (file.id && file.geojson) {
      return { id: file.id, name: file.name || file.id, geojson: file.geojson };
    }
    const legacyFeatures = file.data?.tracks?.features || file.data?.features;
    if (legacyFeatures) {
      return {
        id: generateGPXId(),
        name: file.name || 'GPX Track',
        geojson: { type: 'FeatureCollection', features: legacyFeatures }
      };
    }
    return null;
  };
  if (persistedFiles.length > 0 && gpxFiles.length === 0) {
    gpxFiles = persistedFiles
      .map(normalizePersistedGpxFile)
      .filter(Boolean);
    window.gpxFiles = gpxFiles;
  }
  /**
   * Core GPX map layers (source + line + optional label). Caller must run inside safeAddToMap
   * when the style may still be loading; batch init/restore calls this in a single safeAddToMap
   * to avoid nested queues dropping tracks.
   */
  function renderGPXLayers(targetMap, gpxFile, cycle = 'manual') {
    if (!targetMap || !gpxFile || !gpxFile.id || !gpxFile.geojson) {
      console.warn('[GPX] renderGPXLayers called with invalid data');
      return;
    }
    const feats = gpxFile.geojson.features;
    if (!Array.isArray(feats) || feats.length === 0) {
      console.warn('[GPX] Skipping render — no features:', gpxFile.name || gpxFile.id);
      return;
    }

    const sourceId = `gpx-source-${gpxFile.id}`;
    const lineLayerId = `gpx-line-${gpxFile.id}`;
    const labelLayerId = `gpx-label-${gpxFile.id}`;

    gpxlog(`[GPX ${cycle}] Rendering GPX: ${gpxFile.name || gpxFile.id}`);

    unbindLineHoverHandlers(targetMap, lineLayerId);
    unbindLineClickHandler(targetMap, lineLayerId);

    if (targetMap.getLayer(lineLayerId)) targetMap.removeLayer(lineLayerId);
    if (targetMap.getLayer(labelLayerId)) targetMap.removeLayer(labelLayerId);
    if (targetMap.getSource(sourceId)) targetMap.removeSource(sourceId);

    targetMap.addSource(sourceId, {
      type: 'geojson',
      data: gpxFile.geojson
    });

    const lineLayout = {
      'line-join': 'round',
      'line-cap': 'round'
    };

    const lineLayerDef = {
      id: lineLayerId,
      type: 'line',
      source: sourceId,
      layout: lineLayout,
      paint: {
        'line-color': ['coalesce', ['get', 'color'], '#ff5500'],
        'line-width': 3,
        'line-opacity': 1
      }
    };

    try {
      targetMap.addLayer(lineLayerDef);
    } catch (err) {
      console.warn('[GPX] addLayer line failed, retrying minimal layout:', err?.message || err);
      if (!targetMap.getLayer(lineLayerId)) {
        targetMap.addLayer({
          id: lineLayerId,
          type: 'line',
          source: sourceId,
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: lineLayerDef.paint
        });
      }
    }

    bindLineHoverHandlers(targetMap, lineLayerId);
    bindLineClickHandler(targetMap, lineLayerId, gpxFile.id);

    const labelLayoutBase = {
      'symbol-placement': 'line',
      'text-field': ['get', 'name'],
      'text-size': 13,
      'text-offset': [0, -1.5],
      'text-anchor': 'center',
      'text-allow-overlap': false
    };
    const labelPaint = {
      'text-color': '#ffffff',
      'text-halo-color': '#000000',
      'text-halo-width': 2
    };

    if (!targetMap.getLayer(labelLayerId)) {
      try {
        // Outdoors + Standard Satellite: avoid slot — v3 slot rules often reject symbol layers on GeoJSON here.
        targetMap.addLayer({
          id: labelLayerId,
          type: 'symbol',
          source: sourceId,
          layout: labelLayoutBase,
          paint: labelPaint
        });
      } catch (err) {
        console.warn('[GPX] addLayer label failed:', err?.message || err);
      }
    }

    gpxlog(`[GPX ${cycle}] Layers applied for ${gpxFile.id}`);
  }

  function renderGPX(targetMap, gpxFile, cycle = 'manual') {
    window.safeAddToMap(targetMap, () => {
      try {
        renderGPXLayers(targetMap, gpxFile, cycle);
      } catch (err) {
        console.error('[GPX] renderGPX failed:', gpxFile?.name, err);
      }
    });
  }
  window.renderGPX = renderGPX;

  function repairMissingGpxSources(reason) {
    const list = window.gpxFiles;
    if (!map || !Array.isArray(list) || list.length === 0) return;
    window.safeAddToMap(map, () => {
      let n = 0;
      list.forEach((f) => {
        const sid = `gpx-source-${f.id}`;
        const featCount = f.geojson?.features?.length || 0;
        if (featCount > 0 && !map.getSource(sid)) {
          try {
            renderGPXLayers(map, f, `repair-${reason}`);
            n++;
          } catch (e) {
            console.warn('[GPX] repair failed:', f?.name, e);
          }
        }
      });
      if (n > 0) {
        console.info(`[GPX] Repaired ${n} missing track source(s) (${reason})`);
      }
    });
  }

  function isMapLoadEventDone() {
    if (typeof map.loaded === 'function') return map.loaded();
    if (map.loaded === true) return true;
    return false;
  }

  /**
   * witd:map-ready fires before map.on('load'). Adding GeoJSON sources/layers earlier often results in
   * no sources after the first frame — wait for load + style + one idle so Outdoors accepts user layers.
   */
  function runWhenMapReadyForOverlays(done) {
    const step = () => {
      if (!isMapLoadEventDone()) {
        map.once('load', step);
        return;
      }
      if (!map.isStyleLoaded()) {
        map.once('style.load', step);
        return;
      }
      map.once('idle', done);
    };
    step();
  }

  function applyPersistedGpxBatch() {
    if (!gpxFiles.length) return;
    window.safeAddToMap(map, () => {
      gpxFiles.forEach((file) => {
        try {
          renderGPXLayers(map, file, 'init');
        } catch (e) {
          console.error('[GPX] init track failed:', file?.name, e);
        }
      });
      gpxFiles.forEach((file) => {
        const features = file.geojson?.features || [];
        if (features.length > 0) {
          addStartEndPinsToMap(map, features, file);
        }
      });
    });
  }

  runWhenMapReadyForOverlays(() => {
    applyPersistedGpxBatch();
    map.once('idle', () => {
      repairMissingGpxSources('after-init-idle');
      setTimeout(() => repairMissingGpxSources('backup-t600'), 600);
      setTimeout(() => repairMissingGpxSources('backup-t2200'), 2200);
    });
  });

  hydrateGpxFromSupabase();

  async function hydrateGpxFromSupabase() {
    try {
      if (typeof window.loadUserGpxFilesFromSupabase !== 'function') {
        return;
      }
      const remoteRawFiles = await window.loadUserGpxFilesFromSupabase();
      const remoteFiles = (Array.isArray(remoteRawFiles) ? remoteRawFiles : [])
        .map(normalizePersistedGpxFile)
        .filter(Boolean);
      if (remoteFiles.length === 0) {
        return;
      }

      const existingIds = new Set((gpxFiles || []).map((file) => file?.id).filter(Boolean));
      const filesToAdd = remoteFiles.filter((file) => !existingIds.has(file.id));
      if (filesToAdd.length === 0) {
        return;
      }

      filesToAdd.forEach((file) => {
        gpxFiles.push(file);
        scheduleRenderForFile(file, 'supabase');
        const features = file.geojson?.features || [];
        if (features.length > 0) {
          addStartEndPinsToMap(map, features, file);
        }
      });

      window.gpxFiles = gpxFiles;
      saveGpxFiles(gpxFiles.map(file => ({
        id: file.id,
        name: file.name,
        geojson: file.geojson
      })));

      map.once('idle', () => {
        setTimeout(() => repairMissingGpxSources('supabase-hydrate'), 350);
      });
    } catch (error) {
      console.warn('[GPX] Failed to hydrate from Supabase:', error);
    }
  }

  function addGpxIcons() {
    try {
      gpxIconDefs.forEach(icon => {
        if (map.hasImage(icon.name)) {
          return;
        }
        const img = new Image();
        img.onload = () => {
          if (!map.hasImage(icon.name)) {
            map.addImage(icon.name, img);
          }
        };
        img.onerror = () => {
          console.warn(`[GPX Icons] Failed to load icon: ${icon.name}`);
        };
        img.src = icon.url;
      });

    } catch (error) {
      console.error("[GPX Icons] Error adding GPX icons:", error);
    }
  }

  function ensureGpxStyleImageHandler() {
    if (gpxStyleImageMissingBound) {
      return;
    }
    map.on('styleimagemissing', (event) => {
      const missingId = event?.id;
      if (missingId === 'StartPin' || missingId === 'RedMarkerPin') {
        addGpxIcons();
      }
    });
    map.on('style.load', () => {
      // Re-register images after any style switch.
      addGpxIcons();
    });
    gpxStyleImageMissingBound = true;
  }

  function showGpxTooltip(lngLat, data) {
    if (!gpxPopup) {
      gpxPopup = new mapboxgl.Popup({
        closeButton: false,
        closeOnClick: false,
        className: 'gpx-hover-popup'
      });
    }

    gpxPopup
      .setLngLat(lngLat)
      .setHTML(`
        <div class="gpx-tooltip">
          <div><b>${data.type}</b></div>
          <div>Elevation: ${data.elevation !== null && data.elevation !== undefined ? Math.round(data.elevation) : 'N/A'} m</div>
          <div>Distance: ${(data.distanceFromStart / 1000).toFixed(2)} km</div>
          <div>Gain: +${Math.round(data.gainFromStart)} m</div>
          <div>Slope: ${data.slope}%</div>
        </div>
      `)
      .addTo(map);
  }

  function hideGpxTooltip() {
    if (gpxPopup) {
      gpxPopup.remove();
    }
  }

  function bindLineHoverHandlers(targetMap, lineLayerId) {
    if (!targetMap || !lineLayerId) return;
    if (!window.__WITD_GPX_LINE_HOVER_HANDLERS__) {
      window.__WITD_GPX_LINE_HOVER_HANDLERS__ = {};
    }
    unbindLineHoverHandlers(targetMap, lineLayerId);

    const onMove = (e) => {
      const feature = e?.features?.[0];
      if (!feature) return;
      const props = feature.properties || {};
      showGpxTooltip(e.lngLat, {
        type: props.type || 'Track',
        elevation: props.elevation,
        distanceFromStart: Number(props.distanceFromStart || 0),
        gainFromStart: Number(props.gainFromStart || 0),
        slope: props.slope ?? '0.0'
      });
    };
    const onEnter = () => {
      targetMap.getCanvas().style.cursor = 'pointer';
    };
    const onLeave = () => {
      targetMap.getCanvas().style.cursor = '';
      hideGpxTooltip();
    };

    targetMap.on('mousemove', lineLayerId, onMove);
    targetMap.on('mouseenter', lineLayerId, onEnter);
    targetMap.on('mouseleave', lineLayerId, onLeave);
    window.__WITD_GPX_LINE_HOVER_HANDLERS__[lineLayerId] = { onMove, onEnter, onLeave };
  }

  function unbindLineHoverHandlers(targetMap, lineLayerId) {
    const store = window.__WITD_GPX_LINE_HOVER_HANDLERS__;
    const handlers = store && store[lineLayerId];
    if (!handlers || !targetMap) return;
    targetMap.off('mousemove', lineLayerId, handlers.onMove);
    targetMap.off('mouseenter', lineLayerId, handlers.onEnter);
    targetMap.off('mouseleave', lineLayerId, handlers.onLeave);
    delete store[lineLayerId];
    hideGpxTooltip();
  }

  function hideAllGpxTrackLabels() {
    gpxTrackLabelElements.forEach((labelEl, gpxId) => {
      if (!labelEl) return;
      gpxHiddenLabelIds.add(gpxId);
      labelEl.style.display = 'none';
    });
  }

  function showGpxTrackLabel(gpxId) {
    if (!gpxId) return;
    const labelEl = gpxTrackLabelElements.get(gpxId);
    if (!labelEl) return;
    gpxHiddenLabelIds.delete(gpxId);
    labelEl.style.display = 'block';
  }

  /** True if the click hit a GPX line layer (not just empty map). */
  function clickHitGpxTrackLine(targetMap, e) {
    if (!targetMap || !e || e.point == null) return false;
    if (typeof targetMap.isStyleLoaded === 'function' && !targetMap.isStyleLoaded()) return false;
    try {
      const feats = targetMap.queryRenderedFeatures(e.point);
      return feats.some((f) => {
        const id = f.layer && f.layer.id;
        return typeof id === 'string' && id.startsWith('gpx-line-');
      });
    } catch (err) {
      return false;
    }
  }

  function ensureMapClickHidesGpxLabels(targetMap) {
    if (!targetMap || gpxMapClickHideLabelsBound) return;
    targetMap.on('click', (e) => {
      const clickedInsideTrackLabel = e?.originalEvent?.target?.closest?.('.track-label-container');
      if (clickedInsideTrackLabel) {
        return;
      }
      // Layer-specific GPX line click also fires a map `click`. If that handler runs first and
      // we hide here second, the label never stays visible — skip hide when the click is on a track.
      if (clickHitGpxTrackLine(targetMap, e)) {
        return;
      }
      hideAllGpxTrackLabels();
    });
    gpxMapClickHideLabelsBound = true;
  }

  function bindLineClickHandler(targetMap, lineLayerId, gpxId) {
    if (!targetMap || !lineLayerId || !gpxId) return;
    unbindLineClickHandler(targetMap, lineLayerId);

    const onClick = (e) => {
      if (e?.originalEvent?.stopPropagation) {
        e.originalEvent.stopPropagation();
      }
      showGpxTrackLabel(gpxId);
    };

    targetMap.on('click', lineLayerId, onClick);
    gpxLineClickHandlers.set(lineLayerId, onClick);
  }

  function unbindLineClickHandler(targetMap, lineLayerId) {
    const handler = gpxLineClickHandlers.get(lineLayerId);
    if (!handler || !targetMap || !lineLayerId) return;
    targetMap.off('click', lineLayerId, handler);
    gpxLineClickHandlers.delete(lineLayerId);
  }

  function setupFileInput() {
    // Set up file input - create our own to avoid conflicts
    let input = document.createElement('input');
    input.type = 'file';
    input.accept = '.gpx';
    input.id = 'gpxManagerInput';
    input.style.display = 'none';
    document.body.appendChild(input);

    // Don't sync with existing input to avoid conflicts
    // Our input is completely independent

    // Remove any existing event listeners to prevent duplicates
    input.removeEventListener('change', handleFileSelect);
    input.addEventListener('change', handleFileSelect);

    // Expose our input globally so the upload button can use it
    window.gpxManagerInput = input;
  }

  function handleFileSelect(e) {
    const files = e.target.files;

  if (!files || files.length === 0) {
    console.warn("[GPX] No files selected");
    return;
  }

  if (!map) {
    console.error("[GPX] Map not available - cannot load GPX files");
    return;
  }

    Array.from(files).forEach(file => {
      if (file.name.toLowerCase().endsWith('.gpx')) {
    gpxlog(`📁 GPX file selected: ${file.name}`);
        loadGpxFile(file);
      }
    });

    // Reset input value so the same file can be selected again
    e.target.value = '';
  }

  function loadGpxFile(file) {
    
    const reader = new FileReader();
    reader.onload = function(e) {
      try {
        const gpxContent = e.target.result;
        const gpxData = parseGpxToGeoJson(gpxContent, file.name);
        
        if (gpxData) {
          addGpxToMap(gpxData, file.name);
                      } else {
          console.warn(`[GPX] Failed to parse GPX data for ${file.name}`);
              }
            } catch (error) {
        console.error(`[GPX] Error processing GPX file ${file.name}:`, error);
      }
    };
    
    reader.readAsText(file);
  }

  function parseGpxToGeoJson(gpxContent, fileName) {
    try {
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(gpxContent, 'text/xml');
      
      if (xmlDoc.getElementsByTagName('parsererror').length > 0) {
        console.error("[GPX] XML parsing error");
        throw new Error('Invalid XML');
      }

      const tracks = xmlDoc.getElementsByTagName('trk');
      const waypoints = xmlDoc.getElementsByTagName('wpt');
      
      if (tracks.length === 0) {
        console.warn("[GPX] No tracks found in GPX file");
        return null;
      }

      const toRad = d => d * Math.PI / 180;
      const getDistance = (a, b) => {
        const R = 6371000;
        const dLat = toRad(b.lat - a.lat);
        const dLng = toRad(b.lng - a.lng);
        const lat1 = toRad(a.lat);
        const lat2 = toRad(b.lat);

        const x = dLng * Math.cos((lat1 + lat2) / 2);
        const y = dLat;
        return Math.sqrt((x * x) + (y * y)) * R;
      };

      const trackFeatures = [];
      
      // Parse tracks
      for (let i = 0; i < tracks.length; i++) {
        const track = tracks[i];
        const trackSegments = track.getElementsByTagName('trkseg');
        
        // Build point list including elevation so we can color per segment.
        const allPoints = [];

        for (let j = 0; j < trackSegments.length; j++) {
          const segment = trackSegments[j];
          const trackPoints = segment.getElementsByTagName('trkpt');

          for (let k = 0; k < trackPoints.length; k++) {
            const point = trackPoints[k];
            const lat = parseFloat(point.getAttribute('lat'));
            const lon = parseFloat(point.getAttribute('lon'));
            const eleNode = point.getElementsByTagName('ele')[0];
            const ele = eleNode ? parseFloat(eleNode.textContent) : null;
            if (!isNaN(lat) && !isNaN(lon)) {
              allPoints.push({
                lat,
                lng: lon,
                ele: Number.isFinite(ele) ? ele : null
              });
            }
          }
        }

        if (allPoints.length > 1) {
          const trackName = fileName || `Track ${i + 1}`;
          const hasAnyElevation = allPoints.some(p => Number.isFinite(p.ele));
          let totalDistance = 0;
          let totalGain = 0;
          let totalDescent = 0;

          for (let pointIndex = 0; pointIndex < allPoints.length - 1; pointIndex++) {
            const currentPoint = allPoints[pointIndex];
            const nextPoint = allPoints[pointIndex + 1];
            totalDistance += getDistance(currentPoint, nextPoint);

            if (Number.isFinite(currentPoint.ele) && Number.isFinite(nextPoint.ele)) {
              const diff = nextPoint.ele - currentPoint.ele;
              if (diff > 0) totalGain += diff;
              if (diff < 0) totalDescent += Math.abs(diff);
            }
          }

          const distanceKm = (totalDistance / 1000).toFixed(2);
          const gainM = Math.round(totalGain);
          const descentM = Math.round(totalDescent);
          const baseTrackProperties = {
            name: trackName,
            type: 'gpx-track',
            trackIndex: i,
            distanceKm,
            gainM,
            descentM
          };

          // Fallback path: missing elevation data keeps a single default-colored line.
          if (!hasAnyElevation) {
            trackFeatures.push({
              type: 'Feature',
              properties: {
                ...baseTrackProperties,
                color: '#333333'
              },
              geometry: {
                type: 'LineString',
                coordinates: allPoints.map(p => [p.lng, p.lat])
              }
            });
            continue;
          }

          const trackFeaturesBeforeElevationPass = trackFeatures.length;
          let cumulativeDistance = 0;
          let cumulativeGain = 0;
          let currentGroup = null;
          for (let pointIndex = 0; pointIndex < allPoints.length - 1; pointIndex++) {
            const currentPoint = allPoints[pointIndex];
            const nextPoint = allPoints[pointIndex + 1];

            const dist = getDistance(currentPoint, nextPoint);
            if (dist < MIN_STEP_DISTANCE_METERS) continue;
            cumulativeDistance += dist;

            const currentEle = currentPoint.ele;
            const nextEle = nextPoint.ele;
            if (currentEle !== null && nextEle !== null) {
              const diff = nextEle - currentEle;
              if (diff > 0) cumulativeGain += diff;
            }

            let slope = 0;
            if (currentEle !== null && nextEle !== null && dist > 0) {
              slope = ((nextEle - currentEle) / dist) * 100;
            }

            let segmentType = 'flat';

            if (nextEle !== null && currentEle !== null) {
              const diff = nextEle - currentEle;

              if (diff > ELEVATION_THRESHOLD_METERS) {
                segmentType = 'uphill';
              } else if (diff < -ELEVATION_THRESHOLD_METERS) {
                segmentType = 'downhill';
              }
            }

            let color = '#bbbbbb';
            if (segmentType === 'uphill') color = '#ff3b30';
            if (segmentType === 'downhill') color = '#007aff';

            // START NEW GROUP
            if (!currentGroup || currentGroup.properties.type !== segmentType) {
              if (currentGroup) {
                trackFeatures.push(currentGroup);
              }

              const segmentElevation = Number.isFinite(nextEle)
                ? nextEle
                : (Number.isFinite(currentEle) ? currentEle : null);
              currentGroup = {
                type: 'Feature',
                properties: {
                  ...baseTrackProperties,
                  isSegment: true,
                  color: color,
                  type: segmentType,
                  elevation: Number.isFinite(segmentElevation) ? segmentElevation : null,
                  distanceFromStart: cumulativeDistance,
                  gainFromStart: cumulativeGain,
                  slope: slope.toFixed(1),
                  segmentIndex: pointIndex
                },
                geometry: {
                  type: 'LineString',
                  coordinates: [
                    [currentPoint.lng, currentPoint.lat],
                    [nextPoint.lng, nextPoint.lat]
                  ]
                }
              };
              continue;
            }

            // EXTEND CURRENT GROUP
            currentGroup.geometry.coordinates.push([nextPoint.lng, nextPoint.lat]);
            currentGroup.properties.elevation = Number.isFinite(nextEle) ? nextEle : currentGroup.properties.elevation;
            currentGroup.properties.distanceFromStart = cumulativeDistance;
            currentGroup.properties.gainFromStart = cumulativeGain;
            currentGroup.properties.slope = slope.toFixed(1);
          }

          // PUSH LAST GROUP
          if (currentGroup) {
            trackFeatures.push(currentGroup);
          }

          // Dense tracks (e.g. exported drawn lines) can have every leg under ~2 m; the old threshold dropped
          // all segments and produced no LineString features. Fall back to one full path.
          if (trackFeatures.length === trackFeaturesBeforeElevationPass && allPoints.length > 1) {
            trackFeatures.push({
              type: 'Feature',
              properties: {
                ...baseTrackProperties,
                color: '#333333'
              },
              geometry: {
                type: 'LineString',
                coordinates: allPoints.map(p => [p.lng, p.lat])
              }
            });
          }
        }
      }

      
      if (trackFeatures.length === 0) {
        console.warn("[GPX] No valid track features created");
        return null;
      }
      
      return {
        tracks: {
          type: 'FeatureCollection',
          features: trackFeatures
        }
      };
    } catch (error) {
      console.error("[GPX] Error parsing GPX:", error);
      return null;
    }
  }

  function onGPXUpload(geojson, fileName) {
    const newFile = {
      id: generateGPXId(),
      geojson,
      name: fileName
    };
    gpxFiles.push(newFile);
    window.gpxFiles = gpxFiles;
    scheduleRenderForFile(newFile, 'upload');
  }

  function scheduleRenderForFile(file, cycle = 'manual') {
    if (!file || !file.id || !file.geojson) return;
    const runRender = () => renderGPX(map, file, cycle);
    const step = () => {
      if (!isMapLoadEventDone()) {
        map.once('load', step);
        return;
      }
      if (!map.isStyleLoaded()) {
        map.once('style.load', step);
        return;
      }
      runRender();
    };
    step();
  }

  function addGpxToMap(gpxData, fileName, shouldFitBounds = true) {
    try {
      const newTrackFeatures = gpxData.tracks?.features || gpxData.features || [];
      const geojson = { type: 'FeatureCollection', features: newTrackFeatures };

      onGPXUpload(geojson, fileName);
      const uploadedFile = gpxFiles[gpxFiles.length - 1];

      // Fit map to show all tracks (only when loading new tracks, not during restoration)
      if (shouldFitBounds && newTrackFeatures.length > 0) {
        const bounds = calculateBounds(newTrackFeatures);
        if (bounds) {
          try {
            map.fitBounds(bounds, { padding: 50 });
          } catch (error) {
            console.warn("[GPX] Could not fit map to bounds:", error);
          }
        }
      }

      // Save to storage
      saveGpxFiles(gpxFiles.map(file => ({
        id: file.id,
        name: file.name,
        geojson: file.geojson
      })));

      if (uploadedFile && newTrackFeatures.length > 0) {
        addStartEndPinsToMap(map, newTrackFeatures, uploadedFile);
      }

    } catch (error) {
      console.error(`[GPX] Error adding GPX to map:`, error);
    }
  }
  window.addGpxToMap = addGpxToMap;

  function deleteGPX(id) {
    const sourceId = `gpx-source-${id}`;
    const lineLayerId = `gpx-line-${id}`;
    const labelLayerId = `gpx-label-${id}`;

    unbindLineHoverHandlers(map, lineLayerId);
    unbindLineClickHandler(map, lineLayerId);
    if (map.getLayer(lineLayerId)) map.removeLayer(lineLayerId);
    if (map.getLayer(labelLayerId)) map.removeLayer(labelLayerId);
    if (map.getSource(sourceId)) map.removeSource(sourceId);

    const track = gpxFiles.find(file => file.id === id);
    if (!track) {
      return;
    }

    removePinsFromClusteredSource(map, id);

    // Remove HTML track label marker for this track
    const trackLabelMarkers = document.querySelectorAll('.track-label-container');
    trackLabelMarkers.forEach(marker => {
      if (marker.getAttribute('data-gpx-id') === id) {
        marker.remove();
      }
    });
    gpxTrackLabelElements.delete(id);
    gpxHiddenLabelIds.delete(id);

    gpxFiles = gpxFiles.filter(f => f.id !== id);
    window.gpxFiles = gpxFiles;
    saveGpxFiles(gpxFiles.map(file => ({
      id: file.id,
      name: file.name,
      geojson: file.geojson
    })));
  }

  function deleteTrack(fileName) {
    const track = gpxFiles.find(file => file.name === fileName);
    if (!track) return;
    deleteGPX(track.id);
  }

  function calculateBounds(features) {
    if (!features || features.length === 0) return null;

    let minLng = Infinity, maxLng = -Infinity;
    let minLat = Infinity, maxLat = -Infinity;

    features.forEach(feature => {
      if (feature.geometry && feature.geometry.coordinates) {
        feature.geometry.coordinates.forEach(coord => {
          const [lng, lat] = coord;
          minLng = Math.min(minLng, lng);
          maxLng = Math.max(maxLng, lng);
          minLat = Math.min(minLat, lat);
          maxLat = Math.max(maxLat, lat);
        });
      }
    });

    if (minLng === Infinity) return null;

    return [[minLng, minLat], [maxLng, maxLat]];
  }

  function clearAllGpxTracks() {
    gpxFiles.forEach(file => {
      deleteGPX(file.id);
    });
    
    // Clear clustered pins data
    gpxPinsData.features = [];
    const pinsSource = map.getSource(gpxPinsSourceId);
    if (pinsSource) {
      pinsSource.setData(gpxPinsData);
    }
    
    // Remove clustered pin layers
    if (map.getLayer('gpx-clusters')) {
      map.removeLayer('gpx-clusters');
    }
    if (map.getLayer('gpx-cluster-count')) {
      map.removeLayer('gpx-cluster-count');
    }
    if (map.getLayer('gpx-unclustered-points')) {
      map.removeLayer('gpx-unclustered-points');
    }
    
    // Remove clustered pin source
    if (map.getSource(gpxPinsSourceId)) {
      map.removeSource(gpxPinsSourceId);
    }
    
    // Remove all HTML track label markers
    const markers = document.querySelectorAll('.track-label-container');
    markers.forEach(marker => {
      marker.remove();
      gpxlog(`[GPX] Removed HTML track label marker`);
    });
    gpxTrackLabelElements.clear();
    gpxHiddenLabelIds.clear();
    
    gpxFiles = [];
    window.gpxFiles = gpxFiles;
    saveGpxFiles(gpxFiles);
    gpxlog("[GPX] Cleared all GPX tracks, pins, and labels");
  }

  // Expose functions globally
  window.gpxFiles = gpxFiles;
  window.removeGpxTrack = deleteTrack; // Use existing deleteTrack function
  window.deleteGPX = deleteGPX;
  window.clearAllGpxTracks = clearAllGpxTracks;

  // Clustered pin source management
  const gpxPinsSourceId = 'gpx-pins-clustered';
  let gpxPinsHandlersBound = false;
  let gpxPinsData = {
    type: 'FeatureCollection',
    features: []
  };

  function initializeClusteredPinsSource(map) {
    if (!map || typeof map.getStyle !== 'function') {
      return;
    }
    if (!map.isStyleLoaded()) {
      map.once('style.load', () => initializeClusteredPinsSource(map));
      return;
    }
      // Ensure source exists for current style (self-contained, no external helper dependency).
      const sourceDef = {
        type: 'geojson',
        data: gpxPinsData,
        cluster: true,
        clusterMaxZoom: 14,
        clusterRadius: 50
      };
      if (!map.getSource(gpxPinsSourceId)) {
        try {
          map.addSource(gpxPinsSourceId, sourceDef);
        } catch (error) {
          const isDuplicate = String(error?.message || '').includes(`already a source with ID "${gpxPinsSourceId}"`);
          if (!isDuplicate) {
            console.error('[GPX Pins] addSource failed:', error);
            return;
          }
        }
      } else if (typeof map.getSource(gpxPinsSourceId).setData === 'function') {
        map.getSource(gpxPinsSourceId).setData(gpxPinsData);
      }

      const clusterLayerDef = {
        id: 'gpx-clusters',
        type: 'circle',
        source: gpxPinsSourceId,
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': [
            'step',
            ['get', 'point_count'],
            '#51bbd6',
            100,
            '#f1f075',
            750,
            '#f28cb1'
          ],
          'circle-radius': [
            'step',
            ['get', 'point_count'],
            20,
            100,
            30,
            750,
            40
          ]
        }
      };
      if (!map.getLayer(clusterLayerDef.id)) {
        try {
          map.addLayer(clusterLayerDef);
        } catch (error) {
          console.error('[GPX Pins] addLayer failed (gpx-clusters):', error);
        }
      }

      const clusterCountLayerDef = {
        id: 'gpx-cluster-count',
        type: 'symbol',
        source: gpxPinsSourceId,
        filter: ['has', 'point_count'],
        layout: {
          'text-field': '{point_count_abbreviated}',
          'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'],
          'text-size': 12
        },
        paint: {
          'text-color': '#1f2937',
          'text-halo-color': '#ffffff',
          'text-halo-width': 2,
          'text-halo-blur': 0.5
        }
      };
      if (!map.getLayer(clusterCountLayerDef.id)) {
        try {
          map.addLayer(clusterCountLayerDef);
        } catch (error) {
          console.error('[GPX Pins] addLayer failed (gpx-cluster-count):', error);
        }
      }

      const unclusteredLayerDef = {
        id: 'gpx-unclustered-points',
        type: 'symbol',
        source: gpxPinsSourceId,
        filter: ['!', ['has', 'point_count']],
        layout: {
          'icon-image': [
            'case',
            ['==', ['get', 'type'], 'start'],
            'StartPin',
            'RedMarkerPin'
          ],
          'icon-size': 0.05,
          'icon-allow-overlap': true,
          'text-field': ['get', 'title'],
          'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'],
          'text-size': 12,
          'text-offset': [0, 1.45],
          'text-anchor': 'top',
          'text-allow-overlap': true,
          'text-padding': 4
        },
        // Wide light halo reads like a soft pill behind the label (saved-pin / track-label theme).
        paint: {
          'text-color': [
            'match',
            ['get', 'type'],
            'start',
            '#166534',
            'end',
            '#b91c1c',
            '#374151'
          ],
          'text-halo-color': '#ffffff',
          'text-halo-width': 3,
          'text-halo-blur': 1
        }
      };
      if (!map.getLayer(unclusteredLayerDef.id)) {
        try {
          map.addLayer(unclusteredLayerDef);
        } catch (error) {
          console.error('[GPX Pins] addLayer failed (gpx-unclustered-points):', error);
        }
      }

      if (!gpxPinsHandlersBound) {
        // Add click handlers for clusters and pins once.
        map.on('click', 'gpx-clusters', (e) => {
          const features = map.queryRenderedFeatures(e.point, {
            layers: ['gpx-clusters']
          });
          const clusterId = features[0].properties.cluster_id;
          map.getSource(gpxPinsSourceId).getClusterExpansionZoom(clusterId, (err, zoom) => {
            if (err) return;
            map.easeTo({
              center: features[0].geometry.coordinates,
              zoom: zoom
            });
          });
        });

        map.on('click', 'gpx-unclustered-points', (e) => {
          const features = map.queryRenderedFeatures(e.point, {
            layers: ['gpx-unclustered-points']
          });
          if (features.length > 0) {
            const feature = features[0];
            gpxlog(`[GPX] Pin clicked: ${feature.properties.title} (${feature.properties.fileName})`);
          }
        });

        // Change cursor on hover.
        map.on('mouseenter', 'gpx-clusters', () => {
          map.getCanvas().style.cursor = 'pointer';
        });
        map.on('mouseleave', 'gpx-clusters', () => {
          map.getCanvas().style.cursor = '';
        });
        map.on('mouseenter', 'gpx-unclustered-points', () => {
          map.getCanvas().style.cursor = 'pointer';
        });
        map.on('mouseleave', 'gpx-unclustered-points', () => {
          map.getCanvas().style.cursor = '';
        });
        gpxPinsHandlersBound = true;
      }

      // Final safety rebind after style churn.
      const source = map.getSource(gpxPinsSourceId);
      if (source && typeof source.setData === 'function') {
        source.setData(gpxPinsData);
      }
  }

  function addPinsToClusteredSource(map, pins) {
    // Initialize source if it doesn't exist
    initializeClusteredPinsSource(map);
    
    // Add pins to the data
    gpxPinsData.features.push(...pins);
    
    // Update the source
    let source = map.getSource(gpxPinsSourceId);
    if (!source) {
      initializeClusteredPinsSource(map);
      source = map.getSource(gpxPinsSourceId);
    }
    if (source) {
      source.setData(gpxPinsData);
    }
  }

  function removePinsFromClusteredSource(map, gpxId) {
    // Remove pins for this file
    gpxPinsData.features = gpxPinsData.features.filter(feature => 
      feature.properties.gpxId !== gpxId
    );
    
    // Update the source
    const source = map.getSource(gpxPinsSourceId);
    if (source) {
      source.setData(gpxPinsData);
    }
  }

  // Clustered start/end pin system
  function addStartEndPinsToMap(map, trackFeatures, gpxFile) {
    try {
      const gpxId = gpxFile?.id;
      const fileName = gpxFile?.name || 'GPX Track';
      if (!gpxId) return;
      gpxlog(`[GPX Pins] Adding clustered start/end pins for ${fileName}`);
      const normalizedTrackFeatures = normalizeTrackFeaturesForPins(trackFeatures);
      // Always ensure clustered source/layers exist for the current style.
      initializeClusteredPinsSource(map);
      
      // Check if pins for this track already exist to prevent duplicates
      const existingPins = gpxPinsData.features.filter(feature => 
        feature.properties.gpxId === gpxId
      );
      
      if (existingPins.length > 0) {
        gpxlog(`[GPX Pins] Pins for ${fileName} already exist, re-binding source to current style...`);
        const source = map.getSource(gpxPinsSourceId);
        if (source) {
          source.setData(gpxPinsData);
        }
      }
      
      if (existingPins.length === 0) {
        // Collect all pins for this track
        const pins = [];
        normalizedTrackFeatures.forEach((track, trackIndex) => {
          const coordinates = track.geometry.coordinates;
          if (coordinates.length >= 2) {
            const startCoord = coordinates[0];
            const endCoord = coordinates[coordinates.length - 1];
            const trackId = `${gpxId}-${trackIndex}`;

            // Add start pin
            pins.push({
              type: 'Feature',
              geometry: {
                type: 'Point',
                coordinates: startCoord,
              },
              properties: {
                id: `start-pin-${trackId}`,
                title: 'Start',
                type: 'start',
                gpxId: gpxId,
                fileName: fileName,
                trackId: trackId
              }
            });

            // Add end pin
            pins.push({
              type: 'Feature',
              geometry: {
                type: 'Point',
                coordinates: endCoord,
              },
              properties: {
                id: `end-pin-${trackId}`,
                title: 'End',
                type: 'end',
                gpxId: gpxId,
                fileName: fileName,
                trackId: trackId
              }
            });
          }
        });

        // Add pins to the clustered source
        if (pins.length > 0) {
          addPinsToClusteredSource(map, pins);
        map.once('idle', () => {
          initializeClusteredPinsSource(map);
          const source = map.getSource(gpxPinsSourceId);
          if (source && typeof source.setData === 'function') {
            source.setData(gpxPinsData);
          }
        });
        }
      }

      // Check if track label already exists to prevent duplicates
      const existingLabel = document.querySelector(`.track-label-container[data-gpx-id="${gpxId}"]`);
      if (existingLabel) {
        gpxlog(`[GPX] Track label for ${fileName} already exists, skipping...`);
        return;
      }

      // Add track name label at the middle of the track
      if (normalizedTrackFeatures.length > 0) {
        ensureMapClickHidesGpxLabels(map);
        const track = normalizedTrackFeatures[0];
        const coordinates = track.geometry.coordinates;
        if (coordinates.length > 0) {
          const middleIndex = Math.floor(coordinates.length / 2);
          const middleCoord = coordinates[middleIndex];
          
          // Create styled track label element
          const trackLabelEl = document.createElement('div');
          trackLabelEl.className = 'track-label-container';
          trackLabelEl.setAttribute('data-file-name', fileName);
          trackLabelEl.setAttribute('data-gpx-id', gpxId);
          const trackStats = track.properties || {};
          const distanceKmText = trackStats.distanceKm ?? '0.00';
          const gainMText = trackStats.gainM ?? 0;
          const descentMText = trackStats.descentM ?? 0;
          trackLabelEl.innerHTML = `
            <div class="track-label-popup">
              <div class="track-label-header">
                <span class="track-label-title">${fileName.replace('.gpx', '')}</span>
                <button class="track-delete-btn" title="Delete Track">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="3,6 5,6 21,6"></polyline>
                    <path d="m19,6v14a2,2 0 0,1 -2,2H7a2,2 0 0,1 -2,-2V6m3,0V4a2,2 0 0,1 2,-2h4a2,2 0 0,1 2,2v2"></path>
                    <line x1="10" y1="11" x2="10" y2="17"></line>
                    <line x1="14" y1="11" x2="14" y2="17"></line>
                  </svg>
                </button>
              </div>
              <div class="gpx-stats">
                <div>Distance: ${distanceKmText} km</div>
                <div>Elevation Gain: ${gainMText} m</div>
                <div>Descent: ${descentMText} m</div>
              </div>
            </div>
          `;
          
          // Create marker for the track label
          const trackLabelMarker = new mapboxgl.Marker({
            element: trackLabelEl,
            anchor: 'center'
          })
          .setLngLat(middleCoord)
          .addTo(map);
          
          // Store reference for deletion
          trackLabelMarker._fileName = fileName;
          trackLabelMarker._gpxId = gpxId;
          trackLabelMarker._trackFeatures = trackFeatures;
          
          // Add zoom-based visibility
          const updateLabelVisibility = () => {
            const zoom = map.getZoom();
            const isHidden = gpxHiddenLabelIds.has(gpxId);
            // Match mapEngine DEFAULT_ZOOM (7): threshold was 8 so labels were hidden on every
            // cold reload when the map resets to default zoom.
            if (zoom < 7 || isHidden) {
              trackLabelEl.style.display = 'none'; // Hide labels when zoomed out
            } else {
              trackLabelEl.style.display = 'block'; // Show labels when zoomed in
            }
          };
          
          // Initial visibility check
          updateLabelVisibility();
          
          // Update visibility on zoom
          map.on('zoom', updateLabelVisibility);
          
          // Add delete button functionality
          const deleteBtn = trackLabelEl.querySelector('.track-delete-btn');
          deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            deleteGPX(gpxId);
          });

          trackLabelEl.addEventListener('click', (e) => {
            e.stopPropagation();
            showGpxTrackLabel(gpxId);
            updateLabelVisibility();
          });

          gpxTrackLabelElements.set(gpxId, trackLabelEl);
        }
      }

    } catch (error) {
      console.error("[GPX Pins] Error adding start/end pins:", error);
    }
  }

  function normalizeTrackFeaturesForPins(trackFeatures) {
    const nonSegmentTracks = trackFeatures.filter(track => !track?.properties?.isSegment);
    if (nonSegmentTracks.length > 0) {
      return nonSegmentTracks;
    }

    const segmentTracksByIndex = new Map();
    trackFeatures
      .filter(track => track?.properties?.isSegment)
      .forEach(track => {
        const key = Number.isInteger(track.properties.trackIndex) ? track.properties.trackIndex : 0;
        if (!segmentTracksByIndex.has(key)) {
          segmentTracksByIndex.set(key, []);
        }
        segmentTracksByIndex.get(key).push(track);
      });

    const rebuiltTracks = [];
    segmentTracksByIndex.forEach((segments, trackIndex) => {
      const orderedSegments = segments
        .slice()
        .sort((a, b) => (a.properties.segmentIndex || 0) - (b.properties.segmentIndex || 0));

      if (orderedSegments.length === 0) {
        return;
      }

      const rebuiltCoordinates = [];
      orderedSegments.forEach((segment, segIdx) => {
        const coords = segment.geometry?.coordinates || [];
        if (coords.length === 0) {
          return;
        }
        const part = segIdx === 0 ? coords : coords.slice(1);
        rebuiltCoordinates.push(...part);
      });

      if (rebuiltCoordinates.length > 1) {
        rebuiltTracks.push({
          type: 'Feature',
          properties: {
            ...orderedSegments[0].properties,
            isSegment: false,
            trackIndex
          },
          geometry: {
            type: 'LineString',
            coordinates: rebuiltCoordinates
          }
        });
      }
    });

    return rebuiltTracks;
  }

  // Debug function
  window.debugGPX = function() {
    gpxlog("🔍 GPX Debug Info:");
    const styleSources = map.getStyle()?.sources || {};
    const gpxSourceKeys = Object.keys(styleSources).filter((key) => key.startsWith('gpx-source-'));
    gpxlog("- GPX per-file sources:", gpxSourceKeys);
    gpxlog("- Start/end pin layers exist:", !!map.getLayer('start-pin-'));
    gpxlog("- Current gpxFiles count:", gpxFiles.length);
    gpxlog("- Map object:", map);
  };

  // Function to restore GPX tracks after style switch
  window.restoreGPXTracksAfterStyleSwitch = function(mapInstance, cycle = 'unknown') {
    let currentMap = mapInstance;
    let restoreCycle = cycle;
    if (!mapInstance || typeof mapInstance !== 'object' || typeof mapInstance.getStyle !== 'function') {
      restoreCycle = typeof mapInstance === 'string' && mapInstance ? mapInstance : cycle;
      currentMap = window.WITD?.map;
    }
    if (!currentMap) {
      console.warn(`[GPX Restore ${restoreCycle}] No map available`);
      return;
    }

    gpxlog(`[GPX Restore ${restoreCycle}] Starting full restore of ${window.gpxFiles?.length || 0} tracks`);

    document.querySelectorAll('.track-label-container').forEach(el => el.remove());
    gpxPinsData.features = [];

    if (!window.gpxFiles || window.gpxFiles.length === 0) {
      gpxlog(`[GPX Restore ${restoreCycle}] No tracks to restore`);
      return;
    }

    const renderAllTracks = () => {
      window.safeAddToMap(currentMap, () => {
        window.gpxFiles.forEach((file, index) => {
          gpxlog(`[GPX Restore ${restoreCycle}] Re-rendering track ${index + 1}/${window.gpxFiles.length}: ${file.name}`);
          try {
            renderGPXLayers(currentMap, file, `restore-${restoreCycle}`);
          } catch (e) {
            console.error('[GPX] restore track failed:', file?.name, e);
          }
          const features = file.geojson?.features || [];
          if (features.length > 0) {
            addStartEndPinsToMap(currentMap, features, file);
          }
        });
      });

      currentMap.once('idle', () => {
        gpxlog(`[GPX Restore ${restoreCycle}] Restore completed successfully`);
        currentMap.resize();
        setTimeout(() => repairMissingGpxSources(`restore-${restoreCycle}`), 200);
      });
    };

    const runWhenReady = () => {
      if (!currentMap.isStyleLoaded()) {
        currentMap.once('style.load', runWhenReady);
        return;
      }
      currentMap.once('idle', renderAllTracks);
    };

    runWhenReady();
  };

  // GPX Zoom-based Visibility is handled by Mapbox clustering.
}

// Shared Haversine / slope / elevation rendering helpers for GPX uploads and drawn tracks.
(function () {
  window.WITD = window.WITD || {};
  const ELEVATION_THRESHOLD_METERS = 1.5;
  const UPHILL_COLOR = '#ff5c33';
  const DOWNHILL_COLOR = '#2b8cff';
  const FLAT_COLOR = '#9ca3af';

  function toRad(d) {
    return (d * Math.PI) / 180;
  }

  function haversineMetersFromLngLat(a, b) {
    const R = 6371000;
    const dLat = toRad(b[1] - a[1]);
    const dLng = toRad(b[0] - a[0]);
    const lat1 = toRad(a[1]);
    const lat2 = toRad(b[1]);
    const x = dLng * Math.cos((lat1 + lat2) / 2);
    const y = dLat;
    return Math.sqrt(x * x + y * y) * R;
  }

  function clamp01(t) {
    return Math.max(0, Math.min(1, t));
  }

  /** Ratio 0 = low (cool blue), 1 = high (warm red). */
  function hexFromElevationRatio(t) {
    const u = clamp01(t);
    const r = Math.round(255 * u);
    const b = Math.round(255 * (1 - u));
    const g = Math.round(80 + 120 * (1 - Math.abs(u - 0.5) * 2));
    const hx = (n) => n.toString(16).padStart(2, '0');
    return `#${hx(r)}${hx(g)}${hx(b)}`;
  }

  function classifySlope(diff) {
    if (diff > ELEVATION_THRESHOLD_METERS) return 'uphill';
    if (diff < -ELEVATION_THRESHOLD_METERS) return 'downhill';
    return 'flat';
  }

  function isFiniteEle(e) {
    return e !== null && e !== undefined && Number.isFinite(e);
  }

  function buildElevationSegments(coords, elevs, baseProps, fallbackColor) {
    const fc = fallbackColor || '#ff6b35';
    const finiteE = (elevs || []).map((e) => (isFiniteEle(e) ? e : null));
    let minE = Infinity;
    let maxE = -Infinity;
    finiteE.forEach((e) => {
      if (e !== null) {
        minE = Math.min(minE, e);
        maxE = Math.max(maxE, e);
      }
    });

    if (!Number.isFinite(minE)) {
      return [];
    }
    if (Math.abs(maxE - minE) < 0.01) {
      return [{
        type: 'Feature',
        properties: {
          ...baseProps,
          color: hexFromElevationRatio(0.5),
          isDrawSegment: true,
          segmentMode: 'elevation'
        },
        geometry: { type: 'LineString', coordinates: coords.slice() }
      }];
    }

    const range = maxE - minE;
    const BIN = 10;
    const features = [];
    let currentGroup = null;

    for (let i = 0; i < coords.length - 1; i++) {
      const p0 = coords[i];
      const p1 = coords[i + 1];
      const e0 = finiteE[i];
      const e1 = finiteE[i + 1];

      let segColor = fc;
      let binKey = '_fb';
      if (e0 !== null && e1 !== null) {
        const avg = (e0 + e1) / 2;
        const t = (avg - minE) / range;
        const bin = Math.min(BIN - 1, Math.floor(clamp01(t) * BIN));
        binKey = String(bin);
        segColor = hexFromElevationRatio((bin + 0.5) / BIN);
      }

      if (!currentGroup || currentGroup.binKey !== binKey) {
        if (currentGroup) {
          features.push(currentGroup.feature);
        }
        currentGroup = {
          binKey,
          feature: {
            type: 'Feature',
            properties: {
              ...baseProps,
              color: segColor,
              isDrawSegment: true,
              segmentMode: 'elevation'
            },
            geometry: { type: 'LineString', coordinates: [p0, p1] }
          }
        };
      } else {
        currentGroup.feature.geometry.coordinates.push(p1);
      }
    }
    if (currentGroup) {
      features.push(currentGroup.feature);
    }
    return features;
  }

  function buildSlopeSegments(coords, elevs, baseProps, fallbackColor) {
    const fc = fallbackColor || '#ff6b35';
    const features = [];
    let currentGroup = null;

    for (let i = 0; i < coords.length - 1; i++) {
      const p0 = coords[i];
      const p1 = coords[i + 1];
      const dist = haversineMetersFromLngLat(p0, p1);
      if (dist < 2) {
        continue;
      }

      const e0 = elevs[i];
      const e1 = elevs[i + 1];
      let segmentType = 'flat';
      let color = FLAT_COLOR;

      if (isFiniteEle(e0) && isFiniteEle(e1)) {
        const diff = e1 - e0;
        segmentType = classifySlope(diff);
        if (segmentType === 'uphill') color = UPHILL_COLOR;
        else if (segmentType === 'downhill') color = DOWNHILL_COLOR;
        else color = FLAT_COLOR;
      } else {
        color = fc;
      }

      if (!currentGroup || currentGroup.type !== segmentType) {
        if (currentGroup) {
          features.push(currentGroup.feature);
        }
        currentGroup = {
          type: segmentType,
          feature: {
            type: 'Feature',
            properties: {
              ...baseProps,
              color,
              isDrawSegment: true,
              segmentMode: 'slope',
              slopeType: segmentType
            },
            geometry: { type: 'LineString', coordinates: [p0, p1] }
          }
        };
      } else {
        currentGroup.feature.geometry.coordinates.push(p1);
      }
    }
    if (currentGroup) {
      features.push(currentGroup.feature);
    }
    return features;
  }

  /**
   * @param {'elevation'|'slope'} mode
   * @param {[number,number][]} coords
   * @param {(number|null)[]|undefined} elevs
   * @param {object} baseProps — segment paint props (color/style/thickness…)
   */
  function buildDrawColoredSegments(mode, coords, elevs, baseProps) {
    if (!coords || coords.length < 2) {
      return [];
    }
    const fallback = (baseProps && baseProps.color) || '#ff6b35';
    const hasAnyEle = Array.isArray(elevs) && elevs.some(isFiniteEle);
    if (!hasAnyEle) {
      return [];
    }
    if (mode === 'slope') {
      return buildSlopeSegments(coords, elevs, baseProps, fallback);
    }
    if (mode === 'elevation') {
      return buildElevationSegments(coords, elevs, baseProps, fallback);
    }
    return [];
  }

  window.WITD.gpxTrackMath = {
    ELEVATION_THRESHOLD_METERS,
    haversineMetersFromLngLat,
    buildDrawColoredSegments,
    slopePercent(e0, e1, distM) {
      if (!distM || distM < 0.5) return 0;
      if (!isFiniteEle(e0) || !isFiniteEle(e1)) return 0;
      return ((e1 - e0) / distM) * 100;
    },
    classifySlopeDelta(diff) {
      return classifySlope(diff);
    }
  };
})();