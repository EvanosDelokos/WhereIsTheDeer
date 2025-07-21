console.log("Module loaded: storeManager");

// --- Pins ---
export function savePins(customPins) {
  const saveData = customPins.map(pin => ({
    name: pin.name,
    lat: pin.lat,
    lng: pin.lng
  }));
  localStorage.setItem('witd_pins', JSON.stringify(saveData));
}

export function loadPins(map, customPins, attachPopupActions) {
  const savedPins = JSON.parse(localStorage.getItem('witd_pins') || '[]');
  savedPins.forEach(data => {
    const marker = L.marker([data.lat, data.lng]).addTo(map);

    marker.bindPopup(
      `<b>${data.name}</b><br>
      Lat: ${data.lat.toFixed(5)}<br>
      Lon: ${data.lng.toFixed(5)}<br><br>
      <button class="rename-btn">✏️ Rename</button>
      <button class="delete-btn">🗑️ Delete</button>
      <button class="journal-btn">📓 Send to Journal</button>`
    );

    const labelIcon = L.divIcon({
      className: 'marker-text-box',
      html: `<div class="label-inner">${data.name}</div>`,
      iconSize: null,
      iconAnchor: [0, -25]
    });
    const labelMarker = L.marker([data.lat, data.lng], { icon: labelIcon }).addTo(map);

    const pin = { marker, name: data.name, lat: data.lat, lng: data.lng, labelMarker };
    customPins.push(pin);

    marker.on("popupopen", (e) => {
      const el = e.popup.getElement();
      if (!el || el.dataset.hasListener) return;
      el.dataset.hasListener = "true";
    
      el.addEventListener("click", (evt) => {
        if (evt.target.classList.contains("rename-btn")) {
          attachPopupActions.reopenRename(marker, pin);
        } else if (evt.target.classList.contains("delete-btn")) {
          map.removeLayer(marker);
          if (pin.labelMarker) map.removeLayer(pin.labelMarker);
          const index = customPins.indexOf(pin);
          if (index > -1) customPins.splice(index, 1);
          savePins(customPins);
        } else if (evt.target.classList.contains("journal-btn")) {
          if (typeof initJournal === "function") {
            initJournal();
            setTimeout(() => {
              const journalModal = document.getElementById('journalModal');
              const journalBtn = document.getElementById('toolbarJournalBtn');
              openPopupAboveButton(journalModal, journalBtn, true);
    
              const titleEl = document.getElementById('journalTitle');
              const coordsEl = document.getElementById('journalCoords');
              const noteEl = document.getElementById('journalNote');
    
              if (titleEl && coordsEl && noteEl) {
                titleEl.value = pin.name;
                coordsEl.value = `${pin.lat.toFixed(5)}, ${pin.lng.toFixed(5)}`;
                noteEl.focus();
              }
    
              if (openPopup && openButton) {
                positionPopup(openPopup, openButton, openAlignRight);
              }
            }, 50);
          } else {
            alert("Journal module not loaded.");
          }
        }
      });
    });
  });
}

// --- Tracks ---
export function saveTracks(drawnTracks) {
  const saveData = drawnTracks.map(track => ({
    coords: track.points || [],
    name: track.name || '',
    markerTypes: track.markerTypes || []
  }));
  localStorage.setItem('witd_tracks', JSON.stringify(saveData));
}

export function loadTracks(map, drawnTracks, drawTrackLabel) {
  const savedTracks = JSON.parse(localStorage.getItem('witd_tracks') || '[]');
  savedTracks.forEach(data => {
    if (data.coords && data.coords.length >= 2) {
      const line = L.polyline(data.coords, { color: 'red' }).addTo(map);
      drawTrackLabel(line, data.name, data.markerTypes);
      drawnTracks.push({ line, coords: data.coords, markerTypes: data.markerTypes, name: data.name });
    } else {
      console.warn('Skipped empty or invalid track:', data);
    }
  });
}

// --- Weather Marker ---
// (Removed: no longer saving/loading weather marker in localStorage)

// --- GPX ---
export function saveGpxFiles(gpxFiles) {
  localStorage.setItem('witd_gpx_files', JSON.stringify(gpxFiles));
}

export function loadGpxFiles(map, gpxFiles, addGpxToMap) {
  const saved = JSON.parse(localStorage.getItem('witd_gpx_files') || '[]');
  saved.forEach(file => {
    addGpxToMap(file.name, file.content);
    gpxFiles.push(file);
  });
}

// --- Clear All ---
export function clearAll() {
  localStorage.removeItem('witd_pins');
  localStorage.removeItem('witd_tracks');
  localStorage.removeItem('witd_gpx_files');
}
