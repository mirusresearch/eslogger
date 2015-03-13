

var
    os              = require('os')
    , elasticsearch = require('elasticsearch')
    , _             = require('lodash')
    , async         = require('async')
    , url           = require('url')
    , utils       = require('./utils')
;


var ESLogger = module.exports = function (options) {
    if (!(this instanceof ESLogger)) {
        return new ESLogger(options);
    }
    var self = this;
    self.options = options||{};
    if (self.options.hosts.length === 0){
        throw new Error('ESLogger needs hosts');
    }
    if (!self.options.prefix){
        throw new Error('ESLogger needs a prefix');
    }
    // http://www.elasticsearch.org/guide/en/elasticsearch/client/javascript-api/current/configuration.html#config-options
    self.client = new elasticsearch.Client({
        apiVersion     : "1.4",
        hosts          : self.options.hosts,
        maxRetries     : 10,
        // requestTimeout : 15000,
        // deadTimeout    : 30000
    });
    self.buffer = [];
    self.interval = setInterval(_.bind(self.flush,self),self.options.flush_interval||20000);
};

var uuid = function(a){return a?(a^Math.random()*16>>a/4).toString(16):([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g,uuid)};
ESLogger.prototype.uuid = uuid;

ESLogger.prototype.get_index = function(){
    var self = this;
    return self.options.prefix + '-' + self.localDatestamp(true).replace(/\-/g,'.');
    // return self.options.prefix + '-' + (new Date().toISOString().substr(0, 10).replace(/\-/g,'.'));
};

ESLogger.prototype.flush = function () {
    var self = this;
    if (self.buffer && self.buffer.length > 0){
        var sending = _.flatten(self.buffer.splice(0, self.buffer.length));
        // var send_id = self.uuid().split('-')[0];
        // console.log(send_id,' -- ES bulk send:',sending.length/2);
        self.client.bulk({body:sending}, function (err, response) {
            if (err){
                console.error('ES flush error:\n',err);
            }else{
                console.log('ES flushed',response.items.length,'item(s)');
            }
        });
    }
};


ESLogger.prototype.log = function (type,doc,req) {
    var self        = this;
    req = req || {}
    var base = {
        // datestamp : (new Date()).toISOString(),
        datestamp : self.localDatestamp(),
        nodejs    : process.version,
        server    : os.hostname(),
        id        : self.uuid()
    };
    // console.log('req:',req);
    if (self.options.debug){
        console.log('== ES logging in debug mode ==');
        // console.log('== ES logging ==>\n',params);
    }else{
        // console.log(doc);
        var reqprops = (req && typeof utils !== "undefined")?utils.get_req_props(req):{};
        self.buffer.push([
            { index:  { _index: self.get_index(), _type: type, _id: base.id } },
            _.extend(base,doc,reqprops)
        ]);
    }
}

ESLogger.prototype.mapping = function(){
    // mapping for a moving index (e.g. date-based indices advancement)
    // depends on a mapping template which tracks the index pattern
    // so we need to test for a template in the cluster
    // and add/update/delete accordingly
    var self = this;
    var local_tmp = utils.deepattr(self.options,'mapping.templates.'+self.options.prefix);
    var cluster_tmp;

    if (self.options.debug){
        console.log('== ES Mapping skipped');
        return;
    }

    // console.log('setup mapping for ', local_tmp);
    async.series({
        'existing' : function(cb){
            self.client.indices.getTemplate({name:self.options.prefix},function(err,data,status){
                // console.log('getTemplate found:',err,data,status);
                cluster_tmp = data?data[self.options.prefix]:null;
                // console.log('cluster_tmp',cluster_tmp);
                // console.log('local_tmp',local_tmp);
                // short circuit if they are unchanged
                return cb();
            });
        },
        'update':function(cb){  // add a template
            var changed = !_.isEqual(cluster_tmp,local_tmp);
            if (changed){
                console.log('local:',local_tmp);
                console.log('cluster:',cluster_tmp);
                if (local_tmp){
                    console.log('ES mapping changed...');
                    return self.client.indices.putTemplate({maxRetries:20,name:self.options.prefix,body:local_tmp},cb);
                }else{
                    console.log('ES mapping removed...');
                    return self.client.indices.deleteTemplate({name:self.options.prefix},cb);
                }
            }else{
                console.log('ES mapping unchanged');
                return cb();
            }
        }
    },function(err,results){
        if (err){
            return console.error('ES Mapping:',err,results);
        }
        // console.log('ES Mapping completed successfully');
    });
};

ESLogger.prototype.delete_index = function(idx){
    var self = this;
    if (!self.client){
        // console.log('unable to delete index -- retrying shortly...');
        setTimeout(_.bind(self.delete_index,self,idx),1000);
        return;
    }
    idx = idx || self.get_index();
    // console.log('attempting to delete',idx);
    self.client.indices.delete({index:idx},function(err,data){
        data = (data)?JSON.parse(data):data;
        if (err){
            throw new Error('index deletion error:',err);
        }
        if (data.error){
            console.error('deletion failed for',idx,data);
            return;
        }
        console.log('index deletion succeeded:',idx,data);
    });
};

ESLogger.prototype.localDatestamp = function(date_only) {
    var now = new Date(),
    tzo = -now.getTimezoneOffset(),
    dif = tzo >= 0 ? '+' : '-',
    pad = function(num) {
        var norm = Math.abs(Math.floor(num));
        return (norm < 10 ? '0' : '') + norm;
    };
    return now.getFullYear()
    + '-' + pad(now.getMonth()+1)
    + '-' + pad(now.getDate())
    + (date_only?'':(
        'T' + pad(now.getHours())
        + ':' + pad(now.getMinutes())
        + ':' + pad(now.getSeconds())
        + dif + pad(tzo / 60)
        + ':' + pad(tzo % 60))
    );
}
