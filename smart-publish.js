var isCursor = function (c) {
  return c && c._publishCursor;
};

var deepCopy = function(value) {
  return EJSON.clone(value);
}

Meteor.smartPublish = function(name, callback) {
  Meteor.publish(name, function() {
    var self = this;
    var collections = {};
    var relations = {};
    var dependencies = {};

    var updateFromData = function(name, id, fields) {
      var res = {};
      var merged = collections[name][id].mergedData;
      _.each(fields, function(flag, key) {
        var cur = undefined;
        _.each(collections[name][id].data[key], (function(value) {
          cur = _.extend(deepCopy(value), cur);
        }));
        res[key] = cur;
        if (_.isUndefined(cur)) {
          delete merged[key];
        } else {
          merged[key] = cur;
        }
      });
      self.changed(name, id, res);
    }

    var counter = 0; // this is global counter for index for publishCursor(), all indices should be different
    var updateChildren = function(name, id, fields, removeAll) {
      if (!relations[name]) return;
      var update = {};
      _.each(fields, function(flag, key) {
        if (!relations[name][key]) return;
        _.each(relations[name][key], function(id) {
          update[id] = true;
        });
      });
      _.each(update, function(flag, depId) {
        var dep = dependencies[name][depId];
        var toRemove = [];
        if (depId in collections[name][id].children) {
          collections[name][id].children[depId].forEach(function(x, i) {
            _.each(x.activeItems, function(flag, subid) {
              toRemove.push([x.name, x.index, subid]);
            });
            x.observer.stop();
          });
        }

        if (!removeAll) {
          var cursors = dep(collections[name][id].mergedData);
          if (isCursor(cursors)) cursors = [cursors];
          if (!_.isArray(cursors))
            throw new Meteor.Error("Dependency function can only return a Cursor or an array of Cursors");

          var observers = collections[name][id].children[depId] = [];
          for (var i = 0; i < cursors.length; i++) {
            var c = cursors[i];
            if (!isCursor(c))
              throw new Meteor.Error("Dependency function returned an array of non-Cursors");

            if (!c._cursorDescription) throw new Meteor.Error("Unable to get cursor's collection name");
            var subname = c._cursorDescription.collectionName;
            if (!subname) throw new Meteor.Error("Unable to get cursor's collection name");

            observers.push(publishCursor(c, subname, '_' + counter));
            counter++;
          }
        }
        toRemove.forEach(function(args) {
          smartRemoved.apply(this, args);
        });
      });
    }
    var smartAdded = function(name, index, id, fields) {
      if (!name)
        throw new Meteor.Error("Trying to add element to anonymous collection");

      collections[name] = collections[name] || {};

      if (!collections[name][id]) {
        self.added(name, id, fields);
        collections[name][id] = { count: 1, data: {}, mergedData: deepCopy(fields), children: {} };
        _.each(fields, function(val, key) {
          collections[name][id].data[key] = collections[name][id].data[key] || {};
          collections[name][id].data[key][index] = deepCopy(val);
        });
        updateChildren(name, id, relations[name]);
      } else {
        _.each(fields, function(val, key) {
          collections[name][id].data[key] = collections[name][id].data[key] || {};
          collections[name][id].data[key][index] = deepCopy(val);
        });
        collections[name][id].count++;
        updateFromData(name, id, fields);
        updateChildren(name, id, fields);
      }
    }
    var smartChanged = function(name, index, id, fields) {
      _.each(fields, function(val, key) {
        if (val === undefined) {
          delete collections[name][id].data[key][index];
        } else {
          collections[name][id].data[key][index] = deepCopy(val);
        }
      });
      updateFromData(name, id, fields);
    }
    var smartRemoved = function(name, index, id) {
      if (!name                 ) throw new Meteor.Error("Trying to remove element from anonymous collection");
      if (!collections[name]    ) throw new Meteor.Error("Removing element from non-existing collection '" + name + "'");
      if (!collections[name][id]) throw new Meteor.Error("Removing unexisting element '" + id + "' from collection '" + name + "'");

      if (!--collections[name][id].count) { // If reference counter was decremented to zero
        updateChildren(name, id, relations[name], true);
        delete collections[name][id];
        self.removed(name, id);
      } else {
        var fields = {};
        _.each(collections[name][id].data, function(vals, key) {
          if (index in vals) {
            fields[key] = 1;
            delete vals[index];
          }
        });
        updateFromData(name, id, fields);
        updateChildren(name, id, fields);
      }
    }

    self.addDependency = function(name, fields, callback) {
      if (!_.isArray(fields)) fields = [fields];
      relations[name] = relations[name] || {};
      dependencies[name] = dependencies[name] || [];
      fields.forEach(function(field) {
        relations[name][field] = relations[name][field] || [];
        relations[name][field].push(dependencies[name].length);
      });
      dependencies[name].push(callback);
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

      function publishCursor(c, name, index) {
        var activeItems = {};
        return {
          observer: c.observeChanges({
            added:   function(id, fields) {activeItems[id] = 1;    smartAdded  (name, index, id, fields); },
            changed: function(id, fields) {                        smartChanged(name, index, id, fields); },
            removed: function(id)         {delete activeItems[id]; smartRemoved(name, index, id);         },
          }),
          activeItems: activeItems,
          name: name,
          index: index
        }
      };

      var name = c._cursorDescription.collectionName;
      if (!name) throw new Meteor.Error("Unable to get cursor's collection name");
      observers.push(publishCursor(c, name, i).observer);
    }
    this.ready();
    this.onStop(function() {
      _.forEach(observers, function(x) { x.stop(); });
    });
  });
}
