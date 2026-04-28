// JS/journalModal.js - Secure Journal with Premium API Integration
// Use window.journalDataKey to avoid redeclaration issues
if (!window.journalDataKey) {
  window.journalDataKey = 'witd_journal_entries';
}
if (!window.journalDraftKey) {
  window.journalDraftKey = 'witd_journal_draft';
}

let journalDraftSaveTimer = null;
let journalDraftStatusTimer = null;

function setJournalDraftStatus(text, tone = 'muted', autoClearMs = 0) {
  const statusEl = document.getElementById('journalDraftStatus');
  if (!statusEl) return;

  statusEl.textContent = text || '';
  statusEl.style.opacity = text ? '1' : '0';
  statusEl.style.color =
    tone === 'success' ? '#2e7d32'
      : tone === 'warn' ? '#b26a00'
        : '#6b7280';

  if (journalDraftStatusTimer) {
    clearTimeout(journalDraftStatusTimer);
    journalDraftStatusTimer = null;
  }
  if (autoClearMs > 0) {
    journalDraftStatusTimer = setTimeout(() => {
      const el = document.getElementById('journalDraftStatus');
      if (el) {
        el.textContent = '';
        el.style.opacity = '0';
      }
      journalDraftStatusTimer = null;
    }, autoClearMs);
  }
}

function getJournalDraftFromForm() {
  const titleEl = document.getElementById('journalTitle');
  const noteEl = document.getElementById('journalNote');
  const coordsEl = document.getElementById('journalCoords');
  return {
    title: titleEl ? titleEl.value : '',
    note: noteEl ? noteEl.value : '',
    coords: coordsEl ? coordsEl.value : '',
    updatedAt: new Date().toISOString()
  };
}

function normalizeJournalDraft(raw) {
  if (!raw || typeof raw !== 'object') return null;
  return {
    title: typeof raw.title === 'string' ? raw.title : '',
    note: typeof raw.note === 'string' ? raw.note : '',
    coords: typeof raw.coords === 'string' ? raw.coords : '',
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : null
  };
}

function isDraftEmpty(draft) {
  if (!draft) return true;
  return !String(draft.title || '').trim() && !String(draft.note || '').trim() && !String(draft.coords || '').trim();
}

function loadJournalDraftLocal() {
  try {
    const raw = localStorage.getItem(window.journalDraftKey);
    if (!raw) return null;
    return normalizeJournalDraft(JSON.parse(raw));
  } catch (err) {
    console.warn('[Journal] Failed to parse local draft:', err);
    return null;
  }
}

function saveJournalDraftLocal(draft) {
  try {
    if (!draft || isDraftEmpty(draft)) {
      localStorage.removeItem(window.journalDraftKey);
      setJournalDraftStatus('', 'muted');
      return;
    }
    localStorage.setItem(window.journalDraftKey, JSON.stringify(draft));
    setJournalDraftStatus('Saving draft...', 'muted');
  } catch (err) {
    console.warn('[Journal] Failed to save local draft:', err);
    setJournalDraftStatus('Draft save issue', 'warn');
  }
}

function applyDraftToForm(draft) {
  if (!draft) return;
  const titleEl = document.getElementById('journalTitle');
  const noteEl = document.getElementById('journalNote');
  const coordsEl = document.getElementById('journalCoords');
  if (titleEl) titleEl.value = draft.title || '';
  if (noteEl) noteEl.value = draft.note || '';
  if (coordsEl) coordsEl.value = draft.coords || '';
}

