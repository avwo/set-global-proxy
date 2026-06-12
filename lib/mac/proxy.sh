#!/bin/bash

if  [  "$2"  !=  ""  ];  then
    networksetup -setwebproxy "$1" $2 $3  # set Web HTTP proxy
    networksetup -setsecurewebproxy "$1" $2 $3    # set Web HTTPS proxy
    if  [  "$4"  !=  ""  ];  then
      networksetup -setproxybypassdomains "$1" $4   # set proxy bypass domains
    else
      networksetup -setproxybypassdomains "$1" empty   # empty proxy bypass domains
    fi
    networksetup -setwebproxystate "$1" on    # turn on Web HTTP proxy
    networksetup -setsecurewebproxystate "$1" on   # turn on Web HTTPS proxy
else
    networksetup -setproxybypassdomains "$1" empty   # empty proxy bypass domains
    networksetup -setwebproxystate "$1" off    # turn off Web HTTP proxy
    networksetup -setsecurewebproxystate "$1" off   # turn off Web HTTPS proxy
fi

networksetup -setftpproxystate "$1" off 2>/dev/null || true   # turn off FTP proxy
networksetup -setsocksfirewallproxystate "$1" off 2>/dev/null || true   # turn off SOCKS proxy
networksetup -setproxyautodiscovery "$1" off 2>/dev/null || true   # turn off automatic proxy discovery
networksetup -setautoproxystate "$1" off 2>/dev/null || true   # turn off automatic proxy
