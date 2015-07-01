var get_req_props = require('./lib/filters/req').get_req_props;

// the settings that control the behavior of the logger
var settings = {

    // debug   : false,  // will print data to stdout instead of attempting to index data
    // dryrun  : false,  // don't send data, just dump to console
    // verbose : false,  // put some output

    // the prefix of the daily EX indexes created, ala logstash:  foobar-2015.03.14
    prefix : "foobar",
    filters : [null,get_req_props],   // define a list of filter functions in the order you'll pass arguments into the log function -- null == no filter

    // your ES query host(s)
    // details here: http://www.elastic.co/guide/en/elasticsearch/client/javascript-api/current/configuration.html#config-options
    hosts : [
        { host: 'es-server-1.example.com',port: 9200},
        { host: 'es-server-2.example.com',port: 9200}
    ],

    // specific indexing tweaks
    // (turn off analysis for strings you don't want broken into tokens, etc)
    // http://www.elastic.co/guide/en/elasticsearch/reference/current/mapping.html
    mapping: {
        // this pattern should include your prefix -- use the wildcard, Luke
        "template" : "foobar-*",
        "order": 0,
        "settings": {},
        "mappings": {
            // the actual mappings for different _types of docs
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
            "health": {
                "properties": {
                    "id"     : {"index": "not_analyzed","type": "string"},
                    "server" : {"index": "not_analyzed","type": "string"}
                }
            },
        },
        "aliases": {}
    }
};
// set up the logging object
var esl = require('./lib/eslogger')(settings);

// make sure your mappings are up to date
// Generally should only be called on startup, as mappings don't change often
esl.mapping();

// how to log:
// esl.log(_type,doc,[req (optional)]);
esl.log('hit',{'foo':'bar'});


