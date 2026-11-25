# Forecast Desk

A web app that shows a 5-day, 3-hour-step weather forecast for any city so people can plan trips, commutes, farming work, events or outdoor sport around the weather. Users can search a city, then sort, filter and search the forecast, switch  , and see summary stats such as the warmest period and the highest chance of rain.and between 

- Demo video: https://youtu.be/W2RLHNltIlM
- Load balancer URL: http://18.169.172.163
- Web01: http://3.9.170.8
- Web02: http://18.134.244.108

No login is needed to use the app.

## Features

- City search backed by the OpenWeatherMap 5-day forecast API
- Sort by time, temperature, rain chance or wind
- Filter by weather condition and by day, plus free-text search of descriptions
- Celsius and Fahrenheit toggle
- Summary cards (warmest, coolest, highest rain chance, strongest wind)
- API key kept on the server in a `.env` file, never sent to the browser
- In-memory caching of API responses for 10 minutes
- Input validation and clear error messages for invalid cities, API downtime, timeouts, rate limits and network loss
- Every response carries an `X-Served-By` header and the page footer shows which server answered, which makes load balancing easy to verify

## APIs and credits

- [OpenWeatherMap 5 day / 3 hour forecast API](https://openweathermap.org/forecast5) by OpenWeather. Weather icons are also served by OpenWeatherMap.
- [Express](https://expressjs.com/) web framework
- [dotenv](https://github.com/motdotla/dotenv) for loading environment variables
- [Nginx](https://nginx.org/) as reverse proxy and load balancer
- [PM2](https://pm2.keymetrics.io/) as the Node process manager

## Run locally

Requirements: Node.js 18 or newer and a free OpenWeatherMap API key from https://openweathermap.org/api.

```bash
git clone https://github.com/fabriceniyonkuruishimwe/forecast-desk.git
cd forecast-desk
npm install
cp .env.example .env
```

Edit `.env` and set your key, then start the app and open http://localhost:3000:

```bash
npm start
```

## Deploy to Web01 and Web02

Repeat on both servers.

```bash
sudo apt update
sudo apt install -y nginx git curl
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm install -g pm2
cd ~
git clone https://github.com/fabriceniyonkuruishimwe/forecast-desk.git
cd forecast-desk
npm install --omit=dev
nano .env
pm2 start server.js --name forecast-desk
pm2 save
pm2 startup
sudo cp deploy/web-nginx.conf /etc/nginx/sites-available/forecast-desk
sudo ln -sf /etc/nginx/sites-available/forecast-desk /etc/nginx/sites-enabled/forecast-desk
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
curl http://localhost/health
```

The `.env` file holds `OPENWEATHER_API_KEY` and `PORT=3000`. It is created by hand on each server and is not in the repository.

## Configure the load balancer (Lb01)

```bash
sudo apt update
sudo apt install -y nginx
```

Copy `deploy/lb-nginx.conf` to `/etc/nginx/sites-available/forecast-lb`, replace `3.9.170.8` and `18.134.244.108` with the real addresses, then:

```bash
sudo ln -sf /etc/nginx/sites-available/forecast-lb /etc/nginx/sites-enabled/forecast-lb
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

What the configuration does:

- `upstream forecast_backend` lists both web servers. Nginx uses round-robin, so requests alternate between Web01 and Web02.
- `max_fails` and `fail_timeout` mark a server as down after 3 failures for 15 seconds.
- `proxy_next_upstream` retries a request on the other server when one fails or times out.
- The `Host` and `X-Forwarded-*` headers pass the original request details to the web servers.
- `X-Load-Balancer` is added to every response so the balancer is identifiable.

## Test the load balancer

```bash
for i in 1 2 3 4 5 6; do curl -s -D - -o /dev/null http://18.169.172.163/health | grep -i x-served-by; done
```

The output alternates between the Web01 and Web02 hostnames. In the browser, reload the page and watch the footer text `Server: ...` change.

Failover test: run `pm2 stop forecast-desk` on Web01, repeat the loop (all responses come from Web02), then `pm2 start forecast-desk`.

## Challenges and solutions

- Keeping the API key private: the browser calls `/api/forecast` on the Express server, which adds the key server-side. `.env` is excluded through `.gitignore`.
- Making load balancing visible: both servers run identical code, so each now returns its hostname in an `X-Served-By` header and the UI shows it.
- Time zones: the API returns UTC timestamps, so the server passes the city's UTC offset and the frontend shifts times to local time.
- XSS safety: all API text is inserted with `textContent` and DOM methods instead of `innerHTML`.
- Rate limits: a 10-minute in-memory cache avoids repeating identical API calls.

## Author

Niyonkuru Ishimwe Fabrice

## Notes

- Lb01 came with HAProxy already listening on port 80. It was stopped and disabled (`sudo systemctl stop haproxy && sudo systemctl disable haproxy`) so Nginx could use the port.
