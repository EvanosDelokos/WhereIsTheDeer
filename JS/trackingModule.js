// === JS/trackingModule.js (Full Integration for WhereIsTheDeer 3.0) ===
// Drop this in /JS/trackingModule.js and import at bottom of map.html

let watchId = null;
let trackingActive = false;
let trackCoords = [];
let trackStartTime = null;
let elevationGain = 0;
let lastElevation = null;
let distanceKm = 0;
let followMe = true; // default on
let hasAutoZoomed = false; // track if we've done initial zoom
const trackLineId = "userTrackLine";
const trackSourceId = "userTrack";
const currentMarkerId = "trackingPositionMarker";

// === GPS SMOOTHING VARIABLES ===
let positionBuffer = []; // Store recent positions for smoothing
const BUFFER_SIZE = 3; // Reduced for faster response (was 5)
const MIN_ACCURACY = 200; // Further increased for mobile devices - phones often report 100-200m accuracy
const MIN_DISTANCE = 0.5; // Very reduced for mobile devices to ensure line drawing
let lastRecordedPosition = null;
let smoothedHeading = null;
const HEADING_SMOOTHING = 0.5; // Increased for faster heading response (was 0.3)
let lastSpeed = 0;

// === FLOATING STOP BUTTON ===
let floatingStopBtn = null;

function createFloatingStopButton() {
  if (floatingStopBtn) return; // Already exists
  
  floatingStopBtn = document.createElement('button');
  floatingStopBtn.id = 'floatingStopBtn';
  floatingStopBtn.innerHTML = '⏹️ Stop Tracking';
  floatingStopBtn.style.cssText = `
    position: fixed !important;
    bottom: 100px !important;
    right: 20px !important;
    z-index: 9999 !important;
    background: #dc2626 !important;
    color: white !important;
    border: none !important;
    border-radius: 8px !important;
    padding: 12px 16px !important;
    font-size: 14px !important;
    font-weight: 600 !important;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3) !important;
    cursor: pointer !important;
    transition: all 0.2s ease !important;
    display: flex !important;
    align-items: center !important;
    gap: 6px !important;
    user-select: none !important;
    -webkit-user-select: none !important;
    -webkit-tap-highlight-color: transparent !important;
    visibility: visible !important;
    opacity: 1 !important;
  `;
  
  // Mobile responsiveness - position above mobile toolbar
  if (window.innerWidth <= 768) {
    floatingStopBtn.style.bottom = '90px';
    floatingStopBtn.style.right = '10px';
    floatingStopBtn.style.padding = '10px 14px';
    floatingStopBtn.style.fontSize = '13px';
  }
  
  // Hover effects
  floatingStopBtn.addEventListener('mouseenter', () => {
    floatingStopBtn.style.background = '#b91c1c';
    floatingStopBtn.style.transform = 'translateY(-2px)';
    floatingStopBtn.style.boxShadow = '0 6px 16px rgba(0, 0, 0, 0.4)';
  });
  
  floatingStopBtn.addEventListener('mouseleave', () => {
    floatingStopBtn.style.background = '#dc2626';
    floatingStopBtn.style.transform = 'translateY(0)';
    floatingStopBtn.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.3)';
  });
  
  // Click handler
  floatingStopBtn.addEventListener('click', () => {
    stopTracking();
  });
  
  document.body.appendChild(floatingStopBtn);
  console.log('🛑 Floating stop button created');
  console.log('🛑 Button element:', floatingStopBtn);
  console.log('🛑 Button position:', floatingStopBtn.style.position);
  console.log('🛑 Button z-index:', floatingStopBtn.style.zIndex);
  console.log('🛑 Button visible:', floatingStopBtn.offsetParent !== null);
}

function removeFloatingStopButton() {
  if (floatingStopBtn) {
    floatingStopBtn.remove();
    floatingStopBtn = null;
    console.log('🛑 Floating stop button removed');
  }
}

export function initTracking(map) {
  window.WITD = window.WITD || {};
  window.WITD.tracking = { 
    startTracking, 
    stopTracking, 
    saveTrack, 
    toggleFollow,
    saveTracksToSupabase,
    loadTracksFromSupabase,
    deleteTrackFromSupabase,
    restoreTracksAfterStyleSwitch
  };
  window.WITD.tracking.map = map;
  
  // Load saved tracks from localStorage first
  try {
    const saved = localStorage.getItem('witd_saved_tracks');
    if (saved) {
      window.WITD.tracking.savedTracks = JSON.parse(saved);
      console.log(`💾 Loaded ${window.WITD.tracking.savedTracks.length} saved tracks from localStorage`);
    } else {
      window.WITD.tracking.savedTracks = [];
      console.log(`💾 No saved tracks found in localStorage, initializing empty array`);
    }
  } catch (error) {
    console.error(`❌ Failed to load saved tracks from localStorage:`, error);
    window.WITD.tracking.savedTracks = [];
  }
  
  // Then try to load from Supabase (for cross-device sync)
  setTimeout(() => {
    loadTracksFromSupabase();
  }, 1000);
  
  console.log("🧭 Tracking module initialized");
  console.log("🧭 Saved tracks count:", window.WITD.tracking.savedTracks.length);
}

// === GPS SMOOTHING HELPERS ===
function smoothPosition(newPos, speed) {
  // Add to buffer
  positionBuffer.push({
    lat: newPos.latitude,
    lng: newPos.longitude,
    accuracy: newPos.accuracy
  });
  
  // Keep buffer size limited
  if (positionBuffer.length > BUFFER_SIZE) {
    positionBuffer.shift();
  }
  
  // If we only have 1 position, return it directly (no smoothing needed)
  if (positionBuffer.length === 1) {
    return {
      latitude: newPos.latitude,
      longitude: newPos.longitude
    };
  }
  
  // Calculate accuracy-weighted average
  // Better accuracy (lower number) = higher weight
  // Recent positions also get higher weight
  let totalWeight = 0;
  let avgLat = 0;
  let avgLng = 0;
  
  positionBuffer.forEach((pos, idx) => {
    // Accuracy weight: inverse of accuracy (better accuracy = higher weight)
    const accuracyWeight = 1 / Math.max(pos.accuracy, 5); // Prevent division by zero
    
    // Recency weight: more recent = higher
    const recencyWeight = (idx + 1) / positionBuffer.length;
    
    // Speed weight: if moving fast, prioritize recent positions more
    const speedFactor = Math.min(speed / 2, 1); // Normalize to 0-1 (2 m/s = full weight)
    const finalRecencyWeight = 1 + (speedFactor * 2 * recencyWeight); // 1-3x multiplier
    
    // Combined weight
    const weight = accuracyWeight * finalRecencyWeight;
    
    avgLat += pos.lat * weight;
    avgLng += pos.lng * weight;
    totalWeight += weight;
  });
  
  return {
    latitude: avgLat / totalWeight,
    longitude: avgLng / totalWeight
  };
}

