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

export function initTracking(map) {
  window.WITD = window.WITD || {};
  window.WITD.tracking = { startTracking, stopTracking, saveTrack, toggleFollow };
  window.WITD.tracking.map = map;
  console.log("🧭 Tracking module initialized");
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

  // remove old
  if (map.getLayer(trackLineId)) map.removeLayer(trackLineId);
  if (map.getSource(trackSourceId)) map.removeSource(trackSourceId);
  if (map.getLayer(currentMarkerId)) map.removeLayer(currentMarkerId);
  if (map.getSource(currentMarkerId)) map.removeSource(currentMarkerId);

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
  console.log("📍 Tracking started");
}

function stopTracking() {
  if (!trackingActive) return;
  navigator.geolocation.clearWatch(watchId);
  trackingActive = false;
  
  // Clean up position marker
  const map = window.WITD.tracking.map;
  if (map.getLayer(currentMarkerId)) map.removeLayer(currentMarkerId);
  if (map.getSource(currentMarkerId)) map.removeSource(currentMarkerId);
  
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
  
  // Debug: Log GPS data details
  console.log(`📍 GPS Update:`, {
    lat: latitude.toFixed(6),
    lng: longitude.toFixed(6),
    accuracy: `${accuracy}m`,
    altitude: altitude ? `${altitude.toFixed(1)}m` : 'N/A',
    heading: heading ? `${heading.toFixed(1)}°` : 'N/A',
    speed: speed ? `${(speed * 3.6).toFixed(1)} km/h` : 'N/A'
  });
  
  // === Auto-zoom on first position fix ===
  if (!hasAutoZoomed && longitude && latitude) {
    hasAutoZoomed = true;
    console.log("🔍 Auto-zooming to user position", longitude, latitude);
    
    // Try multiple zoom approaches
    try {
      // Method 1: Direct jump first
      map.jumpTo({
        center: [longitude, latitude],
        zoom: 16
      });
      
      // Method 2: Then smooth ease
      setTimeout(() => {
        map.easeTo({
          center: [longitude, latitude],
          zoom: 16,
          duration: 1500
        });
      }, 100);
      
      // Method 3: Force zoom after a delay as fallback
      setTimeout(() => {
        if (map.getZoom() < 15) {
          console.log("🔄 Fallback zoom - forcing zoom level");
          map.flyTo({
            center: [longitude, latitude],
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
  
  if (trackCoords.length > 0) {
    const [lastLon, lastLat] = trackCoords[trackCoords.length - 1];
    distanceKm += haversine([lastLat, lastLon], [latitude, longitude]);
  }
  trackCoords.push([longitude, latitude]);

  // elevation gain
  if (altitude !== null && !isNaN(altitude)) {
    if (lastElevation !== null) {
      const diff = altitude - lastElevation;
      if (diff > 1) elevationGain += diff;
    }
    lastElevation = altitude;
  }

  // === Update the polyline ===
  const lineData = {
    type: "Feature",
    geometry: { type: "LineString", coordinates: trackCoords }
  };
  map.getSource(trackSourceId).setData(lineData);
  
  // Debug: Log when we have enough points for a line
  if (trackCoords.length >= 2) {
    console.log(`📍 Track line updated: ${trackCoords.length} points, latest: [${longitude.toFixed(6)}, ${latitude.toFixed(6)}]`);
  }

  // === Update or create current position marker with direction ===
  const point = { 
    type: "Feature", 
    geometry: { type: "Point", coordinates: [longitude, latitude] },
    properties: { heading: heading !== null && !isNaN(heading) ? heading : 0 }
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

  // follow-me camera (only after initial zoom is done)
  if (followMe && hasAutoZoomed) {
    map.easeTo({ center: [longitude, latitude], duration: 1000 });
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

