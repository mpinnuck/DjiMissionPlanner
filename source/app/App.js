/**
 * App.js
 * Root application class for the DJI Mission Planner.
 * Owns all top-level state: mission data, map controller, UI, flythrough,
 * location service, KMZ exporter, elevation service, and storage backend.
 * The constructor wires every subsystem together and calls Object.assign
 * to mix in the method groups defined in the App* mixin files.
 * Entry point: dji_mission_planner.js calls `new App({ mapElementId })`.
 */
class App {
  constructor(options) {
    this.locationToastId = 'locationLookupToast';
    this.mode = 'select';
    this.selectedId = null;
    this.selectedType = null;
    this.selectedWaypointIds = new Set();
    this.lastWaypointAnchorId = null;
    this.touchRangeAnchorId = null;
    this.lastLoadedMissionFolder = '';
    this.activeWaypointTooltipId = null;
    this.activeWaypointPopup = null;
    this.activePOIPopup = null;
    this.mission = new Mission();
    this.ui = new PlannerUI({ mapElementId: options.mapElementId || 'map' });
    this.droneProfiles = {
      air3s: {
        id: 'air3s',
        label: 'DJI Air 3S',
        hfovDeg: 82,
        aspect: 16 / 9,
        droneEnumValue: 77,
        droneSubEnumValue: 0
      }
    };
    this.activeDroneConfig = null;
    this.onStatus = options.onStatus || null;
    this.onError = options.onError || (message => alert(message));
    this.waypointMarkers = new Map();
    this.poiMarkers = new Map();
    this.currentMissionDefaultSpeedMps = this.ui.getDefaultSpeed();

    this.mapController = new MapController(options.mapElementId || 'map');
    const fpvPanel = document.getElementById('fpv-panel');
    const graphOverlay = document.getElementById('ftGraphOverlay');
    const graphCanvas = document.getElementById('ftGraphCanvas');
    this.graphScrubWasPlaying = false;
    this.fpv = (typeof FPVController === 'function' && fpvPanel)
      ? new FPVController(fpvPanel, {
        graphOverlay,
        graphCanvas,
        onGraphSeek: event => {
          if (!this.flythrough) {
            return;
          }

          const fraction = Number(event && event.fraction);
          const safeFraction = Number.isFinite(fraction)
            ? Math.max(0, Math.min(1, fraction))
            : 0;
          const phase = event && event.phase;

          if (phase === 'start') {
            this.graphScrubWasPlaying = this.flythrough.isPlaying;
            if (this.graphScrubWasPlaying) {
              this.flythrough.pause();
              this.ui.setFlythroughPlayState('paused');
            }
          }

          this.flythrough.seekTo(safeFraction);

          if (phase === 'end') {
            if (this.graphScrubWasPlaying) {
              this.flythrough.play();
              this.ui.setFlythroughPlayState('playing');
            } else {
              this.ui.setFlythroughPlayState('paused');
            }
            this.graphScrubWasPlaying = false;
          }
        }
      })
      : null;
    this.isFPVVisible = false;
    this.flythrough = typeof FlythroughController === 'function'
      ? new FlythroughController(this.mapController.map, {
        onProgress: (t, total) => {
          this.ui.updateFlythroughProgress(
            t,
            total,
            total > 0 ? t / total : 0
          );
          if (this.fpv) {
            this.fpv.updateGraphCursor(t, total);
          }
        },
        onComplete: () => {
          // Keep drone at the end of the path; show final time in the progress label
          if (this.flythrough) {
            this.ui.updateFlythroughProgress(
              this.flythrough.totalTime,
              this.flythrough.totalTime,
              1
            );
          }
          if (this.flythrough && this.fpv) {
            this.fpv.updateGraphCursor(this.flythrough.totalTime, this.flythrough.totalTime);
          }
          this.ui.setFlythroughPlayState('stopped');
        },
        onFrame: frame => {
          if (this.fpv) {
            this.fpv.updateFrame(frame);
          }
        }
      })
      : null;

    this.locationService = new LocationService({
      onStatus: message => this.showStatus(message),
      onError: message => this.onError(message),
      onPending: isPending => {
        if (isPending) {
          this.ui.showToast('Please wait, finding your location', 'info', {
            id: this.locationToastId,
            persistent: true
          });
          return;
        }

        this.ui.hideToast(this.locationToastId);
      },
      onLocated: location => {
        this.ui.hideToast(this.locationToastId);
        this.mapController.showUserLocation(location.lat, location.lng, location.accuracy);
        const accText = location.accuracy && Number.isFinite(location.accuracy)
          ? ` (accuracy approx. ${Math.round(location.accuracy)} m)`
          : '';
        this.showStatus(`Location updated${accText}`);
      }
    });

    this.kmzExporter = new ExportKmz({
      onStatus: message => this.showStatus(message),
      onExported: message => this.ui.showToast(message, 'success'),
      onError: message => this.onError(message)
    });
    this.elevationService = typeof ElevationService === 'function'
      ? new ElevationService({ onError: message => this.showStatus(message) })
      : null;
    this.heightAboveGroundByWaypointId = new Map();
    this.heightAboveGroundByPoiId = new Map();
    this.waypointGroundElevationById = new Map();
    this.takeoffGroundElevation = null;
    this.hagRefreshTimer = null;
    this.hagRefreshToken = 0;
    this.storage = new PersistentStorage({
      onStatus: message => this.showStatus(message),
      onError: message => this.onError(message)
    });
    this.lastLoadedMissionLocation = this.storage.getLastLoadedMissionLocation();
    this.lastLoadedMissionFolder = this.lastLoadedMissionLocation.folderPath || '';
    this.lastLoadedMissionRootLabel = this.lastLoadedMissionLocation.rootLabel || '';

    if (typeof window !== 'undefined') {
      window.__djiMissionPlannerDebug = window.__djiMissionPlannerDebug || {};
      window.__djiMissionPlannerDebug.getStorageContext = async () => this.storage.getDebugContext();
    }

    this.bindMapEvents();
    this.bindUIEvents();
    this.applyDroneConfiguration(false);
    this.setMode('select');
    this.renderList();
    this.updateStats();
    this.showStatus(this.storage.getDescription());

    this.locateUser();
  }

