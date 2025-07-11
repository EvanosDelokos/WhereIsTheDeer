console.log("Module loaded: layerManager");

document.addEventListener("DOMContentLoaded", () => {
  const map = window.WITD.map;

  // --- Base layers ---
  const terrain = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors',
    maxZoom: 19
  });

  const satellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    attribution: '© Esri World Imagery',
    maxZoom: 19
  });

  const contours = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenTopoMap',
    maxZoom: 14
  });

  terrain.addTo(map);

  window.WITD.baseLayers = { terrain, satellite, contours };
  window.WITD.activeSpeciesLayer = null; // ✅ Track active species

  console.log("Layer Manager ready: Terrain loaded by default.");

});

// --- Base layer switch ---
window.switchBaseLayer = function(name) {
  const map = window.WITD.map;
  const layers = window.WITD.baseLayers;

  Object.values(layers).forEach(layer => map.removeLayer(layer));

  if (layers[name.toLowerCase()]) {
    layers[name.toLowerCase()].addTo(map);
  } else if (layers[name]) {
    layers[name].addTo(map);
  } else {
    console.warn(`Base layer "${name}" not found.`);
  }
};