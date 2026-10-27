/* AtmoView — interactive AQI tracker */

const $ = (id) => document.getElementById(id);

const searchBtn = $('searchBtn');
const cityInput = $('cityInput');
const mapElement = $('map');
const activityLog = $('activityLog');
const infoPanel = $('infoPanel');
const activityPanel = $('activityPanel');
const mainAqi = $('mainAqi');
const mainLabel = $('mainLabel');
const cityDisplay = $('cityDisplay');
const lastUpdate = $('lastUpdate');
const pm25Value = $('pm25Value');
const pm10Value = $('pm10Value');
const windInfo = $('windInfo');
const humidInfo = $('humidInfo');
const healthAdvice = $('healthAdvice');
const pollutantBars = $('pollutantBars');
const mapLocation = $('mapLocation');
const coordinates = $('coordinates');
const welcomeCard = $('welcomeCard');
const tempValue = $('tempValue');
const uvValue = $('uvValue');
const sunriseTime = $('sunriseTime');
const sunsetTime = $('sunsetTime');
const btnRefresh = $('btnRefresh');
const btnFavorite = $('btnFavorite');
const btnExport = $('btnExport');
const btnTheme = $('btnTheme');

let leafletMap;
let leafletMarker;
let currentLocation = { lat: 17.3850, lon: 78.4867, name: 'Hyderabad, IN' };

const aqiCategoryLabel = (aqi) => {
  if (aqi <= 50) return { label: 'GOOD', color: '#6cc04a' };
  if (aqi <= 100) return { label: 'MODERATE', color: '#f6c453' };
  if (aqi <= 150) return { label: 'UNHEALTHY SENSITIVE', color: '#f89d51' };
  if (aqi <= 200) return { label: 'UNHEALTHY', color: '#ff6b6b' };
  if (aqi <= 300) return { label: 'VERY UNHEALTHY', color: '#e84b6a' };
  return { label: 'HAZARDOUS', color: '#c43d55' };
};

const pm25Breakpoints = [
  { cLow: 0.0, cHigh: 12.0, iLow: 0, iHigh: 50 },
  { cLow: 12.1, cHigh: 35.4, iLow: 51, iHigh: 100 },
  { cLow: 35.5, cHigh: 55.4, iLow: 101, iHigh: 150 },
  { cLow: 55.5, cHigh: 150.4, iLow: 151, iHigh: 200 },
  { cLow: 150.5, cHigh: 250.4, iLow: 201, iHigh: 300 },
  { cLow: 250.5, cHigh: 350.4, iLow: 301, iHigh: 400 },
  { cLow: 350.5, cHigh: 500.4, iLow: 401, iHigh: 500 }
];

function pm25ToAqi(pm25) {
  for (const bp of pm25Breakpoints) {
    if (pm25 >= bp.cLow && pm25 <= bp.cHigh) {
      return Math.round(((bp.iHigh - bp.iLow) / (bp.cHigh - bp.cLow)) *
        (pm25 - bp.cLow) + bp.iLow);
    }
  }
  return 500;
}

function cardinalFromDegrees(deg) {
  if (deg == null) return '';
  const cards = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
  return cards[Math.round(deg / 22.5) % 16];
}