function smoothHeading(newHeading) {
  if (newHeading === null || isNaN(newHeading)) return smoothedHeading || 0;
  
  if (smoothedHeading === null) {
    smoothedHeading = newHeading;
    return newHeading;
  }
  
  // Handle wraparound (359° -> 1° should not jump through 180°)
  let delta = newHeading - smoothedHeading;
  if (delta > 180) delta -= 360;
  if (delta < -180) delta += 360;
  
  // Exponential moving average
  smoothedHeading = smoothedHeading + (delta * HEADING_SMOOTHING);
  
  // Normalize to 0-360
  if (smoothedHeading < 0) smoothedHeading += 360;
  if (smoothedHeading >= 360) smoothedHeading -= 360;
  
  return smoothedHeading;
}

function shouldRecordPoint(lat, lng, accuracy, speed) {
  // Reject VERY low accuracy positions (but be more lenient)
  if (accuracy > MIN_ACCURACY) {
    console.log(`⚠️ Position rejected: accuracy ${accuracy.toFixed(1)}m > ${MIN_ACCURACY}m threshold`);
    // But if we have no points yet, record anyway for mobile devices
    if (trackCoords.length === 0) {
      console.log(`📍 Recording anyway - no points yet (mobile fallback)`);
      return true;
    }
    return false;
  }
  
  // Always record first point
  if (!lastRecordedPosition) {
    lastRecordedPosition = { lat, lng };
    console.log(`📍 Recording first point (accuracy: ${accuracy.toFixed(1)}m)`);
    return true;
  }
  
  // Calculate distance from last recorded point
  const distance = haversine([lastRecordedPosition.lat, lastRecordedPosition.lng], [lat, lng]) * 1000; // Convert to meters
  
  // Adaptive distance threshold based on speed
  // When moving fast, require larger distance to avoid over-sampling
  // When stationary/slow, use smaller distance to capture detail
  const adaptiveDistance = Math.max(MIN_DISTANCE, speed * 0.5); // At least MIN_DISTANCE meters
  
  if (distance < adaptiveDistance) {
    // Too close to last point, skip to reduce jitter
    return false;
  }
  
  lastRecordedPosition = { lat, lng };
  return true;
}

// === CORE ===
async function startTracking() {
  if (trackingActive) return showMsg("Tracking already active.", "GPS Tracking");
  if (!navigator.geolocation) return showMsg("Your device does not support GPS tracking.", "Error");

  showMsg("⚠️ Continuous GPS tracking can drain battery.", "Battery Notice");

  const map = window.WITD.tracking.map;
  trackCoords = [];
  elevationGain = 0;
  lastElevation = null;
  distanceKm = 0;
  trackStartTime = Date.now();
  trackingActive = true;
  hasAutoZoomed = false;
  
  // Reset smoothing buffers
  positionBuffer = [];
  lastRecordedPosition = null;
  smoothedHeading = null;
  lastSpeed = 0;

  // remove old live tracking layers (but keep saved tracks)
  if (map.getLayer(trackLineId)) map.removeLayer(trackLineId);
  if (map.getSource(trackSourceId)) map.removeSource(trackSourceId);
  if (map.getLayer(currentMarkerId)) map.removeLayer(currentMarkerId);
  if (map.getSource(currentMarkerId)) map.removeSource(currentMarkerId);
  
  console.log(`🧹 Cleaned up live tracking layers, keeping ${window.WITD.tracking.savedTracks ? window.WITD.tracking.savedTracks.length : 0} saved tracks`);
  console.log(`🧹 Saved tracks before starting new track:`, window.WITD.tracking.savedTracks);
  
  // Ensure saved tracks are preserved
  if (!window.WITD.tracking.savedTracks) {
    window.WITD.tracking.savedTracks = [];
    console.log(`🧹 Initialized empty saved tracks array`);
  }

  map.addSource(trackSourceId, {
    type: "geojson",
    data: { type: "Feature", geometry: { type: "LineString", coordinates: [] } }
  });
  map.addLayer({
    id: trackLineId,
    type: "line",
    source: trackSourceId,
    layout: { "line-join": "round", "line-cap": "round" },
    paint: { "line-color": "#ff6600", "line-width": 3 }
  });

  console.log("🔍 Requesting GPS permissions...");
  watchId = navigator.geolocation.watchPosition(
    (pos) => {
      console.log("✅ GPS permission granted, location received");
      updateTrack(map, pos);
    },
    (err) => {
      console.error("❌ GPS error:", err);
      if (err.code === 1) {
        showMsg("GPS permission denied. Please enable location access in your browser settings.", "GPS Permission Required");
      } else if (err.code === 2) {
        showMsg("GPS position unavailable. Check your device's location settings.", "GPS Error");
      } else if (err.code === 3) {
        showMsg("GPS request timed out. Please try again.", "GPS Timeout");
      }
    },
    { enableHighAccuracy: true, maximumAge: 1000, timeout: 10000 }
  );
  
  // Show floating stop button
  createFloatingStopButton();
  
  // Fallback: ensure button is visible after a short delay
  setTimeout(() => {
    if (floatingStopBtn && !floatingStopBtn.offsetParent) {
      console.log('🛑 Button not visible, forcing visibility...');
      floatingStopBtn.style.display = 'flex';
      floatingStopBtn.style.visibility = 'visible';
      floatingStopBtn.style.opacity = '1';
    }
  }, 500);
  
  console.log("📍 Tracking started");
}

