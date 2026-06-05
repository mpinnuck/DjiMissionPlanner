class MapController {
  constructor(mapElementId) {
    this.map = L.map(mapElementId, { zoomControl: true, tap: false }).setView([-33.87, 151.21], 14);
    this.routeLine = null;
    this.routeMidpointMarkers = [];
    this.userLocationMarker = null;
    this.userLocationCircle = null;

    L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      { attribution: 'Tiles © Esri', maxZoom: 19 }
    ).addTo(this.map);

    L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
      { attribution: '', maxZoom: 19, opacity: 0.7 }
    ).addTo(this.map);
  }

  // Public methods

  onClick(handler) {
    this.map.on('click', handler);
  }

  onMouseMove(handler) {
    this.map.on('mousemove', handler);
  }

  onZoomEnd(handler) {
    this.map.on('zoomend', handler);
  }

  getWaypointMarkerScale() {
    const zoom = this.map.getZoom();
    if (zoom >= 19) return 1.22;
    if (zoom >= 18) return 1.14;
    if (zoom >= 17) return 1.07;
    return 1;
  }

  wpIcon(idx, options = {}) {
    const {
      isFirst = false,
      isLast = false,
      isSelected = false,
      altitude = 0
    } = options;

    let fill = '#1f7cff'; // default waypoint blue
    if (isFirst || isLast) {
      fill = '#7f3fbf'; // first/last waypoint purple
    }
    if (isSelected) {
      fill = '#68d5ff'; // selected light blue
    }

    const altValue = Number.isFinite(altitude) ? Math.round(altitude) : 0;
    const scale = this.getWaypointMarkerScale();
    const pin = this._buildPinSvg({
      fill,
      mainText: idx,
      subText: altValue,
      scale
    });

    return L.divIcon({
      className: '',
      html: pin.html,
      iconSize: null,
      iconAnchor: pin.iconAnchor
    });
  }

  poiIcon(idx, isSelected = false) {
    const safeIndex = this._escapeHtml(String(idx));
    const fill = isSelected ? '#68d5ff' : '#1f9d55'; // green, selected light blue
    const pin = this._buildPinSvg({
      fill,
      mainText: safeIndex,
      subText: null,
      scale: 1
    });

    return L.divIcon({
      className: '',
      html: pin.html,
      iconSize: null,
      iconAnchor: pin.iconAnchor
    });
  }

  addWaypointMarker(wp, idx, options = {}) {
    return L.marker([wp.lat, wp.lng], {
      icon: this.wpIcon(idx, options),
      draggable: true,
      zIndexOffset: 100,
      bubblingMouseEvents: false
    }).addTo(this.map);
  }

  addPOIMarker(poi, options = {}) {
    const pinIndex = Number.isFinite(options.index) ? options.index : 1;
    return L.marker([poi.lat, poi.lng], {
      icon: this.poiIcon(pinIndex, !!options.isSelected),
      draggable: true,
      zIndexOffset: 200,
      bubblingMouseEvents: false
    }).addTo(this.map);
  }

  refreshWaypointLabels(waypoints, markerResolver, options = {}) {
    const {
      selectedId = null,
      selectedType = null,
      selectedWaypointIds = null
    } = options;

    const lastIndex = waypoints.length - 1;
    waypoints.forEach((wp, i) => {
      const marker = markerResolver ? markerResolver(wp) : null;
      if (marker) {
        marker.setIcon(this.wpIcon(i + 1, {
          isFirst: i === 0,
          isLast: i === lastIndex,
          isSelected: (selectedType === 'wp' && selectedId === wp.id)
            || (selectedWaypointIds instanceof Set && selectedWaypointIds.has(wp.id)),
          altitude: wp.alt
        }));
      }
    });
  }

  refreshPOILabels(pois, markerResolver, options = {}) {
    const {
      selectedId = null,
      selectedType = null
    } = options;

    pois.forEach((poi, i) => {
      const marker = markerResolver ? markerResolver(poi) : null;
      if (marker) {
        marker.setIcon(this.poiIcon(i + 1, selectedType === 'poi' && selectedId === poi.id));
      }
    });
  }

  updatePOILabel(marker, index, options = {}) {
    if (marker) {
      marker.setIcon(this.poiIcon(index, !!options.isSelected));
    }
  }

  removeLayer(layer) {
    if (layer) {
      this.map.removeLayer(layer);
    }
  }

  clearRouteMidpointMarkers() {
    this.routeMidpointMarkers.forEach(marker => this.map.removeLayer(marker));
    this.routeMidpointMarkers = [];
  }

  catmullRomSpline(points, samplesPerSegment = 20) {
    if (!Array.isArray(points) || points.length < 2) {
      return points || [];
    }

    const first = points[0];
    const second = points[1];
    const last = points[points.length - 1];
    const penultimate = points[points.length - 2];

    // Reflect first and last segments so the curve begins/ends at real waypoints.
    const startGhost = [
      (2 * first[0]) - second[0],
      (2 * first[1]) - second[1]
    ];
    const endGhost = [
      (2 * last[0]) - penultimate[0],
      (2 * last[1]) - penultimate[1]
    ];

    const pts = [startGhost, ...points, endGhost];
    const result = [];

    for (let index = 1; index < pts.length - 2; index += 1) {
      const p0 = pts[index - 1];
      const p1 = pts[index];
      const p2 = pts[index + 1];
      const p3 = pts[index + 2];

      const startSample = index === 1 ? 0 : 1;
      for (let sample = startSample; sample <= samplesPerSegment; sample += 1) {
        const t = sample / samplesPerSegment;
        const t2 = t * t;
        const t3 = t2 * t;

        const lat = 0.5 * (
          (2 * p1[0]) +
          (-p0[0] + p2[0]) * t +
          (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 +
          (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3
        );

        const lng = 0.5 * (
          (2 * p1[1]) +
          (-p0[1] + p2[1]) * t +
          (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 +
          (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3
        );

        result.push([lat, lng]);
      }
    }

    return result;
  }

  updateRoute(waypoints, options = {}) {
    if (this.routeLine) {
      this.map.removeLayer(this.routeLine);
      this.routeLine = null;
    }
    this.clearRouteMidpointMarkers();

    if (waypoints.length < 2) {
      return;
    }

    const points = waypoints.map(wp => [wp.lat, wp.lng]);
    const latlngs = waypoints.length === 2
      ? points
      : this.catmullRomSpline(points, 20);

    this.routeLine = L.polyline(latlngs, {
      color: '#f0a500',
      weight: 2,
      opacity: 0.7
    }).addTo(this.map);

    if (typeof options.onInsertWaypoint !== 'function') {
      return;
    }

    for (let i = 0; i < waypoints.length - 1; i += 1) {
      const from = waypoints[i];
      const to = waypoints[i + 1];
      const midpoint = {
        lat: (from.lat + to.lat) / 2,
        lng: (from.lng + to.lng) / 2
      };

      const midpointMarker = L.marker([midpoint.lat, midpoint.lng], {
        icon: L.divIcon({
          className: '',
          html: '<div class="route-insert-label">+</div>',
          iconSize: [24, 24],
          iconAnchor: [12, 12]
        }),
        keyboard: false,
        interactive: true,
        bubblingMouseEvents: false
      }).addTo(this.map);

      midpointMarker.on('click', () => {
        options.onInsertWaypoint(i + 1, midpoint);
      });

      this.routeMidpointMarkers.push(midpointMarker);
    }
  }

  clearRoute() {
    if (this.routeLine) {
      this.map.removeLayer(this.routeLine);
      this.routeLine = null;
    }
    this.clearRouteMidpointMarkers();
  }

  focusMission(waypoints = [], pois = []) {
    const points = [
      ...waypoints.map(wp => [wp.lat, wp.lng]),
      ...pois.map(poi => [poi.lat, poi.lng])
    ];

    if (points.length === 0) {
      return;
    }

    if (points.length === 1) {
      this.map.setView(points[0], 16);
      return;
    }

    const bounds = L.latLngBounds(points);
    this.map.fitBounds(bounds, {
      padding: [40, 40],
      maxZoom: 17
    });
  }

  clearUserLocationLayers() {
    if (this.userLocationMarker) {
      this.map.removeLayer(this.userLocationMarker);
      this.userLocationMarker = null;
    }
    if (this.userLocationCircle) {
      this.map.removeLayer(this.userLocationCircle);
      this.userLocationCircle = null;
    }
  }

  showUserLocation(lat, lng, accuracyMeters) {
    this.clearUserLocationLayers();

    this.userLocationMarker = L.circleMarker([lat, lng], {
      radius: 7,
      color: '#00d4ff',
      weight: 2,
      fillColor: '#00d4ff',
      fillOpacity: 0.85
    }).addTo(this.map);

    if (accuracyMeters && Number.isFinite(accuracyMeters)) {
      this.userLocationCircle = L.circle([lat, lng], {
        radius: accuracyMeters,
        color: '#00d4ff',
        weight: 1,
        fillColor: '#00d4ff',
        fillOpacity: 0.12
      }).addTo(this.map);
    }

    const zoomTarget = accuracyMeters && accuracyMeters < 60 ? 18 : 16;
    this.map.setView([lat, lng], zoomTarget);
  }

  // Private members

  _buildPinSvg({ fill, mainText, subText = null, scale = 1 }) {
    const PIN_W = 20;
    const PIN_H = 32;
    const width = Math.round(PIN_W * scale);
    const height = Math.round(PIN_H * scale);
    const safeMain = this._escapeHtml(String(mainText));
    const safeSub = subText == null ? '' : this._escapeHtml(String(subText));
    const mainY = subText == null ? '15' : '13';

    const subMarkup = subText == null
      ? ''
      : `<text x="12" y="20" text-anchor="middle" dominant-baseline="middle" fill="#ffffff" fill-opacity="0.95" font-family="'Share Tech Mono', monospace" font-size="5.2" font-weight="400">${safeSub}</text>`;

    const svg = `<svg width="${width}" height="${height}" viewBox="0 0 24 36" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M12 35 C11 31 8 27 5 23 C2.5 19.7 1 16 1 11 C1 5.4 5.6 1 12 1 C18.4 1 23 5.4 23 11 C23 16 21.5 19.7 19 23 C16 27 13 31 12 35 Z"
        fill="${fill}" stroke="rgba(255,255,255,0.95)" stroke-width="2" stroke-linejoin="round" />
      <text x="12" y="${mainY}" text-anchor="middle" dominant-baseline="middle" fill="#ffffff" font-family="'Share Tech Mono', monospace" font-size="9.4" font-weight="700">${safeMain}</text>
      ${subMarkup}
    </svg>`;

    return {
      html: `<div class="map-pin-svg-wrap">${svg}</div>`,
      iconAnchor: [Math.round((PIN_W / 2) * scale), Math.round(PIN_H * scale)]
    };
  }

  _escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}
