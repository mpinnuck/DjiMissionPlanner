/**
 * LocationService.js
 * Wraps the browser Geolocation API with caching and fallback.
 *
 * Responsibilities:
 *  - locateUser: requests the current position using a multi-stage strategy
 *    (watch → high-accuracy → low-accuracy fallback)
 *  - Caches the last known location in IndexedDB for reuse across sessions
 *    (used on macOS where CoreLocation has no GPS hardware)
 *  - Fires onPending, onLocated, onStatus, onError callbacks
 *  - getContextError: returns an error message if geolocation is unavailable
 *    (non-secure context, unsupported browser, etc.)
 */
class LocationService {
  constructor(options) {
    this.onStatus = options.onStatus;
    this.onLocated = options.onLocated;
    this.onError = options.onError;
    this.onPending = options.onPending || null;
    this.watchId = null;
    this.locationCacheKey = 'djiMissionPlanner:lastKnownLocation';
  }

  // Public methods

  setPending(isPending) {
    if (typeof this.onPending === 'function') {
      this.onPending(isPending);
    }
  }

  requestPosition(requestOptions, onSuccess, onFailure) {
    navigator.geolocation.getCurrentPosition(onSuccess, onFailure, requestOptions);
  }

  clearWatch() {
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
  }

  emitLocation(pos) {
    this.setPending(false);
    const location = {
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      accuracy: pos.coords.accuracy
    };
    this.saveLastKnownLocation(location);
    this.onLocated(location);
  }

  saveLastKnownLocation(location) {
    try {
      const payload = {
        lat: location.lat,
        lng: location.lng,
        accuracy: location.accuracy,
        timestamp: Date.now()
      };
      window.localStorage.setItem(this.locationCacheKey, JSON.stringify(payload));
    } catch (error) {
      // Ignore storage failures (private mode/quota/security restrictions).
    }
  }

  getLastKnownLocation() {
    try {
      const raw = window.localStorage.getItem(this.locationCacheKey);
      if (!raw) {
        return null;
      }

      const parsed = JSON.parse(raw);
      if (!parsed || !Number.isFinite(parsed.lat) || !Number.isFinite(parsed.lng)) {
        return null;
      }

      return {
        lat: parsed.lat,
        lng: parsed.lng,
        accuracy: Number.isFinite(parsed.accuracy) ? parsed.accuracy : null,
        timestamp: Number.isFinite(parsed.timestamp) ? parsed.timestamp : null
      };
    } catch (error) {
      return null;
    }
  }

  requestWatchFallback(onSuccess, onFailure) {
    this.clearWatch();

    let settled = false;
    const finishSuccess = pos => {
      if (settled) {
        return;
      }
      settled = true;
      this.clearWatch();
      onSuccess(pos);
    };

    const finishFailure = err => {
      if (settled) {
        return;
      }
      settled = true;
      this.clearWatch();
      onFailure(err);
    };

    const watchTimeout = window.setTimeout(() => {
      finishFailure({
        code: 3,
        PERMISSION_DENIED: 1,
        POSITION_UNAVAILABLE: 2,
        TIMEOUT: 3,
        message: 'Watch fallback timed out without a location fix.'
      });
    }, 20000);

    this.watchId = navigator.geolocation.watchPosition(
      pos => {
        window.clearTimeout(watchTimeout);
        finishSuccess(pos);
      },
      err => {
        window.clearTimeout(watchTimeout);
        finishFailure(err);
      },
      {
        enableHighAccuracy: false,
        timeout: 12000,
        maximumAge: 0
      }
    );
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
      this.setPending(false);
      const msg = 'Geolocation is not supported by this browser.';
      this.onStatus(msg);
      this.onError(msg);
      return;
    }

    const contextError = this.getContextError();
    if (contextError) {
      this.setPending(false);
      this.onStatus(contextError);
      this.onError(contextError);
      return;
    }

    this.setPending(true);
    this.onStatus('Detecting current location...');
    this.clearWatch();

    // Stage 1: quick cached/network position first to avoid provider cold-start failures.
    this.requestPosition(
      {
        enableHighAccuracy: false,
        timeout: 2500,
        maximumAge: 300000
      },
      pos => {
        this.emitLocation(pos);
      },
      () => {
        // Stage 2: high-accuracy fix.
        this.requestPosition(
          {
            enableHighAccuracy: true,
            timeout: 12000,
            maximumAge: 30000
          },
          pos => {
            this.emitLocation(pos);
          },
          err => {
            if (err.code === err.POSITION_UNAVAILABLE || err.code === err.TIMEOUT) {
              this.onStatus('High-accuracy location unavailable, retrying with network positioning...');

              // Stage 3: low-accuracy getCurrentPosition fallback.
              this.requestPosition(
                {
                  enableHighAccuracy: false,
                  timeout: 12000,
                  maximumAge: 300000
                },
                retryPos => {
                  this.emitLocation(retryPos);
                },
                retryErr => {
                  if (retryErr.code === retryErr.POSITION_UNAVAILABLE || retryErr.code === retryErr.TIMEOUT) {
                    this.onStatus('Location still unavailable, starting watch fallback...');

                    // Stage 4: short-lived watch fallback can recover when one-shot calls fail.
                    this.requestWatchFallback(
                      watchPos => {
                        this.emitLocation(watchPos);
                      },
                      watchErr => {
                        this.handleLocationError(watchErr);
                      }
                    );
                    return;
                  }

                  this.handleLocationError(retryErr);
                }
              );
              return;
            }

            this.handleLocationError(err);
          }
        );
      }
    );
  }

  handleLocationError(err) {
    this.setPending(false);
    const cachedLocation = this.getLastKnownLocation();
    if (cachedLocation) {
      this.onLocated(cachedLocation);
      const cachedAgeText = cachedLocation.timestamp
        ? `${Math.round((Date.now() - cachedLocation.timestamp) / 60000)} min old`
        : 'age unknown';
      this.onStatus(`Live location unavailable, using last known position (${cachedAgeText}).`);
      return;
    }

    let msg = 'Unable to get your location.';
    if (err.code === err.PERMISSION_DENIED) {
      msg = 'Location permission denied. Enable location access in browser settings.';
    } else if (err.code === err.POSITION_UNAVAILABLE) {
      msg = 'Location provider is unavailable. On macOS, check System Settings > Privacy & Security > Location Services, ensure your browser is allowed, and try with Wi-Fi enabled.';
    } else if (err.code === err.TIMEOUT) {
      msg = 'Location request timed out. Try again in an open area.';
    }

    this.onStatus(msg);
    this.onError(msg);
  }
}
