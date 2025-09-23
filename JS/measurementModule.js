// measurementModule.js - Mapbox GL JS measurement tools
// Handles distance, area, bearing, and elevation measurements

console.log("Module loaded: measurementModule");

(function() {
  let map = null;
  let isMeasuring = false;
  let currentTool = null;
  let measurementPoints = [];
  let currentMeasurement = null;
  let measurementSource = null;
  let measurementLayers = [];
  let layersChecked = false;

  // Measurement settings
  const settings = {
    units: 'metric', // 'metric' or 'imperial'
    precision: 2,
    showMeasurements: true
  };

  // Initialize measurement module
  function init(mapInstance) {
    console.log('[measurement] Initializing with map instance:', mapInstance);
    
    if (map && map === mapInstance) {
      console.log('[measurement] Already initialized with this map instance, skipping...');
      return;
    }
    
    if (map && map !== mapInstance) {
      console.log('[measurement] Cleaning up previous map instance...');
      cleanup();
    }
    
    map = mapInstance;
    
    // Wait for map style to load
    if (map.isStyleLoaded()) {
      setupMeasurementLayers();
    } else {
      map.on('style.load', setupMeasurementLayers);
    }

    // Load settings from localStorage
    loadSettings();
  }

  function setupMeasurementLayers() {
    console.log('[measurement] Setting up measurement layers');
    
    // Create source for measurement data
    if (!map.getSource('measurement-source')) {
      map.addSource('measurement-source', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: []
        }
      });
    }

    // Create layers for different measurement types
    const layers = [
      // Points layer
      {
        id: 'measurement-points',
        type: 'circle',
        source: 'measurement-source',
        filter: ['==', ['get', 'type'], 'point'],
        paint: {
          'circle-radius': 8,
          'circle-color': '#ff4444',
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 3
        }
      },
      // Lines layer for distance
      {
        id: 'measurement-lines',
        type: 'line',
        source: 'measurement-source',
        filter: ['==', ['get', 'type'], 'line'],
        layout: {
          'line-join': 'round',
          'line-cap': 'round'
        },
        paint: {
          'line-color': '#ff4444',
          'line-width': 4,
          'line-dasharray': [2, 1]
        }
      },
      // Labels layer for measurements
      {
        id: 'measurement-labels',
        type: 'symbol',
        source: 'measurement-source',
        filter: ['==', ['get', 'type'], 'label'],
        layout: {
          'text-field': ['get', 'label'],
          'text-font': ['Open Sans Semibold', 'Arial Unicode MS Bold'],
          'text-offset': [0, 1.5],
          'text-anchor': 'top',
          'text-size': 14
        },
        paint: {
          'text-color': '#333333',
          'text-halo-color': '#ffffff',
          'text-halo-width': 3
        }
      }
    ];

    layers.forEach(layer => {
      if (!map.getLayer(layer.id)) {
        map.addLayer(layer);
        measurementLayers.push(layer.id);
      }
    });

    layersChecked = true;

    // Listen for style changes and re-setup layers if needed
    map.on('styledata', () => {
      console.log('[measurement] Style changed, resetting layer check flag...');
      layersChecked = false;
      setTimeout(() => {
        ensureMeasurementLayers();
        // Re-display current measurement if we have one
        if (measurementPoints.length > 0) {
          updateDistanceMeasurement();
        }
      }, 100);
    });

    console.log('[measurement] Measurement layers setup complete');
  }

  function ensureMeasurementLayers() {
    console.log('[measurement] Ensuring measurement layers exist');
    
    // Check if source exists, if not create it
    if (!map.getSource('measurement-source')) {
      console.log('[measurement] Creating measurement source');
      map.addSource('measurement-source', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: []
        }
      });
    }

    // Check if layers exist and create only missing ones
    const layerIds = ['measurement-points', 'measurement-lines', 'measurement-labels'];
    layerIds.forEach(layerId => {
      if (!map.getLayer(layerId)) {
        console.log(`[measurement] Creating layer: ${layerId}`);
        const layerConfig = getLayerConfig(layerId);
        if (layerConfig) {
          map.addLayer(layerConfig);
          if (!measurementLayers.includes(layerId)) {
            measurementLayers.push(layerId);
          }
        }
      }
    });
    
    layersChecked = true;
  }

  function getLayerConfig(layerId) {
    const configs = {
      'measurement-points': {
        id: 'measurement-points',
        type: 'circle',
        source: 'measurement-source',
        filter: ['==', ['get', 'type'], 'point'],
        paint: {
          'circle-radius': 8,
          'circle-color': '#ff4444',
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 3
        }
      },
      'measurement-lines': {
        id: 'measurement-lines',
        type: 'line',
        source: 'measurement-source',
        filter: ['==', ['get', 'type'], 'line'],
        layout: {
          'line-join': 'round',
          'line-cap': 'round'
        },
        paint: {
          'line-color': '#ff4444',
          'line-width': 4,
          'line-dasharray': [2, 1]
        }
      },
      'measurement-labels': {
        id: 'measurement-labels',
        type: 'symbol',
        source: 'measurement-source',
        filter: ['==', ['get', 'type'], 'label'],
        layout: {
          'text-field': ['get', 'label'],
          'text-font': ['Open Sans Semibold', 'Arial Unicode MS Bold'],
          'text-offset': [0, 1.5],
          'text-anchor': 'top',
          'text-size': 14
        },
        paint: {
          'text-color': '#333333',
          'text-halo-color': '#ffffff',
          'text-halo-width': 3
        }
      }
    };
    return configs[layerId];
  }

  function cleanup() {
    if (map) {
      // Remove measurement layers
      measurementLayers.forEach(layerId => {
        if (map.getLayer(layerId)) {
          map.removeLayer(layerId);
        }
      });
      
      // Remove measurement source
      if (map.getSource('measurement-source')) {
        map.removeSource('measurement-source');
      }
      
      // Remove event listeners
      map.off('click', onMapClick);
      map.off('mousemove', onMouseMove);
      
      measurementLayers = [];
      measurementPoints = [];
      isMeasuring = false;
      currentTool = null;
    }
  }

  // Distance measurement functions
  function startDistanceMeasurement() {
    console.log('[measurement] Starting distance measurement');
    
    // Check if map is ready
    if (!map || !map.isStyleLoaded()) {
      console.log('[measurement] Map not ready, waiting...');
      map.on('styleload', () => {
        console.log('[measurement] Map style loaded, starting measurement');
        startDistanceMeasurement();
      });
      return;
    }
    
    if (currentTool === 'distance') {
      stopMeasurement();
      return;
    }
    
    stopMeasurement();
    currentTool = 'distance';
    isMeasuring = true;
    measurementPoints = [];
    
    // Ensure layers are ready for this measurement
    ensureMeasurementLayers();
    
    // Change cursor
    map.getCanvas().style.cursor = 'crosshair';
    
    // Add click listener
    map.on('click', onMapClick);
    map.on('mousemove', onMouseMove);
    
    console.log('[measurement] Distance measurement active - click to place start and end points');
  }

  function onMapClick(e) {
    if (!isMeasuring || currentTool !== 'distance') return;
    
    console.log('[measurement] Map clicked at:', e.lngLat);
    
    // Add point to measurement
    measurementPoints.push([e.lngLat.lng, e.lngLat.lat]);
    
    updateDistanceMeasurement();
    
    // Auto-exit after 2 points for distance measurement
    if (measurementPoints.length >= 2) {
      console.log('[measurement] Distance measurement complete - auto-exiting');
      stopMeasurement();
    }
  }

  function onMouseMove(e) {
    if (!isMeasuring || currentTool !== 'distance' || measurementPoints.length !== 1) return;
    
    // Only show temporary line when we have exactly 1 point (waiting for second point)
    updateDistanceMeasurement(e.lngLat);
  }

  function updateDistanceMeasurement(mousePos = null) {
    const features = [];
    
    // Add measurement points
    measurementPoints.forEach((point, index) => {
      features.push({
        type: 'Feature',
        properties: {
          type: 'point',
          index: index
        },
        geometry: {
          type: 'Point',
          coordinates: point
        }
      });
    });
    
    // Add measurement lines
    if (measurementPoints.length > 1) {
      // Main line through all points
      features.push({
        type: 'Feature',
        properties: {
          type: 'line'
        },
        geometry: {
          type: 'LineString',
          coordinates: measurementPoints
        }
      });
      
      // Add distance labels
      for (let i = 0; i < measurementPoints.length - 1; i++) {
        const start = measurementPoints[i];
        const end = measurementPoints[i + 1];
        const distance = calculateDistance(start, end);
        
        // Calculate midpoint for label position
        const midPoint = [
          (start[0] + end[0]) / 2,
          (start[1] + end[1]) / 2
        ];
        
        features.push({
          type: 'Feature',
          properties: {
            type: 'label',
            label: formatDistance(distance)
          },
          geometry: {
            type: 'Point',
            coordinates: midPoint
          }
        });
      }
    }
    
    // Add temporary line to mouse position (only when we have exactly 1 point)
    if (mousePos && measurementPoints.length === 1) {
      const tempLine = [...measurementPoints, [mousePos.lng, mousePos.lat]];
      features.push({
        type: 'Feature',
        properties: {
          type: 'line',
          temporary: true
        },
        geometry: {
          type: 'LineString',
          coordinates: tempLine
        }
      });
    }
    
    // Update source data
    const source = map.getSource('measurement-source');
    if (source) {
      source.setData({
        type: 'FeatureCollection',
        features: features
      });
      console.log(`[measurement] Updated measurement data with ${features.length} features`);
    } else {
      console.warn('[measurement] Measurement source not found, recreating...');
      ensureMeasurementLayers();
      // Try again after recreating
      setTimeout(() => {
        const newSource = map.getSource('measurement-source');
        if (newSource) {
          newSource.setData({
            type: 'FeatureCollection',
            features: features
          });
          console.log(`[measurement] Updated measurement data after recreation with ${features.length} features`);
        }
      }, 50);
    }
  }

  function calculateDistance(point1, point2) {
    const R = 6371000; // Earth's radius in meters
    const dLat = (point2[1] - point1[1]) * Math.PI / 180;
    const dLon = (point2[0] - point1[0]) * Math.PI / 180;
    const lat1 = point1[1] * Math.PI / 180;
    const lat2 = point2[1] * Math.PI / 180;
    
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.sin(dLon/2) * Math.sin(dLon/2) * Math.cos(lat1) * Math.cos(lat2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    
    return R * c; // Distance in meters
  }

  function formatDistance(distance) {
    if (settings.units === 'imperial') {
      const miles = distance * 0.000621371;
      if (miles < 0.1) {
        const feet = distance * 3.28084;
        return `${feet.toFixed(settings.precision)} ft`;
      } else {
        return `${miles.toFixed(settings.precision)} mi`;
      }
    } else {
      if (distance < 1000) {
        return `${distance.toFixed(settings.precision)} m`;
      } else {
        const km = distance / 1000;
        return `${km.toFixed(settings.precision)} km`;
      }
    }
  }

  function stopMeasurement() {
    console.log('[measurement] Stopping measurement');
    
    isMeasuring = false;
    currentTool = null;
    
    // Don't clear measurementPoints - keep the final measurement visible
    // measurementPoints = [];
    
    // Reset cursor
    map.getCanvas().style.cursor = '';
    
    // Remove event listeners
    map.off('click', onMapClick);
    map.off('mousemove', onMouseMove);
    
    // Keep the final measurement visible - don't clear the data
    // The measurement will remain on the map until cleared explicitly
  }

  function clearAllMeasurements() {
    console.log('[measurement] Clearing all measurements');
    
    isMeasuring = false;
    currentTool = null;
    measurementPoints = [];
    
    // Reset cursor
    map.getCanvas().style.cursor = '';
    
    // Remove event listeners
    map.off('click', onMapClick);
    map.off('mousemove', onMouseMove);
    
    // Clear the measurement data
    if (map.getSource('measurement-source')) {
      map.getSource('measurement-source').setData({
        type: 'FeatureCollection',
        features: []
      });
    }
  }

  function updateSettings(newSettings) {
    Object.assign(settings, newSettings);
    saveSettings();
    
    // Refresh current measurements if any
    if (measurementPoints.length > 0 && currentTool === 'distance') {
      updateDistanceMeasurement();
    }
  }

  function loadSettings() {
    const saved = localStorage.getItem('measurement-settings');
    if (saved) {
      try {
        Object.assign(settings, JSON.parse(saved));
        console.log('[measurement] Settings loaded:', settings);
      } catch (e) {
        console.warn('[measurement] Failed to load settings:', e);
      }
    }
  }

  function saveSettings() {
    localStorage.setItem('measurement-settings', JSON.stringify(settings));
  }

  // Public API
  window.WITD = window.WITD || {};
  window.WITD.measurement = {
    init: init,
    startDistance: startDistanceMeasurement,
    stop: stopMeasurement,
    clear: clearAllMeasurements,
    updateSettings: updateSettings,
    getSettings: () => ({ ...settings }),
    isActive: () => isMeasuring,
    getCurrentTool: () => currentTool
  };

  // Initialize when map is ready
  const checkMapReady = setInterval(() => {
    if (window.WITD && window.WITD.map) {
      clearInterval(checkMapReady);
      init(window.WITD.map);
    }
  }, 100);

})();
