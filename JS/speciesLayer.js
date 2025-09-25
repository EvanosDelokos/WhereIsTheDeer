console.log("Module loaded: speciesLayer");

// Function to close any existing species popups
function closeSpeciesPopups() {
  const map = window.WITD?.map;
  if (map) {
    // Close all popups on the map
    const popups = document.querySelectorAll('.mapboxgl-popup');
    popups.forEach(popup => {
      if (popup.closest('.mapboxgl-popup-content')?.textContent?.includes('Species:')) {
        popup.remove();
      }
    });
  }
}

// Make the function globally available
window.closeSpeciesPopups = closeSpeciesPopups;

document.addEventListener("DOMContentLoaded", () => {
  const checkMapReady = setInterval(() => {
    if (window.WITD && window.WITD.map) {
      clearInterval(checkMapReady);
      initSpeciesLayer(window.WITD.map);
    }
  }, 100);
});

function initSpeciesLayer(map) {
  // Initialize storage for species layer groups (Mapbox GL JS approach)
  if (!window.WITD) window.WITD = {};
  
  window.WITD.speciesLayers = {};
  window.WITD.currentSpeciesLayer = null;
  
  // Fetch zones data and create layer groups
  fetch('https://zones.whereisthedeer.com.au/zones')
    .then(res => res.json())
    .then(data => {
      console.log(`Zones loaded: ${data.features.length} features`);

      // Process each feature and categorize by species
      const speciesData = {
        "Deer": { type: "FeatureCollection", features: [] },
        "Hog Deer": { type: "FeatureCollection", features: [] },
        "Duck": { type: "FeatureCollection", features: [] }
        // "Stubble Quail": { type: "FeatureCollection", features: [] },
        // "Pest": { type: "FeatureCollection", features: [] }
      };

      data.features.forEach(feature => {
        const props = feature.properties;
        let species = null;

        if (props.DEERSAMBCD || props.DEERREDFCD || props.DEERFALCD || props.DEERCHICD || props.DEERRUSCD) {
          species = "Deer";
        } else if (props.DEERHOGCD) {
          species = "Hog Deer";
        } else if (props.BIRDDUCKCD) {
          species = "Duck";
        }
        // } else if (props.BIRDQUALCD) {
        //   species = "Stubble Quail";
        // } else if (props.PESTCD) {
        //   species = "Pest";
        // }

        if (species && speciesData[species]) {
          speciesData[species].features.push(feature);
        }
      });

      // Store the processed data globally for use by switchSpeciesLayer
      window.WITD.speciesData = speciesData;
      
      console.log("Species layers grouped & ready.");
      console.log("Species counts:", Object.keys(speciesData).map(key => 
        `${key}: ${speciesData[key].features.length}`
      ).join(", "));
    })
    .catch(err => console.error("Failed to load zones from API:", err));
}

window.switchSpeciesLayer = function(name) {
  const map = window.WITD.map;
  const speciesData = window.WITD.speciesData;

  // Defensive check for speciesData
  if (!speciesData || typeof speciesData !== 'object') {
    console.warn('switchSpeciesLayer: window.WITD.speciesData is not initialized.');
    return;
  }

  // Remove existing species layers first
  const layersToRemove = ['species-fill', 'species-line'];
  layersToRemove.forEach(layerId => {
    if (map.getLayer(layerId)) {
      map.removeLayer(layerId);
    }
  });

  // Remove existing source
  if (map.getSource('species-source')) {
    map.removeSource('species-source');
  }

  if (name === "OFF") {
    console.log("Species layer turned OFF.");
    window.WITD.currentSpeciesLayer = null;
    return;
  }

  if (speciesData[name]) {
    // Add the data as a source
    map.addSource('species-source', {
      type: 'geojson',
      data: speciesData[name]
    });

    // Add fill layer with the style from the original Leaflet version
    map.addLayer({
      id: 'species-fill',
      type: 'fill',
      source: 'species-source',
      paint: {
        'fill-color': '#FFEDA0',
        'fill-opacity': 0.3
      }
    });

    // Add line layer
    map.addLayer({
      id: 'species-line', 
      type: 'line',
      source: 'species-source',
      paint: {
        'line-color': '#FF7F00',
        'line-width': 1
      }
    });

    // Add popup functionality (only when not drawing or placing pins)
    map.on('click', 'species-fill', (e) => {
      console.log('[species] Species layer click detected, pinMode:', window.WITD?.pinMode, 'processingPinPlacement:', window.WITD?.processingPinPlacement, 'drawing active:', window.WITD?.draw?.isActive?.(), 'target:', e.originalEvent?.target?.tagName);
      
      // Skip species popup if user is drawing or placing pins
      if ((window.WITD?.draw?.isActive && window.WITD.draw.isActive()) || window.WITD?.pinMode || window.WITD?.processingPinPlacement) {
        console.log('[species] Skipping popup - user is drawing or placing pin');
        return;
      }
      
      if (e.features.length > 0) {
        const feature = e.features[0];
        const props = feature.properties;
        
        new mapboxgl.Popup()
          .setLngLat(e.lngLat)
          .setHTML(`<b>${props.Name || "Unknown"}</b><br>Species: ${name}`)
          .addTo(map);
      }
    });

    // Change cursor on hover (only when not drawing or placing pins)
    map.on('mouseenter', 'species-fill', () => {
      // Don't change cursor if user is drawing or placing pins
      if ((window.WITD?.draw?.isActive && window.WITD.draw.isActive()) || window.WITD?.pinMode || window.WITD?.processingPinPlacement) {
        return;
      }
      map.getCanvas().style.cursor = 'pointer';
    });

    map.on('mouseleave', 'species-fill', () => {
      // Don't change cursor if user is drawing or placing pins
      if ((window.WITD?.draw?.isActive && window.WITD.draw.isActive()) || window.WITD?.pinMode || window.WITD?.processingPinPlacement) {
        return;
      }
      map.getCanvas().style.cursor = '';
    });

    console.log(`Species layer "${name}" ON.`);
    window.WITD.currentSpeciesLayer = name;
  } else {
    console.warn(`Species layer "${name}" not found.`);
    window.WITD.currentSpeciesLayer = null;
  }
};
