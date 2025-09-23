console.log('[SearchUI] ===== MODULE STARTING =====');
console.log('[SearchUI] Module loaded - Starting initialization...');
console.log('[SearchUI] Testing basic functionality...');
console.log('[SearchUI] Document object available:', typeof document);
console.log('[SearchUI] Window object available:', typeof window);

// Global variables declared at the top to prevent crashes
let searchInput = null;
let suggestionsBox = null;
let searchMarker = null; // store single search marker

// Address search functions using the new API
async function initAddressSearch() {
  console.log('[SearchUI] Address search initialization - using new API');
  return Promise.resolve();
}

async function searchAddresses(query) {
  console.log('[SearchUI] Searching addresses via API:', query);
  try {
    const response = await fetch(`https://api.whereisthedeer.com.au/search?q=${encodeURIComponent(query)}`);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    console.log('[SearchUI] API response:', data);
    return data || [];
  } catch (error) {
    console.error('[SearchUI] Search API error:', error);
    return [];
  }
}

// Fallback function removed - using single API call approach

function safelyInitSearch() {
  console.log('[SearchUI] DOM Ready ✅');
  console.log('[SearchUI] Document readyState:', document.readyState);
  
  // Initialize DOM elements
  searchInput = document.getElementById("addressSearch");
  suggestionsBox = document.getElementById("addressSuggestions");
  
  console.log('[SearchUI] Search input element:', searchInput);
  console.log('[SearchUI] Suggestions box element:', suggestionsBox);
  
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    console.log('[SearchUI] Setting up listeners...');
    setupSearchListeners();
    console.log('[SearchUI] Search listeners setup complete ✅');
  } else {
    window.addEventListener('DOMContentLoaded', setupSearchListeners);
  }
}

console.log('[SearchUI] About to check document.readyState:', document.readyState);

if (document.readyState === 'loading') {
  console.log('[SearchUI] DOM still loading, adding event listener...');
  document.addEventListener('DOMContentLoaded', safelyInitSearch);
} else {
  console.log('[SearchUI] DOM already loaded, calling safelyInitSearch immediately...');
  // DOM already loaded
  safelyInitSearch();
}



// Setup search input listeners
function setupSearchListeners() {
  console.log('[SearchUI] Setting up search listeners...');
  
  if (!searchInput || !suggestionsBox) {
    console.error('[SearchUI] Required DOM elements not found!');
    return;
  }
  
  // Debounced input listener
  let debounceTimer;
  searchInput.addEventListener("input", function () {
    clearTimeout(debounceTimer);
    const query = this.value.trim();
    if (query.length < 2) {
      suggestionsBox.style.display = "none";
      suggestionsBox.innerHTML = "";
      return;
    }
    debounceTimer = setTimeout(async () => {
      const results = await searchAddresses(query);
      console.log('[SearchUI] API response:', results);
      showSuggestions(results);
    }, 200);
  });

  // Enter key picks first suggestion
  searchInput.addEventListener("keydown", function (e) {
    if (e.key === "Enter") {
      e.preventDefault();
      const first = suggestionsBox.querySelector(".suggestion");
      if (first) first.click();
    }
  });

  // ? icon picks first too
  document.getElementById("helpIcon")?.addEventListener("click", () => {
    const first = suggestionsBox.querySelector(".suggestion");
    if (first) first.click();
  });

  // Click outside hides suggestions
  document.addEventListener("click", function (e) {
    if (!searchInput.contains(e.target) && !suggestionsBox.contains(e.target)) {
      suggestionsBox.style.display = "none";
    }
  });
}

// Show search suggestions
function showSuggestions(results) {
  suggestionsBox.innerHTML = "";

  results.forEach(result => {
    const div = document.createElement("div");
    div.className = "suggestion";
    div.textContent = `${result.address}, ${result.suburb} ${result.postcode}`;

    div.addEventListener("click", () => {
      searchInput.value = `${result.address}, ${result.suburb} ${result.postcode}`;
      suggestionsBox.style.display = "none";

      if (window.WITD && window.WITD.map) {
        window.WITD.map.setView([result.lat, result.lon], 16);

        if (searchMarker) {
          window.WITD.map.removeLayer(searchMarker);
        }

        searchMarker = L.marker([result.lat, result.lon]).addTo(window.WITD.map);

        searchMarker.bindPopup(`
          <div style="
            display: flex; 
            justify-content: space-between;
            align-items: flex-start;
            gap: 12px;
            max-width: 250px;
          ">
            <span style="
              flex: 1;
              word-break: break-word;
              overflow-wrap: anywhere;
            ">
              ${result.address}, ${result.suburb} ${result.postcode}
            </span>
            <button class="delete-marker-btn" style="
              border: none; 
              background: none; 
              cursor: pointer;
              padding: 0;
              flex-shrink: 0;
            ">🗑️</button>
          </div>
        `).openPopup();

        searchMarker.on('popupopen', () => {
          const btn = document.querySelector('.delete-marker-btn');
          if (btn) {
            btn.addEventListener('click', () => {
              window.WITD.map.removeLayer(searchMarker);
              searchMarker = null;
            });
          }
        });
      }
    });

    suggestionsBox.appendChild(div);
  });

  suggestionsBox.style.display = results.length ? "block" : "none";
}

console.log('[SearchUI] ===== MODULE COMPLETE ====='); 