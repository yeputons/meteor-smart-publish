var isCursor = function (c) {
  return c && c._publishCursor;
};

Meteor.smartPublish = function(name, callback) {
  Meteor.publish(name, function() {
    var self = this;
    var collections = {};

    updateFromData = function(name, id, fields) {
      var res = {};
      _.each(fields, function(flag, key) {
        var cur = undefined;
        _.each(collections[name][id].data[key], (function(value) {
          // No deep-copy so far, here is workaround as we work with very simple objects
          cur = _.extend(JSON.parse(JSON.stringify(value)), cur);
        }));
        res[key] = cur;
      });
      self.changed(name, id, res);
    }
    smartAdded = function(name, index, id, fields) {
      if (!name)
        throw new Meteor.Error("Trying to add element to anonymous collection");

      collections[name] = collections[name] || {};

      if (!collections[name][id]) {
        self.added(name, id, fields);
        collections[name][id] = { count: 1, data: {} };
        _.each(fields, function(val, key) {
          collections[name][id].data[key] = collections[name][id].data[key] || {};
          collections[name][id].data[key][index] = val;
        });
      } else {
        _.each(fields, function(val, key) {
          collections[name][id].data[key] = collections[name][id].data[key] || {};
          collections[name][id].data[key][index] = val;
        });
        collections[name][id].count++;
        updateFromData(name, id, fields);
      }
    }
    smartChanged = function(name, index, id, fields) {
      _.each(fields, function(val, key) {
        if (val === undefined) {
          delete collections[name][id].data[key][index];
        } else {
          collections[name][id].data[key][index] = val;
        }
      });
      updateFromData(name, id, fields);
    }
    smartRemoved = function(name, index, id) {
      if (!name                 ) throw new Meteor.Error("Trying to remove element from anonymous collection");
      if (!collections[name]    ) throw new Meteor.Error("Removing element from non-existing collection '" + name + "'");
      if (!collections[name][id]) throw new Meteor.Error("Removing unexisting element '" + id + "' from collection '" + name + "'");

      if (!--collections[name][id].count) { // If reference counter was decremented to zero
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
      }
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
        observers.push(c.observeChanges({
          added:   function(id, fields) {smartAdded  (name, index, id, fields); },
          changed: function(id, fields) {smartChanged(name, index, id, fields); },
          removed: function(id)         {smartRemoved(name, index, id);         },
        }));
      };

      var name = c._cursorDescription.collectionName;
      if (!name) throw new Meteor.Error("Unable to get cursor's collection name");
      publishCursor(c, name, i);
    }
    this.ready();
    this.onStop(function() {
      _.forEach(observers, function(x) { x.stop(); });
    });
  });
}
