console.log("Module loaded: speciesLayer");
const ZONES_URL = "https://zones.whereisthedeer.com.au/zones";
const CLOSED_URL = "https://zones.whereisthedeer.com.au/closed";
const RULES_URL = "https://zones.whereisthedeer.com.au/rules";
let currentSpecies = "OFF";
window.currentSpecies = currentSpecies;
// Function to close any existing species popups
function closeSpeciesPopups() {
  const map = window.WITD?.map;
  if (map) {
    // Close all popups on the map
    const popups = document.querySelectorAll('.mapboxgl-popup');
    popups.forEach(popup => {
      const t = popup.closest('.mapboxgl-popup-content')?.textContent || '';
      if (t.includes('Species:') || t.includes('Sambar Deer')) {
        popup.remove();
      }
    });
  }
}

// Make the function globally available
window.closeSpeciesPopups = closeSpeciesPopups;

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function closedPopupValuePresent(v) {
  if (v === null || v === undefined) return false;
  if (typeof v === 'number') return Number.isFinite(v);
  if (typeof v === 'string') return v.trim() !== '';
  return true;
}

const CLOSED_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function parseIsoLocalDate(raw) {
  const m = String(raw).trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  const dt = new Date(y, mo, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo || dt.getDate() !== d) return null;
  return dt;
}

