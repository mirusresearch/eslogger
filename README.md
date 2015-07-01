# Logging, esse
This is a light wrapper for sending data to Elasticsearch in a predictable manner.
It uses the [Elasticsearch JS Client](http://www.elastic.co/guide/en/elasticsearch/client/javascript-api/current/) and accepts all the same arguments for configuration

## Main features:
- Daily log indexes using a logstash-style naming with your supplied prefix
- Map Index creation and update capabilites (to make sure your data gets digested the way you like)
- Buffering and Bulk Insert by default, to decouple log load from ES connections.
- fine-grained filtering for particular object types, e.g. http request objects

