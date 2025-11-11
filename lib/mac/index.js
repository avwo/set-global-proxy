var cp = require('child_process');
var join = require('path').join;
var fs = require('fs');
var { getAllNetworkServicesSync, execServicesSync, getResultSync, filterProxyResult, getResult } = require('./util');

var execSync = cp.execSync;
var exec = cp.exec;
var IGNORE_STDIO = { stdio: 'ignore' };
var PROXY_HELPER = join(__dirname, 'whistle');
var SUDO = [
  'sudo chown root:admin "' + PROXY_HELPER + '"',
  'sudo chmod a+rx+s "' + PROXY_HELPER + '"'
].join('&&');

function execSafe(cmd) {
  try {
    return execSync(cmd, IGNORE_STDIO);
  } catch (e) {}
}

function offAll() {
  getAllNetworkServicesSync().forEach(function(service) {
    ['-setftpproxystat', '-setsocksfirewallproxystate', '-setproxyautodiscovery', '-setautoproxystate',
    '-setstreamingproxystate', '-setgopherproxystate'].forEach(function(cmd) {
      execSafe('networksetup ' +cmd + ' "' + service + '" off');
    });
    execSafe('networksetup -setproxybypassdomains "' + service + '" ""');
  });
}

function parseServer(str) {
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

function getScript(isSecure, service) {
  return 'networksetup -get' + (isSecure ? 'secure' : '') + 'webproxy "' + (service || 'Wi-Fi') + '"';
}

function getServer(isSecure) {
  var result = getResultSync(function(service) {
    var str = execSync(getScript(isSecure, service)) + '';
    return parseServer(str);
  });
  return filterProxyResult(result);
}

exports.getServerProxy = function(callback) {
  var result = {};
  var handleCallback = function(err) {
    if (!result) {
      return;
    }
    if (err) {
      result = null;
      return callback(err);
    }
    if (result.http && result.https) {
      callback(null, result);
      result = null;
    }
  };
  getResult(function(service, cb) {
    exec(getScript(false, service), function(err, stdout) {
      if (err) {
        return cb(err);
      }
      cb(null, typeof stdout === 'string' ? parseServer(stdout) : '');
    });
  }, function(err, list) {
    if (result) {
      result.http = filterProxyResult(list);
      handleCallback(err);
    }
  });

  getResult(function(service, cb) {
    exec(getScript(true, service), function(err, stdout) {
      if (err) {
        return cb(err);
      }
      cb(null, typeof stdout === 'string' ? parseServer(stdout) : '');
    });
  }, function(err, list) {
    if (result) {
      result.https = filterProxyResult(list);
      handleCallback(err);
    }
  });
};

function getServerProxySync() {
  return {
    http: getServer(),
    https: getServer(true)
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
    return fs.statSync(proxyHelper).uid;
  } catch (e) {}
}

function checkSudo() {
  if (getUid(PROXY_HELPER) !== 0) {
    execSafe(SUDO);
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
    execSync('\'' + proxyHelper + '\' -m global -p ' + port + ' -r ' + port + ' -s ' + options.host + bypass, IGNORE_STDIO);
  } catch (e) {
    var host = options.host + ' ' + port;
    offAll();
    execServicesSync(function(service) {
      execSync('networksetup -setwebproxy "' + service + '" ' + host, IGNORE_STDIO);
      execSync('networksetup -setsecurewebproxy "' + service + '" ' + host, IGNORE_STDIO);
      if (originBypass) {
        execSafe('networksetup -setproxybypassdomains "' + service + '" ' + originBypass);
      }
    });
  }
  try {
    var curProxy = getServerProxySync();
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
    execSync('\''  + proxyHelper + '\' -m off', IGNORE_STDIO);
  } catch (e) {
    offAll();
    execServicesSync(function(service) {
      execSync('networksetup -setwebproxystate "' + service + '" off', IGNORE_STDIO);
      execSync('networksetup -setsecurewebproxystate "' + service + '" off', IGNORE_STDIO);
    });
  }
  try {
    var curProxy = getServerProxySync();
    return !curProxy.http.enabled && !curProxy.https.enabled;
  } catch (e) {}
  return true;
};

exports.getUid = getUid;
