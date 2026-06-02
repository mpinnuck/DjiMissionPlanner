class MapController {
  constructor(mapElementId) {
    this.map = L.map(mapElementId, { zoomControl: true }).setView([-33.87, 151.21], 14);
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

  onClick(handler) {
    this.map.on('click', handler);
  }

  onMouseMove(handler) {
    this.map.on('mousemove', handler);
  }

  wpIcon(idx, altitude) {
    const altValue = Number.isFinite(altitude) ? altitude : 0;
    return L.divIcon({
      className: '',
      html: `<div class="wp-label-wrap"><div class="wp-label">${idx}</div><div class="wp-alt-label">${altValue}m</div></div>`,
      iconSize: null,
      iconAnchor: [12, 12]
    });
  }

  poiIcon(name) {
    return L.divIcon({
      className: '',
      html: `<div class="poi-label">◎ ${name}</div>`,
      iconSize: null,
      iconAnchor: [0, 10]
    });
  }

  addWaypointMarker(wp, idx) {
    return L.marker([wp.lat, wp.lng], {
      icon: this.wpIcon(idx, wp.alt),
      draggable: true,
      zIndexOffset: 100
    }).addTo(this.map);
  }

  addPOIMarker(poi) {
    return L.marker([poi.lat, poi.lng], {
      icon: this.poiIcon(poi.name),
      draggable: true,
      zIndexOffset: 200
    }).addTo(this.map);
  }

  refreshWaypointLabels(waypoints, markerResolver) {
    waypoints.forEach((wp, i) => {
      const marker = markerResolver ? markerResolver(wp) : null;
      if (marker) {
        marker.setIcon(this.wpIcon(i + 1, wp.alt));
      }
    });
  }

  updatePOILabel(marker, name) {
    if (marker) {
      marker.setIcon(this.poiIcon(name));
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
}
