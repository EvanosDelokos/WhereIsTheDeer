console.log("Module loaded: layerManager (Mapbox GL JS)");

document.addEventListener("DOMContentLoaded", () => {
  // Wait for map to be initialized
  const waitForMap = () => {
    if (window.WITD && window.WITD.map) {
      initializeLayerManager();
    } else {
      setTimeout(waitForMap, 100);
    }
  };
  
  waitForMap();
});

function initializeLayerManager() {
  const map = window.WITD.map;
  
  if (!map) {
    console.warn("Map not available for layer manager");
    return;
  }

  // --- Base layer styles ---
  const baseLayers = {
    terrain: 'mapbox://styles/mapbox/outdoors-v12', // Outdoor terrain with natural colors
    satellite: 'mapbox://styles/mapbox/satellite-streets-v12', // Satellite with streets and labels
    contours: 'mapbox://styles/mapbox/light-v11', // Clean light style for contour lines
    hybrid: 'mapbox://styles/mapbox/satellite-streets-v12' // Satellite with streets and labels for hybrid
  };

  // Store base layers for external access
  window.WITD.baseLayers = baseLayers;
  window.WITD.activeSpeciesLayer = null;

  console.log("Layer Manager ready: Mapbox styles configured.");

  // Set default active layer (Terrain)
  const layerButtons = document.querySelectorAll('button[data-layer]');
  layerButtons.forEach(btn => {
    btn.classList.remove('active');
    if (btn.getAttribute('data-layer').toLowerCase() === 'terrain') {
      btn.classList.add('active');
    }
  });

  // Add terrain source and layer for contours if needed
  map.once('style.load', () => {
    // Add terrain source for contours
    if (!map.getSource('mapbox-terrain')) {
      map.addSource('mapbox-terrain', {
        type: 'raster-dem',
        url: 'mapbox://mapbox.terrain-rgb'
      });
    }
  });
}