  // Public methods

  get waypoints() {
    return this.mission.waypoints;
  }

  get pois() {
    return this.mission.pois;
  }

  get isMobileScreen() {
    return document.documentElement.classList.contains('screen-sm');
  }

  /**
   * Updates the status bar text and fires the onStatus callback if set.
   *
   * @param {string} message
   *
   * @returns {Object}
   */
  showStatus(message) {
    this.ui.setStatus(message);

    if (this.onStatus) {
      this.onStatus(message);
    }
  }

  /**
   * Returns the active drone profile object based on the current UI selection.
   *
   * @returns {Object}
   */
  getActiveDroneConfig() {
    const selectedProfileId = this.ui && typeof this.ui.getDroneProfileId === 'function'
      ? this.ui.getDroneProfileId()
      : 'air3s';

    if (selectedProfileId === 'custom') {
      const customHfov = this.ui && typeof this.ui.getCameraHfov === 'function'
        ? this.ui.getCameraHfov()
        : 82;
      const safeHfov = Number.isFinite(customHfov)
        ? Math.min(140, Math.max(30, customHfov))
        : 82;
      return {
        id: 'custom',
        label: 'Custom Camera',
        hfovDeg: safeHfov,
        aspect: 16 / 9,
        droneEnumValue: 77,
        droneSubEnumValue: 0
      };
    }

    return this.droneProfiles[selectedProfileId] || this.droneProfiles.air3s;
  }

  /**
   * Applies the selected drone profile to the FPV and flythrough controllers.
   *
   * @param {boolean} showFeedback [default: true]
   */
  applyDroneConfiguration(showFeedback = true) {
    this.activeDroneConfig = this.getActiveDroneConfig();

    if (this.fpv && typeof this.fpv.setDroneConfig === 'function') {
      this.fpv.setDroneConfig(this.activeDroneConfig);
    }
    if (this.flythrough && typeof this.flythrough.setDroneConfig === 'function') {
      this.flythrough.setDroneConfig(this.activeDroneConfig);
    }

    if (showFeedback && this.activeDroneConfig) {
      const droneName = this.activeDroneConfig.label || 'DJI Air 3S';
      this.showStatus(`Drone profile set: ${droneName}`);
    }
  }

  /**
   * Propagates a default speed change to all waypoints that were still at the previous default.
   */
  handleDefaultSpeedChange() {
    const previousDefaultSpeed = this.currentMissionDefaultSpeedMps;
    const nextDefaultSpeed = this.ui.getDefaultSpeed();
    if (!Number.isFinite(nextDefaultSpeed)) {
      return;
    }

    const speedChanged = !Number.isFinite(previousDefaultSpeed)
      || Math.abs(nextDefaultSpeed - previousDefaultSpeed) > 0.0001;

    if (speedChanged && Number.isFinite(previousDefaultSpeed)) {
      this.waypoints.forEach(waypoint => {
        if (Math.abs(waypoint.speed - previousDefaultSpeed) <= 0.01) {
          waypoint.speed = nextDefaultSpeed;
        }
      });

      this.syncFlythroughMission();
      this.renderList();
      if (this.selectedId && this.selectedType) {
        this.showDetail(this.selectedId, this.selectedType);
      }
    }

    this.currentMissionDefaultSpeedMps = nextDefaultSpeed;
  }

  /**
   * Sets every waypoint's speed to the current default speed value.
   */
  applyDefaultSpeedToAllWaypoints() {
    if (this.waypoints.length === 0) {
      this.showStatus('No waypoints to update.');
      return;
    }

    const speed = this.ui.getDefaultSpeed();
    if (!Number.isFinite(speed) || speed <= 0) {
      this.showStatus('Enter a valid default speed in km/h.');
      return;
    }

    this.waypoints.forEach(waypoint => {
      waypoint.speed = speed;
    });

    this.syncFlythroughMission();
    this.renderList();
    this.updateStats();
    if (this.selectedId && this.selectedType) {
      this.showDetail(this.selectedId, this.selectedType);
    }
    this.showStatus(`Applied ${Math.round(speed * 3.6)} km/h speed to ${this.waypoints.length} waypoints.`);

  }
  // ── Mixin method groups ─────────────────────────────────────────
  // Methods are defined in separate files and mixed in below.
  // Load order in HTML: AppMapHandlers → AppMission → AppSelection
  //   → AppDetail → AppSaveLoad → AppUIEvents → App.js
}

// Mix method groups into App.prototype
// Each const is defined in the corresponding source file loaded before this one.
Object.assign(
  App.prototype,
  AppMapHandlers,
  AppMission,
  AppSelection,
  AppTerrain,
  AppDetailRender,
  AppDetail,
  AppExport,
  AppSave,
  AppLoad,
  AppLoadPath,
  AppUIEvents
);
