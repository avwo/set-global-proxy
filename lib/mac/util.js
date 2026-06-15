var os = require('os');
var path = require('path');
var fs = require('fs');
var { exec, execSync } = require('child_process');

var PROXY_HELPER = path.join(__dirname, 'proxy.sh');

function parseAllNetworkServices(str) {
  var services = [];
  String(str).split(/[\r\n]+/).slice(1).forEach(function(line) {
    var name = line.trim();
    if (name === 'Wi-Fi' || /^Ethernet(\s+\d+)?$/.test(name)) {
      services.push(name);
    }
  });
  if (services.length === 0 || services.indexOf('Wi-Fi') === -1) {
    services.push('Wi-Fi');
  }
  return services;
}


function getAllNetworkServicesSync() {
  try {
    return parseAllNetworkServices(execSync('networksetup -listallnetworkservices'));
  } catch (error) {
    return ['Wi-Fi', 'Ethernet'];
  }
}

function getAllNetworkServices(cb) {
  exec('networksetup -listallnetworkservices', function(err, stdout) {
    if (err) {
      return cb(['Wi-Fi', 'Ethernet']);
    }
    cb(parseAllNetworkServices(stdout));
  });
}

function execServicesSync(fn, result) {
  var err;
  getAllNetworkServicesSync().forEach(function(service) {
    try {
      if (Array.isArray(result)) {
        result.push(fn(service));
      } else {
        fn(service);
      }
      err = null;
    } catch (e) {
      if (err === undefined) {
        err = e;
      }
    }
  });
  if (err) {
    throw err;
  }
  return result;
}

exports.execServicesSync = execServicesSync;

exports.getResultSync = function(fn) {
  return execServicesSync(fn, []);
};

exports.getResult = function(fn, cb) {
  var result = [];
  var err;
  var execCb = function() {
    if (err) {
      cb(err);
    } else {
      cb(null, result);
    }
  };
  getAllNetworkServices(function(services) {
    var pending = services.length;
    services.forEach(function(service) {
      fn(service, function(e, data) {
        if (e) {
          if (err === undefined) {
            err = e;
          }
        } else {
          err = null;
          result.push(data);
        }
        if (--pending === 0) {
          execCb();
        }
      });
    });
  });
};


exports.filterProxyResult = function(list) {
  var result = list && list[0];
  if (!result) {
    return {};
  }
  for (var i = 1, len = list.length; i < len; i++) {
    var item = list[i];
    if (!item.enabled !== !result.enabled || item.host !== result.host || item.port !== result.port) {
      return {};
    }
  }
  return result;
};

exports.getProxyHelper = function() {
  var proxyHelper = path.join(os.homedir(), '.set-global-proxy.sh');
  var content = fs.readFileSync(PROXY_HELPER, 'utf8');
  if (fs.existsSync(proxyHelper)) {
    if (fs.readFileSync(proxyHelper, 'utf8') === content) {
      return proxyHelper;
    }
  }
  fs.writeFileSync(proxyHelper, content, 'utf8');
  return proxyHelper;
};
