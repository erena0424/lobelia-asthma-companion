"""Open-Meteo weather + air quality (free, no API key). Pollen EU-only."""

from __future__ import annotations

import asyncio
from datetime import date, datetime

import httpx

from model.elena_env_schema import grains_to_pollen_category, us_aqi_to_openweather_band

FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive"
AIR_QUALITY_URL = "https://air-quality-api.open-meteo.com/v1/air-quality"
REQUEST_TIMEOUT = httpx.Timeout(45.0, connect=20.0)
MAX_ATTEMPTS = 3


class OpenMeteoEnvProvider:
    async def fetch_daily(self, lat: float, lon: float, day: date) -> dict:
        day_str = day.isoformat()
        async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT) as client:
            weather = await self._fetch_weather(client, lat, lon, day_str)
            air = await self._fetch_air(client, lat, lon, day_str)

        return {**weather, **air}

    async def _get_json(self, client: httpx.AsyncClient, url: str, params: dict) -> dict:
        last_exc: Exception | None = None
        for attempt in range(1, MAX_ATTEMPTS + 1):
            try:
                response = await client.get(url, params=params)
                response.raise_for_status()
                return response.json()
            except (httpx.TimeoutException, httpx.NetworkError) as exc:
                last_exc = exc
                if attempt < MAX_ATTEMPTS:
                    await asyncio.sleep(attempt)
                    continue
                raise RuntimeError(
                    f"Open-Meteo request failed after {MAX_ATTEMPTS} attempts: {type(exc).__name__}"
                ) from exc
        assert last_exc is not None
        raise last_exc

    async def _fetch_weather(self, client: httpx.AsyncClient, lat: float, lon: float, day_str: str) -> dict:
        from datetime import date as date_cls

        day = date_cls.fromisoformat(day_str)
        url = FORECAST_URL if day >= date_cls.today() else ARCHIVE_URL
        params = {
            "latitude": lat,
            "longitude": lon,
            "daily": "temperature_2m_max,temperature_2m_min,wind_speed_10m_max,wind_direction_10m_dominant",
            # Sea-level pressure and m/s wind match the AAMOS training data (OpenWeather units).
            "hourly": "temperature_2m,relative_humidity_2m,pressure_msl",
            "wind_speed_unit": "ms",
            "timezone": "auto",
            "start_date": day_str,
            "end_date": day_str,
        }
        data = await self._get_json(client, url, params)

        daily = data.get("daily", {})
        hourly = data.get("hourly", {})
        temps = hourly.get("temperature_2m") or []
        humids = hourly.get("relative_humidity_2m") or []
        pressures = hourly.get("pressure_msl") or []

        t_max = _first(daily.get("temperature_2m_max"))
        t_min = _first(daily.get("temperature_2m_min"))
        t_mean = sum(temps) / len(temps) if temps else (t_max + t_min) / 2 if t_max and t_min else None

        return {
            "temperature": t_mean,
            "temperature_min": t_min,
            "temperature_max": t_max,
            "pressure": _mean(pressures) if pressures else None,  # hPa at sea level
            "humidity": _mean(humids),
            "wind_speed": _first(daily.get("wind_speed_10m_max")),
            "wind_deg": _first(daily.get("wind_direction_10m_dominant")),
        }

    async def _fetch_air(self, client: httpx.AsyncClient, lat: float, lon: float, day_str: str) -> dict:
        params = {
            "latitude": lat,
            "longitude": lon,
            "hourly": (
                "carbon_monoxide,nitrogen_dioxide,sulphur_dioxide,ozone,"
                "pm2_5,pm10,ammonia,us_aqi,"
                "grass_pollen,birch_pollen,ragweed_pollen,mugwort_pollen"
            ),
            "timezone": "auto",
            "start_date": day_str,
            "end_date": day_str,
        }
        data = await self._get_json(client, AIR_QUALITY_URL, params)
        h = data.get("hourly", {})

        us_aqi = _mean(h.get("us_aqi") or [])
        return {
            "aqi": us_aqi_to_openweather_band(us_aqi) if us_aqi is not None else None,
            "co": _mean(h.get("carbon_monoxide")),
            "no": None,  # not available on Open-Meteo
            "no2": _mean(h.get("nitrogen_dioxide")),
            "o3": _mean(h.get("ozone")),
            "so2": _mean(h.get("sulphur_dioxide")),
            "pm2_5": _mean(h.get("pm2_5")),
            "pm10": _mean(h.get("pm10")),
            "nh3": _mean(h.get("ammonia")),
            # Open-Meteo pollen covers Europe only; elsewhere the values are null.
            # Leave them None (missing) instead of reading "no data" as Low.
            "grass_pollen": _pollen(h.get("grass_pollen")),
            "tree_pollen": _pollen(h.get("birch_pollen")),
            "weed_pollen": _pollen(h.get("ragweed_pollen") or h.get("mugwort_pollen")),
        }


def _pollen(values: list | None) -> str | None:
    grains = _mean(values or [])
    return grains_to_pollen_category(grains) if grains is not None else None


def _first(values: list | None):
    if not values:
        return None
    return values[0]


def _mean(values: list) -> float | None:
    nums = [v for v in values if v is not None]
    return sum(nums) / len(nums) if nums else None
