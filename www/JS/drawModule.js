// JS/drawModule.js  (Mapbox GL freehand drawing)
// Exposes: window.startDrawTrack() to toggle freehand mode
// Also exposes: window.WITD.draw = { enable, disable, isActive, clear, getFeatures }

(function () {
  const SRC_ID = 'freehand-draw';
  const LINE_LAYER_ID = 'freehand-draw-line';

  let map = null;
  let isActive = false;       // freehand mode on/off (toolbar toggle)
  let isCapturing = false;    // currently holding/dragging to record a stroke
  let currentCoords = [];
  let lineStartPoint = null;  // Starting point for line drawing
  let isLineMode = false;     // Whether currently in line drawing mode
  let isPolygonMode = false;  // Whether currently in polygon drawing mode
  let polygonPoints = [];     // Array of points for polygon drawing
  let isCircleMode = false;   // Whether currently in circle drawing mode
  let circleCenter = null;    // Center point for circle drawing
  let featureCollection = {
    type: 'FeatureCollection',
    features: []
  };
  let drawnTrackLabels = [];  // Array to track all drawn track labels for management
  let nextTrackId = 1;  // Counter for unique track IDs
  let editingTrackId = null;  // Track currently being edited (always visible)
  let currentDrawColor = '#ff6b35';  // Current drawing color (matches default color picker value)
  let currentDrawStyle = 'solid';  // Current drawing style (solid, dashed, dotted)
  let currentDrawThickness = 3;  // Current drawing thickness (1-10)
  let currentDrawMode = 'pencil';  // Current drawing mode (pencil, line, polygon, circle)
  /** Display-only line coloring: manual uses stored per-track color; elevation/slope use terrain samples. */
  let drawColorMode = 'manual'; // 'manual' | 'elevation' | 'slope'
  const DRAW_DEBUG = window.DRAW_DEBUG === true;
  const dlog = (...args) => {
    if (DRAW_DEBUG) console.log(...args);
  };

  async function getCachedSupabaseUser() {
    const cache = window.__supabaseUserCache || {};
    const now = Date.now();
    const ttlMs = 5000;

    if (cache.user && cache.ts && (now - cache.ts) < ttlMs) {
      return { user: cache.user, error: null };
    }

    if (cache.promise) {
      return await cache.promise;
    }

    const promise = (async () => {
      const { data: { user }, error } = await window.supabaseClient.auth.getUser();
      window.__supabaseUserCache = {
        user: user || null,
        error: error || null,
        ts: Date.now(),
        promise: null
      };
      return { user: user || null, error: error || null };
    })();

    window.__supabaseUserCache = { ...cache, promise };

    try {
      return await promise;
    } finally {
      if (window.__supabaseUserCache) {
        window.__supabaseUserCache.promise = null;
      }
    }
  }

  // --- Distance and Area calculation functions ---
  function calculateDistance(point1, point2) {
    // Haversine formula for calculating great-circle distance between two points
    const R = 6371; // Earth's radius in kilometers
    
    // Validate coordinates format [lng, lat]
    if (!Array.isArray(point1) || !Array.isArray(point2) || 
        point1.length !== 2 || point2.length !== 2) {
      console.error('[draw] Invalid coordinate format');
      return 0;
    }
    
    // Check if coordinates are in reasonable ranges
    if (Math.abs(point1[0]) > 180 || Math.abs(point1[1]) > 90 ||
        Math.abs(point2[0]) > 180 || Math.abs(point2[1]) > 90) {
      console.error('[draw] Coordinates out of valid range');
      return 0;
    }
    
    // Convert coordinates to radians
    const lat1Rad = point1[1] * Math.PI / 180;
    const lat2Rad = point2[1] * Math.PI / 180;
    const dLatRad = (point2[1] - point1[1]) * Math.PI / 180;
    const dLonRad = (point2[0] - point1[0]) * Math.PI / 180;
    
    const a = Math.sin(dLatRad / 2) * Math.sin(dLatRad / 2) +
      Math.cos(lat1Rad) * Math.cos(lat2Rad) *
      Math.sin(dLonRad / 2) * Math.sin(dLonRad / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;
    
    // Debug logging for suspicious distances
    if (distance > 100) {
      console.log('[draw] Large distance detected:', {
        point1: point1,
        point2: point2,
        distance: distance
      });
    }
    
    return distance;
  }

  // Helper function to calculate total distance of a track
  function calculateTrackDistance(coordinates) {
    let totalDistance = 0;
    for (let i = 0; i < coordinates.length - 1; i++) {
      totalDistance += calculateDistance(coordinates[i], coordinates[i + 1]);
    }
    return totalDistance;
  }

  function calculateTotalDistance(coordinates) {
    if (coordinates.length < 2) return 0;
    
    // Filter out duplicate coordinates to prevent incorrect distance calculation
    const filteredCoords = coordinates.filter((coord, index) => {
      if (index === 0) return true; // Always keep first coordinate
      const prevCoord = coordinates[index - 1];
      const distance = Math.abs(coord[0] - prevCoord[0]) + Math.abs(coord[1] - prevCoord[1]);
      return distance > 0.00001; // Keep only if coordinates are significantly different
    });
    
    // Distance calculation completed
    
    let totalDistance = 0;
    for (let i = 1; i < filteredCoords.length; i++) {
      const segmentDistance = calculateDistance(filteredCoords[i - 1], filteredCoords[i]);
      
      // Safety check - if any segment is larger than 1000km, something is wrong
      if (segmentDistance > 1000) {
        console.error(`[draw] ERROR: Segment distance too large: ${segmentDistance} km`);
        continue; // Skip this segment
      }
      
      totalDistance += segmentDistance;
      // Segment distance calculated
    }
    
    // Safety check - if total distance is larger than 50000km (more than Earth's circumference), cap it
    if (totalDistance > 50000) {
      console.error('[draw] ERROR: Total distance too large:', totalDistance, 'km - capping at 0');
      totalDistance = 0;
    }
    
    // Total distance calculated
    return totalDistance;
  }

  function formatDistance(distance) {
    // Get settings from localStorage or use defaults
    const settings = JSON.parse(localStorage.getItem('measurementSettings') || '{"unit": "km", "precision": 2}');
    
    if (settings.unit === 'miles') {
      const miles = distance * 0.621371;
      if (miles < 0.621371) { // Less than 1km = less than 0.621371 miles
        const feet = miles * 5280;
        return `${feet.toFixed(0)} ft`;
      } else {
        return `${miles.toFixed(2)} mi`;
      }
    } else {
      // Metric units
      if (distance < 1) { // Less than 1km, show in meters
        const meters = distance * 1000;
        return `${meters.toFixed(0)} m`;
      } else { // 1km or more, show in km with 2 decimal places
        return `${distance.toFixed(2)} km`;
      }
    }
  }

  // Calculate area using the shoelace formula for polygons
  function calculateArea(coordinates) {
    
    if (coordinates.length < 3) {
      // Not enough coordinates for area calculation
      return 0;
    }
    
    // Ensure the polygon is closed (first and last points are the same)
    let coords = [...coordinates];
    if (coords[0][0] !== coords[coords.length - 1][0] || coords[0][1] !== coords[coords.length - 1][1]) {
      coords.push(coords[0]);
      // Added closing point to polygon
    }
    
    let area = 0;
    const n = coords.length - 1; // Exclude the duplicate closing point
    
    // Processing polygon vertices
    
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      area += coords[i][0] * coords[j][1];
      area -= coords[j][0] * coords[i][1];
    }
    
    
    // Convert from degrees squared to square meters
    // This is an approximation that works well for small areas
    const lat = coords[0][1] * Math.PI / 180; // Convert to radians
    const degreeToMeter = 111320 * Math.cos(lat); // Approximate meters per degree at this latitude
    
    area = Math.abs(area) / 2; // Take absolute value and divide by 2
    area = area * degreeToMeter * degreeToMeter; // Convert to square meters
    
    
    return area;
  }

  // Calculate bearing between two points (in degrees, 0-360°)
  function calculateBearing(point1, point2) {
    const lat1 = point1[1] * Math.PI / 180;
    const lat2 = point2[1] * Math.PI / 180;
    const dLon = (point2[0] - point1[0]) * Math.PI / 180;
    
    const y = Math.sin(dLon) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
    
    const bearing = Math.atan2(y, x) * 180 / Math.PI;
    return (bearing + 360) % 360; // Normalize to 0-360°
  }

  // Format bearing with compass direction
  function formatBearing(bearing) {
    const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
    const index = Math.round(bearing / 22.5) % 16;
    return `${bearing.toFixed(0)}° ${directions[index]}`;
  }

  // --- Mapbox Terrain-RGB (raster tile) sampling — works without map.setTerrain() ---
  function getMapboxAccessToken() {
    try {
      if (typeof mapboxgl !== 'undefined' && mapboxgl.accessToken) return mapboxgl.accessToken;
    } catch (_) { /* ignore */ }
    return '';
  }

  function decodeTerrainRgbHeight(r, g, b) {
    return -10000 + ((r * 256 * 256 + g * 256 + b) * 0.1);
  }

  /** Web Mercator: fractional tile x,y and pixel within tile (0..1). */
  function lngLatToTilePixel(lng, lat, z) {
    const n = Math.pow(2, z);
    const xf = ((lng + 180) / 360) * n;
    const latRad = (lat * Math.PI) / 180;
    const yf = (1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n;
    const tx = Math.floor(xf);
    const ty = Math.floor(yf);
    const fx = xf - tx;
    const fy = yf - ty;
    return { z, tx, ty, fx, fy };
  }

  const TERRAIN_TILE_CACHE_MAX = 80;
  const __terrainTileDataCache = new Map();

  async function getTerrainTileImageData(z, tx, ty, token) {
    const key = `${z}/${tx}/${ty}`;
    if (__terrainTileDataCache.has(key)) {
      return __terrainTileDataCache.get(key);
    }
    if (!token) return null;
    const url = `https://api.mapbox.com/v4/mapbox.terrain-rgb/${z}/${tx}/${ty}.pngraw?access_token=${encodeURIComponent(token)}`;
    try {
      const res = await fetch(url);
      if (!res.ok) return null;
      const blob = await res.blob();
      if (typeof createImageBitmap !== 'function') return null;
      const bmp = await createImageBitmap(blob);
      const canvas = document.createElement('canvas');
      canvas.width = bmp.width;
      canvas.height = bmp.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      ctx.drawImage(bmp, 0, 0);
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      if (__terrainTileDataCache.size >= TERRAIN_TILE_CACHE_MAX) {
        const firstKey = __terrainTileDataCache.keys().next().value;
        __terrainTileDataCache.delete(firstKey);
      }
      __terrainTileDataCache.set(key, imgData);
      return imgData;
    } catch (_) {
      return null;
    }
  }

  function elevationFromTileFrac(imgData, fx, fy) {
    const w = imgData.width;
    const h = imgData.height;
    const xPix = Math.min(w - 1, Math.max(0, Math.floor(fx * w)));
    const yPix = Math.min(h - 1, Math.max(0, Math.floor(fy * h)));
    const idx = (yPix * w + xPix) * 4;
    const r = imgData.data[idx];
    const g = imgData.data[idx + 1];
    const b = imgData.data[idx + 2];
    return decodeTerrainRgbHeight(r, g, b);
  }

  /**
   * Fill null / non-finite elevations using Terrain-RGB tiles (batched by tile).
   * @param {[number,number][]} coords
   * @param {(number|null)[]|undefined} mergeFrom optional prior samples (e.g. queryTerrainElevation)
   */
  async function computeCoordElevationsTerrainRgb(coords, mergeFrom) {
    const token = getMapboxAccessToken();
    const z = 12;
    const out = mergeFrom && mergeFrom.length === coords.length
      ? mergeFrom.slice()
      : coords.map(() => null);

    const groups = new Map();
    for (let i = 0; i < coords.length; i++) {
      const v = out[i];
      if (v !== null && v !== undefined && Number.isFinite(v)) continue;
      const c = coords[i];
      if (!c || c.length < 2) continue;
      const [lng, lat] = c;
      const tp = lngLatToTilePixel(lng, lat, z);
      const key = `${tp.z}/${tp.tx}/${tp.ty}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push({ i, fx: tp.fx, fy: tp.fy });
    }

    for (const [key, samples] of groups) {
      const parts = key.split('/');
      const zv = Number(parts[0]);
      const tx = Number(parts[1]);
      const ty = Number(parts[2]);
      const imgData = await getTerrainTileImageData(zv, tx, ty, token);
      if (!imgData) continue;
      for (let s = 0; s < samples.length; s++) {
        const { i, fx, fy } = samples[s];
        out[i] = elevationFromTileFrac(imgData, fx, fy);
      }
    }
    return out;
  }

  // Calculate elevation using Mapbox Terrain API
  async function calculateElevation(coordinates) {
    if (coordinates.length === 0) return { start: 0, end: 0, change: 0 };
    
    const start = coordinates[0];
    const end = coordinates[coordinates.length - 1];
    
    try {
      // Get elevation from Mapbox Terrain API
      const startElevationRaw = await getMapboxElevation(start[1], start[0]); // lat, lng
      const endElevationRaw = await getMapboxElevation(end[1], end[0]); // lat, lng
      const startElevation = Number.isFinite(startElevationRaw)
        ? startElevationRaw
        : estimateElevationFromCoords(start[1], start[0]);
      const endElevation = Number.isFinite(endElevationRaw)
        ? endElevationRaw
        : estimateElevationFromCoords(end[1], end[0]);
      const elevationChange = endElevation - startElevation;
      
      return {
        start: startElevation,
        end: endElevation,
        change: elevationChange
      };
    } catch (error) {
      console.warn('[draw] Failed to get elevation from Mapbox, using fallback');
      // Fallback to basic estimation if API fails
      return calculateElevationFallback(coordinates);
    }
  }

  // Get elevation from Mapbox Terrain API
  async function getMapboxElevation(lat, lng) {
    try {
      if (map && typeof map.queryTerrainElevation === 'function' && map.isStyleLoaded()) {
        try {
          const elevation = map.queryTerrainElevation([lng, lat]);
          if (elevation !== null && elevation !== undefined && Number.isFinite(elevation)) {
            return elevation;
          }
        } catch (_) { /* terrain off or unavailable */ }
      }

      const token = getMapboxAccessToken();
      const tp = lngLatToTilePixel(lng, lat, 12);
      const imgData = await getTerrainTileImageData(tp.z, tp.tx, tp.ty, token);
      if (imgData) {
        return elevationFromTileFrac(imgData, tp.fx, tp.fy);
      }

      return estimateElevationFromCoords(lat, lng);
    } catch (error) {
      dlog('[draw] Mapbox elevation API failed');
      return estimateElevationFromCoords(lat, lng);
    }
  }

  // Fallback elevation estimation based on coordinates
  function estimateElevationFromCoords(lat, lng) {
    // Victoria, Australia elevation model (improved)
    const baseElevation = 50; // Base sea level
    
    // More realistic factors for Victoria
    const latFactor = (lat + 39) * 25; // Moderate latitude factor
    const lngFactor = (lng - 141) * 15; // Moderate longitude factor
    
    // Add some realistic terrain variation
    const terrainVariation = Math.sin(lng * 5) * Math.cos(lat * 3) * 100;
    
    return Math.max(0, baseElevation + latFactor + lngFactor + terrainVariation);
  }

  // Fallback elevation calculation (basic estimation)
  function calculateElevationFallback(coordinates) {
    if (coordinates.length === 0) return { start: 0, end: 0, change: 0 };
    
    const start = coordinates[0];
    const end = coordinates[coordinates.length - 1];
    
    // Basic elevation estimation based on latitude and longitude
    function estimateElevation(lng, lat) {
      // Victoria, Australia elevation model (simplified)
      const baseElevation = 100;
      const latFactor = (lat + 39) * 50;
      const lngFactor = (lng - 141) * 30;
      const variation = Math.sin(lng * 10) * Math.cos(lat * 8) * 200;
      
      return Math.max(0, baseElevation + latFactor + lngFactor + variation);
    }
    
    const startElevation = estimateElevation(start[0], start[1]);
    const endElevation = estimateElevation(end[0], end[1]);
    const elevationChange = endElevation - startElevation;
    
    return {
      start: startElevation,
      end: endElevation,
      change: elevationChange
    };
  }

  // Format elevation information
  function formatElevation(elevationData) {
    const { start, end, change } = elevationData;
    const changeSymbol = change > 0 ? '+' : '';
    return `${start.toFixed(0)}m → ${end.toFixed(0)}m (${changeSymbol}${change.toFixed(0)}m)`;
  }

  function formatArea(areaSquareMeters) {
    // Get settings from localStorage or use defaults
    const settings = JSON.parse(localStorage.getItem('measurementSettings') || '{"unit": "km", "precision": 2}');
    
    if (settings.unit === 'miles') {
      // Convert to square feet and acres
      const squareFeet = areaSquareMeters * 10.764;
      const acres = areaSquareMeters * 0.000247105;
      
      if (acres >= 1) {
        return `${acres.toFixed(2)} acres`;
      } else {
        return `${squareFeet.toFixed(0)} sq ft`;
      }
    } else {
      // Metric units
      const squareKilometers = areaSquareMeters / 1000000;
      const hectares = areaSquareMeters / 10000;
      
      if (squareKilometers >= 1) {
        return `${squareKilometers.toFixed(2)} km²`;
      } else if (hectares >= 1) {
        return `${hectares.toFixed(2)} hectares`;
      } else {
        return `${areaSquareMeters.toFixed(0)} m²`;
      }
    }
  }

  // --- init: call once after map exists ---
  function init(mapInstance, skipAutoLoad = false) {
    // Initializing drawing module
    
    // Prevent multiple initializations
    if (map && map === mapInstance) {
      // Already initialized with this map instance
      return;
    }
    
    // Clean up previous instance if exists
    if (map && map !== mapInstance) {
      // Cleaning up previous map instance
      cleanup();
    }
    
    map = mapInstance;
    
    // Add click listener to map to minimize labels when clicking anywhere
    map.on('click', (e) => {
      // Check if click is on a track label or its children
      const isTrackLabelClick = e.originalEvent.target.closest('.track-label-container');
      if (!isTrackLabelClick) {
        minimizeAllTrackLabels();
      }
    });
    
    ensureSourceAndLayer();

    // Load previously drawn tracks from Supabase after a short delay
    // to ensure the map is fully ready (unless skipAutoLoad is true)
    if (!skipAutoLoad) {
      setTimeout(() => {
        loadDrawnTracksFromSupabase();
      }, 1000);
    }

    // Load drawing color from localStorage and Supabase
    setTimeout(() => {
      loadDrawColor();
    }, 500);

    // Load drawing style from localStorage
    setTimeout(() => {
      loadDrawStyle();
    }, 500);

    // Load drawing thickness from localStorage
    setTimeout(() => {
      loadDrawThickness();
    }, 500);

    setTimeout(() => {
      loadDrawColorMode();
      if (map && map.getSource(SRC_ID)) {
        syncDrawLayerData();
      }
    }, 520);

    // Start stroke on pointer down ONLY when mode is active
    // Adding event listeners to map
    map.on('mousedown', onPointerDown);
    map.on('touchstart', onPointerDown);
    // Event listeners added successfully
    
    // Test if the map is receiving events
    map.on('click', (e) => {
      // Map click event received
    });
    
    // Test if mousedown events are being received at all
    map.on('mousedown', (e) => {
      // Map mousedown event received
    });
    
    // Initialization complete
  }

  // --- cleanup: remove sources, layers, and event listeners ---
  function cleanup() {
    if (!map) return;
    
    // Cleaning up drawing module
    
    // Remove event listeners
    try {
      map.off('mousedown', onPointerDown);
      map.off('touchstart', onPointerDown);
      // Event listeners removed
    } catch (error) {
      console.warn('[draw] Error removing event listeners');
    }
    
    // Remove layers and sources
    try {
      if (map.getLayer(LINE_LAYER_ID)) {
        map.removeLayer(LINE_LAYER_ID);
        // Layer removed
      }
      
      if (map.getSource(SRC_ID)) {
        map.removeSource(SRC_ID);
        // Source removed
      }
    } catch (error) {
      console.warn('[draw] Error removing layers/sources');
    }
    
    // Clear all track labels
    clearDrawnTrackLabels();
    
    // Reset state
    isActive = false;
    isCapturing = false;
    currentCoords = [];
    featureCollection.features = [];
    isInitializing = false;
    lineStartPoint = null;
    polygonPoints = [];
    circleCenter = null;
    
    // Cleanup complete
  }

  // Add a flag to prevent multiple simultaneous initialization attempts
  let isInitializing = false;
  
  // Track restoration state to prevent multiple simultaneous restoration attempts
  let isRestoring = false;
  
  function ensureSourceAndLayer() {
    if (!map) {
      console.warn('[draw] Map not available');
      return;
    }

    // Prevent multiple simultaneous initialization attempts
    if (isInitializing) {
      // Initialization already in progress
      return;
    }

    // Check if both source and layer already exist
    if (map.getSource(SRC_ID) && map.getLayer(LINE_LAYER_ID)) {
      // Source and layer already exist
      return;
    }

    // Check if only source exists (orphaned source)
    if (map.getSource(SRC_ID) && !map.getLayer(LINE_LAYER_ID)) {
      dlog('[draw] Source exists but layer missing, cleaning up orphaned source...');
      try {
        map.removeSource(SRC_ID);
        dlog('[draw] Orphaned source removed');
      } catch (error) {
        console.warn('[draw] Could not remove orphaned source:', error.message);
      }
    }

    // Check if only layer exists (orphaned layer)
    if (!map.getSource(SRC_ID) && map.getLayer(LINE_LAYER_ID)) {
      dlog('[draw] Layer exists but source missing, cleaning up orphaned layer...');
      try {
        map.removeLayer(LINE_LAYER_ID);
        dlog('[draw] Orphaned layer removed');
      } catch (error) {
        console.warn('[draw] Could not remove orphaned layer:', error.message);
      }
    }
    
    if (!map.isStyleLoaded()) {
      map.once('style.load', ensureSourceAndLayer);
      return;
    }

    dlog('[draw] Creating new source and layer');
    isInitializing = true;
    try {
      // Double-check that source doesn't exist before creating
      if (map.getSource(SRC_ID)) {
        dlog('[draw] Source already exists, skipping source creation');
      } else {
        map.addSource(SRC_ID, {
          type: 'geojson',
          data: featureCollection
        });
        dlog('[draw] Source created successfully');
      }

      // Double-check that layer doesn't exist before creating
      if (map.getLayer(LINE_LAYER_ID)) {
        dlog('[draw] Layer already exists, skipping layer creation');
      } else {
        map.addLayer({
          id: LINE_LAYER_ID,
          type: 'line',
          source: SRC_ID,
          layout: {
            'line-join': 'round',
            'line-cap': 'round'
          },
          paint: {
            'line-color': ['coalesce', ['get', 'color'], '#ff6b35'],
            'line-width': ['coalesce', ['get', 'thickness'], currentDrawThickness],
            'line-dasharray': ['case',
              ['==', ['get', 'style'], 'dashed'], [2, 2],
              ['==', ['get', 'style'], 'dotted'], [1, 3],
              [1, 0]  // solid line - very short dash with no gap
            ]
          }
        });
        dlog('[draw] Layer created successfully');
      }

      dlog('[draw] Source and layer setup complete');
      dlog('[draw] Current source data:', map.getSource(SRC_ID));
      dlog('[draw] Current layer:', map.getLayer(LINE_LAYER_ID));

      if (featureCollection.features.length > 0) {
        syncDrawLayerData();
      }
    } catch (error) {
      console.error('[draw] Error creating source/layer:', error);
    } finally {
      isInitializing = false;
    }
  }

  /** How this track should render (snapshot when stroke finished); dropdown only picks mode for the next stroke. */
  function getFeatureLineColorMode(feature) {
    const m = feature && feature.properties && feature.properties.lineColorMode;
    if (m === 'elevation' || m === 'slope' || m === 'manual') return m;
    return 'manual';
  }

  function segmentBasePropsForDraw(feature) {
    const p = feature.properties || {};
    return {
      color: p.color,
      style: p.style,
      thickness: p.thickness,
      drawTrackId: p.id,
      name: p.name,
      isDrawSegment: true
    };
  }

  function computeCoordElevationsSync(coords) {
    if (!Array.isArray(coords) || coords.length === 0) return [];
    return coords.map(([lng, lat]) => {
      try {
        if (map && typeof map.queryTerrainElevation === 'function' && map.isStyleLoaded()) {
          const v = map.queryTerrainElevation([lng, lat]);
          if (v !== null && v !== undefined && Number.isFinite(v)) return v;
        }
      } catch (_) { /* terrain unavailable */ }
      return null;
    });
  }

  function buildDisplayGeoJson(extraPreviewFeature) {
    const out = [];
    const math = window.WITD && window.WITD.gpxTrackMath;
    for (let i = 0; i < featureCollection.features.length; i++) {
      const f = featureCollection.features[i];
      const featureMode = getFeatureLineColorMode(f);
      if (featureMode === 'manual' || !math || typeof math.buildDrawColoredSegments !== 'function') {
        out.push(f);
        continue;
      }
      const coords = f.geometry && f.geometry.coordinates ? f.geometry.coordinates : [];
      const elevs = f.properties && f.properties.coordElevations;
      const segs = math.buildDrawColoredSegments(featureMode, coords, elevs, segmentBasePropsForDraw(f));
      if (segs && segs.length > 0) {
        segs.forEach((seg) => out.push(seg));
      } else {
        out.push(f);
      }
    }
    if (extraPreviewFeature) out.push(extraPreviewFeature);
    return { type: 'FeatureCollection', features: out };
  }

  function syncDrawLayerData(extraPreviewFeature) {
    if (!map || !map.getSource(SRC_ID)) return;
    try {
      map.getSource(SRC_ID).setData(buildDisplayGeoJson(extraPreviewFeature));
      updateDrawExportGpxUi();
    } catch (err) {
      console.warn('[draw] syncDrawLayerData:', err);
    }
  }

  function updateDrawExportGpxUi() {
    try {
      const btn = document.getElementById('exportDrawGpxBtn');
      if (!btn) return;
      const n = featureCollection.features.filter((f) => {
        const c = f.geometry && f.geometry.coordinates;
        return c && c.length >= 2;
      }).length;
      btn.style.display = n > 0 ? '' : 'none';
      btn.disabled = n === 0;
    } catch (_) { /* optional UI */ }
  }

  function resampleAllTrackElevationsFromTerrain() {
    if (!map || !featureCollection.features.length) return;
    featureCollection.features.forEach((f) => {
      const mode = getFeatureLineColorMode(f);
      if (mode !== 'elevation' && mode !== 'slope') return;
      const coords = f.geometry && f.geometry.coordinates;
      if (!coords || coords.length < 2) return;
      f.properties = f.properties || {};
      const prev = f.properties.coordElevations;
      const next = computeCoordElevationsSync(coords);
      if (Array.isArray(prev) && prev.length === next.length) {
        for (let i = 0; i < next.length; i++) {
          const nv = next[i];
          const pv = prev[i];
          const lost = nv === null || nv === undefined || !Number.isFinite(nv);
          const keep = pv !== null && pv !== undefined && Number.isFinite(pv);
          if (lost && keep) {
            next[i] = pv;
          }
        }
      }
      f.properties.coordElevations = next;
    });
    syncDrawLayerData();

    void (async () => {
      let touched = false;
      for (let fi = 0; fi < featureCollection.features.length; fi++) {
        const f = featureCollection.features[fi];
        const mode = getFeatureLineColorMode(f);
        if (mode !== 'elevation' && mode !== 'slope') continue;
        const coords = f.geometry && f.geometry.coordinates;
        if (!coords || coords.length < 2) continue;
        const prev = f.properties.coordElevations;
        if (!prev || prev.length !== coords.length) continue;
        if (!prev.some((e) => e === null || !Number.isFinite(e))) continue;
        f.properties.coordElevations = await computeCoordElevationsTerrainRgb(coords, prev);
        touched = true;
      }
      if (touched) syncDrawLayerData();
    })();
  }

  function escapeXml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function sanitizeGpxFilename(name) {
    const s = String(name || 'track')
      .replace(/[\\/:*?"<>|]+/g, '_')
      .replace(/\s+/g, ' ')
      .trim();
    return s || 'track';
  }

  function exportDrawnTracksAsGpx(filename, tracksSubset) {
    const nameBase = filename || 'drawn-tracks.gpx';
    const sourceList = Array.isArray(tracksSubset) ? tracksSubset : featureCollection.features;
    const tracks = sourceList.filter((f) => {
      const c = f.geometry && f.geometry.coordinates;
      return f.geometry && f.geometry.type === 'LineString' && c && c.length >= 2;
    });
    if (tracks.length === 0) return;

    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += '<gpx version="1.1" creator="WhereIsTheDeer" xmlns="http://www.topografix.com/GPX/1/1" ';
    xml += 'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ';
    xml += 'xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">\n';

    tracks.forEach((feature, idx) => {
      const trkName = (feature.properties && feature.properties.name) || `Track ${idx + 1}`;
      const coords = feature.geometry.coordinates;
      const elevs = feature.properties && feature.properties.coordElevations;
      xml += '  <trk><name>' + escapeXml(trkName) + '</name><trkseg>\n';
      for (let i = 0; i < coords.length; i++) {
        const pt = coords[i];
        const lon = pt[0];
        const lat = pt[1];
        const el = elevs && elevs[i];
        const eleTag = (el !== null && el !== undefined && Number.isFinite(el)) ? '<ele>' + el.toFixed(1) + '</ele>' : '';
        xml += '    <trkpt lat="' + lat + '" lon="' + lon + '">' + eleTag + '</trkpt>\n';
      }
      xml += '  </trkseg></trk>\n';
    });
    xml += '</gpx>';

    const blob = new Blob([xml], { type: 'application/gpx+xml' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = nameBase.endsWith('.gpx') ? nameBase : nameBase + '.gpx';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function exportSingleDrawnTrackAsGpx(feature) {
    if (!feature || !feature.geometry || feature.geometry.type !== 'LineString') return;
    const c = feature.geometry.coordinates;
    if (!c || c.length < 2) return;
    const id = feature.properties && feature.properties.id;
    let current = feature;
    if (id != null) {
      const found = featureCollection.features.find(
        (f) => f.properties && (f.properties.id === id || String(f.properties.id) === String(id))
      );
      if (found) current = found;
    }
    const trkName = (current.properties && current.properties.name) || 'Track';
    exportDrawnTracksAsGpx(sanitizeGpxFilename(trkName) + '.gpx', [current]);
  }

  function updateDrawColorMode(mode) {
    if (mode !== 'manual' && mode !== 'elevation' && mode !== 'slope') return;
    const prev = drawColorMode;
    if (prev === mode) return;

    drawColorMode = mode;
    try {
      localStorage.setItem('witd_draw_color_mode', mode);
    } catch (_) { /* ignore */ }

    // Dropdown only affects the *next* stroke; existing tracks keep properties.lineColorMode.
    syncDrawLayerData();
  }

  function loadDrawColorMode() {
    try {
      const s = localStorage.getItem('witd_draw_color_mode');
      if (s === 'manual' || s === 'elevation' || s === 'slope') {
        drawColorMode = s;
      }
    } catch (_) { /* ignore */ }
    const sel = document.getElementById('drawColorModeSelect');
    if (sel) sel.value = drawColorMode;
  }

  // --- Mode control (toolbar) ---
  function enable() {
    if (!map) {
      console.warn('[draw] Map not ready yet');
      return;
    }
    
    // Check if we need to initialize first
    if (!map.getLayer(LINE_LAYER_ID)) {
      console.log('[draw] Module not initialized, initializing now...');
      init(map);
    }
    
    console.log('[draw] Enabling drawing mode');
    ensureSourceAndLayer();
    isActive = true;
    console.log('[draw] Drawing mode enabled, isActive:', isActive);
    map.getCanvas().style.cursor = 'crosshair';
    
    // Close any existing species popups when starting to draw
    if (typeof window.closeSpeciesPopups === 'function') {
      window.closeSpeciesPopups();
    }
    
    // Disable map interactions when drawing mode is active
    try {
      map.dragPan.disable();
      map.doubleClickZoom.disable();
      console.log('[draw] Disabled map interactions for drawing mode');
    } catch (err) {
      console.warn('[draw] Could not disable map interactions:', err);
    }
  }

  async function disable() {
    isActive = false;
    map.getCanvas().style.cursor = '';
    
    // Re-enable map interactions when drawing mode is disabled
    try {
      map.dragPan.enable();
      map.doubleClickZoom.enable();
      console.log('[draw] Re-enabled map interactions');
    } catch (err) {
      console.warn('[draw] Could not re-enable map interactions:', err);
    }
    
    // if currently drawing, finish gracefully
    if (isCapturing) await finishStroke();
    
    // Update the toolbar button to show drawing mode is off
    const drawTrackBtn = document.getElementById('drawTrackBtn');
    if (drawTrackBtn) {
      drawTrackBtn.classList.remove('active');
      drawTrackBtn.innerHTML = '✏️';
      console.log('[draw] Updated toolbar button to show drawing mode OFF');
    }
  }

  function toggle() {
    if (isActive) disable(); else enable();
  }

  // --- Stroke lifecycle ---
  function onPointerDown(e) {
    if (!isActive) return;

    // Left mouse only for desktop
    if (e.originalEvent && e.originalEvent.button != null && e.originalEvent.button !== 0) return;

    console.log('[draw] Starting new stroke at:', e.lngLat);

    if (isLineMode) {
      // Line mode: first click sets start point, second click finishes line
      if (!lineStartPoint) {
        // First click - set start point
        lineStartPoint = [e.lngLat.lng, e.lngLat.lat];
        currentCoords = [lineStartPoint];
        console.log('[draw] Line start point set:', lineStartPoint);
        
        // Show preview line
        isCapturing = true;
        liveUpdate();
        
        // Temporarily disable map gestures
        try { 
          map.dragPan.disable(); 
          console.log('[draw] Disabled dragPan');
        } catch (err) {
          console.warn('[draw] Could not disable dragPan:', err);
        }
        try { 
          map.doubleClickZoom.disable(); 
          console.log('[draw] Disabled doubleClickZoom');
        } catch (err) {
          console.warn('[draw] Could not disable doubleClickZoom:', err);
        }
        
        // Add move handler for live preview
        map.on('mousemove', onLinePreviewMove);
        map.on('touchmove', onLinePreviewMove);
        map.once('mouseup', finishLine);
        map.once('touchend', finishLine);
      }
    } else if (isPolygonMode) {
      // Polygon mode: click to add points, double-click to finish
      if (polygonPoints.length === 0) {
        // First click - start polygon
        polygonPoints = [[e.lngLat.lng, e.lngLat.lat]];
        currentCoords = [...polygonPoints];
        console.log('[draw] Polygon started with point:', polygonPoints[0]);
        
        // Start capturing
        isCapturing = true;
        liveUpdate();
        
        // Temporarily disable map gestures
        try { 
          map.dragPan.disable(); 
          console.log('[draw] Disabled dragPan');
        } catch (err) {
          console.warn('[draw] Could not disable dragPan:', err);
        }
        try { 
          map.doubleClickZoom.disable(); 
          console.log('[draw] Disabled doubleClickZoom');
        } catch (err) {
          console.warn('[draw] Could not disable doubleClickZoom:', err);
        }
        
        // Add mouse move handler for preview line
        map.on('mousemove', onPolygonPreviewMove);
        map.on('touchmove', onPolygonPreviewMove);
        
        // Single click adds point, double-click finishes
        map.once('mouseup', addPolygonPoint);
        map.once('touchend', addPolygonPoint);
        map.once('dblclick', finishPolygon);
        map.once('contextmenu', cancelPolygon);
      } else {
        // Subsequent clicks - add points to polygon
        addPolygonPoint(e);
      }
    } else if (isCircleMode) {
      // Circle mode: first click sets center, drag sets radius, second click finishes
      if (!circleCenter) {
        // First click - set center point
        circleCenter = [e.lngLat.lng, e.lngLat.lat];
        currentCoords = [circleCenter];
        console.log('[draw] Circle center set:', circleCenter);
        
        // Start capturing and show preview
        isCapturing = true;
        liveUpdate();
        
        // Temporarily disable map gestures
        try { 
          map.dragPan.disable(); 
          console.log('[draw] Disabled dragPan');
        } catch (err) {
          console.warn('[draw] Could not disable dragPan:', err);
        }
        try { 
          map.doubleClickZoom.disable(); 
          console.log('[draw] Disabled doubleClickZoom');
        } catch (err) {
          console.warn('[draw] Could not disable doubleClickZoom:', err);
        }
        
        // Add move handler for live preview
        map.on('mousemove', onCirclePreviewMove);
        map.on('touchmove', onCirclePreviewMove);
        map.once('mouseup', finishCircle);
        map.once('touchend', finishCircle);
        map.once('contextmenu', cancelCircle);
      }
    } else {
      // Pencil mode - original behavior
      isCapturing = true;
      currentCoords = [[e.lngLat.lng, e.lngLat.lat]];

      // Temporarily disable map gestures while drawing
      try { 
        map.dragPan.disable(); 
        console.log('[draw] Disabled dragPan');
      } catch (err) {
        console.warn('[draw] Could not disable dragPan:', err);
      }
      try { 
        map.doubleClickZoom.disable(); 
        console.log('[draw] Disabled doubleClickZoom');
      } catch (err) {
        console.warn('[draw] Could not disable doubleClickZoom:', err);
      }

      // move + up handlers
      map.on('mousemove', onPointerMove);
      map.on('touchmove', onPointerMove);
      map.once('mouseup', finishStroke);
      map.once('touchend', finishStroke);
    }
  }

  // Line preview move handler
  function onLinePreviewMove(e) {
    if (!isCapturing || !lineStartPoint) return;
    
    // Update current coordinates to show line from start point to current mouse position
    currentCoords = [lineStartPoint, [e.lngLat.lng, e.lngLat.lat]];
    liveUpdate();
  }

  // Finish line drawing
  function finishLine(e) {
    if (!isCapturing || !lineStartPoint) return;
    
    console.log('[draw] Finishing line at:', e.lngLat);
    
    // Set final coordinates
    currentCoords = [lineStartPoint, [e.lngLat.lng, e.lngLat.lat]];
    
    // Finish the stroke
    finishStroke(e);
    
    // Reset line drawing state
    lineStartPoint = null;
    
    // Remove line preview handlers
    map.off('mousemove', onLinePreviewMove);
    map.off('touchmove', onLinePreviewMove);
  }

  // Polygon preview move handler - shows line from last point to mouse cursor
  function onPolygonPreviewMove(e) {
    if (!isCapturing || polygonPoints.length === 0) return;
    
    // Create preview coordinates: all placed points + current mouse position
    const previewCoords = [...polygonPoints, [e.lngLat.lng, e.lngLat.lat]];
    
    // Update current coordinates to show preview line
    currentCoords = previewCoords;
    liveUpdate();
  }

  // Add point to polygon
  function addPolygonPoint(e) {
    if (!isCapturing) return;
    
    const newPoint = [e.lngLat.lng, e.lngLat.lat];
    polygonPoints.push(newPoint);
    currentCoords = [...polygonPoints];
    
    console.log('[draw] Added polygon point:', newPoint, 'Total points:', polygonPoints.length);
    
    // Update the preview with just the connected points (no auto-preview line)
    liveUpdate();
    
    // Set up for next point or finish
    if (polygonPoints.length >= 2) {
      // Remove current handlers and set up new ones
      map.off('mouseup', addPolygonPoint);
      map.off('touchend', addPolygonPoint);
      map.once('mouseup', addPolygonPoint);
      map.once('touchend', addPolygonPoint);
    }
  }

  // Finish polygon drawing
  function finishPolygon(e) {
    if (!isCapturing || polygonPoints.length < 3) return;
    
    console.log('[draw] Finishing polygon with', polygonPoints.length, 'points');
    
    // Close the polygon by adding the first point at the end
    const closedPolygon = [...polygonPoints, polygonPoints[0]];
    currentCoords = closedPolygon;
    
    // Finish the stroke (this will save it as a polygon)
    finishStroke(e);
    
    // Reset polygon drawing state
    polygonPoints = [];
    
    // Remove polygon handlers
    map.off('mousemove', onPolygonPreviewMove);
    map.off('touchmove', onPolygonPreviewMove);
    map.off('mouseup', addPolygonPoint);
    map.off('touchend', addPolygonPoint);
    map.off('dblclick', finishPolygon);
    map.off('contextmenu', cancelPolygon);
  }

  // Cancel polygon drawing
  function cancelPolygon(e) {
    console.log('[draw] Cancelling polygon drawing');
    
    // Reset polygon state
    polygonPoints = [];
    isCapturing = false;
    currentCoords = [];
    
    // Update map source to clear preview
    if (map && map.getSource(SRC_ID)) {
      syncDrawLayerData();
    }
    
    // Remove all polygon handlers
    map.off('mousemove', onPolygonPreviewMove);
    map.off('touchmove', onPolygonPreviewMove);
    map.off('mouseup', addPolygonPoint);
    map.off('touchend', addPolygonPoint);
    map.off('dblclick', finishPolygon);
    map.off('contextmenu', cancelPolygon);
    
    // Re-enable map gestures
    try { 
      map.dragPan.enable(); 
      console.log('[draw] Re-enabled dragPan');
    } catch (err) {
      console.warn('[draw] Could not re-enable dragPan:', err);
    }
    try { 
      map.doubleClickZoom.enable(); 
      console.log('[draw] Re-enabled doubleClickZoom');
    } catch (err) {
      console.warn('[draw] Could not re-enable doubleClickZoom:', err);
    }
    
    // Prevent context menu from showing
    e.preventDefault();
  }

  // Circle preview move handler
  function onCirclePreviewMove(e) {
    console.log('[draw] Circle preview move called');
    if (!isCapturing || !circleCenter) {
      console.log('[draw] Not capturing or no circle center:', isCapturing, circleCenter);
      return;
    }
    
    console.log('[draw] Circle center:', circleCenter, 'Current point:', [e.lngLat.lng, e.lngLat.lat]);
    
    // Calculate the midpoint between the initial click and current mouse position
    const currentPoint = [e.lngLat.lng, e.lngLat.lat];
    const actualCenter = calculateMidpoint(circleCenter, currentPoint);
    
    // Calculate radius as half the distance between the two points
    const totalDistance = calculateDistanceInMeters(circleCenter, currentPoint);
    const radius = totalDistance / 2;
    
    console.log('[draw] Calculated center:', actualCenter, 'radius:', radius);
    
    // Generate circle coordinates using the midpoint as center
    const circleCoords = generateCircleCoordinates(actualCenter, radius);
    currentCoords = circleCoords;
    
    console.log('[draw] Generated circle coordinates:', circleCoords.length, 'points');
    
    liveUpdate();
  }

  // Calculate distance between two points in meters (for circle drawing)
  function calculateDistanceInMeters(point1, point2) {
    const R = 6371000; // Earth's radius in meters
    const lat1 = point1[1] * Math.PI / 180;
    const lat2 = point2[1] * Math.PI / 180;
    const deltaLat = (point2[1] - point1[1]) * Math.PI / 180;
    const deltaLng = (point2[0] - point1[0]) * Math.PI / 180;

    const a = Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
              Math.cos(lat1) * Math.cos(lat2) *
              Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c; // Distance in meters
  }

  // Calculate midpoint between two points (simple average for small distances)
  function calculateMidpoint(point1, point2) {
    const lng = (point1[0] + point2[0]) / 2;
    const lat = (point1[1] + point2[1]) / 2;
    return [lng, lat];
  }

  // Generate circle coordinates as a polygon
  function generateCircleCoordinates(center, radiusMeters, segments = 32) {
    const coords = [];
    
    // Convert radius from meters to degrees (approximate)
    // This is a simpler approach that should work more intuitively
    const latDegreesPerMeter = 1 / 111000; // Roughly 111km per degree latitude
    const lngDegreesPerMeter = 1 / (111000 * Math.cos(center[1] * Math.PI / 180));
    
    const radiusLat = radiusMeters * latDegreesPerMeter;
    const radiusLng = radiusMeters * lngDegreesPerMeter;

    for (let i = 0; i <= segments; i++) {
      const angle = (i * 2 * Math.PI) / segments;
      const lat = center[1] + radiusLat * Math.sin(angle);
      const lng = center[0] + radiusLng * Math.cos(angle);
      
      coords.push([lng, lat]);
    }
    
    return coords;
  }

  // Finish circle drawing
  function finishCircle(e) {
    if (!isCapturing || !circleCenter) return;
    
    console.log('[draw] Finishing circle at:', e.lngLat);
    
    // Calculate the midpoint between the initial click and final mouse position
    const currentPoint = [e.lngLat.lng, e.lngLat.lat];
    const actualCenter = calculateMidpoint(circleCenter, currentPoint);
    
    // Calculate final radius as half the distance between the two points
    const totalDistance = calculateDistanceInMeters(circleCenter, currentPoint);
    const radius = totalDistance / 2;
    
    // Generate final circle coordinates using the midpoint as center
    const circleCoords = generateCircleCoordinates(actualCenter, radius);
    currentCoords = circleCoords;
    
    // Finish the stroke (this will save it as a polygon)
    finishStroke(e);
    
    // Reset circle drawing state
    circleCenter = null;
    
    // Remove circle preview handlers
    map.off('mousemove', onCirclePreviewMove);
    map.off('touchmove', onCirclePreviewMove);
  }

  // Cancel circle drawing
  function cancelCircle(e) {
    console.log('[draw] Cancelling circle drawing');
    
    // Reset circle state
    circleCenter = null;
    isCapturing = false;
    currentCoords = [];
    
    // Update map source to clear preview
    if (map && map.getSource(SRC_ID)) {
      syncDrawLayerData();
    }
    
    // Remove all circle handlers
    map.off('mousemove', onCirclePreviewMove);
    map.off('touchmove', onCirclePreviewMove);
    map.off('mouseup', finishCircle);
    map.off('touchend', finishCircle);
    map.off('contextmenu', cancelCircle);
    
    // Re-enable map gestures
    try { 
      map.dragPan.enable(); 
      console.log('[draw] Re-enabled dragPan');
    } catch (err) {
      console.warn('[draw] Could not re-enable dragPan:', err);
    }
    try { 
      map.doubleClickZoom.enable(); 
      console.log('[draw] Re-enabled doubleClickZoom');
    } catch (err) {
      console.warn('[draw] Could not re-enable doubleClickZoom:', err);
    }
    
    // Prevent context menu from showing
    e.preventDefault();
  }

  // throttle points a little to keep geometry light
  let lastEmit = 0;
  function onPointerMove(e) {
    if (!isCapturing) return;
    
    const now = performance.now();
    if (now - lastEmit < 16) return; // ~60fps cap
    lastEmit = now;

    const newCoord = [e.lngLat.lng, e.lngLat.lat];
    
    // Only add coordinate if it's significantly different from the last one
    if (currentCoords.length === 0) {
      currentCoords.push(newCoord);
    } else {
      const lastCoord = currentCoords[currentCoords.length - 1];
      const distance = Math.abs(newCoord[0] - lastCoord[0]) + Math.abs(newCoord[1] - lastCoord[1]);
      
      // Only add if the coordinate is more than 0.0001 degrees away (about 10 meters)
      if (distance > 0.0001) {
        currentCoords.push(newCoord);
        console.log('[draw] Added point:', newCoord, 'Total points:', currentCoords.length);
      }
    }
    
    // Update live distance display
    updateLiveDistanceDisplay(currentCoords);
    
    liveUpdate();
  }

  function liveUpdate() {
    if (currentCoords.length < 2) return;
    
    console.log('[draw] Live update with coordinates:', currentCoords.length);
    
    // Ensure coordinates form a closed loop for circles only (not polygons during drawing)
    let coordinates = [...currentCoords];
    
    if (isCircleMode && coordinates.length > 2) {
      // Close the line by adding the first point at the end
      coordinates.push(coordinates[0]);
    }
    // Note: For polygons, we don't auto-close during drawing - only when finished
    
    // Create preview feature with actual drawing settings
    const previewFeature = {
      type: 'Feature',
      properties: { 
        temp: true,
        color: currentDrawColor,  // Use actual selected color
        style: currentDrawStyle,  // Use actual selected style
        thickness: currentDrawThickness  // Use actual selected thickness
      },
      geometry: { type: 'LineString', coordinates: coordinates }
    };
    
    try {
      if (map.getSource(SRC_ID)) {
        syncDrawLayerData(previewFeature);
        console.log('[draw] Preview updated with actual drawing settings');
      }
    } catch (err) {
      console.error('[draw] Error updating preview:', err);
    }
  }

  async function finishStroke() {
    if (!isCapturing) return;
    isCapturing = false;

    console.log('[draw] Finishing stroke with', currentCoords.length, 'points');

    // Only keep lines that have at least two points
    if (currentCoords.length > 1) {
      // Ensure coordinates form a closed loop for circles and polygons
      let finalCoords = [...currentCoords];
      
      if ((isCircleMode || isPolygonMode) && finalCoords.length > 2) {
        // Close the line by adding the first point at the end
        finalCoords.push(finalCoords[0]);
      }

      let coordElevations = computeCoordElevationsSync(finalCoords);
      const needsTerrainRgb =
        (drawColorMode === 'elevation' || drawColorMode === 'slope') &&
        coordElevations.some((e) => e === null || !Number.isFinite(e));
      if (needsTerrainRgb) {
        coordElevations = await computeCoordElevationsTerrainRgb(finalCoords, coordElevations);
      }

      const trackId = nextTrackId++;
      
      // Calculate distance for this feature
      const distance = calculateTotalDistance(finalCoords);
      const formattedDistance = formatDistance(distance);
      
      // Calculate area for polygons and circles only
      let area = 0;
      let formattedArea = '';
      if (isPolygonMode || isCircleMode) {
        area = calculateArea(finalCoords);
        formattedArea = formatArea(area);
      }

      // Calculate bearing and elevation for freehand and line tools only
      let bearing = 0;
      let formattedBearing = '';
      let elevationData = { start: 0, end: 0, change: 0 };
      let formattedElevation = '';
      if (isLineMode || (!isPolygonMode && !isCircleMode && finalCoords.length >= 2)) {
        // For freehand, calculate bearing from start to end
        // For line mode, calculate bearing from start to end
        bearing = calculateBearing(finalCoords[0], finalCoords[finalCoords.length - 1]);
        formattedBearing = formatBearing(bearing);

        const el0 = coordElevations.length ? coordElevations[0] : null;
        const el1 = coordElevations.length ? coordElevations[coordElevations.length - 1] : null;
        if (Number.isFinite(el0) && Number.isFinite(el1)) {
          elevationData = { start: el0, end: el1, change: el1 - el0 };
          formattedElevation = formatElevation(elevationData);
        } else {
          elevationData = await calculateElevation(finalCoords);
          formattedElevation = formatElevation(elevationData);
        }
      }
      
      const newFeature = {
        type: 'Feature',
        properties: {
          id: trackId,
          name: `Drawn Track ${trackId}`,
          created_at: new Date().toISOString(),
          userNamed: false,  // Track whether user has given it a custom name
          color: currentDrawColor,  // Store the color with this track
          style: currentDrawStyle,  // Store the style with this track
          thickness: currentDrawThickness,  // Store the thickness with this track
          distance: distance,  // Store the calculated distance in km
          formattedDistance: formattedDistance,  // Store the formatted distance string
          area: area,  // Store the calculated area in square meters
          formattedArea: formattedArea,  // Store the formatted area string
          bearing: bearing,  // Store the calculated bearing in degrees
          formattedBearing: formattedBearing,  // Store the formatted bearing string
          elevation: elevationData,  // Store the elevation data
          formattedElevation: formattedElevation,  // Store the formatted elevation string
          coordElevations,
          lineColorMode: drawColorMode,
          isPolygon: isPolygonMode,  // Track if this is a polygon
          isCircle: isCircleMode  // Track if this is a circle
        },
        geometry: { type: 'LineString', coordinates: finalCoords }
      };
      
      featureCollection.features.push(newFeature);
      console.log('[draw] Added new feature to collection:', newFeature);
      console.log('[draw] Total features in collection:', featureCollection.features.length);
      
      // Add label for the new track
      addDrawnTrackLabel(newFeature, true);
      
      // Save the drawn tracks to Supabase
      saveDrawnTracksToSupabase();
    } else {
      console.log('[draw] Stroke too short, discarding');
    }

    // Commit final collection
    try {
      let source = map.getSource(SRC_ID);
      if (!source) {
        ensureSourceAndLayer();
        source = map.getSource(SRC_ID);
      }
      if (source && typeof source.setData === 'function') {
        syncDrawLayerData();
        console.log('[draw] Final collection committed to source');
      } else {
        console.error('[draw] Source not found when finishing stroke!');
      }
    } catch (err) {
      console.error('[draw] Error committing final collection:', err);
    }

    // Re-enable map gestures
    try { map.dragPan.enable(); } catch {}
    try { map.doubleClickZoom.enable(); } catch {}

    // Auto-exit drawing mode after completing a stroke
    if (isActive) {
      console.log('[draw] Auto-exiting drawing mode after stroke completion');
      disable();
    }

    // Hide live distance display
    hideLiveDistanceDisplay();

    currentCoords = [];
  }

  // --- Track Label Management ---
  function addDrawnTrackLabel(feature, isNewTrack = false, startMinimized = false) {
    if (!map) return;
    
    const coordinates = feature.geometry.coordinates;
    if (!coordinates || coordinates.length === 0) {
      console.warn('[draw] Cannot add label: coordinates are empty or invalid');
      return;
    }
    
    // Validate coordinates - filter out invalid entries
    const validCoordinates = coordinates.filter(coord => {
      if (!Array.isArray(coord) || coord.length < 2) return false;
      const [lng, lat] = coord;
      return typeof lng === 'number' && typeof lat === 'number' && 
             !isNaN(lng) && !isNaN(lat) &&
             isFinite(lng) && isFinite(lat) &&
             Math.abs(lng) <= 180 && Math.abs(lat) <= 90;
    });
    
    if (validCoordinates.length === 0) {
      console.warn('[draw] Cannot add label: no valid coordinates found');
      return;
    }
    
    // Calculate the geometric center of the track (not just middle index)
    // Calculate the actual center point along the track path
    const totalDistance = calculateTrackDistance(validCoordinates);
    const centerDistance = totalDistance / 2;
    
    let accumulatedDistance = 0;
    let middleCoord = validCoordinates[0]; // fallback to first valid point
    
    for (let i = 0; i < validCoordinates.length - 1; i++) {
      const currentPoint = validCoordinates[i];
      const nextPoint = validCoordinates[i + 1];
      
      // Validate points before calculating distance
      if (!Array.isArray(currentPoint) || !Array.isArray(nextPoint) ||
          currentPoint.length < 2 || nextPoint.length < 2) {
        continue;
      }
      
      // Calculate distance between current and next point
      const segmentDistance = calculateDistance(currentPoint, nextPoint);
      
      if (accumulatedDistance + segmentDistance >= centerDistance) {
        // The center point is somewhere along this segment
        const ratio = (centerDistance - accumulatedDistance) / segmentDistance;
        
        // Interpolate between current and next point
        const lng = currentPoint[0] + (nextPoint[0] - currentPoint[0]) * ratio;
        const lat = currentPoint[1] + (nextPoint[1] - currentPoint[1]) * ratio;
        
        // Validate the calculated coordinates
        if (typeof lng === 'number' && typeof lat === 'number' && 
            !isNaN(lng) && !isNaN(lat) && isFinite(lng) && isFinite(lat)) {
          middleCoord = [lng, lat];
        }
        break;
      }
      
      accumulatedDistance += segmentDistance;
    }
    
    // Final validation of middleCoord
    if (!Array.isArray(middleCoord) || middleCoord.length < 2 ||
        typeof middleCoord[0] !== 'number' || typeof middleCoord[1] !== 'number' ||
        isNaN(middleCoord[0]) || isNaN(middleCoord[1]) ||
        !isFinite(middleCoord[0]) || !isFinite(middleCoord[1])) {
      console.error('[draw] Invalid middleCoord calculated, using first valid coordinate:', middleCoord);
      middleCoord = validCoordinates[0];
    }
    
    // Get the track color
    const trackColor = feature.properties.color || '#ff6b35';
    
    // Simple hue rotation calculation for common colors
    const getHueRotation = (color) => {
      const colorMap = {
        '#ff0000': 0,    // Red
        '#ff6b35': 15,   // Orange
        '#ff8000': 30,   // Orange (your color!)
        '#ffff00': 60,   // Yellow
        '#00ff00': 120,  // Green
        '#00ffff': 180,  // Cyan
        '#0000ff': 240,  // Blue
        '#ff00ff': 300,  // Magenta
        '#ff0080': 320,  // Pink
        '#800080': 270,  // Purple
      };
      
      // Try exact match first
      if (colorMap[color.toLowerCase()]) {
        return colorMap[color.toLowerCase()];
      }
      
      // For other colors, calculate hue from RGB
      const hex = color.replace('#', '');
      const r = parseInt(hex.substr(0, 2), 16) / 255;
      const g = parseInt(hex.substr(2, 2), 16) / 255;
      const b = parseInt(hex.substr(4, 2), 16) / 255;
      
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const diff = max - min;
      
      let h = 0;
      if (diff !== 0) {
        if (max === r) {
          h = ((g - b) / diff) % 6;
        } else if (max === g) {
          h = (b - r) / diff + 2;
        } else {
          h = (r - g) / diff + 4;
        }
      }
      h = h * 60;
      if (h < 0) h += 360;
      
      return h;
    };
    
    const hueRotation = getHueRotation(trackColor);
    dlog(`[draw] Track color: ${trackColor}, Hue rotation: ${hueRotation}deg`);
    
    // Create styled track label element
    const trackLabelEl = document.createElement('div');
    trackLabelEl.className = 'track-label-container';
    // Get distance, area, bearing, and elevation information
    const distance = feature.properties.formattedDistance || '0.00 km';
    const area = feature.properties.formattedArea || '';
    const bearing = feature.properties.formattedBearing || '';
    const elevation = feature.properties.formattedElevation || '';
    const isPolygon = feature.properties.isPolygon;
    const isCircle = feature.properties.isCircle;
    
    // Build info display based on track type
    let infoHtml = `<span class="track-label-distance">📏 ${distance}</span>`;
    
    // Add bearing and elevation for freehand and line tools (not polygons/circles)
    if ((bearing || elevation) && !isPolygon && !isCircle) {
      if (bearing) {
        infoHtml += `<br><span class="track-label-bearing">🧭 ${bearing}</span>`;
      }
      if (elevation) {
        infoHtml += `<br><span class="track-label-elevation">⛰️ ${elevation}</span>`;
      }
    }
    
    // Add area for polygons and circles only
    if (area && (isPolygon || isCircle)) {
      infoHtml += `<br><span class="track-label-area">📐 ${area}</span>`;
    }

    const canExportGpx =
      !isPolygon &&
      !isCircle &&
      feature.geometry &&
      feature.geometry.type === 'LineString' &&
      validCoordinates.length >= 2;
    const gpxBtnHtml = canExportGpx
      ? `<button type="button" class="saved-pin-btn gpx-btn track-download-gpx-btn" title="Download this track as GPX for Garmin or handheld GPS">⬇️ Download GPX</button>`
      : '';

    trackLabelEl.innerHTML = `
        <div class="track-drawn-minimized marker-text-box" style="display: none;" title="Open track details">
          <div class="track-label-pin track-label-pin--newdraw">
            <img src="Images/Pins/newdrawicon.svg" width="40" height="40" alt="" decoding="async" />
          </div>
          <div class="label-inner">${feature.properties.name || `Drawn Track ${feature.properties.id}`}</div>
        </div>
      <div class="saved-pin-popup track-label-popup">
        <div class="saved-pin-header">
          <span class="saved-pin-icon" aria-hidden="true">📍</span>
          <span class="track-label-title saved-pin-name">${feature.properties.name || `Drawn Track ${feature.properties.id}`}</span>
        </div>
        <div class="saved-pin-coords track-label-info">
          ${infoHtml}
        </div>
        <div class="saved-pin-actions">
          <button type="button" class="saved-pin-btn rename-btn track-rename-btn" title="Rename track">✏️ Rename</button>
          <button type="button" class="saved-pin-btn delete-btn track-delete-btn" title="Delete track">🗑️ Delete</button>
          ${gpxBtnHtml}
          <button type="button" class="saved-pin-btn minimize-btn track-minimize-btn" title="Minimize to map pin">📌 Minimize</button>
        </div>
      </div>
    `;
    
    // Create a custom positioned element instead of using Mapbox marker
    const trackLabelMarker = {
      _element: trackLabelEl,
      _centerCoord: middleCoord,
      _originalPosition: middleCoord,
      getElement: () => trackLabelEl,
      getLngLat: () => ({ lng: middleCoord[0], lat: middleCoord[1] }),
      setLngLat: () => {}, // No-op since we're controlling position manually
      remove: () => {
        if (trackLabelEl && trackLabelEl.parentNode) {
          trackLabelEl.parentNode.removeChild(trackLabelEl);
        }
      }
    };
    
    // Position the element using CSS transforms
    const updateMarkerPosition = () => {
      try {
        // Validate middleCoord before projecting
        if (!Array.isArray(middleCoord) || middleCoord.length < 2 ||
            typeof middleCoord[0] !== 'number' || typeof middleCoord[1] !== 'number' ||
            isNaN(middleCoord[0]) || isNaN(middleCoord[1]) ||
            !isFinite(middleCoord[0]) || !isFinite(middleCoord[1])) {
          console.error('[draw] Invalid middleCoord in updateMarkerPosition:', middleCoord);
          // Hide the label if coordinates are invalid
          trackLabelEl.style.display = 'none';
          return;
        }
        
        const pixelCoords = map.project(middleCoord);
        
        // Validate pixel coordinates
        if (!pixelCoords || typeof pixelCoords.x !== 'number' || typeof pixelCoords.y !== 'number' ||
            isNaN(pixelCoords.x) || isNaN(pixelCoords.y)) {
          console.error('[draw] Invalid pixel coordinates from map.project:', pixelCoords);
          trackLabelEl.style.display = 'none';
          return;
        }
        
        trackLabelEl.style.position = 'absolute';
        trackLabelEl.style.left = pixelCoords.x + 'px';
        trackLabelEl.style.top = pixelCoords.y + 'px';
        trackLabelEl.style.transform = 'translate(-50%, -50%)'; // Center the element
        trackLabelEl.style.zIndex = '1000';
        trackLabelEl.style.pointerEvents = 'auto';
        trackLabelEl.style.display = 'block'; // Ensure it's visible if coordinates are valid
      } catch (error) {
        console.error('[draw] Error updating marker position:', error, 'middleCoord:', middleCoord);
        // Hide the label on error
        trackLabelEl.style.display = 'none';
      }
    };
    
    // Add the element to the map container
    map.getContainer().appendChild(trackLabelEl);
    
    // Wheel over the label hits this DOM layer, not the map canvas — forward zoom
    // using `around` so the point under the cursor stays fixed (zoomTo+center pans wrong).
    trackLabelEl.addEventListener('wheel', (e) => {
      e.preventDefault();
      const currentZoom = map.getZoom();
      const zoomDelta = e.deltaY > 0 ? -0.1 : 0.1;
      const newZoom = Math.max(0, Math.min(22, currentZoom + zoomDelta));
      const mapContainer = map.getContainer();
      const rect = mapContainer.getBoundingClientRect();
      const cursorX = e.clientX - rect.left;
      const cursorY = e.clientY - rect.top;
      const cursorLngLat = map.unproject([cursorX, cursorY]);
      map.easeTo({
        zoom: newZoom,
        around: cursorLngLat,
        duration: 0
      });
    }, { passive: false });
    
    // Initial positioning
    updateMarkerPosition();
    
    // Update position on map move/zoom
    const onMapMove = () => {
      updateMarkerPosition();
    };
    
    map.on('move', onMapMove);
    map.on('zoom', onMapMove);
    
    // Store the cleanup function
    trackLabelMarker._cleanup = () => {
      map.off('move', onMapMove);
      map.off('zoom', onMapMove);
    };
    
    dlog(`[draw] Track pin positioned at geometric center:`, middleCoord);
    
    // Store reference for deletion using track ID
    trackLabelMarker._trackId = feature.properties.id;
    trackLabelMarker._feature = feature;
    
    // Add smart visibility management
    const updateLabelVisibility = () => {
      const zoom = map.getZoom();
      const isCurrentlyEditing = editingTrackId === feature.properties.id;
      const isUnnamedTrack = !feature.properties.userNamed;
      
      dlog(`[draw] Visibility update called for track: ${feature.properties.name}, zoom: ${zoom}, editing: ${isCurrentlyEditing}, unnamed: ${isUnnamedTrack}, startMinimized: ${startMinimized}`);
      
      const trackPopup = trackLabelEl.querySelector('.track-label-popup');
      const trackMinimized = trackLabelEl.querySelector('.track-drawn-minimized');

      // Always show the marker, but control visibility of content
      if (isCurrentlyEditing) {
        trackLabelEl.style.display = 'block';
        if (trackPopup) trackPopup.style.display = 'block';
        if (trackMinimized) trackMinimized.style.display = 'none';
        console.log(`[draw] Showing full label (editing) for track: ${feature.properties.name}`);
      } else if (zoom < 8 || startMinimized) {
        trackLabelEl.style.display = 'block';
        if (trackPopup) trackPopup.style.display = 'none';
        if (trackMinimized) trackMinimized.style.display = 'flex';
        dlog(`[draw] Showing pin only (zoomed out or startMinimized) for track: ${feature.properties.name}`);
      } else {
        trackLabelEl.style.display = 'block';
        if (trackPopup) trackPopup.style.display = 'block';
        if (trackMinimized) trackMinimized.style.display = 'none';
        console.log(`[draw] Showing full label (zoomed in) for track: ${feature.properties.name}`);
      }
      
      // Debug: Check if the element is actually visible
      const computedStyle = window.getComputedStyle(trackLabelEl);
      dlog(`[draw] Track ${feature.properties.name} computed display: ${computedStyle.display}, visibility: ${computedStyle.visibility}`);
      
      // If the element is hidden, force it to be visible (temporary fix)
      if (computedStyle.display === 'none') {
        console.log(`[draw] WARNING: Track ${feature.properties.name} was hidden, forcing visibility`);
        trackLabelEl.style.display = 'block !important';
        trackLabelEl.style.visibility = 'visible';
      }
    };
    
    // Initial visibility check
    updateLabelVisibility();
    
    // Temporarily disable zoom-based visibility to debug the issue
    // map.on('zoom', updateLabelVisibility);
    
    // Force visibility for debugging
    trackLabelEl.style.display = 'block';
    trackLabelEl.style.visibility = 'visible';
    
    // Store the update function for later use
    trackLabelMarker._updateVisibility = updateLabelVisibility;
    
    // Add delete button functionality
    const deleteBtn = trackLabelEl.querySelector('.track-delete-btn');
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      console.log(`[draw] Delete button clicked for drawn track: ${feature.properties.name} (ID: ${feature.properties.id})`);
      deleteDrawnTrack(feature.properties.id);
    });
    
    // Add rename button functionality
    const renameBtn = trackLabelEl.querySelector('.track-rename-btn');
    renameBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      console.log(`[draw] Rename button clicked for drawn track: ${feature.properties.name} (ID: ${feature.properties.id})`);
      startRenaming(trackLabelEl, feature, trackLabelMarker);
    });

    const gpxDownloadBtn = trackLabelEl.querySelector('.track-download-gpx-btn');
    if (gpxDownloadBtn) {
      gpxDownloadBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        exportSingleDrawnTrackAsGpx(feature);
      });
    }
    
    // Add minimize/maximize functionality
    const minimizeBtn = trackLabelEl.querySelector('.track-minimize-btn');
    const trackMinimized = trackLabelEl.querySelector('.track-drawn-minimized');
    const trackPopup = trackLabelEl.querySelector('.track-label-popup');
    
    // Function to minimize this specific label
    const minimizeLabel = () => {
      if (trackPopup) trackPopup.style.display = 'none';
      if (trackMinimized) trackMinimized.style.display = 'flex';
    };
    
    // Function to expand this specific label
    const expandLabel = () => {
      if (trackPopup) trackPopup.style.display = 'block';
      if (trackMinimized) trackMinimized.style.display = 'none';
    };
    
    // Minimize button click
    minimizeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      minimizeLabel();
    });
    
    // Same behaviour as pin marker + name label: tap pin or name chip to open full card
    if (trackMinimized) {
      trackMinimized.addEventListener('click', (e) => {
        e.stopPropagation();
        expandLabel();
      });
    }
    
    // Add name editing functionality
    const titleElement = trackLabelEl.querySelector('.track-label-title');
    setupTrackNameEditing(titleElement, feature, trackLabelMarker);
    
    // If this is a new track, start renaming immediately
    if (isNewTrack) {
      setTimeout(() => {
        startRenaming(trackLabelEl, feature, trackLabelMarker);
      }, 100);
    }
    
    // Store the marker for later management
    drawnTrackLabels.push(trackLabelMarker);
    
    dlog(`[draw] Added track label "${feature.properties.name}" at:`, middleCoord);
  }
  
  // Global function to minimize all track labels
  function minimizeAllTrackLabels() {
    drawnTrackLabels.forEach(labelMarker => {
      const trackLabelEl = labelMarker.getElement();
      const trackPopup = trackLabelEl.querySelector('.track-label-popup');
      const trackMinimized = trackLabelEl.querySelector('.track-drawn-minimized');
      
      if (trackPopup) trackPopup.style.display = 'none';
      if (trackMinimized) trackMinimized.style.display = 'flex';
    });
  }
  
  // Make minimize function globally available
  if (typeof window.minimizeTrackLabels === 'undefined') {
    window.minimizeTrackLabels = minimizeAllTrackLabels;
  }
  
  // Add global function to test position locking
  window.testTrackPinPositions = function() {
    console.log('[draw] Testing track pin positions:');
    drawnTrackLabels.forEach((label, index) => {
      const currentPos = label.getLngLat();
      const targetPos = label._centerCoord;
      console.log(`Track ${index}: Current: [${currentPos.lng}, ${currentPos.lat}], Target: [${targetPos[0]}, ${targetPos[1]}]`);
    });
  };
  
  function setupTrackNameEditing(titleElement, feature, trackLabelMarker) {
    // This function is now just for initial setup - actual editing is handled by startRenaming
    // Keep the title element as non-editable by default
    titleElement.contentEditable = false;
  }
  
  function startRenaming(trackLabelEl, feature, trackLabelMarker) {
    const titleElement = trackLabelEl.querySelector('.track-label-title');
    const renameBtn = trackLabelEl.querySelector('.track-rename-btn');
    const deleteBtn = trackLabelEl.querySelector('.track-delete-btn');
    const gpxDownloadBtn = trackLabelEl.querySelector('.track-download-gpx-btn');
    const minimizeBtn = trackLabelEl.querySelector('.track-minimize-btn');
    
    // Set this track as currently being edited
    editingTrackId = feature.properties.id;
    
    // Update visibility for all labels (this one will now be visible)
    drawnTrackLabels.forEach(label => {
      if (label._updateVisibility) {
        label._updateVisibility();
      }
    });
    
    // Store original name
    const originalName = titleElement.textContent;
    
    // Make title editable
    titleElement.contentEditable = true;
    titleElement.classList.add('editing');
    
    // Hide action buttons during editing
    renameBtn.style.display = 'none';
    deleteBtn.style.display = 'none';
    if (gpxDownloadBtn) gpxDownloadBtn.style.display = 'none';
    if (minimizeBtn) minimizeBtn.style.display = 'none';
    
    // Focus and select text
    titleElement.focus();
    const range = document.createRange();
    range.selectNodeContents(titleElement);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    
    // Handle key events
    const handleKeyDown = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        finishRenaming();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        cancelRenaming();
      }
    };
    
    // Handle input events to prevent line breaks
    const handleInput = (e) => {
      // Remove line breaks and limit length
      const text = e.target.textContent.replace(/\n/g, '').substring(0, 50);
      if (e.target.textContent !== text) {
        e.target.textContent = text;
        // Move cursor to end
        const range = document.createRange();
        const selection = window.getSelection();
        range.selectNodeContents(e.target);
        range.collapse(false);
        selection.removeAllRanges();
        selection.addRange(range);
      }
    };
    
    // Handle blur events
    const handleBlur = () => {
      finishRenaming();
    };
    
    // Add event listeners
    titleElement.addEventListener('keydown', handleKeyDown);
    titleElement.addEventListener('input', handleInput);
    titleElement.addEventListener('blur', handleBlur);
    
    function finishRenaming() {
      const newName = titleElement.textContent.trim();
      
      if (newName && newName !== originalName) {
        // Update the feature properties
        feature.properties.name = newName;
        feature.properties.userNamed = true;
        
        // Update the feature in the collection
        const featureIndex = featureCollection.features.findIndex(f => f.properties.id === feature.properties.id);
        if (featureIndex !== -1) {
          featureCollection.features[featureIndex].properties.name = newName;
          featureCollection.features[featureIndex].properties.userNamed = true;
        }
        
        // Save to Supabase
        saveDrawnTracksToSupabase();
        
        console.log(`[draw] Updated track name to: "${newName}"`);
      } else if (!newName) {
        // If empty, restore original name
        titleElement.textContent = originalName;
      }

      const minChip = trackLabelEl.querySelector('.track-drawn-minimized .label-inner');
      if (minChip) minChip.textContent = titleElement.textContent.trim();
      
      // Clear editing state
      editingTrackId = null;
      
      // Update visibility for all labels (this one will now follow clustering)
      drawnTrackLabels.forEach(label => {
        if (label._updateVisibility) {
          label._updateVisibility();
        }
      });
      
      // Clean up
      titleElement.contentEditable = false;
      titleElement.classList.remove('editing');
      renameBtn.style.display = 'flex';
      deleteBtn.style.display = 'flex';
      if (gpxDownloadBtn) gpxDownloadBtn.style.display = '';
      if (minimizeBtn) minimizeBtn.style.display = '';
      
      // Remove event listeners
      titleElement.removeEventListener('keydown', handleKeyDown);
      titleElement.removeEventListener('input', handleInput);
      titleElement.removeEventListener('blur', handleBlur);
    }
    
    function cancelRenaming() {
      titleElement.textContent = originalName;
      const minChip = trackLabelEl.querySelector('.track-drawn-minimized .label-inner');
      if (minChip) minChip.textContent = originalName;
      
      // Clear editing state
      editingTrackId = null;
      
      // Update visibility for all labels (this one will now follow clustering)
      drawnTrackLabels.forEach(label => {
        if (label._updateVisibility) {
          label._updateVisibility();
        }
      });
      
      titleElement.contentEditable = false;
      titleElement.classList.remove('editing');
      renameBtn.style.display = 'flex';
      deleteBtn.style.display = 'flex';
      if (gpxDownloadBtn) gpxDownloadBtn.style.display = '';
      if (minimizeBtn) minimizeBtn.style.display = '';
      
      // Remove event listeners
      titleElement.removeEventListener('keydown', handleKeyDown);
      titleElement.removeEventListener('input', handleInput);
      titleElement.removeEventListener('blur', handleBlur);
    }
  }
  
  /** Compare track ids from UI / GeoJSON (reload can change runtime types). */
  function sameDrawTrackId(a, b) {
    if (a === b) return true;
    if (a == null || b == null) return false;
    return String(a) === String(b);
  }

  function deleteDrawnTrack(trackId) {
    const featureIndex = featureCollection.features.findIndex((feature) =>
      sameDrawTrackId(feature.properties.id, trackId)
    );

    if (featureIndex === -1) {
      console.warn(`[draw] Could not find track with ID ${trackId} to delete`);
      return;
    }

    const removedFeature = featureCollection.features[featureIndex];

    const labelsToRemove = drawnTrackLabels.filter(
      (label) =>
        sameDrawTrackId(label._trackId, trackId) || label._feature === removedFeature
    );

    featureCollection.features.splice(featureIndex, 1);

    if (sameDrawTrackId(editingTrackId, trackId)) {
      editingTrackId = null;
    }

    if (map && map.getSource(SRC_ID)) {
      syncDrawLayerData();
    }

    labelsToRemove.forEach((labelToRemove) => {
      try {
        if (labelToRemove._cleanup) {
          labelToRemove._cleanup();
        } else if (map && labelToRemove._updateVisibility) {
          map.off('zoom', labelToRemove._updateVisibility);
        }
        labelToRemove.remove();
        const labelIndex = drawnTrackLabels.indexOf(labelToRemove);
        if (labelIndex > -1) drawnTrackLabels.splice(labelIndex, 1);
        console.log(`[draw] Removed label marker for track ID ${trackId}`);
      } catch (error) {
        console.warn(`[draw] Error removing label marker for track ID ${trackId}:`, error);
      }
    });

    saveDrawnTracksToSupabase();
    console.log(`[draw] Deleted drawn track with ID ${trackId}`);
  }
  
  function clearDrawnTrackLabels() {
    // Remove all label markers from the map
    drawnTrackLabels.forEach(label => {
      try {
        if (label && label.remove) {
          // Remove any zoom event listeners
          if (map && label._updateVisibility) {
            map.off('zoom', label._updateVisibility);
          }
          if (label._cleanup) {
            label._cleanup();
          }
          
          // Remove the marker from the map
          label.remove();
        }
      } catch (error) {
        console.warn('[draw] Error removing label marker:', error);
      }
    });
    drawnTrackLabels = [];
    editingTrackId = null; // Reset editing state
    dlog('[draw] Cleared all drawn track labels');
  }

  // --- Utilities ---
  function clear() {
    featureCollection = { type: 'FeatureCollection', features: [] };
    if (map && map.getSource(SRC_ID)) {
      syncDrawLayerData();
    }
    // Clear all track labels
    clearDrawnTrackLabels();
    // Also clear from Supabase
    clearDrawnTracksFromSupabase();
  }

  // Save drawn tracks to Supabase
  async function saveDrawnTracksToSupabase() {
    try {
      // Check if Supabase client is available
      if (!window.supabaseClient) {
        console.log('[draw] Supabase client not ready, skipping save');
        return;
      }
      
      // Get current user
      const { user, error: authError } = await getCachedSupabaseUser();
      if (authError || !user) {
        console.log('[draw] No authenticated user, skipping Supabase save');
        return;
      }

      // Convert features to track data
        const tracks = featureCollection.features.map((feature, index) => ({
          user_id: user.id,
          name: feature.properties.name || `Drawn Track ${feature.properties.id || index + 1}`,
          coords: feature.geometry.coordinates,
          color: feature.properties.color || currentDrawColor,
          style: feature.properties.style || currentDrawStyle,
          thickness: feature.properties.thickness || currentDrawThickness,
          line_color_mode: feature.properties.lineColorMode || 'manual'
        }));

      // Clear existing tracks for this user first
      const { error: deleteError } = await window.supabaseClient
        .from('draw_tracks')
        .delete()
        .eq('user_id', user.id);

      if (deleteError) {
        console.error('[draw] Error clearing existing tracks:', deleteError);
        return;
      }

      // Insert new tracks
      if (tracks.length > 0) {
        const { error: insertError } = await window.supabaseClient
          .from('draw_tracks')
          .insert(tracks);

        if (insertError) {
          console.error('[draw] Error saving tracks to Supabase:', insertError);
        } else {
          console.log('[draw] Successfully saved', tracks.length, 'drawn tracks to Supabase');
        }
      }
    } catch (error) {
      console.error('[draw] Error in saveDrawnTracksToSupabase:', error);
    }
  }

  // Load drawn tracks from Supabase
  let loadRetryCount = 0;
  const MAX_LOAD_RETRIES = 10;
  
  async function loadDrawnTracksFromSupabase() {
    try {
      dlog('[draw] Starting to load drawn tracks from Supabase... (attempt', loadRetryCount + 1, ')');
      
      // Check if Supabase client is available
      if (!window.supabaseClient) {
        loadRetryCount++;
        if (loadRetryCount < MAX_LOAD_RETRIES) {
          console.log('[draw] Supabase client not ready, will retry in 2 seconds... (attempt', loadRetryCount, 'of', MAX_LOAD_RETRIES, ')');
          setTimeout(loadDrawnTracksFromSupabase, 2000);
        } else {
          console.log('[draw] Max retries reached, giving up on loading drawn tracks');
        }
        return;
      }
      
      // Get current user
      const { user, error: authError } = await getCachedSupabaseUser();
      if (authError || !user) {
        dlog('[draw] No authenticated user, skipping Supabase load');
        return;
      }

      dlog('[draw] User authenticated:', user.id);

      // Fetch tracks from Supabase
      const { data: tracks, error } = await window.supabaseClient
        .from('draw_tracks')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true });

      if (error) {
        console.error('[draw] Error loading tracks from Supabase:', error);
        return;
      }

      dlog('[draw] Raw tracks from Supabase:', tracks);

      if (tracks && tracks.length > 0) {
        dlog('[draw] Loading', tracks.length, 'drawn tracks from Supabase');
        
        // Convert tracks back to GeoJSON features
        const features = await Promise.all(tracks.map(async track => {
          const trackId = nextTrackId++;
          const storedMode = track.line_color_mode ?? track.lineColorMode;
          const lineColorMode =
            storedMode === 'elevation' || storedMode === 'slope' || storedMode === 'manual'
              ? storedMode
              : 'manual';

          let coordElevations = computeCoordElevationsSync(track.coords);
          if (
            (lineColorMode === 'elevation' || lineColorMode === 'slope') &&
            coordElevations.some((e) => e === null || !Number.isFinite(e))
          ) {
            coordElevations = await computeCoordElevationsTerrainRgb(track.coords, coordElevations);
          }
          
          // Calculate distance for loaded tracks
          const distance = calculateTotalDistance(track.coords);
          const formattedDistance = formatDistance(distance);
          
          // Calculate area for loaded tracks (check if it's a closed shape)
          let area = 0;
          let formattedArea = '';
          let isPolygon = false;
          let isCircle = false;
          
          // Check if this is a closed shape (polygon or circle)
          if (track.coords.length > 3 && 
              track.coords[0][0] === track.coords[track.coords.length - 1][0] && 
              track.coords[0][1] === track.coords[track.coords.length - 1][1]) {
            area = calculateArea(track.coords);
            formattedArea = formatArea(area);
            // Determine if it's likely a circle or polygon based on coordinate count
            isCircle = track.coords.length > 16; // Circles have many points
            isPolygon = !isCircle;
          }

          // Calculate bearing for freehand and line tracks (not polygons/circles)
          let bearing = 0;
          let formattedBearing = '';
          let elevationData = { start: 0, end: 0, change: 0 };
          let formattedElevation = '';
          if (!isPolygon && !isCircle && track.coords.length >= 2) {
            bearing = calculateBearing(track.coords[0], track.coords[track.coords.length - 1]);
            formattedBearing = formatBearing(bearing);

            const el0 = coordElevations.length ? coordElevations[0] : null;
            const el1 = coordElevations.length ? coordElevations[coordElevations.length - 1] : null;
            if (Number.isFinite(el0) && Number.isFinite(el1)) {
              elevationData = { start: el0, end: el1, change: el1 - el0 };
              formattedElevation = formatElevation(elevationData);
            } else {
              elevationData = await calculateElevation(track.coords);
              formattedElevation = formatElevation(elevationData);
            }
          }

          return {
            type: 'Feature',
            properties: {
              id: trackId,
              name: track.name,
              created_at: track.created_at,
              userNamed: !track.name.startsWith('Drawn Track '), // Assume custom name if not default format
              color: track.color || currentDrawColor, // Use stored color or fallback to current
              style: track.style || currentDrawStyle, // Use stored style or fallback to current
              thickness: track.thickness || currentDrawThickness, // Use stored thickness or fallback to current
              distance: distance, // Store the calculated distance in km
              formattedDistance: formattedDistance, // Store the formatted distance string
              area: area, // Store the calculated area in square meters
              formattedArea: formattedArea, // Store the formatted area string
              bearing: bearing, // Store the calculated bearing in degrees
              formattedBearing: formattedBearing, // Store the formatted bearing string
              elevation: elevationData, // Store the elevation data
              formattedElevation: formattedElevation, // Store the formatted elevation string
              coordElevations,
              lineColorMode,
              isPolygon: isPolygon, // Track if this is a polygon
              isCircle: isCircle // Track if this is a circle
            },
            geometry: {
              type: 'LineString',
              coordinates: track.coords
            }
          };
        }));
        
        dlog('[draw] Converted features:', features);
        featureCollection.features = features;
        
        // Migrate any tracks that don't have color properties
        migrateTrackColors();
        
        dlog('[draw] Feature collection after migration:', featureCollection);
        dlog('[draw] Map source exists:', !!map.getSource(SRC_ID));
        dlog('[draw] Map layer exists:', !!map.getLayer(LINE_LAYER_ID));
        
        // Ensure source and layer exist, then update the data
        ensureSourceAndLayer();
        
        // Wait a moment for ensureSourceAndLayer to complete, then update
        setTimeout(() => {
          updateMapSourceWithTracks(features);
        }, 100);
        
        function updateMapSourceWithTracks(features) {
          // Clear any existing labels before adding new ones
          clearDrawnTrackLabels();
          
          // Update the map source with loaded tracks
          if (map && map.getSource(SRC_ID)) {
            try {
              syncDrawLayerData();
              dlog('[draw] Successfully loaded drawn tracks to map');
              dlog('[draw] Source data after update:', map.getSource(SRC_ID)._data);
            } catch (error) {
              console.error('[draw] Error updating map source:', error);
            }
            
            // Add labels for all loaded tracks (but start minimized)
            features.forEach((feature) => {
              addDrawnTrackLabel(feature, false, true); // Third parameter: startMinimized
            });
          } else {
            dlog('[draw] Map source still not ready after ensureSourceAndLayer, will retry when map is loaded');
            // Retry when map is ready
            if (map) {
              map.on('load', () => {
                ensureSourceAndLayer();
                if (map.getSource(SRC_ID)) {
                  // Clear any existing labels before adding new ones
                  clearDrawnTrackLabels();
                  
                  // Migrate any tracks that don't have color properties
                  migrateTrackColors();
                  
                  syncDrawLayerData();
                  dlog('[draw] Loaded drawn tracks to map (retry)');
                  
                  // Add labels for all loaded tracks (but start minimized)
                  features.forEach((feature) => {
                    addDrawnTrackLabel(feature, false, true); // Third parameter: startMinimized
                  });
                }
              });
            }
          }
        }
      } else {
        dlog('[draw] No drawn tracks found in Supabase');
      }
      
      // Reset retry count on success
      loadRetryCount = 0;
      
    } catch (error) {
      console.error('[draw] Error in loadDrawnTracksFromSupabase:', error);
      loadRetryCount++;
      if (loadRetryCount < MAX_LOAD_RETRIES) {
        dlog('[draw] Retrying load in 3 seconds... (attempt', loadRetryCount, 'of', MAX_LOAD_RETRIES, ')');
        setTimeout(loadDrawnTracksFromSupabase, 3000);
      } else {
        console.log('[draw] Max retries reached after error, giving up on loading drawn tracks');
      }
    }
  }

  // Clear drawn tracks from Supabase
  async function clearDrawnTracksFromSupabase() {
    try {
      // Check if Supabase client is available
      if (!window.supabaseClient) {
        console.log('[draw] Supabase client not ready, skipping clear');
        return;
      }
      
      // Get current user
      const { user, error: authError } = await getCachedSupabaseUser();
      if (authError || !user) {
        console.log('[draw] No authenticated user, skipping Supabase clear');
        return;
      }

      // Clear tracks from Supabase
      const { error } = await window.supabaseClient
        .from('draw_tracks')
        .delete()
        .eq('user_id', user.id);

      if (error) {
        console.error('[draw] Error clearing tracks from Supabase:', error);
      } else {
        console.log('[draw] Successfully cleared drawn tracks from Supabase');
      }
    } catch (error) {
      console.error('[draw] Error in clearDrawnTracksFromSupabase:', error);
    }
  }

  // Save drawing color to Supabase
  async function saveDrawColorToSupabase(color) {
    try {
      // Check if Supabase client is available
      if (!window.supabaseClient) {
        console.log('[draw] Supabase client not ready, skipping color save');
        return;
      }
      
      // Get current user
      const { user, error: authError } = await getCachedSupabaseUser();
      if (authError || !user) {
        console.log('[draw] No authenticated user, skipping color save');
        return;
      }

      // Try to save to user_settings table, but don't fail if it doesn't exist
      try {
        const { error } = await window.supabaseClient
          .from('user_settings')
          .upsert({
            user_id: user.id,
            setting_key: 'draw_color',
            setting_value: color,
            updated_at: new Date().toISOString()
          }, {
            onConflict: 'user_id,setting_key'
          });

        if (error) {
          if (error.code === '42P01') {
            console.log('[draw] user_settings table does not exist, color saved to localStorage only');
          } else {
            console.error('[draw] Error saving color to Supabase:', error);
          }
        } else {
          console.log('[draw] Successfully saved color to Supabase:', color);
        }
      } catch (tableError) {
        console.log('[draw] user_settings table not available, color saved to localStorage only');
      }
    } catch (error) {
      console.error('[draw] Error in saveDrawColorToSupabase:', error);
    }
  }

  // Load drawing color from Supabase
  async function loadDrawColorFromSupabase() {
    try {
      // Check if Supabase client is available
      if (!window.supabaseClient) {
        console.log('[draw] Supabase client not ready, skipping color load');
        return null;
      }
      
      // Get current user
      const { user, error: authError } = await getCachedSupabaseUser();
      if (authError || !user) {
        console.log('[draw] No authenticated user, skipping color load');
        return null;
      }

      // Check if user_settings table exists by trying to query it
      try {
        const { data, error } = await window.supabaseClient
          .from('user_settings')
          .select('setting_value')
          .eq('user_id', user.id)
          .eq('setting_key', 'draw_color')
          .single();

        if (error) {
          if (error.code === 'PGRST116') {
            // No setting found, that's okay
            console.log('[draw] No color setting found in Supabase, using default');
            return null;
          } else if (error.code === '42P01') {
            // Table doesn't exist, that's okay too
            console.log('[draw] user_settings table does not exist, using default');
            return null;
          } else if (String(error.message || '').includes('NetworkError')) {
            dlog('[draw] Network error while loading color from Supabase, using local/default color');
            return null;
          }
          console.error('[draw] Error loading color from Supabase:', error);
          return null;
        }

        dlog('[draw] Loaded color from Supabase:', data.setting_value);
        return data.setting_value;
      } catch (tableError) {
        // Table doesn't exist or other error
        console.log('[draw] user_settings table not available, using default');
        return null;
      }
    } catch (error) {
      if (String(error?.message || '').includes('NetworkError')) {
        dlog('[draw] Network error in loadDrawColorFromSupabase, using local/default color');
      } else {
        console.error('[draw] Error in loadDrawColorFromSupabase:', error);
      }
      return null;
    }
  }

  function getFeatures() {
    return JSON.parse(JSON.stringify(featureCollection));
  }

  // Load drawing color from localStorage and Supabase
  async function loadDrawColor() {
    let loadedColor = null;
    
    // First try to load from localStorage (fastest)
    try {
      const localColor = localStorage.getItem('witd_draw_color');
      if (localColor) {
        loadedColor = localColor;
        dlog('[draw] Loaded color from localStorage:', loadedColor);
      }
    } catch (error) {
      console.warn('[draw] Could not load color from localStorage:', error);
    }
    
    // Then try to load from Supabase (for cross-device sync)
    try {
      const supabaseColor = await loadDrawColorFromSupabase();
      if (supabaseColor) {
        loadedColor = supabaseColor;
        dlog('[draw] Loaded color from Supabase:', loadedColor);
        
        // Update localStorage with Supabase value for next time
        try {
          localStorage.setItem('witd_draw_color', loadedColor);
        } catch (error) {
          console.warn('[draw] Could not update localStorage with Supabase color:', error);
        }
      }
    } catch (error) {
      console.warn('[draw] Could not load color from Supabase:', error);
    }
    
    // If we found a color, update the current color and UI
    if (loadedColor) {
      currentDrawColor = loadedColor;
      
      // Update the color picker UI
      const colorPicker = document.getElementById('drawColorPicker');
      if (colorPicker) {
        colorPicker.value = loadedColor;
        dlog('[draw] Updated color picker UI to:', loadedColor);
      }
      
      // Migrate existing tracks that don't have a color property
      migrateTrackColors();
      
      // Note: We don't update the layer color anymore since we use data-driven styling
      // Each track has its own color stored in its properties
    }
    
    return loadedColor;
  }

  // Migrate existing tracks to have color properties
  function migrateTrackColors() {
    dlog('[draw] Starting migration, currentDrawColor:', currentDrawColor);
    dlog('[draw] Features before migration:', featureCollection.features.length);
    
    let migrated = false;
    featureCollection.features.forEach((feature, index) => {
      dlog(`[draw] Feature ${index}:`, {
        id: feature.properties.id,
        hasColor: !!feature.properties.color,
        color: feature.properties.color
      });
      
      if (!feature.properties.color) {
        feature.properties.color = currentDrawColor;
        migrated = true;
        dlog('[draw] Migrated track', feature.properties.id, 'to color:', currentDrawColor);
      }
    });
    
    dlog('[draw] Migration complete, migrated:', migrated);
    
    if (migrated) {
      // Update the map source with migrated data
      if (map && map.getSource(SRC_ID)) {
        try {
          syncDrawLayerData();
          dlog('[draw] Updated map source with migrated colors');
        } catch (error) {
          console.error('[draw] Error updating map source with migrated colors:', error);
        }
      }
    }
  }

  // Update drawing color
  function updateDrawColor(newColor) {
    currentDrawColor = newColor;
    console.log('[draw] Updated drawing color to:', newColor);
    
    // Save color to localStorage
    try {
      localStorage.setItem('witd_draw_color', currentDrawColor);
      console.log('[draw] Saved color to localStorage:', currentDrawColor);
    } catch (error) {
      console.warn('[draw] Could not save color to localStorage:', error);
    }
    
    // Save color to Supabase
    saveDrawColorToSupabase(currentDrawColor);
    
    // Note: We don't update existing tracks' colors anymore since each track has its own color
    // The new color will only apply to new tracks that are drawn
  }

  // Update drawing style
  function updateDrawStyle(newStyle) {
    currentDrawStyle = newStyle;
    console.log('[draw] Updated drawing style to:', newStyle);
    
    // Save style to localStorage
    try {
      localStorage.setItem('witd_draw_style', currentDrawStyle);
      console.log('[draw] Saved style to localStorage:', currentDrawStyle);
    } catch (error) {
      console.warn('[draw] Could not save style to localStorage:', error);
    }
    
    // Note: We don't update existing tracks' styles anymore since each track has its own style
    // The new style will only apply to new tracks that are drawn
  }

  // Load drawing style from localStorage and Supabase
  function loadDrawStyle() {
    // Load from localStorage first (fast)
    const savedStyle = localStorage.getItem('witd_draw_style');
    if (savedStyle) {
      currentDrawStyle = savedStyle;
      dlog('[draw] Loaded style from localStorage:', currentDrawStyle);
    }
    
    // Update the UI to reflect the current style
    const styleSelect = document.getElementById('lineStyleSelect');
    if (styleSelect) {
      styleSelect.value = currentDrawStyle;
      dlog('[draw] Updated style select UI to:', currentDrawStyle);
    }
  }

  // Function to update drawing thickness
  function updateDrawThickness(newThickness) {
    currentDrawThickness = parseInt(newThickness);
    dlog('[draw] Updated drawing thickness to:', currentDrawThickness);
    try {
      localStorage.setItem('witd_draw_thickness', currentDrawThickness.toString());
      dlog('[draw] Saved thickness to localStorage:', currentDrawThickness);
    } catch (error) {
      console.warn('[draw] Could not save thickness to localStorage:', error);
    }
  }

  // Function to load drawing thickness from localStorage
  function loadDrawThickness() {
    const savedThickness = localStorage.getItem('witd_draw_thickness');
    if (savedThickness) {
      currentDrawThickness = parseInt(savedThickness);
      dlog('[draw] Loaded thickness from localStorage:', currentDrawThickness);
    }
    const thicknessSlider = document.getElementById('thicknessSlider');
    const thicknessValue = document.getElementById('thicknessValue');
    if (thicknessSlider && thicknessValue) {
      thicknessSlider.value = currentDrawThickness;
      thicknessValue.textContent = currentDrawThickness;
      dlog('[draw] Updated thickness slider UI to:', currentDrawThickness);
    }
  }

  // Function to set drawing mode
  function setDrawMode(mode) {
    currentDrawMode = mode;
    isLineMode = (mode === 'line');
    isPolygonMode = (mode === 'polygon');
    isCircleMode = (mode === 'circle');
    dlog('[draw] Drawing mode set to:', mode, 'isLineMode:', isLineMode, 'isPolygonMode:', isPolygonMode, 'isCircleMode:', isCircleMode);
    
    // Reset drawing state when switching modes
    if (!isLineMode) {
      lineStartPoint = null;
    }
    if (!isPolygonMode) {
      polygonPoints = [];
    }
    if (!isCircleMode) {
      circleCenter = null;
    }
    
    // Provide user feedback based on mode
    if (mode === 'pencil') {
      console.log('[draw] 🖊️ Pencil mode: Click and drag to draw freehand');
    } else if (mode === 'line') {
      console.log('[draw] 📏 Line mode: Click first point, drag to preview, click second point');
    } else if (mode === 'polygon') {
      console.log('[draw] 🔷 Polygon mode: Click to add points, double-click to finish, right-click to cancel');
    } else if (mode === 'circle') {
      console.log('[draw] ⭕ Circle mode: Click first point, drag to expand circle, click to finish');
    }
  }

  // Function to clear all drawn tracks
  async function clearAllDrawings() {
    try {
      console.log('[draw] Clearing all drawn tracks...');
      
      // Clear the local feature collection
      featureCollection = {
        type: 'FeatureCollection',
        features: []
      };
      
      // Clear all track labels
      drawnTrackLabels.forEach(label => {
        if (label && label.remove) {
          // Remove any zoom event listeners
          if (map && label._updateVisibility) {
            map.off('zoom', label._updateVisibility);
          }
          if (label._cleanup) {
            label._cleanup();
          }
          
          label.remove();
        }
      });
      drawnTrackLabels = [];
      console.log('[draw] Track labels cleared');
      
      // Update the map source
      if (map && map.getSource(SRC_ID)) {
        syncDrawLayerData();
        console.log('[draw] Map source cleared');
      }
      
      // Clear localStorage as well
      try {
        localStorage.removeItem('witd_drawn_tracks');
        console.log('[draw] localStorage cleared');
      } catch (localError) {
        console.warn('[draw] Could not clear localStorage:', localError);
      }
      
      // Clear from Supabase if user is authenticated
      if (window.supabaseClient) {
        try {
          const { user } = await getCachedSupabaseUser();
          if (user) {
            await clearAllDrawingsFromSupabase(user.id);
          } else {
            console.log('[draw] No authenticated user, skipping Supabase clear');
          }
        } catch (authError) {
          console.warn('[draw] Could not get user for Supabase clear:', authError);
        }
      }
      
      console.log('[draw] All drawn tracks cleared successfully');
    } catch (error) {
      console.error('[draw] Error clearing drawn tracks:', error);
    }
  }
  
  // Function to clear all drawings from Supabase
  async function clearAllDrawingsFromSupabase(userId) {
    try {
      console.log('[draw] Clearing drawn tracks from Supabase for user:', userId);
      
      const { error } = await window.supabaseClient
        .from('draw_tracks')
        .delete()
        .eq('user_id', userId);
      
      if (error) {
        console.error('[draw] Error clearing tracks from Supabase:', error);
      } else {
        console.log('[draw] Successfully cleared tracks from Supabase');
      }
    } catch (error) {
      console.error('[draw] Error in clearAllDrawingsFromSupabase:', error);
    }
  }

  // --- Live Distance Display ---
  function updateLiveDistanceDisplay(coordinates) {
    if (coordinates.length < 2) return;
    
    const distance = calculateTotalDistance(coordinates);
    const formattedDistance = formatDistance(distance);
    
    // Find or create distance display element
    let distanceDisplay = document.getElementById('live-distance-display');
    if (!distanceDisplay) {
      distanceDisplay = document.createElement('div');
      distanceDisplay.id = 'live-distance-display';
      distanceDisplay.className = 'live-distance-display';
      distanceDisplay.style.cssText = `
        position: fixed;
        top: 120px;
        right: 20px;
        background: rgba(0, 0, 0, 0.8);
        color: white;
        padding: 8px 12px;
        border-radius: 6px;
        font-size: 14px;
        font-weight: bold;
        z-index: 1000;
        pointer-events: none;
        border: 2px solid #ff6b35;
      `;
      document.body.appendChild(distanceDisplay);
    }
    
    distanceDisplay.textContent = `📏 ${formattedDistance}`;
    distanceDisplay.style.display = 'block';
  }

  function hideLiveDistanceDisplay() {
    const distanceDisplay = document.getElementById('live-distance-display');
    if (distanceDisplay) {
      distanceDisplay.style.display = 'none';
    }
  }

  // --- Public surface (global) ---
  window.WITD = window.WITD || {};
  window.WITD.draw = {
    init,
    enable,
    disable,
    toggle,
    isActive: () => isActive,
    clear,
    getFeatures,
    updateDrawColor,
    loadDrawColor,
    updateDrawStyle,
    loadDrawStyle,
    updateDrawThickness,
    loadDrawThickness,
    updateDrawColorMode,
    loadDrawColorMode,
    getDrawColorMode: () => drawColorMode,
    exportDrawnTracksAsGpx,
    exportSingleDrawnTrackAsGpx,
    updateExportGpxButtonVisibility: updateDrawExportGpxUi,
    resampleTrackElevationsFromTerrain: resampleAllTrackElevationsFromTerrain,
    setDrawMode,
    clearAllDrawings,
    save: saveDrawnTracksToSupabase,
    load: loadDrawnTracksFromSupabase,
    cleanup,
    updateLiveDistanceDisplay,
    hideLiveDistanceDisplay,
    getStatus: () => ({
      isActive,
      isCapturing,
      isInitializing,
      mapReady: !!map,
      sourceExists: map ? !!map.getSource(SRC_ID) : false,
      layerExists: map ? !!map.getLayer(LINE_LAYER_ID) : false,
      featureCount: featureCollection.features.length,
      currentColor: currentDrawColor,
      currentStyle: currentDrawStyle,
      drawColorMode
    }),
    restoreAfterStyleSwitch: () => {
      dlog('[draw] Restoring draw tracks after style switch...');
      
      // Prevent multiple simultaneous restoration attempts
      if (isRestoring) {
        console.log('[draw] Restoration already in progress, skipping...');
        return;
      }
      
      isRestoring = true;
      const restoreWatchdog = setTimeout(() => {
        if (isRestoring) {
          console.warn('[draw] Restoration watchdog reset (timeout)');
          isRestoring = false;
        }
      }, 5000);
      
      const currentMap = window.WITD?.map;
      if (currentMap) {
        // Preserve features and rebind them explicitly to the new style source.
        const savedFeatures = featureCollection.features.length > 0 ? [...featureCollection.features] : [];
        dlog(`[draw] Preserving ${savedFeatures.length} features before restoration`);
        map = currentMap;
        featureCollection.features = savedFeatures;

        const rebindDrawLayers = () => {
          if (rebindDrawLayers._ran) return;
          rebindDrawLayers._ran = true;
          try {
            // Remove in safe order: layer first, then source.
            if (map.getLayer(LINE_LAYER_ID)) {
              map.removeLayer(LINE_LAYER_ID);
            }
            if (map.getSource(SRC_ID)) {
              map.removeSource(SRC_ID);
            }

            ensureSourceAndLayer();
            const source = map.getSource(SRC_ID);
            const layer = map.getLayer(LINE_LAYER_ID);
            dlog('[draw] Source exists:', !!source);
            dlog('[draw] Layer exists:', !!layer);

            if (source && typeof source.setData === 'function') {
              resampleAllTrackElevationsFromTerrain();
              dlog(`[draw] Rebound ${featureCollection.features.length} features to draw source`);
            }

            if (savedFeatures.length > 0) {
              dlog('[draw] Restoring track labels...');
              savedFeatures.forEach(feature => {
                addDrawnTrackLabel(feature, false, true);
              });
              dlog(`[draw] Restored ${savedFeatures.length} track labels`);
              map.triggerRepaint();
            } else {
              console.log('[draw] No local features, reloading from Supabase...');
              loadDrawnTracksFromSupabase();
            }
          } catch (error) {
            console.error('[draw] Rebind draw layers failed:', error);
          } finally {
            clearTimeout(restoreWatchdog);
            isRestoring = false;
          }
        };

        if (!map.isStyleLoaded()) {
          map.once('style.load', () => {
            rebindDrawLayers();
            map.once('idle', rebindDrawLayers);
            setTimeout(rebindDrawLayers, 1200);
          });
        } else {
          // Run immediately, then keep idle/timer as safety nets.
          rebindDrawLayers();
          map.once('idle', rebindDrawLayers);
          setTimeout(rebindDrawLayers, 1200);
        }
      } else {
        console.log('[draw] Map not available for restoration');
        isRestoring = false;
      }
    }
  };

  // Keep compatibility with your toolbar wiring:
  // window.startDrawTrack() is now a toggle for freehand mode.
  window.startDrawTrack = toggle;
  
  // Add global function to manually load tracks (for debugging)
  window.loadDrawnTracks = loadDrawnTracksFromSupabase;
  
  // Add function to check Supabase status
  window.checkSupabaseStatus = function() {
    console.log('🔍 Supabase Status Check:');
    console.log('- window.supabase exists:', !!window.supabase);
    console.log('- window.supabaseClient exists:', !!window.supabaseClient);
    console.log('- window.supabaseClient.auth exists:', !!(window.supabaseClient && window.supabaseClient.auth));
    console.log('- window.supabaseClient.from exists:', !!(window.supabaseClient && window.supabaseClient.from));
    if (window.supabaseClient) {
      console.log('- Supabase URL:', window.supabaseClient.supabaseUrl);
      console.log('- Supabase Key:', window.supabaseClient.supabaseKey ? 'Present' : 'Missing');
    }
  };
  
  // Add function to check what's in the draw_tracks table
  window.checkDrawTracksTable = async function() {
    try {
      console.log('🔍 Checking draw_tracks table...');
      const { data, error } = await window.supabaseClient
        .from('draw_tracks')
        .select('*');
      
      if (error) {
        console.error('Error fetching draw_tracks:', error);
      } else {
        console.log('All records in draw_tracks table:', data);
        console.log('Total records:', data.length);
      }
    } catch (err) {
      console.error('Error checking draw_tracks table:', err);
    }
  };

  // Add debug function for troubleshooting
  window.debugDrawModule = function() {
    console.log('🔍 Drawing Module Debug Info:');
    console.log('- Module loaded:', true);
    console.log('- Map instance:', !!map);
    console.log('- Is active:', isActive);
    console.log('- Is capturing:', isCapturing);
    console.log('- Is initializing:', isInitializing);
    console.log('- Source exists:', map ? !!map.getSource(SRC_ID) : false);
    console.log('- Layer exists:', map ? !!map.getLayer(LINE_LAYER_ID) : false);
    console.log('- Feature count:', featureCollection.features.length);
    console.log('- Map style loaded:', map ? map.isStyleLoaded() : false);
    console.log('- Current draw color:', currentDrawColor);
    
    if (map) {
      try {
        const source = map.getSource(SRC_ID);
        const layer = map.getLayer(LINE_LAYER_ID);
        console.log('- Source object:', source);
        console.log('- Layer object:', layer);
        if (source) {
          console.log('- Source data:', source._data);
        }
        if (layer) {
          console.log('- Layer paint properties:', layer.paint);
        }
      } catch (error) {
        console.log('- Error getting source/layer:', error.message);
      }
    }
    
    return window.WITD.draw.getStatus();
  };

  // Add function to test layer visibility
  window.testDrawLayer = function() {
    if (!map) {
      console.log('❌ Map not available');
      return;
    }
    
    const layer = map.getLayer(LINE_LAYER_ID);
    if (!layer) {
      console.log('❌ Layer does not exist');
      return;
    }
    
    console.log('✅ Layer exists, testing visibility...');
    
    // Try to make the layer more visible
    try {
      map.setPaintProperty(LINE_LAYER_ID, 'line-width', 10);
      map.setPaintProperty(LINE_LAYER_ID, 'line-color', '#ff0000');
      console.log('✅ Set layer to red, width 10');
    } catch (error) {
      console.error('❌ Error setting layer properties:', error);
    }
  };

  // Auto-initialize if map is already available
  if (window.WITD && window.WITD.map) {
    console.log('[draw] Map already available, initializing immediately');
    init(window.WITD.map);
    dlog("Drawing module auto-initialized");
  } else {
    window.addEventListener('witd:map-ready', (event) => {
      const readyMap = event.detail?.map || window.WITD?.map;
      if (readyMap) {
        init(readyMap);
        dlog("Drawing module auto-initialized");
      }
    }, { once: true });
  }
})();
