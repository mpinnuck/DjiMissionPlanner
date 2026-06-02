class MissionSerializer {
  static snapshot({ mission, settings = null, ui = null }) {
    const missionSettings = settings || (ui && typeof ui.getMissionSettings === 'function'
      ? ui.getMissionSettings()
      : {});

    return {
      version: 1,
      savedAt: Date.now(),
      settings: missionSettings,
      counters: {
        waypoint: mission.wpCounter,
        poi: mission.poiCounter
      },
      waypoints: mission.waypoints.map(wp => ({
        id: wp.id,
        lat: wp.lat,
        lng: wp.lng,
        alt: wp.alt,
        speed: wp.speed,
        heading: wp.heading,
        gimbalPitch: wp.gimbalPitch,
        poiId: wp.poiId || null
      })),
      pois: mission.pois.map(poi => ({
        id: poi.id,
        lat: poi.lat,
        lng: poi.lng,
        alt: poi.alt,
        name: poi.name
      }))
    };
  }

  static stringify(context) {
    return JSON.stringify(this.snapshot(context), null, 2);
  }

  static parse(jsonText) {
    let parsed;
    try {
      parsed = JSON.parse(jsonText);
    } catch (error) {
      throw new Error('Invalid mission JSON.');
    }

    if (!parsed || typeof parsed !== 'object') {
      throw new Error('Mission JSON root must be an object.');
    }

    const state = {
      version: Number.isFinite(parsed.version) ? parsed.version : 1,
      settings: this.normalizeSettings(parsed.settings),
      counters: this.normalizeCounters(parsed.counters),
      waypoints: this.normalizeWaypoints(parsed.waypoints),
      pois: this.normalizePois(parsed.pois)
    };

    return state;
  }

  static normalizeSettings(settings) {
    const source = settings && typeof settings === 'object' ? settings : {};
    const validRcLostActions = new Set(['goContinue', 'goBack']);
    return {
      missionName: typeof source.missionName === 'string' && source.missionName.trim() ? source.missionName : 'Mission',
      defaultAltitude: Number.isFinite(source.defaultAltitude) ? source.defaultAltitude : 50,
      defaultSpeed: Number.isFinite(source.defaultSpeed) ? source.defaultSpeed : 8,
      finishAction: typeof source.finishAction === 'string' && source.finishAction ? source.finishAction : 'goHome',
      rcLostAction: typeof source.rcLostAction === 'string' && validRcLostActions.has(source.rcLostAction)
        ? source.rcLostAction
        : 'goContinue',
      headingMode: typeof source.headingMode === 'string' && source.headingMode ? source.headingMode : 'followWayline'
    };
  }

  static normalizeCounters(counters) {
    const source = counters && typeof counters === 'object' ? counters : {};
    return {
      waypoint: Number.isInteger(source.waypoint) && source.waypoint >= 0 ? source.waypoint : 0,
      poi: Number.isInteger(source.poi) && source.poi >= 0 ? source.poi : 0
    };
  }

  static normalizeWaypoints(waypoints) {
    if (!Array.isArray(waypoints)) {
      return [];
    }

    return waypoints
      .filter(item => item && typeof item === 'object')
      .map((wp, index) => {
        const id = typeof wp.id === 'string' && wp.id ? wp.id : `wp_${index + 1}`;
        return {
          id,
          lat: Number.isFinite(wp.lat) ? wp.lat : 0,
          lng: Number.isFinite(wp.lng) ? wp.lng : 0,
          alt: Number.isFinite(wp.alt) ? wp.alt : 50,
          speed: Number.isFinite(wp.speed) ? wp.speed : 8,
          heading: Number.isFinite(wp.heading) ? wp.heading : 0,
          gimbalPitch: Number.isFinite(wp.gimbalPitch) ? wp.gimbalPitch : 0,
          poiId: typeof wp.poiId === 'string' && wp.poiId ? wp.poiId : null
        };
      });
  }

  static normalizePois(pois) {
    if (!Array.isArray(pois)) {
      return [];
    }

    return pois
      .filter(item => item && typeof item === 'object')
      .map((poi, index) => {
        const id = typeof poi.id === 'string' && poi.id ? poi.id : `poi_${index + 1}`;
        return {
          id,
          lat: Number.isFinite(poi.lat) ? poi.lat : 0,
          lng: Number.isFinite(poi.lng) ? poi.lng : 0,
          alt: Number.isFinite(poi.alt) ? poi.alt : 0,
          name: typeof poi.name === 'string' && poi.name.trim() ? poi.name : `POI ${index + 1}`
        };
      });
  }
}
