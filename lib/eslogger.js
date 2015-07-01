var
    os              = require('os')
    , elasticsearch = require('elasticsearch')
    , _             = require('lodash')
    , async         = require('async')
    , url           = require('url')
;


var ESLogger = module.exports = function (options) {
    if (!(this instanceof ESLogger)) {
        return new ESLogger(options);
    }
    var self = this;
    var defaults = {
        debug   : false,  // will print data to stdout instead of attempting to index data
        dryrun  : false,  // don't send data, just dump to console
        verbose : false,  // put some output
        filters : [],
    };
    self.options = _.extend(defaults,options||{});
    if (self.options.hosts.length === 0){
        throw new Error('ESLogger needs one or more host');
    }
    if (!self.options.prefix){
        throw new Error('ESLogger needs a prefix for its indexes');
    }
    // http://www.elastic.co/guide/en/elasticsearch/client/javascript-api/current/configuration.html#config-options
    self.client = new elasticsearch.Client({
        apiVersion     : self.options.apiVersion || "1.4",
        hosts          : self.options.hosts,
        maxRetries     : self.options.retries || 10,
    });
    self.buffer = [];
    setInterval(_.bind(self.flush,self),self.options.flush_interval||10000);

};

ESLogger.prototype.get_index = function(d) {
    var self = this;
    var dt   = (d || self.localDatestamp()).split('T')[0].replace(/\-/g,'.');
    return self.options.prefix + '-' + dt;
};

// only value required is the doc "type" which should match the mapping name chosen (if you have a map)
// all arguments after "type" should be objects (or return objects after filtering) which will be combined into a single final doc
// order of arguments defines value precedence - last version wins
// non-objects will be ignored
// defined filters should accept
ESLogger.prototype.log = function (type) {
    var self        = this;
    // default values for each entry
    var data = {
        datestamp : self.localDatestamp(),  // provide your own datestamp in the format of
        nodejs    : process.version,
        server    : os.hostname()
    };

    // grab all arguments after "type" and filter them if it's required
    var obs = [].slice.apply(arguments).slice(1);
    _.each(obs,function(ob,idx){
        var fn = self.options.filters[idx] || function(o){return o;};
        if (_.isObject(ob)){
            data = _.extend(data,fn?fn(ob):ob);
        }
    });

    if (self.options.dryrun || self.verbose){
        console.info('== ES logging dryrun ==>\n',data);
        return;
    }

    self.info('Adding to buffer:', data);
    var manifest = { index: { _index: self.get_index(data.datestamp), _type: type }};
    if (data.id){
        manifest.index._id = data.id;
    }
    self.buffer.push([manifest, data]);
    self.info('ES log manifest:',manifest,self.buffer.length);

};

ESLogger.prototype.update = function (type,id,doc) {
    var self = this;
    // self.info('current_index:',current_index);
    if (self.options.debug){
        console.log('== ES updating ==>\n',doc);
    }else{
        var manifest = { update: { _index: self.get_index(), _type: type, _id:id }};
        // self.info('ES update manifest:',manifest);
        self.buffer.push([manifest, {doc:doc}]);
    }
};

ESLogger.prototype.flush = function () {
    var self = this;
    if (self.buffer.length ===  0){
        // console.log('ES buffer empty');
        return;
    }
    var sending = _.flatten(self.buffer.splice(0, self.buffer.length));
    if (self.options.dryrun){
        console.log('Dryrun -- sending:\n',sending);
        return;
    }
    self.client.bulk({body:sending}, function (err, response) {
       if (err){
            console.error('ES flush error:\n',err);
            return;
        }
        self.info('ES flushed',response.items.length,'item(s)');
    });
};


ESLogger.prototype.mapping = function(){
    // mapping for a moving index (e.g. date-based indices advancement)
    // depends on a mapping template which tracks the index pattern
    // so we need to test for a template in the cluster
    // and add/update/delete accordingly
    var self = this;
    var local_tmp = self.deepattr(self.options,'mapping');
    var cluster_tmp;

    if (self.options.dryrun){
        console.log('== ES Mapping skipped');
        return;
    }

    // console.log('setup mapping for ', local_tmp);
    async.series({
        'existing' : function(cb){
            self.client.indices.getTemplate({name:self.options.prefix},function(err,data,status){
                self.debug('getTemplate found:',err,data,status);
                cluster_tmp = data?data[self.options.prefix]:null;
                self.debug('cluster_tmp',cluster_tmp);
                self.debug('local_tmp',local_tmp);
                // short circuit if they are unchanged
                return cb();
            });
        },
        'update':function(cb){  // add a template
            if (!_.isEqual(cluster_tmp,local_tmp)){

                self.info('local:',local_tmp);
                self.info('cluster:',cluster_tmp);

                if (local_tmp){
                    self.info('ES mapping changed...');
                    return self.client.indices.putTemplate({maxRetries:20,name:self.options.prefix,body:local_tmp},cb);
                }else{
                    self.info('ES mapping removed...');
                    return self.client.indices.deleteTemplate({name:self.options.prefix},cb);
                }
            }else{
                self.info('ES mapping unchanged');
                return cb();
            }
        }
    },function(err,results){
        if (err){
            return console.error('ES Mapping:',err,results);
        }
    });
};

ESLogger.prototype.info = function(){
    if (this.options.verbose){
        console.info.apply(this,[].slice.apply(arguments));
    }
};

ESLogger.prototype.debug = function(){
    if (this.options.debug || this.options.verbose){
        console.log.apply(this,[].slice.apply(arguments));
    }
};

// a safe way to pull values from deep within an object
// and fail gracefully if the property/method isn't there
// ------------------------------------------------------ //
ESLogger.prototype.deepattr = function(obj, path, def){
    var o = obj;
    var props = path.split('.');
    for (var i=0; i < props.length; i++) {
        var p = props[i];
        if (_.has(o,p)){
            o = o[p];
        }else{
            return def;
        }
    }
    return o;
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
