// Map engine module loaded

const safeAddQueueByMap = new WeakMap();
let styleCycleId = 0;
const MAP_ENGINE_DEBUG = false;
const medbg = (...args) => {
  if (MAP_ENGINE_DEBUG) console.log(...args);
};

function safeAddToMap(map, callback) {
  if (map.isStyleLoaded()) {
    try {
      callback();
    } catch (error) {
      console.error('safeAddToMap callback failed:', error);
    }
    return;
  }

  let state = safeAddQueueByMap.get(map);
  if (!state) {
    state = { queue: [], waiting: false };
    safeAddQueueByMap.set(map, state);
  }

  state.queue.push(callback);

  if (state.waiting) {
    return;
  }

  state.waiting = true;
  medbg("⏳ Waiting for map style before executing queued callbacks...");

  const flushWhenReady = () => {
    if (!map.isStyleLoaded()) {
      map.once('style.load', flushWhenReady);
      return;
    }
    map.once('idle', () => {
      state.waiting = false;
      const queued = state.queue.splice(0);
      queued.forEach((cb) => {
        try {
          cb();
        } catch (error) {
          console.error('safeAddToMap callback failed:', error);
        }
      });
    });
  };

  map.once('style.load', flushWhenReady);
}

window.safeAddToMap = safeAddToMap;

window.ensureSource = function(map, id, sourceDef) {
  const existing = map.getSource(id);
  if (existing) {
    if (sourceDef?.type === 'geojson' && sourceDef.data && typeof existing.setData === 'function') {
      existing.setData(sourceDef.data);
    }
    return existing;
  }
  try {
    map.addSource(id, sourceDef);
    return map.getSource(id);
  } catch (error) {
    const isDuplicate = String(error?.message || '').includes(`already a source with ID "${id}"`);
    if (!isDuplicate) {
      throw error;
    }
    const racedSource = map.getSource(id);
    if (racedSource && sourceDef?.type === 'geojson' && sourceDef.data && typeof racedSource.setData === 'function') {
      racedSource.setData(sourceDef.data);
    }
    return racedSource;
  }
};

window.ensureLayer = function(map, layerDef, beforeId = null) {
  if (map.getLayer(layerDef.id)) {
    return;
  }
  if (beforeId && map.getLayer(beforeId)) {
    map.addLayer(layerDef, beforeId);
  } else {
    map.addLayer(layerDef);
  }
};

// Utility function to safely add sources and layers
window.safeMapOperation = function(operation, retryDelay = 100) {
  if (!window.WITD?.map) {
    console.warn('Map not available for safe operation');
    return false;
  }
  
  const map = window.WITD.map;
  
  if (map.isStyleLoaded()) {
    try {
      operation();
      return true;
    } catch (error) {
      console.error('Map operation failed:', error);
      
      // Check if it's a duplicate source/layer error
      if (error.message && error.message.includes('already a source with ID')) {
        // Source already exists, skipping operation
        return true; // Don't retry for duplicate source errors
      }
      
      return false;
    }
  } else {
    // Map style not loaded, waiting
    map.once('load', () => {
      // Map style now loaded, retrying operation
      setTimeout(() => {
        if (map.isStyleLoaded()) {
          try {
            operation();
          } catch (error) {
            console.error('Map operation failed on retry:', error);
            
            // Check if it's a duplicate source/layer error
            if (error.message && error.message.includes('already a source with ID')) {
              // Source already exists on retry, skipping operation
              return; // Don't retry for duplicate source errors
            }
          }
        }
      }, retryDelay);
    });
    return false;
  }
};

