const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');
require('./src/index.js');
