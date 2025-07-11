console.log("Module loaded: mapEngine");

document.addEventListener("DOMContentLoaded", () => {
  const map = L.map('map').setView([-36.5, 146.5], 7);

  // After map init
fetch('https://f004.backblazeb2.com/file/whereisthedeer/LocalityPolygon.geojson')
  .then(res => res.json())
  .then(data => {
    L.geoJSON(data).addTo(map);
  });

fetch('https://f004.backblazeb2.com/file/whereisthedeer/zones.json')
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
