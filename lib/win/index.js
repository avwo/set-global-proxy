var cp = require('child_process');
var join = require('path').join;

var execSync = cp.execSync;
var exec = cp.exec;
var IGNORE_STDIO = { stdio: 'ignore' };
var REFRESH_PROXY = JSON.stringify(join(__dirname, 'refresh'));
var REG_PATH = 'reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings" /v';
var SETTINGS_PATH = '"HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings\\Connections"';
var PORT_RE = /:\d{1,5}$/;

function getRawSettings(stdout) {
  if (stdout && typeof stdout === 'string') {
    var lines = stdout.trim().split(/[\r\n]+/);
    for (var i = 0, len = lines.length; i < len; i++) {
      var line = lines[i].trim().split(/\s+/);
      if (line[0] === 'DefaultConnectionSettings') {
        return (line[2] || '').substring(16);
      }
    }
  }
  return '';
}

function sliceBuf(buf, start, end) {
  return buf.subarray ? buf.subarray(start, end) : buf.slice(start, end);
}

function getServer(callback) {
  var script = `REG QUERY ${SETTINGS_PATH}`;
  exec(script,function(_, stdout) {
    var raw = getRawSettings(stdout);
    if (!raw) {
      return callback('Error');
    }
    var bytes = [];
    var result = {};
    for (var i = 0, len = raw.length; i < len; i += 2) {
      bytes.push(parseInt(raw.substring(i, i + 2), 16));
    }
    var buffer = Buffer.from(bytes);
    var svrLen = buffer[4];
    if (!svrLen) {
      return callback(null, result);
    }
    result.enabled = buffer[0] === 3;
    var server = sliceBuf(buffer, 8, svrLen + 8).toString();
    if (PORT_RE.test(server)) {
      var index = server.lastIndexOf(':');
      result.host = server.substring(0, index);
      result.port = server.substring(index + 1);
    }
    callback(null, result);
  });
}

exports.getServerProxy = (callback) => {
  return getServer(function(err, server) {
    if (err) {
      return callback(err);
    }
    return callback(null, { http: server, https: server });
  });
};

function disableProxy() {
  var proxyCmd = REG_PATH + ' ProxyEnable /t REG_DWORD /d 0 /f';
  var pacCmd = REG_PATH + ' AutoConfigURL /t REG_DWORD /d 0 /f';
  var detectCmd = REG_PATH + ' AutoDetect /t REG_DWORD /d 0 /f';
  execSync(proxyCmd + ' & ' + pacCmd + ' & ' + detectCmd, IGNORE_STDIO);
  execSync(REFRESH_PROXY, IGNORE_STDIO);
  return true;
}

exports.enableProxy = function(options) {
  disableProxy();
  var bypass = options.bypass || [];
  var setCmd = REG_PATH + ' ProxyServer /t REG_SZ /d ' + options.host + ':' + options.port + ' /f';
  var enableCmd = REG_PATH + ' ProxyEnable /t REG_DWORD /d 1 /f';
  var cmd = setCmd + ' & ' + enableCmd;

  bypass = REG_PATH + ' ProxyOverride /t REG_SZ /d "' + bypass.join(';') + '" /f';
  cmd = cmd + ' & ' + bypass;
  execSync(cmd, IGNORE_STDIO);
  execSync(REFRESH_PROXY, IGNORE_STDIO);
  return true;
};

exports.disableProxy = disableProxy;
