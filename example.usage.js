
// the settings that control the behavior of the logger
var settings = {
    // will print data to stdout instead of attempting to index data
    // debug : true,

    // the prefix of the daily EX indexes created, ala logstash:  foobar-2015.03.14
    prefix : "foobar",

    // your ES host(s) -- details here: http://www.elastic.co/guide/en/elasticsearch/client/javascript-api/current/configuration.html#config-options
    hosts : [
        { host: 'es-server-1.example.com',port: 9200},
        { host: 'es-server-2.example.com',port: 9200}
    ],

    // the way you want your data to be handled (turn off analysis for strings you don't want broken into tokens)
    //
    mapping : {
        templates: {
            // this usually matches your prefix
            "foobar": {
                // this pattern should match your indexes to be created -- use the wildcard, Luke
                "template" : "foobar-*",
                "order": 0,
                "settings": {},
                "mappings": {
                    // the actual mappings for different _types of docs
                    // http://www.elastic.co/guide/en/elasticsearch/reference/current/mapping.html
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
        }
    }
};
// set up the logging object
var esl = require('./lib/eslogger')(settings);

// make sure your mappings are up to date
// I usually call once on startup only, as mappings don't change often
esl.mapping();

// how to log:
// log a doc
esl.log('hit',{'foo':'bar'});