function stopTracking() {
  if (!trackingActive) return;
  navigator.geolocation.clearWatch(watchId);
  trackingActive = false;
  const map = window.WITD.tracking.map;

  // Clean up live tracking layers immediately
  if (map.getLayer(currentMarkerId)) map.removeLayer(currentMarkerId);
  if (map.getSource(currentMarkerId)) map.removeSource(currentMarkerId);
  if (map.getLayer(trackLineId)) map.removeLayer(trackLineId);
  if (map.getSource(trackSourceId)) map.removeSource(trackSourceId);
  console.log(`🧹 Cleaned up live tracking layers immediately`);

  // Save current live track as a persistent, labeled layer (even with 0 points)
  try {
    if (trackCoords && trackCoords.length >= 0) {
      // Preserve coordinates before they get reset
      const preservedCoords = trackCoords.slice();
      const preservedDistance = distanceKm;
      const preservedStartTime = trackStartTime;
      
      const defaultName = `Track ${new Date().toLocaleString()}`;
      showTrackNameModal(defaultName, (name) => {
        const color = pickTrackColor();
        console.log(`🎨 Using color: ${color} for track "${name}"`);
        console.log(`📍 Track coordinates:`, preservedCoords.slice(0, 3), '...', preservedCoords.slice(-3));
        
        const saved = addSavedTrackToMap(map, name, preservedCoords.slice(), color, preservedDistance, preservedStartTime, Date.now());
        window.WITD.tracking.savedTracks.push(saved);
        
        // Persist to localStorage
        try {
          localStorage.setItem('witd_saved_tracks', JSON.stringify(window.WITD.tracking.savedTracks));
          console.log(`💾 Saved tracks persisted to localStorage`);
        } catch (error) {
          console.error(`❌ Failed to persist tracks to localStorage:`, error);
        }
        
        // Also save to Supabase
        saveTracksToSupabase();
        
        console.log(`💾 Saved track '${name}' with ${preservedCoords.length} points`);
        console.log(`💾 Total saved tracks now:`, window.WITD.tracking.savedTracks.length);
        console.log(`💾 Saved tracks array:`, window.WITD.tracking.savedTracks);
        
        // Ensure the saved track is visible by fitting map to track bounds
        setTimeout(() => {
          if (preservedCoords.length >= 1) {
            if (preservedCoords.length >= 2) {
              // Calculate bounds of the track
              const lons = preservedCoords.map(coord => coord[0]);
              const lats = preservedCoords.map(coord => coord[1]);
              const bounds = [
                [Math.min(...lons), Math.min(...lats)], // Southwest
                [Math.max(...lons), Math.max(...lats)]  // Northeast
              ];
              
              // Fit map to track bounds with padding
              map.fitBounds(bounds, {
                padding: 50,
                maxZoom: 16
              });
              
              console.log(`🗺️ Fitted map to track bounds:`, bounds);
            } else {
              // Single point - just center on it
              map.flyTo({
                center: preservedCoords[0],
                zoom: 16,
                duration: 1000
              });
              console.log(`🗺️ Centered map on single track point:`, preservedCoords[0]);
            }
          }
          
          map.triggerRepaint();
        }, 200);
        
         // Show success message on mobile
         showMsg(
           `✅ Track "${name}" saved successfully!<br><br>
            <strong>Distance:</strong> ${preservedDistance.toFixed(2)} km<br>
            <strong>Points:</strong> ${preservedCoords.length}<br><br>
            <em>Click the 🚶 walking man to see track info</em><br>
            <em>Click the track label to delete it</em>`,
           "Track Saved"
         );
      });
    } else {
      // No track to save, just clean up
      if (map.getLayer(currentMarkerId)) map.removeLayer(currentMarkerId);
      if (map.getSource(currentMarkerId)) map.removeSource(currentMarkerId);
      if (map.getLayer(trackLineId)) map.removeLayer(trackLineId);
      if (map.getSource(trackSourceId)) map.removeSource(trackSourceId);
    }
  } catch (e) {
    console.error('Failed to save persistent track:', e);
    // Clean up on error too
    if (map.getLayer(currentMarkerId)) map.removeLayer(currentMarkerId);
    if (map.getSource(currentMarkerId)) map.removeSource(currentMarkerId);
    if (map.getLayer(trackLineId)) map.removeLayer(trackLineId);
    if (map.getSource(trackSourceId)) map.removeSource(trackSourceId);
  }

  // Hide floating stop button
  removeFloatingStopButton();

  // Reset tracking state to allow new tracks (but keep saved tracks intact)
  trackCoords = [];
  distanceKm = 0;
  elevationGain = 0;
  lastElevation = null;
  hasAutoZoomed = false;
  positionBuffer = [];
  lastRecordedPosition = null;
  smoothedHeading = null;
  lastSpeed = 0;
  
  // Ensure saved tracks array exists and is preserved
  if (!window.WITD.tracking.savedTracks) {
    window.WITD.tracking.savedTracks = [];
  }
  console.log(`🔄 Saved tracks after stop tracking:`, window.WITD.tracking.savedTracks.length);

  const duration = fmtDuration((Date.now() - trackStartTime) / 1000);
  showMsg(
    `<strong>Distance:</strong> ${distanceKm.toFixed(2)} km<br>
     <strong>Elevation Gain:</strong> ${elevationGain.toFixed(0)} m<br>
     <strong>Duration:</strong> ${duration}`,
    "Track Summary"
  );
  console.log("🛑 Tracking stopped");
}

