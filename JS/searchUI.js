console.log('[SearchUI] ===== MODULE STARTING (Mapbox Version) =====');
console.log('[SearchUI] Module loaded - Mapbox-based search initialization...');

// Global variables
let searchInput = null;
let suggestionsBox = null;
let searchMarker = null; // Store single search marker
let map = null; // Reference to Mapbox map

// Initialize search when map is ready
function initSearchBar() {
  console.log('[SearchUI] Initializing search bar...');
  
  // Get map reference
  map = window.WITD?.map;
  if (!map) {
    console.error('[SearchUI] Map not available yet');
    setTimeout(initSearchBar, 100); // Retry
    return;
  }
  
  // Get DOM elements
  searchInput = document.getElementById('addressSearch');
  suggestionsBox = document.getElementById('addressSuggestions');
  
  if (!searchInput || !suggestionsBox) {
    console.error('[SearchUI] Required DOM elements not found!');
    return;
  }
  
  console.log('[SearchUI] DOM elements found, setting up listeners...');
  setupSearchListeners();
  console.log('[SearchUI] Search listeners setup complete ✅');
}

// Setup search input listeners
function setupSearchListeners() {
  // Debounced input listener
  let debounceTimer;
  searchInput.addEventListener('input', async function(e) {
    clearTimeout(debounceTimer);
    const query = e.target.value.trim();
    
    if (query.length < 2) {
      suggestionsBox.style.display = 'none';
      suggestionsBox.innerHTML = '';
      return;
    }
    
    debounceTimer = setTimeout(async () => {
      await handleSearch(query);
    }, 300);
  });

  // Enter key picks first suggestion
  searchInput.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      const first = suggestionsBox.querySelector('.suggestion');
      if (first) first.click();
    }
  });

  // Select all text when input is focused (for easy replacement)
  searchInput.addEventListener('focus', function(e) {
    // Small delay to ensure the input is fully focused before selecting
    setTimeout(() => {
      e.target.select();
    }, 10);
  });

  // Click outside hides suggestions
  document.addEventListener('click', function(e) {
    if (!searchInput.contains(e.target) && !suggestionsBox.contains(e.target)) {
      suggestionsBox.style.display = 'none';
    }
  });
}

// Handle search query
async function handleSearch(query) {
  console.log('[SearchUI] Searching for:', query);
  
  // Check if query looks like coordinates
  const coords = parseCoordinates(query);
  if (coords) {
    suggestionsBox.innerHTML = `<div class="suggestion" data-lng="${coords.lng}" data-lat="${coords.lat}">📍 Go to ${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}</div>`;
    suggestionsBox.style.display = 'block';
    
    // Add click listener
    suggestionsBox.querySelector('.suggestion').addEventListener('click', () => {
      flyToCoords(coords.lat, coords.lng, query);
      suggestionsBox.style.display = 'none';
    });
    return;
  }
  
  // Otherwise, use Mapbox Geocoding API
  await performMapboxSearch(query);
}

