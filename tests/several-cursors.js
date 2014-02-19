ItemsA = new Meteor.Collection('ItemsA');
ItemsB = new Meteor.Collection('ItemsB');

if (Meteor.isServer) {
  ItemsA.remove({});
  ItemsB.remove({});
  for (var i = 1; i <= 10; i++) {
    ItemsA.insert({val: i});
    ItemsB.insert({val: i});
  }

  Meteor.smartPublish('items', function(l, r) {
    return [
      ItemsA.find({val: {$lt: l}}),
      ItemsA.find({val: {$gt: r}}),
      ItemsB.find({val: {$lt: r}}),
      ItemsB.find({val: {$gt: l}}),
    ];
  });
  Meteor.methods({
    updateA6To0: function() {
      ItemsA.update({val: 6}, {$set: {val: 0}});
    }
  });
}

if (Meteor.isClient) {
  Tinytest.addAsync('init', function(test, next) {
    test.equal(ItemsA.find().count(), 0, 'ItemsA is not empty');
    test.equal(ItemsB.find().count(), 0, 'ItemsB is not empty');
    next();
  });

  function getVals(coll) {
    return _.pluck(coll.find({}, {fields: {val: 1}}).fetch(), 'val')
  }

  var subscr;
  Tinytest.addAsync('subscription start', function(test, next) {
    subscr = Meteor.subscribe('items', 4, 9, function() {
      test.equal(getVals(ItemsA), [1,2,3,10], 'ItemsA is invalid');
      test.equal(getVals(ItemsB), [1,2,3,4,5,6,7,8,9,10], 'ItemsB is invalid');
      next();
    });
  });

  Tinytest.addAsync('update with element remove', function(test, next) {
    ItemsA.update(ItemsA.findOne({val: 2})._id, {$set: {val: 4}}, function(err, res) {
      test.isUndefined(err, 'error during update: ' + err);
      test.equal(getVals(ItemsA), [1,3,10], 'ItemsA');
      next();
    });
  });

  Tinytest.addAsync('update with element add', function(test, next) {
    Meteor.call('updateA6To0', function(err, res) {
      test.isUndefined(err, 'error during method call: ' + err);
      test.equal(getVals(ItemsA), [1,3,10,0], 'ItemsA');
      next();
    });
  });

  Tinytest.addAsync('subscription stop', function(test, next) {
    subscr.stop();
    Meteor.setTimeout(function() {
      test.equal(ItemsA.find().count(), 0, 'ItemsA is not empty');
      test.equal(ItemsB.find().count(), 0, 'ItemsB is not empty');
      next();
    }, 100);
  });
}
