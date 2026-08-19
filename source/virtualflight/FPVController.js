/**
 * FPVController.js
 * First-person view camera panel rendered using Three.js.
 * Displays a real-time synthetic camera view of the mission path during
 * flythrough, driven by frame data from FlythroughController.
 *
 * Responsibilities:
 *  - Initialises a Three.js WebGL renderer, scene, and perspective camera
 *    inside the fpv-panel DOM element
 *  - updateFrame: positions the camera at the drone's lat/lng/alt and
 *    applies gimbal pitch and yaw heading from the current flythrough frame
 *  - setDroneConfig: updates the camera field of view from the drone profile
 *  - updateGraphCursor: keeps the flight graph cursor in sync with FPV time
 *  - Renders a simplified terrain and sky scene for spatial orientation
 */
class FPVController {

  // ── Default camera constants (Air 3S) ──────────────────────────────────
  static DEFAULT_HFOV_DEG = 82;
  static DEFAULT_ASPECT   = 16 / 9;
  static EARTH_R   = 6371000;      // metres
  static TILE_ZOOM = 17;           // satellite tile zoom (254m per tile at Sydney lat)
  static SKY_COLOR = 0x87ceeb;     // sky blue

  // ── HUD colours ────────────────────────────────────────────────────────
  static HUD_COLOR_GREEN = '#2ed573';
  static HUD_COLOR_WHITE = '#ffffff';
  static HUD_COLOR_AMBER = '#f0a500';
  static HUD_COLOR_CYAN  = '#00d4ff';

  // ── HUD layout ─────────────────────────────────────────────────────────
  static HUD_EDGE_PAD      = 14;     // px inset from left/right canvas edge
  static HUD_FONT_LARGE    = 0.055;  // large label font height as fraction of canvas h
  static HUD_FONT_SMALL    = 0.040;  // small label font height as fraction of canvas h
  static HUD_SHADOW_BLUR   = 4;

  // Y positions as fraction of canvas h
  static HUD_TOP_LABEL_Y   = 0.08;
  static HUD_TOP_VALUE_Y   = 0.14;
  static HUD_HAG_LABEL_Y   = 0.18;
  static HUD_HAG_VALUE_Y   = 0.22;
  static HUD_HDG_VALUE_Y   = 0.135;
  static HUD_GMB_READOUT_Y = 0.18;
  static HUD_BOT_LABEL_Y   = 0.92;
  static HUD_BOT_VALUE_Y   = 0.965;

  // X offsets as fraction of canvas w
  static HUD_POI_X_OFFSET  = 0.075;  // POI column offset right of WP anchor
  static HUD_TIME_X_OFFSET = 0.10;   // TIME column offset left of DIST anchor

  // Gimbal pitch indicator
  static HUD_GMB_IND_Y      = 0.88;  // indicator centre Y as fraction of h
  static HUD_GMB_IND_W      = 0.18;  // indicator half-width as fraction of w
  static HUD_GMB_PTR_LEN    = 0.6;   // pointer length as fraction of lineW
  static HUD_GMB_DEG_Y      = 0.05;  // degree label Y offset below indicator centre
  static HUD_GMB_IND_LINE_W = 1.5;   // stroke width for indicator baseline
  static HUD_GMB_PTR_LINE_W = 2;     // stroke width for pointer line

  // Crosshair
  static HUD_CROSS_SIZE = 0.018;     // arm length as fraction of h

  constructor(container, options = {}) {
    this._container = container;   // div element holding the FPV panel
    this.onStatus   = options.onStatus || null;

    this._scene     = null;
    this._camera    = null;
    this._renderer  = null;
    this._hudCanvas = null;
    this._hudCtx    = null;

    this._tileCache    = new Map();   // key → THREE.Mesh
    this._missionCenter = null;       // {lat, lng}
    this._visible       = false;
    this._hfovDeg       = FPVController.DEFAULT_HFOV_DEG;
    this._sensorAspect  = FPVController.DEFAULT_ASPECT;
    this._graphWaypoints = [];
    this._graphMission = null;
    this._graphHeightAboveGroundByWaypointId = null;
    this._graphCurrentTime = 0;
    this._graphTotalTime = 0;
    this._flightGraph = null;

    this.setDroneConfig(options.droneConfig || null);

    if (typeof FlightGraph === 'function') {
      this._flightGraph = new FlightGraph({
        overlayElement: options.graphOverlay || null,
        canvasElement: options.graphCanvas || null
      });
    }

    this._initThree();
    this._initHUD();
  }

