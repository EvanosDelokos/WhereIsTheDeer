// Store manager module loaded

// Import unified pin builder functions
import { createPinMarker, createPinPopup, createLabelElement, buildPinPopupHTML } from './pinManager.js';

// ============================================================================
// NEW PIN MANAGEMENT FUNCTIONS
// ============================================================================
// 
// saveUserPinsToSupabase(newPin, userId) - Saves a single pin to Supabase
// addNewPinToSupabase(pinData, userId) - Adds a new pin to Supabase
// loadUserPinsFromSupabase(userId) - Loads all pins for a user from Supabase
// 
// These functions use UPSERT with onConflict: 'user_id' to ensure:
// - One row per user
// - Pins stored as JSON array in the 'pins' column
// - Automatic row creation for new users
// - No duplicate rows
// ============================================================================

// --- Helper function to check if user_pins table exists ---
async function checkUserPinsTableExists() {
  try {
    // Try a simple query to see if the table exists
    const { data, error } = await supabase
      .from('user_pins')
      .select('user_id')
      .limit(1);
    
    if (error) {
      if (error.code === 'PGRST116' || error.message.includes('relation') || error.message.includes('does not exist')) {
        return false; // Table doesn't exist
      }
      throw error; // Other error
    }
    
    return true; // Table exists
  } catch (error) {
    console.error('[Pins] Error checking if user_pins table exists:', error.message);
    return false;
  }
}

// --- Helper function to create user_pins table if it doesn't exist ---
async function createUserPinsTable(userId) {
  try {
    // Attempting to create user_pins table
    
    // First check if table exists
    const tableExists = await checkUserPinsTableExists();
    if (tableExists) {
      // user_pins table already exists
      return true;
    }
    
    // Try to create the table using Supabase's SQL execution
    const { error } = await supabase.rpc('create_user_pins_table', { user_id: userId });
    
    if (error) {
      // RPC function not available, trying direct SQL
      
      // Fallback: try to create table directly (this might not work due to RLS)
      const { error: sqlError } = await supabase
        .from('user_pins')
        .insert([{
          user_id: userId,
          pins: '[]',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }]);
      
      if (sqlError) {
        console.warn('[Pins] Could not create table or insert initial record:', sqlError.message);
        // This is expected if the table structure is different or RLS is blocking access
        return false;
      }
    }
    
    // user_pins table/record created successfully
    return true;
  } catch (error) {
    console.error('[Pins] Error creating user_pins table:', error.message);
    return false;
  }
}

// --- Debug function to check Supabase setup ---
export async function debugSupabaseSetup() {
  try {
    // Checking Supabase setup
    
    // Check if supabase client is available
    if (!supabase) {
      console.error('[Debug] Supabase client not available');
      return { status: 'error', message: 'Supabase client not available' };
    }
    
    // Check if user is authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError) {
      console.error('[Debug] Auth error:', authError.message);
      return { status: 'error', message: 'Auth error: ' + authError.message };
    }
    
    if (!user) {
      console.error('[Debug] No user authenticated');
      return { status: 'error', message: 'No user authenticated' };
    }
    
    // User authenticated
    
    // Check if user_pins table exists
    const tableExists = await checkUserPinsTableExists();
    // Table exists check completed
    
    // Try to query the table
    if (tableExists) {
      try {
        const { data, error } = await supabase
          .from('user_pins')
          .select('*')
          .eq('user_id', user.id);
        
        if (error) {
          console.error('[Debug] Query error:', error.message);
          return { 
            status: 'partial', 
            message: 'Table exists but query failed: ' + error.message,
            tableExists: true,
            userId: user.id
          };
        }
        
        // Query successful
        return { 
          status: 'success', 
          message: 'Supabase setup working correctly',
          tableExists: true,
          userId: user.id,
          data: data
        };
      } catch (queryError) {
        console.error('[Debug] Query exception:', queryError.message);
        return { 
          status: 'error', 
          message: 'Query exception: ' + queryError.message,
          tableExists: true,
          userId: user.id
        };
      }
    } else {
      console.warn('[Debug] user_pins table does not exist');
      return { 
        status: 'warning', 
        message: 'user_pins table does not exist',
        tableExists: false,
        userId: user.id
      };
    }
  } catch (error) {
    console.error('[Debug] Debug function error:', error.message);
    return { status: 'error', message: 'Debug function error: ' + error.message };
  }
}