function updateTrack(map, pos) {
  const { longitude, latitude, altitude, heading, accuracy, speed } = pos.coords;
  
  // Debug: Log raw GPS data
  console.log(`📍 Raw GPS:`, {
    lat: latitude.toFixed(6),
    lng: longitude.toFixed(6),
    accuracy: `${accuracy.toFixed(1)}m`,
    altitude: altitude ? `${altitude.toFixed(1)}m` : 'N/A',
    heading: heading ? `${heading.toFixed(1)}°` : 'N/A',
    speed: speed ? `${(speed * 3.6).toFixed(1)} km/h` : 'N/A'
  });
  
  // === APPLY GPS SMOOTHING ===
  // Use speed for adaptive smoothing (default to 0 if not available)
  const currentSpeed = speed !== null && !isNaN(speed) ? speed : 0;
  lastSpeed = currentSpeed;
  
  const smoothedPos = smoothPosition(pos.coords, currentSpeed);
  const smoothedLat = smoothedPos.latitude;
  const smoothedLng = smoothedPos.longitude;
  const smoothedHdg = smoothHeading(heading);
  
  console.log(`✨ Smoothed GPS:`, {
    lat: smoothedLat.toFixed(6),
    lng: smoothedLng.toFixed(6),
    heading: `${smoothedHdg.toFixed(1)}°`,
    speed: `${(currentSpeed * 3.6).toFixed(1)} km/h`,
    buffer: `${positionBuffer.length}/${BUFFER_SIZE}`
  });
  
  // === Auto-zoom on first position fix ===
  if (!hasAutoZoomed && smoothedLng && smoothedLat) {
    hasAutoZoomed = true;
    console.log("🔍 Auto-zooming to user position", smoothedLng, smoothedLat);
    
    // Try multiple zoom approaches
    try {
      // Method 1: Direct jump first
      map.jumpTo({
        center: [smoothedLng, smoothedLat],
        zoom: 16
      });
      
      // Method 2: Then smooth ease
      setTimeout(() => {
        map.easeTo({
          center: [smoothedLng, smoothedLat],
          zoom: 16,
          duration: 1500
        });
      }, 100);
      
      // Method 3: Force zoom after a delay as fallback
      setTimeout(() => {
        if (map.getZoom() < 15) {
          console.log("🔄 Fallback zoom - forcing zoom level");
          map.flyTo({
            center: [smoothedLng, smoothedLat],
            zoom: 16,
            duration: 2000
          });
        }
      }, 2000);
      
      console.log("✅ Auto-zoom executed");
    } catch (error) {
      console.error("❌ Auto-zoom failed:", error);
    }
  }
  
  // === Check if we should record this point (reduce jitter) ===
  const shouldRecord = shouldRecordPoint(smoothedLat, smoothedLng, accuracy, currentSpeed);
  
  if (shouldRecord) {
    // Calculate distance from last point
    if (trackCoords.length > 0) {
      const [lastLon, lastLat] = trackCoords[trackCoords.length - 1];
      distanceKm += haversine([lastLat, lastLon], [smoothedLat, smoothedLng]);
    }
    
    // Add smoothed position to track
    trackCoords.push([smoothedLng, smoothedLat]);
    
    console.log(`✅ Point recorded: ${trackCoords.length} total points, accuracy: ${accuracy.toFixed(1)}m`);

    // === Update the polyline ===
    const lineData = {
      type: "Feature",
      geometry: { type: "LineString", coordinates: trackCoords }
    };
    map.getSource(trackSourceId).setData(lineData);
  } else {
    console.log(`⏭️ Point skipped (too close or low accuracy)`);
  }

  // === ALWAYS update the polyline for live tracking (even if point not recorded) ===
  // This ensures the line is visible even with strict filtering
  if (trackCoords.length >= 2) {
    const lineData = {
      type: "Feature",
      geometry: { type: "LineString", coordinates: trackCoords }
    };
    if (map.getSource(trackSourceId)) {
      map.getSource(trackSourceId).setData(lineData);
      console.log(`📍 Live track line updated: ${trackCoords.length} points`);
    } else {
      console.log(`❌ Track source not found: ${trackSourceId}`);
    }
  } else {
    console.log(`⏳ Not enough points for line yet: ${trackCoords.length}/2`);
  }

  // elevation gain (use raw altitude for accuracy)
  if (altitude !== null && !isNaN(altitude)) {
    if (lastElevation !== null) {
      const diff = altitude - lastElevation;
      if (diff > 1) elevationGain += diff;
    }
    lastElevation = altitude;
  }

  // === Update current position marker (always update, even if not recording) ===
  const point = { 
    type: "Feature", 
    geometry: { type: "Point", coordinates: [smoothedLng, smoothedLat] },
    properties: { heading: smoothedHdg }
  };

  if (!map.getSource(currentMarkerId)) {
    map.addSource(currentMarkerId, { type: "geojson", data: point });
    
    // Create arrow icon if it doesn't exist
    if (!map.hasImage("arrow-icon")) {
      createArrowIcon(map);
    }
    
    // Try arrow first, fallback to circle
    try {
      map.addLayer({
        id: currentMarkerId,
        type: "symbol",
        source: currentMarkerId,
        layout: {
          "icon-image": "arrow-icon",
          "icon-size": 1.0,
          "icon-rotate": ["get", "heading"],
          "icon-rotation-alignment": "map",
          "icon-allow-overlap": true,
          "icon-ignore-placement": true
        },
        paint: {
          "icon-opacity": 0.9
        }
      });
      console.log("🧭 Directional arrow marker created");
    } catch (error) {
      // Fallback to circle marker
      map.addLayer({
        id: currentMarkerId,
        type: "circle",
        source: currentMarkerId,
        paint: {
          "circle-radius": 8,
          "circle-color": "#007bff",
          "circle-stroke-width": 3,
          "circle-stroke-color": "#fff"
        }
      });
      console.log("📍 Circle marker created (arrow fallback)");
    }
  } else {
    map.getSource(currentMarkerId).setData(point);
  }

  // follow-me camera (only after initial zoom is done) - use smoothed position
  if (followMe && hasAutoZoomed) {
    map.easeTo({ center: [smoothedLng, smoothedLat], duration: 1000 });
  }

  updateLiveStats();
}

