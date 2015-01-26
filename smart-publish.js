var isCursor = function (c) {
  return c && c._publishCursor;
};

var deepCopy = function(value) {
  return EJSON.clone(value);
}

function Dependency(callback) {
  this.callback = callback;
  this.id = Random.id();
}

function BaseCollection(name) {
  this.name = name;
  this.relations = {};
}
BaseCollection.prototype.smartAdded = function(dependencyCursorId, id, fields) {
  var self = this;
  if (!self[id]) {
    self.publication.added(self.name, id, fields);
    self[id] = new CollectionItem(id, self, fields, dependencyCursorId);
    self[id].updateChildren(self.relations);
  } else {
    _.each(fields, function(val, key) {
      self[id].data[key] = self[id].data[key] || {};
      self[id].data[key][dependencyCursorId] = deepCopy(val);
    });
    self[id].count++;
    self[id].updateFromData(fields);
    self[id].updateChildren(fields);
  }
}
BaseCollection.prototype.smartChanged = function(dependencyCursorId, id, fields) {
  var data = this[id].data;
  _.each(fields, function(val, key) {
    data[key] = data[key] || {};
    if (val === undefined) {
      delete data[key][dependencyCursorId];
    } else {
      data[key][dependencyCursorId] = deepCopy(val);
    }
  });
  this[id].updateFromData(fields);
  this[id].updateChildren(fields);
}
BaseCollection.prototype.smartRemoved = function(dependencyCursorId, id) {
  if (!this[id]) throw new Meteor.Error("Removing unexisting element '" + id + "' from collection '" + this.name + "'");

  if (!--this[id].count) { // If reference counter was decremented to zero
    this[id].updateChildren(this.relations, true);
    delete this[id];
    this.publication.removed(this.name, id);
  } else {
    var fields = {};
    _.each(this[id].data, function(vals, key) {
      if (dependencyCursorId in vals) {
        fields[key] = 1;
        delete vals[dependencyCursorId];
      }
    });
    this[id].updateFromData(fields);
    this[id].updateChildren(fields);
  }
}

function CollectionItem(id, collection, fields, dependencyCursorId) {
  this.id = id;
  this.collection = collection;
  this.count = 1;
  this.data = {};
  this.mergedData = deepCopy(fields);
  this.children = {};
  var self = this;
  _.each(fields, function(val, key) {
    self.data[key] = self.data[key] || {};
    self.data[key][dependencyCursorId] = deepCopy(val);
  });
}
CollectionItem.prototype.updateFromData = function(fields) {
  var res = {};
  var merged = this.mergedData;
  var self = this;
  _.each(fields, function(flag, key) {
    var cur = undefined;
    _.each(self.data[key], (function(value) {
      cur = _.extend(deepCopy(value), cur);
    }));
    res[key] = cur;
    if (_.isUndefined(cur)) {
      delete merged[key];
    } else {
      merged[key] = cur;
    }
  });
  this.collection.publication.changed(this.collection.name, this.id, res);
}
CollectionItem.prototype.updateChildren = function(fields, removeAll) {
  var self = this;
  var update = {};
  _.each(fields, function(flag, key) {
    _.each(self.collection.relations[key], function(dep) {
      update[dep.id] = dep;
    });
  });
  _.each(update, function(dep) {
    var toRemove = [];
    if (dep.id in self.children) {
      self.children[dep.id].forEach(function(x, i) {
        _.each(x.activeItems, function(flag, subid) {
          toRemove.push([x.collection, x.dependencyCursorId, subid]);
        });
        x.observer.stop();
      });
    }

    if (!removeAll) {
      var cursors = dep.callback(self.mergedData);
      if (isCursor(cursors)) cursors = [cursors];
      if (!_.isArray(cursors))
        throw new Meteor.Error("Dependency function can only return a Cursor or an array of Cursors");

      var observers = self.children[dep.id] = [];
      for (var i = 0; i < cursors.length; i++) {
        var c = cursors[i];
        if (!isCursor(c))
          throw new Meteor.Error("Dependency function returned an array of non-Cursors");

        if (!c._cursorDescription) throw new Meteor.Error("Unable to get cursor's collection name");
        var subname = c._cursorDescription.collectionName;
        if (!subname) throw new Meteor.Error("Unable to get cursor's collection name");

        observers.push(new CursorWrapper(c, self.collection.publication.getCollectionByName(subname)));
      }
    }
    toRemove.forEach(function(args) {
      args[0].smartRemoved(args[1], args[2]);
    });
  });
}

function CursorWrapper(cursor, collection) {
  this.activeItems = {};
  this.collection = collection;
  this.dependencyCursorId = Random.id();
  var self = this;
  this.observer = cursor.observeChanges({
    added:   function(id, fields) {
      self.activeItems[id] = 1;
      fields['_id'] = id;
      collection.smartAdded  (self.dependencyCursorId, id, fields);
    },
    changed: function(id, fields) {
      collection.smartChanged(self.dependencyCursorId, id, fields);
    },
    removed: function(id) {
      delete self.activeItems[id];
      collection.smartRemoved(self.dependencyCursorId, id);
    },
  })
};

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
    
    var cursors = callback.apply(publication, arguments);
    if (isCursor(cursors)) cursors = [cursors];

    if (!cursors) return;
    if (!_.isArray(cursors))
      throw new Meteor.Error("Publish function can only return a Cursor or an array of Cursors");

    for (var i = 0; i < cursors.length; i++)
      if (!isCursor(cursors[i]))
        throw new Meteor.Error("Publish function returned an array of non-Cursors");

    var observers = [];
    for (var i = 0; i < cursors.length; i++) {
      var c = cursors[i];

      if (!c._cursorDescription) throw new Meteor.Error("Unable to get cursor's collection name");

      var name = c._cursorDescription.collectionName;
      if (!name) throw new Meteor.Error("Unable to get cursor's collection name");
      observers.push(new CursorWrapper(c, getCollectionByName(name)).observer);
    }
    this.ready();
    this.onStop(function() {
      _.forEach(observers, function(x) { x.stop(); });
    });
  });
}
