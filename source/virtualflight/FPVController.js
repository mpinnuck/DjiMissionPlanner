/**
 * FPVController
 *
 * First-person view from the drone camera using Three.js r128.
 * Satellite tiles (ESRI) are fetched and laid as a textured ground plane.
 * The Three.js camera is positioned and oriented to match the drone's
 * altitude, heading and gimbal pitch each frame.
 *
 * Driven by FlythroughController via the onFrame callback:
 *
 *   this.flythrough = new FlythroughController(map, {
 *     onFrame: frame => this.fpv.updateFrame(frame),
 *     ...
 *   });
 *
 *   this.fpv = new FPVController(document.getElementById('fpv-panel'));
 *   this.fpv.setMission(waypoints);
 *
 * FlythroughController._tick() needs one addition:
 *   if (this.onFrame) this.onFrame(frame);  // after _updateDisplay(frame)
 */
class FPVController {

  // ── Default camera constants (Air 3S) ──────────────────────────────────
  static DEFAULT_HFOV_DEG = 82;
  static DEFAULT_ASPECT   = 16 / 9;
  static EARTH_R   = 6371000;      // metres
  static TILE_ZOOM = 17;           // satellite tile zoom (254m per tile at Sydney lat)
  static SKY_COLOR = 0x87ceeb;     // sky blue

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

    this.setDroneConfig(options.droneConfig || null);

