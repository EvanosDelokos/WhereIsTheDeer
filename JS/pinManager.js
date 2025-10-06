console.log("Module loaded: pinManager (Mapbox GL JS + DivIcon Label + Centered + Reload)");
console.log("🔍 pinManager.js loaded successfully");

// ============================================================================
// UNIFIED PIN BUILDER FUNCTIONS
// ============================================================================

// --- 1) DOM/SVG builder for colored pin styles ---
export function buildPinElement(style = {}) {
  const {
    variant = 'orange', // orange, red, green, yellow, blue, purple, brown
    size = 0.3,         // 0.3 = 70% smaller than baseline
  } = style;

  const el = document.createElement('div');
  el.className = `witd-pin witd-pin--${variant}`;
  el.style.transform = `scale(${size})`;

  // Simple SVG structure with CSS classes for easy color changes
  el.innerHTML = `
    <svg class="witd-pin-svg" width="36" height="48" viewBox="0 0 36 48" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs>
        <filter id="pinShadow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur in="SourceAlpha" stdDeviation="2" />
          <feOffset dx="0" dy="1" result="offsetblur" />
          <feComponentTransfer><feFuncA type="linear" slope="0.35"/></feComponentTransfer>
          <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>
      <path filter="url(#pinShadow)" d="M18 0C9 0 2 7.2 2 16.1c0 9.9 10.9 21.4 15.2 30.5.3.7 1.2.7 1.6 0C23.1 37.5 34 26 34 16.1 34 7.2 27 0 18 0z" class="pin-body"/>
      <circle cx="18" cy="16" r="6" class="pin-center"/>
    </svg>
  `;
  return el;
}

// --- 2) Marker factory (Mapbox GL DOM marker) ---
export function createPinMarker(pinData, handlers = {}) {
  console.log('🚨 [createPinMarker] FUNCTION CALLED with pinData:', pinData);
  const { lng, lat, style } = pinData;
  const element = buildPinElement(style);

  if (handlers.onClick) element.addEventListener('click', (e) => {
    console.log('[pin] Pin click detected, stopping propagation to prevent species layer conflict');
    e.stopPropagation(); // Prevent event from bubbling to map/species layer
    handlers.onClick(e, pinData);
  });
  if (handlers.onContext) element.addEventListener('contextmenu', (e) => {
    e.stopPropagation(); // Prevent event from bubbling to map/species layer
    handlers.onContext(e, pinData);
  });

  // IMPORTANT: do NOT use Marker({ color: ... }) which draws a default red pin
  const marker = new mapboxgl.Marker({ element, anchor: 'bottom' }).setLngLat([lng, lat]);
  console.log('🚨 [createPinMarker] Created marker at coordinates:', { lng, lat });
  return marker;
}

// --- 3) Popup factory (reuse your working popup HTML builder) ---
export function createPinPopup(pinData) {
  console.log('🚨 [createPinPopup] FUNCTION CALLED with pinData:', pinData);
  const popup = new mapboxgl.Popup({ closeButton: false, offset: 18 })
    .setHTML(buildPinPopupHTML(pinData));
  console.log('🚨 [createPinPopup] Created popup:', popup);
  return popup;
}

// --- 4) Popup HTML builder ---
export function buildPinPopupHTML(pinData) {
  const { name, lat, lng } = pinData;
  console.log('[buildPinPopupHTML] Creating popup HTML for pin:', name);
  const html = `
    <div class="saved-pin-popup">
      <div class="saved-pin-header">
        <span class="saved-pin-icon">📍</span>
        <span class="saved-pin-name">${name}</span>
      </div>
      <div class="saved-pin-coords">
        Lat: ${lat.toFixed(5)}<br>
        Lon: ${lng.toFixed(5)}
      </div>
      <div class="saved-pin-actions">
        <button class="saved-pin-btn rename-btn">✏️ Rename</button>
        <button class="saved-pin-btn delete-btn">🗑️ Delete</button>
        <button class="saved-pin-btn journal-btn">📓 Send to Journal</button>
      </div>
    </div>
  `;
  console.log('[buildPinPopupHTML] Generated HTML:', html);
  return html;
}

// --- 5) Label element builder ---
export function createLabelElement(name) {
  const labelDiv = document.createElement('div');
  labelDiv.className = 'marker-text-box';
  labelDiv.innerHTML = `<div class="label-inner">${name}</div>`;
  return labelDiv;
}

// ============================================================================
// PIN DRAWING FUNCTIONS
// ============================================================================
// 
// drawPins(pins) - Draws an array of pins on the map
// loadPinsFromSupabase(userId) - Loads and renders pins from Supabase
// savePinsToSupabase(userId) - Saves local pin data to Supabase
// createPinOnMap(pin) - Creates a single pin on the map
// 
// Available globally as:
// - window.drawPins(pins)
// - window.loadPinsFromSupabase(userId)
// - window.savePinsToSupabase(userId)
// - window.saveCurrentLocalPinsToSupabase() - Manually save localPinData to Supabase
// - window.loadPinsFromSupabaseAndUpdateLocal() - Manually load from Supabase and update localPinData
// - window.localPinData - Access to current local pin data array
// 
// Usage after login/session restore:
// const pins = await window.loadPinsFromSupabase(user.id);
// 
// Or manually:
// import { loadUserPinsFromSupabase } from './storeManager.js';
// const pins = await loadUserPinsFromSupabase(user.id);
// window.drawPins(pins);
// 
// Debug functions:
// - window.saveCurrentLocalPinsToSupabase() - Force save current pins to Supabase
// - window.loadPinsFromSupabaseAndUpdateLocal() - Force reload pins from Supabase
// ============================================================================