function saveTrack() {
  if (!trackCoords.length) return showMsg("No track data to save.", "Save Track");
  const duration = fmtDuration((Date.now() - trackStartTime) / 1000);
  const gpx = `<?xml version="1.0"?>
<gpx version="1.1" creator="WhereIsTheDeer">
<trk><name>User Track</name><trkseg>
${trackCoords.map(([lon, lat]) => `<trkpt lat="${lat}" lon="${lon}"></trkpt>`).join("\n")}
</trkseg></trk></gpx>`;

  const blob = new Blob([gpx], { type: "application/gpx+xml" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `WITD_Track_${new Date().toISOString().split("T")[0]}.gpx`;
  a.click();
  URL.revokeObjectURL(url);

  showMsg(
    `✅ Track Saved!<br><br>
     <strong>Distance:</strong> ${distanceKm.toFixed(2)} km<br>
     <strong>Elevation Gain:</strong> ${elevationGain.toFixed(0)} m<br>
     <strong>Duration:</strong> ${duration}`,
    "Track Saved"
  );
  console.log("✅ GPX saved");
}

// === FOLLOW ME TOGGLE ===
function toggleFollow() {
  followMe = !followMe;
  showMsg(`Follow-me view ${followMe ? "enabled" : "disabled"}.`, "Tracking");
}

// === HELPERS ===
function haversine([lat1, lon1], [lat2, lon2]) {
  const R = 6371;
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
const rad = (deg) => (deg * Math.PI) / 180;

function fmtDuration(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function updateLiveStats() {
  const box = document.getElementById("trackingStats");
  if (!box) return;
  const dur = fmtDuration((Date.now() - trackStartTime) / 1000);
  box.innerHTML = `
    <strong>Distance:</strong> ${distanceKm.toFixed(2)} km<br>
    <strong>Elevation Gain:</strong> ${elevationGain.toFixed(0)} m<br>
    <strong>Duration:</strong> ${dur}<br>
    <strong>Follow-Me:</strong> ${followMe ? "On" : "Off"}
  `;
}

// === CUSTOM TRACK NAMING MODAL ===
function showTrackNameModal(defaultName, onSave) {
  // Remove any existing modal
  const existing = document.getElementById('trackNameModal');
  if (existing) existing.remove();

  // Create modal overlay
  const overlay = document.createElement('div');
  overlay.id = 'trackNameModal';
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background: rgba(0,0,0,0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
  `;

  // Create modal content
  const modal = document.createElement('div');
  modal.style.cssText = `
    background: white;
    border-radius: 12px;
    padding: 24px;
    max-width: 400px;
    width: 90vw;
    box-shadow: 0 10px 30px rgba(0,0,0,0.3);
    position: relative;
  `;

  modal.innerHTML = `
    <div style="text-align: center; margin-bottom: 20px;">
      <div style="font-size: 24px; margin-bottom: 8px;">🏃‍♂️</div>
      <h3 style="margin: 0; color: #333; font-size: 18px;">Name Your Track</h3>
      <p style="margin: 8px 0 0 0; color: #666; font-size: 14px;">Give your GPS track a memorable name</p>
    </div>
    
    <div style="margin-bottom: 20px;">
      <input type="text" id="trackNameInput" value="${defaultName}" 
             style="width: 100%; padding: 12px; border: 2px solid #e0e0e0; border-radius: 8px; font-size: 16px; box-sizing: border-box;"
             placeholder="Enter track name...">
    </div>
    
    <div style="display: flex; gap: 12px; justify-content: flex-end;">
      <button id="trackNameCancel" style="
        background: #f5f5f5; color: #666; border: none; padding: 10px 20px; 
        border-radius: 6px; cursor: pointer; font-size: 14px;
      ">Cancel</button>
      <button id="trackNameSave" style="
        background: #007bff; color: white; border: none; padding: 10px 20px; 
        border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: 600;
      ">Save Track</button>
    </div>
  `;

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  // Focus input
  const input = document.getElementById('trackNameInput');
  input.focus();
  input.select();

  // Event handlers
  const saveBtn = document.getElementById('trackNameSave');
  const cancelBtn = document.getElementById('trackNameCancel');

  const save = () => {
    const name = input.value.trim();
    if (name) {
      onSave(name);
      overlay.remove();
    }
  };

  const cancel = () => {
    overlay.remove();
  };

  saveBtn.addEventListener('click', save);
  cancelBtn.addEventListener('click', cancel);

  // Enter key to save
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      save();
    } else if (e.key === 'Escape') {
      cancel();
    }
  });

  // Click outside to cancel
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      cancel();
    }
  });
}

// === PERSISTENT SAVED TRACKS ===
function addSavedTrackToMap(map, name, coords, color, distanceKmValue, startMs, endMs, existingTrackId = null) {
  // Use existing track ID if provided (when loading from Supabase), otherwise generate a new one
  const uid = existingTrackId || `savedTrack_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
  const sourceId = `${uid}_source`;
  const lineLayerId = `${uid}_line`;
  const labelLayerId = `${uid}_label`;

  // Handle tracks with no points by creating a placeholder at map center
  let trackCoords = coords;
  if (!trackCoords || trackCoords.length === 0) {
    const mapCenter = map.getCenter();
    trackCoords = [[mapCenter.lng, mapCenter.lat]];
    console.log(`📍 No track points, using map center as placeholder:`, trackCoords[0]);
  }
  
  // For single points, duplicate the point to create a visible line
  if (trackCoords.length === 1) {
    trackCoords = [trackCoords[0], trackCoords[0]];
    console.log(`📍 Single point track, duplicating for visibility:`, trackCoords);
  }

  // Create source
  const feature = {
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: trackCoords },
    properties: { name }
  };
  map.addSource(sourceId, { type: 'geojson', data: feature });

  // Add line layer
  try {
    map.addLayer({
      id: lineLayerId,
      type: 'line',
      source: sourceId,
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': color, 'line-width': 4 } // Increased width for visibility
    });
    console.log(`📍 Successfully added saved track line: ${lineLayerId} with color ${color}`);
  } catch (error) {
    console.error(`❌ Failed to add line layer:`, error);
  }
  
  console.log(`📍 Line layer exists:`, map.getLayer(lineLayerId) ? 'YES' : 'NO');
  console.log(`📍 Source exists:`, map.getSource(sourceId) ? 'YES' : 'NO');
  console.log(`📍 Track coordinates:`, trackCoords);

  // Add label at the last coordinate with delete button
  const last = trackCoords[trackCoords.length - 1];
  const labelSourceId = `${uid}_label_source`;
  map.addSource(labelSourceId, {
    type: 'geojson',
    data: {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: last },
      properties: { title: name, trackId: uid }
    }
  });
  map.addLayer({
    id: labelLayerId,
    type: 'symbol',
    source: labelSourceId,
    layout: {
      'text-field': ['get', 'title'],
      'text-size': 14, // Increased size
      'text-offset': [0, 1.5], // Increased offset
      'text-anchor': 'top'
    },
    paint: {
      'text-color': '#1f2937',
      'text-halo-color': '#ffffff',
      'text-halo-width': 2 // Increased halo width
    }
  });
  
  console.log(`🏷️ Added saved track label: ${labelLayerId} for "${name}"`);
  console.log(`🏷️ Label layer exists:`, map.getLayer(labelLayerId) ? 'YES' : 'NO');
  console.log(`🏷️ Label source exists:`, map.getSource(labelSourceId) ? 'YES' : 'NO');
  
  // Add a start marker for debugging
  const startMarkerId = `${uid}_start_marker`;
  const startSourceId = `${uid}_start_source`;
  map.addSource(startSourceId, {
    type: 'geojson',
    data: {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: trackCoords[0] },
      properties: { title: 'START' }
    }
  });
  map.addLayer({
    id: startMarkerId,
    type: 'symbol',
    source: startSourceId,
    layout: {
      'text-field': '🚩',
      'text-size': 20,
      'text-anchor': 'center'
    }
  });
  console.log(`🚩 Added start marker: ${startMarkerId}`);
  
  // Add a walking man icon marker for the track (like pins)
  const walkMarkerId = `${uid}_walk_marker`;
  const walkSourceId = `${uid}_walk_source`;
  const endPoint = trackCoords[trackCoords.length - 1]; // Use end point instead of midpoint
  console.log(`🚶‍♂️ Creating walk marker at end point:`, endPoint);
  
  map.addSource(walkSourceId, {
    type: 'geojson',
    data: {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: endPoint },
      properties: { title: name, trackId: uid }
    }
  });
  
  // Load the WalkingMan.svg icon
  const loadWalkingManIcon = () => {
    return new Promise((resolve, reject) => {
      if (map.hasImage('walking-man-icon')) {
        resolve();
        return;
      }
      
      const img = new Image();
      img.onload = () => {
        try {
          console.log(`🚶‍♂️ Image loaded, dimensions: ${img.width}x${img.height}`);
          map.addImage('walking-man-icon', img);
          console.log(`🚶‍♂️ WalkingMan.svg icon loaded successfully`);
          resolve();
        } catch (error) {
          console.error(`❌ Failed to add walking man icon:`, error);
          reject(error);
        }
      };
      img.onerror = () => {
        console.error(`❌ Failed to load WalkingMan.svg`);
        reject(new Error('Failed to load WalkingMan.svg'));
      };
      img.src = 'Images/Pins/WalkingMan.svg';
    });
  };
  
  try {
    loadWalkingManIcon().then(() => {
      console.log(`🚶‍♂️ About to add layer with icon: walking-man-icon`);
      map.addLayer({
        id: walkMarkerId,
        type: 'symbol',
        source: walkSourceId,
        layout: {
          'icon-image': 'walking-man-icon',
          'icon-size': 0.05,
          'icon-anchor': 'bottom',
          'icon-allow-overlap': true,
          'icon-ignore-placement': true
        }
      });
      console.log(`🚶‍♂️ Successfully added walk marker: ${walkMarkerId}`);
    }).catch((error) => {
      // Fallback to emoji if icon loading fails
      map.addLayer({
        id: walkMarkerId,
        type: 'symbol',
        source: walkSourceId,
        layout: {
          'text-field': '🚶',
          'text-size': 28,
          'text-anchor': 'center',
          'text-allow-overlap': true,
          'text-ignore-placement': true
        },
        paint: {
          'text-halo-color': '#ffffff',
          'text-halo-width': 3
        }
      });
      console.log(`🚶‍♂️ Fallback emoji marker added: ${walkMarkerId}`);
    });
  } catch (error) {
    console.error(`❌ Failed to add walk marker:`, error);
  }

  // Add click handler for walking man marker to show track info
  map.on('click', walkMarkerId, (e) => {
    const trackId = e.features[0].properties.trackId;
    const track = window.WITD.tracking.savedTracks.find(t => t.id === trackId);
    if (track) {
       showMsg(
         `🚶 <strong>${track.name}</strong><br><br>
          <strong>Distance:</strong> ${track.distanceKm.toFixed(2)} km<br>
          <strong>Started:</strong> ${new Date(track.startedAt).toLocaleString()}<br>
          <strong>Duration:</strong> ${fmtDuration((new Date(track.endedAt) - new Date(track.startedAt)) / 1000)}<br><br>
          <em>Click the track label to delete it.</em>`,
         "Track Info"
       );
    }
  });

  // Add click handler for delete functionality
  map.on('click', labelLayerId, (e) => {
    const trackId = e.features[0].properties.trackId;
    showDeleteTrackModal(trackId, map);
  });

  // Change cursor on hover for walking man
  map.on('mouseenter', walkMarkerId, () => {
    map.getCanvas().style.cursor = 'pointer';
  });
  map.on('mouseleave', walkMarkerId, () => {
    map.getCanvas().style.cursor = '';
  });

  // Change cursor on hover for label
  map.on('mouseenter', labelLayerId, () => {
    map.getCanvas().style.cursor = 'pointer';
  });
  map.on('mouseleave', labelLayerId, () => {
    map.getCanvas().style.cursor = '';
  });

  return {
    id: uid,
    name,
    color,
    distanceKm: distanceKmValue,
    startedAt: new Date(startMs).toISOString(),
    endedAt: new Date(endMs).toISOString(),
    sourceId,
    lineLayerId,
    labelSourceId,
    labelLayerId,
    walkMarkerId,
    walkSourceId,
    startMarkerId,
    startSourceId,
    coords: trackCoords
  };
}

// === DELETE TRACK MODAL ===
function showDeleteTrackModal(trackId, map) {
  // Find the track
  const track = window.WITD.tracking.savedTracks.find(t => t.id === trackId);
  if (!track) return;

  // Remove any existing modal
  const existing = document.getElementById('deleteTrackModal');
  if (existing) existing.remove();

  // Create modal overlay
  const overlay = document.createElement('div');
  overlay.id = 'deleteTrackModal';
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background: rgba(0,0,0,0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
  `;

  // Create modal content
  const modal = document.createElement('div');
  modal.style.cssText = `
    background: white;
    border-radius: 12px;
    padding: 24px;
    max-width: 400px;
    width: 90vw;
    box-shadow: 0 10px 30px rgba(0,0,0,0.3);
    text-align: center;
  `;

  modal.innerHTML = `
    <div style="font-size: 48px; margin-bottom: 16px;">🗑️</div>
    <h3 style="margin: 0 0 8px 0; color: #333; font-size: 18px;">Delete Track</h3>
    <p style="margin: 0 0 20px 0; color: #666; font-size: 14px;">
      Are you sure you want to delete "${track.name}"?
    </p>
    <div style="display: flex; gap: 12px; justify-content: center;">
      <button id="deleteTrackCancel" style="
        background: #f5f5f5; color: #666; border: none; padding: 10px 20px; 
        border-radius: 6px; cursor: pointer; font-size: 14px;
      ">Cancel</button>
      <button id="deleteTrackConfirm" style="
        background: #dc2626; color: white; border: none; padding: 10px 20px; 
        border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: 600;
      ">Delete</button>
    </div>
  `;

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  // Event handlers
  const cancelBtn = document.getElementById('deleteTrackCancel');
  const confirmBtn = document.getElementById('deleteTrackConfirm');

  const cancel = () => overlay.remove();
          const confirm = async () => {
            // Remove from map
            try {
              if (track.lineLayerId && map.getLayer(track.lineLayerId)) {
                map.removeLayer(track.lineLayerId);
              }
              if (track.sourceId && map.getSource(track.sourceId)) {
                map.removeSource(track.sourceId);
              }
              if (track.labelLayerId && map.getLayer(track.labelLayerId)) {
                map.removeLayer(track.labelLayerId);
              }
              if (track.labelSourceId && map.getSource(track.labelSourceId)) {
                map.removeSource(track.labelSourceId);
              }
              
              // Remove start marker if it exists
              if (track.startMarkerId && map.getLayer(track.startMarkerId)) {
                map.removeLayer(track.startMarkerId);
              }
              if (track.startSourceId && map.getSource(track.startSourceId)) {
                map.removeSource(track.startSourceId);
              }
              
              // Remove walking man marker if it exists - try multiple approaches
              // First, try using stored IDs
              if (track.walkMarkerId && map.getLayer(track.walkMarkerId)) {
                map.removeLayer(track.walkMarkerId);
                console.log(`🗑️ Removed walk marker layer: ${track.walkMarkerId}`);
              }
              if (track.walkSourceId && map.getSource(track.walkSourceId)) {
                map.removeSource(track.walkSourceId);
                console.log(`🗑️ Removed walk marker source: ${track.walkSourceId}`);
              }
              
              // Also try to find and remove by pattern matching (in case IDs weren't stored)
              const walkMarkerPattern = `${track.id}_walk_marker`;
              const walkSourcePattern = `${track.id}_walk_source`;
              
              try {
                if (map.getLayer(walkMarkerPattern)) {
                  map.removeLayer(walkMarkerPattern);
                  console.log(`🗑️ Removed walk marker by pattern: ${walkMarkerPattern}`);
                }
              } catch (e) {
                // Layer might not exist, that's okay
              }
              
              try {
                if (map.getSource(walkSourcePattern)) {
                  map.removeSource(walkSourcePattern);
                  console.log(`🗑️ Removed walk source by pattern: ${walkSourcePattern}`);
                }
              } catch (e) {
                // Source might not exist, that's okay
              }
              
              // Also try to remove any event listeners that might be attached to the walk marker
              // Mapbox doesn't expose a direct way to list listeners, but we can try to remove common ones
              try {
                map.off('click', walkMarkerPattern);
                map.off('mouseenter', walkMarkerPattern);
                map.off('mouseleave', walkMarkerPattern);
              } catch (e) {
                // Listeners might not exist, that's okay
              }
              
            } catch (error) {
              console.error(`❌ Error removing track layers/sources:`, error);
            }

    // Remove from saved tracks array
    const index = window.WITD.tracking.savedTracks.findIndex(t => t.id === trackId);
    if (index > -1) {
      window.WITD.tracking.savedTracks.splice(index, 1);
      
      // Persist to localStorage
      try {
        localStorage.setItem('witd_saved_tracks', JSON.stringify(window.WITD.tracking.savedTracks));
        console.log(`💾 Updated saved tracks in localStorage after deletion`);
      } catch (error) {
        console.error(`❌ Failed to update localStorage after deletion:`, error);
      }
      
      // Also delete from Supabase - wait for it to complete
      const deleteResult = await deleteTrackFromSupabase(trackId);
      if (deleteResult && deleteResult.success) {
        console.log(`✅ Successfully deleted track from Supabase: ${track.name}`);
      } else {
        console.error(`❌ Failed to delete track from Supabase:`, deleteResult?.error || 'Unknown error');
        // Show a warning but don't block the UI
        console.warn(`⚠️ Track deleted locally but may reappear on refresh if Supabase deletion failed`);
        console.warn(`⚠️ Track ID used for deletion: ${trackId}`);
        console.warn(`⚠️ If this keeps happening, the track_id in Supabase may not match the local track ID`);
      }
    } else {
      console.warn(`⚠️ Track with ID ${trackId} not found in savedTracks array`);
    }

    console.log(`🗑️ Deleted track: ${track.name}`);
    overlay.remove();
  };

  cancelBtn.addEventListener('click', cancel);
  confirmBtn.addEventListener('click', confirm);

  // Click outside to cancel
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      cancel();
    }
  });

  // Escape key to cancel
  const handleEscape = (e) => {
    if (e.key === 'Escape') {
      cancel();
      document.removeEventListener('keydown', handleEscape);
    }
  };
  document.addEventListener('keydown', handleEscape);
}

function pickTrackColor() {
  const palette = ['#ff6600', '#10b981', '#3b82f6', '#ef4444', '#a855f7', '#f59e0b'];
  const used = (window.WITD.tracking.savedTracks || []).map(t => t.color);
  for (const c of palette) if (!used.includes(c)) return c;
  // Fallback: cycle palette
  return palette[(used.length) % palette.length];
}

// === ARROW ICON CREATION ===
function createArrowIcon(map) {
  try {
    // Create a simple arrow using SVG data URL (more reliable than canvas)
    const svgArrow = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`
      <svg width="32" height="32" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <filter id="shadow" x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx="1" dy="1" stdDeviation="1" flood-color="#000" flood-opacity="0.3"/>
          </filter>
        </defs>
        <polygon 
          points="16,4 28,20 20,20 20,28 12,28 12,20 4,20" 
          fill="#007bff" 
          stroke="#ffffff" 
          stroke-width="2"
          filter="url(#shadow)"
        />
        <circle cx="16" cy="16" r="3" fill="#ffffff"/>
      </svg>
    `)}`;
    
    // Load the SVG as an image
    const img = new Image();
    img.onload = function() {
      try {
        map.addImage('arrow-icon', img);
        console.log("🧭 Directional arrow icon created successfully");
      } catch (error) {
        console.error("❌ Failed to add arrow image to map:", error);
      }
    };
    img.onerror = function() {
      console.error("❌ Failed to load arrow SVG");
    };
    img.src = svgArrow;
    
    return true;
  } catch (error) {
    console.error("❌ Failed to create arrow icon:", error);
    return false;
  }
}

// === UI MESSAGE POPUP ===
function showMsg(msg, title = "Info") {
  const old = document.getElementById("styledMessageDialog");
  if (old) old.remove();
  const wrap = document.createElement("div");
  wrap.id = "styledMessageDialog";
  wrap.style.cssText = `position:fixed;top:0;left:0;width:100%;height:100%;
    background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:10000;`;
  wrap.innerHTML = `
    <div style="background:white;border-radius:12px;padding:26px;text-align:center;
      max-width:380px;box-shadow:0 10px 30px rgba(0,0,0,0.3);">
      <h3>${title}</h3><p>${msg}</p>
      <button id="msgOk" style="background:#007bff;color:white;border:none;
      padding:8px 18px;border-radius:6px;margin-top:10px;cursor:pointer;">OK</button>
    </div>`;
  document.body.appendChild(wrap);
  document.getElementById("msgOk").onclick = () => wrap.remove();
}

// === SUPABASE INTEGRATION ===

// Save all tracks to Supabase
async function saveTracksToSupabase() {
  try {
    // Check if Supabase client is available
    if (!window.supabaseClient) {
      console.log('[tracking] Supabase client not ready, skipping save');
      return;
    }

    // Check if user is authenticated
    const { data: { user }, error: authError } = await window.supabaseClient.auth.getUser();
    if (authError || !user) {
      console.log('[tracking] No authenticated user, skipping Supabase save');
      return;
    }

    console.log('[tracking] Saving tracks to Supabase for user:', user.id);

    // First, clear existing tracks for this user
    const { error: deleteError } = await window.supabaseClient
      .from('walkingtrack')
      .delete()
      .eq('user_id', user.id);

    if (deleteError) {
      console.error('[tracking] Error clearing existing tracks:', deleteError);
    } else {
      console.log('[tracking] Cleared existing tracks from Supabase');
    }

    // Then insert all current tracks
    if (window.WITD.tracking.savedTracks.length > 0) {
      const tracksToSave = window.WITD.tracking.savedTracks.map(track => ({
        user_id: user.id,
        track_id: track.id,
        name: track.name,
        color: track.color,
        distance_km: track.distanceKm,
        started_at: track.startedAt,
        ended_at: track.endedAt,
        coordinates: JSON.stringify(track.coords),
        created_at: new Date().toISOString()
      }));

      const { error: insertError } = await window.supabaseClient
        .from('walkingtrack')
        .insert(tracksToSave);

      if (insertError) {
        console.error('[tracking] Error saving tracks to Supabase:', insertError);
      } else {
        console.log('[tracking] Successfully saved', tracksToSave.length, 'tracks to Supabase');
      }
    } else {
      console.log('[tracking] No tracks to save to Supabase');
    }

  } catch (error) {
    console.error('[tracking] Error in saveTracksToSupabase:', error);
  }
}

// Load tracks from Supabase
async function loadTracksFromSupabase() {
  try {
    console.log('[tracking] Loading tracks from Supabase...');

    // Check if Supabase client is available
    if (!window.supabaseClient) {
      console.log('[tracking] Supabase client not ready, skipping load');
      return;
    }

    // Check if user is authenticated
    const { data: { user }, error: authError } = await window.supabaseClient.auth.getUser();
    if (authError || !user) {
      console.log('[tracking] No authenticated user, skipping Supabase load');
      return;
    }

    // Fetch tracks from Supabase
    const { data: tracks, error } = await window.supabaseClient
      .from('walkingtrack')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[tracking] Error loading tracks from Supabase:', error);
      return;
    }

    console.log('[tracking] Raw tracks from Supabase:', tracks);

    if (tracks && tracks.length > 0) {
      console.log('[tracking] Loading', tracks.length, 'tracks from Supabase');
      
      // Convert Supabase format back to our internal format
      const loadedTracks = tracks.map(dbTrack => ({
        id: dbTrack.track_id,
        name: dbTrack.name,
        color: dbTrack.color,
        distanceKm: dbTrack.distance_km,
        startedAt: dbTrack.started_at,
        endedAt: dbTrack.ended_at,
        coords: JSON.parse(dbTrack.coordinates),
        // These will be set when we add the track to the map
        sourceId: '',
        lineLayerId: '',
        labelSourceId: '',
        labelLayerId: '',
        walkMarkerId: '',
        walkSourceId: '',
        startMarkerId: '',
        startSourceId: ''
      }));

      // Add tracks to map and update our saved tracks array
      const map = window.WITD.tracking.map;
      window.WITD.tracking.savedTracks = [];
      
      for (const track of loadedTracks) {
        // Preserve the original track ID from Supabase
        const originalTrackId = track.id;
        
        const mapTrack = addSavedTrackToMap(
          map, 
          track.name, 
          track.coords, 
          track.color, 
          track.distanceKm, 
          new Date(track.startedAt).getTime(), 
          new Date(track.endedAt).getTime(),
          originalTrackId // Pass the original ID to preserve it
        );
        
        // Update the track with the map IDs, but preserve the original ID
        Object.assign(track, mapTrack);
        track.id = originalTrackId; // Ensure we keep the original ID from Supabase
        window.WITD.tracking.savedTracks.push(track);
      }

      console.log('[tracking] Successfully loaded', loadedTracks.length, 'tracks from Supabase');
      
      // Update localStorage with loaded tracks
      try {
        localStorage.setItem('witd_saved_tracks', JSON.stringify(window.WITD.tracking.savedTracks));
        console.log('[tracking] Updated localStorage with Supabase tracks');
      } catch (error) {
        console.error('[tracking] Failed to update localStorage:', error);
      }
      
    } else {
      console.log('[tracking] No tracks found in Supabase');
    }

  } catch (error) {
    console.error('[tracking] Error in loadTracksFromSupabase:', error);
  }
}

