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
BaseCollection.prototype.smartAdded = function(index, id, fields) {
  var self = this;
  if (!self[id]) {
    self.publication.added(self.name, id, fields);
    self[id] = new self.publication.CollectionItem(id, self, fields, index);
    self.publication.updateChildren(self[id], self.relations);
  } else {
    _.each(fields, function(val, key) {
      self[id].data[key] = self[id].data[key] || {};
      self[id].data[key][index] = deepCopy(val);
    });
    self[id].count++;
    self[id].updateFromData(fields);
    self.publication.updateChildren(self[id], fields);
  }
}
BaseCollection.prototype.smartChanged = function(index, id, fields) {
  var data = this[id].data;
  _.each(fields, function(val, key) {
    if (!data[key]) data[key] = {};
    if (val === undefined) {
      delete data[key][index];
    } else {
      data[key][index] = deepCopy(val);
    }
  });
  this[id].updateFromData(fields);
  this.publication.updateChildren(this[id], fields);
}
BaseCollection.prototype.smartRemoved = function(index, id) {
  if (!this[id]) throw new Meteor.Error("Removing unexisting element '" + id + "' from collection '" + this.name + "'");

  if (!--this[id].count) { // If reference counter was decremented to zero
    this.publication.updateChildren(this[id], this.relations, true);
    delete this[id];
    this.publication.removed(this.name, id);
  } else {
    var fields = {};
    _.each(this[id].data, function(vals, key) {
      if (index in vals) {
        fields[key] = 1;
        delete vals[index];
      }
    });
    this[id].updateFromData(fields);
    this.publication.updateChildren(this[id], fields);
  }
}

function BaseCollectionItem(id, collection, fields, index) {
  this.id = id;
  this.collection = collection;
  this.count = 1;
  this.data = {};
  this.mergedData = deepCopy(fields);
  this.children = {};
  var self = this;
  _.each(fields, function(val, key) {
    self.data[key] = self.data[key] || {};
    self.data[key][index] = deepCopy(val);
  });
}
BaseCollectionItem.prototype.updateFromData = function(fields) {
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
  this.publication.changed(this.collection.name, this.id, res);
}

Meteor.smartPublish = function(name, callback) {
  Meteor.publish(name, function() {
    var publication = this;
    var collections = {};
    function getCollectionByName(name) {
      return collections[name] = collections[name] || new Collection(name);
    }

    function Collection() {
      BaseCollection.apply(this, arguments);
    }
    Collection.prototype = Object.create(BaseCollection.prototype);
    Collection.prototype.publication = publication;

    function CollectionItem() {
      BaseCollectionItem.apply(this, arguments);
    }
    CollectionItem.prototype = Object.create(BaseCollectionItem.prototype);
    CollectionItem.prototype.publication = publication;

    publication.CollectionItem = CollectionItem;

    publication.updateChildren = function(itemm, fields, removeAll) {
      var update = {};
      _.each(fields, function(flag, key) {
        if (!itemm.collection.relations[key]) return;
        _.each(itemm.collection.relations[key], function(dep) {
          update[dep.id] = dep;
        });
      });
      _.each(update, function(dep) {
        var toRemove = [];
        if (dep.id in itemm.children) {
          itemm.children[dep.id].forEach(function(x, i) {
            _.each(x.activeItems, function(flag, subid) {
              toRemove.push([x.collection, x.index, subid]);
            });
            x.observer.stop();
          });
        }

        if (!removeAll) {
          var cursors = dep.callback(itemm.mergedData);
          if (isCursor(cursors)) cursors = [cursors];
          if (!_.isArray(cursors))
            throw new Meteor.Error("Dependency function can only return a Cursor or an array of Cursors");

          var observers = itemm.children[dep.id] = [];
          for (var i = 0; i < cursors.length; i++) {
            var c = cursors[i];
            if (!isCursor(c))
              throw new Meteor.Error("Dependency function returned an array of non-Cursors");

            if (!c._cursorDescription) throw new Meteor.Error("Unable to get cursor's collection name");
            var subname = c._cursorDescription.collectionName;
            if (!subname) throw new Meteor.Error("Unable to get cursor's collection name");

            observers.push(new CursorWrapper(c, getCollectionByName(subname)));
          }
        }
        toRemove.forEach(function(args) {
          Collection.prototype.smartRemoved.apply(args[0], args.slice(1));
        });
      });
    }

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

      function CursorWrapper(cursor, collection) {
        this.activeItems = {};
        this.collection = collection;
        this.index = Random.id();
        var self = this;
        this.observer = cursor.observeChanges({
          added:   function(id, fields) {
            self.activeItems[id] = 1;
            fields['_id'] = id;
            collection.smartAdded  (self.index, id, fields);
          },
          changed: function(id, fields) {
            collection.smartChanged(self.index, id, fields);
          },
          removed: function(id) {
            delete self.activeItems[id];
            collection.smartRemoved(self.index, id);
          },
        })
      };

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