import { savePins, loadPins, loadUserPinsFromSupabase } from './storeManager.js';

// Local pin data storage - persists throughout the session
let localPinData = [];

// Function to draw pins on the map using unified builder
function drawPins(pins) {
  console.log('[drawPins] Drawing pins:', pins);
  
  if (!Array.isArray(pins)) {
    console.error('[drawPins] Pins is not an array:', pins);
    return;
  }
  
  if (pins.length === 0) {
    console.warn('[drawPins] No pins to draw.');
    return;
  }
  
  // Get map instance from global scope
  const map = window.WITD?.map;
  if (!map) {
    console.error('[drawPins] Map instance not available');
    return;
  }
  
  console.log('[drawPins] Map instance:', map);
  
  pins.forEach((pin, index) => {
    console.log('Rendering pin at:', pin.lat, pin.lng);
    
    try {
      // Create pin using unified builder
      createPinOnMap(pin);
    } catch (error) {
      console.error(`[drawPins] Error adding pin ${pin.name}:`, error);
    }
  });
}

// Make drawPins available globally
window.drawPins = drawPins;

// Function to save pins to Supabase with local data logging
async function savePinsToSupabase(userId) {
  try {
    console.log('[Debug] Local pin data before saving:', localPinData);
    
    if (!localPinData || localPinData.length === 0) {
      console.log('[Pins] No local pin data to save');
      return false;
    }
    
    // Ensure the upsert includes the correct format
    const { error } = await supabase
      .from('user_pins')
      .upsert({
        user_id: userId,
        pins: JSON.stringify(localPinData),
        updated_at: new Date().toISOString()
      });
    
    if (error) {
      console.error('[Pins] Supabase upsert failed:', error.message);
      return false;
    }
    
    console.log('[Pins] Successfully saved pins to Supabase:', localPinData.length, 'pins');
    return true;
  } catch (error) {
    console.error('[Pins] Error saving pins to Supabase:', error.message);
    return false;
  }
}

// Make savePinsToSupabase available globally
window.savePinsToSupabase = savePinsToSupabase;

// Function to load pins and render them on the map
async function loadPinsFromSupabase(userId) {
  try {
    console.log('[Pins] Loading pins from Supabase for user:', userId);
    
    const pins = await loadUserPinsFromSupabase(userId);
    console.log('[Pins] Loaded from Supabase:', pins.length, 'pins');
    
    if (pins && pins.length > 0) {
      // Update local pin data
      localPinData = pins.map(pin => ({
        lng: pin.lng,
        lat: pin.lat,
        label: pin.name
      }));
      
      console.log('[Pins] Updated localPinData:', localPinData);
      
      // Render pins on the map
      console.log('[Pins] Rendering pins on map:', pins.length);
      pins.forEach((pin) => {
        createPinOnMap(pin);
      });
    } else {
      console.log('[Pins] No pins to render');
    }
    
    return pins;
  } catch (error) {
    console.error('[Pins] Error loading pins from Supabase:', error.message);
    return [];
  }
}

