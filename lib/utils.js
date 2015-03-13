
var
    url          = require('url')
    , _            = require('lodash')
    , useragent    = require('useragent')
    , ipaddr       = require('ipaddr.js')
    , request      = require('request')
    , fs           = require('fs')
;


var uuid = exports.uuid = function(a){return a?(a^Math.random()*16>>a/4).toString(16):([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g,uuid)};

// a safe way to pull values from deep within an object
// and fail gracefully if the property/method isn't there
// ------------------------------------------------------ //
var deepattr = exports.deepattr = function(obj, path, def) {
    var o = obj;
    var props = path.split('.');    // console.log('deepattr   outer:',o);
    for (var i=0; i < props.length; i++) {
        var p = props[i];           // console.log('       inner:',i,p,o);
        if (_.has(o,p)){
            o = o[p];               // console.log('       new o:',i,p,o);
        }else{
            return def;
        }
    }                               // console.log('deepattr('+path+'):',o);
    return o;
};


// Load up the Amazon IP ranges
// details: http://docs.aws.amazon.com/general/latest/gr/aws-ip-ranges.html
// source: https://ip-ranges.amazonaws.com/ip-ranges.json
// stored locally: aws.ip-ranges.json
// last updated on 2015.03.13
var aws_raw = require(__dirname + '/aws.ip-ranges.json');
var aws_ip_ranges = _.map(aws_raw.prefixes, function(o) {
    var j = o.ip_prefix.split('/');
    return _.extend(o, {
        ip: ipaddr.parse(j[0]),
        range: parseInt(j[1], 10),
    });
});

var is_aws_ip = exports.is_aws_ip = function(ip,return_boolean){
    var out = {is_ip:false,is_amazon:false,region:null,service:null};
    if (ipaddr.IPv4.isValid(ip)){
        var ipa = ipaddr.parse(ip);
        out.is_ip = true;
        _.each(aws_ip_ranges,function(r){
            if (ipa.match(r.ip,r.range)){
                out.is_amazon = true;
                out.region    = r.region;
                out.service   = r.service;
                return false;
            }
        });
    }
    return (return_boolean)?out.is_amazon:out;
};


// extract browser type
// ------------------------------------------------------ //
var extract_user_agent_properties = exports.extract_user_agent_properties = function(ua){
    var agent = useragent.parse(ua);
    var rgx = /bot|spider|winhttp|urllib|java|apache/i;
    props = {
        is_bot      : rgx.test(ua)?true:false
        ,os         : agent.os
        ,browser    : ''
        ,bot        : ''
    };

    if ((agent.family == 'Other' || agent.os == 'Other') && props.is_bot){ // handle the unknowns (seems like there are a lot)
        var tokens = ua.split(';');
        for (var i=0; i < tokens.length; i++) {
            var t = tokens[i];
            if (rgx.test(t)){
                props.bot = t.replace(/(^\s*)|(\s*$)/gi,"").replace(/\n/,"");
                break;
            }
        }
    }else if (agent.family == 'Other'){
        // tomb of the unknown user-agent
    }else{
        props.browser = agent.family + ' ' + agent.major + '.' + agent.minor + '.' + agent.patch;
    }
    return props;
};

// extract search engine values
// ------------------------------------------------------ //
var search_engine_properties = exports.search_engine_properties = function(referer){
    referer = referer || '';
    var engine = referer.search("https?://(.*)google.([^/?]*)") === 0 ? "google":
            referer.search("https?://(.*)bing.com") === 0 ? "bing":
            referer.search("https?://(.*)yahoo.com") === 0 ? "yahoo":
            referer.search("https?://(.*)duckduckgo.com") === 0 ? "duckduckgo": "";
    var keyword = (engine.length)?get_search_query_param(referer, engine != "yahoo" ? "q": "p"):'';
    return {
        'is_search_engine': (engine.length)?true:false
        ,'search_engine':engine
        ,'search_keyword':keyword
    };
};

var get_search_query_param = exports.get_search_query_param = function(referer, query_char) {
    query_char = query_char.replace(/[\[]/, "\\[").replace(/[\]]/, "\\]");
    var p = RegExp("[\\?&]" + query_char + "=([^&#]*)").exec(referer);
    return p === null || p && typeof p[1] !== "string" && p[1].length ? "": unescape(p[1]).replace(/\+/g, " ");
};


// get an ip through a load-balanced request
// ------------------------------------------------------ //
var source_ip = exports.source_ip = function(req){
    if (!req){
        return;
    }
    var ip = deepattr(req,'headers.x-forwarded-for',deepattr(req,'client.remoteAddress',''));
    return ip.split(',')[0].trim();
};

// detect mobile browser clients
// ------------------------------------------------------ //
var detect_mobile = exports.detect_mobile = function(req){
    var ua                  = (req.headers['user-agent']?req.headers['user-agent'].toLowerCase():null);
    req.is_mobile_browser   = false;
    req.mobile_browser_type = '';

    if (ua){
        var mobile_useragents = {
            'kindle'              : 'kindle'
            ,'iphone'             : 'iphone'
            ,'ipod'               : 'ipod'
            ,'android'            : 'android'
            ,'blackberry'         : 'blackberry'
            ,'windows phone os 7' : 'windows phone os 7'
            ,'iemobile'           : 'iemobile'
        };

        for (var key in mobile_useragents){
            if (ua.indexOf(key) >= 0){
                req.is_mobile_browser   = true;
                req.mobile_browser_type = mobile_useragents[key];
                break;
            }
        }
    }
    return req;
};


// trim whitespace
var trim = exports.trim = function(str){
    return str.replace(/(^[\s\xA0]+|[\s\xA0]+$)/g, '');
};

// luvs my endswith
// ------------------------------------------------------ //
var endswith = exports.endswith = function(str, suffix) {
    return str.indexOf(suffix, str.length - suffix.length) !== -1;
};

var is_https = exports.is_https = function(req){
    var h = req.headers;

    return (h && (
        h['x-forwarded-proto'] === 'https'
        || h['x-scheme'] === 'https'
        || h['x-forwarded-for'].indexOf('192.168.151.62') >= 0
    ));
};

var get_domain = exports.get_domain = function(req_or_host){
    if (!req_or_host){
        throw new Error('No host supplied')
    }

    var parsed,qs,host,uri,hostname,name;

    var req = _.isObject(req_or_host) ?  req_or_host : undefined;
    if (req){
        parsed = req_or_host.url ? url.parse(req_or_host.url) : undefined;
        qs     = parsed && parsed.query ? querystring.parse(parsed.query) : {};
        if (qs && qs.domain){ // forcing a domain to use via the ?domain=foo.com querysting
            host = qs.domain;
        }else{
            host = deepattr(req,'headers.host',source_ip(req));
        }
    }else{
        host = req_or_host;
    }
    var uri  = url.parse(host.indexOf('://')<0?('http://' + host):host);
    var name = isIPAddress(uri.hostname)?uri.hostname:uri.hostname.split('.').slice(-2).join('.');
    return {
        name     : name,
        qs       : qs,
        protocol : (qs && qs.skipssl==='true' || req && is_https(req)) ?'https:':uri.protocol,
        parsed   : {
            uri      : uri,
            original : parsed
        }
    };
};


// determine if a string is an IP address
// ------------------------------------------------------ //
var isIPAddress = exports.isIPAddress = function(ip){
    return (ip)?ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/):null;
};

