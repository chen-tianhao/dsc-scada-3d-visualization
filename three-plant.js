/* =====================================================================
 * three-plant.js  ·  工业大屏 3D 资产运行时
 * 依赖: three r159 (UMD, build/three.min.js)
 * 提供:
 *   Plant3D.Loop            —— 单 RAF 渲染循环（页面级，页面隐藏自动暂停）
 *   Plant3D.createViewer    —— 自适应画布/相机/渲染器/可见性管理
 *   Plant3D.OrbitRig        —— 旋转·缩放·平移控制器（含视角范围限制、触摸、阻尼）
 *   Plant3D.buildTank / buildPump / buildExchanger / buildPool
 *   Plant3D.buildPipe / buildFlow / makeLabel / makeShadow / attachHud
 * ===================================================================== */
(function (global) {
  'use strict';

  if (!global.THREE) {
    console.error('[Plant3D] THREE 未加载，3D 组件将保持降级状态');
    global.Plant3D = { available: false };
    return;
  }

  var T = global.THREE;
  var DEG = Math.PI / 180;

  /* ------------------------------ 基础工具 ------------------------------ */
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  // 帧率无关的指数阻尼：lambda 越大收敛越快
  function damp(cur, target, lambda, dt) { return cur + (target - cur) * (1 - Math.exp(-lambda * dt)); }

  /* ------------------------------ 渲染循环 ------------------------------ */
  var Loop = (function () {
    var items = [];
    var raf = 0, last = 0, paused = false;

    function tick(now) {
      raf = requestAnimationFrame(tick);
      var t = now * 0.001;                 // 秒
      var dt = last ? Math.min(t - last, 0.1) : 0.016; // 卡顿时钳制，避免动画跳变
      last = t;
      for (var i = 0; i < items.length; i++) {
        try { items[i](dt, t); } catch (e) { /* 单个回调异常不影响其它 */ }
      }
    }
    function start() { if (!raf) { last = 0; raf = requestAnimationFrame(tick); } }
    function stop() { if (raf) { cancelAnimationFrame(raf); raf = 0; } }

    document.addEventListener('visibilitychange', function () {
      paused = document.hidden;
      if (paused) { stop(); } else { start(); }
    });

    return {
      add: function (fn) { items.push(fn); start(); return fn; },
      remove: function (fn) { var i = items.indexOf(fn); if (i >= 0) items.splice(i, 1); },
      start: start, stop: stop,
      get paused() { return paused; }
    };
  })();

  /* ------------------------------ 贴片/精灵 ------------------------------ */
  // 径向渐变地面阴影（替代实时阴影，零开销）
  var _shadowTex = null;
  function shadowTexture() {
    if (_shadowTex) return _shadowTex;
    var s = 128, c = document.createElement('canvas');
    c.width = c.height = s;
    var g = c.getContext('2d');
    var rg = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    rg.addColorStop(0, 'rgba(0,0,0,0.55)');
    rg.addColorStop(0.55, 'rgba(0,0,0,0.22)');
    rg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = rg; g.fillRect(0, 0, s, s);
    _shadowTex = new T.CanvasTexture(c);
    return _shadowTex;
  }

  function makeShadow(radius) {
    var m = new T.Mesh(
      new T.PlaneGeometry(radius * 2, radius * 2),
      new T.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false, opacity: 0.9 })
    );
    m.rotation.x = -Math.PI / 2;
    m.position.y = 0.02;
    m.renderOrder = 1;
    return m;
  }

  // 圆形柔光粒子贴图（流向粒子用）
  var _dotTex = null;
  function dotTexture() {
    if (_dotTex) return _dotTex;
    var s = 64, c = document.createElement('canvas');
    c.width = c.height = s;
    var g = c.getContext('2d');
    var rg = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    rg.addColorStop(0, 'rgba(255,255,255,1)');
    rg.addColorStop(0.35, 'rgba(255,255,255,0.7)');
    rg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = rg; g.beginPath(); g.arc(s / 2, s / 2, s / 2, 0, Math.PI * 2); g.fill();
    _dotTex = new T.CanvasTexture(c);
    return _dotTex;
  }

  /**
   * 文本标签精灵（Canvas 贴图，始终正对相机）
   * @param {Object} o {title, lines:[], accent, width}
   */
  function makeLabel(o) {
    o = o || {};
    var lines = (o.lines || []).slice();
    var title = o.title || '';
    var accent = o.accent || '#00d4ff';
    var scale = o.scale || 2;              // 超采样，保证缩放后文字清晰
    var padX = 14, padY = 10, lh = 20, titleH = title ? 26 : 0;
    var W = o.width || 240, H = padY * 2 + titleH + lines.length * lh;

    var c = document.createElement('canvas');
    c.width = W * scale; c.height = H * scale;
    var g = c.getContext('2d');
    g.scale(scale, scale);

    // 底板
    g.fillStyle = 'rgba(5,11,26,0.88)';
    roundRect(g, 1, 1, W - 2, H - 2, 4); g.fill();
    g.strokeStyle = accent; g.lineWidth = 1.2; g.globalAlpha = 0.85;
    roundRect(g, 1, 1, W - 2, H - 2, 4); g.stroke();
    g.globalAlpha = 1;
    // 左侧强调条
    g.fillStyle = accent; g.fillRect(1, 1, 3, H - 2);

    var y = padY + 18;
    if (title) {
      g.font = 'bold 15px "DIN Alternate", Consolas, monospace';
      g.fillStyle = accent; g.textAlign = 'center';
      g.fillText(title, W / 2, y);
      y += 12;
    }
    g.font = '12px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';
    g.textAlign = 'center';
    for (var i = 0; i < lines.length; i++) {
      g.fillStyle = i === 0 ? '#d6e4ff' : '#8aa5d3';
      g.fillText(lines[i], W / 2, y + lh * i + 12);
    }

    var tex = new T.CanvasTexture(c);
    tex.colorSpace = T.SRGBColorSpace;
    tex.minFilter = T.LinearFilter;
    tex.generateMipmaps = false;
    var mat = new T.SpriteMaterial({ map: tex, transparent: true, depthTest: true, depthWrite: false });
    var sp = new T.Sprite(mat);
    var unit = (o.worldWidth || 4.2) / W;   // 世界宽 -> 每像素世界单位
    sp.scale.set(W * unit, H * unit, 1);
    sp.renderOrder = 5;
    return sp;
  }

  function roundRect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  /* ------------------------------ 材质工厂 ------------------------------ */
  var MAT = {
    steel: function (color, opt) {
      opt = opt || {};
      return new T.MeshStandardMaterial({
        color: color === undefined ? 0x2a4d8c : color,
        metalness: opt.metalness === undefined ? 0.65 : opt.metalness,
        roughness: opt.roughness === undefined ? 0.38 : opt.roughness,
        emissive: opt.emissive === undefined ? 0x061426 : opt.emissive,
        emissiveIntensity: opt.emissiveIntensity === undefined ? 0.6 : opt.emissiveIntensity,
        transparent: !!opt.transparent,
        opacity: opt.opacity === undefined ? 1 : opt.opacity,
        side: opt.side || T.FrontSide
      });
    },
    liquid: function (color) {
      return new T.MeshStandardMaterial({
        color: 0x00d4ff, emissive: color || 0x0099cc, emissiveIntensity: 0.9,
        metalness: 0.1, roughness: 0.25, transparent: true, opacity: 0.62,
        side: T.DoubleSide
      });
    },
    glow: function (color, opacity) {
      return new T.MeshBasicMaterial({
        color: color, transparent: true,
        opacity: opacity === undefined ? 0.9 : opacity, depthWrite: false
      });
    }
  };

  /* ------------------------------ 设备资产 ------------------------------ */

  /**
   * 立式圆筒储罐
   * @param {Object} o {radius, height, level(0~1), tag, name, info, accent}
   */
  function buildTank(o) {
    o = o || {};
    var r = o.radius || 2, h = o.height || 5;
    var lvl = clamp(o.level === undefined ? 0.6 : o.level, 0, 1);
    var accent = o.accent || '#00d4ff';
    var g = new T.Group();
    g.name = o.tag || 'TANK';

    // 罐壁（开口圆柱，双面可见内壁）
    var shell = new T.Mesh(new T.CylinderGeometry(r, r, h, 48, 1, true),
      MAT.steel(0x1a3a6b, { metalness: 0.7, roughness: 0.3, transparent: true, opacity: 0.42, side: T.DoubleSide }));
    shell.position.y = h / 2;
    g.add(shell);

    // 罐顶（略拱）
    var roof = new T.Mesh(new T.SphereGeometry(r, 32, 12, 0, Math.PI * 2, 0, Math.PI * 0.28),
      MAT.steel(0x284f8f, { metalness: 0.75, roughness: 0.28 }));
    roof.scale.y = 0.35; roof.position.y = h;
    g.add(roof);

    // 顶部环梁 + 栏杆
    var ring = new T.Mesh(new T.TorusGeometry(r, 0.045, 8, 56), MAT.steel(0x00d4ff, { emissive: 0x00d4ff, emissiveIntensity: 1.1 }));
    ring.rotation.x = Math.PI / 2; ring.position.y = h;
    g.add(ring);

    // 液体（几何原点置于底部，便于用 scale.y 直接驱动液位，零几何重建）
    var liqGeo = new T.CylinderGeometry(r * 0.965, r * 0.965, 1, 40, 1, false);
    liqGeo.translate(0, 0.5, 0);
    var liquid = new T.Mesh(liqGeo, MAT.liquid(0x0099cc));
    liquid.scale.y = Math.max(lvl * h, 0.001);
    liquid.renderOrder = 2;
    g.add(liquid);

    // 液面（随液位移动）
    var surf = new T.Mesh(new T.CircleGeometry(r * 0.965, 40),
      new T.MeshBasicMaterial({ color: 0x7fe9ff, transparent: true, opacity: 0.55, side: T.DoubleSide, depthWrite: false }));
    surf.rotation.x = -Math.PI / 2;
    surf.position.y = Math.max(lvl * h, 0.001) - 0.02;
    surf.renderOrder = 3;
    g.add(surf);

    // 罐壁刻度环（高/低报警位）
    [0.15, 0.85].forEach(function (p, i) {
      var mark = new T.Mesh(new T.TorusGeometry(r * 1.005, 0.02, 6, 48),
        MAT.glow(i === 0 ? 0xf87171 : 0xfbbf24, 0.6));
      mark.rotation.x = Math.PI / 2; mark.position.y = h * p;
      g.add(mark);
    });

    // 裙座与基础
    var base = new T.Mesh(new T.CylinderGeometry(r * 1.06, r * 1.18, 0.35, 36), MAT.steel(0x14274a, { roughness: 0.6 }));
    base.position.y = 0.17; g.add(base);

    // 顶部进料接管 + 底部出料接管
    var inlet = new T.Mesh(new T.CylinderGeometry(0.16, 0.16, 0.9, 16), MAT.steel(0x2a4d8c));
    inlet.position.set(0, h + 0.45, 0); g.add(inlet);
    var outlet = new T.Mesh(new T.CylinderGeometry(0.18, 0.18, 1.0, 16), MAT.steel(0x2a4d8c));
    outlet.rotation.z = Math.PI / 2; outlet.position.set(r + 0.4, 0.55, 0); g.add(outlet);
    var flange = new T.Mesh(new T.CylinderGeometry(0.28, 0.28, 0.08, 20), MAT.steel(0x5a7ab0));
    flange.rotation.z = Math.PI / 2; flange.position.set(r + 0.88, 0.55, 0); g.add(flange);

    // 位号标签
    var label = makeLabel({
      title: o.tag || '', lines: [o.name || '', o.info || ''], accent: accent, worldWidth: 4.4
    });
    label.position.set(0, h + 1.9, 0);
    g.add(label);

    g.add(makeShadow(r * 1.35));

    g.userData = {
      tag: o.tag, type: 'tank', pickable: true,
      liquid: liquid, surface: surf, label: label, height: h,
      setLevel: function (p) {
        var v = clamp(p, 0, 1) * h;
        liquid.scale.y = Math.max(v, 0.001);
        surf.position.y = Math.max(v, 0.001) - 0.02;
      }
    };
    return g;
  }

  /**
   * 离心泵机组（电机 + 联轴器 + 蜗壳 + 叶轮 + 底座）
   * @param {Object} o {running, tag, name, info, accent, scale}
   */
  function buildPump(o) {
    o = o || {};
    var run = o.running !== false;
    var accent = o.accent || (run ? '#4ade80' : '#5a7ab0');
    var main = run ? 0x00d4ff : 0x4a6a9c;
    var g = new T.Group();
    g.name = o.tag || 'PUMP';

    // 底座
    var base = new T.Mesh(new T.BoxGeometry(3.2, 0.35, 1.9), MAT.steel(0x14274a, { roughness: 0.7 }));
    base.position.y = 0.18; g.add(base);
    var plate = new T.Mesh(new T.BoxGeometry(3.4, 0.12, 2.1), MAT.steel(0x0f1d3a, { roughness: 0.8 }));
    plate.position.y = 0.42; g.add(plate);

    // 电机（横卧圆柱）
    var motor = new T.Mesh(new T.CylinderGeometry(0.62, 0.62, 1.7, 32), MAT.steel(run ? 0x2a4d8c : 0x1b2c4d, { metalness: 0.7 }));
    motor.rotation.z = Math.PI / 2;
    motor.position.set(-0.75, 1.15, 0); g.add(motor);

    // 电机散热筋（环阵列，纯装饰，复用几何）
    var finGeo = new T.TorusGeometry(0.64, 0.035, 6, 28);
    for (var i = 0; i < 5; i++) {
      var fin = new T.Mesh(finGeo, MAT.steel(0x35639f));
      fin.rotation.y = Math.PI / 2;
      fin.position.set(-1.45 + i * 0.34, 1.15, 0);
      g.add(fin);
    }

    // 接线盒
    var jbox = new T.Mesh(new T.BoxGeometry(0.55, 0.34, 0.5), MAT.steel(0x35639f));
    jbox.position.set(-0.75, 1.85, 0); g.add(jbox);

    // 联轴器护罩
    var guard = new T.Mesh(new T.CylinderGeometry(0.34, 0.34, 0.5, 20), MAT.steel(0x1f3a6b, { transparent: true, opacity: 0.75 }));
    guard.rotation.z = Math.PI / 2; guard.position.set(0.28, 1.15, 0); g.add(guard);

    // 泵壳（蜗壳）
    var volute = new T.Mesh(new T.SphereGeometry(0.62, 28, 20), MAT.steel(run ? 0x1a3a6b : 0x16263f, { metalness: 0.72 }));
    volute.scale.set(0.75, 1, 1); volute.position.set(0.92, 1.15, 0); g.add(volute);

    // 出口法兰（朝上）
    var disc = new T.Mesh(new T.CylinderGeometry(0.34, 0.34, 0.5, 24), MAT.steel(0x2a4d8c));
    disc.position.set(0.92, 1.75, 0); g.add(disc);
    var outFlange = new T.Mesh(new T.CylinderGeometry(0.42, 0.42, 0.1, 24), MAT.steel(0x5a7ab0));
    outFlange.position.set(0.92, 2.02, 0); g.add(outFlange);
    var inletPipe = new T.Mesh(new T.CylinderGeometry(0.34, 0.34, 1.0, 24), MAT.steel(0x2a4d8c));
    inletPipe.rotation.z = Math.PI / 2; inletPipe.position.set(1.85, 1.15, 0); g.add(inletPipe);

    // 风扇罩 + 叶轮（旋转部件）
    var fanCase = new T.Mesh(new T.TorusGeometry(0.6, 0.06, 8, 32), MAT.steel(0x35639f));
    fanCase.rotation.y = Math.PI / 2; fanCase.position.set(-1.72, 1.15, 0); g.add(fanCase);

    // 旋转组：原点必须与叶轮中心重合，绕自身轴自转时中轴（hub）才保持静止
    var spinner = new T.Group();
    spinner.position.set(-1.72, 1.15, 0);
    spinner.rotation.y = Math.PI / 2;   // 叶片平面法线对齐泵轴（X 轴）
    var hub = new T.Mesh(new T.CylinderGeometry(0.14, 0.14, 0.16, 16), MAT.steel(0x5a7ab0));
    hub.rotation.x = Math.PI / 2; spinner.add(hub);
    var bladeGeo = new T.BoxGeometry(0.5, 0.06, 0.16);
    var bladeMat = MAT.steel(run ? 0x00d4ff : 0x4a6a9c, { emissive: run ? 0x00d4ff : 0x22314d, emissiveIntensity: run ? 1.2 : 0.4 });
    for (var b = 0; b < 6; b++) {
      var blade = new T.Mesh(bladeGeo, bladeMat);
      blade.position.set(Math.cos(b / 6 * Math.PI * 2) * 0.3, Math.sin(b / 6 * Math.PI * 2) * 0.3, 0);
      blade.rotation.z = b / 6 * Math.PI * 2 + 0.5;
      blade.rotation.x = 0.45;
      spinner.add(blade);
    }
    g.add(spinner);

    // 运行状态灯
    var lamp = new T.Mesh(new T.SphereGeometry(0.11, 16, 12), MAT.glow(run ? 0x4ade80 : 0x5a7ab0, 1));
    lamp.position.set(-0.75, 2.2, 0); g.add(lamp);

    var label = makeLabel({
      title: o.tag || '', lines: [o.name || '', o.info || ''], accent: accent, worldWidth: 3.8
    });
    label.position.set(0.2, 3.1, 0);
    g.add(label);

    g.add(makeShadow(2.0));

    if (o.scale) g.scale.setScalar(o.scale);

    g.userData = {
      tag: o.tag, type: 'pump', pickable: true, running: run,
      spinner: spinner, lamp: lamp, label: label,
      spinSpeed: run ? 6.5 : 0,     // rad/s
      setRunning: function (v) {
        g.userData.running = v;
        g.userData.spinSpeed = v ? 6.5 : 0;
        lamp.material.color.set(v ? 0x4ade80 : 0x5a7ab0);
        bladeMat.color.set(v ? 0x00d4ff : 0x4a6a9c);
        bladeMat.emissive.set(v ? 0x00d4ff : 0x22314d);
        bladeMat.emissiveIntensity = v ? 1.2 : 0.4;
      }
    };
    return g;
  }

  /**
   * 板式换热器（板片组 + 端板 + 四接管）
   */
  function buildExchanger(o) {
    o = o || {};
    var g = new T.Group();
    g.name = o.tag || 'EXCHANGER';
    var W = 2.6, H = 2.0, D = 1.2;

    // 板片组：InstancedMesh 一次绘制（性能）
    var plateGeo = new T.BoxGeometry(W * 0.92, H * 0.86, 0.035);
    var plateMat = MAT.steel(0x2a4d8c, { metalness: 0.8, roughness: 0.25 });
    var N = 22;
    var plates = new T.InstancedMesh(plateGeo, plateMat, N);
    var mtx = new T.Matrix4();
    for (var i = 0; i < N; i++) {
      mtx.makeTranslation(0, 0, -D / 2 + 0.12 + i * (D - 0.24) / (N - 1));
      plates.setMatrixAt(i, mtx);
    }
    plates.instanceMatrix.needsUpdate = true;
    plates.position.y = H / 2 + 0.9;
    g.add(plates);

    // 两端夹紧板
    [0, 1].forEach(function (k) {
      var ep = new T.Mesh(new T.BoxGeometry(W, H, 0.16), MAT.steel(0x1a3a6b, { metalness: 0.75 }));
      ep.position.set(0, H / 2 + 0.9, (k ? 1 : -1) * (D / 2 + 0.02));
      g.add(ep);
    });

    // 上下导杆
    [0.25, H - 0.25].forEach(function (yy) {
      var rod = new T.Mesh(new T.CylinderGeometry(0.06, 0.06, D + 0.5, 12), MAT.steel(0x5a7ab0));
      rod.rotation.x = Math.PI / 2;
      rod.position.set(0, yy + 0.9, 0);
      g.add(rod);
    });

    // 支腿
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (p) {
      var leg = new T.Mesh(new T.BoxGeometry(0.16, 0.9, 0.16), MAT.steel(0x14274a));
      leg.position.set(p[0] * (W / 2 - 0.15), 0.45, p[1] * (D / 2 - 0.15));
      g.add(leg);
    });

    // 四个接管：热侧进/出（黄）、冷侧进/出（蓝）
    var nozzles = [
      { c: 0xfbbf24, x: -W / 2 - 0.35, y: H + 0.55, tag: 'hot-in' },
      { c: 0xfb923c, x: W / 2 + 0.35, y: 1.25, tag: 'hot-out' },
      { c: 0x38bdf8, x: W / 2 + 0.35, y: H + 0.55, tag: 'cold-in' },
      { c: 0x38bdf8, x: -W / 2 - 0.35, y: 1.25, tag: 'cold-out' }
    ];
    nozzles.forEach(function (n) {
      var pipe = new T.Mesh(new T.CylinderGeometry(0.15, 0.15, 0.8, 16), MAT.steel(n.c, { emissive: n.c, emissiveIntensity: 0.8, roughness: 0.3 }));
      pipe.rotation.z = Math.PI / 2;
      pipe.position.set(n.x, n.y, 0);
      g.add(pipe);
    });

    // 换热强度光晕（板片中心）
    var halo = new T.Mesh(new T.PlaneGeometry(W * 1.1, H * 1.1),
      new T.MeshBasicMaterial({ color: 0xfbbf24, transparent: true, opacity: 0.1, depthWrite: false, blending: T.AdditiveBlending }));
    halo.position.y = H / 2 + 0.9;
    g.add(halo);

    var label = makeLabel({
      title: o.tag || 'E-101', lines: [o.name || '板式换热器', o.info || ''], accent: '#fbbf24', worldWidth: 4.2
    });
    label.position.set(0, H + 2.1, 0);
    g.add(label);

    g.add(makeShadow(1.9));

    g.userData = { tag: o.tag, type: 'exchanger', pickable: true, halo: halo, label: label };
    return g;
  }

  /**
   * 冷却水池（池壁 + 波动水面）
   */
  function buildPool(o) {
    o = o || {};
    var w = o.width || 5, d = o.depth || 4, h = o.height || 0.9;
    var g = new T.Group();
    g.name = o.tag || 'POOL';

    var wall = new T.Mesh(new T.BoxGeometry(w, h, d), MAT.steel(0x14274a, { roughness: 0.75, transparent: true, opacity: 0.9 }));
    wall.position.y = h / 2; g.add(wall);

    var waterGeo = new T.PlaneGeometry(w * 0.94, d * 0.94, 24, 18);
    var water = new T.Mesh(waterGeo, new T.MeshStandardMaterial({
      color: 0x0ea5e9, emissive: 0x0b6f9c, emissiveIntensity: 0.7,
      transparent: true, opacity: 0.72, roughness: 0.15, metalness: 0.2, side: T.DoubleSide
    }));
    water.rotation.x = -Math.PI / 2;
    water.position.y = h * 0.86;
    g.add(water);

    var label = makeLabel({ title: o.tag || '', lines: [o.name || '冷却水池'], accent: '#38bdf8', worldWidth: 3.6 });
    label.position.set(0, 2.0, 0);
    g.add(label);

    g.add(makeShadow(Math.max(w, d) * 0.65));

    var basePos = waterGeo.attributes.position.array.slice();
    g.userData = {
      tag: o.tag, type: 'pool', pickable: true, label: label,
      wave: function (t) {   // 顶点波动（24×18 网格，开销可控）
        var arr = waterGeo.attributes.position.array;
        for (var i = 0; i < arr.length; i += 3) {
          var x = basePos[i], y = basePos[i + 1];
          arr[i + 2] = Math.sin(x * 1.6 + t * 1.6) * 0.045 + Math.cos(y * 1.9 + t * 1.15) * 0.035;
        }
        waterGeo.attributes.position.needsUpdate = true;
      }
    };
    return g;
  }

  /** 管线：CatmullRom 曲线 -> TubeGeometry */
  function buildPipe(points, o) {
    o = o || {};
    var curve = new T.CatmullRomCurve3(points.map(function (p) { return new T.Vector3(p[0], p[1], p[2]); }), false, 'catmullrom', 0.25);
    var geo = new T.TubeGeometry(curve, Math.max(24, points.length * 12), o.radius || 0.11, 12, false);
    var mat = new T.MeshStandardMaterial({
      color: o.color || 0x2a4d8c, emissive: o.color || 0x2a4d8c,
      emissiveIntensity: o.emissive === undefined ? 0.45 : o.emissive,
      metalness: 0.7, roughness: 0.35,
      transparent: !!o.transparent, opacity: o.opacity === undefined ? 1 : o.opacity
    });
    var mesh = new T.Mesh(geo, mat);
    mesh.userData.curve = curve;
    return mesh;
  }

  /**
   * 流向粒子：沿曲线运动的 Points（一次 BufferGeometry 更新，无 GC 压力）
   * @returns {Object} {points, update(dt, t)}
   */
  function buildFlow(curve, o) {
    o = o || {};
    var n = o.count || 26;
    var pos = new Float32Array(n * 3);
    var geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.BufferAttribute(pos, 3));
    var mat = new T.PointsMaterial({
      size: o.size || 0.34, map: dotTexture(), color: o.color || 0xfbbf24,
      transparent: true, opacity: o.opacity === undefined ? 0.95 : o.opacity,
      depthWrite: false, blending: T.AdditiveBlending, sizeAttenuation: true
    });
    var pts = new T.Points(geo, mat);
    pts.frustumCulled = false;
    pts.renderOrder = 4;

    var speed = o.speed === undefined ? 0.16 : o.speed;   // 圈/秒
    var offsets = new Float32Array(n);
    for (var i = 0; i < n; i++) offsets[i] = i / n;
    var v = new T.Vector3();

    var baseOpacity = o.opacity === undefined ? 0.95 : o.opacity;
    return {
      points: pts,
      update: function (dt, t) {
        var arr = geo.attributes.position.array;
        for (var i = 0; i < n; i++) {
          var u = (offsets[i] + t * speed) % 1;
          curve.getPointAt(u < 0 ? u + 1 : u, v);
          arr[i * 3] = v.x; arr[i * 3 + 1] = v.y; arr[i * 3 + 2] = v.z;
        }
        geo.attributes.position.needsUpdate = true;
        mat.opacity = baseOpacity;   // 停运回路保持暗显，不被逐帧重置
      }
    };
  }

  /** 地面网格（保留原 SVG 网格底纹观感） */
  function buildGround(size, divisions, color) {
    var grid = new T.GridHelper(size, divisions, color || 0x2a4d8c, 0x1f3a6b);
    grid.material.transparent = true;
    grid.material.opacity = 0.35;
    grid.material.depthWrite = false;
    return grid;
  }

  /* ------------------------------ 视角控制器 ------------------------------ */
  /**
   * OrbitRig：球坐标视角控制器
   * - 左键/单指拖拽 = 旋转；滚轮/双指捏合 = 缩放；右键(或 Shift+左键)/双指拖动 = 平移
   * - 全部带阻尼平滑；严格限制极角/方位角/距离/平移范围，防止穿地、翻转、飞出场景
   */
  function OrbitRig(camera, dom, opt) {
    opt = opt || {};
    this.camera = camera;
    this.dom = dom;

    this.target = new T.Vector3().fromArray(opt.target || [0, 2, 0]);
    this._target = this.target.clone();

    this.theta = opt.theta === undefined ? -0.62 : opt.theta;   // 方位角
    this.phi = opt.phi === undefined ? 1.05 : opt.phi;          // 极角（从 +Y 轴量起）
    this.dist = opt.dist === undefined ? 34 : opt.dist;
    this._theta = this.theta; this._phi = this.phi; this._dist = this.dist;

    // —— 视角范围限制 ——
    this.limit = {
      theta: opt.thetaRange || [-Math.PI * 0.62, Math.PI * 0.18],  // 水平旋转范围
      phi: opt.phiRange || [0.30, 1.42],                            // 垂直：不穿地、不过顶
      dist: opt.distRange || [16, 62],                              // 缩放范围
      pan: opt.panRange || { x: [-14, 14], y: [0.5, 12], z: [-12, 12] }
    };
    this.home = { theta: this.theta, phi: this.phi, dist: this.dist, target: this.target.clone() };

    this.damping = opt.damping === undefined ? 9 : opt.damping;
    this.rotateSpeed = opt.rotateSpeed === undefined ? 1 : opt.rotateSpeed;
    this.zoomSpeed = opt.zoomSpeed === undefined ? 1 : opt.zoomSpeed;
    this.enablePan = opt.enablePan !== false;
    this.enableZoom = opt.enableZoom !== false;
    this.enableRotate = opt.enableRotate !== false;
    this.autoRotate = !!opt.autoRotate;
    this.autoRotateSpeed = opt.autoRotateSpeed || 0.12;

    this._pointers = new Map();
    this._mode = 0;               // 0 无 / 1 旋转 / 2 平移 / 3 双指
    this._lastPos = { x: 0, y: 0 };
    this._pinchDist = 0;
    this._velTheta = 0; this._velPhi = 0;   // 惯性
    this._idleTime = 0;
    this.userInteracting = false;
    this._enabled = true;

    this._bind();
    this.update(0.016, 0);
  }

  OrbitRig.prototype._bind = function () {
    var self = this, dom = this.dom;
    dom.style.touchAction = 'none';
    dom.style.cursor = 'grab';

    function pos(e) { return { x: e.clientX, y: e.clientY }; }

    this._onDown = function (e) {
      if (!self._enabled) return;
      dom.setPointerCapture && dom.setPointerCapture(e.pointerId);
      self._pointers.set(e.pointerId, pos(e));
      self.userInteracting = true;
      self._idleTime = 0;
      if (self._pointers.size === 1) {
        self._mode = (e.button === 2 || e.button === 1 || e.shiftKey) ? 2 : 1;
        self._lastPos = pos(e);
        dom.style.cursor = 'grabbing';
      } else if (self._pointers.size === 2) {
        self._mode = 3;
        self._pinchDist = self._dist2();
      }
    };
    this._onMove = function (e) {
      if (!self._enabled || !self._pointers.has(e.pointerId)) return;
      var p = pos(e);
      self._pointers.set(e.pointerId, p);
      var rect = dom.getBoundingClientRect();

      if (self._mode === 3 && self._pointers.size >= 2) {
        // 双指：捏合缩放 + 中点平移
        var d = self._dist2();
        if (self._pinchDist > 0 && self.enableZoom) {
          var k = self._pinchDist / Math.max(d, 1);
          self._dist = clamp(self._dist * k, self.limit.dist[0], self.limit.dist[1]);
        }
        self._pinchDist = d;
        if (self.enablePan) self._panBy(self._midDelta(rect), rect);
        return;
      }
      var dx = p.x - self._lastPos.x, dy = p.y - self._lastPos.y;
      self._lastPos = p;
      if (self._mode === 1 && self.enableRotate) {
        var k2 = self.rotateSpeed * 0.0055;
        self._velTheta = -dx * k2; self._velPhi = -dy * k2;
        self._theta = clamp(self._theta + self._velTheta, self.limit.theta[0], self.limit.theta[1]);
        self._phi = clamp(self._phi + self._velPhi, self.limit.phi[0], self.limit.phi[1]);
      } else if (self._mode === 2 && self.enablePan) {
        self._panBy({ x: dx, y: dy }, rect);
      }
    };
    this._onUp = function (e) {
      self._pointers.delete(e.pointerId);
      if (self._pointers.size === 0) { self._mode = 0; self.userInteracting = false; dom.style.cursor = 'grab'; }
      else if (self._pointers.size === 1) {
        self._mode = 1;
        var it = self._pointers.values().next().value;
        self._lastPos = it;
      }
    };
    this._onWheel = function (e) {
      if (!self._enabled || !self.enableZoom) return;
      e.preventDefault();
      var k = Math.exp(clamp(e.deltaY, -120, 120) * 0.0012 * self.zoomSpeed);
      self._dist = clamp(self._dist * k, self.limit.dist[0], self.limit.dist[1]);
      self._idleTime = 0;
    };
    this._onCtx = function (e) { e.preventDefault(); };
    this._onDbl = function () { self.reset(); };

    dom.addEventListener('pointerdown', this._onDown);
    dom.addEventListener('pointermove', this._onMove);
    dom.addEventListener('pointerup', this._onUp);
    dom.addEventListener('pointercancel', this._onUp);
    dom.addEventListener('pointerleave', this._onUp);
    dom.addEventListener('wheel', this._onWheel, { passive: false });
    dom.addEventListener('contextmenu', this._onCtx);
    dom.addEventListener('dblclick', this._onDbl);
  };

  OrbitRig.prototype._dist2 = function () {
    var v = Array.from(this._pointers.values());
    if (v.length < 2) return 0;
    return Math.hypot(v[0].x - v[1].x, v[0].y - v[1].y);
  };
  OrbitRig.prototype._midDelta = function () {
    var v = Array.from(this._pointers.values());
    if (v.length < 2) return { x: 0, y: 0 };
    var mx = (v[0].x + v[1].x) / 2, my = (v[0].y + v[1].y) / 2;
    if (this._mid === undefined) this._mid = { x: mx, y: my };
    var d = { x: mx - this._mid.x, y: my - this._mid.y };
    this._mid = { x: mx, y: my };
    return d;
  };
  OrbitRig.prototype._panBy = function (d, rect) {
    var h = rect.height || 1;
    var k = 2 * this.dist * Math.tan(this.camera.fov * 0.5 * DEG) / h;
    var right = new T.Vector3(), up = new T.Vector3();
    this.camera.matrixWorld.extractBasis(right, up, new T.Vector3());
    this._target.addScaledVector(right, -d.x * k);
    this._target.addScaledVector(up, d.y * k);
    var p = this.limit.pan;
    this._target.x = clamp(this._target.x, p.x[0], p.x[1]);
    this._target.y = clamp(this._target.y, p.y[0], p.y[1]);
    this._target.z = clamp(this._target.z, p.z[0], p.z[1]);
  };

  OrbitRig.prototype.reset = function (soft) {
    this._theta = this.home.theta; this._phi = this.home.phi; this._dist = this.home.dist;
    this._target.copy(this.home.target);
    if (!soft) { this.theta = this._theta; this.phi = this._phi; this.dist = this._dist; this.target.copy(this._target); }
  };
  OrbitRig.prototype.setView = function (v) {  // 预设视角：{theta,phi,dist,target}
    if (v.theta !== undefined) this._theta = clamp(v.theta, this.limit.theta[0], this.limit.theta[1]);
    if (v.phi !== undefined) this._phi = clamp(v.phi, this.limit.phi[0], this.limit.phi[1]);
    if (v.dist !== undefined) this._dist = clamp(v.dist, this.limit.dist[0], this.limit.dist[1]);
    if (v.target) this._target.set(
      clamp(v.target[0], this.limit.pan.x[0], this.limit.pan.x[1]),
      clamp(v.target[1], this.limit.pan.y[0], this.limit.pan.y[1]),
      clamp(v.target[2], this.limit.pan.z[0], this.limit.pan.z[1]));
  };
  OrbitRig.prototype.setEnabled = function (v) { this._enabled = v; };

  /** 每帧调用：阻尼收敛 + 惯性 + 自动巡航 */
  OrbitRig.prototype.update = function (dt, t) {
    if (!this.userInteracting) {
      // 松手后的惯性衰减（越拖越流畅，但不会失控）
      this._theta = clamp(this._theta + this._velTheta, this.limit.theta[0], this.limit.theta[1]);
      this._phi = clamp(this._phi + this._velPhi, this.limit.phi[0], this.limit.phi[1]);
      this._velTheta *= Math.exp(-4.5 * dt);
      this._velPhi *= Math.exp(-4.5 * dt);
      this._idleTime += dt;
      // 空闲 6s 后缓慢自动巡航，一旦有操作立即停止
      if (this.autoRotate && this._idleTime > 6) {
        this._theta = clamp(this._theta + this.autoRotateSpeed * dt, this.limit.theta[0], this.limit.theta[1]);
      }
    } else {
      this._idleTime = 0;
      this._velTheta *= Math.exp(-8 * dt);
      this._velPhi *= Math.exp(-8 * dt);
    }

    // 交互中提高收敛速度（跟手），松手后回落为柔和阻尼（顺滑）
    var l = this.userInteracting ? Math.max(this.damping, 18) : this.damping;
    this.theta = damp(this.theta, this._theta, l, dt);
    this.phi = damp(this.phi, this._phi, l, dt);
    this.dist = damp(this.dist, this._dist, l, dt);
    this.target.x = damp(this.target.x, this._target.x, l, dt);
    this.target.y = damp(this.target.y, this._target.y, l, dt);
    this.target.z = damp(this.target.z, this._target.z, l, dt);

    var sp = Math.sin(this.phi), cp = Math.cos(this.phi);
    this.camera.position.set(
      this.target.x + this.dist * sp * Math.sin(this.theta),
      this.target.y + this.dist * cp,
      this.target.z + this.dist * sp * Math.cos(this.theta)
    );
    this.camera.lookAt(this.target);
  };

  OrbitRig.prototype.dispose = function () {
    var d = this.dom;
    d.removeEventListener('pointerdown', this._onDown);
    d.removeEventListener('pointermove', this._onMove);
    d.removeEventListener('pointerup', this._onUp);
    d.removeEventListener('pointercancel', this._onUp);
    d.removeEventListener('pointerleave', this._onUp);
    d.removeEventListener('wheel', this._onWheel);
    d.removeEventListener('contextmenu', this._onCtx);
    d.removeEventListener('dblclick', this._onDbl);
    this._pointers.clear();
  };

  /* ------------------------------ 观察器 ------------------------------ */
  /**
   * createViewer：创建自适应画布 + 场景 + 相机 + 控制器
   * @param {HTMLElement} container
   * @param {Object} o {fov, alpha, bg, rig:{...}, onResize}
   */
  function createViewer(container, o) {
    o = o || {};
    var isMobile = matchMedia('(max-width: 820px)').matches ||
      /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
    var maxDpr = o.maxDpr || (isMobile ? 1.75 : 2);

    var scene = new T.Scene();
    if (!o.alpha) { scene.background = new T.Color(o.bg || 0x050b1a); }
    if (o.fog !== false) scene.fog = new T.Fog(o.fogColor || 0x050b1a, o.fogNear || 55, o.fogFar || 165);

    var camera = new T.PerspectiveCamera(o.fov || 42, 1, 0.1, 600);

    var renderer = new T.WebGLRenderer({
      antialias: !isMobile || maxDpr < 1.5,   // 移动端高 DPR 关闭 MSAA 以保帧率
      alpha: !!o.alpha,
      powerPreference: 'high-performance',
      failIfMajorPerformanceCaveat: false
    });
    renderer.setPixelRatio(Math.min(global.devicePixelRatio || 1, maxDpr));
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.outline = 'none';
    container.appendChild(renderer.domElement);

    var rig = new OrbitRig(camera, renderer.domElement, o.rig || {});

    var viewer = {
      scene: scene, camera: camera, renderer: renderer, rig: rig,
      container: container, visible: true, size: { w: 1, h: 1 },
      updaters: [],
      onFrame: function (fn) { viewer.updaters.push(fn); },
      dispose: function () {
        Loop.remove(viewer._loop);
        rig.dispose();
        if (ro) ro.disconnect();
        if (io) io.disconnect();
        renderer.dispose();
        if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
      }
    };

    function resize() {
      var w = container.clientWidth || 1, h = container.clientHeight || 1;
      if (!w || !h) return;
      if (w === viewer.size.w && h === viewer.size.h) return;
      viewer.size = { w: w, h: h };
      camera.aspect = w / h;
      // 竖屏/窄容器自动拉远，避免设备被裁切
      camera.fov = (w / h < 1.1) ? (o.fov || 42) * 1.22 : (o.fov || 42);
      camera.updateProjectionMatrix();
      renderer.setPixelRatio(Math.min(global.devicePixelRatio || 1, maxDpr));
      renderer.setSize(w, h, false);
      if (o.onResize) o.onResize(w, h);
    }

    var ro = null, io = null;
    if (global.ResizeObserver) {
      var pending = false;
      ro = new ResizeObserver(function () {
        if (pending) return;
        pending = true;
        requestAnimationFrame(function () { pending = false; resize(); });
      });
      ro.observe(container);
    } else {
      global.addEventListener('resize', resize);
    }
    // 离屏/不可见时停止该画布渲染
    if (global.IntersectionObserver) {
      io = new IntersectionObserver(function (es) { viewer.visible = es[0].isIntersecting; }, { threshold: 0.01 });
      io.observe(container);
    }
    resize();

    viewer._loop = Loop.add(function (dt, t) {
      if (!viewer.visible) return;
      rig.update(dt, t);
      for (var i = 0; i < viewer.updaters.length; i++) viewer.updaters[i](dt, t);
      renderer.render(scene, camera);
    });

    viewer.resize = resize;
    return viewer;
  }

  /* ------------------------------ 场景灯光 ------------------------------ */
  function addLights(scene, o) {
    o = o || {};
    scene.add(new T.HemisphereLight(0x9fc6ff, 0x0a1428, o.hemi === undefined ? 0.85 : o.hemi));
    var key = new T.DirectionalLight(0xffffff, 1.05);
    key.position.set(18, 26, 14); scene.add(key);
    var fill = new T.DirectionalLight(0x66b6ff, 0.55);
    fill.position.set(-16, 12, -10); scene.add(fill);
    var rim = new T.PointLight(0x00d4ff, o.rim === undefined ? 60 : o.rim, 70, 2);
    rim.position.set(0, 14, -18); scene.add(rim);
    return { key: key, fill: fill, rim: rim };
  }

  /* ------------------------------ 拾取高亮 ------------------------------ */
  function createPicker(viewer, opts) {
    opts = opts || {};
    var ray = new T.Raycaster();
    var ndc = new T.Vector2();
    var dom = viewer.renderer.domElement;
    var hovered = null, selected = null;
    var targets = [];
    var moveTimer = null;

    function pickables() { return [viewer.scene]; }

    function findRoot(obj) {
      var o = obj;
      while (o) { if (o.userData && o.userData.tag && o.userData.pickable) return o; o = o.parent; }
      return null;
    }

    function setEmissive(root, on) {
      if (!root) return;
      root.traverse(function (m) {
        if (!m.isMesh || !m.material || !m.material.emissive) return;
        if (m.userData._baseEmi === undefined) {
          m.userData._baseEmi = m.material.emissiveIntensity;
          m.userData._baseCol = m.material.emissive ? m.material.emissive.getHex() : null;
        }
        if (on) {
          m.material.emissiveIntensity = m.userData._baseEmi + 0.9;
        } else {
          m.material.emissiveIntensity = m.userData._baseEmi;
        }
      });
    }

    function onMove(e) {
      var rect = dom.getBoundingClientRect();
      ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      if (moveTimer) return;   // 简单节流：每帧最多一次拾取
      moveTimer = requestAnimationFrame(function () {
        moveTimer = null;
        ray.setFromCamera(ndc, viewer.camera);
        var hits = ray.intersectObjects(pickables(), true);
        var root = null;
        for (var i = 0; i < hits.length; i++) { root = findRoot(hits[i].object); if (root) break; }
        if (root !== hovered) {
          if (hovered && hovered !== selected) setEmissive(hovered, false);
          hovered = root;
          if (hovered) setEmissive(hovered, true);
          dom.style.cursor = hovered ? 'pointer' : 'grab';
          if (opts.onHover) opts.onHover(hovered ? hovered.userData : null, e);
        }
      });
    }
    function onLeave() {
      if (hovered && hovered !== selected) setEmissive(hovered, false);
      hovered = null;
      if (opts.onHover) opts.onHover(null);
    }
    function onClick(e) {
      if (!hovered) return;
      if (selected && selected !== hovered) setEmissive(selected, false);
      selected = hovered;
      if (opts.onSelect) opts.onSelect(selected.userData, e);
    }

    dom.addEventListener('pointermove', onMove);
    dom.addEventListener('pointerleave', onLeave);
    dom.addEventListener('click', onClick);

    return {
      get hovered() { return hovered; },
      get selected() { return selected; },
      select: function (root) {
        if (selected && selected !== root) setEmissive(selected, false);
        selected = root; if (root) setEmissive(root, true);
      },
      dispose: function () {
        dom.removeEventListener('pointermove', onMove);
        dom.removeEventListener('pointerleave', onLeave);
        dom.removeEventListener('click', onClick);
      }
    };
  }

  /* ------------------------------ HUD ------------------------------ */
  /** 样式只注入一次（同一页面多个画布复用同一套 CSS） */
  function injectStyle(id, css) {
    if (document.getElementById(id)) return;
    var st = document.createElement('style');
    st.id = id;
    st.textContent = css;
    document.head.appendChild(st);
  }

  /** 视角预设/重置/操作提示条（沿用大屏配色，不破坏原有布局） */
  function attachHud(container, viewer, o) {
    o = o || {};
    var box = document.createElement('div');
    box.className = 'p3d-hud';
    var presets = o.presets || [
      { label: '等轴', view: { theta: -0.62, phi: 1.05, dist: viewer.rig.home.dist, target: viewer.rig.home.target.toArray() } },
      { label: '俯视', view: { theta: -0.62, phi: 0.34, dist: viewer.rig.home.dist * 0.92, target: viewer.rig.home.target.toArray() } },
      { label: '正视', view: { theta: 0, phi: 1.35, dist: viewer.rig.home.dist * 0.86, target: viewer.rig.home.target.toArray() } }
    ];
    var html = '<div class="p3d-hud-tip">' + (o.tip || '左键拖拽旋转 · 滚轮缩放 · 右键拖拽平移 · 双击复位') + '</div><div class="p3d-hud-btns">';
    html += '<button data-act="reset">复位</button>';
    presets.forEach(function (p, i) { html += '<button data-i="' + i + '">' + p.label + '</button>'; });
    html += '</div>';
    box.innerHTML = html;
    injectStyle('p3d-hud-style',
      '.p3d-hud{position:absolute;right:10px;bottom:8px;z-index:6;display:flex;align-items:center;gap:8px;' +
      'font-family:-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;pointer-events:none}' +
      '.p3d-hud-tip{font-size:10px;color:#8aa5d3;background:rgba(5,11,26,.72);border:1px solid #1f3a6b;' +
      'border-radius:3px;padding:3px 8px;letter-spacing:.5px}' +
      '.p3d-hud-btns{display:flex;gap:4px;pointer-events:auto}' +
      '.p3d-hud button{font-size:10px;color:#00d4ff;background:rgba(5,11,26,.8);border:1px solid #1f3a6b;' +
      'border-radius:3px;padding:3px 9px;cursor:pointer;letter-spacing:1px;transition:all .18s ease}' +
      '.p3d-hud button:hover{background:rgba(0,212,255,.16);border-color:#00d4ff;color:#fff}' +
      '@media (max-width:820px){.p3d-hud-tip{display:none}}');

    container.appendChild(box);
    box.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('button') : null;
      if (!b) return;
      if (b.dataset.act === 'reset') viewer.rig.reset();
      else if (b.dataset.i !== undefined) viewer.rig.setView(presets[+b.dataset.i].view);
    });
    return box;
  }

  /** 悬浮信息卡（选中/悬停设备时显示） */
  function attachTooltip(container, viewer) {
    var el = document.createElement('div');
    el.className = 'p3d-tip';
    injectStyle('p3d-tip-style',
      '.p3d-tip{position:absolute;left:10px;top:38px;z-index:6;pointer-events:none;opacity:0;transform:translateY(-4px);' +
      'transition:opacity .18s ease,transform .18s ease;background:rgba(5,11,26,.9);border:1px solid #1f3a6b;' +
      'border-left:3px solid #00d4ff;border-radius:3px;padding:7px 11px;font-size:11px;color:#d6e4ff;' +
      'font-family:-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;max-width:260px;line-height:1.6}' +
      '.p3d-tip.show{opacity:1;transform:translateY(0)}' +
      '.p3d-tip b{color:#00d4ff;font-family:Consolas,monospace;letter-spacing:1px}');
    container.appendChild(el);
    return {
      show: function (html) { el.innerHTML = html; el.classList.add('show'); },
      hide: function () { el.classList.remove('show'); },
      el: el
    };
  }

  /* ------------------------------ 导出 ------------------------------ */
  global.Plant3D = {
    available: true,
    version: '1.0.0',
    THREE: T,
    Loop: Loop,
    clamp: clamp, damp: damp,
    createViewer: createViewer,
    OrbitRig: OrbitRig,
    addLights: addLights,
    createPicker: createPicker,
    attachHud: attachHud,
    attachTooltip: attachTooltip,
    buildTank: buildTank,
    buildPump: buildPump,
    buildExchanger: buildExchanger,
    buildPool: buildPool,
    buildPipe: buildPipe,
    buildFlow: buildFlow,
    buildGround: buildGround,
    makeLabel: makeLabel,
    makeShadow: makeShadow,
    MAT: MAT
  };
})(window);
