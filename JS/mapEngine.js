console.log("Module loaded: mapEngine");

document.addEventListener("DOMContentLoaded", () => {
  const map = L.map('map').setView([-36.5, 146.5], 7);

  // After map init
fetch('https://pub-4fb36f4851fc417d8fee38f3358690bb.r2.dev/LocalityPolygon.geojson')
  .then(res => res.json())
  .then(data => {
    L.geoJSON(data).addTo(map);
  });

fetch('https://pub-4fb36f4851fc417d8fee38f3358690bb.r2.dev/zones.json')
  .then(res => res.json())
  .then(data => {
    L.geoJSON(data).addTo(map);
  });


  // Optional: Add scale control
  L.control.scale({ position: 'bottomright' }).addTo(map);

  // Expose globally for other modules
  window.WITD = window.WITD || {};
  window.WITD.map = map;

  console.log("Map initialized and ready.");
});