// --- Pins ---
export async function saveUserPinsToSupabase(newPin, userId) {
  try {
    // 1. Fetch existing pin array (or empty)
    const { data: existing, error: fetchError } = await supabase
      .from('user_pins')
      .select('pins')
      .eq('user_id', userId)
      .single();

    if (fetchError && fetchError.code !== 'PGRST116') {
      // If error and not "row not found", throw
      throw fetchError;
    }

    // Handle both string and array formats for backward compatibility
    let currentPins;
    if (typeof existing?.pins === 'string') {
      try {
        currentPins = JSON.parse(existing.pins);
      } catch (parseError) {
        console.error('[Pins] Failed to parse existing pins string:', parseError.message);
        currentPins = [];
      }
    } else if (Array.isArray(existing?.pins)) {
      currentPins = [...existing.pins]; // Create a copy
    } else {
      currentPins = [];
    }

    // 2. Append the new pin
    currentPins.push(newPin);

    // 3. Save updated pins array back via UPSERT
    const { error: upsertError } = await supabase
      .from('user_pins')
      .upsert(
        { user_id: userId, pins: currentPins },
        { onConflict: 'user_id' }
      );

    if (upsertError) {
      console.error('[Pins] Supabase UPSERT failed:', upsertError.message);
      return false;
    }

    // Saved pin to Supabase
    return true;

  } catch (err) {
    console.error('[Pins] Unexpected save error:', err.message);
    return false;
  }
}

// Helper function to add a single new pin
export async function addNewPinToSupabase(pinData, userId) {
  try {
    const newPin = {
      name: pinData.name,
      lat: pinData.lat,
      lng: pinData.lng,
      created_at: new Date().toISOString()
    };
    
    const success = await saveUserPinsToSupabase(newPin, userId);
    if (success) {
      // Successfully added new pin to Supabase
      return true;
    } else {
      console.error(`[Pins] Failed to add new pin "${pinData.name}" to Supabase`);
      return false;
    }
  } catch (error) {
    console.error('[Pins] Error adding new pin to Supabase:', error.message);
    return false;
  }
}

// Function to load user pins from Supabase
export async function loadUserPinsFromSupabase(userId) {
  try {
    // Loading pins from Supabase
    
    // Query the user_pins table
    const { data, error } = await supabase
      .from('user_pins')
      .select('pins')
      .eq('user_id', userId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // Row not found - create empty row
        // No existing row found, creating empty one
        const { error: insertError } = await supabase
          .from('user_pins')
          .insert([{
            user_id: userId,
            pins: [],
            updated_at: new Date().toISOString()
          }]);
        
        if (insertError) {
          console.error('[Pins] Failed to create empty row:', insertError.message);
          return [];
        }
        
        console.log('[Pins] Created empty row for user');
        return [];
      } else {
        console.error('[Pins] Error loading pins from Supabase:', error.message);
        return [];
      }
    }

    if (!data || !data.pins) {
      console.log('[Pins] No pins data found, returning empty array');
      return [];
    }

    // Handle both string and array formats for backward compatibility
    let pins;
    if (typeof data.pins === 'string') {
      try {
        pins = JSON.parse(data.pins);
      } catch (parseError) {
        console.error('[Pins] Failed to parse pins string:', parseError.message);
        return [];
      }
    } else if (Array.isArray(data.pins)) {
      pins = data.pins;
    } else {
      console.warn('[Pins] Unexpected pins data format:', typeof data.pins);
      return [];
    }

    console.log('[Pins] Successfully loaded pins from Supabase:', pins.length);
    return pins;

  } catch (error) {
    console.error('[Pins] Unexpected error loading pins from Supabase:', error.message);
    return [];
  }
}

