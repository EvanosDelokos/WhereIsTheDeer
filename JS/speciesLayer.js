console.log("Module loaded: speciesLayer");

document.addEventListener("DOMContentLoaded", () => {
  const map = window.WITD.map;

  // Create species layer groups
  const deerLayer = L.layerGroup();
  const hogDeerLayer = L.layerGroup();
  const duckLayer = L.layerGroup();
  const quailLayer = L.layerGroup();
  const pestLayer = L.layerGroup();

  // Load zones.geojson once
fetch('https://f004.backblazeb2.com/file/whereisthedeer/zones.json')
    .then(res => res.json())
    .then(data => {
      console.log(`Zones loaded: ${data.features.length} features`);

      L.geoJSON(data, {
        style: { color: '#FF7F00', weight: 1, opacity: 0.5, fillColor: '#FFEDA0', fillOpacity: 0.3 },
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

          layer.bindPopup(`<b>${props.Name || "Unknown"}</b><br>Species: ${species}`);

          if (species === "Deer") deerLayer.addLayer(layer);
          if (species === "Hog Deer") hogDeerLayer.addLayer(layer);
          if (species === "Duck") duckLayer.addLayer(layer);
          if (species === "Stubble Quail") quailLayer.addLayer(layer);
          if (species === "Pest") pestLayer.addLayer(layer);
        }
      });

      console.log("Species layers grouped & ready.");
    })
    .catch(err => console.error("Failed to load zones.json:", err));

  // Store the groups globally
  window.WITD.speciesLayers = {
    Deer: deerLayer,
    "Hog Deer": hogDeerLayer,
    Duck: duckLayer,
    "Stubble Quail": quailLayer,
    Pest: pestLayer
  };
});

window.switchSpeciesLayer = function(name) {
  const map = window.WITD.map;
  const groups = window.WITD.speciesLayers;

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
