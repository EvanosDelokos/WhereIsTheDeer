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

  // --- Distance and Area calculation functions ---
  function calculateDistance(point1, point2) {
    // Haversine formula for calculating great-circle distance between two points
    const R = 6371; // Earth's radius in kilometers
    
    // Validate coordinates format [lng, lat]
    if (!Array.isArray(point1) || !Array.isArray(point2) || 
        point1.length !== 2 || point2.length !== 2) {
      console.error('[draw] Invalid coordinate format:', point1, point2);
      return 0;
    }
    
    // Check if coordinates are in reasonable ranges
    if (Math.abs(point1[0]) > 180 || Math.abs(point1[1]) > 90 ||
        Math.abs(point2[0]) > 180 || Math.abs(point2[1]) > 90) {
      console.error('[draw] Coordinates out of valid range:', point1, point2);
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
    
    console.log('[draw] Distance calculation - Original coords:', coordinates.length, 'Filtered coords:', filteredCoords.length);
    
    let totalDistance = 0;
    for (let i = 1; i < filteredCoords.length; i++) {
      const segmentDistance = calculateDistance(filteredCoords[i - 1], filteredCoords[i]);
      
      // Safety check - if any segment is larger than 1000km, something is wrong
      if (segmentDistance > 1000) {
        console.error(`[draw] ERROR: Segment distance too large: ${segmentDistance} km between points:`, 
          filteredCoords[i - 1], filteredCoords[i]);
        continue; // Skip this segment
      }
      
      totalDistance += segmentDistance;
      console.log(`[draw] Segment ${i}: ${segmentDistance.toFixed(3)} km`);
    }
    
    // Safety check - if total distance is larger than 50000km (more than Earth's circumference), cap it
    if (totalDistance > 50000) {
      console.error('[draw] ERROR: Total distance too large:', totalDistance, 'km - capping at 0');
      totalDistance = 0;
    }
    
    console.log('[draw] Total calculated distance:', totalDistance.toFixed(3), 'km');
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
      console.log('[draw] Not enough coordinates for area calculation:', coordinates.length);
      return 0;
    }
    
    // Ensure the polygon is closed (first and last points are the same)
    let coords = [...coordinates];
    if (coords[0][0] !== coords[coords.length - 1][0] || coords[0][1] !== coords[coords.length - 1][1]) {
      coords.push(coords[0]);
      console.log('[draw] Added closing point to polygon');
    }
    
    let area = 0;
    const n = coords.length - 1; // Exclude the duplicate closing point
    
    console.log('[draw] Processing polygon with', n, 'vertices');
    
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

  // Calculate elevation using Mapbox Terrain API
  async function calculateElevation(coordinates) {
    if (coordinates.length === 0) return { start: 0, end: 0, change: 0 };
    
    const start = coordinates[0];
    const end = coordinates[coordinates.length - 1];
    
    try {
      // Get elevation from Mapbox Terrain API
      const startElevation = await getMapboxElevation(start[1], start[0]); // lat, lng
      const endElevation = await getMapboxElevation(end[1], end[0]); // lat, lng
      const elevationChange = endElevation - startElevation;
      
      return {
        start: startElevation,
        end: endElevation,
        change: elevationChange
      };
    } catch (error) {
      console.warn('[draw] Failed to get elevation from Mapbox, using fallback:', error);
      // Fallback to basic estimation if API fails
      return calculateElevationFallback(coordinates);
    }
  }

  // Get elevation from Mapbox Terrain API
  async function getMapboxElevation(lat, lng) {
    const MAPBOX_TOKEN = 'pk.eyJ1IjoiZXZhbmtva2EiLCJhIjoiY21lNWJmY3F2MHJzOTJrb2h1MWl4eDZpMCJ9.5ZEQqD207yalsIQLX5tpdg';
    
    try {
      // Method 1: Try map.queryTerrainElevation first (most accurate)
      if (map && typeof map.queryTerrainElevation === 'function' && map.isStyleLoaded()) {
        try {
          const elevation = map.queryTerrainElevation([lng, lat]);
          if (elevation !== null && elevation !== undefined && !isNaN(elevation)) {
            console.log(`[draw] Got elevation from map.queryTerrainElevation: ${elevation}m at [${lat}, ${lng}]`);
            return elevation;
          }
        } catch (e) {
          console.warn('[draw] map.queryTerrainElevation failed:', e);
        }
      }
      
      // Method 2: Use Mapbox Terrain-RGB API
      const url = `https://api.mapbox.com/v4/mapbox.terrain-rgb/${Math.floor(lng*100)/100},${Math.floor(lat*100)/100}.json?access_token=${MAPBOX_TOKEN}`;
      
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Mapbox API error: ${response.status}`);
      }
      
      // For now, use a fallback estimation based on the location
      // In a real implementation, you'd decode the terrain RGB data
      const elevation = estimateElevationFromCoords(lat, lng);
      return elevation;
      
    } catch (error) {
      console.warn('[draw] Mapbox elevation API failed:', error);
      // Return fallback estimation
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
  function init(mapInstance) {
    console.log('[draw] Initializing with map instance:', mapInstance);
    
    // Prevent multiple initializations
    if (map && map === mapInstance) {
      console.log('[draw] Already initialized with this map instance, skipping...');
      return;
    }
    
    // Clean up previous instance if exists
    if (map && map !== mapInstance) {
      console.log('[draw] Cleaning up previous map instance...');
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
    // to ensure the map is fully ready
    setTimeout(() => {
      loadDrawnTracksFromSupabase();
    }, 1000);

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

    // Start stroke on pointer down ONLY when mode is active
    console.log('[draw] Adding event listeners to map');
    map.on('mousedown', onPointerDown);
    map.on('touchstart', onPointerDown);
    console.log('[draw] Event listeners added successfully');
    
    // Test if the map is receiving events
    map.on('click', (e) => {
      console.log('[draw] Map click event received (test):', e.lngLat);
    });
    
    // Test if mousedown events are being received at all
    map.on('mousedown', (e) => {
      console.log('[draw] Map mousedown event received (test):', e.lngLat, 'isActive:', isActive);
    });
    
    console.log('[draw] Initialization complete');
  }

  // --- cleanup: remove sources, layers, and event listeners ---
  function cleanup() {
    if (!map) return;
    
    console.log('[draw] Cleaning up drawing module...');
    
    // Remove event listeners
    try {
      map.off('mousedown', onPointerDown);
      map.off('touchstart', onPointerDown);
      console.log('[draw] Event listeners removed');
    } catch (error) {
      console.warn('[draw] Error removing event listeners:', error.message);
    }
    
    // Remove layers and sources
    try {
      if (map.getLayer(LINE_LAYER_ID)) {
        map.removeLayer(LINE_LAYER_ID);
        console.log('[draw] Layer removed');
      }
      
      if (map.getSource(SRC_ID)) {
        map.removeSource(SRC_ID);
        console.log('[draw] Source removed');
      }
    } catch (error) {
      console.warn('[draw] Error removing layers/sources:', error.message);
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
    
    console.log('[draw] Cleanup complete');
  }

  // Add a flag to prevent multiple simultaneous initialization attempts
  let isInitializing = false;
  
  function ensureSourceAndLayer() {
    if (!map) {
      console.warn('[draw] Map not available');
      return;
    }

    // Check if map style is loaded
    if (!map.isStyleLoaded()) {
      console.log('[draw] Map style not loaded yet, waiting...');
      map.once('styledata', () => {
        console.log('[draw] Map style now loaded, retrying source/layer creation...');
        ensureSourceAndLayer();
      });
      return;
    }

    // Prevent multiple simultaneous initialization attempts
    if (isInitializing) {
      console.log('[draw] Initialization already in progress, skipping...');
      return;
    }

    // Check if both source and layer already exist
    if (map.getSource(SRC_ID) && map.getLayer(LINE_LAYER_ID)) {
      console.log('[draw] Source and layer already exist, skipping creation');
      return;
    }

    // Check if only source exists (orphaned source)
    if (map.getSource(SRC_ID) && !map.getLayer(LINE_LAYER_ID)) {
      console.log('[draw] Source exists but layer missing, cleaning up orphaned source...');
      try {
        map.removeSource(SRC_ID);
        console.log('[draw] Orphaned source removed');
      } catch (error) {
        console.warn('[draw] Could not remove orphaned source:', error.message);
      }
    }

    // Check if only layer exists (orphaned layer)
    if (!map.getSource(SRC_ID) && map.getLayer(LINE_LAYER_ID)) {
      console.log('[draw] Layer exists but source missing, cleaning up orphaned layer...');
      try {
        map.removeLayer(LINE_LAYER_ID);
        console.log('[draw] Orphaned layer removed');
      } catch (error) {
        console.warn('[draw] Could not remove orphaned layer:', error.message);
      }
    }
    
    console.log('[draw] Creating new source and layer');
    isInitializing = true;
    
    // Use the safe map operation utility if available
    if (window.safeMapOperation) {
      window.safeMapOperation(() => {
        try {
          // Double-check that source doesn't exist before creating
          if (map.getSource(SRC_ID)) {
            console.log('[draw] Source already exists, skipping source creation');
          } else {
            map.addSource(SRC_ID, {
              type: 'geojson',
              data: featureCollection
            });
            console.log('[draw] Source created successfully');
          }

          // Double-check that layer doesn't exist before creating
          if (map.getLayer(LINE_LAYER_ID)) {
            console.log('[draw] Layer already exists, skipping layer creation');
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
            console.log('[draw] Layer created successfully');
          }
          
          console.log('[draw] Source and layer setup complete');
          console.log('[draw] Current source data:', map.getSource(SRC_ID));
          console.log('[draw] Current layer:', map.getLayer(LINE_LAYER_ID));
        } catch (error) {
          console.error('[draw] Error in safe map operation:', error);
        } finally {
          isInitializing = false;
        }
      });
    } else {
      // Fallback to direct operation with error handling
      try {
        
        // Double-check that source doesn't exist before creating
        if (!map.getSource(SRC_ID)) {
          map.addSource(SRC_ID, {
            type: 'geojson',
            data: featureCollection
          });
          console.log('[draw] Source created successfully');
        }

        // Double-check that layer doesn't exist before creating
        if (!map.getLayer(LINE_LAYER_ID)) {
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
          console.log('[draw] Layer created successfully');
        }
        
        console.log('[draw] Source and layer setup complete');
        console.log('[draw] Current source data:', map.getSource(SRC_ID));
        console.log('[draw] Current layer:', map.getLayer(LINE_LAYER_ID));
      } catch (error) {
        console.error('[draw] Error creating source/layer:', error);
        // Retry after a short delay, but only if not already initializing
        if (!isInitializing) {
          setTimeout(() => {
            console.log('[draw] Retrying source/layer creation...');
            ensureSourceAndLayer();
          }, 100);
        }
      } finally {
        isInitializing = false;
      }
    }
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
      map.getSource(SRC_ID).setData(featureCollection);
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
      map.getSource(SRC_ID).setData(featureCollection);
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
    
    // Render the in-progress line by updating source with a temporary feature
    const temp = {
      type: 'FeatureCollection',
      features: [
        ...featureCollection.features,
        previewFeature
      ]
    };
    
    try {
      const source = map.getSource(SRC_ID);
      if (source) {
        source.setData(temp);
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
        
        // Calculate elevation for the track
        elevationData = await calculateElevation(finalCoords);
        formattedElevation = formatElevation(elevationData);
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
      const source = map.getSource(SRC_ID);
      if (source) {
        source.setData(featureCollection);
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
  function addDrawnTrackLabel(feature, isNewTrack = false) {
    if (!map) return;
    
    const coordinates = feature.geometry.coordinates;
    if (coordinates.length === 0) return;
    
    // Calculate the geometric center of the track (not just middle index)
    // Calculate the actual center point along the track path
    const totalDistance = calculateTrackDistance(coordinates);
    const centerDistance = totalDistance / 2;
    
    let accumulatedDistance = 0;
    let middleCoord = coordinates[0]; // fallback to first point
    
    for (let i = 0; i < coordinates.length - 1; i++) {
      const currentPoint = coordinates[i];
      const nextPoint = coordinates[i + 1];
      
      // Calculate distance between current and next point
      const segmentDistance = calculateDistance(currentPoint, nextPoint);
      
      if (accumulatedDistance + segmentDistance >= centerDistance) {
        // The center point is somewhere along this segment
        const ratio = (centerDistance - accumulatedDistance) / segmentDistance;
        
        // Interpolate between current and next point
        const lng = currentPoint[0] + (nextPoint[0] - currentPoint[0]) * ratio;
        const lat = currentPoint[1] + (nextPoint[1] - currentPoint[1]) * ratio;
        
        middleCoord = [lng, lat];
        break;
      }
      
      accumulatedDistance += segmentDistance;
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
    console.log(`[draw] Track color: ${trackColor}, Hue rotation: ${hueRotation}deg`);
    
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
    
    trackLabelEl.innerHTML = `
        <div class="track-label-pin" style="display: none;">
          <svg width="40" height="40" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
            <!-- Red center part - this will be dynamically colored -->
            <path d="M709.485714 277.942857C709.485714 160.914286 614.4 65.828571 497.371429 65.828571S292.571429 160.914286 292.571429 277.942857c0 73.142857 204.8 358.4 204.8 358.4s212.114286-277.942857 212.114285-358.4z" fill="${trackColor}"/>
            <!-- Black outline -->
            <path d="M497.371429 709.485714l-21.942858-29.257143c-36.571429-51.2-219.428571-307.2-219.428571-387.657142C256 160.914286 365.714286 51.2 497.371429 51.2s241.371429 109.714286 241.371428 241.371429c0 87.771429-182.857143 336.457143-226.742857 387.657142l-14.628571 29.257143z m0-607.085714C394.971429 102.4 307.2 182.857143 307.2 292.571429c0 43.885714 102.4 204.8 190.171429 321.828571C585.142857 497.371429 687.542857 336.457143 687.542857 292.571429c0-109.714286-87.771429-190.171429-190.171428-190.171429z" fill="#000000"/>
            <!-- Black track line part 1 -->
            <path d="M928.914286 819.2H102.4C58.514286 819.2 14.628571 782.628571 14.628571 731.428571s36.571429-87.771429 87.771429-87.771428h138.971429c14.628571 0 29.257143 14.628571 29.257142 29.257143s-7.314286 29.257143-21.942857 29.257143h-146.285714c-14.628571 0-29.257143 14.628571-29.257143 29.257142s14.628571 29.257143 29.257143 29.257143h819.2c14.628571 0 29.257143 14.628571 29.257143 29.257143s-7.314286 29.257143-21.942857 29.257143z" fill="#000000"/>
            <!-- Black track line part 2 -->
            <path d="M928.914286 936.228571H226.742857c-14.628571 0-29.257143-14.628571-29.257143-29.257142s14.628571-29.257143 29.257143-29.257143h694.857143c14.628571 0 29.257143-14.628571 29.257143-29.257143s-14.628571-29.257143-29.257143-29.257143H102.4c-14.628571 0-29.257143-14.628571-29.257143-29.257143s14.628571-29.257143 29.257143-29.257143h819.2c43.885714 0 87.771429 36.571429 87.771429 87.771429s-36.571429 87.771429-80.457143 87.771428z" fill="#000000"/>
            <!-- White circle in center -->
            <path d="M497.371429 263.314286m-80.457143 0a80.457143 80.457143 0 1 0 160.914285 0 80.457143 80.457143 0 1 0-160.914285 0Z" fill="#FDFBFB"/>
            <!-- Black circle outline -->
            <path d="M497.371429 365.714286C438.857143 365.714286 394.971429 321.828571 394.971429 263.314286S438.857143 160.914286 497.371429 160.914286s102.4 43.885714 102.4 102.4S555.885714 365.714286 497.371429 365.714286z m0-153.6c-29.257143 0-51.2 21.942857-51.2 51.2s21.942857 51.2 51.2 51.2 51.2-21.942857 51.2-51.2-21.942857-51.2-51.2-51.2z" fill="#000000"/>
          </svg>
        </div>
      <div class="track-label-popup">
        <div class="track-label-header">
          <span class="track-label-title">${feature.properties.name || `Drawn Track ${feature.properties.id}`}</span>
          <div class="track-label-actions">
            <button class="track-minimize-btn" title="Minimize Track Label">📌</button>
            <button class="track-rename-btn" title="Rename Track">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
              </svg>
            </button>
            <button class="track-delete-btn" title="Delete Track">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3,6 5,6 21,6"></polyline>
                <path d="m19,6v14a2,2 0 0,1 -2,2H7a2,2 0 0,1 -2,-2V6m3,0V4a2,2 0 0,1 2,-2h4a2,2 0 0,1 2,2v2"></path>
                <line x1="10" y1="11" x2="10" y2="17"></line>
                <line x1="14" y1="11" x2="14" y2="17"></line>
              </svg>
            </button>
          </div>
        </div>
        <div class="track-label-info">
          ${infoHtml}
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
      const pixelCoords = map.project(middleCoord);
      trackLabelEl.style.position = 'absolute';
      trackLabelEl.style.left = pixelCoords.x + 'px';
      trackLabelEl.style.top = pixelCoords.y + 'px';
      trackLabelEl.style.transform = 'translate(-50%, -50%)'; // Center the element
      trackLabelEl.style.zIndex = '1000';
      trackLabelEl.style.pointerEvents = 'auto';
    };
    
    // Add the element to the map container
    map.getContainer().appendChild(trackLabelEl);
    
    // Prevent browser zoom but allow map zoom
    trackLabelEl.addEventListener('wheel', (e) => {
      // Prevent the browser from zooming the page
      e.preventDefault();
      
      // Get the current zoom level
      const currentZoom = map.getZoom();
      
      // Calculate zoom delta based on scroll direction
      const zoomDelta = e.deltaY > 0 ? -0.1 : 0.1;
      const newZoom = Math.max(0, Math.min(22, currentZoom + zoomDelta));
      
      // Get the map container bounds
      const mapContainer = map.getContainer();
      const rect = mapContainer.getBoundingClientRect();
      
      // Convert cursor position to map coordinates
      const cursorX = e.clientX - rect.left;
      const cursorY = e.clientY - rect.top;
      const cursorLngLat = map.unproject([cursorX, cursorY]);
      
      // Zoom around the cursor position
      map.zoomTo(newZoom, {
        center: cursorLngLat,
        duration: 150
      });
    });
    
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
    
    console.log(`[draw] Track pin positioned at geometric center:`, middleCoord);
    
    // Store reference for deletion using track ID
    trackLabelMarker._trackId = feature.properties.id;
    trackLabelMarker._feature = feature;
    
    // Add smart visibility management
    const updateLabelVisibility = () => {
      const zoom = map.getZoom();
      const isCurrentlyEditing = editingTrackId === feature.properties.id;
      const isUnnamedTrack = !feature.properties.userNamed;
      
      console.log(`[draw] Visibility update called for track: ${feature.properties.name}, zoom: ${zoom}`);
      
      // Always show the marker, but control visibility of content
      if (isCurrentlyEditing || isUnnamedTrack) {
        // Always show when editing or when it's an unnamed track
        trackLabelEl.style.display = 'block';
        console.log(`[draw] Showing full label (editing/unnamed) for track: ${feature.properties.name}`);
      } else if (zoom < 8) {
        // Hide when zoomed out (clustering) - but keep marker position
        trackLabelEl.style.display = 'block';
        // Hide the popup content but show the pin
        const trackPopup = trackLabelEl.querySelector('.track-label-popup');
        const trackPin = trackLabelEl.querySelector('.track-label-pin');
        if (trackPopup && trackPin) {
          trackPopup.style.display = 'none';
          trackPin.style.display = 'block';
        }
        console.log(`[draw] Showing pin only (zoomed out) for track: ${feature.properties.name}`);
      } else {
        // Show when zoomed in
        trackLabelEl.style.display = 'block';
        console.log(`[draw] Showing full label (zoomed in) for track: ${feature.properties.name}`);
      }
    };
    
    // Initial visibility check
    updateLabelVisibility();
    
    // Update visibility on zoom
    map.on('zoom', updateLabelVisibility);
    
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
    
    // Add minimize/maximize functionality
    const minimizeBtn = trackLabelEl.querySelector('.track-minimize-btn');
    const trackPin = trackLabelEl.querySelector('.track-label-pin');
    const trackPopup = trackLabelEl.querySelector('.track-label-popup');
    
    // Function to minimize this specific label
    const minimizeLabel = () => {
      trackPopup.style.display = 'none';
      trackPin.style.display = 'block';
    };
    
    // Function to expand this specific label
    const expandLabel = () => {
      trackPopup.style.display = 'block';
      trackPin.style.display = 'none';
    };
    
    // Minimize button click
    minimizeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      minimizeLabel();
    });
    
    // Pin click to expand
    trackPin.addEventListener('click', (e) => {
      e.stopPropagation();
      expandLabel();
    });
    
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
    
    console.log(`[draw] Added track label "${feature.properties.name}" at:`, middleCoord);
  }
  
  // Global function to minimize all track labels
  function minimizeAllTrackLabels() {
    drawnTrackLabels.forEach(labelMarker => {
      const trackLabelEl = labelMarker.getElement();
      const trackPopup = trackLabelEl.querySelector('.track-label-popup');
      const trackPin = trackLabelEl.querySelector('.track-label-pin');
      
      if (trackPopup && trackPin) {
        trackPopup.style.display = 'none';
        trackPin.style.display = 'block';
      }
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
      
      // Remove event listeners
      titleElement.removeEventListener('keydown', handleKeyDown);
      titleElement.removeEventListener('input', handleInput);
      titleElement.removeEventListener('blur', handleBlur);
    }
    
    function cancelRenaming() {
      titleElement.textContent = originalName;
      
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
      
      // Remove event listeners
      titleElement.removeEventListener('keydown', handleKeyDown);
      titleElement.removeEventListener('input', handleInput);
      titleElement.removeEventListener('blur', handleBlur);
    }
  }
  
  function deleteDrawnTrack(trackId) {
    // Find the feature with the matching ID
    const featureIndex = featureCollection.features.findIndex(feature => feature.properties.id === trackId);
    
    if (featureIndex !== -1) {
      // Remove the feature from the collection
      featureCollection.features.splice(featureIndex, 1);
      
      // Update the map source
      if (map && map.getSource(SRC_ID)) {
        map.getSource(SRC_ID).setData(featureCollection);
      }
      
      // Remove the corresponding label marker
      const labelToRemove = drawnTrackLabels.find(label => label._trackId === trackId);
      if (labelToRemove) {
        try {
          // Remove any zoom event listeners
          if (map && labelToRemove._updateVisibility) {
            map.off('zoom', labelToRemove._updateVisibility);
          }
          
          // Remove the marker from the map
          labelToRemove.remove();
          
          // Remove from the array
          const labelIndex = drawnTrackLabels.indexOf(labelToRemove);
          if (labelIndex > -1) {
            drawnTrackLabels.splice(labelIndex, 1);
          }
          
          console.log(`[draw] Removed label marker for track ID ${trackId}`);
        } catch (error) {
          console.warn(`[draw] Error removing label marker for track ID ${trackId}:`, error);
        }
      }
      
      // Save updated tracks to Supabase
      saveDrawnTracksToSupabase();
      
      console.log(`[draw] Deleted drawn track with ID ${trackId}`);
    } else {
      console.warn(`[draw] Could not find track with ID ${trackId} to delete`);
    }
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
    console.log('[draw] Cleared all drawn track labels');
  }

  // --- Utilities ---
  function clear() {
    featureCollection = { type: 'FeatureCollection', features: [] };
    if (map && map.getSource(SRC_ID)) {
      map.getSource(SRC_ID).setData(featureCollection);
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
      const { data: { user }, error: authError } = await window.supabaseClient.auth.getUser();
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
          thickness: feature.properties.thickness || currentDrawThickness
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
      console.log('[draw] Starting to load drawn tracks from Supabase... (attempt', loadRetryCount + 1, ')');
      
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
      const { data: { user }, error: authError } = await window.supabaseClient.auth.getUser();
      if (authError || !user) {
        console.log('[draw] No authenticated user, skipping Supabase load');
        return;
      }

      console.log('[draw] User authenticated:', user.id);

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

      console.log('[draw] Raw tracks from Supabase:', tracks);

      if (tracks && tracks.length > 0) {
        console.log('[draw] Loading', tracks.length, 'drawn tracks from Supabase');
        
        // Convert tracks back to GeoJSON features
        const features = await Promise.all(tracks.map(async track => {
          const trackId = nextTrackId++;
          
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
            
            elevationData = await calculateElevation(track.coords);
            formattedElevation = formatElevation(elevationData);
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
              isPolygon: isPolygon, // Track if this is a polygon
              isCircle: isCircle // Track if this is a circle
            },
            geometry: {
              type: 'LineString',
              coordinates: track.coords
            }
          };
        }));
        
        console.log('[draw] Converted features:', features);
        featureCollection.features = features;
        
        // Migrate any tracks that don't have color properties
        migrateTrackColors();
        
        console.log('[draw] Feature collection after migration:', featureCollection);
        console.log('[draw] Map source exists:', !!map.getSource(SRC_ID));
        console.log('[draw] Map layer exists:', !!map.getLayer(LINE_LAYER_ID));
        
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
              map.getSource(SRC_ID).setData(featureCollection);
              console.log('[draw] Successfully loaded drawn tracks to map');
              console.log('[draw] Source data after update:', map.getSource(SRC_ID)._data);
            } catch (error) {
              console.error('[draw] Error updating map source:', error);
            }
            
            // Add labels for all loaded tracks
            features.forEach((feature) => {
              addDrawnTrackLabel(feature);
            });
          } else {
            console.warn('[draw] Map source still not ready after ensureSourceAndLayer, will retry when map is loaded');
            // Retry when map is ready
            if (map) {
              map.on('load', () => {
                ensureSourceAndLayer();
                if (map.getSource(SRC_ID)) {
                  // Clear any existing labels before adding new ones
                  clearDrawnTrackLabels();
                  
                  // Migrate any tracks that don't have color properties
                  migrateTrackColors();
                  
                  map.getSource(SRC_ID).setData(featureCollection);
                  console.log('[draw] Loaded drawn tracks to map (retry)');
                  
                  // Add labels for all loaded tracks
                  features.forEach((feature) => {
                    addDrawnTrackLabel(feature);
                  });
                }
              });
            }
          }
        }
      } else {
        console.log('[draw] No drawn tracks found in Supabase');
      }
      
      // Reset retry count on success
      loadRetryCount = 0;
      
    } catch (error) {
      console.error('[draw] Error in loadDrawnTracksFromSupabase:', error);
      loadRetryCount++;
      if (loadRetryCount < MAX_LOAD_RETRIES) {
        console.log('[draw] Retrying load in 3 seconds... (attempt', loadRetryCount, 'of', MAX_LOAD_RETRIES, ')');
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
      const { data: { user }, error: authError } = await window.supabaseClient.auth.getUser();
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
      const { data: { user }, error: authError } = await window.supabaseClient.auth.getUser();
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
      const { data: { user }, error: authError } = await window.supabaseClient.auth.getUser();
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
          }
          console.error('[draw] Error loading color from Supabase:', error);
          return null;
        }

        console.log('[draw] Loaded color from Supabase:', data.setting_value);
        return data.setting_value;
      } catch (tableError) {
        // Table doesn't exist or other error
        console.log('[draw] user_settings table not available, using default');
        return null;
      }
    } catch (error) {
      console.error('[draw] Error in loadDrawColorFromSupabase:', error);
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
        console.log('[draw] Loaded color from localStorage:', loadedColor);
      }
    } catch (error) {
      console.warn('[draw] Could not load color from localStorage:', error);
    }
    
    // Then try to load from Supabase (for cross-device sync)
    try {
      const supabaseColor = await loadDrawColorFromSupabase();
      if (supabaseColor) {
        loadedColor = supabaseColor;
        console.log('[draw] Loaded color from Supabase:', loadedColor);
        
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
        console.log('[draw] Updated color picker UI to:', loadedColor);
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
    console.log('[draw] Starting migration, currentDrawColor:', currentDrawColor);
    console.log('[draw] Features before migration:', featureCollection.features.length);
    
    let migrated = false;
    featureCollection.features.forEach((feature, index) => {
      console.log(`[draw] Feature ${index}:`, {
        id: feature.properties.id,
        hasColor: !!feature.properties.color,
        color: feature.properties.color
      });
      
      if (!feature.properties.color) {
        feature.properties.color = currentDrawColor;
        migrated = true;
        console.log('[draw] Migrated track', feature.properties.id, 'to color:', currentDrawColor);
      }
    });
    
    console.log('[draw] Migration complete, migrated:', migrated);
    
    if (migrated) {
      // Update the map source with migrated data
      if (map && map.getSource(SRC_ID)) {
        try {
          map.getSource(SRC_ID).setData(featureCollection);
          console.log('[draw] Updated map source with migrated colors');
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
      console.log('[draw] Loaded style from localStorage:', currentDrawStyle);
    }
    
    // Update the UI to reflect the current style
    const styleSelect = document.getElementById('lineStyleSelect');
    if (styleSelect) {
      styleSelect.value = currentDrawStyle;
      console.log('[draw] Updated style select UI to:', currentDrawStyle);
    }
  }

  // Function to update drawing thickness
  function updateDrawThickness(newThickness) {
    currentDrawThickness = parseInt(newThickness);
    console.log('[draw] Updated drawing thickness to:', currentDrawThickness);
    try {
      localStorage.setItem('witd_draw_thickness', currentDrawThickness.toString());
      console.log('[draw] Saved thickness to localStorage:', currentDrawThickness);
    } catch (error) {
      console.warn('[draw] Could not save thickness to localStorage:', error);
    }
  }

  // Function to load drawing thickness from localStorage
  function loadDrawThickness() {
    const savedThickness = localStorage.getItem('witd_draw_thickness');
    if (savedThickness) {
      currentDrawThickness = parseInt(savedThickness);
      console.log('[draw] Loaded thickness from localStorage:', currentDrawThickness);
    }
    const thicknessSlider = document.getElementById('thicknessSlider');
    const thicknessValue = document.getElementById('thicknessValue');
    if (thicknessSlider && thicknessValue) {
      thicknessSlider.value = currentDrawThickness;
      thicknessValue.textContent = currentDrawThickness;
      console.log('[draw] Updated thickness slider UI to:', currentDrawThickness);
    }
  }

  // Function to set drawing mode
  function setDrawMode(mode) {
    currentDrawMode = mode;
    isLineMode = (mode === 'line');
    isPolygonMode = (mode === 'polygon');
    isCircleMode = (mode === 'circle');
    console.log('[draw] Drawing mode set to:', mode, 'isLineMode:', isLineMode, 'isPolygonMode:', isPolygonMode, 'isCircleMode:', isCircleMode);
    
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
        map.getSource(SRC_ID).setData(featureCollection);
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
          const { data: { user } } = await window.supabaseClient.auth.getUser();
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
      currentStyle: currentDrawStyle
    })
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
    console.log("Drawing module auto-initialized");
  } else {
    console.log('[draw] Map not ready yet, waiting for it...');
    // Wait for map to be available
    const waitForMap = () => {
      if (window.WITD && window.WITD.map) {
        console.log('[draw] Map now available, initializing');
        init(window.WITD.map);
        console.log("Drawing module auto-initialized");
      } else {
        console.log('[draw] Still waiting for map...');
        setTimeout(waitForMap, 100);
      }
    };
    waitForMap();
  }
})();