export async function savePins(customPins) {
  const saveData = customPins.map(pin => ({
    name: pin.name,
    lat: pin.lat,
    lng: pin.lng,
    style: pin.style || { variant: 'orange', size: 1.2 }
  }));
  
  // Save to localStorage
  localStorage.setItem('witd_pins', JSON.stringify(saveData));
  
  // Try to save to Supabase if user is authenticated
  try {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (user) {
      // Save the entire array of pins to Supabase
      const { error: upsertError } = await supabase
        .from('user_pins')
        .upsert({
          user_id: user.id,
          pins: saveData,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'user_id'
        });
      
      if (upsertError) {
        console.error('[Pins] Supabase UPSERT failed:', upsertError.message);
        console.log('[Pins] Using localStorage fallback');
      } else {
        console.log('[Pins] Successfully saved all pins to Supabase:', saveData.length, 'pins');
      }
    }
  } catch (error) {
    console.log('[Pins] Supabase save failed, using localStorage only:', error.message);
  }
}

export async function loadPins(map, customPins, attachPopupActions) {
  console.log('🚨 [loadPins] FUNCTION CALLED with map:', map, 'customPins:', customPins);
  
  // Check if user is logged in before loading data
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    console.log('[Pins] No user logged in, skipping pin loading');
    return;
  }
  
  // 🔧 Safe JSON.parse with error handling
  let savedPins = [];
  try {
    savedPins = JSON.parse(localStorage.getItem('witd_pins') || '[]') || [];
  } catch (err) {
    console.error('[Pins] Failed to parse localStorage pins:', err);
    savedPins = [];
  }
  
  // Check if localStorage was recently updated (within last 30 seconds) - indicates local clear operation
  const lastLocalUpdate = localStorage.getItem('witd_pins_last_update');
  const now = Date.now();
  const isRecentLocalUpdate = lastLocalUpdate && (now - parseInt(lastLocalUpdate)) < 30000;
  
  // If localStorage was recently updated, prioritize it over Supabase
  if (isRecentLocalUpdate) {
    console.log('[Pins] Recent localStorage update detected, skipping Supabase load');
  } else {
    // Try to load from Supabase if user is authenticated
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (user) {
      // First check if the user_pins table exists by trying to query it
      try {
        const { data, error } = await supabase
          .from('user_pins')
          .select('pins')
          .eq('user_id', user.id)
          .single();

        if (error) {
          // Check if it's a table not found error
          if (error.code === 'PGRST116' || error.message.includes('relation') || error.message.includes('does not exist')) {
            console.log('[Pins] user_pins table does not exist, creating it...');
            await createUserPinsTable(user.id);
            // Retry the query after table creation
            const { data: retryData, error: retryError } = await supabase
              .from('user_pins')
              .select('pins')
              .eq('user_id', user.id)
              .single();
            
            if (retryError) {
              throw retryError;
            }
            
            if (retryData?.pins) {
              try {
                savedPins = JSON.parse(retryData.pins);
                console.log('[Pins] Loaded from Supabase after table creation:', savedPins.length, 'pins');
                localStorage.setItem('witd_pins', JSON.stringify(savedPins));
              } catch (parseError) {
                console.error('[Pins] Failed to parse Supabase pins:', parseError);
              }
            }
          } else {
            throw error;
          }
        } else if (data?.pins) {
          try {
            // Handle both old string format and new array format
            let pinsData;
            if (typeof data.pins === 'string') {
              pinsData = JSON.parse(data.pins);
            } else if (Array.isArray(data.pins)) {
              pinsData = data.pins;
            } else {
              console.warn('[Pins] Unexpected pins data format:', typeof data.pins);
              pinsData = [];
            }
            
            savedPins = pinsData;
            console.log('[Pins] Loaded from Supabase:', savedPins.length, 'pins');
            
            // Update localStorage with Supabase data
            localStorage.setItem('witd_pins', JSON.stringify(savedPins));
          } catch (parseError) {
            console.error('[Pins] Failed to parse Supabase pins:', parseError);
            // Keep using localStorage data if Supabase data is corrupt
          }
        } else if (!data) {
          // No existing row found for user — create empty one
          console.log('[Pins] No existing row found for user — creating empty one');
          try {
            const { error: insertError } = await supabase.from('user_pins').insert([
              {
                user_id: user.id,
                pins: [],
                updated_at: new Date().toISOString()
              }
            ]);
            
            if (insertError) {
              console.error('[Pins] Failed to create empty row:', insertError.message);
            } else {
              console.log('[Pins] Created empty row for user');
              savedPins = []; // Set to empty array since we just created an empty row
            }
          } catch (insertException) {
            console.error('[Pins] Exception creating empty row:', insertException.message);
          }
        }
      } catch (tableError) {
        console.log('[Pins] Table operation failed, using localStorage:', tableError.message);
      }
    }
    } catch (error) {
      console.log('[Pins] Supabase load failed, using localStorage:', error.message);
    }
  }
  
  // Convert pins to Mapbox format and add them to the map using unified builder
  console.log('🚨 [loadPins] Processing', savedPins.length, 'saved pins');
  savedPins.forEach((data, index) => {
    console.log('🚨 [loadPins] Processing pin', index, ':', data);
    try {
      // Create a unique ID for each pin
      const pinId = `custom-pin-${index}`;
      
      // Prepare pin data with style (back-compat default if older saves lack style)
      const pinData = {
        id: pinId,
        name: data.name,
        lng: data.lng,
        lat: data.lat,
        style: data.style || { variant: 'orange', size: 0.3 }
      };
      
      // Create Mapbox marker using unified builder
      const marker = createPinMarker(pinData, { 
        onClick: () => {
          marker.togglePopup();
          // Bind popup actions when popup is opened
          setTimeout(() => {
            if (typeof window.bindPopupActions === 'function') {
              window.bindPopupActions(marker, pin);
            }
          }, 50);
        }
      });
      marker.addTo(map);
      
      // Create popup using unified builder
      const popup = createPinPopup(pinData);
      marker.setPopup(popup);
      
      // Create label marker
      const labelMarker = new mapboxgl.Marker({
        element: createLabelElement(data.name),
        anchor: 'bottom'
      })
      .setLngLat([data.lng, data.lat])
      .addTo(map);
      
      // Create pin object for management
      const pin = { 
        marker: { id: pinId, element: marker }, 
        name: data.name, 
        lat: data.lat, 
        lng: data.lng, 
        labelMarker: { id: `label-${pinId}`, element: labelMarker },
        style: pinData.style
      };
      customPins.push(pin);
        
      console.log(`[Pins] Added pin: ${data.name} at [${data.lat}, ${data.lng}]`);
    } catch (error) {
      console.error(`[Pins] Error adding pin ${data.name}:`, error);
    }
  });
}

