Meteor.smartPublish = function(name, callback) {
  Meteor.publish(name, function() {
    var publication = this;
    var collections = {};
    function getCollectionByName(name) {
      return collections[name] = collections[name] || new Collection(name);
    }
    publication.getCollectionByName = getCollectionByName;

    function Collection() {
      BaseCollection.apply(this, arguments);
    }
    Collection.prototype = Object.create(BaseCollection.prototype);
    Collection.prototype.publication = publication;

    publication.addDependency = function(name, fields, callback) {
      if (!_.isArray(fields)) fields = [fields];
      var relations = getCollectionByName(name).relations;
      var dep = new Dependency(callback);
      fields.forEach(function(field) {
        if (field.indexOf(".") != -1) { // See #8
          field = field.substr(0, field.indexOf("."));
        }
        relations[field] = relations[field] || [];
        relations[field].push(dep);
      });
    }

    var context = Object.create(publication);
    _.extend(context, new CallbacksWrapper(getCollectionByName));
    context.ready = undefined;
    var cursors = callback.apply(context, arguments);
    var wrappers = getWrappersFromCallbackResult(getCollectionByName, cursors);
    wrappers.push(context);
    this.ready();
    this.onStop(function() {
      _.forEach(wrappers, function(x) {
        x.stop();
      });
    });
  });
}
