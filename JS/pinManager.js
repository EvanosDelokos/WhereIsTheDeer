console.log("Module loaded: pinManager (Refined + DivIcon Label + Centered + Reload)");

import { savePins, loadPins } from './storeManager.js';

document.addEventListener("DOMContentLoaded", () => {
  const map = window.WITD.map;

  window.WITD.pinMode = false; 
  const customPins = [];

  const addPinBtn = document.getElementById("addPinBtn");
  const clearPinsBtn = document.getElementById("clearPinsBtn");
  clearPinsBtn.addEventListener("click", () => {
  // Show confirm dialog
  if (confirm("Are you sure you want to delete ALL placed pins?")) {
    // Your existing pin clearing logic here
    clearAllPins(); // ← whatever your function is called
  }
});

  addPinBtn.addEventListener("click", () => {
    window.WITD.pinMode = !window.WITD.pinMode;
    addPinBtn.classList.toggle("active", window.WITD.pinMode);
    console.log(`Pin mode: ${window.WITD.pinMode ? "ON" : "OFF"}`);
  });

  clearPinsBtn.addEventListener("click", () => {
    customPins.forEach(pin => {
      map.removeLayer(pin.marker);
      if (pin.labelMarker) map.removeLayer(pin.labelMarker);
    });
    customPins.length = 0;
    savePins(customPins);
    console.log("All pins cleared");
  });

  map.on("click", (e) => {
    if (!window.WITD.pinMode) return;

    const { lat, lng } = e.latlng;

    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = "Pin name";
    input.style.width = "140px";

    const saveBtn = document.createElement("button");
    saveBtn.textContent = "Save";
    saveBtn.style.marginLeft = "6px";

    const cancelBtn = document.createElement("button");
    cancelBtn.textContent = "Cancel";
    cancelBtn.style.marginLeft = "6px";

    const popupContent = document.createElement("div");
    popupContent.appendChild(input);
    popupContent.appendChild(saveBtn);
    popupContent.appendChild(cancelBtn);

    const marker = L.marker([lat, lng]).addTo(map).bindPopup(popupContent).openPopup();

    const pin = { marker, name: "", lat, lng, labelMarker: null };
    customPins.push(pin);

    setTimeout(() => input.focus(), 0);

    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        savePin();
      }
    });

    saveBtn.addEventListener("click", savePin);
    cancelBtn.addEventListener("click", cancelPin);

    function savePin() {
      const name = input.value.trim() || "Unnamed Pin";
      const details = `
        <b>${name}</b><br>
        Lat: ${lat.toFixed(5)}<br>
        Lon: ${lng.toFixed(5)}<br><br>
        <button class="rename-btn">✏️ Rename</button>
        <button class="delete-btn">🗑️ Delete</button>
      `;

      marker.setPopupContent(details).openPopup();

      const labelIcon = L.divIcon({
        className: 'marker-text-box',
        html: `<div class="label-inner">${name}</div>`,
        iconSize: null,
        iconAnchor: [0, -25] // push above pin
      });

      const labelMarker = L.marker([lat, lng], { icon: labelIcon }).addTo(map);

      pin.name = name;
      pin.labelMarker = labelMarker;

      bindPopupActions(marker, pin);
      savePins(customPins);

      window.WITD.pinMode = false;
      addPinBtn.classList.remove("active");
    }

    function cancelPin() {
      map.removeLayer(marker);
      const index = customPins.indexOf(pin);
      if (index > -1) customPins.splice(index, 1);
      savePins(customPins);

      window.WITD.pinMode = false;
      addPinBtn.classList.remove("active");
    }
  });

  // ✅ Renamed to bindPopupActions for NEW pins
  function bindPopupActions(marker, pin) {
    marker.getPopup().getElement().addEventListener("click", (e) => {
      if (e.target.classList.contains("rename-btn")) {
        reopenRename(marker, pin);
      } else if (e.target.classList.contains("delete-btn")) {
        map.removeLayer(marker);
        if (pin.labelMarker) map.removeLayer(pin.labelMarker);
        const index = customPins.indexOf(pin);
        if (index > -1) customPins.splice(index, 1);
        savePins(customPins);
      }
    });
  }

  function reopenRename(marker, pin) {
    const input = document.createElement("input");
    input.type = "text";
    input.value = pin.name || "";
    input.style.width = "140px";

    const saveBtn = document.createElement("button");
    saveBtn.textContent = "Save";
    saveBtn.style.marginLeft = "6px";

    const popupContent = document.createElement("div");
    popupContent.appendChild(input);
    popupContent.appendChild(saveBtn);

    marker.setPopupContent(popupContent).openPopup();

    setTimeout(() => input.focus(), 0);

    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        saveRename();
      }
    });

    saveBtn.addEventListener("click", saveRename);

    function saveRename() {
      const newName = input.value.trim() || "Unnamed Pin";
      pin.name = newName;

      const details = `
        <b>${newName}</b><br>
        Lat: ${pin.lat.toFixed(5)}<br>
        Lon: ${pin.lng.toFixed(5)}<br><br>
        <button class="rename-btn">✏️ Rename</button>
        <button class="delete-btn">🗑️ Delete</button>
      `;

      marker.setPopupContent(details).openPopup();

      if (pin.labelMarker) {
        map.removeLayer(pin.labelMarker);
      }

      const labelIcon = L.divIcon({
        className: 'marker-text-box',
        html: `<div class="label-inner">${newName}</div>`,
        iconSize: null,
        iconAnchor: [0, 0]
      });

      pin.labelMarker = L.marker([pin.lat, pin.lng], { icon: labelIcon }).addTo(map);

      savePins(customPins);
    }
  }

  // ✅ Export the reopenRename for loaded pins
  const attachPopupActions = {
    reopenRename,
  };

  // ✅ Load saved pins with safe popupopen pattern
  loadPins(map, customPins, attachPopupActions);
});
