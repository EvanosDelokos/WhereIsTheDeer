// JS/journalModal.js
const journalDataKey = 'witd_journal_entries';

function loadJournalEntries() {
  const raw = localStorage.getItem(journalDataKey);
  return raw ? JSON.parse(raw) : [];
}

function saveJournalEntries(entries) {
  localStorage.setItem(journalDataKey, JSON.stringify(entries));
}

function addJournalEntry(entry) {
  const entries = loadJournalEntries();
  entries.unshift(entry); // newest first
  saveJournalEntries(entries);
  renderJournalList();
}

function deleteJournalEntry(index) {
  const entries = loadJournalEntries();
  entries.splice(index, 1);
  saveJournalEntries(entries);
  renderJournalList();
}

function renderJournalList() {
  const container = document.getElementById('journalList');
  const entries = loadJournalEntries();
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
    if (openPopup && openButton) {
        positionPopup(openPopup, openButton, openAlignRight);
      }
    }

function viewJournalEntry(index) {
  const entries = loadJournalEntries();
  const entry = entries[index];
  alert(`Title: ${entry.title || 'Untitled'}\nTime: ${new Date(entry.time).toLocaleString()}\n\n${entry.note}`);
}

function handleJournalFormSubmit(e) {
  e.preventDefault();
  const note = document.getElementById('journalNote').value.trim();
  const title = document.getElementById('journalTitle').value.trim();
  const coords = document.getElementById('journalCoords').value.trim();
  if (!note) return;
  addJournalEntry({
    title,
    note,
    coords,
    time: Date.now()
  });
  document.getElementById('journalForm').reset();
}

window.initJournal = () => {
  const journalModal = document.getElementById('journalModal');
  if (!journalModal) return;
  window.addJournalEntry = addJournalEntry;


  // Only inject once
  if (document.getElementById('journalForm')) {
    renderJournalList();
    return;
  }

  journalModal.innerHTML = `
  <div style="display:flex;flex-direction:column;width:100%;max-width:600px;margin:0 auto;height:100%;box-sizing:border-box;">
    <div style="flex:1;display:flex;flex-direction:column;overflow:hidden;max-height:500px;">
      <h3 style="text-align:center;margin-bottom:12px;">📓 Journal</h3>
      <form id="journalForm" style="margin-bottom:16px;">
        <input type="text" id="journalTitle" placeholder="Entry title (optional)" style="width:100%;margin-bottom:6px;padding:8px;border-radius:8px;border:1px solid #ccc;box-sizing:border-box;"/>
        <textarea id="journalNote" placeholder="Write your observation or thoughts..." rows="3" style="width:100%;padding:8px;border-radius:8px;border:1px solid #ccc;box-sizing:border-box;"></textarea>
        <input type="text" id="journalCoords" placeholder="Coordinates (optional)" style="width:100%;margin-top:6px;margin-bottom:8px;padding:8px;border-radius:8px;border:1px solid #ccc;box-sizing:border-box;" />
        <button type="submit" class="popup-btn" style="width:100%;box-sizing:border-box;">➕ Add Entry</button>
      </form>
      <div style="flex:1;overflow-y:auto;min-height:0;">
        <div id="journalList" style="padding-top:8px;margin-top:12px;border-top:1px solid #ccc;"></div>
      </div>
    </div>
    <button class="close-modal popup-btn" style="width:100%;margin-top:12px;box-sizing:border-box;">Close</button>
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
      closeBtn.onclick = () => {
        journalModal.style.display = 'none';
        openPopup = null;
        openButton = null;
      };
    }
  }, 0);
  

  document.getElementById('journalForm').addEventListener('submit', handleJournalFormSubmit);
  renderJournalList();
};