async function getCityCoordinates(city) {
  const geoRes = await fetch(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en&format=json`
  );
  if (!geoRes.ok) throw new Error('CITY NOT FOUND');

  const geo = await geoRes.json();
  if (!geo.results?.length) throw new Error('CITY NOT FOUND');

  const place = geo.results[0];

  const weatherRes = await fetch(
    `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m,uv_index&daily=sunrise,sunset&timezone=auto`
  );
  if (!weatherRes.ok) throw new Error('WEATHER DATA UNAVAILABLE');

  const weather = await weatherRes.json();

  return {
    lat: place.latitude,
    lon: place.longitude,
    name: `${place.name}${place.country_code ? ', ' + place.country_code : ''}`,
    temp: weather.current?.temperature_2m,
    uv_index: weather.current?.uv_index,
    wind: {
      speed: Number(weather.current?.wind_speed_10m || 0) / 3.6,
      deg: weather.current?.wind_direction_10m
    },
    main: {
      humidity: weather.current?.relative_humidity_2m
    },
    daily: {
      sunrise: weather.daily?.sunrise?.[0],
      sunset: weather.daily?.sunset?.[0]
    }
  };
}

async function getAirPollution(lat, lon) {
  const res = await fetch(
    `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&current=pm2_5,pm10,nitrogen_dioxide,ozone,sulphur_dioxide,carbon_monoxide&timezone=auto`
  );
  if (!res.ok) throw new Error('AIR QUALITY DATA UNAVAILABLE');

  const data = await res.json();
  const c = data.current || {};

  return {
    components: {
      pm2_5: Number(c.pm2_5 || 0),
      pm10: Number(c.pm10 || 0),
      no2: Number(c.nitrogen_dioxide || 0),
      o3: Number(c.ozone || 0),
      so2: Number(c.sulphur_dioxide || 0),
      co: Number(c.carbon_monoxide || 0)
    }
  };
}

function initMap(lat = 20, lon = 0) {
  if (!leafletMap) {
    leafletMap = L.map('map', {
      zoomControl: false,
      attributionControl: true,
      worldCopyJump: true,
      minZoom: 2,
      maxZoom: 18
    }).setView([lat, lon], 3);

    // OpenTopoMap: professional, classic topographic style
    // Free & open-source, no API key required, perfectly suits technical theme
    L.tileLayer(
      'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
      {
        maxZoom: 17,
        attribution: '&copy; <a href="https://opentopomap.org">OpenTopoMap</a> | &copy; <a href="https://www.openstreetmap.org">OpenStreetMap</a>'
      }
    ).addTo(leafletMap);

    leafletMap.on('mousemove', (e) => {
      coordinates.textContent =
        `LAT ${e.latlng.lat.toFixed(3)} / LON ${e.latlng.lng.toFixed(3)}`;
    });
  }

  leafletMap.setView([lat, lon], leafletMap.getZoom() < 4 ? 10 : leafletMap.getZoom());

  if (leafletMarker) leafletMarker.remove();

  leafletMarker = L.circleMarker([lat, lon], {
    radius: 11,
    color: '#2fc9ff',
    weight: 2,
    fillColor: '#2fc9ff',
    fillOpacity: 0.28,
    className: 'aqi-marker'
  }).addTo(leafletMap);

  leafletMarker.bindTooltip('TRACKED LOCATION', {
    permanent: false,
    direction: 'top',
    className: 'atmo-tooltip'
  });
}

function centerOnLocation() {
  if (!leafletMap) return;
  leafletMap.setView([currentLocation.lat, currentLocation.lon], 11, { animate: true });
}

function globalView() {
  if (!leafletMap) return;
  leafletMap.setView([20, 0], 2, { animate: true });
  mapLocation.textContent = 'GLOBAL VIEW';
}

function updatePollutantBars(components) {
  const pollutants = [
    ['pm2_5', 'PM2.5'],
    ['pm10', 'PM10'],
    ['no2', 'NO₂'],
    ['o3', 'O₃'],
    ['so2', 'SO₂'],
    ['co', 'CO']
  ];

  const values = pollutants.map(([key]) => Number(components[key] || 0));
  const maxVal = Math.max(...values, 1);

  pollutantBars.innerHTML = pollutants.map(([key, label]) => {
    const value = Number(components[key] || 0);
    const width = Math.min(100, (value / maxVal) * 100);
    return `
      <div class="pollutant-row">
        <span class="pollutant-name">${label}</span>
        <div class="pollutant-track">
          <div class="pollutant-fill" style="width:${width}%"></div>
        </div>
        <strong>${value.toFixed(1)}</strong>
      </div>`;
  }).join('');
}

function addActivityEntry(city, aqi) {
  const empty = activityLog.querySelector('.empty-log');
  if (empty) empty.remove();

  const item = document.createElement('div');
  item.className = 'activity-item';
  item.innerHTML = `
    <div>
      <span class="activity-time">${new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>
      <div class="activity-city">${city}</div>
    </div>
    <strong>${aqi}</strong>
  `;
  activityLog.prepend(item);

  while (activityLog.children.length > 8) {
    activityLog.lastElementChild.remove();
  }
}

function setAqiTheme(category) {
  document.documentElement.style.setProperty('--aqi-color', category.color);
}

function updateUI(location, weatherInfo, pollution) {
  const components = pollution.components || {};
  const pm25 = Number(components.pm2_5 || 0);
  const pm10 = Number(components.pm10 || 0);
  const computedAqi = pm25ToAqi(pm25);
  const category = aqiCategoryLabel(computedAqi);

  cityDisplay.textContent = location.name;
  mapLocation.textContent = location.name.toUpperCase();
  lastUpdate.textContent = `LAST UPDATED // ${new Date().toLocaleTimeString()}`;

  mainAqi.textContent = computedAqi;
  mainLabel.textContent = category.label;
  mainLabel.style.color = category.color;
  setAqiTheme(category);

  pm25Value.textContent = `${pm25.toFixed(1)} µg/m³`;
  pm10Value.textContent = `${pm10.toFixed(1)} µg/m³`;

  if (weatherInfo?.temp) {
    tempValue.textContent = `${Math.round(weatherInfo.temp)}°C`;
  }

  if (weatherInfo?.uv_index) {
    uvValue.textContent = Math.round(weatherInfo.uv_index * 10) / 10;
  }

  if (weatherInfo?.wind) {
    const speedKmh = (weatherInfo.wind.speed || 0) * 3.6;
    windInfo.textContent = `${Math.round(speedKmh)} km/h ${cardinalFromDegrees(weatherInfo.wind.deg)}`.trim();
  }

  if (weatherInfo?.main) humidInfo.textContent = `${weatherInfo.main.humidity ?? '—'}%`;

  if (weatherInfo?.daily) {
    if (weatherInfo.daily.sunrise) {
      const sr = new Date(weatherInfo.daily.sunrise);
      sunriseTime.textContent = sr.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    if (weatherInfo.daily.sunset) {
      const ss = new Date(weatherInfo.daily.sunset);
      sunsetTime.textContent = ss.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
  }

  if (computedAqi <= 50) {
    healthAdvice.textContent = 'Air quality is good. Normal outdoor activity is generally suitable.';
  } else if (computedAqi <= 100) {
    healthAdvice.textContent = 'Air quality is moderate. Sensitive people should monitor symptoms.';
  } else if (computedAqi <= 150) {
    healthAdvice.textContent = 'Sensitive groups should limit prolonged outdoor exertion.';
  } else if (computedAqi <= 200) {
    healthAdvice.textContent = 'Unhealthy conditions. Consider reducing prolonged outdoor exposure.';
  } else {
    healthAdvice.textContent = 'Very unhealthy air. Minimize outdoor exposure and follow local health guidance.';
  }

  updatePollutantBars(components);
  addActivityEntry(location.name, computedAqi);

  currentLocation = location;
  
  // Update favorite button status
  const favorites = JSON.parse(localStorage.getItem('atmoview-favorites') || '[]');
  if (favorites.some(fav => fav.name === location.name)) {
    btnFavorite.classList.add('active');
  } else {
    btnFavorite.classList.remove('active');
  }
  
  initMap(location.lat, location.lon);

  welcomeCard.classList.add('hidden');
  infoPanel.classList.add('active');
  $('btnInfo').classList.add('active');
}

async function onSearch() {
  const city = cityInput.value.trim();
  if (!city) return;

  searchBtn.disabled = true;
  searchBtn.textContent = 'LOADING…';

  try {
    const location = await getCityCoordinates(city);
    const pollution = await getAirPollution(location.lat, location.lon);
    if (!pollution) throw new Error('NO AIR QUALITY DATA FOR THIS LOCATION');
    updateUI(location, location, pollution);
    cityInput.value = '';
  } catch (err) {
    alert(err.message || 'Could not fetch AQI data.');
  } finally {
    searchBtn.disabled = false;
    searchBtn.textContent = 'TRACK';
  }
}

function togglePanel(panel, button) {
  panel.classList.toggle('active');
  button.classList.toggle('active');
}

searchBtn.addEventListener('click', onSearch);
cityInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') onSearch();
});

$('btnActivity').addEventListener('click', () => togglePanel(activityPanel, $('btnActivity')));
$('btnInfo').addEventListener('click', () => togglePanel(infoPanel, $('btnInfo')));
$('btnGlobal').addEventListener('click', globalView);
$('btnCenter').addEventListener('click', centerOnLocation);
$('brandButton').addEventListener('click', globalView);

$('btnZoomIn').addEventListener('click', () => leafletMap?.zoomIn());
$('btnZoomOut').addEventListener('click', () => leafletMap?.zoomOut());

document.querySelectorAll('.btn-close').forEach((btn) => {
  btn.addEventListener('click', () => {
    const panel = btn.closest('.side-panel');
    const target = panel === activityPanel ? $('btnActivity') : $('btnInfo');
    panel.classList.remove('active');
    target.classList.remove('active');
  });
});

// Refresh button - re-fetch current location data
btnRefresh.addEventListener('click', async () => {
  if (currentLocation.name === 'Hyderabad, IN') return;
  btnRefresh.disabled = true;
  try {
    const pollution = await getAirPollution(currentLocation.lat, currentLocation.lon);
    updateUI(currentLocation, currentLocation, pollution);
  } catch (err) {
    console.error('Refresh failed:', err);
  } finally {
    btnRefresh.disabled = false;
  }
});

// Favorite button - toggle favorite status
btnFavorite.addEventListener('click', () => {
  if (!currentLocation) return;
  const favorites = JSON.parse(localStorage.getItem('atmoview-favorites') || '[]');
  const isFavorited = favorites.some(fav => fav.name === currentLocation.name);
  
  if (isFavorited) {
    favorites.splice(favorites.findIndex(fav => fav.name === currentLocation.name), 1);
    btnFavorite.classList.remove('active');
  } else {
    favorites.push({ name: currentLocation.name, lat: currentLocation.lat, lon: currentLocation.lon });
    btnFavorite.classList.add('active');
  }
  
  localStorage.setItem('atmoview-favorites', JSON.stringify(favorites));
});

// Export button - export current data as JSON
btnExport.addEventListener('click', () => {
  const data = {
    timestamp: new Date().toISOString(),
    location: currentLocation.name,
    coordinates: { lat: currentLocation.lat, lon: currentLocation.lon },
    aqi: mainAqi.textContent,
    aqiLabel: mainLabel.textContent,
    temperature: tempValue.textContent,
    humidity: humidInfo.textContent,
    wind: windInfo.textContent,
    pm25: pm25Value.textContent,
    pm10: pm10Value.textContent,
    uvIndex: uvValue.textContent
  };
  
  const dataStr = JSON.stringify(data, null, 2);
  const dataBlob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(dataBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `atmoview-${currentLocation.name.replace(/, /g, '-')}-${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
});

// Theme toggle - switch between dark and light mode
btnTheme.addEventListener('click', () => {
  const html = document.documentElement;
  const isDark = html.getAttribute('data-theme') !== 'light';
  html.setAttribute('data-theme', isDark ? 'light' : 'dark');
  localStorage.setItem('atmoview-theme', isDark ? 'light' : 'dark');
});

$('btnHelp').addEventListener('click', () => {
  alert(
`ATMOVIEW // QUICK GUIDE

TRACK
Search any city to load live weather and air-quality data.

GLOBAL MAP
Return to a world view.

CENTER
Jump back to the tracked location.

ACTIVITY
See your recent city searches.

LIVE AQI
Open the current AQI panel.

REFRESH
Update data for current location.

FAVORITE
Bookmark locations for quick access.

EXPORT
Download current data as JSON.

THEME
Toggle between dark and light modes.

AQI SCALE
0–50 GOOD
51–100 MODERATE
101–150 UNHEALTHY SENSITIVE
151–200 UNHEALTHY
201–300 VERY UNHEALTHY
301+ HAZARDOUS`
  );
});

document.addEventListener('DOMContentLoaded', async () => {
  // Restore theme preference
  const savedTheme = localStorage.getItem('atmoview-theme') || 'dark';
  document.documentElement.setAttribute('data-theme', savedTheme);

  // Check if location is favorited
  const favorites = JSON.parse(localStorage.getItem('atmoview-favorites') || '[]');
  if (favorites.some(fav => fav.name === currentLocation.name)) {
    btnFavorite.classList.add('active');
  }

  initMap(currentLocation.lat, currentLocation.lon);

  try {
    const pollution = await getAirPollution(currentLocation.lat, currentLocation.lon);
    if (pollution) {
      const location = await getCityCoordinates('Hyderabad');
      updateUI(location, location, pollution);
      activityPanel.classList.add('active');
      $('btnActivity').classList.add('active');
    }
  } catch (err) {
    console.error('Initial AQI load failed:', err);
    // Map still remains usable even when the API is unavailable.
  }
});