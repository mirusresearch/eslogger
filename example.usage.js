
var prefix = "thefoobar"
var settings = {
    dryrun  : true,
    verbose : true,
    prefix  : prefix,
    filters : [null,'req'],
    hosts   : [
        { host: 'es-server-1.my-es-cluster.com',port: 9200},
        { host: 'es-server-2.my-es-cluster.com',port: 9200}
    ],
    mapping : {
        "template" : prefix + "-*",
        "order": 0,
        "settings": {},
        "mappings": {
            "hit" : {
                "properties":{
                    "id"              : {"index": "not_analyzed", "type": "string"},
                    "domain_name"     : {"index": "not_analyzed", "type": "string"},
                    "browser"         : {"index": "not_analyzed", "type": "string"},
                    "http_referer"    : {"index": "not_analyzed", "type": "string", "ignore_above": 512},
                    "http_user_agent" : {"index": "not_analyzed", "type": "string", "ignore_above": 256},
                    "ip_address"      : {"index": "not_analyzed", "type": "string"},
                    "server"          : {"index": "not_analyzed", "type": "string"},
                    "querystring"     : {"index": "not_analyzed", "type": "string", "ignore_above": 256},
                    "os.family"       : {"index": "not_analyzed", "type": "string"},
                }
            },
        },
        "aliases": {}
    }
};
var esl = require('eslogger').ESLogger(settings);
esl.mapping();

// set up an example web service to do some logging
var http = require('http');
http.createServer(function (req, res) {
    res.writeHead(200, {'Content-Type': 'text/plain'});
    res.end('Hello World\n');
    esl.log('hit',{foo:'bar'},req);
}).listen(1337, '127.0.0.1');
console.log('Server running at http://127.0.0.1:1337/');
