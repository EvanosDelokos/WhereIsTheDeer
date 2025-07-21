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
    console.log("Clear GPX button clicked. Current gpxFiles:", gpxFiles.length);
    gpxFiles.forEach((entry, index) => {
      console.log(`Entry ${index}:`, {
        name: entry.name,
        hasLine: !!entry.line,
        hasPolyline: !!entry.polyline,
        lineOnMap: entry.line && map.hasLayer(entry.line),
        polylineOnMap: entry.polyline && map.hasLayer(entry.polyline)
      });
      
      // Remove L.GPX-based tracks (line key)
      if (entry.line && map.hasLayer(entry.line)) {
        console.log(`Removing L.GPX track: ${entry.name}`);
        map.removeLayer(entry.line);
      }
      
      // Remove fallback-drawn tracks (polyline key)
      if (entry.polyline && map.hasLayer(entry.polyline)) {
        console.log(`Removing fallback track: ${entry.name}`);
        console.log('Polyline object:', entry.polyline);
        console.log('Polyline is on map:', map.hasLayer(entry.polyline));
        
        // Count polylines on map before removal
        let polylineCount = 0;
        map.eachLayer(layer => {
          if (layer instanceof L.Polyline) {
            polylineCount++;
            console.log('Found polyline on map:', layer);
          }
        });
        console.log('Total polylines on map before removal:', polylineCount);
        
        try {
          map.removeLayer(entry.polyline);
          console.log('Polyline removed successfully');
          console.log('Polyline still on map:', map.hasLayer(entry.polyline));
          
          // Count polylines on map after removal
          polylineCount = 0;
          map.eachLayer(layer => {
            if (layer instanceof L.Polyline) {
              polylineCount++;
              console.log('Found polyline on map after removal:', layer);
            }
          });
          console.log('Total polylines on map after removal:', polylineCount);
        } catch (error) {
          console.error('Error removing polyline:', error);
        }
      }
     
      if (entry.allMarkers && Array.isArray(entry.allMarkers)) {
        entry.allMarkers.forEach(m => {
          if (m && map.hasLayer(m)) {
            map.removeLayer(m);
          }
        });
      }
      if (entry.midLabel && map.hasLayer(entry.midLabel)) {
        map.removeLayer(entry.midLabel);
      }
    });
  
    gpxFiles.length = 0;
    gpxList.innerHTML = "";
    saveGpxFiles([]);
    console.log("All GPX tracks cleared.");
    
    // Reposition GPX popup after content changes
    setTimeout(() => {
      if (window.repositionGpxPopup) {
        window.repositionGpxPopup();
      }
    }, 50); // Longer delay for clear operation to ensure DOM is stable
  });
  

  function addGpxToMap(name, content, options = { fitBounds: true, source: "upload" }) {
    if (!map.getPane('gpxLabelPane')) {
      map.createPane('gpxLabelPane');
      map.getPane('gpxLabelPane').style.zIndex = 10000;
    }
    
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
      let usedFallback = false;
      
      let points = [];
      line.eachLayer(layer => {
        if (layer instanceof L.Polyline) {
          points.push(...layer.getLatLngs());
        }
      });

      console.log(`GPX "${name}" Points:`, points.length);

      if (!points.length) {
        console.warn("No polyline points found. Trying fallback parse...");
        usedFallback = true;
      
        // Parse GPX XML manually
        const parser = new DOMParser();
        const xml = parser.parseFromString(content, "text/xml");
      
        // Try <trkpt>, <rtept>, <wpt>
        let rawPoints = Array.from(xml.getElementsByTagName("trkpt"));
        if (!rawPoints.length) rawPoints = Array.from(xml.getElementsByTagName("rtept"));
        if (!rawPoints.length) rawPoints = Array.from(xml.getElementsByTagName("wpt"));
        if (!rawPoints.length) {
          console.warn("No supported GPX point types (<trkpt>, <rtept>, or <wpt>) found.");
          return;
        }
      
        // Convert to LatLngs
        points = rawPoints.map(pt => L.latLng(
          parseFloat(pt.getAttribute("lat")),
          parseFloat(pt.getAttribute("lon"))
        ));
      
        console.log(`Parsed ${points.length} fallback route points.`);
        console.log("Using FALLBACK parser - will store as 'polyline' key");
      
        // Remove the L.GPX line from map since we're using fallback
        if (line && map.hasLayer(line)) {
          map.removeLayer(line);
        }
      
        // Create single polyline for fallback tracks
        const polyline = L.polyline(points, { color: "#0066ff", weight: 4 }).addTo(map);
        if (options.fitBounds) {
          map.fitBounds(polyline.getBounds());
        }
      
        const allMarkers = [];
      
        // Start marker + label
        const start = L.marker(points[0], { icon: startIcon }).addTo(map);
        const startLabel = L.marker(points[0], {
          icon: L.divIcon({ className: "track-label", html: "Start", iconAnchor: [20, -8] })
        }).addTo(map);
        allMarkers.push(start, startLabel);
      
        // End marker + label
        const end = L.marker(points[points.length - 1], { icon: finishIcon }).addTo(map);
        const endLabel = L.marker(points[points.length - 1], {
          icon: L.divIcon({ className: "track-label", html: "Finish", iconAnchor: [20, -8] })
        }).addTo(map);
        allMarkers.push(end, endLabel);
      
        // Mid label
        const midIndex = Math.floor(points.length / 2);
        const midLabel = L.marker(points[midIndex], {
          icon: L.divIcon({
            className: 'gpx-label',
            html: `${name || "Unnamed Track"}`,
            iconSize: null // Auto-size based on content
          }),
          pane: 'gpxLabelPane'
        }).addTo(map);
      
        const listItem = document.createElement("div");
        listItem.className = "gpx-item";
        listItem.innerHTML = `
          <span class="file-name">${name || "Unnamed Track"}</span>
          <span class="delete-btn" data-filename="${name}">🗑️ DELETE</span>
        `;
        gpxList.appendChild(listItem);
        console.log(`Created list item for: ${name}`);
        
        // Sync the lists after adding new GPX file
        syncGpxLists();
        
        console.log(`Event delegation ready for: ${name}`);
        
        gpxFiles.push({
          name: name || "Unnamed Track",
          content,
          polyline, // Use polyline key for fallback tracks
          allMarkers,
          midLabel
        });
        console.log("Stored fallback track with 'polyline' key");
      
        if (options.source === "upload") {
          saveGpxFiles(gpxFiles.map(f => ({ name: f.name, content: f.content })));
        }
        
        // Immediate reposition to prevent flash (for fallback tracks)
        const openPopup = document.getElementById('gpxModal');
        const openButton = document.getElementById('toolbarGpxBtn');
        if (openPopup && openPopup.style.display === 'block' && openButton && window.positionPopup) {
          // Call positionPopup immediately without timeout
          window.positionPopup(openPopup, openButton, false);
        }
      
        return; // Exit early, don't execute L.GPX code below
      } else {
        console.log("Using L.GPX parser - will store as 'line' key");
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
      // Add start/finish labels
const startLabel = L.marker(points[0], {
  icon: L.divIcon({ className: 'track-label', html: 'Start', iconAnchor: [20, -8] })
}).addTo(map);
allMarkers.push(startLabel);

const endLabel = L.marker(points[points.length - 1], {
  icon: L.divIcon({ className: 'track-label', html: 'Finish', iconAnchor: [20, -8] })
}).addTo(map);
allMarkers.push(endLabel);

      // Single mid label
      const midIndex = Math.floor(points.length / 2);
      const midLabel = L.marker(points[midIndex], {
        icon: L.divIcon({
          className: 'gpx-label',
          html: `${name}`,
          iconSize: null // Auto-size based on content
        }),
        pane: 'gpxLabelPane'
      }).addTo(map);


      // Sidebar
      const listItem = document.createElement("div");
      listItem.className = "gpx-item";
      listItem.innerHTML = `
        <span class="file-name">${name}</span>
        <span class="delete-btn" data-filename="${name}">🗑️ DELETE</span>
      `;
      gpxList.appendChild(listItem);
      console.log(`Created list item for: ${name}`);
      

      
      // Sync the lists after adding new GPX file
      syncGpxLists();
      
      console.log(`Event delegation ready for: ${name}`);
      
      // Immediate reposition to prevent flash (for L.GPX tracks)
      const openPopup = document.getElementById('gpxModal');
      const openButton = document.getElementById('toolbarGpxBtn');
      if (openPopup && openPopup.style.display === 'block' && openButton && window.positionPopup) {
        // Call positionPopup immediately without timeout
        window.positionPopup(openPopup, openButton, false);
      }

      // Always push live version for tracking
      gpxFiles.push({
        name: name || "Unnamed Track",
        content,
        line, // this is the `L.GPX` layer
        allMarkers,
        midLabel
      });
      console.log("Stored L.GPX track with 'line' key");
      
      

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
  
  // Make gpxFiles and saveGpxFiles accessible globally for event delegation
  window.gpxFiles = gpxFiles;
  window.saveGpxFiles = saveGpxFiles;
});