// Helper function to bind popup actions (copied from pinManager.js)
function bindPopupActions(marker, pin) {
  console.log('[bindPopupActions] Called for pin:', pin.name);
  
  // Try to get popup element with retries
  let attempts = 0;
  const maxAttempts = 50; // Increased from 20
  
  const tryBind = () => {
    attempts++;
    console.log(`[bindPopupActions] Attempt ${attempts}/${maxAttempts} for pin:`, pin.name);
    
    const popup = marker.getPopup();
    console.log('[bindPopupActions] Popup object:', popup);
    
    if (popup) {
      const popupElement = popup.getElement();
      console.log('[bindPopupActions] Popup element:', popupElement);
      
      if (popupElement) {
        console.log('[bindPopupActions] Popup element found, checking for buttons...');
        const buttons = popupElement.querySelectorAll('button');
        console.log('[bindPopupActions] Found buttons:', buttons.length);
        
        if (buttons.length > 0) {
          console.log('[bindPopupActions] Binding actions for pin:', pin.name);
          bindActionsToPopup(popupElement, marker, pin);
          return;
        } else {
          console.log('[bindPopupActions] Popup element exists but no buttons found, retrying...');
        }
      }
    }
    
    if (attempts < maxAttempts) {
      console.log('[bindPopupActions] Popup element not ready, retrying in 200ms...');
      setTimeout(tryBind, 200);
    } else {
      console.error('[bindPopupActions] Failed to get popup element after', maxAttempts, 'attempts');
      // Try alternative approach - bind to marker click event
      console.log('[bindPopupActions] Trying alternative approach - binding to marker click');
      bindToMarkerClick(marker, pin);
    }
  };
  
  // Start binding after a longer initial delay to ensure map is fully loaded
  setTimeout(tryBind, 1000);
}

