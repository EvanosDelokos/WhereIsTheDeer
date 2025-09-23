console.log("Module loaded: gpxManager (Mapbox GL JS)");

// Input sanitization utility to prevent XSS
function sanitizeInput(str) {
  if (typeof str !== 'string') return '';
  const div = document.createElement("div");
  div.innerText = str;
  return div.innerHTML;
}

// Remove ES6 import - use global functions instead
// import { saveGpxFiles, loadGpxFiles } from './storeManager.js';

// Global functions for storage (fallback if storeManager not available)
function saveGpxFiles(files) {
  try {
    if (window.saveGpxFiles) {
      window.saveGpxFiles(files);
    } else {
      localStorage.setItem('gpxFiles', JSON.stringify(files));
      console.log("[GPX] Saved to localStorage:", files.length, "files");
    }
  } catch (error) {
    console.warn("[GPX] Could not save GPX files:", error);
  }
}

function loadGpxFiles() {
  try {
    if (window.loadGpxFiles) {
      return window.loadGpxFiles();
    } else {
      const saved = localStorage.getItem('gpxFiles');
      return saved ? JSON.parse(saved) : [];
    }
  } catch (error) {
    console.warn("[GPX] Could not load GPX files:", error);
    return [];
  }
}

// Test function to verify GPX manager is working
window.testGPXManager = function() {
  console.log("🧪 Testing GPX Manager...");
  console.log("- Window.WITD exists:", !!window.WITD);
  console.log("- Window.WITD.map exists:", !!window.WITD?.map);
  console.log("- GPX Manager loaded:", true);
  console.log("- Current gpxFiles:", window.gpxFiles || []);
  
  if (window.WITD?.map) {
    console.log("- Map object:", window.WITD.map);
    console.log("- Map ready:", window.WITD.map.loaded());
    console.log("- Map style loaded:", window.WITD.map.isStyleLoaded());
    
    // Test if our source and layer exist
    const source = window.WITD.map.getSource('gpx-tracks');
    const layer = window.WITD.map.getLayer('gpx-tracks-layer');
    console.log("- GPX source exists:", !!source);
    console.log("- GPX layer exists:", !!layer);
    
    if (source && layer) {
      console.log("✅ GPX manager is fully initialized and ready!");
    } else {
      console.log("⚠️ GPX manager not fully initialized");
    }
  }
  
  return "GPX Manager test completed";
};

