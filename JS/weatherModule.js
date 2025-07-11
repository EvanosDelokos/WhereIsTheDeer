console.log("Module loaded: weatherModule");

document.addEventListener("DOMContentLoaded", () => {
  const map = window.WITD.map;

  const weatherSearch = document.getElementById("weatherSearch");
  const weatherOutput = document.getElementById("weatherOutput");

  let weatherMarker = null;

  const weatherIcon = L.icon({
    iconUrl: 'Images/WeatherPin.svg',
    iconSize: [40, 40],
    iconAnchor: [20, 40]
  });

  weatherSearch.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      const query = weatherSearch.value.trim();
      if (!query) return;

      console.log(`Searching weather for: ${query}`);

      // Geocode
      fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}`)
        .then(res => res.json())
        .then(results => {
          if (!results.length) {
            weatherOutput.innerHTML = "No location found.";
            return;
          }

          const lat = parseFloat(results[0].lat);
          const lon = parseFloat(results[0].lon);

          // Weather API - includes chance of rain (hourly)
          const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true&daily=sunrise,sunset,temperature_2m_max,temperature_2m_min,precipitation_sum,windspeed_10m_max&hourly=precipitation_probability&timezone=auto`;

          fetch(weatherUrl)
            .then(res => res.json())
            .then(data => {
              console.log(data);

              const today = data.current_weather;
              const daily = data.daily;

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

              let html = `<div class="today">
                <img src="${iconUrl}" alt="Weather icon"><br>
                <b>Today</b><br>
                Temp: ${today.temperature}°C<br>
                Wind: ${today.windspeed} km/h (${dir} ${arrow})<br>
                Chance of rain: ${todayChance}%<br>
                Sunrise: ${daily.sunrise[0].split('T')[1]}<br>
                Sunset: ${daily.sunset[0].split('T')[1]}<br>
              </div>`;

              html += `<div class="forecast">`;
              for (let i = 1; i < daily.time.length; i++) {
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

                html += `<div class="forecast-day">
                  <b>${dayName} ${ausDate}</b><br>
                  Max: ${daily.temperature_2m_max[i]}°C<br>
                  Min: ${daily.temperature_2m_min[i]}°C<br>
                  Rain: ${daily.precipitation_sum[i]} mm<br>
                  Chance of rain: ${chanceOfRain}%<br>
                  Wind: ${windspeed} km/h max<br>
                  Sunrise: ${sunrise}<br>
                  Sunset: ${sunset}
                </div>`;
              }

              html += `</div>`;

              weatherOutput.innerHTML = html;

              addWeatherMarker(lat, lon, query);

              map.setView([lat, lon], 10);
            });
        });
    }
  });

  function addWeatherMarker(lat, lon, query) {
    if (weatherMarker) {
      map.removeLayer(weatherMarker);
    }
    weatherMarker = L.marker([lat, lon], { icon: weatherIcon }).addTo(map)
      .bindPopup(`Weather for ${query}`, { offset: [0, -20] })
      .openPopup();

    weatherMarker.on('click', () => {
      if (confirm('Remove this weather marker?')) {
        map.removeLayer(weatherMarker);
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
});
