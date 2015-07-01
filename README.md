## Logging, esse
This is a light wrapper for sending data to Elasticsearch in a predictable manner.
It uses the [Elasticsearch JS Client](http://www.elastic.co/guide/en/elasticsearch/client/javascript-api/current/) and accepts all the same arguments for configuration

## Main features:
- Daily log indexes using a logstash-style naming with your supplied prefix
- Map Index creation and update capabilites (to make sure your data gets digested the way you like)
- Buffering and Bulk Insert by default, to decouple log load from ES connections.
- fine-grained filtering for particular object types, e.g. http request objects (built in)
- user-defined filtering - create a function that returns an object, and it will be matched to incoming arguments

## Installation
```npm install eslogger --save```

## Example Usage
Put this in a script, and edit the hosts array to point at a legit Elasticsearch destination, then run it.
It will start a webserver that you can browse to at `127.0.0.1:1337`.  Each time you visit that page, you'll
be creating a "hit" document.
*Note:*
- Set `dryrun:false` if you want to actually send data out.
- `filters:[null,'req']` define how the arguments are handled when calling `esl.log('hit',{foo:'bar'},req);`  `null` means no filtering, `'req'` means use the built-in request object filter, or you can supply your own filter function(s)


```javascript

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

```

