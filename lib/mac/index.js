var fs = require('fs');
var os = require('os');
var path = require('path');
var crypto = require('crypto');
var { exec, execSync, execFileSync } = require('child_process');
var { execServicesSync, getResultSync, filterProxyResult, getResult } = require('./util');

var IGNORE_STDIO = { stdio: 'ignore' };
var proxyStript = path.join(__dirname, 'proxy.sh');
var PROXY_HELPER = path.join(os.homedir(), '.set-global-proxy.sh');
var scriptInfo;

function createHash(str) {
  return crypto.createHash('sha256').update(str).digest('hex');
}

function loadScript() {
  if (!scriptInfo) {
    var value = fs.readFileSync(proxyStript, 'utf8');
    scriptInfo = { hash: createHash(value), value: value};
  }
  return scriptInfo;
}

function initProxyHelper(helper) {
  var value = loadScript().value;
  if (!fs.existsSync(helper) || fs.readFileSync(helper, 'utf8') !== value) {
    fs.writeFileSync(helper, value, 'utf8');
  }
  return helper;
}

function getCmd(sudo) {
  sudo = sudo ? 'sudo ' : '';
  return [
    sudo + 'chown root:admin "' + PROXY_HELPER + '"',
    sudo + 'chmod a+rx+s "' + PROXY_HELPER + '"'
  ].join('&&');
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

function hasSudo() {
  try {
    initProxyHelper(PROXY_HELPER);
  } catch (e) {
    try {
      var hash = loadScript().hash;
      PROXY_HELPER = initProxyHelper(path.join(os.homedir(), '.set-global-proxy-' + hash + '.sh'));
    } catch (e) {}
  }
  try {
    return fs.statSync(PROXY_HELPER).uid === 0;
  } catch (e) {}
}

function checkSudo() {
  if (!hasSudo()) {
    execSync(getCmd(true), IGNORE_STDIO);
  }
}

exports.sudoProxyHelper = function(sudoPrompt) {
  if (hasSudo()) {
    return;
  }
  return new Promise(function(resolve, reject) {
    sudoPrompt(getCmd(), function(err, stdout) {
      if (err) {
        reject(err);
      } else {
        resolve(stdout);
      }
    });
  });
};

exports.enableProxy = function (options) {
  options.sudo && checkSudo();
  var bypass = (options.bypass || []).join();
  execServicesSync(function(service) {
    execFileSync(PROXY_HELPER, [service, options.host, options.port, bypass], IGNORE_STDIO);
  });
  try {
    var curProxy = getServerProxySync();
    return checkProxy(curProxy.http, options) && checkProxy(curProxy.https, options);
  } catch (e) {}
  return true;
};
exports.disableProxy = function disableProxy(sudo) {
  sudo && checkSudo();
  execServicesSync(function(service) {
    execFileSync(PROXY_HELPER, [service], IGNORE_STDIO);
  });
  try {
    var curProxy = getServerProxySync();
    return !curProxy.http.enabled && !curProxy.https.enabled;
  } catch (e) {}
  return true;
};