// Alternative approach - bind to marker click event when popup buttons fail
function bindToMarkerClick(marker, pin) {
  console.log('[bindToMarkerClick] Binding to marker click for pin:', pin.name);
  
  marker.getElement().addEventListener('click', (e) => {
    e.stopPropagation();
    console.log('[bindToMarkerClick] Marker clicked, showing custom popup for pin:', pin.name);
    
    // Create a custom popup with working buttons
    showCustomPinPopup(marker, pin);
  });
}

// Show custom popup with working buttons
function showCustomPinPopup(marker, pin) {
  // Remove existing popup
  if (marker.getPopup()) {
    marker.getPopup().remove();
  }
  
  // Create custom popup content
  const popupContent = document.createElement('div');
  popupContent.className = 'custom-pin-popup';
  popupContent.innerHTML = `
    <div class="pin-popup-content">
      <h3>${pin.name}</h3>
      <p>Lat: ${pin.lat.toFixed(6)}, Lng: ${pin.lng.toFixed(6)}</p>
      <div class="pin-popup-buttons">
        <button class="rename-btn" style="background: #007bff; color: white; border: none; padding: 8px 12px; border-radius: 4px; margin: 4px; cursor: pointer;">Rename</button>
        <button class="delete-btn" style="background: #dc3545; color: white; border: none; padding: 8px 12px; border-radius: 4px; margin: 4px; cursor: pointer;">Delete</button>
        <button class="journal-btn" style="background: #28a745; color: white; border: none; padding: 8px 12px; border-radius: 4px; margin: 4px; cursor: pointer;">Journal</button>
      </div>
    </div>
  `;
  
  // Create new popup
  const popup = new mapboxgl.Popup({
    closeButton: true,
    closeOnClick: false
  }).setDOMContent(popupContent);
  
  marker.setPopup(popup);
  popup.addTo(window.WITD.map);
  
  // Bind actions to the custom popup
  bindActionsToPopup(popupContent, marker, pin);
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
        // Remove from map
        if (pin.marker && pin.marker.element) {
          pin.marker.element.remove();
        }
        if (pin.labelMarker && pin.labelMarker.element) {
          pin.labelMarker.element.remove();
        }
        
        // Remove from array
        const index = window.customPins.indexOf(pin);
        if (index > -1) {
          window.customPins.splice(index, 1);
        }
        
        // Remove from local pin data
        const localIndex = window.localPinData.findIndex(p => 
          p.lat === pin.lat && p.lng === pin.lng && p.label === pin.name
        );
        if (localIndex > -1) {
          window.localPinData.splice(localIndex, 1);
          console.log('[Pins] Removed from localPinData, remaining:', window.localPinData.length);
        }
        
        await savePins(window.customPins);
        
        // Force update Supabase with the current state
        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            const cleanPins = window.customPins.map(pin => ({
              id: pin.marker?.id || pin.id,
              name: pin.name,
              lat: pin.lat,
              lng: pin.lng,
              style: pin.style || { variant: 'orange', size: 0.3 }
            }));
            
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
        
        // Re-bind event listeners for all remaining pins
        console.log('[Delete] Re-binding event listeners for remaining pins...');
        window.customPins.forEach(remainingPin => {
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

// Helper function to reopen rename dialog (copied from pinManager.js)
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
    const localIndex = window.localPinData.findIndex(p => 
      p.lat === pin.lat && p.lng === pin.lng
    );
    if (localIndex > -1) {
      window.localPinData[localIndex].label = newName;
      console.log('[Pins] Updated localPinData for renamed pin:', window.localPinData[localIndex]);
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

    await savePins(window.customPins);
  }
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

export async function loadTracks(map, drawnTracks, drawTrackLabel) {
  // Check if user is logged in before loading data
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    console.log('[Tracks] No user logged in, skipping track loading');
    return;
  }
  
  const savedTracks = JSON.parse(localStorage.getItem('witd_tracks') || '[]');
  savedTracks.forEach((data, index) => {
    if (data.coords && data.coords.length >= 2) {
      try {
        const trackId = `custom-track-${index}`;
        
        // Add track source
        if (!map.getSource(trackId)) {
          map.addSource(trackId, {
            type: 'geojson',
            data: {
              type: 'Feature',
              geometry: {
                type: 'LineString',
                coordinates: data.coords
              },
              properties: {
                name: data.name
              }
            }
          });
          
          // Add track line layer
          map.addLayer({
            id: trackId,
            type: 'line',
            source: trackId,
            layout: {
              'line-join': 'round',
              'line-cap': 'round'
            },
            paint: {
              'line-color': '#ff0000',
              'line-width': 3
            }
          });
          
          // Create track object for management
          const track = { 
            id: trackId, 
            coords: data.coords, 
            markerTypes: data.markerTypes, 
            name: data.name,
            source: trackId
          };
          drawnTracks.push(track);
          
          // Call drawTrackLabel if function exists
          if (typeof drawTrackLabel === 'function') {
            drawTrackLabel(track, data.name, data.markerTypes);
          }
          
          console.log(`[Tracks] Added track: ${data.name} with ${data.coords.length} points`);
        }
      } catch (error) {
        console.error(`[Tracks] Error adding track ${data.name}:`, error);
      }
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

export async function loadGpxFiles(map, gpxFiles, addGpxToMap) {
  // Check if user is logged in before loading data
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    console.log('[GPX] No user logged in, skipping GPX loading');
    return;
  }
  
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

// --- Global debug function for browser console ---
window.debugSupabasePins = async function() {
  console.log('🔍 Debugging Supabase pins setup...');
  
  try {
    // Import the debug function
    const { debugSupabaseSetup } = await import('./storeManager.js');
    const result = await debugSupabaseSetup();
    console.log('🔍 Debug result:', result);
    return result;
  } catch (error) {
    console.log('🔍 Error importing debug function:', error.message);
    
    // Fallback: try to call it directly if it's already loaded
    if (typeof window.debugSupabaseSetup === 'function') {
      const result = await window.debugSupabaseSetup();
      console.log('🔍 Debug result (direct call):', result);
      return result;
    } else {
      console.log('🔍 Debug function not available');
      return { status: 'error', message: 'Debug function not available' };
    }
  }
};

console.log('🔍 Debug function available: window.debugSupabasePins()');

// --- Simple global debug function ---
window.debugSupabaseSimple = async function() {
  console.log('🔍 Simple Supabase debug...');
  
  try {
    // Check if supabase is available
    if (typeof supabase === 'undefined') {
      console.log('❌ Supabase client not available');
      return { error: 'Supabase client not available' };
    }
    
    // Check if user is authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError) {
      console.log('❌ Auth error:', authError.message);
      return { error: 'Auth error: ' + authError.message };
    }
    
    if (!user) {
      console.log('❌ No user authenticated');
      return { error: 'No user authenticated' };
    }
    
    console.log('✅ User authenticated:', user.id);
    
    // Try to query user_pins table
    try {
      const { data, error } = await supabase
        .from('user_pins')
        .select('*')
        .eq('user_id', user.id);
      
      if (error) {
        console.log('❌ Query error:', error.message);
        return { 
          user: user.id, 
          error: error.message, 
          errorCode: error.code 
        };
      }
      
      console.log('✅ Query successful, data:', data);
      return { 
        user: user.id, 
        success: true, 
        data: data 
      };
    } catch (queryError) {
      console.log('❌ Query exception:', queryError.message);
      return { 
        user: user.id, 
        error: 'Query exception: ' + queryError.message 
      };
    }
  } catch (error) {
    console.log('❌ Debug function error:', error.message);
    return { error: 'Debug function error: ' + error.message };
  }
};

console.log('🔍 Simple debug function available: window.debugSupabaseSimple()');
