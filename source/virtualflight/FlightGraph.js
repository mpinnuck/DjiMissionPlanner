class FlightGraph {
  constructor(options = {}) {
    this._overlay = options.overlayElement || null;
    this._canvas = options.canvasElement || null;
    this._data = null;
    this._visible = false;
  }

  get isVisible() {
    return this._visible;
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

    if (Number.isFinite(totalTime) && totalTime > 0) {
      this._data.totalTime = totalTime;
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
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, rect.width, rect.height);

    const padLeft = 38;
    const padRight = 54;
    const cursorRailTop = 4;
    const cursorRailHeight = 22;
    const cursorRailGap = 8;
    const padTop = cursorRailTop + cursorRailHeight + cursorRailGap;
    const padBottom = 24;
    const plotW = Math.max(10, rect.width - padLeft - padRight);
    const plotH = Math.max(10, rect.height - padTop - padBottom);

    const data = this._data;
    const totalTime = Math.max(1, data.totalTime);
    const rawAltRange = data.maxAlt - data.minAlt;
    const rawSpeedRange = data.maxSpeed - data.minSpeed;
    const safeAltRange = Math.max(1, rawAltRange);
    const safeSpeedRange = Math.max(1, rawSpeedRange);

    const xAt = t => padLeft + (Math.max(0, Math.min(totalTime, t)) / totalTime) * plotW;
    const yAltAt = alt => {
      if (rawAltRange < 0.01) {
        return padTop + (plotH * 0.5);
      }
      return padTop + (1 - (alt - data.minAlt) / safeAltRange) * plotH;
    };
    const ySpeedAt = speed => {
      // Keep near-constant speed traces visible instead of pinning to the x-axis.
      if (rawSpeedRange < 0.5) {
        return padTop + (plotH * 0.5);
      }
      return padTop + (1 - (speed - data.minSpeed) / safeSpeedRange) * plotH;
    };

    const axisTickCount = 4;
    for (let i = 0; i <= axisTickCount; i += 1) {
      const ratio = i / axisTickCount;
      const y = padTop + (ratio * plotH);

      // Subtle horizontal guide lines for coarse scale readability.
      ctx.strokeStyle = 'rgba(255,255,255,0.10)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(padLeft, y);
      ctx.lineTo(padLeft + plotW, y);
      ctx.stroke();

      // Altitude scale (left axis, cyan).
      const altValue = data.maxAlt - ((data.maxAlt - data.minAlt) * ratio);
      ctx.strokeStyle = 'rgba(0, 212, 255, 0.85)';
      ctx.beginPath();
      ctx.moveTo(padLeft - 4, y);
      ctx.lineTo(padLeft, y);
      ctx.stroke();
      ctx.font = '10px Barlow, sans-serif';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(0, 212, 255, 0.95)';
      ctx.fillText(`${Math.round(altValue)}`, padLeft - 6, y);

      // Speed scale (right axis, amber).
      const speedValue = data.maxSpeed - ((data.maxSpeed - data.minSpeed) * ratio);
      ctx.strokeStyle = 'rgba(240, 165, 0, 0.85)';
      ctx.beginPath();
      ctx.moveTo(padLeft + plotW, y);
      ctx.lineTo(padLeft + plotW + 4, y);
      ctx.stroke();
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(240, 165, 0, 0.95)';
      ctx.fillText(`${Math.round(speedValue)}`, padLeft + plotW + 6, y);
    }

    const sampleAtTime = t => {
      if (!Array.isArray(data.points) || data.points.length === 0) {
        return { alt: 0, speedKmh: 0, time: 0 };
      }

      const clampedT = Math.max(0, Math.min(totalTime, Number.isFinite(t) ? t : 0));
      if (data.points.length === 1) {
        return {
          alt: data.points[0].alt,
          speedKmh: data.points[0].speedKmh,
          time: clampedT
        };
      }

      for (let i = 1; i < data.points.length; i += 1) {
        const left = data.points[i - 1];
        const right = data.points[i];
        if (clampedT <= right.t) {
          const span = Math.max(0.000001, right.t - left.t);
          const alpha = Math.max(0, Math.min(1, (clampedT - left.t) / span));
          return {
            alt: left.alt + (right.alt - left.alt) * alpha,
            speedKmh: left.speedKmh + (right.speedKmh - left.speedKmh) * alpha,
            time: clampedT
          };
        }
      }

      const last = data.points[data.points.length - 1];
      return { alt: last.alt, speedKmh: last.speedKmh, time: clampedT };
    };

    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padLeft, padTop);
    ctx.lineTo(padLeft, padTop + plotH);
    ctx.lineTo(padLeft + plotW, padTop + plotH);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(0, 212, 255, 0.95)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    data.points.forEach((point, index) => {
      const x = xAt(point.t);
      const y = yAltAt(point.alt);
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    ctx.strokeStyle = 'rgba(240, 165, 0, 0.95)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    data.points.forEach((point, index) => {
      const x = xAt(point.t);
      const y = ySpeedAt(point.speedKmh);
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    const cursorX = xAt(cursorTime);
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cursorX, cursorRailTop);
    ctx.lineTo(cursorX, padTop + plotH);
    ctx.stroke();

    const formatTime = seconds => {
      const safe = Math.max(0, Math.round(seconds));
      const mm = Math.floor(safe / 60);
      const ss = safe % 60;
      return `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
    };

    const xTickStepSeconds = 30;
    const pixelsPer30s = (plotW / totalTime) * xTickStepSeconds;
    const minLabelSpacingPx = 36;
    const labelEveryN = Math.max(1, Math.ceil(minLabelSpacingPx / Math.max(1, pixelsPer30s)));
    const endTimeLabelX = padLeft + plotW - 36;
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
      const x = xAt(t);

      ctx.beginPath();
      ctx.moveTo(x, padTop + plotH);
      ctx.lineTo(x, padTop + plotH + 4);
      ctx.stroke();

      if (tickIndex % labelEveryN === 0) {
        const wouldOverlapEndTime = x >= (endTimeLabelX - endTimeLabelSafeGap);
        if (!wouldOverlapEndTime) {
          ctx.fillText(formatTime(t), x, padTop + plotH + 6);
        }
      }
    }

    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('Time', 4, padTop + plotH + 14);
    ctx.fillText('00:00', padLeft - 4, padTop + plotH + 14);
    ctx.fillText(formatTime(totalTime), padLeft + plotW - 36, padTop + plotH + 14);

    const sample = sampleAtTime(cursorTime);
    const readout = `${Math.round(sample.alt)}m   ${Math.round(sample.speedKmh)}km/h   ${formatTime(sample.time)}`;
    ctx.font = '12px Barlow, sans-serif';
    const readoutPaddingX = 8;
    const readoutW = ctx.measureText(readout).width + (readoutPaddingX * 2);
    const readoutH = 18;
    const readoutX = Math.min(
      padLeft + plotW - readoutW,
      Math.max(padLeft, cursorX - (readoutW / 2))
    );
    const readoutY = cursorRailTop + 14;

    ctx.fillStyle = 'rgba(5, 18, 28, 0.86)';
    ctx.fillRect(readoutX, readoutY - 12, readoutW, readoutH);
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1;
    ctx.strokeRect(readoutX, readoutY - 12, readoutW, readoutH);
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.fillText(readout, readoutX + readoutPaddingX, readoutY + 1);
  }
}
