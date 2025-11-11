var os = require('os');
var net = require('net');
var fs = require('fs');
var mac = require('./lib/mac');
var win = require('./lib/win');
var linux = require('./lib/linux');
var script = require('./lib/mac/script');

var platform = os.platform();
var BYPASS_RE = /^[*a-z\d_-]+(?:\.[*a-z\d_-]+)*$/i;
var CIDR_RE = /^([(a-z\d:.]+)\/\d{1,2}$/i;

function isCIDR(host) {
  host = CIDR_RE.exec(host);
  if (!host) {
    return false;
  }
  return net.isIP(host[1]);
}

function getBypass(bypass) {
  if (!bypass || typeof bypass !== 'string') {
    return;
  }
  var map = {};
  bypass = bypass.trim().toLowerCase();
  return bypass.split(/[\s,;]+/).filter(function(host) {
    if (!map[host] && (host === '<local>' || host === '<-loopback>' || net.isIP(host) || BYPASS_RE.test(host) || isCIDR(host))) {
      map[host] = 1;
      return true;
    }
    return false;
  });
}

function checkExists() {
  if (!fs.existsSync(mac.PROXY_HELPER)) {
    return false;
  }
  return fs.statSync(mac.PROXY_HELPER).size > 0;
}

function initProxyHelper(retry) {
  try {
    if (!checkExists()) {
      fs.writeFileSync(mac.PROXY_HELPER, script);
    }
  } catch (e) {
    if (!retry) {
      initProxyHelper(true);
    }
  }
}

// only support mac & win & linux for now
function getProxyMgr() {
  if (platform === 'win32') {
    return win;
  }
  if (platform === 'darwin') {
    initProxyHelper();
    return mac;
  }
  if (platform === 'linux') {
    return linux;
  }
  // unsupported platform
  throw new Error('Platform ' + platform + ' is unsupported to set global proxy for now.');
}

exports.enableProxy = function(options) {
  var host = options.host.toLowerCase();
  var enableProxy = getProxyMgr().enableProxy;
  var bypass = getBypass(options.bypass);
  return enableProxy({
    host: host,
    port: options.port,
    bypass: bypass,
    sudo: options.sudo,
    proxyHelper: options.proxyHelper
  });
};

exports.disableProxy = function(sudo) {
  var disableProxy = getProxyMgr().disableProxy;
  return disableProxy(sudo);
};

exports.getServerProxy = function(callback) {
  return getProxyMgr().getServerProxy(callback);
};

exports.getMacProxyHelper = function() {
  return getProxyMgr().PROXY_HELPER;
};

exports.getUid = function(file) {
  var getUid = getProxyMgr().getUid;
  return getUid && getUid(file);
};

exports.getBypass = getBypass;
