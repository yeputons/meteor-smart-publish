BaseCollection = function(name) {
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

CollectionItem = function(id, collection, fields, dependencyCursorId) {
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
      self.children[dep.id].forEach(function(x) {
        toRemove = toRemove.concat(x.getActiveItems());
        x.stop();
      });
    }

    if (!removeAll) {
      var context = new CallbacksWrapper(self.collection.publication.getCollectionByName);
      var cursors = dep.callback.apply(context, [self.mergedData]);
      var wrappers = getWrappersFromCallbackResult(self.collection.publication.getCollectionByName, cursors);
      wrappers.push(context);
      self.children[dep.id] = wrappers;
    } else {
      delete self.children[dep.id];
    }
    toRemove.forEach(function(args) {
      args[0].smartRemoved(args[1], args[2]);
    });
  });
}
