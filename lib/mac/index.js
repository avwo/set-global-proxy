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

// Cached probe: does the bundled x86_64 helper actually run on this machine?
// On Apple Silicon without Rosetta 2, exec'ing the helper fails with EBADARCH.
// We probe once with `-h` and reuse the result for the lifetime of the process.
var helperUsable;
function isHelperUsable(proxyHelper) {
  if (helperUsable !== undefined) {
    return helperUsable;
  }
  try {
    execSync('\'' + proxyHelper + '\' -h', IGNORE_STDIO);
    helperUsable = true;
  } catch (e) {
    helperUsable = false;
  }
  return helperUsable;
}

function execSafe(cmd) {
  try {
    return execSync(cmd, IGNORE_STDIO);
  } catch (e) {}
}

// Run a batch of shell commands under a single admin prompt via AppleScript.
// Used as a fallback when the privileged helper binary cannot run
// (e.g. Apple Silicon without Rosetta 2 — the bundled helper is x86_64-only).
function execAdmin(commands) {
  if (!commands || !commands.length) {
    return;
  }
  var script = commands.join(' ; ');
  var apple = 'do shell script "' + script.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
    + '" with administrator privileges';
  var shellSafe = apple.replace(/'/g, "'\\''");
  return execSync("osascript -e '" + shellSafe + "'", IGNORE_STDIO);
}

function joinBypass(bypass) {
  if (!bypass) {
    return '';
  }
  // bypass may be an array (from getBypass) or a string.
  if (Array.isArray(bypass)) {
    return bypass.map(function(h) { return '"' + h + '"'; }).join(' ');
  }
  return String(bypass).split(/[\s,;]+/).filter(Boolean).map(function(h) {
    return '"' + h + '"';
  }).join(' ');
}

function buildEnableCommands(options) {
  var host = options.host + ' ' + options.port;
  var bypass = joinBypass(options.bypass);
  var commands = [];
  getAllNetworkServicesSync().forEach(function(service) {
    ['-setftpproxystate', '-setsocksfirewallproxystate', '-setproxyautodiscovery',
      '-setautoproxystate', '-setstreamingproxystate', '-setgopherproxystate'].forEach(function(cmd) {
      commands.push('networksetup ' + cmd + ' "' + service + '" off');
    });
    commands.push('networksetup -setproxybypassdomains "' + service + '" ' + (bypass || '""'));
    commands.push('networksetup -setwebproxy "' + service + '" ' + host);
    commands.push('networksetup -setsecurewebproxy "' + service + '" ' + host);
  });
  return commands;
}

function buildDisableCommands() {
  var commands = [];
  getAllNetworkServicesSync().forEach(function(service) {
    ['-setftpproxystate', '-setsocksfirewallproxystate', '-setproxyautodiscovery',
      '-setautoproxystate', '-setstreamingproxystate', '-setgopherproxystate',
      '-setwebproxystate', '-setsecurewebproxystate'].forEach(function(cmd) {
      commands.push('networksetup ' + cmd + ' "' + service + '" off');
    });
    commands.push('networksetup -setproxybypassdomains "' + service + '" ""');
  });
  return commands;
}

function offAll() {
  getAllNetworkServicesSync().forEach(function(service) {
    ['-setftpproxystate', '-setsocksfirewallproxystate', '-setproxyautodiscovery', '-setautoproxystate',
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
  var helperFailed = !isHelperUsable(proxyHelper);
  if (!helperFailed) {
    try {
      execSync('\'' + proxyHelper + '\' -m global -p ' + port + ' -r ' + port + ' -s ' + options.host + bypass, IGNORE_STDIO);
    } catch (e) {
      helperFailed = true;
    }
  }
  if (helperFailed) {
    // The setuid helper is unavailable (typically: Apple Silicon without Rosetta).
    // Batch every networksetup change into one administrator-elevated AppleScript
    // so the user only sees a single password prompt.
    try {
      execAdmin(buildEnableCommands(options));
    } catch (e) {
      // Last-resort: try without elevation. On modern macOS this usually fails
      // silently for proxy mutations, but it preserves the previous behavior
      // for environments where networksetup happens to be unprivileged.
      var host = options.host + ' ' + port;
      offAll();
      execServicesSync(function(service) {
        execSafe('networksetup -setwebproxy "' + service + '" ' + host);
        execSafe('networksetup -setsecurewebproxy "' + service + '" ' + host);
        if (originBypass) {
          execSafe('networksetup -setproxybypassdomains "' + service + '" ' + originBypass);
        }
      });
    }
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
  var helperFailed = !isHelperUsable(proxyHelper);
  if (!helperFailed) {
    try {
      execSync('\''  + proxyHelper + '\' -m off', IGNORE_STDIO);
    } catch (e) {
      helperFailed = true;
    }
  }
  if (helperFailed) {
    try {
      execAdmin(buildDisableCommands());
    } catch (e) {
      offAll();
      execServicesSync(function(service) {
        execSafe('networksetup -setwebproxystate "' + service + '" off');
        execSafe('networksetup -setsecurewebproxystate "' + service + '" off');
      });
    }
  }
  try {
    var curProxy = getServerProxySync();
    return !curProxy.http.enabled && !curProxy.https.enabled;
  } catch (e) {}
  return true;
};

exports.getUid = getUid;
exports.isHelperUsable = function(proxyHelper) {
  return isHelperUsable(proxyHelper || PROXY_HELPER);
};
