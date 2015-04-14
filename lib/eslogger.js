

var
    os              = require('os')
    , elasticsearch = require('elasticsearch')
    , _             = require('lodash')
    , async         = require('async')
    , url           = require('url')
    , utils         = require('./utils')
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
    // http://www.elastic.co/guide/en/elasticsearch/client/javascript-api/current/configuration.html#config-options
    self.client = new elasticsearch.Client({
        apiVersion     : self.options.apiVersion || "1.4",
        hosts          : self.options.hosts,
        maxRetries     : 10,
    });
    self.buffer = [];
    setInterval(_.bind(self.flush,self),self.options.flush_interval||10000);

};

ESLogger.prototype.get_index = function(d) {
    var self = this;
    var dt   = (d || self.localDatestamp()).split('T')[0].replace(/\-/g,'.');
    return self.options.prefix + '-' + dt;
};

ESLogger.prototype.log = function (type,doc,req) {
    var self        = this;
    var data = _.extend({
        datestamp : self.localDatestamp(),
        nodejs    : process.version,
        server    : os.hostname()
    },utils.get_req_props(req),doc);

    if (self.options.debug){
        console.log('== ES logging ==>\n',data);
    }else{
        // console.log(doc);
        var manifest = { index: { _index: self.get_index(data.datestamp), _type: type }};
        console.log('log manifest:',manifest);
        if (data.id){
            manifest.index._id = data.id;
        }
        self.buffer.push([manifest, data]);
    }
};

ESLogger.prototype.update = function (type,id,doc,req) {
    var self = this;

    // console.log('current_index:',current_index);
    if (self.options.debug){
        console.log('== ES updating ==>\n',doc);
    }else{
        var manifest = { update: { _index: self.get_index(), _type: type, _id:id }};
        console.log('update manifest:',manifest);
        if (data.id){
            manifest.index._id = data.id;
        }
        self.buffer.push([manifest, {doc:doc}]);
    }
};

ESLogger.prototype.flush = function () {
    var self = this;
    if (self.buffer && self.buffer.length > 0){
        var sending = _.flatten(self.buffer.splice(0, self.buffer.length));
        self.client.bulk({body:sending}, function (err, response) {
            if (err){
                console.error('ES flush error:\n',err);
            }else{
                console.log('ES flushed',response.items.length,'item(s)');
            }
        });
    }
};


ESLogger.prototype.mapping = function(){
    // mapping for a moving index (e.g. date-based indices advancement)
    // depends on a mapping template which tracks the index pattern
    // so we need to test for a template in the cluster
    // and add/update/delete accordingly
    var self = this;
    var local_tmp = utils.deepattr(self.options,'mapping');
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
            if (!_.isEqual(cluster_tmp,local_tmp)){
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
};
