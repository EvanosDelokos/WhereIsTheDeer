console.log("Module loaded: layerManager (Mapbox GL JS)");

let windInstance = null;
let WindModalClass = null;

function userHasWindAccess() {
  const plan = window.userPlan || window.currentUserPlan;
  return plan === 'premium';
}

function showWindUpgradeMessage() {
  if (typeof window.showUpgradeMessage === 'function') {
    window.showUpgradeMessage();
    return;
  }

  console.warn('showUpgradeMessage() not found; using fallback alert');
  window.alert('Wind overlay is a Premium feature. Upgrade to unlock it.');
}

async function ensurePlanLoadedForWind() {
  const existingPlan = window.userPlan || window.currentUserPlan;
  if (typeof existingPlan !== 'undefined' && existingPlan !== null) {
    return existingPlan;
  }

  if (typeof window.fetchUserPlan === 'function') {
    try {
      const fetchedPlan = await window.fetchUserPlan();
      if (typeof fetchedPlan !== 'undefined' && fetchedPlan !== null) {
        window.userPlan = fetchedPlan;
        window.currentUserPlan = fetchedPlan;
        return fetchedPlan;
      }
    } catch (error) {
      console.warn('[Wind] Failed to fetch user plan before gating wind:', error);
    }
  }

  return window.userPlan || window.currentUserPlan || null;
}

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
    satellite: 'mapbox://styles/mapbox/standard-satellite', // High-resolution satellite imagery
    contours: 'mapbox://styles/mapbox/light-v11', // Clean light style for contour lines
    hybrid: 'mapbox://styles/mapbox/standard-satellite' // High-resolution satellite for hybrid view
  };

  // Store base layers for external access
  window.WITD.baseLayers = baseLayers;
  window.WITD.activeSpeciesLayer = null;

  console.log("Layer Manager ready: Mapbox styles configured.");
  console.log("Available base layers:", window.WITD.baseLayers);

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
    window.safeAddToMap(map, () => {
      // Add terrain source for contours
      if (!map.getSource('mapbox-terrain')) {
        map.addSource('mapbox-terrain', {
          type: 'raster-dem',
          url: 'mapbox://mapbox.terrain-rgb'
        });
      }
    });
  });

  hookWindButtons(map);
}

async function enableWind(map) {
  if (!window.planLoaded) {
    console.warn('[Wind] Blocked: plan not loaded yet');
    return;
  }

  if (windInstance) return;

  if (!userHasWindAccess()) {
    console.log('[Security] Wind overlay blocked for free user');
    showWindUpgradeMessage();
    return;
  }

  const targetMap = map || window.WITD?.map;
  if (!targetMap) {
    console.warn('Map not available for wind overlay');
    return;
  }

  const LoadedWindModal = await loadWindModalClass();
  if (!LoadedWindModal) {
    console.error('Wind overlay unavailable: failed to load WindModal.js');
    return;
  }

  windInstance = new LoadedWindModal(targetMap);
  try {
    await windInstance.init();
    console.log('Wind overlay enabled');
  } catch (error) {
    console.error('Failed to enable wind overlay:', error);
    windInstance.destroy?.();
    windInstance = null;
  }
}

async function loadWindModalClass() {
  if (WindModalClass) return WindModalClass;

  try {
    const module = await import('/JS/WindModal.js');
    WindModalClass = module.WindModal;
    return WindModalClass;
  } catch (error) {
    console.error('Failed to dynamically import WindModal module:', error);
    return null;
  }
}

function disableWind() {
  if (!windInstance) return;
  windInstance.destroy();
  windInstance = null;
  console.log('Wind overlay disabled');
}

function hookWindButtons(map) {
  const layersDropdown = document.getElementById('layersDropdown');
  if (!layersDropdown || layersDropdown.dataset.windBound) return;

  // Delegate events from the stable popup container so button clone/replace
  // operations in map.html do not remove wind ON/OFF behavior.
  layersDropdown.addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (!button) return;

    if (button.id === 'windOnBtn') {
      enableWind(map);
    } else if (button.id === 'windOffBtn') {
      disableWind();
    }
  });

  layersDropdown.dataset.windBound = 'true';
}

window.enableWind = () => enableWind(window.WITD?.map);
window.disableWind = disableWind;

let rehydrateAfterStyleSwitchPending = false;

