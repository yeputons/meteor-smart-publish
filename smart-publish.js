var isCursor = function (c) {
  return c && c._publishCursor;
};

Meteor.smartPublish = function(name, callback) {
  Meteor.publish(name, function() {
    var self = this;
    var collections = {};

    self.smartAdded = function(name, id, fields) {
      if (!name)
        throw new Meteor.Error("Trying to add element to anonymous collection");

      collections[name] = collections[name] || {};

      if (!collections[name][id]) {
        self.added(name, id, fields);
        collections[name][id] = { count: 1 };
      } else {
        collections[name][id].count++;
      }
    }
    self.smartRemoved = function(name, id) {
      if (!name                 ) throw new Meteor.Error("Trying to remove element from anonymous collection");
      if (!collections[name]    ) throw new Meteor.Error("Removing element from non-existing collection '" + name + "'");
      if (!collections[name][id]) throw new Meteor.Error("Removing unexisting element '" + id + "' from collection '" + name + "'");

      if (!--collections[name][id].count) { // If reference counter was decremented to zero
        delete collections[name][id];
        self.removed(name, id);
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
      var name = c._cursorDescription.collectionName;
      if (!name) throw new Meteor.Error("Unable to get cursor's collection name");

      observers.push(c.observeChanges({
        added:   function(id, fields) {self.smartAdded  (name, id, fields); },
        changed: function(id, fields) {self.changed     (name, id, fields); },
        removed: function(id)         {self.smartRemoved(name, id, fields); },
      }));
    }
    this.ready();
    this.onStop(function() {
      _.forEach(observers, function(x) { x.stop(); });
    });
  });
}
