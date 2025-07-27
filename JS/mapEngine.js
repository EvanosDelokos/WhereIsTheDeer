console.log("Module loaded: mapEngine");

document.addEventListener("DOMContentLoaded", () => {
  const map = L.map('map').setView([-36.5, 146.5], 7);

  // Store the LocalityPolygon but do NOT add it to the map
  fetch('https://witd-api-production.up.railway.app/locality')
    .then(res => res.json())
    .then(data => {
      const localityLayer = L.geoJSON(data, {
        style: {
          color: '#666',
          weight: 1,
          opacity: 0.2,
          fillOpacity: 0.05
        }
      });

      // Stored globally in case you want to toggle later
      window.WITD = window.WITD || {};
      window.WITD.localityLayer = localityLayer;
    });

  // Zones: shown by default
  fetch('https://witd-api-production.up.railway.app/zones')
    .then(res => res.json())
    .then(data => {
// L.geoJSON(data).addTo(map); // ← we don’t want the raw zone dump
    });

  // Optional: scale control
  L.control.scale({ position: 'bottomright' }).addTo(map);

  // Expose map
  window.WITD = window.WITD || {};
  window.WITD.map = map;

  console.log("Map initialized and ready.");
});
