/* =====================================================================
 * nav.js  ·  三块大屏的统一页面导航
 * 自动注入到 .header，高亮当前页；支持 Alt + ←/→ 快捷切换
 * 无依赖，可安全重复引入
 * ===================================================================== */
(function () {
  'use strict';

  var PAGES = [
    { file: '01_panorama.html', code: '01', label: '工艺全景' },
    { file: '02_pumps_focus.html', code: '02', label: '输送设备' },
    { file: '03_process_flow.html', code: '03', label: '工艺走向' }
  ];

  var CSS =
    '.page-nav{position:absolute;left:190px;top:50%;transform:translateY(-50%);' +
    'display:flex;align-items:center;gap:6px;z-index:30}' +
    '.page-nav a{display:inline-flex;align-items:center;gap:6px;text-decoration:none;' +
    'font-size:11px;letter-spacing:1px;color:#8aa5d3;background:rgba(5,11,26,.55);' +
    'border:1px solid #1f3a6b;border-radius:3px;padding:5px 11px;line-height:1.3;' +
    'transition:color .18s ease,border-color .18s ease,background .18s ease,box-shadow .18s ease}' +
    '.page-nav a .pn-code{font-family:Consolas,monospace;font-size:10px;opacity:.7}' +
    '.page-nav a:hover{color:#fff;border-color:#00d4ff;background:rgba(0,212,255,.14);' +
    'box-shadow:0 0 10px rgba(0,212,255,.25)}' +
    '.page-nav a.active{color:#00d4ff;border-color:#00d4ff;background:rgba(0,212,255,.16)}' +
    '.page-nav a.pn-home{border-style:dashed}' +
    '@media (max-width:900px){' +
    '.page-nav{position:static;transform:none;left:auto;top:auto;order:9;' +
    'width:100%;flex-wrap:wrap;margin-top:8px}}';

  function injectStyle(id, css) {
    if (document.getElementById(id)) return;
    var st = document.createElement('style');
    st.id = id;
    st.textContent = css;
    document.head.appendChild(st);
  }

  function currentFile() {
    var p = (location.pathname || '').split('/').pop() || '';
    return p.toLowerCase();
  }

  function boot() {
    var header = document.querySelector('.header');
    if (!header || document.getElementById('page-nav')) return;

    var cur = currentFile();
    var idx = -1;
    for (var i = 0; i < PAGES.length; i++) {
      if (PAGES[i].file.toLowerCase() === cur) { idx = i; break; }
    }

    injectStyle('page-nav-style', CSS);

    var nav = document.createElement('nav');
    nav.className = 'page-nav';
    nav.id = 'page-nav';
    var html = PAGES.map(function (p, i) {
      return '<a href="' + p.file + '"' + (i === idx ? ' class="active" aria-current="page"' : '') +
        ' title="' + p.label + ' 大屏"><span class="pn-code">' + p.code + '</span>' + p.label + '</a>';
    }).join('');
    html += '<a class="pn-home" href="index.html" title="返回大屏总览">总览</a>';
    nav.innerHTML = html;
    header.appendChild(nav);

    // Alt + ←/→ 在三个大屏之间循环切换
    document.addEventListener('keydown', function (e) {
      if (!e.altKey || idx < 0) return;
      var d = e.key === 'ArrowRight' ? 1 : (e.key === 'ArrowLeft' ? -1 : 0);
      if (!d) return;
      e.preventDefault();
      var n = (idx + d + PAGES.length) % PAGES.length;
      location.href = PAGES[n].file;
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
