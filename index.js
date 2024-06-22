var os = require('os');
var net = require('net');
var fs = require('fs');
var AdmZip = require('adm-zip');
var mac = require('./lib/mac');
var win = require('./lib/win');

var platform = os.platform();
var BYPASS_RE = /^[*a-z\d_-]+(?:\.[*a-z\d_-]+)*$/i;

function getBypass(bypass) {
  if (!bypass || typeof bypass !== 'string') {
    return;
  }
  var map = {};
  bypass = bypass.trim().toLowerCase();
  return bypass.split(/[\s,;]+/).filter(function(host) {
    if (!map[host] && (host === '<local>' || net.isIP(host) || BYPASS_RE.test(host))) {
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

function initProxyHelper() {
  if (!checkExists()) {
    var buf = fs.readFileSync(mac.PROXY_HELPER + '.jsx');
    var entry = new AdmZip(buf).getEntries()[0];
    fs.writeFileSync(mac.PROXY_HELPER, entry.getData());
  }
}

// only support mac & win
function getProxyMgr() {
  if (platform === 'win32') {
    return win;
  }
  if (platform === 'darwin') {
    try {
      initProxyHelper();
    } catch (e) {
      initProxyHelper();
    }
    return mac;
  }
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
