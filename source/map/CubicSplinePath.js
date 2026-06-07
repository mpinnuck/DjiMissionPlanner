/**
 * CubicSplinePath
 *
 * Natural cubic spline (C2 continuous) through all waypoints.
 * Uses chord-length parameterization for stable sampling on uneven spacing.
 */
class CubicSplinePath {
  /**
   * @param {Array<{lat:number,lng:number}|[number,number]>} waypoints
   * @param {number} samplesPerSegment
   * @returns {Array<{lat:number,lng:number}>}
   */
  static build(waypoints, samplesPerSegment = 20) {
    const pts = Array.isArray(waypoints)
      ? waypoints.map(CubicSplinePath._normalizePoint)
      : [];
    const n = pts.length;

    if (n < 2) {
      return pts;
    }
    if (n === 2) {
      return CubicSplinePath._lerp(pts[0], pts[1], samplesPerSegment);
    }

    const h = new Array(n - 1);
    for (let i = 0; i < n - 1; i += 1) {
      h[i] = CubicSplinePath._chordLength(pts[i], pts[i + 1]);
      if (h[i] < 1e-10) {
        h[i] = 1e-10;
      }
    }

    const Mlat = CubicSplinePath._solveM(pts.map(p => p.lat), h);
    const Mlng = CubicSplinePath._solveM(pts.map(p => p.lng), h);

    const result = [];
    for (let i = 0; i < n - 1; i += 1) {
      const isLast = i === n - 2;
      const count = isLast ? samplesPerSegment + 1 : samplesPerSegment;

      for (let j = 0; j < count; j += 1) {
        const s = (j / samplesPerSegment) * h[i];
        result.push({
          lat: CubicSplinePath._evalSegment(s, pts[i].lat, pts[i + 1].lat, h[i], Mlat[i], Mlat[i + 1]),
          lng: CubicSplinePath._evalSegment(s, pts[i].lng, pts[i + 1].lng, h[i], Mlng[i], Mlng[i + 1])
        });
      }
    }

    return result;
  }

  static _normalizePoint(point) {
    if (Array.isArray(point)) {
      return { lat: Number(point[0]) || 0, lng: Number(point[1]) || 0 };
    }
    return { lat: Number(point.lat) || 0, lng: Number(point.lng) || 0 };
  }

  static _evalSegment(s, y0, y1, h, M0, M1) {
    const a = y0;
    const b = (y1 - y0) / h - (h * (2 * M0 + M1)) / 6;
    const c = M0 / 2;
    const d = (M1 - M0) / (6 * h);
    return a + s * (b + s * (c + s * d));
  }

  static _solveM(y, h) {
    const n = y.length;
    const m = n - 2;
    if (m <= 0) {
      return new Array(n).fill(0);
    }

    const a = new Array(m).fill(0);
    const b = new Array(m).fill(0);
    const c = new Array(m).fill(0);
    const d = new Array(m).fill(0);

    for (let i = 0; i < m; i += 1) {
      const k = i + 1;
      a[i] = h[k - 1];
      b[i] = 2 * (h[k - 1] + h[k]);
      c[i] = h[k];
      d[i] = 6 * ((y[k + 1] - y[k]) / h[k] - (y[k] - y[k - 1]) / h[k - 1]);
    }

    const cp = new Array(m).fill(0);
    const dp = new Array(m).fill(0);

    cp[0] = m > 1 ? c[0] / b[0] : 0;
    dp[0] = d[0] / b[0];

    for (let i = 1; i < m; i += 1) {
      const denom = b[i] - a[i] * cp[i - 1];
      cp[i] = i < m - 1 ? c[i] / denom : 0;
      dp[i] = (d[i] - a[i] * dp[i - 1]) / denom;
    }

    const Mint = new Array(m).fill(0);
    Mint[m - 1] = dp[m - 1];
    for (let i = m - 2; i >= 0; i -= 1) {
      Mint[i] = dp[i] - cp[i] * Mint[i + 1];
    }

    const M = new Array(n).fill(0);
    for (let i = 0; i < m; i += 1) {
      M[i + 1] = Mint[i];
    }
    return M;
  }

  static _chordLength(a, b) {
    const R = 6371000;
    const cosLat = Math.cos(((a.lat + b.lat) * 0.5 * Math.PI) / 180);
    const dx = ((b.lng - a.lng) * cosLat * Math.PI / 180) * R;
    const dy = ((b.lat - a.lat) * Math.PI / 180) * R;
    return Math.sqrt(dx * dx + dy * dy);
  }

  static _lerp(a, b, steps) {
    const pts = [];
    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      pts.push({
        lat: a.lat + t * (b.lat - a.lat),
        lng: a.lng + t * (b.lng - a.lng)
      });
    }
    return pts;
  }
}
