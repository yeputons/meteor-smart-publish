SingleCollectionCallbacksWrapper = function(collection) {
  this.activeItems = {};
  this.collection = collection;
  this.dependencyCursorId = Random.id();
  this.getActiveItems = function() {
    var result = [];
    var self = this;
    _.each(this.activeItems, function(realId, strId) { // #6: if we use ObjectID as a key only, it won't work with Meteor
      result.push([self.collection, self.dependencyCursorId, realId]);
    });
    return result;
  }
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

CursorWrapper = function(cursor, collection) {
  SingleCollectionCallbacksWrapper.call(this, collection);
  this.observer = cursor.observeChanges(this);
  this.stop = function() {
    this.observer.stop();
  }
};
CursorWrapper.prototype = Object.create(SingleCollectionCallbacksWrapper.prototype);

CallbacksWrapper = function(getCollectionByName) {
  var collectionWrappers = {};
  this.added = function(name, id, fields) {
    collectionWrappers[name] = collectionWrappers[name] || new SingleCollectionCallbacksWrapper(getCollectionByName(name));
    collectionWrappers[name].added(id, fields);
  };
  this.changed = function(name, id, fields) {
    collectionWrappers[name].changed(id, fields);
  };
  this.removed = function(name, id) {
    collectionWrappers[name].removed(id);
  };
  this.getActiveItems = function() {
    var result = [];
    _.each(collectionWrappers, function(wrapper, name) {
      result = result.concat(wrapper.getActiveItems());
    });
    return result;
  }
  this.onStopCallbacks = [];
  this.onStop = function(callback) {
    this.onStopCallbacks.push(callback);
  }
  this.stop = function() {
    _.each(this.onStopCallbacks, function(callback) {
      callback();
    });
  }
};

getWrappersFromCallbackResult = function(getCollectionByName, cursors) {
  if (!cursors) cursors = [];
  if (isCursor(cursors)) cursors = [cursors];
  if (!_.isArray(cursors)) {
    throw new Meteor.Error("Smart-publish callback function can only return a Cursor or an array of Cursors");
  }
  if (!_.every(cursors, isCursor)) {
    throw new Meteor.Error("Smart-publish callback function returned an array of non-Cursors");
  }

  var wrappers = [];
  _.each(cursors, function(c) {
    wrappers.push(new CursorWrapper(c, getCollectionByName(getCursorCollectionName(c))));
  });
  return wrappers;
}
