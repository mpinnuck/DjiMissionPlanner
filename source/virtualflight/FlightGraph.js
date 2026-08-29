/**
 * FlightGraph.js
 * Canvas-based flight profile graph shown as an overlay on the map.
 * Displays altitude (ASL), height above ground (HAG), and speed over time
 * for the current mission, with a draggable time cursor linked to the flythrough.
 *
 * Responsibilities:
 *  - buildData: computes the graph data points from waypoints including
 *    dwell pauses at action waypoints (delegates to FlythroughController._actionsDwellTime)
 *  - show / hide / refresh / updateCursor / draw: lifecycle and render control
 *  - _computeLayout / _computeScaleFns: graph geometry and scale functions
 *  - _drawStaticGraph: renders grid, axes, altitude, HAG, and speed lines
 *    to an offscreen canvas for efficient cursor updates
 *  - _drawCursor: overlays the time cursor line and readout label
 *  - _sampleAtTime: interpolates alt/HAG/speed at an arbitrary time
 */
class FlightGraph {
  constructor(options = {}) {
    this._overlay = options.overlayElement || null;
    this._canvas = options.canvasElement || null;
    this.onScrub = typeof options.onScrub === 'function' ? options.onScrub : null;
    this._offscreenCanvas = document.createElement('canvas');
    this._staticDrawn = false;
    this._layout = null;
    this._scaleFns = null;
    this._data = null;
    this._visible = false;
    this._isPointerScrubbing = false;
    this._lastCursorTime = 0;

    this._bindInteractions();
  }

  // Public methods
  get isVisible() {
    return this._visible;
  }

  get overlayElement() {
    return this._overlay;
  }

  /**
   * Computes graph data points (alt, HAG, speed vs time) from the mission waypoints.
   *
   * @param {Object} options - Named options object.
   *
   * @returns {*}
   */
  buildData({ waypoints, mission, heightAboveGroundByWaypointId = null }) {
    if (!Array.isArray(waypoints) || waypoints.length < 2 || !mission || typeof mission.haversine !== 'function') {
      return null;
    }

    const resolveHag = waypoint => {
      if (!waypoint) {
        return null;
      }

      if (heightAboveGroundByWaypointId instanceof Map) {
        const value = Number(heightAboveGroundByWaypointId.get(waypoint.id));
        return Number.isFinite(value) ? value : null;
      }

      if (heightAboveGroundByWaypointId && typeof heightAboveGroundByWaypointId === 'object') {
        const value = Number(heightAboveGroundByWaypointId[waypoint.id]);
        return Number.isFinite(value) ? value : null;
      }

      return null;
    };

    const points = [];
    let elapsed = 0;

    const first = waypoints[0];
    const firstDwell = FlythroughController._actionsDwellTime(first.actions);
    const firstAlt   = Number.isFinite(Number(first.alt)) ? Number(first.alt) : 0;
    const firstSpeedKmh = Math.round((Number.isFinite(Number(first.speed)) ? Number(first.speed) : 8) * 3.6);

    if (firstDwell > 0) {
      // Drone is stationary at WP0 executing actions before first flight leg
      points.push({ t: 0, alt: firstAlt, hag: resolveHag(first), speedKmh: 0 });
      elapsed += firstDwell;
      points.push({ t: elapsed, alt: firstAlt, hag: resolveHag(first), speedKmh: firstSpeedKmh });
    } else {
      points.push({ t: 0, alt: firstAlt, hag: resolveHag(first), speedKmh: firstSpeedKmh });
    }

    for (let i = 1; i < waypoints.length; i += 1) {
      const prev = waypoints[i - 1];
      const curr = waypoints[i];
      const segmentDistance = mission.haversine(prev.lat, prev.lng, curr.lat, curr.lng);
      const prevSpeed = Number(prev.speed);
      const segmentSpeed = Number.isFinite(prevSpeed) && prevSpeed > 0 ? prevSpeed : 1;
      elapsed += segmentDistance / segmentSpeed;

      const dwell = FlythroughController._actionsDwellTime(curr.actions);
      const speed = Number(curr.speed);
      const currAlt = Number.isFinite(Number(curr.alt)) ? Number(curr.alt) : 0;
      const departureSpeedKmh = Math.round((Number.isFinite(speed) && speed > 0 ? speed : segmentSpeed) * 3.6);

      if (dwell > 0) {
        // Arrival: drone has stopped to execute actions (speed = 0)
        points.push({ t: elapsed, alt: currAlt, hag: resolveHag(curr), speedKmh: 0 });
        elapsed += dwell;
        // Departure: drone about to leave for next segment
        points.push({ t: elapsed, alt: currAlt, hag: resolveHag(curr), speedKmh: departureSpeedKmh });
      } else {
        points.push({ t: elapsed, alt: currAlt, hag: resolveHag(curr), speedKmh: departureSpeedKmh });
      }
    }

    const alts = points.map(point => point.alt);
    const hagValues = points
      .map(point => Number(point.hag))
      .filter(value => Number.isFinite(value));
    const altitudeScaleValues = hagValues.length > 0
      ? alts.concat(hagValues)
      : alts;
    const speeds = points.map(point => point.speedKmh);

    return {
      points,
      totalTime: elapsed,
      minAlt: Math.min(...altitudeScaleValues),
      maxAlt: Math.max(...altitudeScaleValues),
      hasHag: hagValues.length > 0,
      minSpeed: Math.min(...speeds),
      maxSpeed: Math.max(...speeds)
    };
  }