async function saveJournalDraftToSupabase(draft) {
  try {
    if (!window.supabaseClient?.auth) return;

    const { data: { user }, error: authError } = await window.supabaseClient.auth.getUser();
    if (authError || !user) return;

    const empty = isDraftEmpty(draft);

    if (empty) {
      const { error } = await window.supabaseClient
        .from('user_settings')
        .delete()
        .eq('user_id', user.id)
        .eq('setting_key', 'journal_draft');
      if (error && error.code !== '42P01') {
        console.warn('[Journal] Failed clearing remote draft:', error.message);
        setJournalDraftStatus('Draft stored locally', 'warn');
      } else {
        setJournalDraftStatus('', 'muted');
      }
      return;
    }

    const { error } = await window.supabaseClient
      .from('user_settings')
      .upsert({
        user_id: user.id,
        setting_key: 'journal_draft',
        setting_value: JSON.stringify(draft),
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'user_id,setting_key'
      });

    if (error) {
      if (error.code === '42P01') {
        console.log('[Journal] user_settings table missing, draft kept locally only');
        setJournalDraftStatus('Draft saved locally', 'warn');
      } else {
        console.warn('[Journal] Failed saving draft to Supabase:', error.message);
        setJournalDraftStatus('Draft stored locally', 'warn');
      }
    } else {
      setJournalDraftStatus('Draft saved', 'success', 2000);
    }
  } catch (err) {
    console.warn('[Journal] Error saving draft to Supabase:', err);
    setJournalDraftStatus('Draft stored locally', 'warn');
  }
}

async function loadJournalDraftFromSupabase() {
  try {
    if (!window.supabaseClient?.auth) return null;

    const { data: { user }, error: authError } = await window.supabaseClient.auth.getUser();
    if (authError || !user) return null;

    const { data, error } = await window.supabaseClient
      .from('user_settings')
      .select('setting_value')
      .eq('user_id', user.id)
      .eq('setting_key', 'journal_draft')
      .single();

    if (error) {
      if (error.code === 'PGRST116' || error.code === '42P01') return null;
      console.warn('[Journal] Failed loading draft from Supabase:', error.message);
      return null;
    }

    if (!data?.setting_value) return null;

    const parsed = typeof data.setting_value === 'string'
      ? JSON.parse(data.setting_value)
      : data.setting_value;
    return normalizeJournalDraft(parsed);
  } catch (err) {
    console.warn('[Journal] Error loading draft from Supabase:', err);
    return null;
  }
}

function scheduleDraftSave() {
  const draft = getJournalDraftFromForm();
  saveJournalDraftLocal(draft);

  if (journalDraftSaveTimer) {
    clearTimeout(journalDraftSaveTimer);
  }
  journalDraftSaveTimer = setTimeout(() => {
    saveJournalDraftToSupabase(draft);
  }, 700);
}

function clearDraftSaveTimer() {
  if (!journalDraftSaveTimer) return;
  clearTimeout(journalDraftSaveTimer);
  journalDraftSaveTimer = null;
}

async function flushDraftSave() {
  clearDraftSaveTimer();
  const draft = getJournalDraftFromForm();
  saveJournalDraftLocal(draft);
  if (!isDraftEmpty(draft)) {
    setJournalDraftStatus('Saving draft...', 'muted');
  }
  await saveJournalDraftToSupabase(draft);
}

async function clearJournalDraftEverywhere() {
  clearDraftSaveTimer();
  saveJournalDraftLocal(null);
  await saveJournalDraftToSupabase(null);
}

// Fallback to localStorage for offline functionality
function loadJournalEntries() {
  const raw = localStorage.getItem(window.journalDataKey);
  return raw ? JSON.parse(raw) : [];
}

function saveJournalEntries(entries) {
  localStorage.setItem(window.journalDataKey, JSON.stringify(entries));
}

async function addJournalEntry(entry) {
  try {
    // Try to save to secure backend first
    if (window.WITD?.apiManager) {
      console.log('[Journal] Attempting to save to secure backend...');
      await window.WITD.apiManager.saveJournalEntry(entry);
      console.log('[Journal] Successfully saved to backend');
    }
  } catch (error) {
    console.log('[Journal] Backend save failed, falling back to localStorage:', error.message);
    // Fallback to localStorage
    const entries = loadJournalEntries();
    entries.unshift(entry);
    saveJournalEntries(entries);
  }
  
  renderJournalList();
}

async function deleteJournalEntry(index) {
  const entries = loadJournalEntries();
  const entry = entries[index];
  
  try {
    // Get current user from Supabase
    const { data: { user } } = await window.supabaseClient.auth.getUser();
    
    if (user && entry.id) {
      // Delete from Supabase if entry has an ID
      const { error } = await supabase
        .from('journal_entries')
        .delete()
        .eq('id', entry.id)
        .eq('user_id', user.id);

      if (error) {
        throw error;
      }
      
      console.log('[Journal] Successfully deleted from Supabase');
    }
  } catch (error) {
    console.log('[Journal] Supabase delete failed:', error.message);
  }
  
  // Always update localStorage
  entries.splice(index, 1);
  saveJournalEntries(entries);
  renderJournalList();
}