  /**
   * Updates the drone profile (HFOV, aspect ratio) used for FOV cone rendering.
   *
   * @param {*} droneConfig
   */
  setDroneConfig(droneConfig) {
    const hfov = Number(droneConfig && droneConfig.hfovDeg);
    const aspect = Number(droneConfig && droneConfig.aspect);

    this._hfovDeg = Number.isFinite(hfov) && hfov > 10 && hfov < 170
      ? hfov
      : FPVController.DEFAULT_HFOV_DEG;
    this._sensorAspect = Number.isFinite(aspect) && aspect > 0.2 && aspect < 5
      ? aspect
      : FPVController.DEFAULT_ASPECT;

    if (this._camera) {
      const vfov = 2 * Math.atan(
        Math.tan(this._hfovDeg * 0.5 * Math.PI / 180) / this._sensorAspect
      ) * 180 / Math.PI;
      this._camera.fov = vfov;
      this._camera.updateProjectionMatrix();
    }
  }

  // Public methods

  /**
   * Preload satellite tiles covering the mission waypoints.
   * Call whenever waypoints change (same pattern as FlythroughController).
   */
  setMission(waypoints, mission = null, options = {}) {
    this._graphWaypoints = Array.isArray(waypoints) ? waypoints : [];
    this._graphMission = mission;
    if (Object.prototype.hasOwnProperty.call(options, 'heightAboveGroundByWaypointId')) {
      this._graphHeightAboveGroundByWaypointId = options.heightAboveGroundByWaypointId;
    }

    if (!Array.isArray(waypoints) || waypoints.length < 1) {
      this._missionCenter = null;
      this._graphCurrentTime = 0;
      this._graphTotalTime = 0;
      this._clearTiles();
      if (this._hudCtx) {
        this._hudCtx.clearRect(0, 0, this._hudCanvas.width, this._hudCanvas.height);
      }
      if (this._flightGraph) {
        this._flightGraph.hide();
      }
      return;
    }

    const lats = waypoints.map(w => w.lat);
    const lngs = waypoints.map(w => w.lng);
    this._missionCenter = {
      lat: (Math.min(...lats) + Math.max(...lats)) / 2,
      lng: (Math.min(...lngs) + Math.max(...lngs)) / 2,
    };

    this._clearTiles();
    this._loadTilesForBounds(
      Math.min(...lats), Math.max(...lats),
      Math.min(...lngs), Math.max(...lngs)
    );

    if (this._visible) {
      this._refreshGraph();
    }
  }

  /**
   * Set graph height above ground.
   *
   * @param {string} heightAboveGroundByWaypointId
   */
  setGraphHeightAboveGround(heightAboveGroundByWaypointId) {
    this._graphHeightAboveGroundByWaypointId = heightAboveGroundByWaypointId;
    if (this._visible) {
      this._refreshGraph();
    }
  }

  /**
   * Update camera from a FlythroughController frame object.
   * { lat, lng, alt, heading, gimbalPitch, fpvGimbalPitch }
   */
  updateFrame({ lat, lng, alt, heading, gimbalPitch, fpvGimbalPitch, speed, poiAlt, distance, segmentIndex, poiId, time }) {
    if (!this._visible || !this._missionCenter) return;

    const pos = this._toScene(lat, lng);
    this._camera.position.set(pos.x, alt, pos.z);

    // Shift the satellite ground plane to poi.alt so the gimbal pitch
    // (which encodes the drone-to-POI vertical difference) centers the POI
    // in the FPV frame. Camera stays at wp.alt; effective height above the
    // displayed ground = wp.alt - poi.alt = what gimbalPitch was computed from.
    if (this._groundGroup) {
      this._groundGroup.position.y = Number.isFinite(poiAlt) ? poiAlt : 0;
    }

    // Use fpvGimbalPitch for the flat-scene FPV camera so the POI stays centered.
    // fpvGimbalPitch = -atan(wp.alt / horizDist), which treats the FPV ground as flat
    // at takeoff elevation. gimbalPitch is the real-world DJI angle and is shown on the HUD.
    const displayPitch = Number.isFinite(fpvGimbalPitch) ? fpvGimbalPitch : gimbalPitch;

    // YXZ Euler: yaw first (Y), then pitch (X), no roll (Z)
    // Three.js Y rotation is CCW from above → negate clockwise heading
    // Three.js X rotation positive = tilt up → gimbalPitch negative = look down ✓
    this._camera.rotation.order = 'YXZ';
    this._camera.rotation.set(
      displayPitch * Math.PI / 180,
      -(heading  * Math.PI / 180),
      0
    );

    const hag = this._currentHagForFrame(lat, lng);

    this._renderer.render(this._scene, this._camera);
    this._drawHUD(alt, heading, gimbalPitch, speed, distance, segmentIndex, poiId, time, hag);
  }

