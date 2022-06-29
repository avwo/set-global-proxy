var execSync = require('child_process').execSync;
var join = require('path').join;
var fs = require('fs');

var PROXY_HELPER = join(__dirname, 'Whistle');
var SUDO = [
  'sudo chown root:admin "' + PROXY_HELPER + '"',
  'sudo chmod a+rx+s "' + PROXY_HELPER + '"'
].join('&&');

function getProxyServer(isSecure) {
  var str = execSync('networksetup -get' + (isSecure ? 'secure' : '') + 'webproxy "Wi-Fi"') + '';
  var result = {};
  str.split(/[\r\n]+/).forEach(function(line) {
    var index = line.indexOf(':');
    var key = line.substring(0, index).trim().toLowerCase();
    var value = line.substring(index + 1).trim().toLowerCase();
    if (key === 'enabled') {
      result.enabled = value === 'yes';
    } else if (key === 'server') {
      result.host = value;
    } else if (key === 'port') {
      result.port = value;
    }
  });
  return result;
}

function getCurProxy() {
  return {
    http: getProxyServer(),
    https: getProxyServer(true)
  };
}

function checkProxy(p1, p2) {
  if (!p1.enabled) {
    return false;
  }
  return p1.host == p2.host && p1.port == p2.port;
}

function getUid() {
  try {
    return  fs.statSync(PROXY_HELPER).uid;
  } catch (e) {}
}

exports.enableProxy = function(options) {
  var bypass = options.bypass;
  var port = options.port;
  if (bypass) {
    bypass = ' -x "' + bypass + '"';
  } else {
    bypass = '';
  }
  if (options.sudo && getUid() !== 0) {
    try {
      execSync(SUDO);
    } catch (e) {}
  }
  execSync('\'' + PROXY_HELPER + '\' -m global -p ' + port + ' -r ' + port + ' -s ' + options.host + bypass);
  try {
    var curProxy = getCurProxy();
    return checkProxy(curProxy.http, options) && checkProxy(curProxy.https, options);
  } catch (e) {}
  return true;
};

exports.disableProxy = function() {
  execSync('\''  + PROXY_HELPER + '\' -m off');
  try {
    var curProxy = getCurProxy();
    return !curProxy.http.enabled && !curProxy.https.enabled;
  } catch (e) {}
  return true;
};
