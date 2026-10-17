/* =====================================================================
 * fit-screen.js  ·  1920×1080 设计画布自适应缩放
 * 背景：大屏按 1920×1080 定尺设计，而 body 为 overflow:hidden，
 *       在 1366×768 / 1600×900 等屏幕上会出现不可逆的内容裁切。
 * 方案：桌面端等比缩放并居中（不改动任何栅格/字号，保持设计稿观感）；
 *       窄屏（<=900px）交还原生响应式单列布局。
 * ===================================================================== */
(function () {
  'use strict';

  var DESIGN_W = 1920, DESIGN_H = 1080, BREAKPOINT = 900;

  function boot() {
    var el = document.querySelector('.screen');
    if (!el) return;

    function reset() {
      el.style.position = '';
      el.style.left = '';
      el.style.top = '';
      el.style.transform = '';
      el.style.transformOrigin = '';
      document.body.style.overflow = '';
    }

    function apply() {
      var vw = window.innerWidth, vh = window.innerHeight;
      // 与 CSS 的移动端断点保持一致：窄屏走原生 flex 单列布局
      if (vw <= BREAKPOINT) { reset(); return; }

      var s = Math.min(vw / DESIGN_W, vh / DESIGN_H);
      if (!isFinite(s) || s <= 0) { reset(); return; }

      el.style.transformOrigin = '0 0';
      el.style.position = 'absolute';
      el.style.left = Math.max(0, (vw - DESIGN_W * s) / 2) + 'px';
      el.style.top = Math.max(0, (vh - DESIGN_H * s) / 2) + 'px';
      el.style.transform = 'scale(' + s + ')';
      document.body.style.overflow = 'hidden';
    }

    apply();
    window.addEventListener('resize', apply);
    window.addEventListener('orientationchange', apply);
    // 3D 画布尺寸依赖容器布局尺寸，缩放变化后主动触发一次重算
    window.addEventListener('resize', function () {
      if (window.Plant3D && window.Plant3D.Loop) { /* resize 由各 viewer 的 ResizeObserver 接管 */ }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
