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

function Collection(name) {
  var res = [];
  res.name = name;
  res.relations = {};
  return res;
}

function CollectionItem(id, fields, index) {
  this.id = id;
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

Meteor.smartPublish = function(name, callback) {
  Meteor.publish(name, function() {
    var self = this;
    var collections = {};
    function getCollectionByName(name) {
      return collections[name] = collections[name] || new Collection(name);
    }

    var updateFromData = function(collection, id, fields) {
      var res = {};
      var merged = collection[id].mergedData;
      _.each(fields, function(flag, key) {
        var cur = undefined;
        _.each(collection[id].data[key], (function(value) {
          cur = _.extend(deepCopy(value), cur);
        }));
        res[key] = cur;
        if (_.isUndefined(cur)) {
          delete merged[key];
        } else {
          merged[key] = cur;
        }
      });
      self.changed(collection.name, id, res);
    }

    var counter = 0; // this is global counter for index for CursorWrapper(), all indices should be different
    var updateChildren = function(collection, id, fields, removeAll) {
      var update = {};
      _.each(fields, function(flag, key) {
        if (!collection.relations[key]) return;
        _.each(collection.relations[key], function(dep) {
          update[dep.id] = dep;
        });
      });
      _.each(update, function(dep) {
        var toRemove = [];
        if (dep.id in collection[id].children) {
          collection[id].children[dep.id].forEach(function(x, i) {
            _.each(x.activeItems, function(flag, subid) {
              toRemove.push([x.collection, x.index, subid]);
            });
            x.observer.stop();
          });
        }

        if (!removeAll) {
          var cursors = dep.callback(collection[id].mergedData);
          if (isCursor(cursors)) cursors = [cursors];
          if (!_.isArray(cursors))
            throw new Meteor.Error("Dependency function can only return a Cursor or an array of Cursors");

          var observers = collection[id].children[dep.id] = [];
          for (var i = 0; i < cursors.length; i++) {
            var c = cursors[i];
            if (!isCursor(c))
              throw new Meteor.Error("Dependency function returned an array of non-Cursors");

            if (!c._cursorDescription) throw new Meteor.Error("Unable to get cursor's collection name");
            var subname = c._cursorDescription.collectionName;
            if (!subname) throw new Meteor.Error("Unable to get cursor's collection name");

            observers.push(new CursorWrapper(c, getCollectionByName(subname), '_' + counter));
            counter++;
          }
        }
        toRemove.forEach(function(args) {
          smartRemoved.apply(this, args);
        });
      });
    }
    var smartAdded = function(collection, index, id, fields) {
      if (!collection[id]) {
        self.added(collection.name, id, fields);
        collection[id] = new CollectionItem(id, fields, index);
        updateChildren(collection, id, collection.relations);
      } else {
        _.each(fields, function(val, key) {
          collection[id].data[key] = collection[id].data[key] || {};
          collection[id].data[key][index] = deepCopy(val);
        });
        collection[id].count++;
        updateFromData(collection, id, fields);
        updateChildren(collection, id, fields);
      }
    }
    var smartChanged = function(collection, index, id, fields) {
      var data = collection[id].data;
      _.each(fields, function(val, key) {
        if (!data[key]) data[key] = {};
        if (val === undefined) {
          delete data[key][index];
        } else {
          data[key][index] = deepCopy(val);
        }
      });
      updateFromData(collection, id, fields);
      updateChildren(collection, id, fields);
    }
    var smartRemoved = function(collection, index, id) {
      if (!collection[id]) throw new Meteor.Error("Removing unexisting element '" + id + "' from collection '" + collection.name + "'");

      if (!--collection[id].count) { // If reference counter was decremented to zero
        updateChildren(collection, id, collection.relations, true);
        delete collection[id];
        self.removed(collection.name, id);
      } else {
        var fields = {};
        _.each(collection[id].data, function(vals, key) {
          if (index in vals) {
            fields[key] = 1;
            delete vals[index];
          }
        });
        updateFromData(collection, id, fields);
        updateChildren(collection, id, fields);
      }
    }

    self.addDependency = function(name, fields, callback) {
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
    
    var cursors = callback.apply(self, arguments);
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

      function CursorWrapper(cursor, collection, index) {
        this.activeItems = {};
        this.collection = collection;
        this.index = index;
        var self = this;
        this.observer = cursor.observeChanges({
          added:   function(id, fields) {
            self.activeItems[id] = 1;
            fields['_id'] = id;
            smartAdded  (collection, index, id, fields);
          },
          changed: function(id, fields) {
            smartChanged(collection, index, id, fields);
          },
          removed: function(id) {
            delete self.activeItems[id];
            smartRemoved(collection, index, id);
          },
        })
      };

      var name = c._cursorDescription.collectionName;
      if (!name) throw new Meteor.Error("Unable to get cursor's collection name");
      observers.push(new CursorWrapper(c, getCollectionByName(name), i).observer);
    }
    this.ready();
    this.onStop(function() {
      _.forEach(observers, function(x) { x.stop(); });
    });
  });
}
