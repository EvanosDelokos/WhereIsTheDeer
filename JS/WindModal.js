export class WindModal {
  constructor(map) {
    this.map = map;
    this.canvas = null;
    this.ctx = null;
    this.particles = [];
    this.windData = null;
    this.animationFrame = null;
    this.indicatorEl = null;
    this._frameCounter = 0;
    this.isCameraMoving = false;
    this.mouseMoveHandler = null;
    this.showMouseWind = true;
    this.speedFactor = 0.028;
    this.fadeAlpha = 0.048;
    this.maxAge = 130;
    this.lastTime = performance.now();

    this.particleCount = 350;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);

    this._boundResize = () => this.resize();
    this._boundMapResize = () => this.resize();
    this._boundZoomEnd = () => this.updateParticleDensity();
  }

  async init() {
    if (!this.hasPremiumWindAccess()) {
      console.log('[Security] Wind modal init blocked for non-premium user');
      this.showUpgradeForBlockedWind();
      return;
    }

    await this.loadWindData();

    if (!this.windData) {
      console.warn('[Wind] No data, aborting');
      return;
    }

    console.log('[Wind] Starting with valid data');
    this.createCanvas();
    this.createIndicator();
    this.createParticles();
    this.animate();
    this.setupMouseWindListener();
  }

  async loadWindData() {
    if (!this.hasPremiumWindAccess()) {
      console.log('[Security] Wind data fetch blocked for non-premium user');
      return;
    }

    try {
      const supabase = window.supabaseClient;
      if (!supabase?.auth) {
        throw new Error('Supabase client unavailable');
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('No auth session');
      }

      let res;
      try {
        res = await fetch('https://api.whereisthedeer.com.au/wind', {
          headers: {
            Authorization: `Bearer ${session.access_token}`
          },
          cache: 'no-store'
        });
      } catch (authFetchError) {
        throw new Error(`[Wind] Authenticated fetch blocked (likely CORS preflight). Configure API CORS for Authorization header from this origin. Details: ${authFetchError?.message || authFetchError}`);
      }

      if (!res.ok) {
        throw new Error(`Wind API failed: ${res.status}`);
      }

      this.windData = await res.json();

      console.log('Wind data loaded:', this.windData.width, 'x', this.windData.height);
      console.log('Wind grid:', this.windData.width, this.windData.height);
      console.log('Bounds:', this.windData.lo1, this.windData.lo2, this.windData.la1, this.windData.la2);
    } catch (err) {
      console.error('Wind load failed:', err);
      this.windData = null;
      throw err;
    }
  }

  createCanvas() {
    this.canvas = document.createElement('canvas');
    this.canvas.style.position = 'absolute';
    this.canvas.style.top = '0';
    this.canvas.style.left = '0';
    this.canvas.style.pointerEvents = 'none';

    const mapContainer = this.map.getContainer();
    const canvasContainer = this.map.getCanvasContainer();

    // Append wind canvas to the SAME container as the map canvas
    // but AFTER the base map canvas so it sits above tiles
    canvasContainer.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d', { alpha: true });

    this.resize();
    window.addEventListener('resize', this._boundResize);
    this.map.on('resize', this._boundMapResize);
    this.map.on('zoomend', this._boundZoomEnd);
  }

  createIndicator() {
    const mapContainer = this.map.getContainer();
    const indicator = document.createElement('div');
    indicator.id = 'windIndicator';
    indicator.style.position = 'absolute';
    indicator.style.top = '72px';
    indicator.style.left = '50%';
    indicator.style.transform = 'translateX(-50%)';
    indicator.style.zIndex = '1000';
    indicator.style.pointerEvents = 'none';
    indicator.style.padding = '8px 12px';
    indicator.style.borderRadius = '999px';
    indicator.style.background = 'rgba(10, 15, 28, 0.82)';
    indicator.style.backdropFilter = 'blur(6px)';
    indicator.style.border = '1px solid rgba(255,255,255,0.26)';
    indicator.style.boxShadow = '0 6px 14px rgba(0,0,0,0.24)';
    indicator.style.color = 'rgba(255,255,255,0.97)';
    indicator.style.fontFamily = 'system-ui, -apple-system, Segoe UI, sans-serif';
    indicator.style.fontSize = '13px';
    indicator.style.fontWeight = '600';
    indicator.style.lineHeight = '1.25';
    indicator.style.letterSpacing = '0.1px';
    indicator.style.whiteSpace = 'nowrap';
    indicator.style.maxWidth = 'calc(100vw - 24px)';
    indicator.style.overflow = 'hidden';
    indicator.style.textOverflow = 'ellipsis';
    indicator.textContent = '💨 Wind: -- km/h (-- kt)';
    mapContainer.appendChild(indicator);
    this.indicatorEl = indicator;
  }

  updateIndicator() {
    if (!this.indicatorEl || !this.map) return;
    const center = this.map.getCenter();
    const wind = this.getWind(center.lng, center.lat);
    const speedKmh = Math.sqrt(wind.u * wind.u + wind.v * wind.v);
    const speedKnots = speedKmh * 0.539957;
    this.indicatorEl.textContent = `💨 Wind: ${speedKmh.toFixed(1)} km/h (${speedKnots.toFixed(1)} kt)`;
  }

  setupMouseWindListener() {
    if (this.mouseMoveHandler) return;

    this.mouseMoveHandler = (e) => {
      if (!this.showMouseWind || !this.map || !this.windData) return;

      // Mapbox GL JS mousemove event provides e.point directly (pixel coordinates)
      if (!e.point) return;

      const lngLat = this.map.unproject(e.point);
      const wind = this.getWind(lngLat.lng, lngLat.lat);
      const speedMs = Math.hypot(wind.u, wind.v);
      const speedKmh = speedMs * 3.6;
      const speedKnots = speedMs * 1.94384;

      // Meteorological wind direction (where wind is COMING FROM)
      let direction = Math.atan2(-wind.v, -wind.u) * (180 / Math.PI);  // negate both for "from"
      direction = (direction + 360) % 360;   // ensure positive

      const dirStr = this.getDirectionString(direction);

      if (this.indicatorEl) {
        if (speedKmh < 0.5) {
          this.indicatorEl.textContent = '💨 Wind: calm';
        } else {
          this.indicatorEl.textContent =
            `💨 Wind: ${speedKmh.toFixed(1)} km/h (${speedKnots.toFixed(1)} kt) ${dirStr} (${Math.round(direction)}°)`;
        }
      }
    };

    // Attach using Mapbox's preferred way
    this.map.on('mousemove', this.mouseMoveHandler);
  }

  getDirectionString(deg) {
    const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
      'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
    return dirs[Math.round(deg / 22.5) % 16];
  }

  resize() {
    if (!this.canvas || !this.map) return;

    const mapCanvas = this.map.getCanvas();
    const cssWidth = mapCanvas.clientWidth || mapCanvas.width;
    const cssHeight = mapCanvas.clientHeight || mapCanvas.height;
    const pixelWidth = Math.max(1, Math.floor(cssWidth * this.dpr));
    const pixelHeight = Math.max(1, Math.floor(cssHeight * this.dpr));

    if (this.canvas.width !== pixelWidth || this.canvas.height !== pixelHeight) {
      this.canvas.width = pixelWidth;
      this.canvas.height = pixelHeight;
      if (Number.isFinite(cssWidth) && cssWidth > 0) {
        this.canvas.style.width = `${cssWidth}px`;
      }
      if (Number.isFinite(cssHeight) && cssHeight > 0) {
        this.canvas.style.height = `${cssHeight}px`;
      }
      this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    }
  }

  createParticles() {
    if (!this.hasPremiumWindAccess()) {
      console.log('[Security] Wind particle creation blocked for non-premium user');
      return;
    }

    this.particles = [];
    this.particleCount = this.getTargetParticleCount();

    const width = this.canvas.width / this.dpr;
    const height = this.canvas.height / this.dpr;

    for (let i = 0; i < this.particleCount; i++) {
      this.particles.push({
        x: Math.random() * width,
        y: Math.random() * height,
        age: Math.random() * this.maxAge * 0.6,
        trail: []
      });
    }
  }

  getTargetParticleCount() {
    const zoom = this.map.getZoom();

    // Zoomed out = more particles, zoomed in = fewer
    if (zoom <= 6) return 850;
    if (zoom <= 8) return 650;
    if (zoom <= 10) return 450;
    if (zoom <= 12) return 280;
    return 160;
  }

  respawnParticle(p) {
    const width = this.canvas.width / this.dpr;
    const height = this.canvas.height / this.dpr;
    p.x = Math.random() * width;
    p.y = Math.random() * height;
    p.age = 0;
    p.trail = [];
  }

  updateParticleDensity() {
    if (!this.map || !this.canvas) return;

    const newCount = this.getTargetParticleCount();

    // Only update if meaningful change to avoid flicker
    if (Math.abs(newCount - this.particleCount) > 80) {
      this.particleCount = newCount;
      this.createParticles();
    }
  }

  getWind(lng, lat) {
    if (!this.windData) return { u: 0, v: 0 };

    const { width, height, u: uData, v: vData, dx, dy, lo1, lo2, la1, la2 } = this.windData;

    if (!width || !height || !uData.length || !vData.length || !dx || !dy) {
      return { u: 0, v: 0 };
    }

    // Normalize longitude to match GFS (0 -> 360)
    let lon = lng;
    if (lon < 0) lon += 360;
    // DO NOT clamp longitude for global grids, only wrap it.
    if (lon > 360) lon -= 360;

    // Clamp latitude ONLY (valid for GFS)
    lat = Math.max(Math.min(lat, la1), la2);

    const x = (lon - lo1) / dx;
    const y = (lat - la2) / dy;
    if (isNaN(x) || isNaN(y)) {
      console.warn('BAD SAMPLE', { lng, lat, lon, lo1, lo2 });
      return { u: 0, v: 0 };
    }

    const x0 = Math.max(0, Math.min(width - 1, Math.floor(x)));
    const y0 = Math.max(0, Math.min(height - 1, Math.floor(y)));
    const x1 = Math.min(x0 + 1, width - 1);
    const y1 = Math.min(y0 + 1, height - 1);

    const tx = x - x0;
    const ty = y - y0;

    const idx = (ix, iy) => iy * width + ix;

    const v00 = { u: uData[idx(x0, y0)] ?? 0, v: vData[idx(x0, y0)] ?? 0 };
    const v10 = { u: uData[idx(x1, y0)] ?? 0, v: vData[idx(x1, y0)] ?? 0 };
    const v01 = { u: uData[idx(x0, y1)] ?? 0, v: vData[idx(x0, y1)] ?? 0 };
    const v11 = { u: uData[idx(x1, y1)] ?? 0, v: vData[idx(x1, y1)] ?? 0 };

    return {
      u:
        v00.u * (1 - tx) * (1 - ty) +
        v10.u * tx * (1 - ty) +
        v01.u * (1 - tx) * ty +
        v11.u * tx * ty,
      v:
        v00.v * (1 - tx) * (1 - ty) +
        v10.v * tx * (1 - ty) +
        v01.v * (1 - tx) * ty +
        v11.v * tx * ty
    };
  }

  lerp(a, b, t) {
    return a + (b - a) * t;
  }

  getSpeedColor(speedKnots) {
    // Classic wind intensity color scale (0-50+ knots)
    const t = Math.max(0, Math.min(1, speedKnots / 50));

    let r;
    let g;
    let b;

    if (t < 0.2) {                    // 0-10 knots: light blue / cyan
      r = 180; g = 230; b = 255;
    } else if (t < 0.35) {            // 10-17.5 knots: blue
      r = 80; g = 180; b = 255;
    } else if (t < 0.5) {             // 17.5-25 knots: cyan-green
      r = 100; g = 240; b = 200;
    } else if (t < 0.65) {            // 25-32.5 knots: yellow-green
      r = 200; g = 255; b = 100;
    } else if (t < 0.8) {             // 32.5-40 knots: yellow-orange
      r = 255; g = 220; b = 60;
    } else if (t < 0.9) {             // 40-45 knots: orange
      r = 255; g = 140; b = 40;
    } else {                          // 45+ knots: red
      r = 255; g = 70; b = 70;
    }

    return { r: Math.round(r), g: Math.round(g), b: Math.round(b) };
  }

  animate() {
    if (!this.ctx || !this.canvas) return;

    const now = performance.now();
    const dt = Math.min((now - this.lastTime) / 1000, 0.1);
    this.lastTime = now;

    const cssWidth = this.canvas.width / this.dpr;
    const cssHeight = this.canvas.height / this.dpr;

    const cameraMoving = this.map.isMoving() || this.map.isZooming() || this.map.isRotating();

    // Improved fade strategy for trails + stronger movement cleanup
    this.ctx.globalCompositeOperation = 'destination-out';
    if (cameraMoving) {
      // Much stronger clear when the map is moving to eliminate ghosting on satellite/water
      this.ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    } else {
      // Gentle fade for good trail visibility during normal animation
      this.ctx.fillStyle = `rgba(0, 0, 0, ${this.fadeAlpha})`;
    }
    this.ctx.fillRect(0, 0, cssWidth, cssHeight);
    this.ctx.globalCompositeOperation = 'source-over';

    if (cameraMoving) {
      this.isCameraMoving = true;
      this.animationFrame = requestAnimationFrame(() => this.animate());
      return;
    }

    if (this.isCameraMoving) {
      this.isCameraMoving = false;
    }

    const zoom = this.map.getZoom();
    const speedFactor = this.speedFactor * (1 + (zoom - 9) * 0.28);

    let drawnCount = 0;

    for (const p of this.particles) {
      // Back-project screen position to lat/lng for wind sampling
      const lngLat = this.map.unproject([p.x, p.y]);
      const wind = this.getWind(lngLat.lng, lngLat.lat);
      const speed = Math.hypot(wind.u, wind.v);

      if (!isFinite(speed) || speed < 0.4) {
        this.respawnParticle(p);
        continue;
      }

      const speedKnots = speed * 1.94384;
      const color = this.getSpeedColor(speedKnots);

      const prevX = p.x;
      const prevY = p.y;

      const moveSpeed = speedFactor * dt * 220;
      p.x += wind.u * moveSpeed * 0.95;      // east component
      p.y += wind.v * moveSpeed * -1.0;      // north component (y increases downward)

      p.age = (p.age ?? 0) + 1;

      // Add current position to short trail for prominent tails
      if (!p._skip || p._skip++ % 2 === 0) {
        p.trail.push({ x: p.x, y: p.y });
      }
      if (p.trail.length > 22) p.trail.shift();

      // Respawn if off screen or old
      if (p.age > this.maxAge || p.x < 0 || p.x > cssWidth || p.y < 0 || p.y > cssHeight) {
        this.respawnParticle(p);
        continue;
      }

      // Draw connected trail for more prominent, longer streaks
      if (p.trail.length >= 2) {
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';
        for (let i = 1; i < p.trail.length; i++) {
          const t = i / p.trail.length; // 0 -> 1
          const alpha = 0.15 + t * 0.8; // fade in along trail

          this.ctx.strokeStyle = `rgba(${color.r}, ${color.g}, ${color.b}, ${alpha})`;
          this.ctx.lineWidth = 1.8 + t * 3.2; // thinner tail -> thicker head

          this.ctx.beginPath();
          this.ctx.moveTo(p.trail[i - 1].x, p.trail[i - 1].y);
          this.ctx.lineTo(p.trail[i].x, p.trail[i].y);
          this.ctx.stroke();
        }
        drawnCount++;
      }
    }

    this._frameCounter++;
    this.animationFrame = requestAnimationFrame(() => this.animate());
  }

  destroy() {
    if (this.mouseMoveHandler) {
      this.map.off('mousemove', this.mouseMoveHandler);
      this.mouseMoveHandler = null;
    }

    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
    }

    window.removeEventListener('resize', this._boundResize);
    if (this.map) {
      this.map.off('resize', this._boundMapResize);
      this.map.off('zoomend', this._boundZoomEnd);
    }

    if (this.canvas) {
      this.canvas.remove();
    }
    if (this.indicatorEl) {
      this.indicatorEl.remove();
      this.indicatorEl = null;
    }

    this.particles = [];
    this.ctx = null;
    this.canvas = null;
  }

  hasPremiumWindAccess() {
    const plan = window.userPlan || window.currentUserPlan;
    return plan === 'premium';
  }

  showUpgradeForBlockedWind() {
    if (typeof window.showUpgradeMessage === 'function') {
      window.showUpgradeMessage();
    }
  }
}