document.addEventListener("DOMContentLoaded", () => {
  // Check if Mapbox token is configured
  if (typeof MAPBOX_TOKEN === 'undefined' || MAPBOX_TOKEN === 'YOUR_MAPBOX_TOKEN_HERE') {
    console.error('❌ Please configure your Mapbox token in map.html');
    document.getElementById('map').innerHTML = `
      <div style="display: flex; align-items: center; justify-content: center; height: 100%; background: #f0f0f0; color: #666; font-family: Arial, sans-serif;">
        <div style="text-align: center; padding: 20px;">
          <h3>🗺️ Mapbox Token Required</h3>
          <p>Please replace 'YOUR_MAPBOX_TOKEN_HERE' in map.html with your actual Mapbox token.</p>
          <p><a href="https://account.mapbox.com/access-tokens/" target="_blank">Get your token here</a></p>
        </div>
      </div>
    `;
    return;
  }

  // Define default center and zoom (Melbourne CBD, Australia)
  // Note: Mapbox uses [longitude, latitude] format
  const DEFAULT_CENTER = [144.9631, -37.8136];
  const DEFAULT_ZOOM = 7;

  // Set Mapbox token
  mapboxgl.accessToken = MAPBOX_TOKEN;

  // Initialize Mapbox map
  const map = new mapboxgl.Map({
    container: 'map',
    style: 'mapbox://styles/mapbox/outdoors-v12', // Terrain view to match default button state
    center: DEFAULT_CENTER,
    zoom: DEFAULT_ZOOM,
    pitch: 0,
    bearing: 0,
    antialias: true,
    pixelRatio: window.devicePixelRatio || 1, // Use device pixel ratio for crisp rendering
    renderWorldCopies: false // Prevent duplicate world rendering
  });

  // Add navigation controls (zoom, compass, pitch)
  map.addControl(new mapboxgl.NavigationControl(), 'top-right');

  // Add scale control
  map.addControl(new mapboxgl.ScaleControl({
    maxWidth: 100,
    unit: 'metric'
  }), 'bottom-right');

  // Add fullscreen control
  map.addControl(new mapboxgl.FullscreenControl(), 'top-right');

  // Add geolocate control (hidden, controlled by GPS button)
  const geolocateControl = new mapboxgl.GeolocateControl({
    positionOptions: {
      enableHighAccuracy: true
    },
    trackUserLocation: false, // Don't continuously track - only locate once
    showUserHeading: true,
    showAccuracyCircle: true,
    fitBoundsOptions: {
      maxZoom: 15 // Zoom to level 15 when location is found
    }
  });
  map.addControl(geolocateControl, 'top-right');
  
  // Hide the default geolocate button (we use custom GPS button)
  const geolocateBtn = document.querySelector('.mapboxgl-ctrl-geolocate');
  if (geolocateBtn) {
    geolocateBtn.style.display = 'none';
  }
  
  // Log when location is found
  geolocateControl.on('geolocate', (position) => {
    medbg('[GPS] Location found:', position.coords.latitude, position.coords.longitude);
  });
  
  // Handle GPS errors
  geolocateControl.on('error', (error) => {
    console.error('[GPS] Geolocation error:', error);
    alert('Unable to access your location. Please enable location services in your browser.');
  });
  
  // Hook up custom GPS button
  setTimeout(() => {
    const gpsButton = document.getElementById('gps-button');
    if (gpsButton) {
      gpsButton.addEventListener('click', () => {
        medbg('[GPS] GPS button clicked');
        geolocateControl.trigger();
      });
      medbg('[GPS] GPS button listener attached');
    } else {
      console.warn('[GPS] GPS button not found');
    }
  }, 100);

  // Reposition Mapbox controls after map loads
  map.on('load', () => {
    // Function to reposition controls
    const repositionControls = () => {
      // Move attribution control up
      const attributionControl = document.querySelector('.mapboxgl-ctrl-attrib');
      if (attributionControl) {
        attributionControl.style.bottom = '70px';
        attributionControl.style.marginBottom = '0';
        attributionControl.style.zIndex = '5000';
        medbg('Attribution control repositioned');
      }
      
      // Move scale control up
      const scaleControl = document.querySelector('.mapboxgl-ctrl-scale');
      if (scaleControl) {
        scaleControl.style.bottom = '100px';
        scaleControl.style.marginBottom = '0';
        scaleControl.style.zIndex = '5000';
        medbg('Scale control repositioned');
      }
    };
    
    // Try immediately
    repositionControls();
    
    // Also try after a delay in case controls are added later
    setTimeout(repositionControls, 100);
    setTimeout(repositionControls, 500);
    setTimeout(repositionControls, 1000);
  });

  // Add map click listener to close all popups
  map.on('click', (e) => {
    // Only close popups if clicking on the map itself, not on controls or popups
    if (e.originalEvent && e.originalEvent.target === map.getCanvas()) {
      // Check if closeAllDropdownsAndModals function exists and call it
      if (typeof window.closeAllDropdownsAndModals === 'function') {
        window.closeAllDropdownsAndModals();
      }
    }
  });

  // GPX label visibility based on zoom level
  map.on('zoomend', () => {
    const hide = map.getZoom() < 12;
    document.querySelectorAll('.gpx-label, .track-label')
      .forEach(el => el.style.display = hide ? 'none' : '');
  });

  // Custom 2D/3D Toggle Control
  class ViewModeControl {
    constructor() {
      this.is3D = false;
      this.map = null;
    }

    onAdd(map) {
      this.map = map;
      this.container = document.createElement('div');
      this.container.className = 'mapboxgl-ctrl mapboxgl-ctrl-group';
      this.container.style.marginTop = '10px';
      
      this.button = document.createElement('button');
      this.button.className = 'mapboxgl-ctrl-icon';
      this.button.type = 'button';
      this.button.style.cssText = `
        width: 30px;
        height: 30px;
        background: white;
        border: 1px solid #ccc;
        border-radius: 4px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 16px;
        transition: all 0.2s ease;
      `;
      this.button.innerHTML = '🛩️';
      this.button.title = 'Toggle 2D/3D View (Premium)';
      
      // Style button based on user plan (with delay to ensure user plan is loaded)
      setTimeout(() => {
        this.updateButtonStyle();
      }, 100);
      
      this.button.addEventListener('click', () => this.toggleView());
      this.container.appendChild(this.button);
      
      return this.container;
    }

    toggleView() {
      // Check if user is premium before allowing 2D/3D toggle
      medbg('[Debug] 2D/3D toggle clicked - currentUserPlan:', window.currentUserPlan);
      medbg('[Debug] loggedInUser:', window.loggedInUser?.email);
      medbg('[Debug] typeof currentUserPlan:', typeof window.currentUserPlan);
      
      // If user plan is not loaded yet, try to fetch it
      if (typeof window.currentUserPlan === 'undefined' || window.currentUserPlan === null) {
        medbg('[Debug] User plan not loaded, attempting to fetch...');
        if (typeof window.fetchUserPlan === 'function') {
          window.fetchUserPlan();
        }
        // Wait a bit and check again
        setTimeout(() => {
          medbg('[Debug] After fetch attempt - currentUserPlan:', window.currentUserPlan);
          this.updateButtonStyle(); // Update button style after plan is fetched
          if (window.currentUserPlan === 'premium') {
            this.performToggle();
          } else {
            medbg('[Security] 2D/3D toggle blocked for free user (after fetch)');
            this.showUpgradeMessage();
          }
        }, 500);
        return;
      }
      
      if (window.currentUserPlan !== 'premium') {
        medbg('[Security] 2D/3D toggle blocked for free user');
        this.showUpgradeMessage();
        return;
      }
      
      medbg('[Debug] 2D/3D toggle allowed for premium user');
      this.performToggle();
    }

    performToggle() {
      medbg('[Debug] Performing 2D/3D toggle');
      this.is3D = !this.is3D;
      const styleCycle = ++styleCycleId;
      
      if (this.is3D) {
        // Switch to 3D view with terrain (use standard-satellite for better terrain compatibility)
        medbg(`[STYLE ${styleCycle}] setStyle -> mapbox://styles/mapbox/standard-satellite`);
        this.map.setStyle('mapbox://styles/mapbox/standard-satellite');
        
        // Wait for style to load, then add terrain
        this.map.once('style.load', () => {
          medbg(`[STYLE ${styleCycle}] style.load`);

          if (this.is3D) {
            this.map.addSource('mapbox-dem', {
              'type': 'raster-dem',
              'url': 'mapbox://mapbox.mapbox-terrain-dem-v1',
              'tileSize': 512,
              'maxzoom': 14
            });
            this.map.setTerrain({ 'source': 'mapbox-dem', 'exaggeration': 1.4 });
          } else {
            this.map.setTerrain(null);
            if (this.map.getSource('mapbox-dem')) {
              this.map.removeSource('mapbox-dem');
            }
          }

          this.map.once('idle', () => {
            medbg('[GPX] forcing restore after terrain ready');
            this.map.resize();
            if (typeof window.restoreGPXTracksAfterStyleSwitch === 'function') {
              window.restoreGPXTracksAfterStyleSwitch(this.map, 'final-fix');
            }
            if (window.WITD?.draw && typeof window.WITD.draw.restoreAfterStyleSwitch === 'function') {
              window.WITD.draw.restoreAfterStyleSwitch();
            }
            if (typeof window.scheduleRehydrateAfterStyleSwitch === 'function') {
              window.scheduleRehydrateAfterStyleSwitch(this.map, styleCycle, { skipGpxRestore: true, skipDrawRestore: true });
            } else if (typeof window.rehydrateMapLayers === 'function') {
              window.rehydrateMapLayers();
            }
          });

          // Set 3D view parameters
          this.map.easeTo({
            pitch: 60,
            duration: 1000
          });

          this.button.innerHTML = '🗺️';
          this.button.title = 'Switch to 2D View';
          this.button.style.background = '#e3f2fd';
        });
      } else {
        // Switch to 2D view (high resolution + labels)
        medbg(`[STYLE ${styleCycle}] setStyle -> mapbox://styles/mapbox/standard-satellite`);
        this.map.setStyle('mapbox://styles/mapbox/standard-satellite');
        
        // Wait for style to load, then remove terrain
        this.map.once('style.load', () => {
          medbg(`[STYLE ${styleCycle}] style.load`);

          if (this.is3D) {
            this.map.addSource('mapbox-dem', {
              'type': 'raster-dem',
              'url': 'mapbox://mapbox.mapbox-terrain-dem-v1',
              'tileSize': 512,
              'maxzoom': 14
            });
            this.map.setTerrain({ 'source': 'mapbox-dem', 'exaggeration': 1.4 });
          } else {
            this.map.setTerrain(null);
            if (this.map.getSource('mapbox-dem')) {
              this.map.removeSource('mapbox-dem');
            }
          }

          this.map.once('idle', () => {
            medbg('[GPX] forcing restore after terrain ready');
            this.map.resize();
            if (typeof window.restoreGPXTracksAfterStyleSwitch === 'function') {
              window.restoreGPXTracksAfterStyleSwitch(this.map, 'final-fix');
            }
            if (window.WITD?.draw && typeof window.WITD.draw.restoreAfterStyleSwitch === 'function') {
              window.WITD.draw.restoreAfterStyleSwitch();
            }
            if (typeof window.scheduleRehydrateAfterStyleSwitch === 'function') {
              window.scheduleRehydrateAfterStyleSwitch(this.map, styleCycle, { skipGpxRestore: true, skipDrawRestore: true });
            } else if (typeof window.rehydrateMapLayers === 'function') {
              window.rehydrateMapLayers();
            }
          });

          // Set 2D view parameters
          this.map.easeTo({
            pitch: 0,
            duration: 1000
          });

          this.button.innerHTML = '🛩️';
          this.button.title = 'Switch to 2D View';
          this.button.style.background = 'white';
        });
      }
      
      // Resize now handled inside post-terrain idle callback to reduce race conditions.
    }

    showUpgradeMessage() {
      // Remove any existing popup first
      const existingPopup = document.querySelector('.premium-upgrade-popup');
      if (existingPopup) {
        existingPopup.remove();
      }

      // Create the upgrade popup using the same styling as other gated features
      const popup = document.createElement('div');
      popup.className = 'premium-upgrade-popup';
      popup.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: white;
        border-radius: 12px;
        padding: 30px;
        text-align: center;
        box-shadow: 0 10px 30px rgba(0,0,0,0.3);
        z-index: 10000;
        max-width: 400px;
        width: 90%;
        border: 2px solid #ff6b6b;
      `;

      popup.innerHTML = `
        <div style="font-size: 48px; margin-bottom: 20px;">🚁</div>
        <h2 style="margin: 0 0 15px 0; color: #333; font-size: 24px;">Premium Feature</h2>
        <p style="margin: 0 0 25px 0; color: #666; font-size: 16px; line-height: 1.5;">
          The 2D/3D toggle is a premium feature. Upgrade to access this and other advanced mapping tools!
        </p>
        <button id="premium-popup-close" style="
          background: #ff6b6b;
          color: white;
          border: none;
          padding: 12px 30px;
          border-radius: 8px;
          font-size: 16px;
          cursor: pointer;
          font-weight: 600;
        ">Got it</button>
      `;

      document.body.appendChild(popup);

      // Add proper event listener to close button
      const closeBtn = popup.querySelector('#premium-popup-close');
      if (closeBtn) {
        closeBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          e.preventDefault();
          popup.remove();
        });
      }

      // Add click outside to close functionality
      popup.addEventListener('click', (e) => {
        if (e.target === popup) {
          popup.remove();
        }
      });

      // Auto-remove after 5 seconds
      setTimeout(() => {
        if (popup.parentNode) {
          popup.remove();
        }
      }, 5000);
    }

    updateButtonStyle() {
      // Update button styling based on user plan
      medbg('[Debug] updateButtonStyle called - currentUserPlan:', window.currentUserPlan);
      
      if (window.currentUserPlan !== 'premium') {
        // Free user - show as disabled/premium
        medbg('[Debug] Setting button style for FREE user');
        this.button.style.opacity = '0.6';
        this.button.style.filter = 'grayscale(0.3)';
        this.button.style.cursor = 'pointer'; // Still clickable to show upgrade message
        this.button.title = 'Toggle 2D/3D View (Premium Feature)';
      } else {
        // Premium user - show as enabled
        medbg('[Debug] Setting button style for PREMIUM user');
        this.button.style.opacity = '1';
        this.button.style.filter = 'none';
        this.button.style.cursor = 'pointer';
        this.button.title = 'Toggle 2D/3D View';
      }
    }

    onRemove() {
      this.container.parentNode.removeChild(this.container);
      this.map = null;
    }
  }

  // Add custom view mode control
  const viewModeControl = new ViewModeControl();
  map.addControl(viewModeControl, 'top-right');
  
  // Make the control globally accessible for plan updates
  window.viewModeControl = viewModeControl;
  
  // Add global function to manually refresh 2D/3D button styling (for testing)
  window.refresh2D3DButton = function() {
    if (window.viewModeControl) {
      medbg('[Debug] Manually refreshing 2D/3D button styling');
      window.viewModeControl.updateButtonStyle();
    } else {
      medbg('[Debug] viewModeControl not found');
    }
  };

  // Custom Home Button Control
  class HomeControl {
    constructor() {
      this.map = null;
    }

    onAdd(map) {
      this.map = map;
      this.container = document.createElement('div');
      this.container.className = 'mapboxgl-ctrl mapboxgl-ctrl-group';
      this.container.style.marginTop = '10px';
      
      this.button = document.createElement('button');
      this.button.className = 'mapboxgl-ctrl-icon';
      this.button.type = 'button';
      this.button.style.cssText = `
        width: 30px;
        height: 30px;
        background: white;
        border: 1px solid #ccc;
        border-radius: 4px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 16px;
        transition: all 0.2s ease;
      `;
      this.button.innerHTML = '🏠';
      this.button.title = 'Go to Default View';
      
      this.button.addEventListener('click', () => this.goHome());
      this.container.appendChild(this.button);
      
      return this.container;
    }

            goHome() {
          this.map.easeTo({
            center: [146.5, -36.5], // Victoria, Australia [lng, lat]
            zoom: 7,
            pitch: 0,
            bearing: 0,
            duration: 1000
          });
        }

    onRemove() {
      this.container.parentNode.removeChild(this.container);
      this.map = null;
    }
  }

  // Add home control
  map.addControl(new HomeControl(), 'top-right');

  // Mobile gesture handling
  if ('ontouchstart' in window) {
    // Disable single-finger drag rotation on mobile
    map.dragRotate.disable();
    
    // Enable two-finger rotation and pitch
    map.touchZoomRotate.enable();
    map.touchZoomRotate.enableRotation = true;
    map.touchZoomRotate.enablePitch = true;
  }

  // Handle window resize
  window.addEventListener('resize', () => {
    map.resize();
  });

  // Expose map globally
  window.WITD = window.WITD || {};
  window.WITD.map = map;
  window.dispatchEvent(new CustomEvent('witd:map-ready', { detail: { map } }));

  // Wait for map style to be fully loaded before initializing modules
  map.on('load', () => {
    medbg("Map style fully loaded, initializing modules...");
    
    // Initialize the drawing module
    if (window.WITD.draw) {
      window.WITD.draw.init(map);
      medbg("Drawing module initialized");
    } else {
      medbg("Drawing module not loaded yet");
    }

    medbg("Mapbox GL JS map initialized and ready.");
    
    // Load saved GPX files for premium users after map is ready
    // DISABLED: Using new Mapbox GPX manager instead
    // if (window.currentUserPlan === 'premium') {
    //   window.gpxLoadTimeout = setTimeout(() => {
    //     if (typeof loadGpxFiles === 'function' && !window.gpxCleared) {
    //       loadGpxFiles();
    //     }
    //   }, 1500); // Wait for map to be fully ready
    // }
  });

  // Also handle the case where the map might already be loaded
  if (map.isStyleLoaded()) {
    medbg("Map style already loaded, initializing modules immediately...");
    
    // Initialize the drawing module
    if (window.WITD.draw) {
      window.WITD.draw.init(map);
      medbg("Drawing module initialized");
    } else {
      medbg("Drawing module not loaded yet");
    }
  }
});