// Perform Mapbox geocoding search
async function performMapboxSearch(query) {
  if (typeof MAPBOX_TOKEN === 'undefined' || MAPBOX_TOKEN === 'YOUR_MAPBOX_TOKEN_HERE') {
    console.error('[SearchUI] Mapbox token not configured');
    suggestionsBox.innerHTML = '<div class="suggestion">⚠️ Search not available</div>';
    suggestionsBox.style.display = 'block';
    return;
  }
  
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${MAPBOX_TOKEN}&country=AU&autocomplete=true&limit=5`;
  
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    console.log('[SearchUI] Mapbox API response:', data);
    
    showMapboxSuggestions(data.features || []);
  } catch (error) {
    console.error('[SearchUI] Mapbox search error:', error);
    suggestionsBox.innerHTML = '<div class="suggestion">⚠️ Search error</div>';
    suggestionsBox.style.display = 'block';
  }
}

// Show Mapbox geocoding suggestions
function showMapboxSuggestions(features) {
  suggestionsBox.innerHTML = '';
  
  if (features.length === 0) {
    suggestionsBox.innerHTML = '<div class="suggestion">No results found</div>';
    suggestionsBox.style.display = 'block';
    return;
  }
  
  features.forEach(feature => {
    const div = document.createElement('div');
    div.className = 'suggestion';
    div.textContent = feature.place_name;
    div.dataset.lng = feature.center[0];
    div.dataset.lat = feature.center[1];
    
    div.addEventListener('click', () => {
      const lng = parseFloat(div.dataset.lng);
      const lat = parseFloat(div.dataset.lat);
      flyToCoords(lat, lng, feature.place_name);
      searchInput.value = feature.place_name;
      suggestionsBox.style.display = 'none';
    });

    suggestionsBox.appendChild(div);
  });

  suggestionsBox.style.display = 'block';
}

// Fly to coordinates and add marker
function flyToCoords(lat, lng, placeName) {
  if (!map) {
    console.error('[SearchUI] Map not available');
    return;
  }
  
  console.log('[SearchUI] Flying to:', lat, lng);
  
  // Remove old marker if exists
  if (searchMarker) {
    searchMarker.remove();
    searchMarker = null;
  }
  
  // Fly to location
  map.flyTo({
    center: [lng, lat],
    zoom: 14,
    duration: 1500
  });
  
  // Create new Mapbox marker
  const el = document.createElement('div');
  el.className = 'search-marker';
  el.style.backgroundImage = 'url(Images/RedMarkerPin.svg)';
  el.style.width = '40px';
  el.style.height = '40px';
  el.style.backgroundSize = '100%';
  el.style.cursor = 'pointer';
  
  searchMarker = new mapboxgl.Marker(el)
    .setLngLat([lng, lat])
    .setPopup(
      new mapboxgl.Popup({ 
        offset: 25,
        closeButton: true,
        closeOnClick: true // Allow closing by clicking elsewhere on map
      })
        .setHTML(`
          <div class="search-marker-popup">
            <div class="search-marker-content">
              <span class="search-marker-text">
                ${placeName || `${lat.toFixed(5)}, ${lng.toFixed(5)}`}
              </span>
              <button id="delete-search-marker" class="search-marker-delete">🗑️</button>
            </div>
          </div>
        `)
    )
    .addTo(map);
  
  // Open popup initially
  searchMarker.togglePopup();
  
  // Add delete button listener after popup opens
  setTimeout(() => {
    const deleteBtn = document.getElementById('delete-search-marker');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation(); // Prevent marker click event
        if (searchMarker) {
          searchMarker.remove();
          searchMarker = null;
        }
      });
    }
  }, 100);
  
  // Make marker clickable to reopen popup
  el.addEventListener('click', (e) => {
    e.stopPropagation(); // Prevent map click event
    if (searchMarker) {
      searchMarker.togglePopup();
    }
  });
}

// ===== Coordinate Parsing Helpers =====
function parseCoordinates(input) {
  // Remove "lat/lon" labels, commas, semicolons
  let cleaned = input
    .replace(/lat(itude)?[:=\s]*/i, '')
    .replace(/lon(gitude)?[:=\s]*/i, '')
    .replace(/[;,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // === Decimal Degrees (DD) ===
  // -36.44758 146.72305
  const decimalRegex = /^\s*(-?\d{1,2}\.\d+)\s+(-?\d{1,3}\.\d+)\s*$/;
  const matchDecimal = cleaned.match(decimalRegex);
  if (matchDecimal) {
    return { lat: parseFloat(matchDecimal[1]), lng: parseFloat(matchDecimal[2]) };
  }

  // === Degrees Minutes Seconds (DMS) ===
  // 36°26'51"S 146°43'23"E
  const dmsRegex = /(\d+)[°:\s](\d+)[':\s](\d+(?:\.\d+)?)["]?\s*([NSEW])/gi;
  const parts = [...cleaned.matchAll(dmsRegex)];
  if (parts.length === 2) {
    const lat = dmsToDecimal(parts[0]);
    const lng = dmsToDecimal(parts[1]);
    return { lat, lng };
  }

  // === Degrees Decimal Minutes (DDM) ===
  // 36°26.860'S 146°43.383'E
  const ddmRegex = /(\d+)[°:\s](\d+(?:\.\d+))[']?\s*([NSEW])/gi;
  const ddmParts = [...cleaned.matchAll(ddmRegex)];
  if (ddmParts.length === 2) {
    const lat = ddmToDecimal(ddmParts[0]);
    const lng = ddmToDecimal(ddmParts[1]);
    return { lat, lng };
  }

  // === UTM (Universal Transverse Mercator) ===
  // Example: 55H 480000 5960000
  const utmRegex = /^(\d{1,2})([C-HJ-NP-X])\s+(\d{3,7})\s+(\d{4,7})$/i;
  const matchUTM = cleaned.match(utmRegex);
  if (matchUTM) {
    const zone = parseInt(matchUTM[1], 10);
    const band = matchUTM[2].toUpperCase();
    const easting = parseFloat(matchUTM[3]);
    const northing = parseFloat(matchUTM[4]);
    return utmToLatLng(zone, band, easting, northing);
  }

  return null;
}

// Convert DMS -> decimal degrees
function dmsToDecimal(match) {
  let deg = parseFloat(match[1]);
  let min = parseFloat(match[2]);
  let sec = parseFloat(match[3]);
  let hemi = match[4];
  let dec = deg + min / 60 + sec / 3600;
  if (/[SW]/i.test(hemi)) dec = -dec;
  return dec;
}

// Convert DDM -> decimal degrees
function ddmToDecimal(match) {
  let deg = parseFloat(match[1]);
  let min = parseFloat(match[2]);
  let hemi = match[3];
  let dec = deg + min / 60;
  if (/[SW]/i.test(hemi)) dec = -dec;
  return dec;
}

// Convert UTM -> lat/lon (WGS84)
// Simple JS port of Proj4js logic
function utmToLatLng(zone, band, easting, northing) {
  const a = 6378137.0; // WGS84 major axis
  const f = 1 / 298.257223563;
  const k0 = 0.9996;
  const e = Math.sqrt(f * (2 - f));
  const e1sq = e * e / (1 - e * e);

  const x = easting - 500000.0;
  let y = northing;
  if (band < 'N') y -= 10000000.0; // southern hemisphere

  const m = y / k0;
  const mu = m / (a * (1 - e * e / 4 - 3 * e**4 / 64 - 5 * e**6 / 256));

  const phi1Rad = mu
    + (3*e/2 - 27*e**3/32) * Math.sin(2*mu)
    + (21*e**2/16 - 55*e**4/32) * Math.sin(4*mu)
    + (151*e**3/96) * Math.sin(6*mu);
  const n1 = a / Math.sqrt(1 - e*e*Math.sin(phi1Rad)**2);
  const t1 = Math.tan(phi1Rad)**2;
  const c1 = e1sq * Math.cos(phi1Rad)**2;
  const r1 = a * (1 - e*e) / Math.pow(1 - e*e*Math.sin(phi1Rad)**2, 1.5);
  const d = x / (n1*k0);

  const lat = phi1Rad - (n1*Math.tan(phi1Rad)/r1) *
    (d**2/2 - (5+3*t1+10*c1-4*c1**2-9*e1sq)*d**4/24
    + (61+90*t1+298*c1+45*t1**2-252*e1sq-3*c1**2)*d**6/720);
  const lng = (d - (1+2*t1+c1)*d**3/6 + (5-2*c1+28*t1-3*c1**2+8*e1sq+24*t1**2)*d**5/120) / Math.cos(phi1Rad);

  return {
    lat: lat * 180/Math.PI,
    lng: (zone > 0 ? (6*zone - 183) : 3) + lng * 180/Math.PI
  };
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  console.log('[SearchUI] DOM still loading, adding event listener...');
  document.addEventListener('DOMContentLoaded', initSearchBar);
} else {
  console.log('[SearchUI] DOM already loaded, initializing search...');
  initSearchBar();
}

console.log('[SearchUI] ===== MODULE COMPLETE ====='); 