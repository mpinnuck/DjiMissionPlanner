class ElevationService {
  constructor(options = {}) {
    this.onError = options.onError || null;
    this.cache = new Map();
    this.endpoint = options.endpoint || 'https://api.open-meteo.com/v1/elevation';
  }

  _key(lat, lng) {
    return `${Number(lat).toFixed(6)},${Number(lng).toFixed(6)}`;
  }

  _chunk(list, chunkSize) {
    const chunks = [];
    for (let i = 0; i < list.length; i += chunkSize) {
      chunks.push(list.slice(i, i + chunkSize));
    }
    return chunks;
  }

  async getElevations(points = []) {
    const result = new Map();
    const unique = [];
    const seen = new Set();

    points.forEach(point => {
      const lat = Number(point.lat);
      const lng = Number(point.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        return;
      }
      const key = this._key(lat, lng);
      if (seen.has(key)) {
        return;
      }
      seen.add(key);
      unique.push({ lat, lng, key });
    });

    unique.forEach(point => {
      if (this.cache.has(point.key)) {
        result.set(point.key, this.cache.get(point.key));
      }
    });

    const uncached = unique.filter(point => !this.cache.has(point.key));
    if (uncached.length === 0) {
      return result;
    }

    const chunks = this._chunk(uncached, 40);
    for (const chunk of chunks) {
      const latList = chunk.map(point => point.lat.toFixed(6)).join(',');
      const lngList = chunk.map(point => point.lng.toFixed(6)).join(',');
      const url = `${this.endpoint}?latitude=${encodeURIComponent(latList)}&longitude=${encodeURIComponent(lngList)}`;

      try {
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`Elevation API HTTP ${response.status}`);
        }

        const payload = await response.json();
        const elevations = Array.isArray(payload.elevation)
          ? payload.elevation
          : (Number.isFinite(payload.elevation) ? [payload.elevation] : []);

        chunk.forEach((point, index) => {
          const elevation = Number(elevations[index]);
          if (Number.isFinite(elevation)) {
            this.cache.set(point.key, elevation);
            result.set(point.key, elevation);
          }
        });
      } catch (error) {
        if (typeof this.onError === 'function') {
          this.onError(`Unable to fetch terrain elevation: ${error.message}`);
        }
      }
    }

    return result;
  }
}