    this._initThree();
    this._initHUD();
  }

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

  // ── Public API ───────────────────────────────────────────────────────────

  /**
   * Preload satellite tiles covering the mission waypoints.
   * Call whenever waypoints change (same pattern as FlythroughController).
   */
  setMission(waypoints) {
    if (!waypoints || waypoints.length < 1) return;

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
  }

  /**
   * Update camera from a FlythroughController frame object.
   * { lat, lng, alt, heading, gimbalPitch }
   */
  updateFrame({ lat, lng, alt, heading, gimbalPitch, speed }) {
    if (!this._visible || !this._missionCenter) return;

    const pos = this._toScene(lat, lng);
    this._camera.position.set(pos.x, alt, pos.z);

    // YXZ Euler: yaw first (Y), then pitch (X), no roll (Z)
    // Three.js Y rotation is CCW from above → negate clockwise heading
    // Three.js X rotation positive = tilt up → gimbalPitch negative = look down ✓
    this._camera.rotation.order = 'YXZ';
    this._camera.rotation.set(
      gimbalPitch * Math.PI / 180,
      -(heading  * Math.PI / 180),
      0
    );

    this._renderer.render(this._scene, this._camera);
    this._drawHUD(alt, heading, gimbalPitch, speed);
  }

  show() {
    this._container.style.display = 'block';
    this._visible = true;
    this._resize();
  }

  hide() {
    this._container.style.display = 'none';
    this._visible = false;
  }

  resize() { this._resize(); }

  destroy() {
    this._clearTiles();
    this._renderer?.dispose();
  }

  // ── Three.js init ─────────────────────────────────────────────────────────

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
  }

  // ── HUD overlay ───────────────────────────────────────────────────────────

  _initHUD() {
    const hud = document.createElement('canvas');
    hud.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;';
    this._container.appendChild(hud);
    this._hudCanvas = hud;
    this._hudCtx    = hud.getContext('2d');
  }

  _drawHUD(alt, heading, gimbalPitch, speed) {
    const c   = this._hudCtx;
    const w   = this._hudCanvas.width;
    const h   = this._hudCanvas.height;
    if (!w || !h) return;

    c.clearRect(0, 0, w, h);

    const font  = `${Math.round(h * 0.055)}px 'Share Tech Mono', monospace`;
    const small = `${Math.round(h * 0.040)}px 'Share Tech Mono', monospace`;
    c.shadowColor   = 'rgba(0,0,0,0.8)';
    c.shadowBlur    = 4;

    // ── Altitude (top-left) ──
    c.fillStyle = '#2ed573';
    c.font = font;
    c.textAlign = 'left';
    c.fillText(`ALT`, 14, h * 0.08);
    c.fillStyle = '#ffffff';
    c.fillText(`${Math.round(alt)}m`, 14, h * 0.14);

    // ── Speed (top-right) ──
    const speedKmh = Number.isFinite(speed) ? speed * 3.6 : null;
    c.fillStyle = '#f0a500';
    c.font = font;
    c.textAlign = 'right';
    c.fillText(`SPD`, w - 14, h * 0.08);
    c.fillStyle = '#ffffff';
    c.fillText(`${speedKmh != null ? speedKmh.toFixed(1) : '—'} km/h`, w - 14, h * 0.14);

    // ── Heading (top-centre) ──
    const hdgLabel = this._headingLabel(heading);
    c.fillStyle = '#00d4ff';
    c.font = font;
    c.textAlign = 'center';
    c.fillText(hdgLabel, w / 2, h * 0.08);
    c.fillStyle = '#ffffff';
    c.font = small;
    c.fillText(`${Math.round(((heading % 360) + 360) % 360)}°`, w / 2, h * 0.135);

    // ── Gimbal pitch readout (just below heading) ──
    c.fillStyle = '#f0a500';
    c.font = small;
    c.textAlign = 'center';
    c.fillText(`GMB ${Math.round(gimbalPitch)}°`, w / 2, h * 0.18);

    // ── Gimbal pitch indicator (bottom-centre) ──
    // Horizontal line with a tick showing tilt angle
    const cx = w / 2, cy = h * 0.88;
    const lineW = w * 0.18;
    const pitchRad = gimbalPitch * Math.PI / 180;
    c.strokeStyle = 'rgba(255,255,255,0.7)';
    c.lineWidth = 1.5;
    c.beginPath();
    c.moveTo(cx - lineW, cy);
    c.lineTo(cx + lineW, cy);
    c.stroke();

    // Pointer line showing gimbal tilt
    const pointerLen = lineW * 0.6;
    c.strokeStyle = '#f0a500';
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(cx, cy);
    c.lineTo(cx + pointerLen * Math.sin(-pitchRad), cy - pointerLen * Math.cos(-pitchRad));
    c.stroke();

    c.fillStyle = 'rgba(255,255,255,0.6)';
    c.font = small;
    c.textAlign = 'center';
    c.fillText(`${Math.round(gimbalPitch)}°`, cx, cy + h * 0.05);

    // ── Crosshair (centre) ──
    const cross = h * 0.018;
    c.strokeStyle = 'rgba(255,255,255,0.5)';
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(w/2 - cross, h/2); c.lineTo(w/2 + cross, h/2);
    c.moveTo(w/2, h/2 - cross); c.lineTo(w/2, h/2 + cross);
    c.stroke();
  }

  _headingLabel(deg) {
    const norm = ((deg % 360) + 360) % 360;
    const dirs = ['N','NNE','NE','ENE','E','ESE','SE','SSE',
                  'S','SSW','SW','WSW','W','WNW','NW','NNW'];
    return dirs[Math.round(norm / 22.5) % 16];
  }

  // ── Satellite tile loading ─────────────────────────────────────────────────

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

      // Lie flat in XZ plane (Y=0 is ground)
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(
        (nwS.x + seS.x) / 2,
        0,
        (nwS.z + seS.z) / 2
      );

      this._scene.add(mesh);
      this._tileCache.set(key, mesh);
    });
  }

  _clearTiles() {
    this._tileCache.forEach(mesh => {
      if (!mesh) return;
      this._scene.remove(mesh);
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

  _latLngToTile(lat, lng, zoom) {
    const n      = Math.pow(2, zoom);
    const latRad = lat * Math.PI / 180;
    return {
      x: Math.floor((lng + 180) / 360 * n),
      y: Math.floor((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n),
    };
  }

  _tileToLatLng(tx, ty, zoom) {
    const n      = Math.pow(2, zoom);
    const latRad = Math.atan(Math.sinh(Math.PI * (1 - 2 * ty / n)));
    return {
      lat: latRad * 180 / Math.PI,
      lng: tx / n * 360 - 180,
    };
  }

  // ── Resize ────────────────────────────────────────────────────────────────

  _resize() {
    const w = this._container.offsetWidth;
    const h = this._container.offsetHeight;
    if (!w || !h) return;
    this._camera.aspect = w / h;
    this._camera.updateProjectionMatrix();
    this._renderer.setSize(w, h);
    this._hudCanvas.width  = w;
    this._hudCanvas.height = h;
  }
}
