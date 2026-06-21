/**
 * MapController.js
 * Owns and manages the Leaflet map instance.
 *
 * Responsibilities:
 *  - Map initialisation, tile layer, zoom/pan controls
 *  - Waypoint and POI marker creation, removal, and label refresh
 *  - Route polyline rendering via CubicSplinePath
 *  - User location circle (showUserLocation)
 *  - Drone position marker during flythrough (showDroneAtPosition)
 *  - Layer management helpers (removeLayer, clearRoute)
 */
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

  /**
   * On click.
   *
   * @param {*} handler
   *
   * @returns {number}
   */
  onClick(handler) {
    this.map.on('click', handler);
  }

  /**
   * On mouse move.
   *
   * @param {*} handler
   *
   * @returns {number}
   */
  onMouseMove(handler) {
    this.map.on('mousemove', handler);
  }

  /**
   * On zoom end.
   *
   * @param {*} handler
   *
   * @returns {number}
   */
  onZoomEnd(handler) {
    this.map.on('zoomend', handler);
  }

  /**
   * Get waypoint marker scale.
   *
   * @returns {number}
   */
  getWaypointMarkerScale() {
    const zoom = this.map.getZoom();
    if (zoom >= 19) return 1.22;
    if (zoom >= 18) return 1.14;
    if (zoom >= 17) return 1.07;
    return 1;
  }

  /**
   * Wp icon.
   *
   * @param {number} idx
   * @param {Object} options [default: {}]
   *
   * @returns {*}
   */
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

  /**
   * Poi icon.
   *
   * @param {number} idx
   * @param {boolean} isSelected [default: false]
   *
   * @returns {*}
   */
  poiIcon(idx, isSelected = false) {
    const safeIndex = this._escapeHtml(String(idx));
    const fill = isSelected ? '#6eeb83' : '#1f9d55'; // green, selected light green
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

  /**
   * Creates a Leaflet marker for a newly placed waypoint and wires click/drag events.
   *
   * @param {Object} wp
   * @param {number} idx
   * @param {Object} options [default: {}]
   *
   * @returns {*}
   */
  addWaypointMarker(wp, idx, options = {}) {
    return L.marker([wp.lat, wp.lng], {
      icon: this.wpIcon(idx, options),
      draggable: true,
      zIndexOffset: 100,
      bubblingMouseEvents: false
    }).addTo(this.map);
  }

  /**
   * Creates and adds a Leaflet marker for a POI.
   *
   * @param {Object} poi
   * @param {Object} options [default: {}]
   *
   * @returns {*}
   */
  addPOIMarker(poi, options = {}) {
    const pinIndex = Number.isFinite(options.index) ? options.index : 1;
    return L.marker([poi.lat, poi.lng], {
      icon: this.poiIcon(pinIndex, !!options.isSelected),
      draggable: true,
      zIndexOffset: 200,
      bubblingMouseEvents: false
    }).addTo(this.map);
  }

  /**
   * Updates the index labels on all waypoint markers to reflect current order and selection.
   *
   * @param {Array} waypoints
   * @param {*} markerResolver
   * @param {Object} options [default: {}]
   */
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

  /**
   * Refresh p o i labels.
   *
   * @param {Array} pois
   * @param {*} markerResolver
   * @param {Object} options [default: {}]
   */
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

  /**
   * Update p o i label.
   *
   * @param {*} marker
   * @param {number} index
   * @param {Object} options [default: {}]
   */
  updatePOILabel(marker, index, options = {}) {
    if (marker) {
      marker.setIcon(this.poiIcon(index, !!options.isSelected));
    }
  }

  /**
   * Removes a single Leaflet layer from the map.
   *
   * @param {*} layer
   */
  removeLayer(layer) {
    if (layer) {
      this.map.removeLayer(layer);
    }
  }

  /**
   * Clear route midpoint markers.
   */
  clearRouteMidpointMarkers() {
    this.routeMidpointMarkers.forEach(marker => this.map.removeLayer(marker));
    this.routeMidpointMarkers = [];
  }

  /**
   * Redraws the cubic spline route polyline through all current waypoints.
   *
   * @param {Array} waypoints
   * @param {Object} options [default: {}]
   */
  updateRoute(waypoints, options = {}) {
    if (this.routeLine) {
      this.map.removeLayer(this.routeLine);
      this.routeLine = null;
    }
    this.clearRouteMidpointMarkers();

    if (waypoints.length < 2) {
      return;
    }

    const points = waypoints.map(wp => ({ lat: wp.lat, lng: wp.lng }));
    const latlngs = waypoints.length === 2
      ? points
      : CubicSplinePath.build(points, 20);

    this.routeLine = L.polyline(latlngs, {
      color: '#00d4ff',
      weight: 3,
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

  /**
   * Removes the route polyline and all waypoint/POI markers from the map.
   */
  clearRoute() {
    if (this.routeLine) {
      this.map.removeLayer(this.routeLine);
      this.routeLine = null;
    }
    this.clearRouteMidpointMarkers();
  }

  /**
   * Focus mission.
   *
   * @param {Object} waypoints [default: []]
   * @param {Object} pois [default: []]
   */
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

  /**
   * Clear user location layers.
   */
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

  /**
   * Centres the map on the user's location and draws an accuracy circle.
   *
   * @param {number} lat
   * @param {number} lng
   * @param {*} accuracyMeters
   */
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

  /**
   * Build pin svg.
   *
   * @param {Object} options - Named options object.
   *
   * @returns {Object}
   */
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

  /**
   * Escape html.
   *
   * @param {string} value
   *
   * @returns {string}
   */
  _escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}
