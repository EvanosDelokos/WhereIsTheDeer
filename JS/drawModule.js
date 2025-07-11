console.log("Module loaded: drawModule (Refined Final Clean)");

import { saveTracks, loadTracks } from './storeManager.js';

document.addEventListener("DOMContentLoaded", () => {
  const map = window.WITD.map;

  let drawMode = false;
  let currentPolyline = null;
  let currentPoints = [];
  let currentMarkers = [];
  let drawnTracks = [];

  const drawTrackBtn = document.getElementById("drawTrackBtn");

  const startIcon = L.icon({ iconUrl: 'Images/StartPin.svg', iconSize: [32, 32], iconAnchor: [16, 32] });
  const middleOrangeIcon = L.icon({ iconUrl: 'Images/MiddlePinOrange.svg', iconSize: [32, 32], iconAnchor: [16, 32] });
  const middleYellowIcon = L.icon({ iconUrl: 'Images/MiddlePinYellow.svg', iconSize: [32, 32], iconAnchor: [16, 32] });
  const finishIcon = L.icon({ iconUrl: 'Images/FinishFlag.svg', iconSize: [32, 32], iconAnchor: [16, 32] });

  drawTrackBtn.addEventListener("click", () => {
    if (!drawMode) {
      drawMode = true;
      drawTrackBtn.classList.add("active");
      drawTrackBtn.innerHTML = "✅";
      console.log("Draw mode: ON");
    } else {
      finishDrawing();
    }
  });

  map.on("click", (e) => {
    if (!drawMode) return;

    const { lat, lng } = e.latlng;
    currentPoints.push([lat, lng]);

    if (currentPoints.length === 1) {
      const marker = L.marker([lat, lng], { icon: startIcon }).addTo(map).bindPopup("Start");
      currentMarkers.push(marker);
    } else {
      const icon = (currentPoints.length % 2 === 0) ? middleOrangeIcon : middleYellowIcon;
      const marker = L.marker([lat, lng], { icon }).addTo(map).bindPopup(`Point ${currentPoints.length}`);
      currentMarkers.push(marker);
    }

    if (!currentPolyline) {
      currentPolyline = L.polyline(currentPoints, { color: 'red' }).addTo(map);
    } else {
      currentPolyline.setLatLngs(currentPoints);
    }
  });

  function finishDrawing() {
    if (currentPoints.length < 2) {
      console.log("Too few points, discarding.");
      clearCurrent();
      return;
    }

    const lastMarker = currentMarkers.pop();
    if (lastMarker) map.removeLayer(lastMarker);

    const endLatLng = currentPoints[currentPoints.length - 1];
    const endMarker = L.marker(endLatLng, { icon: finishIcon }).addTo(map).bindPopup("End");
    currentMarkers.push(endMarker);

    const midIndex = Math.floor(currentPoints.length / 2);
    const midLatLng = currentPoints[midIndex];
    const midLabel = L.marker(midLatLng, {
      icon: L.divIcon({
        className: 'track-label',
        html: `Unnamed <span class="rename">✏️</span> <span class="delete">🗑️</span> <span class="export">⬇️</span>`,
        iconSize: [140, 20]
      })
    }).addTo(map);

    const markerTypes = currentMarkers.map((m, i) => {
      if (i === 0) return 'start';
      if (i === currentMarkers.length - 1) return 'end';
      return 'mid';
    });

    const track = {
      polyline: currentPolyline,
      markers: [...currentMarkers],
      midLabel: midLabel,
      points: [...currentPoints],
      markerTypes,
      name: "Unnamed"
    };

    midLabel.on("click", (e) => {
      const target = e.originalEvent.target;
      if (target.classList.contains("rename")) inlineRename(track);
      else if (target.classList.contains("delete")) deleteTrack(track);
      else if (target.classList.contains("export")) exportGPX(track);
    });

    drawnTracks.push(track);
    saveTracks(drawnTracks);

    clearCurrent();
    console.log("Track saved:", track);
  }

  function inlineRename(track) {
    const html = `<input type="text" value="${track.name}" style="width:80px;" /> <button>Save</button>`;

    track.midLabel.setIcon(L.divIcon({
      className: 'track-label',
      html: html,
      iconSize: [140, 20]
    }));

    const container = track.midLabel.getElement();
    const input = container.querySelector("input");
    const saveBtn = container.querySelector("button");

    setTimeout(() => {
      if (track.name === "Unnamed") input.value = "";
      else input.select();
      input.focus();
    }, 0);

    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        save();
      }
    });

    saveBtn.addEventListener("click", save);

    function save() {
      const newName = input.value.trim() || "Unnamed";
      track.name = newName;

      const html = `${newName} <span class="rename">✏️</span> <span class="delete">🗑️</span> <span class="export">⬇️</span>`;

      track.midLabel.setIcon(L.divIcon({
        className: 'track-label',
        html: html,
        iconSize: [140, 20]
      }));

      saveTracks(drawnTracks);
    }
  }

  function deleteTrack(track) {
    map.removeLayer(track.polyline);
    track.markers.forEach(m => map.removeLayer(m));
    map.removeLayer(track.midLabel);
    drawnTracks = drawnTracks.filter(t => t !== track);
    saveTracks(drawnTracks);
  }

  function exportGPX(track) {
    let gpx = `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="WhereIsTheDeer">\n  <trk>\n    <name>${track.name}</name>\n    <trkseg>\n`;

    track.points.forEach(p => {
      gpx += `      <trkpt lat="${p[0]}" lon="${p[1]}"></trkpt>\n`;
    });

    gpx += `    </trkseg>\n  </trk>\n</gpx>`;

    const blob = new Blob([gpx], { type: 'application/gpx+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${track.name || "drawn-track"}.gpx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    console.log(`Exported: ${track.name}.gpx`);
  }

  function clearCurrent() {
    currentPoints = [];
    currentMarkers = [];
    currentPolyline = null;
    drawTrackBtn.classList.remove("active");
    drawTrackBtn.innerHTML = "✏️";
    drawMode = false;
  }

  loadTracks(
    map,
    drawnTracks,
    (line, name, markerTypesRaw) => {
      const markerTypes = markerTypesRaw || [];
      const latlngs = line.getLatLngs();

      const markers = latlngs.map((latlng, i) => {
        let icon;
        if (markerTypes[i] === 'start') icon = startIcon;
        else if (markerTypes[i] === 'end') icon = finishIcon;
        else icon = i % 2 === 0 ? middleOrangeIcon : middleYellowIcon;

        return L.marker(latlng, { icon }).addTo(map);
      });

      const midIndex = Math.floor(latlngs.length / 2);
      const midLatLng = latlngs[midIndex];

      const midLabel = L.marker(midLatLng, {
        icon: L.divIcon({
          className: 'track-label',
          html: `${name || "Unnamed"} <span class="rename">✏️</span> <span class="delete">🗑️</span> <span class="export">⬇️</span>`,
          iconSize: [140, 20]
        })
      }).addTo(map);

      const track = {
        polyline: line,
        midLabel: midLabel,
        markers: markers,
        points: latlngs.map(ll => [ll.lat, ll.lng]),
        markerTypes: markerTypes,
        name: name || "Unnamed"
      };

      midLabel.on("click", (e) => {
        const target = e.originalEvent.target;
        if (target.classList.contains("rename")) inlineRename(track);
        else if (target.classList.contains("delete")) deleteTrack(track);
        else if (target.classList.contains("export")) exportGPX(track);
      });

      drawnTracks.push(track);
    }
  );
});