  /**
   * Shows the flight graph overlay for the given waypoints and renders the initial frame.
   */
  show() {
    this._container.style.display = 'block';
    this._visible = true;
    document.body.classList.add('fpv-visible');
    this._resize();
    this._refreshGraph();
  }

  /**
   * Hides the flight graph overlay.
   */
  hide() {
    this._container.style.display = 'none';
    this._visible = false;
    document.body.classList.remove('fpv-visible');
    document.body.classList.remove('fpv-graph-active');
    if (this._flightGraph) {
      this._flightGraph.hide();
    }
  }

  /**
   * Resize.
   */
  resize() { this._resize(); }

  /**
   * Update graph cursor.
   *
   * @param {*} currentTime
   * @param {*} totalTime
   */
  updateGraphCursor(currentTime, totalTime) {
    this._graphCurrentTime = Number.isFinite(currentTime) ? currentTime : this._graphCurrentTime;
    this._graphTotalTime = Number.isFinite(totalTime) ? totalTime : this._graphTotalTime;
    if (this._flightGraph && this._flightGraph.isVisible) {
      this._flightGraph.updateCursor(this._graphCurrentTime, this._graphTotalTime);
    }
  }

  /**
   * Stops playback and removes all flythrough layers from the map.
   */
  destroy() {
    this._clearTiles();
    this._renderer?.dispose();
  }

  // Private members

  // ── Three.js init ─────────────────────────────────────────────────────────

  /**
   * Init three.
   */
  _initThree() {
    // Scene
    this._scene = new THREE.Scene();
    this._scene.background = new THREE.Color(FPVController.SKY_COLOR);
    // Atmospheric haze
    this._scene.fog = new THREE.FogExp2(FPVController.SKY_COLOR, 0.00012);

    // Camera — VFOV derived from HFOV and aspect ratio
    const vfov = 2 * Math.atan(
      Math.tan(this._hfovDeg * 0.5 * Math.PI / 180) / this._sensorAspect
    ) * 180 / Math.PI;
    const containerAspect = (this._container.offsetWidth > 0 && this._container.offsetHeight > 0)
      ? (this._container.offsetWidth / this._container.offsetHeight)
      : FPVController.DEFAULT_ASPECT;

    this._camera = new THREE.PerspectiveCamera(vfov, containerAspect, 0.5, 8000);
    this._camera.rotation.order = 'YXZ';

    // Renderer
    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;';
    this._container.appendChild(canvas);

    this._renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this._renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    // Sunlight (makes terrain slightly shaded for depth)
    const sun = new THREE.DirectionalLight(0xffffff, 0.8);
    sun.position.set(100, 200, 100);
    this._scene.add(sun);
    this._scene.add(new THREE.AmbientLight(0xffffff, 0.6));

    // Ground group — all satellite tile meshes live here so the entire
    // ground plane can be shifted along Y to match the POI elevation.
    this._groundGroup = new THREE.Group();
    this._scene.add(this._groundGroup);
  }

  // ── HUD overlay ───────────────────────────────────────────────────────────

  /**
   * Init h u d.
   */
  _initHUD() {
    const hud = document.createElement('canvas');
    hud.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;';
    this._container.appendChild(hud);
    this._hudCanvas = hud;
    this._hudCtx    = hud.getContext('2d');
  }

