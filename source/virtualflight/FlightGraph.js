class FlightGraph {
  constructor(options = {}) {
    this._overlay = options.overlayElement || null;
    this._canvas = options.canvasElement || null;
    this._offscreenCanvas = document.createElement('canvas');
    this._staticDrawn = false;
    this._layout = null;
    this._scaleFns = null;
    this._data = null;
    this._visible = false;
  }

  // Public methods
  get isVisible() {
    return this._visible;
  }

  get overlayElement() {
    return this._overlay;
  }

  buildData({ waypoints, mission }) {
    if (!Array.isArray(waypoints) || waypoints.length < 2 || !mission || typeof mission.haversine !== 'function') {
      return null;
    }

    const points = [];
    let elapsed = 0;

    const first = waypoints[0];
    points.push({
      t: 0,
      alt: Number.isFinite(Number(first.alt)) ? Number(first.alt) : 0,
      speedKmh: Math.round((Number.isFinite(Number(first.speed)) ? Number(first.speed) : 8) * 3.6)
    });

    for (let i = 1; i < waypoints.length; i += 1) {
      const prev = waypoints[i - 1];
      const curr = waypoints[i];
      const segmentDistance = mission.haversine(prev.lat, prev.lng, curr.lat, curr.lng);
      const prevSpeed = Number(prev.speed);
      const segmentSpeed = Number.isFinite(prevSpeed) && prevSpeed > 0 ? prevSpeed : 1;
      elapsed += segmentDistance / segmentSpeed;

      const speed = Number(curr.speed);
      points.push({
        t: elapsed,
        alt: Number.isFinite(Number(curr.alt)) ? Number(curr.alt) : 0,
        speedKmh: Math.round((Number.isFinite(speed) && speed > 0 ? speed : segmentSpeed) * 3.6)
      });
    }

    const alts = points.map(point => point.alt);
    const speeds = points.map(point => point.speedKmh);

    return {
      points,
      totalTime: elapsed,
      minAlt: Math.min(...alts),
      maxAlt: Math.max(...alts),
      minSpeed: Math.min(...speeds),
      maxSpeed: Math.max(...speeds)
    };
  }

  show({ waypoints, mission, cursorTime = 0 }) {
    if (!this._overlay || !this._canvas) {
      return;
    }

    const data = this.buildData({ waypoints, mission });
    if (!data) {
      return;
    }

    this._data = data;
    this._staticDrawn = false;
    this._overlay.style.display = 'block';
    this._visible = true;
    this.draw(cursorTime);
  }

  hide() {
    if (!this._overlay) {
      return;
    }
    this._overlay.style.display = 'none';
    this._visible = false;
  }

  refresh({ waypoints, mission, cursorTime = 0 }) {
    if (!this._visible) {
      return;
    }
    this.show({ waypoints, mission, cursorTime });
  }

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
  }

  // Private members

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

  _drawAxes(ctx, layout) {
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(layout.padLeft, layout.padTop);
    ctx.lineTo(layout.padLeft, layout.padTop + layout.plotH);
    ctx.lineTo(layout.padLeft + layout.plotW, layout.padTop + layout.plotH);
    ctx.stroke();
  }

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

  _drawStaticGraph(ctx, layout, scaleFns, data, totalTime) {
    this._drawGrid(ctx, layout, data);
    this._drawAxes(ctx, layout);
    this._drawAltitudeLine(ctx, scaleFns, data);
    this._drawSpeedLine(ctx, scaleFns, data);
    this._drawXAxis(ctx, layout, scaleFns, totalTime);
  }

  _formatTime(seconds) {
    const safe = Math.max(0, Math.round(seconds));
    const mm = Math.floor(safe / 60);
    const ss = safe % 60;
    return `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
  }

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
      return { alt: right.alt, speedKmh: right.speedKmh, time: clampedT };
    }

    const span = Math.max(0.000001, right.t - left.t);
    const alpha = Math.max(0, Math.min(1, (clampedT - left.t) / span));
    return {
      alt: left.alt + (right.alt - left.alt) * alpha,
      speedKmh: left.speedKmh + (right.speedKmh - left.speedKmh) * alpha,
      time: clampedT
    };
  }

  _drawCursor(ctx, layout, scaleFns, cursorTime) {
    const cursorX = scaleFns.xAt(cursorTime);
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cursorX, layout.cursorRailTop);
    ctx.lineTo(cursorX, layout.padTop + layout.plotH);
    ctx.stroke();

    const sample = this._sampleAtTime(cursorTime);
    const readout = `${Math.round(sample.alt)}m   ${Math.round(sample.speedKmh)}km/h   ${this._formatTime(sample.time)}`;
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