// Delete a track from Supabase
async function deleteTrackFromSupabase(trackId) {
  try {
    // Check if Supabase client is available
    if (!window.supabaseClient) {
      console.log('[tracking] Supabase client not ready, skipping delete');
      return { success: false, error: 'Supabase client not available' };
    }

    // Check if user is authenticated
    const { data: { user }, error: authError } = await window.supabaseClient.auth.getUser();
    if (authError || !user) {
      console.log('[tracking] No authenticated user, skipping Supabase delete');
      return { success: false, error: 'User not authenticated' };
    }

    console.log('[tracking] Deleting track from Supabase:', trackId, 'for user:', user.id);

    // First, get all tracks for this user to debug ID matching
    const { data: allTracks, error: listError } = await window.supabaseClient
      .from('walkingtrack')
      .select('track_id, name')
      .eq('user_id', user.id);
    
    if (listError) {
      console.error('[tracking] Error listing tracks:', listError);
    } else {
      console.log('[tracking] All tracks in Supabase for this user:', allTracks);
      console.log('[tracking] Looking for track_id:', trackId);
      const matchingTrack = allTracks?.find(t => t.track_id === trackId);
      if (!matchingTrack) {
        console.warn('[tracking] Track ID mismatch! Available track_ids:', allTracks?.map(t => t.track_id));
      }
    }

    // First, verify the track exists
    const { data: existingTracks, error: fetchError } = await window.supabaseClient
      .from('walkingtrack')
      .select('track_id, name')
      .eq('user_id', user.id)
      .eq('track_id', trackId);

    if (fetchError) {
      console.error('[tracking] Error fetching track before deletion:', fetchError);
      return { success: false, error: fetchError };
    }

    if (!existingTracks || existingTracks.length === 0) {
      console.warn('[tracking] Track not found in Supabase (may have already been deleted):', trackId);
      // This is okay - track might have been deleted already
      return { success: true, message: 'Track not found (already deleted?)' };
    }

    console.log('[tracking] Found track to delete:', existingTracks[0]);

    // Delete from Supabase
    const { data, error } = await window.supabaseClient
      .from('walkingtrack')
      .delete()
      .eq('user_id', user.id)
      .eq('track_id', trackId)
      .select(); // Return deleted rows to verify

    if (error) {
      console.error('[tracking] Error deleting track from Supabase:', error);
      return { success: false, error: error };
    }

    // Verify deletion
    if (data && data.length > 0) {
      console.log('[tracking] Successfully deleted track from Supabase:', data[0]);
      return { success: true, deleted: data[0] };
    } else {
      console.warn('[tracking] Delete query executed but no rows were deleted. Track ID:', trackId);
      return { success: false, error: 'No rows deleted' };
    }

  } catch (error) {
    console.error('[tracking] Error in deleteTrackFromSupabase:', error);
    return { success: false, error: error.message || error };
  }
}

