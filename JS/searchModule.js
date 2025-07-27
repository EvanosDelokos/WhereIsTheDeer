console.log("Module loaded: searchModule.js");

// Get elements
const searchInput = document.getElementById("addressSearch");
const suggestionsBox = document.getElementById("addressSuggestions");

let searchMarker = null; // store single search marker

// API-based search function
async function searchAddresses(query) {
  if (!query || query.trim().length < 2) {
    return [];
  }

  try {
    const response = await fetch(`https://witd-api-production.up.railway.app/search?q=${encodeURIComponent(query.trim())}`);
    
    if (!response.ok) {
      console.error('Search API request failed:', response.status, response.statusText);
      return [];
    }

    const results = await response.json();
    return results || [];
  } catch (error) {
    console.error('Error fetching search results:', error);
    return [];
  }
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
