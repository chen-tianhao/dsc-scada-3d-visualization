/* =====================================================================
 * server.js  ·  DCS/SCADA 大屏静态服务（零依赖，Node 内置模块）
 *
 *   node server.js            # 默认 8080
 *   node server.js 9000       # 指定端口
 *   PORT=9000 node server.js  # 环境变量指定
 *
 * 监听 0.0.0.0：本机 http://localhost:<port> 与局域网 http://<LAN-IP>:<port> 均可访问。
 * ===================================================================== */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const url = require('url');

const ROOT = __dirname;
const PORT = Number(process.argv[2] || process.env.PORT || 8080);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8'
};

/** 列出本机可用于局域网访问的 IPv4 地址 */
function lanAddresses() {
  const out = [];
  const ifaces = os.networkInterfaces();
  Object.keys(ifaces).forEach(function (name) {
    (ifaces[name] || []).forEach(function (ni) {
      if (ni.family === 'IPv4' && !ni.internal) out.push(ni.address);
    });
  });
  return out;
}

function send(res, code, body, headers) {
  const h = Object.assign({
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'X-Content-Type-Options': 'nosniff'
  }, headers || {});
  res.writeHead(code, h);
  res.end(body);
}

function sendFile(res, filePath, stat) {
  const ext = path.extname(filePath).toLowerCase();
  const type = MIME[ext] || 'application/octet-stream';
  res.writeHead(200, {
    'Content-Type': type,
    'Content-Length': stat.size,
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'X-Content-Type-Options': 'nosniff'
  });
  fs.createReadStream(filePath)
    .on('error', function () { try { res.end(); } catch (e) { /* noop */ } })
    .pipe(res);
}

/** 路径穿越防护：解析后必须仍在 ROOT 之内 */
function resolveSafe(pathname) {
  let p;
  try {
    p = decodeURIComponent(pathname);
  } catch (e) {
    return null;
  }
  if (p.indexOf('\0') !== -1) return null;
  const full = path.resolve(ROOT, '.' + path.posix.normalize(p.split(path.sep).join('/')));
  if (full !== ROOT && !full.startsWith(ROOT + path.sep)) return null;
  return full;
}

const server = http.createServer(function (req, res) {
  let pathname = '/';
  try {
    pathname = url.parse(req.url).pathname || '/';
  } catch (e) {
    return send(res, 400, 'Bad Request', { 'Content-Type': 'text/plain; charset=utf-8' });
  }

  if (pathname === '/' || pathname === '') pathname = '/index.html';

  const full = resolveSafe(pathname);
  if (!full) {
    return send(res, 403, '403 Forbidden', { 'Content-Type': 'text/plain; charset=utf-8' });
  }

  fs.stat(full, function (err, stat) {
    if (err) {
      return send(res, 404, '404 Not Found: ' + pathname, { 'Content-Type': 'text/plain; charset=utf-8' });
    }
    if (stat.isDirectory()) {
      const idx = path.join(full, 'index.html');
      return fs.stat(idx, function (e2, s2) {
        if (e2 || !s2.isFile()) {
          return send(res, 404, '404 Not Found: ' + pathname, { 'Content-Type': 'text/plain; charset=utf-8' });
        }
        sendFile(res, idx, s2);
      });
    }
    sendFile(res, full, stat);
  });
});

server.on('error', function (err) {
  if (err && err.code === 'EADDRINUSE') {
    console.error('\n[错误] 端口 ' + PORT + ' 已被占用。请换一个端口，例如：\n  node server.js 8081\n');
  } else {
    console.error('\n[错误] 服务启动失败：', err && err.message);
  }
  process.exit(1);
});

server.listen(PORT, '0.0.0.0', function () {
  const lans = lanAddresses();
  const line = '─'.repeat(58);
  console.log('\n' + line);
  console.log('  DCS · SCADA 大屏服务已启动  (端口 ' + PORT + ', 监听 0.0.0.0)');
  console.log(line);
  console.log('  本机访问 :  http://localhost:' + PORT + '/');
  console.log('              http://127.0.0.1:' + PORT + '/');
  if (lans.length) {
    lans.forEach(function (ip) {
      console.log('  局域网访问:  http://' + ip + ':' + PORT + '/');
    });
  } else {
    console.log('  局域网访问:  未检测到可用网卡（未连接网络？）');
  }
  console.log(line);
  console.log('  入口  : /                 总览（含三块大屏跳转）');
  console.log('  大屏  : /01_panorama.html  工艺全景');
  console.log('          /02_pumps_focus.html 输送设备');
  console.log('          /03_process_flow.html 工艺走向');
  console.log(line);
  console.log('  停止服务：Ctrl + C\n');
});

process.on('SIGINT', function () {
  console.log('\n[停止] 服务已关闭\n');
  process.exit(0);
});
