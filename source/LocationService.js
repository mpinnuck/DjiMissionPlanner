class LocationService {
  constructor(options) {
    this.onStatus = options.onStatus;
    this.onLocated = options.onLocated;
    this.onError = options.onError;
  }

  requestPosition(requestOptions, onSuccess, onFailure) {
    navigator.geolocation.getCurrentPosition(onSuccess, onFailure, requestOptions);
  }

  getContextError() {
    if (window.location.protocol === 'file:') {
      return 'Location requires a secure page. This app was opened as a local file, so run it from localhost or HTTPS instead.';
    }

    if (!window.isSecureContext) {
      return 'Location requires a secure page. Run this app from localhost or HTTPS.';
    }

    return null;
  }

  locateUser() {
    if (!('geolocation' in navigator)) {
      const msg = 'Geolocation is not supported by this browser.';
      this.onStatus(msg);
      this.onError(msg);
      return;
    }

    const contextError = this.getContextError();
    if (contextError) {
      this.onStatus(contextError);
      this.onError(contextError);
      return;
    }

    this.onStatus('Detecting current location...');

    this.requestPosition(
      {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 30000
      },
      pos => {
        const location = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy
        };
        this.onLocated(location);
      },
      err => {
        if (err.code === err.POSITION_UNAVAILABLE || err.code === err.TIMEOUT) {
          this.onStatus('High-accuracy location unavailable, retrying with network positioning...');
          this.requestPosition(
            {
              enableHighAccuracy: false,
              timeout: 10000,
              maximumAge: 300000
            },
            retryPos => {
              const location = {
                lat: retryPos.coords.latitude,
                lng: retryPos.coords.longitude,
                accuracy: retryPos.coords.accuracy
              };
              this.onLocated(location);
            },
            retryErr => {
              this.handleLocationError(retryErr);
            }
          );
          return;
        }

        this.handleLocationError(err);
      }
    );
  }

  handleLocationError(err) {
    let msg = 'Unable to get your location.';
    if (err.code === err.PERMISSION_DENIED) {
      msg = 'Location permission denied. Enable location access in browser settings.';
    } else if (err.code === err.POSITION_UNAVAILABLE) {
      msg = 'Location provider is unavailable. On macOS, check System Settings > Privacy & Security > Location Services, ensure your browser is allowed, and try with Wi-Fi enabled.';
    } else if (err.code === err.TIMEOUT) {
      msg = 'Location request timed out. Try again in an open area.';
    }

    const contextError = this.getContextError();
    if (contextError) {
      msg = contextError;
    }

    this.onStatus(msg);
    this.onError(msg);
  }
}