// --- Base layer switch function ---
window.switchBaseLayer = function(name) {
  const map = window.WITD?.map;
  if (!map) {
    console.warn("Map not available for layer switching");
    return;
  }

  const layers = window.WITD?.baseLayers;
  if (!layers) {
    console.warn("Base layers not configured");
    return;
  }

  const layerName = name.toLowerCase();
  const newStyle = layers[layerName];

  if (newStyle) {
    console.log(`Switching to ${name} layer:`, newStyle);
    
    // Update button active states
    const layerButtons = document.querySelectorAll('button[data-layer]');
    layerButtons.forEach(btn => {
      btn.classList.remove('active');
      if (btn.getAttribute('data-layer').toLowerCase() === layerName) {
        btn.classList.add('active');
      }
    });
    
    // Store current view state
    const currentCenter = map.getCenter();
    const currentZoom = map.getZoom();
    const currentPitch = map.getPitch();
    const currentBearing = map.getBearing();

    // Switch style
    map.setStyle(newStyle);

    // Restore view state after style loads
    map.once('style.load', () => {
      map.setCenter(currentCenter);
      map.setZoom(currentZoom);
      map.setPitch(currentPitch);
      map.setBearing(currentBearing);
      
      // Restore user tracks after style switch
      restoreUserTracksAfterStyleSwitch();
      
      // Add contour functionality when switching to contours layer
      if (layerName === 'contours') {
        // Add terrain source
        if (!map.getSource('mapbox-terrain')) {
          map.addSource('mapbox-terrain', {
            type: 'raster-dem',
            url: 'mapbox://mapbox.terrain-rgb'
          });
        }
        
        // Add vector source for contours
        if (!map.getSource('terrain-data')) {
          map.addSource('terrain-data', {
            type: 'vector',
            url: 'mapbox://mapbox.mapbox-terrain-v2'
          });
        }
        
        // Add minor contour lines (every 20m, thin grey)
        if (!map.getLayer('contours-minor')) {
          map.addLayer({
            id: 'contours-minor',
            type: 'line',
            source: 'terrain-data',
            'source-layer': 'contour',
            filter: ['!=', ['%', ['get', 'ele'], 100], 0],
            paint: {
              'line-color': '#888888',
              'line-width': 1
            }
          });
        }
        
        // Add major contour lines (every 100m, thicker, dark)
        if (!map.getLayer('contours-major')) {
          map.addLayer({
            id: 'contours-major',
            type: 'line',
            source: 'terrain-data',
            'source-layer': 'contour',
            filter: ['==', ['%', ['get', 'ele'], 100], 0],
            paint: {
              'line-color': '#333333',
              'line-width': 1.5
            }
          });
        }
        
        // Add elevation labels
        if (!map.getLayer('contour-labels-100m')) {
          map.addLayer({
            id: 'contour-labels-100m',
            type: 'symbol',
            source: 'terrain-data',
            'source-layer': 'contour',
            filter: ['==', ['%', ['get', 'ele'], 100], 0],
            minzoom: 10,
            layout: {
              'symbol-placement': 'line',
              'symbol-spacing': 400,
              'text-field': ['concat', ['get', 'ele'], ' m'],
              'text-size': 11,
              'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold']
            },
            paint: {
              'text-color': '#333333',
              'text-halo-color': '#ffffff',
              'text-halo-width': 1
            }
          });
        }
      }
      
      // Handle hybrid layer - add DEM and contour sources
      if (layerName === 'hybrid') {
        // Add raster-dem source for terrain
        if (!map.getSource('mapbox-dem')) {
          map.addSource('mapbox-dem', {
            type: 'raster-dem',
            url: 'mapbox://mapbox.terrain-rgb',
            tileSize: 512,
            maxzoom: 14
          });
        }
        
        // Set terrain with exaggeration
        map.setTerrain({ source: 'mapbox-dem', exaggeration: 1.2 });
        
        // Add vector source for contours
        if (!map.getSource('terrain-data')) {
          map.addSource('terrain-data', {
            type: 'vector',
            url: 'mapbox://mapbox.mapbox-terrain-v2'
          });
        }
        
        // Add minor contour lines (every 20m, thin grey)
        if (!map.getLayer('contours-minor')) {
          map.addLayer({
            id: 'contours-minor',
            type: 'line',
            source: 'terrain-data',
            'source-layer': 'contour',
            filter: ['!=', ['%', ['get', 'ele'], 100], 0],
            paint: {
              'line-color': '#888888',
              'line-width': 1
            }
          });
        }
        
        // Add major contour lines (every 100m, thicker, white)
        if (!map.getLayer('contours-major')) {
          map.addLayer({
            id: 'contours-major',
            type: 'line',
            source: 'terrain-data',
            'source-layer': 'contour',
            filter: ['==', ['%', ['get', 'ele'], 100], 0],
            paint: {
              'line-color': '#ffffff',
              'line-width': 1.5
            }
          });
        }
        
        // Add 100m labels (always visible, zoom >= 10)
        if (!map.getLayer('contour-labels-100m')) {
          map.addLayer({
            id: 'contour-labels-100m',
            type: 'symbol',
            source: 'terrain-data',
            'source-layer': 'contour',
            filter: ['==', ['%', ['get', 'ele'], 100], 0],
            minzoom: 10,
            layout: {
              'symbol-placement': 'line',
              'symbol-spacing': 400,
              'text-field': ['concat', ['get', 'ele'], ' m'],
              'text-size': 11,
              'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold']
            },
            paint: {
              'text-color': '#ffffff',
              'text-halo-color': '#000000',
              'text-halo-width': 1.5
            }
          });
        }
        
        // Add 50m labels (only visible zoom >= 13)
        if (!map.getLayer('contour-labels-50m')) {
          map.addLayer({
            id: 'contour-labels-50m',
            type: 'symbol',
            source: 'terrain-data',
            'source-layer': 'contour',
            filter: ['==', ['%', ['get', 'ele'], 50], 0],
            minzoom: 13,
            layout: {
              'symbol-placement': 'line',
              'symbol-spacing': 600,
              'text-field': ['concat', ['get', 'ele'], ' m'],
              'text-size': 10,
              'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular']
            },
            paint: {
              'text-color': '#ffffff',
              'text-halo-color': '#000000',
              'text-halo-width': 2
            }
          });
        }
      }
      
      // Remove contour layers when switching to non-contour layers
      if (layerName !== 'contours' && layerName !== 'hybrid') {
        const contourLayers = ['contours-minor', 'contours-major', 'contour-labels-100m', 'contour-labels-50m'];
        contourLayers.forEach(layerId => {
          if (map.getLayer(layerId)) {
            map.removeLayer(layerId);
          }
        });
      }
      
      console.log(`Successfully switched to ${name} layer`);
    });
  } else {
    console.warn(`Base layer "${name}" not found. Available layers:`, Object.keys(layers));
  }
};

// Function to restore user tracks after style switch
function restoreUserTracksAfterStyleSwitch() {
  console.log('[LayerManager] Restoring user tracks after style switch...');
  
  // Restore draw tracks if draw module is available
  if (window.WITD && window.WITD.draw && typeof window.WITD.draw.restoreAfterStyleSwitch === 'function') {
    console.log('[LayerManager] Restoring draw tracks...');
    window.WITD.draw.restoreAfterStyleSwitch();
  }
  
  // Wait a moment before restoring GPX tracks to prevent conflicts
  setTimeout(() => {
    // Restore GPX tracks if GPX manager is available
    if (typeof window.restoreGPXTracksAfterStyleSwitch === 'function') {
      console.log('[LayerManager] Restoring GPX tracks...');
      window.restoreGPXTracksAfterStyleSwitch();
    }
  }, 500);
  
  // Note: Saved tracks are handled by the draw module's restore function
  // since they are part of the drawn tracks feature collection
  
  console.log('[LayerManager] User tracks restoration complete');
}