console.log("Module loaded: speciesLayer");

document.addEventListener("DOMContentLoaded", () => {
  const checkMapReady = setInterval(() => {
    if (window.WITD && window.WITD.map) {
      clearInterval(checkMapReady);
      initSpeciesLayer(window.WITD.map);
    }
  }, 100);
});

function initSpeciesLayer(map) {
  const deerLayer = L.layerGroup();
  const hogDeerLayer = L.layerGroup();
  const duckLayer = L.layerGroup();
  const quailLayer = L.layerGroup();
  const pestLayer = L.layerGroup();

  fetch('https://witd-api-production.up.railway.app/zones')
    .then(res => res.json())
    .then(data => {
      console.log(`Zones loaded: ${data.features.length} features`);

      L.geoJSON(data, {
        interactive: false,
        onEachFeature: (feature, layer) => {
          const props = feature.properties;
          let species = null;

          if (props.DEERSAMBCD || props.DEERREDFCD || props.DEERFALCD || props.DEERCHICD || props.DEERRUSCD) {
            species = "Deer";
          } else if (props.DEERHOGCD) {
            species = "Hog Deer";
          } else if (props.BIRDDUCKCD) {
            species = "Duck";
          } else if (props.BIRDQUALCD) {
            species = "Stubble Quail";
          } else if (props.PESTCD) {
            species = "Pest";
          }

          if (!species) return;

const speciesStyle = {
  color: "#FF7F00",
  weight: 1,
  fillColor: "#FFEDA0",
  fillOpacity: 0.3
};

layer.setStyle(speciesStyle);

          layer.bindPopup(`<b>${props.Name || "Unknown"}</b><br>Species: ${species}`);

          if (species === "Deer") deerLayer.addLayer(layer);
          if (species === "Hog Deer") hogDeerLayer.addLayer(layer);
          if (species === "Duck") duckLayer.addLayer(layer);
          if (species === "Stubble Quail") quailLayer.addLayer(layer);
          if (species === "Pest") pestLayer.addLayer(layer);
        }
      });

      console.log("Species layers grouped & ready.");

      // Store the groups globally
      window.WITD.speciesLayers = {
        Deer: deerLayer,
        "Hog Deer": hogDeerLayer,
        Duck: duckLayer,
        "Stubble Quail": quailLayer,
        Pest: pestLayer
      };
    })
    .catch(err => console.error("Failed to load zones from API:", err));
}


window.switchSpeciesLayer = function(name) {
  const map = window.WITD.map;
  const groups = window.WITD.speciesLayers;

  // Defensive check for speciesLayers
  if (!groups || typeof groups !== 'object') {
    console.warn('switchSpeciesLayer: window.WITD.speciesLayers is not initialized.');
    return;
  }

  // Remove all species layers first
  Object.values(groups).forEach(group => map.removeLayer(group));

  if (name === "OFF") {
    console.log("Species layer turned OFF.");
    window.WITD.currentSpeciesLayer = null;
    return;
  }

  if (groups[name]) {
    groups[name].addTo(map);
    console.log(`Species layer "${name}" ON.`);
    window.WITD.currentSpeciesLayer = groups[name];
  } else {
    console.warn(`Species layer "${name}" not found.`);
    window.WITD.currentSpeciesLayer = null;
  }
};
