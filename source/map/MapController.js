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

    this.streetLayer = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}',
      { attribution: '', maxZoom: 19, opacity: 0.8 }
    ).addTo(this.map);

    this.labelsLayer = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
      { attribution: '', maxZoom: 19, opacity: 0.7 }
    ).addTo(this.map);

    this.streetNamesVisible = true;

    this._addressSearchDebounce = null;
    this._addressSearchToken = 0;
    this._addressSearchResults = [];
    this.addAddressSearchControl();
  }

  /**
   * Adds a live address search control with narrowing dropdown suggestions.
   */
  addAddressSearchControl() {
    if (!L.control) {
      return;
    }

    const control = L.control({ position: 'topleft' });
    control.onAdd = () => {
      const container = L.DomUtil.create('div', 'leaflet-bar dji-address-search-control');
      const toggle = L.DomUtil.create('button', 'dji-address-search-toggle', container);
      const panel = L.DomUtil.create('div', 'dji-address-search-panel', container);
      const input = L.DomUtil.create('input', 'dji-address-search-input', panel);
      const list = L.DomUtil.create('div', 'dji-address-search-results', panel);

      toggle.type = 'button';
      toggle.title = 'Search address or place';
      toggle.textContent = '🔍';
      input.type = 'text';
      input.placeholder = 'Search address or place...';
      input.autocomplete = 'off';
      input.spellcheck = false;

      const closePanel = () => {
        container.classList.remove('open');
        clearResults();
      };

      const openPanel = () => {
        container.classList.add('open');
        input.value = '';
        clearResults();
        input.focus();
      };

      const togglePanel = () => {
        if (container.classList.contains('open')) {
          closePanel();
          return;
        }
        openPanel();
      };

      const clearResults = () => {
        this._addressSearchResults = [];
        list.innerHTML = '';
        list.classList.remove('open');
      };

      const renderResults = results => {
        list.innerHTML = '';
        this._addressSearchResults = results;
        if (!results.length) {
          list.classList.remove('open');
          return;
        }

        results.forEach((result, index) => {
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'dji-address-search-result';
          button.textContent = result.displayName;
          button.dataset.index = String(index);
          button.addEventListener('click', () => {
            this._applyAddressSearchResult(result);
            input.value = result.displayName;
            closePanel();
          });
          list.appendChild(button);
        });

        list.classList.add('open');
      };

      const requestSuggestions = async query => {
        const token = ++this._addressSearchToken;
        const results = await this._fetchAddressSuggestions(query, 8);
        if (token !== this._addressSearchToken) {
          return;
        }
        renderResults(results);
      };

      input.addEventListener('input', () => {
        const query = input.value.trim();
        if (this._addressSearchDebounce) {
          clearTimeout(this._addressSearchDebounce);
        }

        if (query.length < 3) {
          clearResults();
          return;
        }

        this._addressSearchDebounce = setTimeout(() => {
          requestSuggestions(query);
        }, 220);
      });

      input.addEventListener('keydown', event => {
        if (!this._addressSearchResults.length) {
          if (event.key === 'Escape') {
            clearResults();
            input.blur();
          }
          return;
        }

        const current = list.querySelector('.dji-address-search-result.active');
        const items = Array.from(list.querySelectorAll('.dji-address-search-result'));
        let activeIndex = current ? items.indexOf(current) : -1;

        if (event.key === 'ArrowDown') {
          event.preventDefault();
          activeIndex = Math.min(items.length - 1, activeIndex + 1);
        } else if (event.key === 'ArrowUp') {
          event.preventDefault();
          activeIndex = Math.max(0, activeIndex - 1);
        } else if (event.key === 'Enter') {
          event.preventDefault();
          const selected = activeIndex >= 0 ? this._addressSearchResults[activeIndex] : this._addressSearchResults[0];
          if (selected) {
            this._applyAddressSearchResult(selected);
            input.value = selected.displayName;
            closePanel();
          }
          return;
        } else if (event.key === 'Escape') {
          closePanel();
          return;
        } else {
          return;
        }

        items.forEach((item, idx) => {
          const isActive = idx === activeIndex;
          item.classList.toggle('active', isActive);
          if (isActive) {
            item.scrollIntoView({ block: 'nearest' });
          }
        });
      });

      input.addEventListener('blur', () => {
        setTimeout(() => clearResults(), 300);
      });

      toggle.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        togglePanel();
      });

      this.map.on('click', () => {
        closePanel();
      });

      L.DomEvent.disableClickPropagation(container);
      if (typeof L.DomEvent.disableScrollPropagation === 'function') {
        L.DomEvent.disableScrollPropagation(container);
      }
      return container;
    };

    control.addTo(this.map);
  }

  /**
   * Fetches address suggestions from Nominatim for a query.
   *
   * @param {string} query
   * @param {number} limit
   *
   * @returns {Promise<Array>}
   */
  async _fetchAddressSuggestions(query, limit = 8) {
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=${limit}&email=${encodeURIComponent('noreply@app.microconcepts.com.au')}&q=${encodeURIComponent(query)}`;
    try {
      const response = await fetch(url, {
        headers: {
          Accept: 'application/json'
        }
      });
      if (!response.ok) {
        return [];
      }

      const results = await response.json();
      if (!Array.isArray(results) || results.length === 0) {
        return [];
      }

      return results.map(result => ({
        displayName: result.display_name || 'Unknown location',
        lat: Number.parseFloat(result.lat),
        lon: Number.parseFloat(result.lon),
        boundingbox: Array.isArray(result.boundingbox) ? result.boundingbox : null
      })).filter(result => Number.isFinite(result.lat) && Number.isFinite(result.lon));
    } catch (error) {
      return [];
    }
  }

  /**
   * Centers the map to a selected search result.
   *
   * @param {Object} result
   */
  _applyAddressSearchResult(result) {
    const bbox = result && Array.isArray(result.boundingbox) ? result.boundingbox : null;
    if (bbox && bbox.length === 4) {
      const south = Number.parseFloat(bbox[0]);
      const north = Number.parseFloat(bbox[1]);
      const west = Number.parseFloat(bbox[2]);
      const east = Number.parseFloat(bbox[3]);
      if ([south, north, west, east].every(Number.isFinite)) {
        this.map.fitBounds([[south, west], [north, east]], { maxZoom: 17 });
        return;
      }
    }

    if (Number.isFinite(result.lat) && Number.isFinite(result.lon)) {
      this.map.setView([result.lat, result.lon], 17);
    }
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
   * Toggle street names and road overlay visibility.
   *
   * @returns {boolean}
   */
  toggleStreetNames() {
    if (this.streetNamesVisible) {
      this.map.removeLayer(this.streetLayer);
      this.map.removeLayer(this.labelsLayer);
    } else {
      this.streetLayer.addTo(this.map);
      this.labelsLayer.addTo(this.map);
    }
    this.streetNamesVisible = !this.streetNamesVisible;
    return this.streetNamesVisible;
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