  /**
   * Draw h u d.
   *
   * @param {number} alt
   * @param {*} heading
   * @param {*} gimbalPitch
   * @param {number} speed
   * @param {*} distance
   * @param {number} segmentIndex
   * @param {string} poiId
   * @param {number} time
   */
  _drawHUD(alt, heading, gimbalPitch, speed, distance, segmentIndex, poiId, time, hag = null) {
    const F = FPVController;
    const c = this._hudCtx;
    const w = this._hudCanvas.width;
    const h = this._hudCanvas.height;
    if (!w || !h) return;

    c.clearRect(0, 0, w, h);

    const font  = `${Math.round(h * F.HUD_FONT_LARGE)}px 'Share Tech Mono', monospace`;
    const small = `${Math.round(h * F.HUD_FONT_SMALL)}px 'Share Tech Mono', monospace`;
    c.shadowColor = 'rgba(0,0,0,0.8)';
    c.shadowBlur  = F.HUD_SHADOW_BLUR;

    // ── Altitude / HAG (top-left) ──
    c.fillStyle = F.HUD_COLOR_GREEN;
    c.font = font;
    c.textAlign = 'left';
    c.fillText(`ALT`, F.HUD_EDGE_PAD, h * F.HUD_TOP_LABEL_Y);
    c.fillStyle = F.HUD_COLOR_WHITE;
    c.fillText(`${Math.round(alt)}m`, F.HUD_EDGE_PAD, h * F.HUD_TOP_VALUE_Y);

    if (Number.isFinite(hag)) {
      c.fillStyle = F.HUD_COLOR_GREEN;
      c.font = small;
      c.fillText(`HAG`, F.HUD_EDGE_PAD, h * F.HUD_HAG_LABEL_Y);
      c.fillStyle = F.HUD_COLOR_WHITE;
      c.fillText(`${Math.round(hag)}m`, F.HUD_EDGE_PAD, h * F.HUD_HAG_VALUE_Y);
    }

    // ── Last waypoint passed + POI (bottom-left) ──
    if (Number.isFinite(segmentIndex)) {
      const wpNum = segmentIndex + 1;
      c.fillStyle = F.HUD_COLOR_GREEN;
      c.font = small;
      c.textAlign = 'left';
      c.fillText(`WP`, F.HUD_EDGE_PAD, h * F.HUD_BOT_LABEL_Y);
      c.fillStyle = F.HUD_COLOR_WHITE;
      c.fillText(`#${wpNum}`, F.HUD_EDGE_PAD, h * F.HUD_BOT_VALUE_Y);

      if (poiId) {
        const poi = (this._graphMission && Array.isArray(this._graphMission.pois))
          ? this._graphMission.pois.find(p => p.id === poiId)
          : null;
        const poiLabel = poi ? (poi.name || poiId) : poiId;
        c.fillStyle = F.HUD_COLOR_CYAN;
        c.font = small;
        c.fillText(`POI`, F.HUD_EDGE_PAD + w * F.HUD_POI_X_OFFSET, h * F.HUD_BOT_LABEL_Y);
        c.fillStyle = F.HUD_COLOR_WHITE;
        c.fillText(poiLabel, F.HUD_EDGE_PAD + w * F.HUD_POI_X_OFFSET, h * F.HUD_BOT_VALUE_Y);
      }
    }

    // ── Speed (top-right) ──
    const speedKmh = Number.isFinite(speed) ? speed * 3.6 : null;
    c.fillStyle = F.HUD_COLOR_AMBER;
    c.font = font;
    c.textAlign = 'right';
    c.fillText(`SPD`, w - F.HUD_EDGE_PAD, h * F.HUD_TOP_LABEL_Y);
    c.fillStyle = F.HUD_COLOR_WHITE;
    c.fillText(`${speedKmh != null ? Math.round(speedKmh) : '—'} km/h`, w - F.HUD_EDGE_PAD, h * F.HUD_TOP_VALUE_Y);

    // ── Elapsed time (bottom-right, just left of DIST) ──
    const totalSec = Number.isFinite(time) ? Math.floor(time) : null;
    const timeStr = totalSec == null ? '—' : (() => {
      const hh = Math.floor(totalSec / 3600);
      const mm = Math.floor((totalSec % 3600) / 60);
      const ss = totalSec % 60;
      return hh > 0
        ? `${hh}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`
        : `${mm}:${String(ss).padStart(2, '0')}`;
    })();
    c.fillStyle = F.HUD_COLOR_GREEN;
    c.font = small;
    c.textAlign = 'right';
    c.fillText(`TIME`, w - F.HUD_EDGE_PAD - w * F.HUD_TIME_X_OFFSET, h * F.HUD_BOT_LABEL_Y);
    c.fillStyle = F.HUD_COLOR_WHITE;
    c.fillText(timeStr, w - F.HUD_EDGE_PAD - w * F.HUD_TIME_X_OFFSET, h * F.HUD_BOT_VALUE_Y);

    // ── Distance travelled (bottom-right) ──
    const distM = Number.isFinite(distance) ? distance : null;
    const distStr = distM == null ? '—' : distM >= 1000 ? `${(distM / 1000).toFixed(2)} km` : `${Math.round(distM)} m`;
    c.fillStyle = F.HUD_COLOR_GREEN;
    c.font = small;
    c.textAlign = 'right';
    c.fillText(`DIST`, w - F.HUD_EDGE_PAD, h * F.HUD_BOT_LABEL_Y);
    c.fillStyle = F.HUD_COLOR_WHITE;
    c.fillText(distStr, w - F.HUD_EDGE_PAD, h * F.HUD_BOT_VALUE_Y);

    // ── Heading (top-centre) ──
    const hdgLabel = this._headingLabel(heading);
    c.fillStyle = F.HUD_COLOR_CYAN;
    c.font = font;
    c.textAlign = 'center';
    c.fillText(hdgLabel, w / 2, h * F.HUD_TOP_LABEL_Y);
    c.fillStyle = F.HUD_COLOR_WHITE;
    c.font = small;
    c.fillText(`${Math.round(((heading % 360) + 360) % 360)}°`, w / 2, h * F.HUD_HDG_VALUE_Y);

    // ── Gimbal pitch readout (just below heading) ──
    c.fillStyle = F.HUD_COLOR_AMBER;
    c.font = small;
    c.textAlign = 'center';
    c.fillText(`GMB ${Math.round(gimbalPitch)}°`, w / 2, h * F.HUD_GMB_READOUT_Y);

    // ── Gimbal pitch indicator (bottom-centre) ──
    // Horizontal line with a tick showing tilt angle
    const cx = w / 2, cy = h * F.HUD_GMB_IND_Y;
    const lineW = w * F.HUD_GMB_IND_W;
    const clampedPitch = Math.max(-90, Math.min(90, gimbalPitch));
    const pitchRad = clampedPitch * Math.PI / 180;
    c.strokeStyle = 'rgba(255,255,255,0.7)';
    c.lineWidth = F.HUD_GMB_IND_LINE_W;
    c.beginPath();
    c.moveTo(cx - lineW, cy);
    c.lineTo(cx + lineW, cy);
    c.stroke();

    // Pointer line showing gimbal tilt
    const pointerLen = lineW * F.HUD_GMB_PTR_LEN;
    c.strokeStyle = F.HUD_COLOR_AMBER;
    c.lineWidth = F.HUD_GMB_PTR_LINE_W;
    c.beginPath();
    c.moveTo(cx, cy);
    // Mapping: 0 deg = horizontal, -90 deg = vertical down, +90 deg = vertical up.
    c.lineTo(cx + pointerLen * Math.cos(-pitchRad), cy + pointerLen * Math.sin(-pitchRad));
    c.stroke();

    c.fillStyle = 'rgba(255,255,255,0.6)';
    c.font = small;
    c.textAlign = 'center';
    c.fillText(`${Math.round(gimbalPitch)}°`, cx, cy + h * F.HUD_GMB_DEG_Y);

    // ── Crosshair (centre) ──
    const cross = h * F.HUD_CROSS_SIZE;
    c.strokeStyle = 'rgba(255,255,255,0.5)';
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(w / 2 - cross, h / 2); c.lineTo(w / 2 + cross, h / 2);
    c.moveTo(w / 2, h / 2 - cross); c.lineTo(w / 2, h / 2 + cross);
    c.stroke();
  }