var request_uri = exports.request_uri = function(uri,req,callback){
    var forward_ip = req?source_ip(req):undefined;
    var opts = {
        uri        : uri
        , jar      : false    // turn off outgoing cookie passing
        , encoding : 'utf8'
        , headers  : req?req.headers:{}
    };
    opts.headers = {
        "accept-encoding"  : ""
        ,"user-agent"      : req?req.headers['user-agent']:''
        ,"x-forwarded-for" : forward_ip
        ,"x-real-ip"       : forward_ip
    };

    // console.log('requesting uri:',uri,options);
    return request.get(opts,callback);  // callback(err,response,body)
};


var get_req_props = exports.get_req_props = function(req){
    if (!req || _.keys(req).length === 0){
        return {};
    }
    var ua        = deepattr(req,'headers.user-agent',null);
    var req       = detect_mobile(req);
    var referer   = deepattr(req,'headers.referer',null);
    var ip        = source_ip(req);
    var amz       = is_aws_ip(ip);
    var domain    = get_domain(req);
    var props     = _.extend({
        domain_name         : domain.name,
        querystring         : url.parse(req.url).query,
        path                : url.parse(req.url).pathname,
        http_referer        : (referer || '').slice(0,150),
        http_user_agent     : (ua || '').slice(0,150),
        ip_address          : ip,
        is_mobile_browser   : req.is_mobile_browser,
        mobile_browser_type : req.mobile_browser_type,
        is_amazon_ip        : amz.is_amazon,
        amazon_region       : amz.region,
        protocol            : (is_https(req)?'https':'http'),
    },extract_user_agent_properties(ua),search_engine_properties(referer));
    props.state = (props.sitekey && !props.state)?props.sitekey.slice(0,2):undefined;
    return props;
};

