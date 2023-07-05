var execSync = require('child_process').execSync;
var join = require('path').join;
var fs = require('fs');

var PROXY_HELPER = join(__dirname, 'whistle');
var SUDO = [
  'sudo chown root:admin "' + PROXY_HELPER + '"',
  'sudo chmod a+rx+s "' + PROXY_HELPER + '"'
].join('&&');

function execSafe(cmd) {
  try {
    return execSync(cmd);
  } catch (e) {}
}

function offAll() {
  ['-setftpproxystat', '-setsocksfirewallproxystate', '-setproxyautodiscovery', '-setautoproxystate',
    '-setstreamingproxystate', '-setgopherproxystate'].forEach(function(cmd) {
      execSafe('networksetup ' +cmd + ' "Wi-Fi" off');
    });
  execSafe('networksetup -setproxybypassdomains "Wi-Fi" ""');
}

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

function getUid(proxyHelper) {
  try {
    return  fs.statSync(proxyHelper).uid;
  } catch (e) {}
}

function checkSudo() {
  if (getUid(PROXY_HELPER) !== 0) {
    try {
      execSync(SUDO);
    } catch (e) {}
  }
}

exports.PROXY_HELPER = PROXY_HELPER;

exports.enableProxy = function(options) {
  options.sudo && checkSudo();
  var proxyHelper = options.proxyHelper || PROXY_HELPER;
  var originBypass = options.bypass;
  var bypass = originBypass;
  var port = options.port;
  if (bypass) {
    bypass = ' -x "' + bypass + '"';
  } else {
    bypass = '';
  }
  try {
    execSync('\'' + proxyHelper + '\' -m global -p ' + port + ' -r ' + port + ' -s ' + options.host + bypass);
  } catch (e) {
    var host = options.host + ' ' + port;
    // 只处理 Wi-Fi 模式
    offAll();
    execSync('networksetup -setwebproxy "Wi-Fi" ' + host);
    execSync('networksetup -setsecurewebproxy "Wi-Fi" ' + host);
    if (originBypass) {
      execSafe('networksetup -setproxybypassdomains "Wi-Fi" ' + originBypass);
    }
  }
  try {
    var curProxy = getCurProxy();
    return checkProxy(curProxy.http, options) && checkProxy(curProxy.https, options);
  } catch (e) {}
  return true;
};

exports.disableProxy = function(sudo) {
  var proxyHelper = PROXY_HELPER;
  if (sudo) {
    if (typeof sudo === 'string') {
      proxyHelper = sudo;
    } else {
      checkSudo();
    }
  }
  try {
    execSync('\''  + proxyHelper + '\' -m off');
  } catch (e) {
    offAll();
    execSync('networksetup -setwebproxystate "Wi-Fi" off');
    execSync('networksetup -setsecurewebproxystate "Wi-Fi" off');
  }
  try {
    var curProxy = getCurProxy();
    return !curProxy.http.enabled && !curProxy.https.enabled;
  } catch (e) {}
  return true;
};

exports.getUid = getUid;
