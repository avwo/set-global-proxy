var cp = require('child_process');

var execSync = cp.execSync;
var exec = cp.exec;
var IGNORE_STDIO = { stdio: 'ignore' };

function execSafe(cmd) {
  try {
    return execSync(cmd, IGNORE_STDIO);
  } catch (e) {}
}

function getValue(value, isPort) {
  var type = typeof value;
  if (type === 'number') {
    return isPort ? (value > 0 && value < 65536 ? value + '' : '') : '';
  }
  if (type !== 'string' || value === 'null' || value === 'undefined') {
    return '';
  }
  value = value.trim();
  if (isPort) {
    return /[^\d]/.test(value) ? '' : value ;
  }
  return value.replace(/['"]/g, '');
}

function getScript(isSecure, isPort) {
  return 'gsettings get org.gnome.system.proxy.http' + (isSecure ? 's' : '') + (isPort ? ' port' : ' host');
}

function isEmpty(obj) {
  return !obj || obj.host == null || obj.port == null;
}

exports.getServerProxy = function(callback) {
  var result = { http: {}, https: {} };
  var handleCallback = function(err) {
    if (!result) {
      return;
    }
    if (err) {
      result = null;
      return callback(err);
    }
    if (!isEmpty(result.http) && !isEmpty(result.https)) {
      result.http.enabled = true;
      result.https.enabled = true;
      callback(null, result);
      result = null;
    }
  };
  exec('gsettings get org.gnome.system.proxy mode', function(err, mode) {
    if (err) {
      return callback(err);
    }
    if (!/manual/.test(mode)) {
      return callback(null, result);
    }
    exec(getScript(), function(err, stdout) {
      if (result) {
        result.http.host = getValue(stdout);
        handleCallback(err);
      }
    });
    exec(getScript(false, true), function(err, stdout) {
      if (result) {
        result.http.port = getValue(stdout, true);
        handleCallback(err);
      }
    });
    exec(getScript(true), function(err, stdout) {
      if (result) {
        result.https.host = getValue(stdout);
        handleCallback(err);
      }
    });
    exec(getScript(true, true), function(err, stdout) {
      if (result) {
        result.https.port = getValue(stdout, true);
        handleCallback(err);
      }
    });
  });
};

exports.enableProxy = function(options) {
  execSync('gsettings set org.gnome.system.proxy mode "manual"', IGNORE_STDIO);
  execSync('gsettings set org.gnome.system.proxy.http host ' + options.host, IGNORE_STDIO);
  execSync('gsettings set org.gnome.system.proxy.http port ' + options.port, IGNORE_STDIO);
  execSync('gsettings set org.gnome.system.proxy.https host ' + options.host, IGNORE_STDIO);
  execSync('gsettings set org.gnome.system.proxy.https port ' + options.port, IGNORE_STDIO);
  execSafe('gsettings set org.gnome.system.proxy.ftp ""');
  execSafe('gsettings set org.gnome.system.proxy.socks ""');
  var bypass = options.bypass ? JSON.stringify(options.bypass).replace(/"/g, '\'') : '[]';
  execSafe('gsettings set org.gnome.system.proxy ignore-hosts "' + bypass + '"');
  return true;
};

exports.disableProxy = function() {
  execSync('gsettings set org.gnome.system.proxy mode "none"', IGNORE_STDIO);
  return true;
};