async function renderJournalList() {
  const container = document.getElementById('journalList');
  let entries = loadJournalEntries();
  
  try {
    // Get current user from Supabase
    const { data: { user } } = await window.supabaseClient.auth.getUser();
    
    if (user) {
      console.log('[Journal] Attempting to load from Supabase...');
      
      // Fetch journal entries from Supabase
      const { data: backendData, error } = await supabase
        .from('journal_entries')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) {
        throw error;
      }

      if (backendData && backendData.length > 0) {
        // Convert Supabase format to local format
        entries = backendData.map(entry => ({
          id: entry.id,
          title: entry.title,
          note: entry.content,
          coords: entry.location,
          time: entry.created_at
        }));
        
        console.log('[Journal] Loaded from Supabase:', entries.length, 'entries');
        
        // Update localStorage with Supabase data
        saveJournalEntries(entries);
      }
    }
  } catch (error) {
    console.log('[Journal] Supabase load failed, using localStorage:', error.message);
  }
  
  container.innerHTML = entries.length === 0 ? '<p>No entries yet.</p>' : '';
  entries.forEach((entry, index) => {
    const div = document.createElement('div');
    div.className = 'journal-entry';
    div.style = 'padding:8px 6px;margin-bottom:6px;border:1px solid #ccc;border-radius:6px;background:#f9f9f9;display:flex;justify-content:space-between;align-items:flex-start;gap:10px;';
    div.innerHTML = `
      <div class="journal-meta" style="text-align:left;">
        <strong>${entry.title || 'Untitled Entry'}</strong><br>
        <small>${new Date(entry.time).toLocaleString()}</small>
        ${entry.coords ? `<br><small>${entry.coords}</small>` : ''}
      </div>
      <div class="journal-actions" style="display:flex;flex-direction:column;gap:4px;">
        <button onclick="viewJournalEntry(${index})" title="View">📖</button>
        <button onclick="deleteJournalEntry(${index})" title="Delete">🗑️</button>
      </div>
    `;
    container.appendChild(div);
  });

  // ✅ Re-align popup after list changes
  if (window.openPopup && window.openButton) {
    window.positionPopup(window.openPopup, window.openButton, window.openAlignRight);
  }
}

