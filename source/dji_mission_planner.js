window.missionPlannerApp = new App({
  mapElementId: 'map',
  onStatus: message => {
    document.getElementById('sbStatus').textContent = message;
  },
  onError: message => alert(message)
});