function scheduleRehydrateAfterStyleSwitch(map) {
  if (rehydrateAfterStyleSwitchPending) {
    return;
  }
  rehydrateAfterStyleSwitchPending = true;

  map.once('idle', () => {
    rehydrateAfterStyleSwitchPending = false;
    console.log("♻️ Rehydrating map layers after style switch...");
    if (typeof window.rehydrateMapLayers === 'function') {
      window.rehydrateMapLayers();
    }
    restoreUserTracksAfterStyleSwitch();
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

    // Clean up user-created sources before switching styles to prevent conflicts
    const userSources = ['freehand-draw', 'measurement-source'];
    userSources.forEach(sourceId => {
      if (map.getSource(sourceId)) {
        try {
          // Remove layers that use this source first
          const style = map.getStyle();
          if (style && style.layers) {
            style.layers.forEach(layer => {
              if (layer.source === sourceId) {
                if (map.getLayer(layer.id)) {
                  map.removeLayer(layer.id);
                }
              }
            });
          }
          // Then remove the source
          map.removeSource(sourceId);
          console.log(`Cleaned up source: ${sourceId}`);
        } catch (error) {
          console.log(`Source ${sourceId} already removed or not found`);
        }
      }
    });

    // Switch style
    map.setStyle(newStyle);

    // Restore view state after style loads
    map.once('style.load', () => {
      console.log(`Style loaded for ${name} layer. Current style:`, map.getStyle());
      console.log(`Style sources:`, Object.keys(map.getStyle().sources || {}));
      
      map.setCenter(currentCenter);
      map.setZoom(currentZoom);
      map.setPitch(currentPitch);
      map.setBearing(currentBearing);
      
      // Add contour functionality when switching to contours layer
      if (layerName === 'contours') {
        window.safeAddToMap(map, () => {
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
        });
      }
      
      // Handle hybrid layer - add DEM and contour sources
      if (layerName === 'hybrid') {
        window.safeAddToMap(map, () => {
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
        });
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

    scheduleRehydrateAfterStyleSwitch(map);
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
  
  // Wait a bit longer before restoring walking tracks to prevent conflicts
  setTimeout(() => {
    // Restore walking tracks if tracking module is available
    if (window.WITD && window.WITD.tracking && typeof window.WITD.tracking.restoreTracksAfterStyleSwitch === 'function') {
      console.log('[LayerManager] Restoring walking tracks...');
      window.WITD.tracking.restoreTracksAfterStyleSwitch();
    }
  }, 1000);
  
  // Note: Saved tracks are handled by the draw module's restore function
  // since they are part of the drawn tracks feature collection
  
  console.log('[LayerManager] User tracks restoration complete');
}

window.rehydrateMapLayers = function() {
  console.log("♻️ Rehydrating map layers...");

  if (typeof window.loadZonesLayer === "function") {
    window.loadZonesLayer();
  }

  if (typeof window.loadClosedLayer === "function") {
    console.log("Reloading closed layer...");
    window.loadClosedLayer();
  }

  const speciesToApply = window.currentSpecies || "OFF";
  if (typeof window.switchSpeciesLayer === "function" && speciesToApply !== "OFF") {
    console.log("Reapplying species:", speciesToApply);
    window.switchSpeciesLayer(speciesToApply);
  }
};

// Global function to force refresh map tiles (useful for clearing cached imagery)
window.refreshMapTiles = function() {
  const map = window.WITD?.map;
  if (!map) {
    console.warn("Map not available for tile refresh");
    return;
  }
  
  console.log("Forcing map tile refresh...");
  
  // Force reload of all sources
  const style = map.getStyle();
  if (style && style.sources) {
    Object.keys(style.sources).forEach(sourceId => {
      const source = map.getSource(sourceId);
      if (source && source.refresh) {
        // For raster sources, force a refresh
        console.log(`Refreshing source: ${sourceId}`);
        source.refresh();
      }
    });
  }
  
  // Force a repaint
  map.triggerRepaint();
  
  console.log("Map tiles refresh complete");
};

// Global function to clear map cache and reload
window.clearMapCache = function() {
  const map = window.WITD?.map;
  if (!map) {
    console.warn("Map not available for cache clear");
    return;
  }
  
  console.log("Clearing map cache...");
  
  // Force reload the current style
  const currentStyle = map.getStyle();
  if (currentStyle && currentStyle.name) {
    map.setStyle(currentStyle.name);
    scheduleRehydrateAfterStyleSwitch(map);
    console.log("Map style reloaded");
  }
};