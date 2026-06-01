window.missionPlannerApp = new App({
  mapElementId: 'map',
  onError: message => alert(message)
});

window.exportMissionJson = () => window.missionPlannerApp.exportMissionJson();
window.importMissionJson = jsonText => window.missionPlannerApp.importMissionJson(jsonText);
