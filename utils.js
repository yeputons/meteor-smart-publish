isCursor = function (c) {
  return c && c._publishCursor;
};

getCursorCollectionName = function(c) {
  if (!c._cursorDescription) {
    throw new Meteor.Error("Unable to get cursor's collection name");
  }
  var name = c._cursorDescription.collectionName;
  if (!name) {
    throw new Meteor.Error("Unable to get cursor's collection name");
  }
  return name;
}

deepCopy = function(value) {
  return EJSON.clone(value);
}

Dependency = function(callback) {
  this.callback = callback;
  this.id = Random.id();
}