// Function to create a pin on the map
function createPinOnMap(pin) {
  console.log('🚨 [createPinOnMap] FUNCTION CALLED with pin:', pin);
  const map = window.WITD?.map;
  if (!map) {
    console.error('[createPinOnMap] Map instance not available');
    return;
  }
  
  try {
    // Create a unique ID for the pin
    const pinId = `pin-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Prepare pin data with style (back-compat default if older saves lack style)
    const pinData = {
      id: pinId,
      name: pin.name,
      lng: pin.lng,
      lat: pin.lat,
      style: pin.style || { variant: 'orange', size: 0.3 }
    };
    
    // Create Mapbox marker using unified builder
    const marker = createPinMarker(pinData, { 
      onClick: () => {
        marker.togglePopup();
        // Bind popup actions when popup is opened
        setTimeout(() => {
          bindPopupActions(marker, pinObj);
        }, 50);
      }
    });
    marker.addTo(map);
    
    // Create popup using unified builder
    const popup = createPinPopup(pinData);
    marker.setPopup(popup);
    
    // Create label marker
    const labelMarker = new mapboxgl.Marker({
      element: createLabelElement(pin.name),
      anchor: 'bottom'
    })
    .setLngLat([pin.lng, pin.lat])
    .addTo(map);
    
    // Store pin object for management
    const pinObj = { 
      marker: { id: pinId, element: marker }, 
      name: pin.name, 
      lat: pin.lat, 
      lng: pin.lng, 
      labelMarker: { id: `label-${pinId}`, element: labelMarker },
      style: pinData.style
    };
    
    window.customPins.push(pinObj);
    
    console.log(`[createPinOnMap] Successfully created pin: ${pin.name} at [${pin.lat}, ${pin.lng}]`);
  } catch (error) {
    console.error(`[createPinOnMap] Error creating pin ${pin.name}:`, error);
  }
}


// Make loadPinsFromSupabase available globally
window.loadPinsFromSupabase = loadPinsFromSupabase;

// Make localPinData globally accessible
window.localPinData = localPinData;

// Function to manually save current localPinData to Supabase
async function saveCurrentLocalPinsToSupabase() {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      console.log('[Pins] No user authenticated, cannot save to Supabase');
      return false;
    }
    
    console.log('[Pins] Manually saving localPinData to Supabase:', localPinData);
    
    const { error } = await supabase
      .from('user_pins')
      .upsert({
        user_id: user.id,
        pins: localPinData,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'user_id'
      });
    
    if (error) {
      console.error('[Pins] Manual save to Supabase failed:', error.message);
      return false;
    }
    
    console.log('[Pins] Successfully saved localPinData to Supabase');
    return true;
  } catch (error) {
    console.error('[Pins] Error in manual save to Supabase:', error.message);
    return false;
  }
}

// Make manual save function globally accessible
window.saveCurrentLocalPinsToSupabase = saveCurrentLocalPinsToSupabase;

// Function to manually load pins from Supabase and update localPinData
async function loadPinsFromSupabaseAndUpdateLocal() {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      console.log('[Pins] No user authenticated, cannot load from Supabase');
      return false;
    }
    
    console.log('[Pins] Manually loading pins from Supabase for user:', user.id);
    
    const pins = await loadUserPinsFromSupabase(user.id);
    if (pins && pins.length > 0) {
      // Update local pin data
      localPinData.length = 0; // Clear existing
      pins.forEach(pin => {
        localPinData.push({
          lng: pin.lng,
          lat: pin.lat,
          label: pin.name
        });
      });
      
      console.log('[Pins] Updated localPinData from Supabase:', localPinData);
      return true;
    } else {
      console.log('[Pins] No pins found in Supabase');
      localPinData.length = 0;
      return true;
    }
  } catch (error) {
    console.error('[Pins] Error in manual load from Supabase:', error.message);
    return false;
  }
}

// Make manual load function globally accessible
window.loadPinsFromSupabaseAndUpdateLocal = loadPinsFromSupabaseAndUpdateLocal;

// Make bindPopupActions globally accessible
window.bindPopupActions = bindPopupActions;

// Function to clean pin data for serialization (remove circular references)
function cleanPinDataForSerialization(pins) {
  return pins.map(pin => ({
    id: pin.marker?.id || pin.id,
    name: pin.name,
    lat: pin.lat,
    lng: pin.lng,
    style: pin.style || { variant: 'orange', size: 0.3 }
  }));
}

// === POPUP ACTION BINDING FUNCTIONS ===
function bindPopupActions(marker, pin) {
  console.log('🚨 [bindPopupActions] FUNCTION CALLED for pin:', pin.name);
  
  // Try to get popup element with retries
  let attempts = 0;
  const maxAttempts = 5; // Reduced further since we're calling this when popup opens
  
  const tryBind = () => {
    attempts++;
    console.log(`[bindPopupActions] Attempt ${attempts}/${maxAttempts} for pin:`, pin.name);
    
    const popup = marker.getPopup();
    if (!popup) {
      console.log('[bindPopupActions] No popup object found');
      if (attempts < maxAttempts) {
        setTimeout(tryBind, 100);
        return;
      } else {
        console.error('[bindPopupActions] Failed to get popup after', maxAttempts, 'attempts');
        return;
      }
    }
    
    const popupElement = popup?.getElement();
    console.log('[bindPopupActions] Popup element:', popupElement);
    
    if (popupElement) {
      console.log('[bindPopupActions] Popup element found, binding actions for pin:', pin.name);
      bindActionsToPopup(popupElement, marker, pin);
      return;
    }
    
    if (attempts < maxAttempts) {
      console.log('[bindPopupActions] Popup element not ready, retrying in 100ms...');
      setTimeout(tryBind, 100);
    } else {
      console.error('[bindPopupActions] Failed to get popup element after', maxAttempts, 'attempts');
    }
  };
  
  tryBind();
}

function bindActionsToPopup(popupElement, marker, pin) {
  console.log('[bindActionsToPopup] Binding actions to popup element for pin:', pin.name);
  
  const renameBtn = popupElement.querySelector('.rename-btn');
  const deleteBtn = popupElement.querySelector('.delete-btn');
  const journalBtn = popupElement.querySelector('.journal-btn');
  
  console.log('[bindActionsToPopup] Found buttons:', {
    rename: !!renameBtn,
    delete: !!deleteBtn,
    journal: !!journalBtn
  });
  
  if (renameBtn) {
    // Remove any existing listeners to prevent duplicates
    renameBtn.replaceWith(renameBtn.cloneNode(true));
    const newRenameBtn = popupElement.querySelector('.rename-btn');
    newRenameBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      console.log('[bindActionsToPopup] Rename button clicked for pin:', pin.name);
      reopenRename(marker, pin);
    });
  }
  
  if (deleteBtn) {
    // Remove any existing listeners to prevent duplicates
    deleteBtn.replaceWith(deleteBtn.cloneNode(true));
    const newDeleteBtn = popupElement.querySelector('.delete-btn');
    newDeleteBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      console.log('[bindActionsToPopup] Delete button clicked for pin:', pin.name);
       // Create custom confirmation dialog
       const confirmDialog = document.createElement('div');
       confirmDialog.className = 'custom-confirm-dialog';
       confirmDialog.innerHTML = `
         <div class="confirm-dialog-content">
           <div class="confirm-dialog-header">
             <span class="confirm-dialog-icon">⚠️</span>
             <span class="confirm-dialog-title">Delete Pin</span>
           </div>
           <div class="confirm-dialog-message">
             Are you sure you want to delete pin "${pin.name}"?
           </div>
           <div class="confirm-dialog-buttons">
             <button class="confirm-dialog-btn confirm-dialog-cancel">Cancel</button>
             <button class="confirm-dialog-btn confirm-dialog-delete">Delete</button>
           </div>
         </div>
       `;
       
       // Add to body
       document.body.appendChild(confirmDialog);
       
       // Get button references
       const cancelBtn = confirmDialog.querySelector('.confirm-dialog-cancel');
       const deleteBtn = confirmDialog.querySelector('.confirm-dialog-delete');
       
       // Handle cancel
       cancelBtn.addEventListener('click', () => {
         document.body.removeChild(confirmDialog);
       });
       
       // Handle delete
       deleteBtn.addEventListener('click', async () => {
         // Use the new deletePin function
         await deletePin(pin);
         
         // Re-bind event listeners for all remaining pins
         console.log('[Delete] Re-binding event listeners for remaining pins...');
         customPins.forEach(remainingPin => {
           if (remainingPin.marker && remainingPin.marker.element) {
             const popup = remainingPin.marker.element.getPopup();
             if (popup) {
               // Force popup to be rendered again
               remainingPin.marker.element.togglePopup();
               remainingPin.marker.element.togglePopup();
               
               // Re-bind actions after a short delay
               setTimeout(() => {
                 bindPopupActions(remainingPin.marker.element, remainingPin);
               }, 200);
             }
           }
         });
         
         // Close dialog
         document.body.removeChild(confirmDialog);
       });
       
       // Close on outside click
       confirmDialog.addEventListener('click', (e) => {
         if (e.target === confirmDialog) {
           document.body.removeChild(confirmDialog);
         }
       });
       
       // Close on Escape key
       const handleEscape = (e) => {
         if (e.key === 'Escape') {
           document.body.removeChild(confirmDialog);
           document.removeEventListener('keydown', handleEscape);
         }
       };
       document.addEventListener('keydown', handleEscape);
     });
  }
  
  if (journalBtn) {
    // Remove any existing listeners to prevent duplicates
    journalBtn.replaceWith(journalBtn.cloneNode(true));
    const newJournalBtn = popupElement.querySelector('.journal-btn');
    newJournalBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      console.log('[bindActionsToPopup] Journal button clicked for pin:', pin.name);
      // Send pin to journal
      if (typeof window.initJournal === 'function') {
        // Get the journal button to simulate a click
        const journalBtn = document.getElementById('toolbarJournalBtn');
        if (journalBtn) {
          // Store pin data for the journal
          window.pinForJournal = {
            title: `Pin: ${pin.name}`,
            coords: `${pin.lat.toFixed(5)}, ${pin.lng.toFixed(5)}`,
            note: `Location marked on map: ${pin.name}`
          };
          
          // Simulate clicking the journal button to open it normally
          journalBtn.click();
          
          // Pre-fill the form after the modal opens
          setTimeout(() => {
            const titleInput = document.getElementById('journalTitle');
            const coordsInput = document.getElementById('journalCoords');
            const noteInput = document.getElementById('journalNote');
            
            if (titleInput && window.pinForJournal) titleInput.value = window.pinForJournal.title;
            if (coordsInput && window.pinForJournal) coordsInput.value = window.pinForJournal.coords;
            if (noteInput && window.pinForJournal) noteInput.value = window.pinForJournal.note;
            
            // Focus on the note input
            if (noteInput) noteInput.focus();
            
            // Clear the stored data
            delete window.pinForJournal;
          }, 200);
        }
      } else {
        console.error('Journal module not available');
        alert('Journal module not loaded. Please refresh the page.');
      }
    });
  }
}

function reopenRename(marker, pin) {
  // Create styled container
  const popupContent = document.createElement("div");
  popupContent.className = "pin-drop-container";
  
  // Create header
  const header = document.createElement("div");
  header.className = "pin-drop-header";
  header.innerHTML = '<span class="pin-drop-icon">✏️</span> <span class="pin-drop-title">Rename Pin</span>';
  
  // Create input container
  const inputContainer = document.createElement("div");
  inputContainer.className = "pin-drop-input-container";
  
  const input = document.createElement("input");
  input.type = "text";
  input.value = pin.name;
  input.className = "pin-drop-input";
  
  inputContainer.appendChild(input);

  // Create button container
  const buttonContainer = document.createElement("div");
  buttonContainer.className = "pin-drop-buttons";
  
  const saveBtn = document.createElement("button");
  saveBtn.textContent = "Save Changes";
  saveBtn.className = "pin-drop-btn pin-drop-save";

  const cancelBtn = document.createElement("button");
  cancelBtn.textContent = "Cancel";
  cancelBtn.className = "pin-drop-btn pin-drop-cancel";
  
  buttonContainer.appendChild(cancelBtn);
  buttonContainer.appendChild(saveBtn);
  
  // Assemble popup content
  popupContent.appendChild(header);
  popupContent.appendChild(inputContainer);
  popupContent.appendChild(buttonContainer);

  const renamePopup = new mapboxgl.Popup({
    closeButton: false,
    closeOnClick: false
  }).setDOMContent(popupContent);

  marker.setPopup(renamePopup);
  marker.togglePopup();

  setTimeout(() => input.focus(), 0);

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      save();
    }
  });

  saveBtn.addEventListener("click", save);
  cancelBtn.addEventListener("click", () => {
    marker.setPopup(pin.originalPopup || marker.getPopup());
    marker.togglePopup();
  });

async function save() {
  const newName = input.value.trim();
  if (!newName) return;

  pin.name = newName;
    
    // Update label
    if (pin.labelMarker && pin.labelMarker.element) {
      const newLabelElement = createLabelElement(newName);
      pin.labelMarker.element.getElement().innerHTML = newLabelElement.innerHTML;
    }
    
    // Update local pin data
    const localIndex = localPinData.findIndex(p => 
      p.lat === pin.lat && p.lng === pin.lng
    );
    if (localIndex > -1) {
      localPinData[localIndex].label = newName;
      console.log('[Pins] Updated localPinData for renamed pin:', localPinData[localIndex]);
    }

    // Restore original popup with new styled structure using the unified builder
    const pinData = {
      id: pin.marker.id,
      name: newName,
      lng: pin.lng,
      lat: pin.lat,
      style: pin.style || { variant: 'orange', size: 0.3 }
    };
    
    const newPopup = createPinPopup(pinData);
    
    marker.setPopup(newPopup);
    // Force the popup to be rendered by opening and closing it
    marker.togglePopup();
    marker.togglePopup();
    
    // Re-bind actions
    console.log('[reopenRename save] About to re-bind popup actions for pin:', newName);
    setTimeout(() => {
      bindPopupActions(marker, pin);
    }, 100);

    await savePins(customPins);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const map = window.WITD.map;
  // Make customPins globally accessible for premium toolbar functions
  window.customPins = [];
  const customPins = window.customPins;

  const addPinBtn = document.getElementById("addPinBtn");
  const clearPinsBtn = document.getElementById("clearPinsBtn");

  // Load saved pins
  console.log('🚨 [pinManager] About to load saved pins');
  loadPins(map, customPins, { reopenRename }).then(() => {
    console.log('🚨 [pinManager] Finished loading saved pins');
  }).catch(error => {
    console.error('🚨 [pinManager] Error loading saved pins:', error);
  });

     addPinBtn.addEventListener("click", () => {
     // Toggle pin mode
     window.WITD.pinMode = !window.WITD.pinMode;
     addPinBtn.classList.toggle("active");
     
     // If turning OFF pin mode, close any existing pin creation popups
     if (!window.WITD.pinMode) {
       const existingPopups = document.querySelectorAll('.pin-drop-container');
       existingPopups.forEach(popup => {
         if (popup.closest('.mapboxgl-popup')) {
           popup.closest('.mapboxgl-popup').remove();
         }
       });
     }
     
     console.log("Pin mode:", window.WITD.pinMode ? "ON" : "OFF");
   });

     clearPinsBtn.addEventListener("click", async () => {
     if (confirm("Clear all pins?")) {
       customPins.forEach(pin => {
         if (pin.marker?.element) {
           pin.marker.element.remove();
         }
         if (pin.labelMarker?.element) {
           pin.labelMarker.element.remove();
         }
       });
       customPins.length = 0;
       
       // Clear local pin data
       localPinData.length = 0;
       console.log('[Pins] Cleared localPinData');
       
       await persistPins(customPins);
       
       // Force update Supabase with empty state
       try {
         const { data: { user } } = await supabase.auth.getUser();
         if (user) {
           const { error } = await supabase
             .from('user_pins')
             .upsert({
               user_id: user.id,
               pins: [],
               updated_at: new Date().toISOString()
             }, {
               onConflict: 'user_id'
             });
           
           if (error) {
             console.error('[Pins] Failed to clear Supabase pins:', error.message);
           } else {
             console.log('[Pins] Successfully cleared Supabase pins');
           }
         }
       } catch (error) {
         console.error('[Pins] Error clearing Supabase pins:', error.message);
       }
     }
   });

     map.on("click", (e) => {
     if (!window.WITD.pinMode) return;
     
     console.log('[pin] Pin placement click detected, stopping propagation');
     
     // Stop event propagation to prevent species layer from handling this click
     e.originalEvent?.stopPropagation?.();
     
     // Prevent multiple simultaneous pin creation popups
     if (window.currentPinPopup) {
       console.log("Pin creation already in progress, ignoring click");
       return;
     }

     // Set a flag to indicate we're processing pin placement
     window.WITD.processingPinPlacement = true;
     
     // IMMEDIATELY turn off pin mode to prevent multiple clicks
     window.WITD.pinMode = false;
     addPinBtn.classList.remove("active");

     // Close any existing pin creation popups
     const existingPopups = document.querySelectorAll('.pin-drop-container');
     existingPopups.forEach(popup => {
       if (popup.closest('.mapboxgl-popup')) {
         popup.closest('.mapboxgl-popup').remove();
       }
     });

     const { lng, lat } = e.lngLat;
     console.log('🚨 [map click] Pin placement coordinates:', { lng, lat });

     // Create styled container
     const popupContent = document.createElement("div");
     popupContent.className = "pin-drop-container";
     
     // Create header
     const header = document.createElement("div");
     header.className = "pin-drop-header";
     header.innerHTML = '<span class="pin-drop-icon">📍</span> <span class="pin-drop-title">Add New Pin</span>';
     
     // Create input container
     const inputContainer = document.createElement("div");
     inputContainer.className = "pin-drop-input-container";
     
     const input = document.createElement("input");
     input.type = "text";
     input.placeholder = "Enter pin name...";
     input.className = "pin-drop-input";
     
     inputContainer.appendChild(input);

     // Create button container
     const buttonContainer = document.createElement("div");
     buttonContainer.className = "pin-drop-buttons";
     
     const saveBtn = document.createElement("button");
     saveBtn.textContent = "Save Pin";
     saveBtn.className = "pin-drop-btn pin-drop-save";
     
     const cancelBtn = document.createElement("button");
     cancelBtn.textContent = "Cancel";
     cancelBtn.className = "pin-drop-btn pin-drop-cancel";
     
     buttonContainer.appendChild(cancelBtn);
     buttonContainer.appendChild(saveBtn);
     
     // Assemble popup content
     popupContent.appendChild(header);
     popupContent.appendChild(inputContainer);
     popupContent.appendChild(buttonContainer);

     // Create Mapbox popup
     const popup = new mapboxgl.Popup({
       closeButton: false,
       closeOnClick: false,
       maxWidth: 'none'
     }).setDOMContent(popupContent);
     
     // Store popup reference for cleanup
     window.currentPinPopup = popup;

     // Create pin data with style
     const pinData = {
       id: `pin-${Date.now()}`,
       name: "",
       lng,
       lat,
      style: { 
        variant: window.selectedPinStyle || 'orange', 
        size: 0.3 
      }
     };

     // Create Mapbox marker using unified builder
     const marker = createPinMarker(pinData, { onClick: () => marker.togglePopup() });
     marker.setPopup(popup).addTo(map);

     // Store marker reference with Mapbox-specific properties
     const pin = { 
       marker: { id: pinData.id, element: marker }, 
       name: "", 
       lat, 
       lng, 
       labelMarker: null,
       style: pinData.style
     };
     customPins.push(pin);

     // Open popup
     marker.togglePopup();

     setTimeout(() => input.focus(), 0);

     input.addEventListener("keydown", (e) => {
       if (e.key === "Enter") {
         e.preventDefault();
         savePin();
       }
     });

     saveBtn.addEventListener("click", savePin);
     cancelBtn.addEventListener("click", cancelPin);

    async function savePin() {
      const name = input.value.trim() || "Unnamed Pin";
      
      // Update pin data
      pin.name = name;
      pinData.name = name;
       
       // Create popup using unified builder
       const popup = createPinPopup(pinData);
     
       // Create label marker using Mapbox HTML marker
       const labelId = `label-${Date.now()}`;
       const labelMarker = new mapboxgl.Marker({
         element: createLabelElement(name),
         anchor: 'bottom'
       })
       .setLngLat([lng, lat])
       .addTo(map);
     
       pin.labelMarker = { id: labelId, element: labelMarker };
     
       // Add to local pin data with style
       localPinData.push({
         lng: pin.lng,
         lat: pin.lat,
         label: pin.name,
         style: pin.style
       });
       
       console.log('[Pins] Added to localPinData:', localPinData);
     
       // Set popup and bind actions
       marker.setPopup(popup);
       marker.togglePopup();
       
             // Bind actions to the new popup
      console.log('[savePin] About to bind popup actions for new pin:', name);
      setTimeout(() => {
        bindPopupActions(marker, pin);
      }, 100);
     
       await persistPins(customPins);
       
       // Reset pin placement processing flag
       window.WITD.processingPinPlacement = false;
       
       // Turn off pin mode after successfully placing a pin
       window.WITD.pinMode = false;
       const addPinBtn = document.getElementById("addPinBtn");
       if (addPinBtn) addPinBtn.classList.remove("active");
       
       // Clean up popup reference
       if (window.currentPinPopup) {
         delete window.currentPinPopup;
       }
     }

     async function cancelPin() {
       marker.remove();
       const index = customPins.indexOf(pin);
       if (index > -1) {
         customPins.splice(index, 1);
       }
       
       // Reset pin placement processing flag
       window.WITD.processingPinPlacement = false;
       
       // Turn off pin mode when cancelling a pin
       window.WITD.pinMode = false;
       const addPinBtn = document.getElementById("addPinBtn");
       if (addPinBtn) addPinBtn.classList.remove("active");
       
       // Clean up popup reference
       if (window.currentPinPopup) {
         delete window.currentPinPopup;
       }
     }
   });
   
   // Add map click handler to close saved pin popups when clicking elsewhere
   map.on('click', (e) => {
     // Only close saved pin popups, don't interfere with pin creation
     if (!window.WITD.pinMode) {
       const openSavedPinPopups = document.querySelectorAll('.saved-pin-popup');
       openSavedPinPopups.forEach(popup => {
         if (popup.closest('.mapboxgl-popup')) {
           // Check if click is outside the popup
           if (!popup.contains(e.originalEvent.target)) {
             popup.closest('.mapboxgl-popup').remove();
           }
         }
       });
     }
   });

  // === BUTTON HANDLERS ===
  const clearAllPinsBtn = document.getElementById('clearAllPinsBtn');
  if (clearAllPinsBtn) {
    clearAllPinsBtn.addEventListener('click', () => {
      showStyledConfirm("Clear all Pin Tool pins?", () => {
        clearAllPins();
      });
    });
  }
});

// Global functions for external access
function addPinAtCenter() {
  const map = window.WITD?.map;
  if (!map) return;
  
  const center = map.getCenter();
  const { lng, lat } = center;
  
  // Simulate click at center
  const clickEvent = {
    lngLat: { lng, lat }
  };
  
  // Trigger pin placement
  window.WITD.pinMode = true;
  const addPinBtn = document.getElementById('addPinBtn');
  if (addPinBtn) addPinBtn.classList.add('active');
  
  // Close any existing species popups when starting to place pins
  if (typeof window.closeSpeciesPopups === 'function') {
    window.closeSpeciesPopups();
  }
  
  // Create styled container
  const popupContent = document.createElement("div");
  popupContent.className = "pin-drop-container";
  
  // Create header
  const header = document.createElement("div");
  header.className = "pin-drop-header";
  header.innerHTML = '<span class="pin-drop-icon">📍</span> <span class="pin-drop-title">Add Center Pin</span>';
  
  // Create input container
  const inputContainer = document.createElement("div");
  inputContainer.className = "pin-drop-input-container";
  
  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = "Enter pin name...";
  input.value = "Center Pin";
  input.className = "pin-drop-input";
  
  inputContainer.appendChild(input);

  // Create button container
  const buttonContainer = document.createElement("div");
  buttonContainer.className = "pin-drop-buttons";
  
  const saveBtn = document.createElement("button");
  saveBtn.textContent = "Save Pin";
  saveBtn.className = "pin-drop-btn pin-drop-save";
  
  buttonContainer.appendChild(saveBtn);
  
  // Assemble popup content
  popupContent.appendChild(header);
  popupContent.appendChild(inputContainer);
  popupContent.appendChild(buttonContainer);

  // Create pin data with style
  const pinData = {
    id: `pin-center-${Date.now()}`,
    name: "Center Pin",
    lng,
    lat,
    style: { variant: 'orange', size: 0.3 }
  };

  // Create Mapbox marker using unified builder
  const marker = createPinMarker(pinData, { onClick: () => marker.togglePopup() });
  marker.addTo(map);

  const popup = new mapboxgl.Popup({
    closeButton: false,
    closeOnClick: false
  }).setDOMContent(popupContent);

  marker.setPopup(popup);
  marker.togglePopup();

  const pin = { 
    marker: { id: pinData.id, element: marker }, 
    name: "", 
    lat, 
    lng, 
    labelMarker: null,
    style: pinData.style
  };
  
  window.customPins.push(pin);
  
  // Auto-save
  setTimeout(() => {
    input.value = "Center Pin";
    saveBtn.click();
  }, 100);
}

// === UNIVERSAL PERSISTENCE HELPERS ===

// Sync pins
async function persistPins(pins = []) {
  try {
    if (!pins || pins.length === 0) {
      localStorage.removeItem('witd_pins');
      localStorage.removeItem('witd_pins_last_update');
      console.log("🗑️ Cleared pins from localStorage");
    } else {
      // Clean pin data to remove circular references before serialization
      const cleanPins = cleanPinDataForSerialization(pins);
      localStorage.setItem('witd_pins', JSON.stringify(cleanPins));
      localStorage.setItem('witd_pins_last_update', Date.now().toString());
      console.log(`💾 Saved ${pins.length} pins to localStorage`);
    }
  } catch (err) {
    console.error("❌ Error writing pins to localStorage:", err);
  }

  if (window.savePins) {
    try {
      // Use cleaned pins for Supabase sync as well
      const cleanPins = pins.length > 0 ? cleanPinDataForSerialization(pins) : pins;
      await window.savePins(cleanPins);
      console.log("☁️ Synced pins to Supabase");
    } catch (err) {
      console.error("❌ Error syncing pins to Supabase:", err);
    }
  }
}

// Sync GPX
async function persistGpx(files = []) {
  if (!files || files.length === 0) {
    localStorage.removeItem('witd_gpx_files');
    console.log("🗑️ Cleared GPX files from localStorage");
  } else {
    localStorage.setItem('witd_gpx_files', JSON.stringify(files));
    console.log(`💾 Saved ${files.length} GPX files to localStorage`);
  }
  if (window.saveGpxFiles) await window.saveGpxFiles(files);
}

// Sync journal
async function persistJournal(entries = []) {
  if (!entries || entries.length === 0) {
    localStorage.removeItem('witd_journal_entries');
    console.log("🗑️ Cleared journal entries from localStorage");
  } else {
    localStorage.setItem('witd_journal_entries', JSON.stringify(entries));
    console.log(`💾 Saved ${entries.length} journal entries to localStorage`);
  }
  if (window.saveJournalEntries) await window.saveJournalEntries(entries);
}

// Sync draw color
function persistDrawColor(color) {
  if (!color) {
    localStorage.removeItem('witd_draw_color');
    console.log("🗑️ Cleared draw color");
  } else {
    localStorage.setItem('witd_draw_color', color);
    console.log("🎨 Saved draw color:", color);
  }
}

// === CLEAR FUNCTIONS ===

// === CLEAR ALL PINS (TOOLS ONLY) ===
async function clearAllPins() {
  const customPins = window.customPins || [];

  // Remove from map
  customPins.forEach(pin => {
    if (pin.marker?.element) pin.marker.element.remove();
    if (pin.labelMarker?.element) pin.labelMarker.element.remove();
  });

  // Empty array in memory
  customPins.length = 0;
  
  // Clear localPinData as well
  localPinData.length = 0;

  // Persist empty state to both localStorage and Supabase
  try {
    // Local
    localStorage.removeItem('witd_pins');
    localStorage.removeItem('witd_pins_last_update');
    console.log("🗑️ Local pins cleared");

    // Supabase
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { error } = await supabase
          .from('user_pins')
          .upsert({
            user_id: user.id,
            pins: [],
            updated_at: new Date().toISOString()
          }, {
            onConflict: 'user_id'
          });
        if (error) {
          console.error("❌ Failed to clear Supabase pins:", error);
        } else {
          console.log("☁️ Supabase pins cleared");
        }
      }
    } catch (supabaseError) {
      console.error("❌ Error clearing Supabase pins:", supabaseError);
    }
  } catch (err) {
    console.error("❌ Error clearing pins:", err);
  }

  console.log("✅ All Pin Tool pins cleared everywhere.");
}

// Delete single pin
async function deletePin(pinToDelete) {
  const customPins = window.customPins || [];
  const index = customPins.indexOf(pinToDelete);
  if (index !== -1) {
    if (pinToDelete.marker?.element) pinToDelete.marker.element.remove();
    if (pinToDelete.labelMarker?.element) pinToDelete.labelMarker.element.remove();
    customPins.splice(index, 1);
    
    // Also remove from localPinData
    const localIndex = localPinData.findIndex(p => 
      p.lat === pinToDelete.lat && p.lng === pinToDelete.lng && p.label === pinToDelete.name
    );
    if (localIndex > -1) {
      localPinData.splice(localIndex, 1);
      console.log('[Pins] Removed from localPinData, remaining:', localPinData.length);
    }
    
    await persistPins(customPins);
    
    // Force update Supabase with the current state
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const cleanPins = cleanPinDataForSerialization(customPins);
        const { error } = await supabase
          .from('user_pins')
          .upsert({
            user_id: user.id,
            pins: cleanPins,
            updated_at: new Date().toISOString()
          }, {
            onConflict: 'user_id'
          });
        
        if (error) {
          console.error('[Pins] Failed to update Supabase after deletion:', error.message);
        } else {
          console.log('[Pins] Successfully updated Supabase after pin deletion');
        }
      }
    } catch (error) {
      console.error('[Pins] Error updating Supabase after deletion:', error.message);
    }
    
    console.log("🗑️ Pin deleted (local + Supabase updated)");
  }
}

// Optional master reset (wipe all user-created data)
async function resetAllUserData() {
  await persistPins([]);
  await persistGpx([]);
  await persistJournal([]);
  persistDrawColor(null);
  console.log("🧹 Full reset of user data complete.");
}

function enablePinPlacement() {
  window.WITD.pinMode = true;
  const addPinBtn = document.getElementById('addPinBtn');
  if (addPinBtn) {
    addPinBtn.classList.add('active');
    
    // Close any existing species popups when starting to place pins
    if (typeof window.closeSpeciesPopups === 'function') {
      window.closeSpeciesPopups();
    }
  }
  console.log("Pin placement enabled");
}

 // Expose functions globally
 window.addPinAtCenter = addPinAtCenter;
 window.clearAllPins = clearAllPins;
 window.deletePin = deletePin;
 window.persistPins = persistPins;
 window.persistGpx = persistGpx;
 window.persistJournal = persistJournal;
 window.persistDrawColor = persistDrawColor;
 window.resetAllUserData = resetAllUserData;
 window.enablePinPlacement = enablePinPlacement;
 window.bindPopupActions = bindPopupActions;
 
 // Global function to force close all pin creation popups
 window.closeAllPinPopups = () => {
   const existingPopups = document.querySelectorAll('.pin-drop-container');
   existingPopups.forEach(popup => {
     if (popup.closest('.mapboxgl-popup')) {
       popup.closest('.mapboxgl-popup').remove();
     }
   });
   // Also close any Mapbox popups that might be open
   if (window.currentPinPopup) {
     window.currentPinPopup.remove();
     delete window.currentPinPopup;
   }
   // Reset pin mode
   window.WITD.pinMode = false;
   const addPinBtn = document.getElementById("addPinBtn");
   if (addPinBtn) addPinBtn.classList.remove("active");
 };
