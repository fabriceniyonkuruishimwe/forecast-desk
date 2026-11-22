require('dotenv').config();
const express = require('express');
const os = require('os');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.OPENWEATHER_API_KEY;
const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_MAX_ENTRIES = 200;
const CITY_PATTERN = /^[\p{L}\s.,'-]{2,60}$/u;
const cache = new Map();

app.disable('x-powered-by');

app.use((req, res, next) => {
  res.setHeader('X-Served-By', os.hostname());
  res.setHeader('X-Content-Type-Options', 'nosniff');
  next();
});

app.use(express.static(path.join(__dirname, 'public')));

app.get('/health', (req, res) => {
  res.json({ status: 'ok', host: os.hostname() });
});

function readCache(key) {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.time > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return hit.value;
}

function writeCache(key, value) {
  if (cache.size >= CACHE_MAX_ENTRIES) {
    cache.delete(cache.keys().next().value);
  }
  cache.set(key, { time: Date.now(), value });
}

function shapeForecast(raw) {
  return {
    city: raw.city.name,
    country: raw.city.country,
    timezone: raw.city.timezone,
    items: raw.list.map((entry) => ({
      dt: entry.dt,
      temp: entry.main.temp,
      feelsLike: entry.main.feels_like,
      humidity: entry.main.humidity,
      wind: entry.wind.speed,
      rainChance: Math.round((entry.pop || 0) * 100),
      condition: entry.weather[0].main,
      description: entry.weather[0].description,
      icon: entry.weather[0].icon
    }))
  };
}

app.get('/api/forecast', async (req, res) => {
  const city = String(req.query.city || '').trim();

  if (!CITY_PATTERN.test(city)) {
    return res.status(400).json({ error: 'Enter a city name using 2 to 60 letters.' });
  }

  if (!API_KEY) {
    return res.status(500).json({ error: 'The server is missing its weather API key.' });
  }

  const cacheKey = city.toLowerCase();
  const cached = readCache(cacheKey);
  if (cached) {
    res.setHeader('X-Cache', 'HIT');
    return res.json(cached);
  }

  const url = new URL('https://api.openweathermap.org/data/2.5/forecast');
  url.searchParams.set('q', city);
  url.searchParams.set('units', 'metric');
  url.searchParams.set('appid', API_KEY);

  try {
    const upstream = await fetch(url, { signal: AbortSignal.timeout(8000) });

    if (upstream.status === 404) {
      return res.status(404).json({ error: `No city found for "${city}". Check the spelling and try again.` });
    }
    if (upstream.status === 401) {
      return res.status(502).json({ error: 'The weather service rejected the server API key.' });
    }
    if (upstream.status === 429) {
      return res.status(503).json({ error: 'The weather service is rate limiting requests. Try again in a minute.' });
    }
    if (!upstream.ok) {
      return res.status(502).json({ error: 'The weather service returned an error. Try again shortly.' });
    }

    const raw = await upstream.json();
    if (!raw || !raw.city || !Array.isArray(raw.list)) {
      return res.status(502).json({ error: 'The weather service sent an unexpected response.' });
    }

    const shaped = shapeForecast(raw);
    writeCache(cacheKey, shaped);
    res.setHeader('X-Cache', 'MISS');
    return res.json(shaped);
  } catch (err) {
    if (err.name === 'TimeoutError' || err.name === 'AbortError') {
      return res.status(504).json({ error: 'The weather service took too long to respond. Try again.' });
    }
    return res.status(502).json({ error: 'Could not reach the weather service. Try again shortly.' });
  }
});

app.use((req, res) => {
  res.status(404).json({ error: 'Not found.' });
});

app.listen(PORT, () => {
  console.log(`Forecast Desk listening on port ${PORT}`);
});
