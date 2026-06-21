/**
 * dji_mission_planner.js
 * Application entry point.
 * Instantiates App with the map element ID and a global error handler.
 * Also exposes exportMissionJson / importMissionJson on window for
 * browser console debugging.
 * Loaded last — after all mixin files and App.js.
 */
window.missionPlannerApp = new App({
  mapElementId: 'map',
  onError: message => alert(message)
});

window.exportMissionJson = () => window.missionPlannerApp.exportMissionJson();
window.importMissionJson = jsonText => window.missionPlannerApp.importMissionJson(jsonText);