// Function to sync GPX lists between real and proxy
function syncGpxLists() {
  const realList = document.getElementById('gpxList');
  const proxyList = document.getElementById('gpxListProxy');
  
  if (realList && proxyList) {
    proxyList.innerHTML = realList.innerHTML;
    console.log('Synced GPX lists');
  }
}

// Function to set up event delegation on both GPX lists
function setupGpxEventDelegation() {
  const realList = document.getElementById('gpxList');
  const proxyList = document.getElementById('gpxListProxy');
  
  [realList, proxyList].forEach(list => {
    if (list && !list.hasAttribute('data-events-attached')) {
      list.setAttribute('data-events-attached', 'true');
      console.log('Setting up event delegation on:', list.id);
      
      list.addEventListener('click', function(e) {
        console.log('GPX list click detected, target:', e.target);
        console.log('GPX list click detected, target class:', e.target.className);
        
        const deleteBtn = e.target.closest('.delete-btn');
        console.log('deleteBtn found:', deleteBtn);
        
        if (deleteBtn) {
          e.preventDefault();
          e.stopPropagation();
          const filename = deleteBtn.getAttribute('data-filename');
          console.log(`EVENT DELEGATION: Delete button clicked for ${filename}`);
          
          // Access gpxFiles and map from the global scope
          const gpxFiles = window.gpxFiles || [];
          const map = window.WITD?.map;
          
          if (!map) {
            console.error('Map not available for deletion');
            return;
          }
          
          // Find the corresponding GPX entry
          const listItem = deleteBtn.closest('.gpx-item');
          const gpxEntry = gpxFiles.find(entry => entry.name === filename);
          
          if (gpxEntry) {
            console.log(`Found GPX entry for deletion: ${filename}`);
            
            // Remove line/polyline from map
            if (gpxEntry.line && map.hasLayer(gpxEntry.line)) {
              map.removeLayer(gpxEntry.line);
            }
            if (gpxEntry.polyline && map.hasLayer(gpxEntry.polyline)) {
              map.removeLayer(gpxEntry.polyline);
            }

            // Remove all markers
            if (gpxEntry.allMarkers) {
              gpxEntry.allMarkers.forEach(m => { 
                if (map.hasLayer(m)) {
                  map.removeLayer(m);
                }
              });
            }

            // Remove mid label
            if (gpxEntry.midLabel && map.hasLayer(gpxEntry.midLabel)) {
              map.removeLayer(gpxEntry.midLabel);
            }

            // Remove from sidebar and memory
            console.log(`Removing list item for: ${filename}`);
            
            // Remove from both real and proxy lists
            const realList = document.getElementById('gpxList');
            const proxyList = document.getElementById('gpxListProxy');
            
            // Find and remove from real list
            const realListItem = realList?.querySelector(`[data-filename="${filename}"]`)?.closest('.gpx-item');
            if (realListItem) {
              console.log(`Removing from real list: ${filename}`);
              realListItem.remove();
            }
            
            // Find and remove from proxy list
            const proxyListItem = proxyList?.querySelector(`[data-filename="${filename}"]`)?.closest('.gpx-item');
            if (proxyListItem) {
              console.log(`Removing from proxy list: ${filename}`);
              proxyListItem.remove();
            }
            
            // Remove from gpxFiles array
            const index = gpxFiles.findIndex(entry => entry.name === filename);
            if (index !== -1) {
              console.log(`Removing from gpxFiles array: ${filename}`);
              gpxFiles.splice(index, 1);
            }

            // Update localStorage
            if (window.saveGpxFiles) {
              window.saveGpxFiles(gpxFiles.map(f => ({ name: f.name, content: f.content })));
            }
            console.log(`Deleted GPX: ${filename}`);
            
            // Reposition GPX popup after content changes
            if (window.repositionGpxPopup) {
              window.repositionGpxPopup();
            }
          } else {
            console.warn(`GPX entry not found for: ${filename}`);
          }
        } else {
          console.log('Click was not on a delete button');
        }
      });
    }
  });
}

// Set up event delegation when the page loads
document.addEventListener('DOMContentLoaded', setupGpxEventDelegation);