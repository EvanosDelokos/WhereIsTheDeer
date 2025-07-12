console.log("Module loaded: searchModule.js");

// Get elements
const searchInput = document.getElementById("addressSearch");
const suggestionsBox = document.getElementById("addressSuggestions");

let db;
let searchMarker = null; // store single search marker

initSqlJs({
  locateFile: file => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.8.0/${file}`
}).then(SQL => {
fetch('https://pub-4fb36f4851fc417d8fee38f3358690bb.r2.dev/addresses.sqlite')
    .then(response => response.arrayBuffer())
    .then(data => {
      db = new SQL.Database(new Uint8Array(data));
      console.log("SQLite DB loaded");
      searchInput.disabled = false;
    });
});

// Final smart split doSearch
async function doSearch(query) {
  if (!db) {
    console.warn("DB not loaded yet");
    return [];
  }

  const terms = query.trim().split(/\s+/);
  if (terms.length === 0) return [];

  let addressTerms = [];
  let suburbTerm = "";
  if (terms.length === 1) {
    addressTerms = terms;
  } else {
    addressTerms = terms.slice(0, -1);
    suburbTerm = terms.slice(-1)[0];
  }

  const addrConds = addressTerms.map((t, i) =>
    `REPLACE(address, '.0 ', ' ') LIKE $a${i} COLLATE NOCASE`
  ).join(' AND ');

  const sql = `
    SELECT * FROM addresses
    WHERE 
      (${addrConds})
      ${suburbTerm ? `AND (suburb LIKE $suburb COLLATE NOCASE)` : ''}
    LIMIT 10;
  `;

  const stmt = db.prepare(sql);
  const bindings = {};
  addressTerms.forEach((t, i) => {
    bindings[`$a${i}`] = `%${t}%`;
  });
  if (suburbTerm) {
    bindings[`$suburb`] = `%${suburbTerm}%`;
  }

  stmt.bind(bindings);

  const results = [];
  while (stmt.step()) {
    const row = stmt.getAsObject();
    row.address = row.address.replace(/\.0 /g, ' ');
    results.push(row);
  }
  stmt.free();
  return results;
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
    const results = await doSearch(query);
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
