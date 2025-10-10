console.log("Module loaded: weatherModule");

document.addEventListener("DOMContentLoaded", () => {
  const map = window.WITD.map;

  const weatherSearch = document.getElementById("weatherSearch");
  const weatherOutput = document.getElementById("weatherOutput");
  const useMyLocationBtn = document.getElementById("useMyLocationBtn");

  let weatherMarker = null;
  let hasAutoFetchedThisSession = false;

  // Create custom weather marker element
  const weatherIcon = createWeatherMarker();

  // Search input event listener for Enter key
  weatherSearch.addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
      const query = weatherSearch.value.trim();
      if (query) {
        // Clear previous location confirmation
        const locationConfirmation = document.getElementById('weatherLocationConfirmation');
        if (locationConfirmation) {
          locationConfirmation.classList.remove('show');
        }
        fetchWeatherForLocation(query);
      }
    }
  });

  // Function to fetch weather for a location by name
  function fetchWeatherForLocation(locationName) {
    console.log(`Searching weather for: ${locationName}`);
    const weatherOutputEl = document.getElementById("weatherOutput");
    if (weatherOutputEl) weatherOutputEl.innerHTML = "Searching for location...";

    // Geocode the location name
    fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(locationName)}`)
      .then(res => res.json())
      .then(results => {
        if (!results.length) {
          const weatherOutputEl = document.getElementById("weatherOutput");
          if (weatherOutputEl) weatherOutputEl.innerHTML = "No location found.";
          return;
        }

        const lat = parseFloat(results[0].lat);
        const lon = parseFloat(results[0].lon);

        fetchWeatherForCoordinates(lat, lon, locationName);
      })
      .catch(error => {
        console.error('Geocoding error:', error);
        const weatherOutputEl = document.getElementById("weatherOutput");
        if (weatherOutputEl) weatherOutputEl.innerHTML = "Error finding location.";
      });
  }

  // Auto-fetch weather for current location when popup opens
  function autoFetchCurrentLocation() {
    if (hasAutoFetchedThisSession) return; // Only once per session
    
    if (navigator.geolocation) {
      const weatherOutputEl = document.getElementById("weatherOutput");
      if (weatherOutputEl) weatherOutputEl.innerHTML = "Getting your location...";
      
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const lat = position.coords.latitude;
          const lon = position.coords.longitude;
          
          // Reverse geocode to get location name
          fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`)
            .then(res => res.json())
            .then(data => {
              // Extract suburb and state from address components
              const address = data.address;
              let locationName = '';
              
              if (address) {
                // Try to get suburb/town name first
                const suburb = address.suburb || address.town || address.city || address.village;
                const state = address.state;
                
                if (suburb && state) {
                  locationName = `${suburb} ${state}`;
                } else if (suburb) {
                  locationName = suburb;
                } else if (state) {
                  locationName = state;
                } else {
                  // Fallback to first part of display_name without street numbers
                  const parts = data.display_name.split(',');
                  const cleanParts = parts.filter(part => 
                    !part.trim().match(/^\d+/) && // Remove parts starting with numbers
                    part.trim().length > 0
                  );
                  locationName = cleanParts[0] || `${lat.toFixed(2)}, ${lon.toFixed(2)}`;
                }
              } else {
                locationName = `${lat.toFixed(2)}, ${lon.toFixed(2)}`;
              }
              
              weatherSearch.value = locationName;
              fetchWeatherForCoordinates(lat, lon, locationName);
              hasAutoFetchedThisSession = true;
            })
            .catch(() => {
              // If reverse geocoding fails, still show weather
              weatherSearch.value = `${lat.toFixed(2)}, ${lon.toFixed(2)}`;
              fetchWeatherForCoordinates(lat, lon, `${lat.toFixed(2)}, ${lon.toFixed(2)}`);
              hasAutoFetchedThisSession = true;
            });
        },
        (error) => {
          console.log("Geolocation failed:", error);
          const weatherOutputEl = document.getElementById("weatherOutput");
          if (weatherOutputEl) weatherOutputEl.innerHTML = "Location access denied. Please search manually.";
        }
      );
    }
  }

  // Manual trigger for current location
  useMyLocationBtn.addEventListener("click", () => {
    // Clear previous location confirmation
    const locationConfirmation = document.getElementById('weatherLocationConfirmation');
    if (locationConfirmation) {
      locationConfirmation.classList.remove('show');
    }
    
    if (navigator.geolocation) {
      const weatherOutputEl = document.getElementById("weatherOutput");
      if (weatherOutputEl) weatherOutputEl.innerHTML = "Getting your location...";
      
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const lat = position.coords.latitude;
          const lon = position.coords.longitude;
          
          // Reverse geocode to get location name
          fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`)
            .then(res => res.json())
            .then(data => {
              // Extract suburb and state from address components
              const address = data.address;
              let locationName = '';
              
              if (address) {
                // Try to get suburb/town name first
                const suburb = address.suburb || address.town || address.city || address.village;
                const state = address.state;
                
                if (suburb && state) {
                  locationName = `${suburb} ${state}`;
                } else if (suburb) {
                  locationName = suburb;
                } else if (state) {
                  locationName = state;
                } else {
                  // Fallback to first part of display_name without street numbers
                  const parts = data.display_name.split(',');
                  const cleanParts = parts.filter(part => 
                    !part.trim().match(/^\d+/) && // Remove parts starting with numbers
                    part.trim().length > 0
                  );
                  locationName = cleanParts[0] || `${lat.toFixed(2)}, ${lon.toFixed(2)}`;
                }
              } else {
                locationName = `${lat.toFixed(2)}, ${lon.toFixed(2)}`;
              }
              
              weatherSearch.value = locationName;
              fetchWeatherForCoordinates(lat, lon, locationName);
            })
            .catch(() => {
              weatherSearch.value = `${lat.toFixed(2)}, ${lon.toFixed(2)}`;
              fetchWeatherForCoordinates(lat, lon, `${lat.toFixed(2)}, ${lon.toFixed(2)}`);
            });
        },
        (error) => {
          console.log("Geolocation failed:", error);
          const weatherOutputEl = document.getElementById("weatherOutput");
          if (weatherOutputEl) weatherOutputEl.innerHTML = "Location access denied. Please search manually.";
        }
      );
    }
  });

  // Extract weather fetching logic into reusable function
  function fetchWeatherForCoordinates(lat, lon, locationName) {
    // Show location confirmation
    const locationConfirmation = document.getElementById('weatherLocationConfirmation');
    if (locationConfirmation) {
      locationConfirmation.textContent = `🌤️ Weather for ${locationName}`;
      locationConfirmation.classList.add('show');
    }

    const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true&daily=sunrise,sunset,temperature_2m_max,temperature_2m_min,precipitation_sum,windspeed_10m_max&hourly=precipitation_probability,temperature_2m,weathercode&timezone=auto`;

    fetch(weatherUrl)
      .then(res => res.json())
      .then(data => {
        console.log(data);

        const today = data.current_weather;
        const daily = data.daily;
        const hourly = data.hourly;

        // --- Wind direction to compass + arrow
        const dir = degreesToCompass(today.winddirection);
        const arrow = compassArrow(dir);

        // --- Today chance of rain (max of first 24 hourly values)
        const todayProbs = data.hourly.precipitation_probability.slice(0, 24);
        const todayChance = Math.max(...todayProbs);

        // --- OpenWeather icon mapping
        const weatherIcons = {
          0: '01d', // Clear
          1: '02d', // Partly cloudy
          2: '03d', // Cloudy
          3: '09d', // Rain
          45: '50d', // Fog
          95: '11d'  // Thunderstorm
        };
        const iconCode = weatherIcons[today.weathercode] || '01d';
        const iconUrl = `https://openweathermap.org/img/wn/${iconCode}@2x.png`;

        // --- Top Summary Section (Current Day)
        let html = `
        <div class="weather-current-container">
          <div class="weather-summary">
            <div class="summary-main">
              <div class="summary-left">
                <div class="feels-like">Feels like: ${Math.round(today.temperature - 2)}°C</div>
                <div class="condition">${getWeatherCondition(today.weathercode)}</div>
              </div>
              <div class="summary-right">
                <div class="current-temp">${Math.round(today.temperature)}°C</div>
              </div>
            </div>
            <div class="summary-details">
              <div class="detail-item">
                <span class="detail-icon">💨</span>
                <span>From ${dir} at ${today.windspeed} km/h</span>
              </div>
              <div class="detail-item">
                <span class="detail-icon">💧</span>
                <span>${todayChance}%</span>
              </div>
              <div class="detail-item">
                <span class="detail-icon">🌅</span>
                <span>${daily.sunrise[0].split('T')[1]}</span>
              </div>
              <div class="detail-item">
                <span class="detail-icon">🌇</span>
                <span>${daily.sunset[0].split('T')[1]}</span>
              </div>
            </div>
          </div>
        </div>`;

        // --- Hourly Forecast Row (next 12 hours)
        html += `<div class="weather-hourly-container">
          <h4>Hourly Forecast</h4>
          <div class="hourly-forecast">`;
        
        const currentHour = new Date().getHours();
        for (let i = 0; i < 12; i++) {
          const hourIndex = currentHour + i;
          if (hourIndex < hourly.time.length) {
            const hour = new Date(hourly.time[hourIndex]);
            const hourTemp = hourly.temperature_2m[hourIndex];
            const hourProb = hourly.precipitation_probability[hourIndex];
            const hourCode = hourly.weathercode[hourIndex];
            const hourIconCode = weatherIcons[hourCode] || '01d';
            const hourIconUrl = `https://openweathermap.org/img/wn/${hourIconCode}.png`;
            
            html += `
            <div class="hourly-card">
              <div class="hour-time">${hour.getHours()}:00</div>
              <img src="${hourIconUrl}" alt="Weather" class="hour-icon">
              <div class="hour-temp">${Math.round(hourTemp)}°</div>
              <div class="hour-rain">${hourProb}%</div>
            </div>`;
          }
        }
        
        html += `</div></div>`;

        // --- 7-Day Forecast Grid
        html += `<div class="weather-daily-container">
          <h4>7-Day Forecast</h4>
          <div class="daily-forecast">`;
        
        for (let i = 0; i < daily.time.length; i++) {
          const dayName = getDayName(daily.time[i]);
          const ausDate = formatAusDate(daily.time[i]);
          const sunrise = daily.sunrise[i].split('T')[1];
          const sunset = daily.sunset[i].split('T')[1];
          const windspeed = daily.windspeed_10m_max[i];
          
          // --- Daily chance of rain (max of next 24 hourly values)
          const startHour = i * 24;
          const endHour = startHour + 24;
          const dayProbs = data.hourly.precipitation_probability.slice(startHour, endHour);
          const chanceOfRain = Math.max(...dayProbs);
          
          // Use a default weather code for daily forecast (you might want to get this from hourly data)
          const dayIconCode = weatherIcons[1] || '01d'; // Default to partly cloudy
          const dayIconUrl = `https://openweathermap.org/img/wn/${dayIconCode}.png`;

          html += `
          <div class="daily-card">
            <div class="daily-header">
              <div class="daily-date">${dayName} ${ausDate}</div>
              <img src="${dayIconUrl}" alt="Weather" class="daily-icon">
            </div>
            <div class="daily-temps">
              <span class="daily-max">${Math.round(daily.temperature_2m_max[i])}°</span>
              <span class="daily-min">${Math.round(daily.temperature_2m_min[i])}°</span>
            </div>
            <div class="daily-details">
              <div class="daily-rain">💧 ${chanceOfRain}%</div>
              <div class="daily-wind">💨 ${windspeed} km/h</div>
            </div>
            <div class="daily-sun">
              <div>🌅 ${sunrise}</div>
              <div>🌇 ${sunset}</div>
            </div>
          </div>`;
        }

        html += `</div></div>`;

        // Set the innerHTML of #weatherOutput
        const weatherOutputEl = document.getElementById("weatherOutput");
        if (weatherOutputEl) weatherOutputEl.innerHTML = html;

        addWeatherMarker(lat, lon, locationName);

        // Center map on weather location (Mapbox uses [lng, lat])
        map.flyTo({ center: [lon, lat], zoom: 10 });
      })
      .catch(error => {
        console.error('Weather fetch error:', error);
        const weatherOutputEl = document.querySelector('#weatherOutput');
        if (weatherOutputEl) weatherOutputEl.innerHTML = "Error fetching weather data.";
      });
  }

  function addWeatherMarker(lat, lon, query) {
    if (weatherMarker) {
      weatherMarker.remove();
    }
    
    // Create Mapbox marker (note: Mapbox uses [lng, lat] order)
    weatherMarker = new mapboxgl.Marker({
      element: weatherIcon.cloneNode(true)
    })
    .setLngLat([lon, lat])
    .addTo(map);

    // Create popup
    const popup = new mapboxgl.Popup({ offset: 20 })
      .setHTML(`Weather for ${query}`)
      .setLngLat([lon, lat]);
    
    weatherMarker.setPopup(popup);
    popup.addTo(map);

    // Add click handler to remove marker
    weatherMarker.getElement().addEventListener('click', () => {
      if (confirm('Remove this weather marker?')) {
        weatherMarker.remove();
        weatherMarker = null;
      }
    });
  }

  // --- Helpers ---
  function degreesToCompass(deg) {
    const dirs = ['N','NNE','NE','ENE','E','ESE','SE','SSE',
                  'S','SSW','SW','WSW','W','WNW','NW','NNW'];
    const ix = Math.round(deg / 22.5) % 16;
    return dirs[ix];
  }

  function compassArrow(dir) {
    const map = {
      N: '↑', NNE: '↗', NE: '↗', ENE: '↗',
      E: '→', ESE: '↘', SE: '↘', SSE: '↘',
      S: '↓', SSW: '↙', SW: '↙', WSW: '↙',
      W: '←', WNW: '↖', NW: '↖', NNW: '↖'
    };
    return map[dir] || '';
  }

  function getDayName(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-AU', { weekday: 'short' });
  }

  function formatAusDate(dateString) {
    const [year, month, day] = dateString.split('-');
    return `${day}-${month}-${year}`;
  }

  // Helper function to get weather condition text
  function getWeatherCondition(code) {
    const conditions = {
      0: 'Clear',
      1: 'Partly Cloudy',
      2: 'Cloudy',
      3: 'Rain',
      45: 'Foggy',
      95: 'Thunderstorm'
    };
    return conditions[code] || 'Clear';
  }

  // Helper function to create weather marker
  function createWeatherMarker() {
    const marker = document.createElement('div');
    marker.className = 'weather-marker';
    marker.style.width = '40px';
    marker.style.height = '40px';
    marker.style.backgroundImage = 'url(Images/Pins/WeatherPin.svg)';
    marker.style.backgroundSize = 'contain';
    marker.style.backgroundRepeat = 'no-repeat';
    marker.style.cursor = 'pointer';
    return marker;
  }

  // Expose auto-fetch function for popup trigger
  window.autoFetchWeatherLocation = autoFetchCurrentLocation;
});