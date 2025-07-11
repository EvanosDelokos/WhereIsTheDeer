console.log("Module loaded: mapEngine");

document.addEventListener("DOMContentLoaded", () => {
  const map = L.map('map').setView([-36.5, 146.5], 7);

  // Optional: Add scale control
  L.control.scale({ position: 'bottomright' }).addTo(map);

  // Expose globally for other modules
  window.WITD = window.WITD || {};
  window.WITD.map = map;

  console.log("Map initialized and ready.");
});
