class MapController {
  constructor(mapElementId) {
    this.map = L.map(mapElementId, { zoomControl: true }).setView([-33.87, 151.21], 14);
    this.routeLine = null;
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

  wpIcon(idx) {
    return L.divIcon({
      className: '',
      html: `<div class="wp-label">${idx}</div>`,
      iconSize: [24, 24],
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
      icon: this.wpIcon(idx),
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
        marker.setIcon(this.wpIcon(i + 1));
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

  updateRoute(waypoints) {
    if (this.routeLine) {
      this.map.removeLayer(this.routeLine);
      this.routeLine = null;
    }

    if (waypoints.length < 2) {
      return;
    }

    const latlngs = waypoints.map(wp => [wp.lat, wp.lng]);
    this.routeLine = L.polyline(latlngs, {
      color: '#f0a500',
      weight: 2,
      opacity: 0.7,
      dashArray: '6 4'
    }).addTo(this.map);
  }

  clearRoute() {
    if (this.routeLine) {
      this.map.removeLayer(this.routeLine);
      this.routeLine = null;
    }
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