// Restore walking tracks after map style switch
function restoreTracksAfterStyleSwitch() {
  try {
    console.log('[tracking] Restoring walking tracks after style switch...');
    
    const map = window.WITD.tracking.map;
    if (!map) {
      console.log('[tracking] Map not available for track restoration');
      return;
    }

    // Wait for style to be fully loaded
    if (!map.isStyleLoaded()) {
      console.log('[tracking] Style not loaded yet, waiting...');
      map.once('style.load', () => {
        setTimeout(restoreTracksAfterStyleSwitch, 100);
      });
      return;
    }

    // Clear existing saved tracks from the map (but keep the data)
    const savedTracks = window.WITD.tracking.savedTracks || [];
    console.log(`[tracking] Found ${savedTracks.length} saved tracks to restore`);

    // Clear the saved tracks array but preserve the data
    const tracksToRestore = [...savedTracks];
    window.WITD.tracking.savedTracks = [];

    // Re-add each track to the map
    for (const track of tracksToRestore) {
      try {
        const mapTrack = addSavedTrackToMap(
          map,
          track.name,
          track.coords,
          track.color,
          track.distanceKm,
          new Date(track.startedAt).getTime(),
          new Date(track.endedAt).getTime()
        );
        
        // Update the track with the new map IDs
        Object.assign(track, mapTrack);
        window.WITD.tracking.savedTracks.push(track);
        
        console.log(`[tracking] Restored track: ${track.name}`);
      } catch (error) {
        console.error(`[tracking] Failed to restore track ${track.name}:`, error);
      }
    }

    console.log(`[tracking] Successfully restored ${tracksToRestore.length} walking tracks`);
    
  } catch (error) {
    console.error('[tracking] Error in restoreTracksAfterStyleSwitch:', error);
  }
}