  /**
   * Shows the flight graph overlay for the given waypoints and renders the initial frame.
   *
   * @param {Object} options - Named options object.
   */
  show({ waypoints, mission, cursorTime = 0, heightAboveGroundByWaypointId = null }) {
    if (!this._overlay || !this._canvas) {
      return;
    }

    const data = this.buildData({ waypoints, mission, heightAboveGroundByWaypointId });
    if (!data) {
      return;
    }

    this._data = data;
    this._staticDrawn = false;
    this._overlay.style.display = 'block';
    this._visible = true;
    this.draw(cursorTime);
  }

  /**
   * Hides the flight graph overlay.
   */
  hide() {
    if (!this._overlay) {
      return;
    }
    this._overlay.style.display = 'none';
    this._visible = false;
  }

  /**
   * Re-renders the graph with updated waypoints if currently visible.
   *
   * @param {Object} options - Named options object.
   */
  refresh({ waypoints, mission, cursorTime = 0 }) {
    if (!this._visible) {
      return;
    }
    this.show({ waypoints, mission, cursorTime });
  }

  /**
   * Redraws the time cursor line and readout at the given playhead time.
   *
   * @param {*} currentTime
   * @param {*} totalTime
   */
  updateCursor(currentTime, totalTime) {
    if (!this._visible || !this._data) {
      return;
    }

    // Keep cursor scale aligned to the flythrough runtime timeline. Segment-based
    // totals from buildData can differ slightly due to interpolation/rounding.
    if (Number.isFinite(totalTime) && totalTime > 0) {
      const prevTotalTime = Number(this._data.totalTime) || 0;
      this._data.totalTime = totalTime;
      if (Math.abs(prevTotalTime - totalTime) > 0.001) {
        this._staticDrawn = false;
      }
    }
    this.draw(currentTime);
  }

  /**
   * Renders the complete graph to the canvas at the given cursor time.
   *
   * @param {number} cursorTime [default: 0]
   */
  draw(cursorTime = 0) {
    if (!this._visible || !this._canvas || !this._data) {
      return;
    }

    const canvas = this._canvas;
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return;
    }

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(rect.width * dpr);
    const h = Math.round(rect.height * dpr);

    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      this._staticDrawn = false;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    if (!this._staticDrawn) {
      this._layout = this._computeLayout(rect.width, rect.height);
      this._scaleFns = this._computeScaleFns(this._layout, this._data, this._data.totalTime);

      this._offscreenCanvas.width = w;
      this._offscreenCanvas.height = h;
      const offCtx = this._offscreenCanvas.getContext('2d');
      if (!offCtx) {
        return;
      }
      offCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      offCtx.clearRect(0, 0, rect.width, rect.height);
      this._drawStaticGraph(offCtx, this._layout, this._scaleFns, this._data, this._data.totalTime);
      this._staticDrawn = true;
    }