function formatClosedPopupDay(d) {
  return `${d.getDate()} ${CLOSED_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

function formatClosedDateRange(startRaw, endRaw) {
  const ds = parseIsoLocalDate(startRaw);
  const de = parseIsoLocalDate(endRaw);
  if (ds && de) return `${formatClosedPopupDay(ds)} → ${formatClosedPopupDay(de)}`;
  if (ds) return formatClosedPopupDay(ds);
  if (de) return formatClosedPopupDay(de);
  return '';
}

function formatClosedStatus(type) {
  const u = String(type).trim().toUpperCase();
  if (u.includes('NO HUNTING')) return 'No hunting permitted';
  return String(type)
    .trim()
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function cleanClosedIssue(issue) {
  let s = String(issue).trim();
  const cut = s.search(/\s+-\s*Regulation that prohibits/i);
  if (cut >= 0) s = s.slice(0, cut).trim();
  return s;
}

function formatClosedHuntTyp(raw) {
  return String(raw)
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

function shortenClosedLegal(text) {
  const t = String(text).trim();
  if (t.length <= 100) return t;
  const parts = t.split(/\s+-\s+/);
  if (parts[0].length >= 15 && parts[0].length < t.length) return parts[0].trim();
  const cut = t.slice(0, 97).lastIndexOf(' ');
  const head = cut > 40 ? t.slice(0, cut) : t.slice(0, 97);
  return `${head}…`;
}

function witdMapPopupWrap(headerHtml, bodyRowsHtml) {
  const body =
    bodyRowsHtml && String(bodyRowsHtml).length
      ? '<div class="witd-info-body-scroll"><div class="witd-map-popup-card__body">' + bodyRowsHtml + '</div></div>'
      : '';
  return (
    '<div class="witd-info-popup">' +
    '<div class="witd-info-header">' + headerHtml + '</div>' +
    body +
    '</div>'
  );
}

/** @param {'green'|'blue'|'amber'|'purple'|'red'|'neutral'} tint */
function witdMapPopupInfoRow(icon, label, valueEscaped, tint) {
  return (
    '<div class="witd-map-popup-card__info witd-map-popup-card__info--' + tint + '">' +
    '<span class="witd-map-popup-card__info-icon" aria-hidden="true">' + icon + '</span>' +
    '<div class="witd-map-popup-card__info-main">' +
    '<span class="witd-map-popup-card__info-label">' + escapeHtml(label) + '</span>' +
    '<span class="witd-map-popup-card__info-value">' + valueEscaped + '</span>' +
    '</div></div>'
  );
}

function buildClosedAreaPopupHtml(props) {
  const header =
    '<div class="witd-map-popup-card__header">' +
    '<span class="witd-map-popup-card__header-icon" aria-hidden="true">🚫</span>' +
    '<div class="witd-map-popup-card__header-titles">' +
    '<div class="witd-map-popup-card__header-title">Closed Area</div>' +
    '</div></div>';

  const rows = [];

  if (closedPopupValuePresent(props.TYPE)) {
    rows.push(
      witdMapPopupInfoRow('⚠️', 'Status', escapeHtml(formatClosedStatus(props.TYPE)), 'red')
    );
  }

  if (closedPopupValuePresent(props.ISSUE)) {
    const issue = cleanClosedIssue(props.ISSUE);
    if (issue) {
      rows.push(witdMapPopupInfoRow('📍', 'Issue', escapeHtml(issue), 'neutral'));
    }
  }

  if (closedPopupValuePresent(props.HUNT_TYP)) {
    rows.push(
      witdMapPopupInfoRow('🦌', 'Hunt Type', escapeHtml(formatClosedHuntTyp(props.HUNT_TYP)), 'purple')
    );
  }

  const startOk = closedPopupValuePresent(props.START_DATE);
  const endOk = closedPopupValuePresent(props.END_DATE);
  if (startOk || endOk) {
    const range = formatClosedDateRange(
      startOk ? props.START_DATE : '',
      endOk ? props.END_DATE : ''
    );
    if (range) {
      rows.push(witdMapPopupInfoRow('📅', 'Dates', escapeHtml(range), 'blue'));
    }
  }

  if (closedPopupValuePresent(props.LEG_INSTR)) {
    rows.push(
      witdMapPopupInfoRow('⚖️', 'Legal', escapeHtml(shortenClosedLegal(props.LEG_INSTR)), 'blue')
    );
  }

  if (closedPopupValuePresent(props.ORG)) {
    rows.push(witdMapPopupInfoRow('🏢', 'Authority', escapeHtml(String(props.ORG)), 'purple'));
  }

  if (closedPopupValuePresent(props.AREA_HA)) {
    const n = typeof props.AREA_HA === 'number' ? props.AREA_HA : parseFloat(String(props.AREA_HA).trim());
    if (Number.isFinite(n)) {
      const rounded = Math.round(n).toLocaleString();
      rows.push(witdMapPopupInfoRow('📏', 'Size', escapeHtml(rounded + ' ha'), 'green'));
    }
  }

  if (closedPopupValuePresent(props.WED_ADDRES)) {
    rows.push(
      witdMapPopupInfoRow('🔗', 'Address', escapeHtml(String(props.WED_ADDRES).trim()), 'neutral')
    );
  }

  return witdMapPopupWrap(header, rows.join(''));
}

function getSeasonText(props, rule) {
  if (!rule || !rule.seasonal) return null;

  const name = (props.NAME || "").toUpperCase();
  const plm = String(props.PLM_ID || "");

  // --- PLM_ID based mapping (preferred) ---
  // (structure ready, even if not fully populated yet)

  const SEASON_BY_PLM = {
    // Example:
    // "12345": "First Saturday after Easter → 30 Nov"
  };

  if (SEASON_BY_PLM[plm]) {
    return SEASON_BY_PLM[plm];
  }

  // --- NAME fallback (temporary safe method) ---

  if (name.includes("EILDON")) {
    return "First Saturday after Easter → 30 Nov";
  }

  if (
    name.includes("ALPINE") ||
    name.includes("BAW BAW") ||
    name.includes("SNOWY") ||
    name.includes("ERRINUNDRA") ||
    name.includes("MITCHELL") ||
    name.includes("TARA")
  ) {
    return "15 Feb → 15 Dec";
  }

  return "Seasonal restrictions apply";
}

function buildSambarZonePopupHtml(props) {
  const zoneName = props.NAME ?? props.Name ?? 'Unknown';
  const header =
    '<div class="witd-map-popup-card__header">' +
    '<span class="witd-map-popup-card__header-icon" aria-hidden="true">🦌</span>' +
    '<div class="witd-map-popup-card__header-titles">' +
    '<div class="witd-map-popup-card__header-title">' + escapeHtml(String(zoneName)) + '</div>' +
    '<div class="witd-map-popup-card__header-sub">Sambar Deer</div>' +
    '</div></div>';

  const rawCode = props.DEERSAMBCD;
  const code =
    rawCode != null && String(rawCode).trim() !== ''
      ? String(rawCode).trim()
      : '';
  const rule =
    code && window.huntRules && typeof window.huntRules === 'object'
      ? window.huntRules[code]
      : undefined;

  const seasonText = getSeasonText(props, rule);

  const rows = [];

  if (!rule) {
    rows.push(witdMapPopupInfoRow('✅', 'Status', escapeHtml('No Sambar hunting permitted'), 'green'));
  } else {
    const statusText = rule.allowed ? 'Hunting permitted' : 'No Sambar hunting permitted';
    rows.push(witdMapPopupInfoRow('✅', 'Status', escapeHtml(statusText), 'green'));

    const methods =
      Array.isArray(rule.method) && rule.method.length
        ? rule.method.join(', ')
        : '';
    if (methods) {
      rows.push(witdMapPopupInfoRow('🎯', 'Method', escapeHtml(methods), 'blue'));
    }

    rows.push(witdMapPopupInfoRow('🐕', 'Dogs', escapeHtml(rule.dogs_allowed ? 'Allowed' : 'Not allowed'), 'amber'));
    rows.push(
      witdMapPopupInfoRow(
        '🔐',
        'Permission',
        escapeHtml(rule.requires_permission ? 'Required' : 'Not required'),
        'amber'
      )
    );
    rows.push(witdMapPopupInfoRow('📅', 'Seasonal', escapeHtml(rule.seasonal ? 'Yes' : 'No'), 'purple'));
    if (seasonText) {
      rows.push(witdMapPopupInfoRow('📅', 'Season', escapeHtml(seasonText), 'purple'));
    }
  }

  if (closedPopupValuePresent(props.LGA_NAME)) {
    rows.push(witdMapPopupInfoRow('📍', 'LGA', escapeHtml(String(props.LGA_NAME).trim()), 'purple'));
  }
  if (closedPopupValuePresent(props.MMGT_ONGEN)) {
    rows.push(
      witdMapPopupInfoRow('🏛️', 'Land Manager', escapeHtml(String(props.MMGT_ONGEN).trim()), 'purple')
    );
  }

  if (closedPopupValuePresent(props.CLOSED_AREA)) {
    const v = props.CLOSED_AREA;
    const yn =
      v === true || v === 'Y' || v === 'yes' || v === 'Yes' || v === 1 || v === '1'
        ? 'Yes'
        : v === false || v === 'N' || v === 'no' || v === 'No' || v === 0 || v === '0'
          ? 'No'
          : String(v);
    rows.push(witdMapPopupInfoRow('🚫', 'Closed Area', escapeHtml(yn), 'red'));
  }

  return witdMapPopupWrap(header, rows.join(''));
}

document.addEventListener("DOMContentLoaded", () => {
  if (window.WITD && window.WITD.map) {
    initSpeciesLayer(window.WITD.map);
  } else {
    window.addEventListener('witd:map-ready', (event) => {
      const readyMap = event.detail?.map || window.WITD?.map;
      if (readyMap) {
        initSpeciesLayer(readyMap);
      }
    }, { once: true });
  }
});

function initSpeciesLayer(map) {
  // Initialize storage for species layer groups (Mapbox GL JS approach)
  if (!window.WITD) window.WITD = {};
  
  window.WITD.speciesLayers = {};
  window.WITD.currentSpeciesLayer = null;

  window.loadZonesLayer = function() {
    const zonesData = window.WITD?.allZonesGeojson;
    if (!zonesData) {
      console.warn("Zones data not loaded yet.");
      return;
    }

    if (map.getLayer('zones-layer')) {
      map.removeLayer('zones-layer');
    }
    if (map.getSource('zones-source')) {
      map.removeSource('zones-source');
    }

    window.safeAddToMap(map, () => {
      map.addSource('zones-source', {
        type: 'geojson',
        data: zonesData
      });

      map.addLayer({
        id: 'zones-layer',
        type: 'fill',
        source: 'zones-source',
        layout: { visibility: 'none' },
        paint: { 'fill-opacity': 0 }
      });

      console.log('Zones base source added to map');
    });

    console.log("Zones loaded");
  };

  fetch(RULES_URL)
    .then(res => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    })
    .then(rulesData => {
      window.huntRules = rulesData;
      const ruleCount = Array.isArray(rulesData)
        ? rulesData.length
        : rulesData && typeof rulesData === 'object'
          ? Object.keys(rulesData).length
          : 0;
      console.log('[Rules] Loaded rules.json', ruleCount);
    })
    .catch(err => console.error('[Rules] Failed to load rules.json', err));

  let closedLayerLoadInFlight = false;
  let closedLayerReloadPending = false;

  window.loadClosedLayer = function() {
    if (closedLayerLoadInFlight) {
      closedLayerReloadPending = true;
      return;
    }

    closedLayerLoadInFlight = true;
    console.log("📦 Loading closed.json...");

    fetch(CLOSED_URL)
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then(data => {
        window.safeAddToMap(map, () => {
          if (map.getLayer('closed-areas-line')) map.removeLayer('closed-areas-line');
          if (map.getLayer('closed-areas-fill')) map.removeLayer('closed-areas-fill');
          if (map.getSource('closed-areas')) map.removeSource('closed-areas');

          map.addSource('closed-areas', { type: 'geojson', data });
          const beforeId = map.getLayer('species-fill')
            ? 'species-fill'
            : (() => {
                const style = map.getStyle();
                const layers = style && Array.isArray(style.layers) ? style.layers : [];
                for (let i = 0; i < layers.length; i++) {
                  if (layers[i].type === 'symbol') return layers[i].id;
                }
                return undefined;
              })();

          map.addLayer(
            {
              id: 'closed-areas-fill',
              type: 'fill',
              source: 'closed-areas',
              layout: { visibility: 'none' },
              paint: {
                'fill-color': 'red',
                'fill-opacity': 0.18
              }
            },
            beforeId
          );
          map.addLayer(
            {
              id: 'closed-areas-line',
              type: 'line',
              source: 'closed-areas',
              layout: { visibility: 'none' },
              paint: {
                'line-color': 'red',
                'line-width': 1,
                'line-opacity': 0.55
              }
            },
            beforeId
          );

          setClosedOverlayVisibility(map, closedOverlayOnForSpecies(window.WITD.currentSpeciesLayer));
          if (window.WITD._closedAreasClickHandler) {
            map.off('click', 'closed-areas-fill', window.WITD._closedAreasClickHandler);
          }
          if (window.WITD._closedAreasMouseEnterHandler) {
            map.off('mouseenter', 'closed-areas-fill', window.WITD._closedAreasMouseEnterHandler);
          }
          if (window.WITD._closedAreasMouseLeaveHandler) {
            map.off('mouseleave', 'closed-areas-fill', window.WITD._closedAreasMouseLeaveHandler);
          }

          window.WITD._closedAreasClickHandler = (e) => {
            if ((window.WITD?.draw?.isActive && window.WITD.draw.isActive()) || window.WITD?.pinMode || window.WITD?.processingPinPlacement) {
              return;
            }
            if (!e.features.length) return;
            const props = e.features[0].properties;
            new mapboxgl.Popup({ maxWidth: '400px' })
              .setLngLat(e.lngLat)
              .setHTML(buildClosedAreaPopupHtml(props))
              .addTo(map);
          };

          window.WITD._closedAreasMouseEnterHandler = () => {
            if ((window.WITD?.draw?.isActive && window.WITD.draw.isActive()) || window.WITD?.pinMode || window.WITD?.processingPinPlacement) {
              return;
            }
            map.getCanvas().style.cursor = 'pointer';
          };

          window.WITD._closedAreasMouseLeaveHandler = () => {
            if ((window.WITD?.draw?.isActive && window.WITD.draw.isActive()) || window.WITD?.pinMode || window.WITD?.processingPinPlacement) {
              return;
            }
            map.getCanvas().style.cursor = '';
          };

          map.on('click', 'closed-areas-fill', window.WITD._closedAreasClickHandler);
          map.on('mouseenter', 'closed-areas-fill', window.WITD._closedAreasMouseEnterHandler);
          map.on('mouseleave', 'closed-areas-fill', window.WITD._closedAreasMouseLeaveHandler);
          console.log("Closed layer loaded");
          console.log("✅ Closed layer added to map");
        });
      })
      .catch(err => console.error('[Closed] Failed to load closed.json', err))
      .finally(() => {
        closedLayerLoadInFlight = false;
        if (closedLayerReloadPending) {
          closedLayerReloadPending = false;
          window.loadClosedLayer();
        }
      });
  };
  window.loadClosedLayer();
  
  // Fetch zones data and create layer groups
  fetch(ZONES_URL)
    .then(res => res.json())
    .then(data => {
      console.log(`Zones loaded: ${data.features.length} features`);

      // Process each feature and categorize by species
      const speciesData = {
        "Deer": { type: "FeatureCollection", features: [] },
        "Hog Deer": { type: "FeatureCollection", features: [] },
        "Duck": { type: "FeatureCollection", features: [] }
        // "Stubble Quail": { type: "FeatureCollection", features: [] },
        // "Pest": { type: "FeatureCollection", features: [] }
      };

      data.features.forEach(feature => {
        const props = feature.properties;
        let species = null;

        if (props.DEERSAMBCD || props.DEERREDFCD || props.DEERFALCD || props.DEERCHICD || props.DEERRUSCD) {
          species = "Deer";
        } else if (props.DEERHOGCD) {
          species = "Hog Deer";
        } else if (props.BIRDDUCKCD) {
          species = "Duck";
        }
        // } else if (props.BIRDQUALCD) {
        //   species = "Stubble Quail";
        // } else if (props.PESTCD) {
        //   species = "Pest";
        // }

        if (species && speciesData[species]) {
          speciesData[species].features.push(feature);
        }
      });

      // Store the processed data globally for use by switchSpeciesLayer
      window.WITD.speciesData = speciesData;
      window.WITD.allZonesGeojson = data;
      if (typeof window.loadZonesLayer === 'function') {
        window.loadZonesLayer();
      }
      
      console.log("Species layers grouped & ready.");
      console.log("Species counts:", Object.keys(speciesData).map(key => 
        `${key}: ${speciesData[key].features.length}`
      ).join(", "));
    })
    .catch(err => console.error("Failed to load zones from API:", err));
}

function closedOverlayOnForSpecies(name) {
  return name === 'Deer' || name === 'Hog Deer' || name === 'Duck';
}

function setClosedOverlayVisibility(map, visible) {
  const vis = visible ? 'visible' : 'none';
  ['closed-areas-fill', 'closed-areas-line'].forEach(id => {
    if (map.getLayer(id)) {
      map.setLayoutProperty(id, 'visibility', vis);
    }
  });
}

window.handleSpeciesClick = function(species) {
  if (currentSpecies === species) {
    // If already active -> turn OFF
    window.switchSpeciesLayer("OFF");
    currentSpecies = "OFF";
    window.currentSpecies = currentSpecies;
    console.log(`Species layer "${species}" OFF.`);
  } else {
    // Switch to new species
    window.switchSpeciesLayer(species);
    currentSpecies = species;
    window.currentSpecies = currentSpecies;
    console.log(`Species layer "${species}" ON.`);
  }
  console.log("Current species state:", currentSpecies);
};

window.switchSpeciesLayer = function(name) {
  const map = window.WITD && window.WITD.map;
  if (!map) {
    console.warn('switchSpeciesLayer: map is not available yet.');
    return;
  }
  const speciesData = window.WITD.speciesData;

  // Defensive check for speciesData
  if (!speciesData || typeof speciesData !== 'object') {
    console.warn('switchSpeciesLayer: window.WITD.speciesData is not initialized.');
    return;
  }

  // Detach species layer listeners before removing layers
  if (map.getLayer('species-fill') && window.WITD._speciesFillClickHandler) {
    map.off('click', 'species-fill', window.WITD._speciesFillClickHandler);
  }
  if (map.getLayer('species-fill') && window.WITD._speciesFillMouseEnterHandler) {
    map.off('mouseenter', 'species-fill', window.WITD._speciesFillMouseEnterHandler);
  }
  if (map.getLayer('species-fill') && window.WITD._speciesFillMouseLeaveHandler) {
    map.off('mouseleave', 'species-fill', window.WITD._speciesFillMouseLeaveHandler);
  }

  // Remove existing species layers first to prevent duplicates
  if (map.getLayer('species-line')) {
    map.removeLayer('species-line');
  }
  if (map.getLayer('species-fill')) {
    map.removeLayer('species-fill');
  }
  if (map.getSource('species-source')) {
    map.removeSource('species-source');
  }

  if (name === "OFF") {
    window.WITD._speciesZonesWaitAttempts = 0;
    setClosedOverlayVisibility(map, false);
    console.log("Species layer turned OFF.");
    window.WITD.currentSpeciesLayer = null;
    currentSpecies = "OFF";
    window.currentSpecies = currentSpecies;
    console.log("Current species state:", currentSpecies);
    return;
  }

  if (!map.getSource('zones-source')) {
    const n = (window.WITD._speciesZonesWaitAttempts = (window.WITD._speciesZonesWaitAttempts || 0) + 1);
    if (n > 60) {
      window.WITD._speciesZonesWaitAttempts = 0;
      console.warn('Zones not loaded yet — skipping species apply');
      return;
    }
    setTimeout(() => window.switchSpeciesLayer(name), 80);
    return;
  }
  window.WITD._speciesZonesWaitAttempts = 0;

  if (speciesData[name]) {
    // Register source, layers, and map events only after safeAddToMap runs so species-fill exists
    // when map.on() is used (avoids race when the style was still loading).
    window.safeAddToMap(map, () => {
      map.addSource('species-source', {
        type: 'geojson',
        data: speciesData[name]
      });

      map.addLayer({
        id: 'species-fill',
        type: 'fill',
        source: 'species-source',
        paint: {
          'fill-color': '#FFEDA0',
          'fill-opacity': 0.3
        }
      });

      map.addLayer({
        id: 'species-line',
        type: 'line',
        source: 'species-source',
        paint: {
          'line-color': '#FF7F00',
          'line-width': 1
        }
      });

      window.WITD._speciesFillClickHandler = (e) => {
        console.log('[species] Species layer click detected, pinMode:', window.WITD?.pinMode, 'processingPinPlacement:', window.WITD?.processingPinPlacement, 'drawing active:', window.WITD?.draw?.isActive?.(), 'target:', e.originalEvent?.target?.tagName);

        if ((window.WITD?.draw?.isActive && window.WITD.draw.isActive()) || window.WITD?.pinMode || window.WITD?.processingPinPlacement) {
          console.log('[species] Skipping popup - user is drawing or placing pin');
          return;
        }

        if (map.getLayer('closed-areas-fill')) {
          const closedUnder = map.queryRenderedFeatures(e.point, { layers: ['closed-areas-fill'] });
          if (closedUnder.length) return;
        }

        if (e.features.length > 0) {
          const feature = e.features[0];
          const props = feature.properties;
          const html = buildSambarZonePopupHtml(props);
          new mapboxgl.Popup({ maxWidth: '400px' })
            .setLngLat(e.lngLat)
            .setHTML(html)
            .addTo(map);
        }
      };

      window.WITD._speciesFillMouseEnterHandler = () => {
        if ((window.WITD?.draw?.isActive && window.WITD.draw.isActive()) || window.WITD?.pinMode || window.WITD?.processingPinPlacement) {
          return;
        }
        map.getCanvas().style.cursor = 'pointer';
      };

      window.WITD._speciesFillMouseLeaveHandler = () => {
        if ((window.WITD?.draw?.isActive && window.WITD.draw.isActive()) || window.WITD?.pinMode || window.WITD?.processingPinPlacement) {
          return;
        }
        map.getCanvas().style.cursor = '';
      };

      map.on('click', 'species-fill', window.WITD._speciesFillClickHandler);
      map.on('mouseenter', 'species-fill', window.WITD._speciesFillMouseEnterHandler);
      map.on('mouseleave', 'species-fill', window.WITD._speciesFillMouseLeaveHandler);

      setClosedOverlayVisibility(map, closedOverlayOnForSpecies(name));
      console.log(`Species layer "${name}" ON.`);
      window.WITD.currentSpeciesLayer = name;
      currentSpecies = name;
      window.currentSpecies = currentSpecies;
      console.log('Current species state:', currentSpecies);
    });
  } else {
    setClosedOverlayVisibility(map, false);
    console.warn(`Species layer "${name}" not found.`);
    window.WITD.currentSpeciesLayer = null;
    currentSpecies = "OFF";
    window.currentSpecies = currentSpecies;
    console.log("Current species state:", currentSpecies);
  }
};