// Test function to add a sample track
window.testGPXTrack = function() {
  console.log("🧪 Testing GPX track addition...");
  
  if (!window.WITD?.map) {
    console.error("Map not available");
    return;
  }
  
  const source = window.WITD.map.getSource('gpx-tracks');
  if (!source) {
    console.error("GPX source not available");
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
    source.setData(testTrack);
    console.log("✅ Test track added successfully!");
    
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
  console.log("[GPX] Manual initialization requested");
  if (window.WITD && window.WITD.map) {
    console.log("[GPX] Map available, initializing now");
    initGpxManager(window.WITD.map);
  } else {
    console.log("[GPX] Map not available for manual init");
  }
};

// Always wait for the map to be ready - don't check immediately
console.log("[GPX] GPX Manager loaded, waiting for map to be ready...");

// Function to wait for map and initialize
function waitForMapAndInit() {
  console.log("[GPX] Checking for map...", !!window.WITD, !!window.WITD?.map);
  if (window.WITD && window.WITD.map) {
    console.log("[GPX] Map found, initializing GPX manager");
    initGpxManager(window.WITD.map);
  } else {
    console.log("[GPX] Map not ready yet, retrying in 100ms...");
    setTimeout(waitForMapAndInit, 100);
  }
}

// Start waiting for the map
waitForMapAndInit();

function initGpxManager(map) {
  console.log("[GPX] initGpxManager called with map:", !!map);
  
  if (!map) {
    console.warn("Map not available for GPX manager");
    return;
  }

  let gpxFiles = [];
  let gpxSourceId = 'gpx-tracks';
  let gpxLayerId = 'gpx-tracks-layer';

  console.log("[GPX] Setting up GPX manager for map:", map);

  // Wait for map style to be fully loaded before adding sources/layers
  function waitForStyleAndInit() {
    console.log("[GPX] Checking map style status...");
    console.log("[GPX] Map style loaded:", map.isStyleLoaded());
    console.log("[GPX] Map loaded:", map.loaded());
    
    if (map.isStyleLoaded()) {
      console.log("[GPX] Map style loaded, creating source and layer");
      createGpxSourceAndLayer();
    } else {
      console.log("[GPX] Map style not ready yet, waiting for 'styledata' event...");
      map.once('styledata', () => {
        console.log("[GPX] 'styledata' event fired, creating source and layer");
        createGpxSourceAndLayer();
      });
    }
  }

  // Start the style loading process
  waitForStyleAndInit();

  // Listen for style changes (like switching between 2D/3D modes)
  map.on('styledata', () => {
    console.log("[GPX] Map style changed, checking if we need to reinitialize...");
    
    // Check if our source and layer still exist
    const source = map.getSource(gpxSourceId);
    const layer = map.getLayer(gpxLayerId);
    
    if (!source || !layer) {
      console.log("[GPX] Source or layer missing after style change, reinitializing...");
      // Wait a bit for the style to fully load, then recreate
      setTimeout(() => {
        if (map.isStyleLoaded()) {
          createGpxSourceAndLayer();
          // Restore any existing GPX data
          if (gpxFiles.length > 0) {
            console.log("[GPX] Restoring", gpxFiles.length, "existing GPX tracks after style change");
            restoreGpxTracksAfterStyleChange();
          }
        }
      }, 500);
    }
  });

  function createGpxSourceAndLayer() {
    try {
      // Check if source/layer already exist
      if (map.getSource(gpxSourceId)) {
        console.log("[GPX] GPX source already exists");
        return;
      }

      console.log("[GPX] Creating new GPX source and layer");
      
      // Add source
      map.addSource(gpxSourceId, {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: []
        }
      });

      // Add layer
      map.addLayer({
        id: gpxLayerId,
        type: 'line',
        source: gpxSourceId,
        layout: {
          'line-join': 'round',
          'line-cap': 'round'
        },
        paint: {
          'line-color': '#ff6b35',
          'line-width': 3,
          'line-opacity': 0.8
        }
      });

      // Add GPX track labels layer
      map.addLayer({
        id: 'gpx-track-labels',
        type: 'symbol',
        source: 'gpx-tracks',
        layout: {
          'text-field': ['get', 'name'],
          'text-size': 12,
          'text-anchor': 'center',
          'visibility': 'visible'
        },
        paint: {
          'text-color': '#ffffff',
          'text-halo-color': '#000000',
          'text-halo-width': 1
        }
      });

      console.log("[GPX] Mapbox source and layer created successfully");
      
      // Add GPX waypoint icons to the map
      addGpxIcons();
      
      // Now set up the file input
      setupFileInput();
      
    } catch (error) {
      console.error("[GPX] Error creating source/layer:", error);
      // Retry after a short delay
      setTimeout(createGpxSourceAndLayer, 1000);
    }
  }

  function addGpxIcons() {
    try {
      console.log("[GPX Icons] Adding GPX waypoint icons to map");
      
      // Load the SVG icons as images
      const icons = [
        { name: 'StartPin', url: 'Images/StartPin.svg' },
        { name: 'RedMarkerPin', url: 'Images/RedMarkerPin.svg' }
      ];

      icons.forEach(icon => {
        const img = new Image();
        img.onload = () => {
          if (map.hasImage(icon.name)) {
            map.removeImage(icon.name);
          }
          map.addImage(icon.name, img);
          console.log(`[GPX Icons] Added icon: ${icon.name}`);
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

  function setupFileInput() {
    // Set up file input - create our own to avoid conflicts
    let input = document.createElement('input');
    input.type = 'file';
    input.accept = '.gpx';
    input.id = 'gpxManagerInput';
    input.style.display = 'none';
    document.body.appendChild(input);
    console.log("[GPX] Created dedicated GPX manager input element");

    // Don't sync with existing input to avoid conflicts
    // Our input is completely independent

    // Remove any existing event listeners to prevent duplicates
    input.removeEventListener('change', handleFileSelect);
    input.addEventListener('change', handleFileSelect);
    console.log("[GPX] Event listener attached to our input element");

    // Expose our input globally so the upload button can use it
    window.gpxManagerInput = input;
  }

  function handleFileSelect(e) {
    console.log("[GPX] handleFileSelect triggered!");
    const files = e.target.files;
  console.log("[GPX] Files received:", files);

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
    console.log(`📁 GPX file selected: ${file.name}`);
        loadGpxFile(file);
      }
    });

    // Reset input value so the same file can be selected again
    e.target.value = '';
  }

  function loadGpxFile(file) {
    console.log(`[GPX] Loading GPX file: ${file.name}`);
    
    const reader = new FileReader();
    reader.onload = function(e) {
      try {
        console.log(`[GPX] File read successfully: ${file.name}`);
        const gpxContent = e.target.result;
        console.log(`[GPX] GPX content length:`, gpxContent.length);
        const gpxData = parseGpxToGeoJson(gpxContent, file.name);
        
        if (gpxData) {
          console.log(`[GPX] Parsed GPX data:`, gpxData);
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
      const safeFileName = sanitizeInput(fileName);
      console.log(`[GPX] Parsing GPX content for ${safeFileName}`);
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(gpxContent, 'text/xml');
      
      if (xmlDoc.getElementsByTagName('parsererror').length > 0) {
        console.error("[GPX] XML parsing error");
        throw new Error('Invalid XML');
      }

      const tracks = xmlDoc.getElementsByTagName('trk');
      const waypoints = xmlDoc.getElementsByTagName('wpt');
      console.log(`[GPX] Found ${tracks.length} tracks and ${waypoints.length} waypoints in GPX`);
      
      if (tracks.length === 0) {
        console.warn("[GPX] No tracks found in GPX file");
        return null;
      }

      const trackFeatures = [];
      
      // Parse tracks
      for (let i = 0; i < tracks.length; i++) {
        const track = tracks[i];
        const trackSegments = track.getElementsByTagName('trkseg');
        console.log(`[GPX] Track ${i + 1} has ${trackSegments.length} segments`);
        
        // Merge all segments into one continuous LineString
        const allCoordinates = [];

        for (let j = 0; j < trackSegments.length; j++) {
          const segment = trackSegments[j];
          const trackPoints = segment.getElementsByTagName('trkpt');

          for (let k = 0; k < trackPoints.length; k++) {
            const point = trackPoints[k];
            const lat = parseFloat(point.getAttribute('lat'));
            const lon = parseFloat(point.getAttribute('lon'));
            if (!isNaN(lat) && !isNaN(lon)) {
              allCoordinates.push([lon, lat]);
            }
          }
        }

        if (allCoordinates.length > 1) {
          trackFeatures.push({
            type: 'Feature',
            properties: {
              name: safeFileName || `Track ${i + 1}`,
              type: 'gpx-track'
            },
            geometry: {
              type: 'LineString',
              coordinates: allCoordinates
            }
          });
        }
      }

      console.log(`[GPX] Created ${trackFeatures.length} track features`);
      
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

  function addGpxToMap(gpxData, fileName) {
    try {
      console.log(`[GPX] Adding GPX to map: ${fileName}`);
      
      // Check if source exists and is ready
      const source = map.getSource(gpxSourceId);
      if (!source) {
        console.error("[GPX] GPX source not found - map may not be ready");
          return;
        }
      
      // Get current source data safely
      let currentData;
      try {
        currentData = source.serialize().data;
      } catch (error) {
        console.warn("[GPX] Could not get current source data, starting fresh");
        currentData = {
          type: 'FeatureCollection',
          features: []
        };
      }
      
      // Handle new data structure with separate tracks and waypoints
      const newTrackFeatures = gpxData.tracks?.features || gpxData.features || [];
      const allTrackFeatures = [...currentData.features, ...newTrackFeatures];
      
      console.log(`[GPX] Current source data:`, currentData);
      console.log(`[GPX] New track features to add:`, newTrackFeatures.length);
      
      // Update track source with combined data
      try {
        source.setData({
          type: 'FeatureCollection',
          features: allTrackFeatures
        });
        console.log(`[GPX] Track source data updated successfully`);
      } catch (error) {
        console.error(`[GPX] Error updating source data:`, error);
        return;
      }

      // Start/end pins are now handled by addStartEndPinsToMap
      if (newTrackFeatures.length > 0) {
        addStartEndPinsToMap(map, newTrackFeatures, fileName);
        console.log(`[GPX] Added start/end pins for ${newTrackFeatures.length} tracks`);
      }

      // Store GPX file info
      gpxFiles.push({
        name: fileName,
        data: gpxData,
        addedAt: new Date()
      });

      console.log(`[GPX] Successfully added ${newTrackFeatures.length} tracks from ${fileName}`);
      console.log(`[GPX] Total tracks now: ${allTrackFeatures.length}`);

      // Start/end pins are now handled by addStartEndPinsToMap

      // Fit map to show all tracks
      if (allTrackFeatures.length > 0) {
        const bounds = calculateBounds(allTrackFeatures);
        if (bounds) {
          console.log(`[GPX] Fitting map to bounds:`, bounds);
          try {
            map.fitBounds(bounds, { padding: 50 });
            console.log("[GPX] Map fitted to show all tracks");
          } catch (error) {
            console.warn("[GPX] Could not fit map to bounds:", error);
          }
        }
      }

      // Save to storage
      saveGpxFiles(gpxFiles);

    } catch (error) {
      console.error(`[GPX] Error adding GPX to map:`, error);
    }
  }

  function deleteTrack(fileName) {
    console.log(`[GPX] Deleting track: ${fileName}`);
    
    // Find the track in gpxFiles
    const trackIndex = gpxFiles.findIndex(file => file.name === fileName);
    if (trackIndex === -1) {
      console.warn(`[GPX] Track not found: ${fileName}`);
      return;
    }
    
    // Remove markers from map
    const track = gpxFiles[trackIndex];
    if (track.markers) {
      track.markers.forEach(marker => {
        marker.remove();
      });
    }
    
    // Remove pins for this specific track from clustered source
    removePinsFromClusteredSource(map, fileName);
    
    // Remove HTML track label marker for this track
    const trackLabelMarkers = document.querySelectorAll('.track-label-container');
    trackLabelMarkers.forEach(marker => {
      const title = marker.querySelector('.track-label-title');
      if (title && title.textContent === fileName.replace('.gpx', '')) {
        marker.remove();
        console.log(`[GPX] Removed HTML track label for: ${fileName}`);
      }
    });
    
    // Remove from gpxFiles array
    gpxFiles.splice(trackIndex, 1);
    
    // Update source data
    const source = map.getSource(gpxSourceId);
    if (source) {
      const currentData = source.serialize().data;
      const remainingFeatures = currentData.features.filter(feature => 
        feature.properties.name !== fileName
      );
      
      source.setData({
        type: 'FeatureCollection',
        features: remainingFeatures
      });
    }
    
    // Save to storage
    saveGpxFiles(gpxFiles);
    
    console.log(`[GPX] Track deleted: ${fileName}`);
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
    console.log("[GPX] Starting to clear all GPX tracks and related elements...");
    
    // Clear main track source
    const source = map.getSource(gpxSourceId);
    if (source) {
      source.setData({
        type: 'FeatureCollection',
        features: []
      });
    }
    
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
      console.log(`[GPX] Removed HTML track label marker`);
    });
    
    // Clear GPX files array and save
    gpxFiles = [];
    saveGpxFiles(gpxFiles);
    console.log("[GPX] Cleared all GPX tracks, pins, and labels");
  }

  // Function to restore GPX tracks after a style change
  function restoreGpxTracksAfterStyleChange() {
    if (gpxFiles.length === 0) return;
    
    console.log("[GPX] Restoring tracks after style change...");
    
    const source = map.getSource(gpxSourceId);
    if (!source) {
      console.warn("[GPX] Source not available for restoration");
      return;
    }
    
    // Collect all features from all GPX files
    const allFeatures = [];
    gpxFiles.forEach(file => {
      if (file.data && file.data.features) {
        allFeatures.push(...file.data.features);
      }
    });
    
    if (allFeatures.length > 0) {
      try {
        source.setData({
          type: 'FeatureCollection',
          features: allFeatures
        });
        console.log(`[GPX] Successfully restored ${allFeatures.length} track features after style change`);
        
        // Restore start/end pins for all tracks
        gpxFiles.forEach(file => {
          if (file.data && file.data.features) {
            // Use the new start/end pin system
            addStartEndPinsToMap(map, file.data.features, file.name);
          }
        });
        
        // Fit map to show all restored tracks
        const bounds = calculateBounds(allFeatures);
        if (bounds) {
          map.fitBounds(bounds, { padding: 50 });
          console.log("[GPX] Map fitted to show restored tracks");
        }
      } catch (error) {
        console.error("[GPX] Error restoring tracks after style change:", error);
      }
    }
  }

  // Expose functions globally
  window.gpxFiles = gpxFiles;
  window.removeGpxTrack = deleteTrack; // Use existing deleteTrack function
  window.clearAllGpxTracks = clearAllGpxTracks;

  // Clustered pin source management
  const gpxPinsSourceId = 'gpx-pins-clustered';
  let gpxPinsData = {
    type: 'FeatureCollection',
    features: []
  };

  function initializeClusteredPinsSource(map) {
    // Add the clustered source if it doesn't exist
    if (!map.getSource(gpxPinsSourceId)) {
      map.addSource(gpxPinsSourceId, {
        type: 'geojson',
        data: gpxPinsData,
        cluster: true,
        clusterMaxZoom: 14, // Max zoom to cluster points on
        clusterRadius: 50 // Radius of each cluster when clustering points
      });

      // Add cluster circles
      map.addLayer({
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
      });

      // Add cluster count labels
      map.addLayer({
        id: 'gpx-cluster-count',
        type: 'symbol',
        source: gpxPinsSourceId,
        filter: ['has', 'point_count'],
        layout: {
          'text-field': '{point_count_abbreviated}',
          'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'],
          'text-size': 12
        }
      });

      // Add unclustered pins
      map.addLayer({
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
          'text-field': ['get', 'title'],
          'text-offset': [0, 1.4],
          'text-anchor': 'top',
          'text-allow-overlap': true
        }
      });

      // Add click handlers for clusters and pins
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
          console.log(`[GPX] Pin clicked: ${feature.properties.title} (${feature.properties.fileName})`);
        }
      });

      // Change cursor on hover
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
    }
  }

  function addPinsToClusteredSource(map, pins) {
    // Initialize source if it doesn't exist
    initializeClusteredPinsSource(map);
    
    // Add pins to the data
    gpxPinsData.features.push(...pins);
    
    // Update the source
    const source = map.getSource(gpxPinsSourceId);
    if (source) {
      source.setData(gpxPinsData);
    }
  }

  function removePinsFromClusteredSource(map, fileName) {
    // Remove pins for this file
    gpxPinsData.features = gpxPinsData.features.filter(feature => 
      feature.properties.fileName !== fileName
    );
    
    // Update the source
    const source = map.getSource(gpxPinsSourceId);
    if (source) {
      source.setData(gpxPinsData);
    }
  }

  // Clustered start/end pin system
  function addStartEndPinsToMap(map, trackFeatures, fileName) {
    try {
      console.log(`[GPX Pins] Adding clustered start/end pins for ${fileName}`);
      
      // Collect all pins for this track
      const pins = [];
      trackFeatures.forEach((track, trackIndex) => {
        const coordinates = track.geometry.coordinates;
        if (coordinates.length >= 2) {
          const startCoord = coordinates[0];
          const endCoord = coordinates[coordinates.length - 1];
          const trackId = `${fileName}-${trackIndex}`;

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
              fileName: fileName,
              trackId: trackId
            }
          });
        }
      });

      // Add pins to the clustered source
      if (pins.length > 0) {
        addPinsToClusteredSource(map, pins);
      }

      // Add track name label at the middle of the track
      if (trackFeatures.length > 0) {
        const track = trackFeatures[0]; // Get the first (and only) track
        const coordinates = track.geometry.coordinates;
        if (coordinates.length > 0) {
          const middleIndex = Math.floor(coordinates.length / 2);
          const middleCoord = coordinates[middleIndex];
          
          // Create styled track label element
          const trackLabelEl = document.createElement('div');
          trackLabelEl.className = 'track-label-container';
          trackLabelEl.innerHTML = `
            <div class="track-label-popup">
              <div class="track-label-header">
                <span class="track-label-title">${sanitizeInput(fileName).replace('.gpx', '')}</span>
                <button class="track-delete-btn" title="Delete Track">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="3,6 5,6 21,6"></polyline>
                    <path d="m19,6v14a2,2 0 0,1 -2,2H7a2,2 0 0,1 -2,-2V6m3,0V4a2,2 0 0,1 2,-2h4a2,2 0 0,1 2,2v2"></path>
                    <line x1="10" y1="11" x2="10" y2="17"></line>
                    <line x1="14" y1="11" x2="14" y2="17"></line>
                  </svg>
                </button>
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
          trackLabelMarker._trackFeatures = trackFeatures;
          
          // Add zoom-based visibility
          const updateLabelVisibility = () => {
            const zoom = map.getZoom();
            console.log(`[GPX] Current zoom level: ${zoom}, track: ${fileName}`);
            if (zoom < 8) {
              trackLabelEl.style.display = 'none'; // Hide labels when zoomed out
              console.log(`[GPX] Hiding track label for ${fileName} (zoom: ${zoom})`);
            } else {
              trackLabelEl.style.display = 'block'; // Show labels when zoomed in
              console.log(`[GPX] Showing track label for ${fileName} (zoom: ${zoom})`);
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
            console.log(`[GPX] Delete button clicked for track: ${fileName}`);
            deleteTrack(fileName);
          });

          console.log(`[DEBUG] Adding track label "${fileName.replace('.gpx', '')}" at:`, middleCoord);
        }
      }

    } catch (error) {
      console.error("[GPX Pins] Error adding start/end pins:", error);
    }
  }

  // Debug function
  window.debugGPX = function() {
    console.log("🔍 GPX Debug Info:");
    console.log("- GPX source exists:", !!map.getSource(gpxSourceId));
    console.log("- GPX layer exists:", !!map.getLayer(gpxLayerId));
    console.log("- Start/end pin layers exist:", !!map.getLayer('start-pin-'));
    console.log("- Current gpxFiles count:", gpxFiles.length);
    console.log("- Map object:", map);
  };

  // GPX Zoom-based Visibility - Now handled by Mapbox clustering
  console.log("[GPX] Zoom visibility now handled by Mapbox clustering system");

  console.log("[GPX] GPX Manager initialized successfully");
}