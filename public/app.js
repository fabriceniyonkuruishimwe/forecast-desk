const form = document.getElementById('search-form');
const cityInput = document.getElementById('city');
const statusEl = document.getElementById('status');
const errorEl = document.getElementById('error');
const resultsEl = document.getElementById('results');
const placeName = document.getElementById('place-name');
const summaryEl = document.getElementById('summary');
const listEl = document.getElementById('list');
const countEl = document.getElementById('count');
const textFilter = document.getElementById('filter-text');
const conditionFilter = document.getElementById('filter-condition');
const dayFilter = document.getElementById('filter-day');
const sortSelect = document.getElementById('sort');
const serverBadge = document.getElementById('server-badge');
const unitButtons = document.querySelectorAll('.unit-toggle button');

const state = { data: null, unit: 'C' };

function toUnit(celsius) {
  return state.unit === 'C' ? celsius : (celsius * 9) / 5 + 32;
}

function formatTemp(celsius) {
  return `${Math.round(toUnit({state.unit}`;celsius))}
}

function localDate(item) {
  return new Date((item.dt + state.data.timezone) * 1000);
}

function dayLabel(item) {
  return localDate(item).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC'
  });
}

function timeLabel(item) {
  return localDate(item).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC'
  });
}

function showError(message) {
  errorEl.textContent = message;
  errorEl.hidden = false;
  resultsEl.hidden = true;
  statusEl.textContent = '';
}

function clearError() {
  errorEl.hidden = true;
  errorEl.textContent = '';
}

function fillSelect(select, options) {
  select.replaceChildren();
  options.forEach(([value, label]) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    select.appendChild(option);
  });
}

function setupFilters() {
  const conditions = [...new Set(state.data.items.map((item) => item.condition))].sort();
  fillSelect(conditionFilter, [['all', 'All conditions'], ...conditions.map((c) => [c, c])]);

  const days = [...new Set(state.data.items.map(dayLabel))];
  fillSelect(dayFilter, [['all', 'All days'], ...days.map((d) => [d, d])]);

  textFilter.value = '';
  sortSelect.value = 'time-asc';
}

function visibleItems() {
  const text = textFilter.value.trim().toLowerCase();
  const condition = conditionFilter.value;
  const day = dayFilter.value;

  const filtered = state.data.items.filter((item) => {
    if (condition !== 'all' && item.condition !== condition) return false;
    if (day !== 'all' && dayLabel(item) !== day) return false;
    if (text && !item.description.toLowerCase().includes(text)) return false;
    return true;
  });

  const sorters = {
    'time-asc': (a, b) => a.dt - b.dt,
    'temp-desc': (a, b) => b.temp - a.temp,
    'temp-asc': (a, b) => a.temp - b.temp,
    'rain-desc': (a, b) => b.rainChance - a.rainChance,
    'wind-desc': (a, b) => b.wind - a.wind
  };

  return filtered.sort(sorters[sortSelect.value]);
}

function renderSummary() {
  const items = state.data.items;
  const temps = items.map((item) => item.temp);
  const wettest = items.reduce((best, item) => (item.rainChance > best.rainChance ? item : best), items[0]);
  const windiest = Math.max(...items.map((item) => item.wind));

  const stats = [
    ['Warmest', formatTemp(Math.max(...temps))],
    ['Coolest', formatTemp(Math.min(...temps))],
    ['Highest rain chance', `${wettest.rainChance}%`],
    ['Strongest wind', `${windiest.toFixed(1)} m/s`]
  ];

  summaryEl.replaceChildren();
  stats.forEach(([label, value]) => {
    const box = document.createElement('div');
    box.className = 'stat';
    const labelEl = document.createElement('div');
    labelEl.className = 'label';
    labelEl.textContent = label;
    const valueEl = document.createElement('div');
    valueEl.className = 'value';
    valueEl.textContent = value;
    box.append(labelEl, valueEl);
    summaryEl.appendChild(box);
  });
}

function buildRow(item) {
  const row = document.createElement('div');
  row.className = 'row';
  if (['Rain', 'Drizzle', 'Thunderstorm', 'Snow'].includes(item.condition)) row.classList.add('wet');
  if (item.condition === 'Clear') row.classList.add('clear');

  const when = document.createElement('div');
  when.className = 'when';
  const day = document.createElement('div');
  day.className = 'day';
  day.textContent = dayLabel(item);
  const time = document.createElement('div');
  time.className = 'time';
  time.textContent = timeLabel(item);
  when.append(day, time);

  const icon = document.createElement('img');
  icon.src = `https://openweathermap.org/img/wn/${encodeURIComponent(item.icon)}@2x.png`;
  icon.alt = item.condition;
  icon.loading = 'lazy';

  const detail = document.createElement('div');
  const desc = document.createElement('div');
  desc.className = 'desc';
  desc.textContent = item.description;
  const meta = document.createElement('div');
  meta.className = 'meta';
  meta.textContent = `Feels like ${formatTemp(item.feelsLike)} | Rain ${item.rainChance}% | Wind ${item.wind.toFixed(1)} m/s | Humidity ${item.humidity}%`;
  detail.append(desc, meta);

  const temp = document.createElement('div');
  temp.className = 'temp';
  temp.textContent = formatTemp(item.temp);

  row.append(when, icon, detail, temp);
  return row;
}

function renderList() {
  const items = visibleItems();
  listEl.replaceChildren();
  countEl.textContent = `Showing ${items.length} of ${state.data.items.length} forecast periods`;

  if (items.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = 'No periods match these filters. Clear the search box or choose All conditions.';
    listEl.appendChild(empty);
    return;
  }

  items.forEach((item) => listEl.appendChild(buildRow(item)));
}

function renderAll() {
  placeName.textContent = `${state.data.city}, ${state.data.country}`;
  renderSummary();
  renderList();
}

async function loadForecast(city) {
  clearError();
  statusEl.textContent = 'Loading forecast...';
  resultsEl.hidden = true;

  try {
    const response = await fetch(`/api/forecast?city=${encodeURIComponent(city)}`);
    const servedBy = response.headers.get('X-Served-By');
    if (servedBy) serverBadge.textContent = `Server: ${servedBy}`;

    const body = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(body && body.error ? body.error : `Request failed with status ${response.status}.`);
    }
    if (!body || !Array.isArray(body.items) || body.items.length === 0) {
      throw new Error('The forecast came back empty. Try another city.');
    }

    state.data = body;
    setupFilters();
    renderAll();
    resultsEl.hidden = false;
    statusEl.textContent = '';
  } catch (err) {
    if (err instanceof TypeError) {
      showError('Cannot reach the server. Check your connection and try again.');
    } else {
      showError(err.message);
    }
  }
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const city = cityInput.value.trim();
  if (city.length < 2) {
    showError('Enter a city name with at least 2 letters.');
    return;
  }
  loadForecast(city);
});

[textFilter, conditionFilter, dayFilter, sortSelect].forEach((control) => {
  control.addEventListener('input', () => {
    if (state.data) renderList();
  });
});

unitButtons.forEach((button) => {
  button.addEventListener('click', () => {
    state.unit = button.dataset.unit;
    unitButtons.forEach((b) => b.classList.toggle('active', b === button));
    if (state.data) renderAll();
  });
});