function viewJournalEntry(index) {
  const entries = loadJournalEntries();
  const entry = entries[index];
  
  // Create styled modal similar to sign-out popup but with black border
  const modal = document.createElement('div');
  modal.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 10000;
  `;
  
  const modalContent = document.createElement('div');
  modalContent.style.cssText = `
    background: white;
    border-radius: 20px;
    border: 2px solid #8B5CF6;
    padding: 30px;
    max-width: 500px;
    width: 90%;
    text-align: center;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
    position: relative;
  `;
  
  // Journal icon (📓 in purple square)
  const icon = document.createElement('div');
  icon.style.cssText = `
    width: 60px;
    height: 60px;
    background: #8B5CF6;
    border-radius: 12px;
    margin: 0 auto 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 30px;
    color: white;
  `;
  icon.innerHTML = '📓';
  
  // Title
  const title = document.createElement('h3');
  title.style.cssText = `
    margin: 0 0 15px 0;
    font-size: 24px;
    font-weight: bold;
    color: #333;
  `;
  title.textContent = entry.title || 'Untitled Entry';
  
  // Time
  const time = document.createElement('p');
  time.style.cssText = `
    margin: 0 0 20px 0;
    font-size: 14px;
    color: #666;
  `;
  time.textContent = new Date(entry.time).toLocaleString();
  
  // Coordinates (if available)
  let coordsElement = null;
  if (entry.coords) {
    coordsElement = document.createElement('p');
    coordsElement.style.cssText = `
      margin: 0 0 20px 0;
      font-size: 14px;
      color: #666;
    `;
    coordsElement.textContent = `Location: ${entry.coords}`;
  }
  
  // Note content (editable)
  const note = document.createElement('textarea');
  note.style.cssText = `
    margin: 0 0 25px 0;
    font-size: 16px;
    color: #333;
    line-height: 1.5;
    text-align: left;
    background: #f9f9f9;
    padding: 15px;
    border-radius: 8px;
    border: 1px solid #ddd;
    border-left: 4px solid #8B5CF6;
    width: 100%;
    min-height: 100px;
    resize: vertical;
    font-family: inherit;
    box-sizing: border-box;
  `;
  note.value = entry.note;
  
  // Edit button
  const editButton = document.createElement('button');
  editButton.style.cssText = `
    background: #6B7280;
    color: white;
    border: none;
    border-radius: 10px;
    padding: 8px 16px;
    font-size: 14px;
    font-weight: bold;
    cursor: pointer;
    transition: background 0.2s;
    margin-right: 10px;
  `;
  editButton.textContent = 'Edit';
  editButton.onclick = () => {
    note.readOnly = false;
    note.style.background = '#fff';
    note.style.border = '1px solid #8B5CF6';
    editButton.style.display = 'none';
    saveButton.style.display = 'inline-block';
  };
  editButton.onmouseover = () => {
    editButton.style.background = '#4B5563';
  };
  editButton.onmouseout = () => {
    editButton.style.background = '#6B7280';
  };
  
  // Save button
  const saveButton = document.createElement('button');
  saveButton.style.cssText = `
    background: #8B5CF6;
    color: white;
    border: none;
    border-radius: 10px;
    padding: 12px 30px;
    font-size: 16px;
    font-weight: bold;
    cursor: pointer;
    transition: background 0.2s;
    display: none;
  `;
  saveButton.textContent = 'Save';
  saveButton.onclick = () => {
    // Save the edited note
    const updatedNote = note.value.trim();
    if (updatedNote !== entry.note) {
      entry.note = updatedNote;
      saveJournalEntries(entries);
      // Update the entry in the list
      renderJournalList();
    }
    // Don't close the modal, just save
  };
  saveButton.onmouseover = () => {
    saveButton.style.background = '#7C3AED';
  };
  saveButton.onmouseout = () => {
    saveButton.style.background = '#8B5CF6';
  };
  
  // Close button (initially visible)
  const closeButton = document.createElement('button');
  closeButton.style.cssText = `
    background: #8B5CF6;
    color: white;
    border: none;
    border-radius: 10px;
    padding: 12px 30px;
    font-size: 16px;
    font-weight: bold;
    cursor: pointer;
    transition: background 0.2s;
  `;
  closeButton.textContent = 'Close';
  closeButton.onclick = () => {
    document.body.removeChild(modal);
  };
  closeButton.onmouseover = () => {
    closeButton.style.background = '#7C3AED';
  };
  closeButton.onmouseout = () => {
    closeButton.style.background = '#8B5CF6';
  };
  
  // Button container
  const buttonContainer = document.createElement('div');
  buttonContainer.style.cssText = `
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 10px;
  `;
  buttonContainer.appendChild(editButton);
  buttonContainer.appendChild(saveButton);
  buttonContainer.appendChild(closeButton);
  
  // Assemble modal
  modalContent.appendChild(icon);
  modalContent.appendChild(title);
  modalContent.appendChild(time);
  if (coordsElement) {
    modalContent.appendChild(coordsElement);
  }
  modalContent.appendChild(note);
  modalContent.appendChild(buttonContainer);
  modal.appendChild(modalContent);
  
  // Close on background click
  modal.onclick = (e) => {
    if (e.target === modal) {
      document.body.removeChild(modal);
    }
  };
  
  // Add to page
  document.body.appendChild(modal);
}

async function handleJournalFormSubmit(e) {
  e.preventDefault();
  const note = document.getElementById('journalNote').value.trim();
  const title = document.getElementById('journalTitle').value.trim();
  const coords = document.getElementById('journalCoords').value.trim();
  
  if (!note) return;
  
  const entry = {
    title,
    note,
    coords,
    time: Date.now()
  };
  
  await addJournalEntry(entry);
  document.getElementById('journalForm').reset();
  await clearJournalDraftEverywhere();
}

window.initJournal = () => {
  const journalModal = document.getElementById('journalModal');
  if (!journalModal) return;
  
  window.addJournalEntry = addJournalEntry;
  window.deleteJournalEntry = deleteJournalEntry;
  window.viewJournalEntry = viewJournalEntry;

  // Clear existing form and reinitialize to apply new styling
  const existingForm = document.getElementById('journalForm');
  if (existingForm) {
    existingForm.remove();
  }

  journalModal.innerHTML = `
  <div style="display:flex;flex-direction:column;width:100%;margin:0 auto;height:100%;box-sizing:border-box;padding:0 20px;">
    <div style="flex:1;display:flex;flex-direction:column;overflow:hidden;max-height:500px;">
      <h3 style="text-align:center;margin-bottom:12px;">📓 Journal</h3>
      <form id="journalForm" style="margin-bottom:16px;display:flex;flex-direction:column;align-items:center;">
        <input type="text" id="journalTitle" placeholder="Entry title (optional)" style="margin-bottom:6px;padding:8px;border-radius:8px;border:1px solid #ccc;box-sizing:border-box;"/>
        <textarea id="journalNote" placeholder="Write your observation or thoughts..." rows="3" style="padding:8px;border-radius:8px;border:1px solid #ccc;box-sizing:border-box;"></textarea>
        <input type="text" id="journalCoords" placeholder="Coordinates (optional)" style="margin-top:6px;margin-bottom:8px;padding:8px;border-radius:8px;border:1px solid #ccc;box-sizing:border-box;" />
        <button type="submit" class="popup-btn" style="box-sizing:border-box;">➕ Add Entry</button>
        <div id="journalDraftStatus" aria-live="polite" style="margin-top:6px;min-height:16px;font-size:12px;color:#6b7280;opacity:0;transition:opacity .2s ease;"></div>
      </form>
      <div style="flex:1;overflow-y:auto;min-height:0;">
        <div id="journalList" style="padding-top:8px;margin-top:12px;border-top:1px solid #ccc;"></div>
      </div>
    </div>
    <button class="close-modal popup-btn" style="margin:12px auto 0 auto;box-sizing:border-box;">Close</button>
  </div>
  <div class="modern-popup-arrow">
    <svg width="28" height="14" viewBox="0 0 28 14">
      <polygon points="14,14 0,0 28,0" fill="#fff" stroke="#e0e0e0" stroke-width="1"/>
    </svg>
  </div>
`;

  setTimeout(() => {
    const closeBtn = journalModal.querySelector('.close-modal');
    if (closeBtn) {
      closeBtn.onclick = async () => {
        await flushDraftSave();
        journalModal.style.display = 'none';
        window.openPopup = null;
        window.openButton = null;
      };
    }
  }, 0);

  const form = document.getElementById('journalForm');
  const titleInput = document.getElementById('journalTitle');
  const noteInput = document.getElementById('journalNote');
  const coordsInput = document.getElementById('journalCoords');

  form.addEventListener('submit', handleJournalFormSubmit);
  [titleInput, noteInput, coordsInput].forEach((el) => {
    if (!el) return;
    el.addEventListener('input', scheduleDraftSave);
    el.addEventListener('change', scheduleDraftSave);
  });

  const localDraft = loadJournalDraftLocal();
  if (localDraft && !isDraftEmpty(localDraft)) {
    applyDraftToForm(localDraft);
  }

  // Prefer the newest draft between local and cloud.
  loadJournalDraftFromSupabase().then((remoteDraft) => {
    if (!remoteDraft || isDraftEmpty(remoteDraft)) return;
    const latestLocal = loadJournalDraftLocal();
    const localTs = latestLocal?.updatedAt ? Date.parse(latestLocal.updatedAt) : 0;
    const remoteTs = remoteDraft.updatedAt ? Date.parse(remoteDraft.updatedAt) : 0;
    if (!latestLocal || remoteTs > localTs) {
      applyDraftToForm(remoteDraft);
      saveJournalDraftLocal(remoteDraft);
    }
  });

  renderJournalList();
};

// Function to force reinitialize the Journal modal with new styling
window.reinitJournal = () => {
  const journalModal = document.getElementById('journalModal');
  if (journalModal) {
    journalModal.innerHTML = '';
    window.initJournal();
  }
};
