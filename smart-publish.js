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
  this.items = {};
}
BaseCollection.prototype.smartAdded = function(dependencyCursorId, id, fields) {
  var items = this.items;
  if (!items[id]) {
    items[id] = new CollectionItem(id, this, fields, dependencyCursorId);
    items[id].updateChildren(this.relations);
    this.publication.added(this.name, id, fields);
  } else {
    var itemm = items[id];
    _.each(fields, function(val, key) {
      itemm.data[key] = itemm.data[key] || {};
      itemm.data[key][dependencyCursorId] = deepCopy(val);
    });
    itemm.count++;
    itemm.updateFromData(fields);
    itemm.updateChildren(fields);
  }
}
BaseCollection.prototype.smartChanged = function(dependencyCursorId, id, fields) {
  var itemm = this.items[id];
  var data = itemm.data;
  _.each(fields, function(val, key) {
    data[key] = data[key] || {};
    if (val === undefined) {
      delete data[key][dependencyCursorId];
    } else {
      data[key][dependencyCursorId] = deepCopy(val);
    }
  });
  itemm.updateFromData(fields);
  itemm.updateChildren(fields);
}
BaseCollection.prototype.smartRemoved = function(dependencyCursorId, id) {
  var itemm = this.items[id];
  if (!itemm) {
    throw new Meteor.Error("Removing unexisting element '" + id + "' from collection '" + this.name + "'");
  }

  if (!--itemm.count) { // If reference counter was decremented to zero
    this.publication.removed(this.name, id);
    itemm.updateChildren(this.relations, true);
    delete this.items[id];
  } else {
    var fields = {};
    _.each(itemm.data, function(vals, key) {
      if (dependencyCursorId in vals) {
        fields[key] = 1;
        delete vals[dependencyCursorId];
      }
    });
    itemm.updateFromData(fields);
    itemm.updateChildren(fields);
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
  for (var key in fields) {
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
  };
  this.collection.publication.changed(this.collection.name, this.id, res);
}
CollectionItem.prototype.updateChildren = function(fields, removeAll) {
  var self = this;
  var update = {};
  for (var key in fields) {
    _.each(self.collection.relations[key], function(dep) {
      update[dep.id] = dep;
    });
  };
  _.each(update, function(dep) {
    var toRemove = [];
    if (dep.id in self.children) {
      self.children[dep.id].forEach(function(x, i) {
        _.each(x.activeItems, function(realId, strId) { // #6: if we use ObjectID as a key only, it won't work with Meteor
          toRemove.push([x.collection, x.dependencyCursorId, realId]);
        });
        x.observer.stop();
      });
    }

    if (!removeAll) {
      var cursors = dep.callback(self.mergedData);
      if (isCursor(cursors)) cursors = [cursors];
      if (!_.isArray(cursors)) {
        throw new Meteor.Error("Dependency function can only return a Cursor or an array of Cursors");
      }

      var observers = self.children[dep.id] = [];
      _.each(cursors, function(c) {
        if (!isCursor(c)) {
          throw new Meteor.Error("Dependency function returned an array of non-Cursors");
        }

        if (!c._cursorDescription) {
          throw new Meteor.Error("Unable to get cursor's collection name");
        }
        var subname = c._cursorDescription.collectionName;
        if (!subname) {
          throw new Meteor.Error("Unable to get cursor's collection name");
        }

        observers.push(new CursorWrapper(c, self.collection.publication.getCollectionByName(subname)));
      });
    }
    toRemove.forEach(function(args) {
      args[0].smartRemoved(args[1], args[2]);
    });
  });
}

function SingleCollectionCallbacksWrapper(collection) {
  this.activeItems = {};
  this.collection = collection;
  this.dependencyCursorId = Random.id();
  var self = this;
  _.extend(this, {
    added:   function(id, fields) {
      self.activeItems[id] = id; // #6: if we store ObjectID as a key only, it won't work with Meteor
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
  });
};

function CursorWrapper(cursor, collection) {
  SingleCollectionCallbacksWrapper.call(this, collection);
  this.observer = cursor.observeChanges(this);
};
CursorWrapper.prototype = Object.create(SingleCollectionCallbacksWrapper.prototype);

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
    if (!_.isArray(cursors)) {
      throw new Meteor.Error("Publish function can only return a Cursor or an array of Cursors");
    }

    for (var i = 0; i < cursors.length; i++) {
      if (!isCursor(cursors[i])) {
        throw new Meteor.Error("Publish function returned an array of non-Cursors");
      }
    }

    var observers = [];
    _.each(cursors, function(c) {
      if (!c._cursorDescription) {
        throw new Meteor.Error("Unable to get cursor's collection name");
      }

      var name = c._cursorDescription.collectionName;
      if (!name) {
        throw new Meteor.Error("Unable to get cursor's collection name");
      }
      observers.push(new CursorWrapper(c, getCollectionByName(name)).observer);
    });
    this.ready();
    this.onStop(function() {
      _.forEach(observers, function(x) {
        x.stop();
      });
    });
  });
}