  /**
   * Heading label.
   *
   * @param {*} deg
   *
   * @returns {number}
   */
  _headingLabel(deg) {
    const norm = ((deg % 360) + 360) % 360;
    const dirs = ['N','NNE','NE','ENE','E','ESE','SE','SSE',
                  'S','SSW','SW','WSW','W','WNW','NW','NNW'];
    return dirs[Math.round(norm / 22.5) % 16];
  }

  /**
   * Resolve the live HAG for the current drone position from the waypoint map.
   *
   * @param {number} lat
   * @param {number} lng
   * @returns {number|null}
   */
  _currentHagForFrame(lat, lng) {
    const map = this._graphHeightAboveGroundByWaypointId;
    if (!(map instanceof Map) || !Array.isArray(this._graphWaypoints) || this._graphWaypoints.length === 0) {
      return null;
    }

    let closestWp = null;
    let closestDist = Infinity;

    for (const wp of this._graphWaypoints) {
      const dist = this._haversine(lat, lng, wp.lat, wp.lng);
      if (dist < closestDist) {
        closestDist = dist;
        closestWp = wp;
      }
    }

    if (!closestWp) {
      return null;
    }

    const hag = Number(map.get(closestWp.id));
    return Number.isFinite(hag) ? hag : null;
  }

  /**
   * Great-circle distance in metres.
   */
  _haversine(lat1, lng1, lat2, lng2) {
    const R = FPVController.EARTH_R;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  // ── Satellite tile loading ─────────────────────────────────────────────────

  /**
   * Load tiles for bounds.
   *
   * @param {*} minLat
   * @param {*} maxLat
   * @param {*} minLng
   * @param {*} maxLng
   */
  _loadTilesForBounds(minLat, maxLat, minLng, maxLng) {
    const Z    = FPVController.TILE_ZOOM;
    const BUF  = 3;   // extra tile buffer outside bbox

    const tMin = this._latLngToTile(maxLat, minLng, Z);  // NW corner
    const tMax = this._latLngToTile(minLat, maxLng, Z);  // SE corner

    for (let ty = tMin.y - BUF; ty <= tMax.y + BUF; ty++) {
      for (let tx = tMin.x - BUF; tx <= tMax.x + BUF; tx++) {
        this._loadTile(tx, ty, Z);
      }
    }
  }

  /**
   * Load tile.
   *
   * @param {*} tx
   * @param {*} ty
   * @param {number} zoom
   */
  _loadTile(tx, ty, zoom) {
    const key = `${zoom}/${tx}/${ty}`;
    if (this._tileCache.has(key)) return;

    // Placeholder so we don't double-load
    this._tileCache.set(key, null);

    const url = `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${zoom}/${ty}/${tx}`;

    const loader = new THREE.TextureLoader();
    loader.crossOrigin = 'anonymous';
    loader.load(url, texture => {
      texture.colorSpace = THREE.SRGBColorSpace || THREE.LinearEncoding; // r128 compat

      // Get lat/lng corners of this tile
      const nw = this._tileToLatLng(tx,     ty,     zoom);
      const se = this._tileToLatLng(tx + 1, ty + 1, zoom);

      const nwS = this._toScene(nw.lat, nw.lng);
      const seS = this._toScene(se.lat, se.lng);

      const tileW = seS.x - nwS.x;
      const tileD = seS.z - nwS.z;

      const geo = new THREE.PlaneGeometry(tileW, Math.abs(tileD));
      const mat = new THREE.MeshLambertMaterial({ map: texture });
      const mesh = new THREE.Mesh(geo, mat);

      // Lie flat in XZ plane — position within the group at y=0
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(
        (nwS.x + seS.x) / 2,
        0,
        (nwS.z + seS.z) / 2
      );

      this._groundGroup.add(mesh);
      this._tileCache.set(key, mesh);
    });
  }

  /**
   * Clear tiles.
   *
   * @returns {Object}
   */
  _clearTiles() {
    this._tileCache.forEach(mesh => {
      if (!mesh) return;
      this._groundGroup.remove(mesh);
      mesh.geometry.dispose();
      mesh.material.map?.dispose();
      mesh.material.dispose();
    });
    this._tileCache.clear();
  }

  // ── Coordinate helpers ────────────────────────────────────────────────────

  /** Convert lat/lng to Three.js scene XZ coordinates (metres from centre) */
  _toScene(lat, lng) {
    const R  = FPVController.EARTH_R;
    const cL = this._missionCenter;
    return {
      x:  (lng - cL.lng) * Math.PI / 180 * R * Math.cos(cL.lat * Math.PI / 180),
      z: -(lat - cL.lat) * Math.PI / 180 * R,
    };
  }

  /**
   * Lat lng to tile.
   *
   * @param {number} lat
   * @param {number} lng
   * @param {number} zoom
   *
   * @returns {Object}
   */
  _latLngToTile(lat, lng, zoom) {
    const n      = Math.pow(2, zoom);
    const latRad = lat * Math.PI / 180;
    return {
      x: Math.floor((lng + 180) / 360 * n),
      y: Math.floor((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n),
    };
  }

  /**
   * Tile to lat lng.
   *
   * @param {*} tx
   * @param {*} ty
   * @param {number} zoom
   *
   * @returns {Object}
   */
  _tileToLatLng(tx, ty, zoom) {
    const n      = Math.pow(2, zoom);
    const latRad = Math.atan(Math.sinh(Math.PI * (1 - 2 * ty / n)));
    return {
      lat: latRad * 180 / Math.PI,
      lng: tx / n * 360 - 180,
    };
  }

  // ── Resize ────────────────────────────────────────────────────────────────

  /**
   * Resize.
   */
  _resize() {
    const w = this._container.offsetWidth;
    const h = this._container.offsetHeight;
    if (!w || !h) return;
    this._camera.aspect = w / h;
    this._camera.updateProjectionMatrix();
    this._renderer.setSize(w, h);
    this._hudCanvas.width  = w;
    this._hudCanvas.height = h;
    this._refreshGraph();
    this._syncGraphOverlapClass();
  }

  /**
   * Refresh graph.
   */
  _refreshGraph() {
    if (!this._flightGraph) {
      document.body.classList.remove('fpv-graph-active');
      return;
    }

    if (!this._visible || !this._graphMission || this._graphWaypoints.length < 2) {
      this._flightGraph.hide();
      document.body.classList.remove('fpv-graph-active');
      return;
    }

    this._flightGraph.show({
      waypoints: this._graphWaypoints,
      mission: this._graphMission,
      cursorTime: this._graphCurrentTime,
      heightAboveGroundByWaypointId: this._graphHeightAboveGroundByWaypointId
    });
    this._flightGraph.updateCursor(this._graphCurrentTime, this._graphTotalTime);
    this._syncGraphOverlapClass();
    requestAnimationFrame(() => this._syncGraphOverlapClass());
  }

  /**
   * Sync graph overlap class.
   */
  _syncGraphOverlapClass() {
    const graphOverlay = this._flightGraph && this._flightGraph.overlayElement;

    if (!this._visible) {
      document.body.classList.remove('fpv-graph-active');
      if (graphOverlay) {
        graphOverlay.style.right = '';
        graphOverlay.style.width = '';
        graphOverlay.style.maxWidth = '';
      }
      return;
    }

    const graphVisible = this._flightGraph
      && this._flightGraph.isVisible
      && graphOverlay
      && graphOverlay.style.display !== 'none';

    if (!graphVisible) {
      document.body.classList.remove('fpv-graph-active');
      if (graphOverlay) {
        graphOverlay.style.right = '';
        graphOverlay.style.width = '';
        graphOverlay.style.maxWidth = '';
      }
      return;
    }

    const panelRect = this._container.getBoundingClientRect();
    graphOverlay.style.right = '';
    graphOverlay.style.width = '';
    graphOverlay.style.maxWidth = '';
    const graphRect = graphOverlay.getBoundingClientRect();
    const overlaps = !(
      panelRect.right <= graphRect.left
      || panelRect.left >= graphRect.right
      || panelRect.bottom <= graphRect.top
      || panelRect.top >= graphRect.bottom
    );

    if (overlaps) {
      const overlayLeft = parseFloat(window.getComputedStyle(graphOverlay).left) || 12;
      const clearance = 12;
      const availableWidth = Math.max(140, Math.floor(panelRect.left - overlayLeft - clearance));

      // Use explicit width so the graph right axis always stays left of FPV.
      graphOverlay.style.right = 'auto';
      graphOverlay.style.maxWidth = 'none';
      graphOverlay.style.width = `${availableWidth}px`;
    }

    document.body.classList.toggle('fpv-graph-active', overlaps);
  }
}
