console.log("Module loaded: gpxManager (FINAL DROP-IN — Clean, Dedupe, No Zoom)");

import { saveGpxFiles, loadGpxFiles } from './storeManager.js';

document.addEventListener("DOMContentLoaded", () => {
  const map = window.WITD.map;

  const gpxUpload = document.getElementById("gpxUpload");
  const gpxList = document.getElementById("gpxList");
  const removeGpx = document.getElementById("removeGpx");

  const gpxFiles = [];

  // Icons
  const startIcon = L.icon({
    iconUrl: 'Images/StartPin.svg',
    iconSize: [32, 32],
    iconAnchor: [16, 32]
  });

  const middleOrangeIcon = L.icon({
    iconUrl: 'Images/MiddlePinOrange.svg',
    iconSize: [32, 32],
    iconAnchor: [16, 32]
  });

  const middleYellowIcon = L.icon({
    iconUrl: 'Images/MiddlePinYellow.svg',
    iconSize: [32, 32],
    iconAnchor: [16, 32]
  });

  const finishIcon = L.icon({
    iconUrl: 'Images/FinishFlag.svg',
    iconSize: [32, 32],
    iconAnchor: [16, 32]
  });

  console.log("GPX Icons ready.");

  gpxUpload.addEventListener("change", (event) => {
    const files = event.target.files;

    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target.result;

        // ✅ New upload: fit, mark source as upload
        addGpxToMap(file.name, content, { fitBounds: true, source: "upload" });
      };
      reader.readAsText(file);
    });

    gpxUpload.value = "";
  });

  removeGpx.addEventListener("click", () => {
    gpxFiles.forEach(entry => {
      map.removeLayer(entry.line);
      entry.allMarkers.forEach(m => map.removeLayer(m));
      map.removeLayer(entry.midLabel);
    });
    gpxFiles.length = 0;
    gpxList.innerHTML = "";
    saveGpxFiles([]); // fully clear storage
    console.log("All GPX tracks cleared.");
  });

  function addGpxToMap(name, content, options = { fitBounds: true, source: "upload" }) {
    const gpx = new L.GPX(content, {
      async: true,
      marker_options: {
        startIconUrl: null,
        endIconUrl: null,
        shadowUrl: null,
        wptIconUrls: { '': null }
      }
    })
    .on('loaded', function(e) {
      if (options.fitBounds) {
        map.fitBounds(e.target.getBounds());
      }

      const line = e.target;

      let points = [];
      line.eachLayer(layer => {
        if (layer instanceof L.Polyline) {
          points.push(...layer.getLatLngs());
        }
      });

      console.log(`GPX "${name}" Points:`, points.length);

      if (!points.length) {
        console.warn("No polyline points found.");
        return;
      }

      const allMarkers = [];

      // Start marker
      const startMarker = L.marker(points[0], { icon: startIcon }).addTo(map);
      allMarkers.push(startMarker);

      // Middle pins
      for (let i = 1; i < points.length - 1; i++) {
        const icon = (i % 2 === 0) ? middleOrangeIcon : middleYellowIcon;
        const midMarker = L.marker(points[i], { icon }).addTo(map);
        allMarkers.push(midMarker);
      }

      // End marker
      const endMarker = L.marker(points[points.length - 1], { icon: finishIcon }).addTo(map);
      allMarkers.push(endMarker);

      // Single mid label
      const midIndex = Math.floor(points.length / 2);
      const midLabel = L.marker(points[midIndex], {
        icon: L.divIcon({
          className: 'gpx-label',
          html: `${name} 🗑️`,
          iconSize: [100, 20]
        })
      }).addTo(map);

      // Sidebar
      const listItem = document.createElement("div");
      listItem.className = "gpx-item";
      listItem.innerHTML = `
        <span class="file-name">${name}</span>
        <span class="delete-btn">🗑️</span>
      `;
      gpxList.appendChild(listItem);

      function removeThisGpx() {
        map.removeLayer(line);
        allMarkers.forEach(m => map.removeLayer(m));
        map.removeLayer(midLabel);
        listItem.remove();

        // ✅ Remove ALL matching clones from in-memory
        for (let i = gpxFiles.length - 1; i >= 0; i--) {
          if (gpxFiles[i].name === name && gpxFiles[i].content === content) {
            gpxFiles.splice(i, 1);
          }
        }

        // ✅ Save only { name, content } list
        saveGpxFiles(gpxFiles.map(f => ({ name: f.name, content: f.content })));

        console.log(`Deleted GPX: ${name}`);
      }

      midLabel.on("click", removeThisGpx);
      listItem.querySelector(".delete-btn").addEventListener("click", removeThisGpx);

      // ✅ Always push live version for tracking
      gpxFiles.push({
        name,
        content,
        line,
        allMarkers,
        midLabel
      });

      if (options.source === "upload") {
        saveGpxFiles(gpxFiles.map(f => ({ name: f.name, content: f.content })));
      }

    })
    .addTo(map);
  }

  // ✅ Reload: no zoom, marks source = reload, disables re-save
  loadGpxFiles(map, gpxFiles, (name, content) => {
    addGpxToMap(name, content, { fitBounds: false, source: "reload" });
  });
});