    ctx.clearRect(0, 0, rect.width, rect.height);
    ctx.drawImage(this._offscreenCanvas, 0, 0, w, h, 0, 0, rect.width, rect.height);
    this._drawCursor(ctx, this._layout, this._scaleFns, cursorTime);
    this._lastCursorTime = Number.isFinite(cursorTime) ? cursorTime : this._lastCursorTime;
  }

  /**
   * Binds pointer handlers for cursor scrubbing on the graph canvas.
   */
  _bindInteractions() {
    if (!this._canvas) {
      return;
    }

    this._canvas.addEventListener('pointerdown', event => {
      if (!this._visible || !this._data) {
        return;
      }

      this._isPointerScrubbing = true;
      if (typeof this._canvas.setPointerCapture === 'function') {
        this._canvas.setPointerCapture(event.pointerId);
      }
      event.preventDefault();
      this._handleScrubPointerEvent(event, 'start');
    });

    this._canvas.addEventListener('pointermove', event => {
      if (!this._isPointerScrubbing) {
        return;
      }
      event.preventDefault();
      this._handleScrubPointerEvent(event, 'update');
    });

    const finishScrub = event => {
      if (!this._isPointerScrubbing) {
        return;
      }

      this._isPointerScrubbing = false;
      if (typeof this._canvas.releasePointerCapture === 'function') {
        try {
          this._canvas.releasePointerCapture(event.pointerId);
        } catch (error) {
          // Ignore capture release failures from stale pointer IDs.
        }
      }
      event.preventDefault();
      this._handleScrubPointerEvent(event, 'end');
    };

    this._canvas.addEventListener('pointerup', finishScrub);
    this._canvas.addEventListener('pointercancel', finishScrub);
  }

  /**
   * Converts a pointer event into timeline time, redraws the cursor,
   * and publishes scrub events to the parent controller.
   *
   * @param {PointerEvent} event
   * @param {'start'|'update'|'end'} phase
   */
  _handleScrubPointerEvent(event, phase) {
    if (!this._layout || !this._data) {
      return;
    }

    const totalTime = Math.max(0, Number(this._data.totalTime) || 0);
    const cursorTime = this._timeAtClientX(event.clientX, totalTime);
    this.draw(cursorTime);

    if (this.onScrub) {
      const fraction = totalTime > 0
        ? Math.max(0, Math.min(1, cursorTime / totalTime))
        : 0;
      this.onScrub({
        time: cursorTime,
        totalTime,
        fraction,
        phase
      });
    }
  }

  /**
   * Resolve graph timeline time from viewport X coordinate.
   *
   * @param {number} clientX
   * @param {number} totalTime
   * @returns {number}
   */
  _timeAtClientX(clientX, totalTime) {
    if (!this._canvas || !this._layout || totalTime <= 0) {
      return 0;
    }

    const rect = this._canvas.getBoundingClientRect();
    const xPx = clientX - rect.left;
    const graphLeft = this._layout.padLeft;
    const graphRight = this._layout.padLeft + this._layout.plotW;
    const clampedX = Math.max(graphLeft, Math.min(graphRight, xPx));
    const ratio = (clampedX - graphLeft) / Math.max(1, this._layout.plotW);
    return ratio * totalTime;
  }

  // Private members

  /**
   * Compute layout.
   *
   * @param {*} width
   * @param {*} height
   *
   * @returns {Object}
   */
  _computeLayout(width, height) {
    const padLeft = 38;
    const padRight = 54;
    const cursorRailTop = 4;
    const cursorRailHeight = 22;
    const cursorRailGap = 8;
    const padTop = cursorRailTop + cursorRailHeight + cursorRailGap;
    const padBottom = 24;
    const plotW = Math.max(10, width - padLeft - padRight);
    const plotH = Math.max(10, height - padTop - padBottom);

    return {
      padLeft,
      padRight,
      padTop,
      padBottom,
      plotW,
      plotH,
      cursorRailTop,
      cursorRailHeight
    };
  }

  /**
   * Compute scale fns.
   *
   * @param {*} layout
   * @param {Object} data
   * @param {*} totalTimeInput
   *
   * @returns {number}
   */
  _computeScaleFns(layout, data, totalTimeInput) {
    const totalTime = Math.max(1, Number(totalTimeInput) || 0);
    const rawAltRange = data.maxAlt - data.minAlt;
    const rawSpeedRange = data.maxSpeed - data.minSpeed;
    const safeAltRange = Math.max(1, rawAltRange);
    const safeSpeedRange = Math.max(1, rawSpeedRange);

    const xAt = t => {
      const safeT = Number.isFinite(t) ? t : 0;
      return layout.padLeft + (Math.max(0, Math.min(totalTime, safeT)) / totalTime) * layout.plotW;
    };

    const yAltAt = alt => {
      if (rawAltRange < 0.01) {
        return layout.padTop + (layout.plotH * 0.5);
      }
      return layout.padTop + (1 - (alt - data.minAlt) / safeAltRange) * layout.plotH;
    };

    const ySpeedAt = speed => {
      if (rawSpeedRange < 0.5) {
        return layout.padTop + (layout.plotH * 0.5);
      }
      return layout.padTop + (1 - (speed - data.minSpeed) / safeSpeedRange) * layout.plotH;
    };

    return {
      totalTime,
      rawAltRange,
      rawSpeedRange,
      xAt,
      yAltAt,
      ySpeedAt
    };
  }

  /**
   * Draw grid.
   *
   * @param {HTMLElement} ctx
   * @param {*} layout
   * @param {Object} data
   */
  _drawGrid(ctx, layout, data) {
    const axisTickCount = 4;
    for (let i = 0; i <= axisTickCount; i += 1) {
      const ratio = i / axisTickCount;
      const y = layout.padTop + (ratio * layout.plotH);

      ctx.strokeStyle = 'rgba(255,255,255,0.10)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(layout.padLeft, y);
      ctx.lineTo(layout.padLeft + layout.plotW, y);
      ctx.stroke();

      const altValue = data.maxAlt - ((data.maxAlt - data.minAlt) * ratio);
      ctx.strokeStyle = 'rgba(0, 212, 255, 0.85)';
      ctx.beginPath();
      ctx.moveTo(layout.padLeft - 4, y);
      ctx.lineTo(layout.padLeft, y);
      ctx.stroke();
      ctx.font = '10px Barlow, sans-serif';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(0, 212, 255, 0.95)';
      ctx.fillText(`${Math.round(altValue)}`, layout.padLeft - 6, y);

      const speedValue = data.maxSpeed - ((data.maxSpeed - data.minSpeed) * ratio);
      ctx.strokeStyle = 'rgba(240, 165, 0, 0.85)';
      ctx.beginPath();
      ctx.moveTo(layout.padLeft + layout.plotW, y);
      ctx.lineTo(layout.padLeft + layout.plotW + 4, y);
      ctx.stroke();
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(240, 165, 0, 0.95)';
      ctx.fillText(`${Math.round(speedValue)}`, layout.padLeft + layout.plotW + 6, y);
    }
  }

  /**
   * Draw axes.
   *
   * @param {HTMLElement} ctx
   * @param {*} layout
   */
  _drawAxes(ctx, layout) {
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(layout.padLeft, layout.padTop);
    ctx.lineTo(layout.padLeft, layout.padTop + layout.plotH);
    ctx.lineTo(layout.padLeft + layout.plotW, layout.padTop + layout.plotH);
    ctx.stroke();
  }

  /**
   * Draw altitude line.
   *
   * @param {HTMLElement} ctx
   * @param {*} scaleFns
   * @param {Object} data
   */
  _drawAltitudeLine(ctx, scaleFns, data) {
    ctx.strokeStyle = 'rgba(0, 212, 255, 0.95)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    data.points.forEach((point, index) => {
      const x = scaleFns.xAt(point.t);
      const y = scaleFns.yAltAt(point.alt);
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }

  /**
   * Draw hag line.
   *
   * @param {HTMLElement} ctx
   * @param {*} scaleFns
   * @param {Object} data
   */
  _drawHagLine(ctx, scaleFns, data) {
    if (!data.hasHag) {
      return;
    }

    ctx.strokeStyle = 'rgba(46, 213, 115, 0.95)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    let hasSegment = false;

    data.points.forEach(point => {
      if (!Number.isFinite(point.hag)) {
        hasSegment = false;
        return;
      }

      const x = scaleFns.xAt(point.t);
      const y = scaleFns.yAltAt(point.hag);
      if (!hasSegment) {
        ctx.moveTo(x, y);
        hasSegment = true;
      } else {
        ctx.lineTo(x, y);
      }
    });

    ctx.stroke();
  }

  /**
   * Draw speed line.
   *
   * @param {HTMLElement} ctx
   * @param {*} scaleFns
   * @param {Object} data
   */
  _drawSpeedLine(ctx, scaleFns, data) {
    ctx.strokeStyle = 'rgba(240, 165, 0, 0.95)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    data.points.forEach((point, index) => {
      const x = scaleFns.xAt(point.t);
      const y = scaleFns.ySpeedAt(point.speedKmh);
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }

  /**
   * Draw x axis.
   *
   * @param {HTMLElement} ctx
   * @param {*} layout
   * @param {*} scaleFns
   * @param {*} totalTime
   */
  _drawXAxis(ctx, layout, scaleFns, totalTime) {
    const xTickStepSeconds = 30;
    const pixelsPer30s = (layout.plotW / Math.max(1, totalTime)) * xTickStepSeconds;
    const minLabelSpacingPx = 36;
    const labelEveryN = Math.max(1, Math.ceil(minLabelSpacingPx / Math.max(1, pixelsPer30s)));
    const endTimeLabelX = layout.padLeft + layout.plotW - 36;
    const endTimeLabelSafeGap = 44;

    ctx.strokeStyle = 'rgba(255,255,255,0.28)';
    ctx.lineWidth = 1;
    ctx.font = '10px Barlow, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.68)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    let tickIndex = 0;
    for (let t = xTickStepSeconds; t < totalTime; t += xTickStepSeconds) {
      tickIndex += 1;
      const x = scaleFns.xAt(t);

      ctx.beginPath();
      ctx.moveTo(x, layout.padTop + layout.plotH);
      ctx.lineTo(x, layout.padTop + layout.plotH + 4);
      ctx.stroke();

      if (tickIndex % labelEveryN === 0) {
        const wouldOverlapEndTime = x >= (endTimeLabelX - endTimeLabelSafeGap);
        if (!wouldOverlapEndTime) {
          ctx.fillText(this._formatTime(t), x, layout.padTop + layout.plotH + 6);
        }
      }
    }

    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('Time', 4, layout.padTop + layout.plotH + 14);
    ctx.fillText('00:00', layout.padLeft - 4, layout.padTop + layout.plotH + 14);
    ctx.fillText(this._formatTime(totalTime), layout.padLeft + layout.plotW - 36, layout.padTop + layout.plotH + 14);
  }

  /**
   * Draw legend.
   *
   * @param {HTMLElement} ctx
   * @param {*} layout
   * @param {Object} data
   */
  _drawLegend(ctx, layout, data) {
    const items = [
      { label: 'ALT', color: 'rgba(0, 212, 255, 0.95)' },
      ...(data.hasHag ? [{ label: 'HAG', color: 'rgba(46, 213, 115, 0.95)' }] : []),
      { label: 'SPD', color: 'rgba(240, 165, 0, 0.95)' }
    ];

    ctx.font = '10px Barlow, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';

    const itemGap = 8;
    const colorBox = 8;
    const labelGap = 4;
    const horizontalPadding = 8;
    const legendHeight = 16;
    const legendY = layout.padTop + layout.plotH - (legendHeight / 2) - 4;

    let contentWidth = 0;
    items.forEach((item, index) => {
      const itemWidth = colorBox + labelGap + ctx.measureText(item.label).width;
      contentWidth += itemWidth;
      if (index < items.length - 1) {
        contentWidth += itemGap;
      }
    });

    const legendWidth = contentWidth + (horizontalPadding * 2);
    const legendX = Math.max(layout.padLeft, layout.padLeft + layout.plotW - legendWidth);

    ctx.fillStyle = 'rgba(5, 18, 28, 0.72)';
    ctx.fillRect(legendX, legendY - (legendHeight / 2), legendWidth, legendHeight);
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 1;
    ctx.strokeRect(legendX, legendY - (legendHeight / 2), legendWidth, legendHeight);

    let cursorX = legendX + horizontalPadding;
    items.forEach((item, index) => {
      ctx.fillStyle = item.color;
      ctx.fillRect(cursorX, legendY - (colorBox / 2), colorBox, colorBox);
      cursorX += colorBox + labelGap;

      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ctx.fillText(item.label, cursorX, legendY);
      cursorX += ctx.measureText(item.label).width;

      if (index < items.length - 1) {
        cursorX += itemGap;
      }
    });
  }

  /**
   * Draw static graph.
   *
   * @param {HTMLElement} ctx
   * @param {*} layout
   * @param {*} scaleFns
   * @param {Object} data
   * @param {*} totalTime
   *
   * @returns {string}
   */
  _drawStaticGraph(ctx, layout, scaleFns, data, totalTime) {
    this._drawGrid(ctx, layout, data);
    this._drawAxes(ctx, layout);
    this._drawAltitudeLine(ctx, scaleFns, data);
    this._drawHagLine(ctx, scaleFns, data);
    this._drawSpeedLine(ctx, scaleFns, data);
    this._drawXAxis(ctx, layout, scaleFns, totalTime);
    this._drawLegend(ctx, layout, data);
  }

  /**
   * Format time.
   *
   * @param {number} seconds
   *
   * @returns {string}
   */
  _formatTime(seconds) {
    const safe = Math.max(0, Math.round(seconds));
    const mm = Math.floor(safe / 60);
    const ss = safe % 60;
    return `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
  }

  /**
   * Sample at time.
   *
   * @param {number} t
   *
   * @returns {Object}
   */
  _sampleAtTime(t) {
    const data = this._data;
    if (!data || !Array.isArray(data.points) || data.points.length === 0) {
      return { alt: 0, speedKmh: 0, time: 0 };
    }

    const totalTime = Math.max(1, data.totalTime);
    const clampedT = Math.max(0, Math.min(totalTime, Number.isFinite(t) ? t : 0));

    if (data.points.length === 1) {
      return {
        alt: data.points[0].alt,
        hag: data.points[0].hag,
        speedKmh: data.points[0].speedKmh,
        time: clampedT
      };
    }

    let low = 0;
    let high = data.points.length - 1;
    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const midPoint = data.points[mid];
      if (midPoint.t < clampedT) {
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }

    const rightIndex = Math.max(1, Math.min(data.points.length - 1, low));
    const left = data.points[rightIndex - 1];
    const right = data.points[rightIndex];

    if (clampedT >= right.t) {
      return {
        alt: right.alt,
        hag: right.hag,
        speedKmh: right.speedKmh,
        time: clampedT
      };
    }

    const span = Math.max(0.000001, right.t - left.t);
    const alpha = Math.max(0, Math.min(1, (clampedT - left.t) / span));

    const sampleHag = (() => {
      const leftHag = Number(left.hag);
      const rightHag = Number(right.hag);
      if (Number.isFinite(leftHag) && Number.isFinite(rightHag)) {
        return leftHag + (rightHag - leftHag) * alpha;
      }
      if (Number.isFinite(leftHag)) {
        return leftHag;
      }
      if (Number.isFinite(rightHag)) {
        return rightHag;
      }
      return null;
    })();

    return {
      alt: left.alt + (right.alt - left.alt) * alpha,
      hag: sampleHag,
      speedKmh: left.speedKmh + (right.speedKmh - left.speedKmh) * alpha,
      time: clampedT
    };
  }

  /**
   * Draw cursor.
   *
   * @param {HTMLElement} ctx
   * @param {*} layout
   * @param {*} scaleFns
   * @param {*} cursorTime
   */
  _drawCursor(ctx, layout, scaleFns, cursorTime) {
    const cursorX = scaleFns.xAt(cursorTime);
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cursorX, layout.cursorRailTop);
    ctx.lineTo(cursorX, layout.padTop + layout.plotH);
    ctx.stroke();

    const sample = this._sampleAtTime(cursorTime);
    const hagReadout = Number.isFinite(sample.hag)
      ? `   HAG ${Math.round(sample.hag)}m`
      : '';
    const readout = `${Math.round(sample.alt)}m${hagReadout}   ${Math.round(sample.speedKmh)}km/h   ${this._formatTime(sample.time)}`;
    ctx.font = '12px Barlow, sans-serif';
    const readoutPaddingX = 8;
    const readoutW = ctx.measureText(readout).width + (readoutPaddingX * 2);
    const readoutH = 18;
    const readoutX = Math.min(
      layout.padLeft + layout.plotW - readoutW,
      Math.max(layout.padLeft, cursorX - (readoutW / 2))
    );
    const readoutY = layout.cursorRailTop + 14;

    ctx.fillStyle = 'rgba(5, 18, 28, 0.86)';
    ctx.fillRect(readoutX, readoutY - 12, readoutW, readoutH);
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1;
    ctx.strokeRect(readoutX, readoutY - 12, readoutW, readoutH);
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.fillText(readout, readoutX + readoutPaddingX, readoutY + 1);
  }
}
