var ItemsA = new Meteor.Collection('ItemsA');
var ItemsB = new Meteor.Collection('ItemsB');
var ItemsC = new Meteor.Collection('ItemsC');

var tempBinary = EJSON.newBinary(3);
tempBinary[0] = 1;
tempBinary[1] = 3;
tempBinary[2] = 2;
var itemCValue = {
  _id: new Meteor.Collection.ObjectID('01234567890123456789abcd'),
  number0: 0,
  number1: 123,
  string0: '',
  string1: 'hello',
  bool0: false,
  bool1: true,
  arr0: [],
  arr1: [1, 2, 'hi', {obj: false}, null, {'': null}],
  arr2: [null],
  null: null,
  '': null,
  someDate: new Date('2014-02-23T01:23:45Z'),
  binary: tempBinary,
};

if (Meteor.isServer) {
  Meteor.methods({
    initDb: function() {
      ItemsA.remove({});
      ItemsB.remove({});
      ItemsC.remove({});
      for (var i = 1; i <= 11; i++) {
        ItemsA.insert({val: i, a: 1, b: 1, x: {a: 1, b: 1}});
        ItemsB.insert({val: i, a: 1, b: 1, x: {a: 1, b: 1}});
      }
      ItemsC.insert(itemCValue);
    }
  });

  Meteor.smartPublish('items', function(l, r) {
    return [
      ItemsA.find({val: {$lt: l}}, {fields: {val: 1, a: 1, 'x.a': 1}}),
      ItemsA.find({val: {$gt: r}}, {fields: {val: 1, b: 1, 'x.b': 1}}),
      ItemsB.find({val: {$lt: r}}, {fields: {val: 1, a: 1, 'x.a': 1}}),
      ItemsB.find({val: {$gt: l}}, {fields: {val: 1, b: 1, 'x.b': 1}}),
      ItemsC.find(),
      ItemsC.find(),
      ItemsC.find(),
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
    Meteor.call('initDb', function(err) {
      test.isUndefined(err, 'error during initialization: ' + err);
      test.equal(ItemsA.find().count(), 0, 'ItemsA is not empty');
      test.equal(ItemsB.find().count(), 0, 'ItemsB is not empty');
      test.equal(ItemsC.find().count(), 0, 'ItemsÑ is not empty');
      next();
    });
  });

  function getVals(coll, filter) {
    return _.pluck(coll.find(filter || {}, {fields: {val: 1}}).fetch(), 'val')
  }

  var subscr;
  Tinytest.addAsync('subscription start', function(test, next) {
    subscr = Meteor.subscribe('items', 4, 9, function() {
      test.equal(getVals(ItemsA), [1,2,3,10,11], 'ItemsA is invalid');
      test.equal(getVals(ItemsB), [1,2,3,4,5,6,7,8,9,10,11], 'ItemsB is invalid');

      test.equal(getVals(ItemsA,    {a : 1}), [1,2,3], 'ItemsA.a is invalid');
      test.equal(getVals(ItemsA, {'x.a': 1}), [1,2,3], 'ItemsA.x.a is invalid');
      test.equal(getVals(ItemsA,    {b : 1}), [10,11], 'ItemsA.b is invalid');
      test.equal(getVals(ItemsA, {'x.b': 1}), [10,11], 'ItemsA.x.b is invalid');
      test.equal(getVals(ItemsB,    {a : 1}), [1,2,3,4,5,6,7,8], 'ItemsB.a is invalid');
      test.equal(getVals(ItemsB, {'x.a': 1}), [1,2,3,4,5,6,7,8], 'ItemsB.x.a is invalid');
      test.equal(getVals(ItemsB,    {b : 1}), [5,6,7,8,9,10,11], 'ItemsB.b is invalid');
      test.equal(getVals(ItemsB, {'x.b': 1}), [5,6,7,8,9,10,11], 'ItemsB.x.b is invalid');
      next();
    });
  });

  Tinytest.addAsync('several publications of the same field', function(test, next) {
    test.equal(ItemsC.find().fetch(), [itemCValue], 'ItemsC is incorrect');
    next();
  });

  Tinytest.addAsync('update with element remove', function(test, next) {
    ItemsA.update(ItemsA.findOne({val: 2})._id, {$set: {val: 4}}, function(err, res) {
      test.isUndefined(err, 'error during update: ' + err);
      test.equal(getVals(ItemsA), [1,3,10,11], 'ItemsA');
      next();
    });
  });

  Tinytest.addAsync('update with element add', function(test, next) {
    Meteor.call('updateA6To0', function(err, res) {
      test.isUndefined(err, 'error during method call: ' + err);
      test.equal(getVals(ItemsA), [1,3,10,11,0], 'ItemsA');
      next();
    });
  });

  Tinytest.addAsync('update with field add', function(test, next) {
    var id = ItemsB.findOne({val: 2})._id;
    test.equal(ItemsB.findOne(id), {_id: id, val: 2, a: 1, x: {a: 1}}, 'initial fieldset');
    ItemsB.update(id, {$set: {val: 5}}, function(err, res) {
      test.isUndefined(err, 'error during update: ' + err);
      test.equal(ItemsB.findOne(id), {_id: id, val: 5, a: 1, b: 1, x: {a: 1, b: 1}}, 'resulting fieldset');
      next();
    });
  });

  Tinytest.addAsync('update with field remove', function(test, next) {
    var id = ItemsB.findOne({val: 5})._id;
    test.equal(ItemsB.findOne(id), {_id: id, val: 5, a: 1, b: 1, x: {a: 1, b: 1}}, 'initial fieldset');
    ItemsB.update(id, {$set: {val: 0}}, function(err, res) {
      test.isUndefined(err, 'error during update: ' + err);
      test.equal(ItemsB.findOne(id), {_id: id, val: 0, a: 1, x: {a: 1}}, 'resulting fieldset');
      next();
    });
  });

  Tinytest.addAsync('update with field remove&add', function(test, next) {
    var id = ItemsB.findOne({val: 3})._id;
    test.equal(ItemsB.findOne(id), {_id: id, val: 3, a: 1, x: {a: 1}}, 'initial fieldset');
    ItemsB.update(id, {$set: {val: 12}}, function(err, res) {
      test.isUndefined(err, 'error during update: ' + err);
      test.equal(ItemsB.findOne(id), {_id: id, val: 12, b: 1, x: {b: 1}}, 'resulting fieldset');
      next();
    });
  });

  Tinytest.addAsync('update with field add&remove', function(test, next) {
    var id = ItemsB.findOne({val: 10})._id;
    test.equal(ItemsB.findOne(id), {_id: id, val: 10, b: 1, x: {b: 1}}, 'initial fieldset');
    ItemsB.update(id, {$set: {val: 3}}, function(err, res) {
      test.isUndefined(err, 'error during update: ' + err);
      test.equal(ItemsB.findOne(id), {_id: id, val: 3, a: 1, x: {a: 1}}, 'resulting fieldset');
      next();
    });
  });
  Tinytest.addAsync('two-stage update with field add&remove (2->1)', function(test, next) {
    var id = ItemsB.findOne({val: 11})._id;
    test.equal(ItemsB.findOne(id), {_id: id, val: 11, b: 1, x: {b: 1}}, 'initial fieldset');
    ItemsB.update(id, {$set: {val: 5.5}}, function(err, res) {
      test.isUndefined(err, 'error during update: ' + err);
      test.equal(ItemsB.findOne(id), {_id: id, val: 5.5, a: 1, b: 1, x: {a: 1, b: 1}}, 'intermediate fieldset');

      ItemsB.update(id, {$set: {val: -1}}, function(err, res) {
        test.isUndefined(err, 'error during update: ' + err);
        test.equal(ItemsB.findOne(id), {_id: id, val: -1, a: 1, x: {a: 1}}, 'resulting fieldset');
        next();
      });
    });
  });
  Tinytest.addAsync('two-stage update with field add&remove (1->2)', function(test, next) {
    var id = ItemsB.findOne({val: 1})._id;
    test.equal(ItemsB.findOne(id), {_id: id, val: 1, a: 1, x: {a: 1}}, 'initial fieldset');
    ItemsB.update(id, {$set: {val: 5.5}}, function(err, res) {
      test.isUndefined(err, 'error during update: ' + err);
      test.equal(ItemsB.findOne(id), {_id: id, val: 5.5, a: 1, b: 1, x: {a: 1, b: 1}}, 'intermediate fieldset');

      ItemsB.update(id, {$set: {val: 13}}, function(err, res) {
        test.isUndefined(err, 'error during update: ' + err);
        test.equal(ItemsB.findOne(id), {_id: id, val: 13, b: 1, x: {b: 1}}, 'resulting fieldset');
        next();
      });
    });
  });
  Tinytest.addAsync('field unset', function(test, next) {
    var id = ItemsB.findOne({val: 13})._id;
    test.equal(ItemsB.findOne(id), {_id: id, val: 13, b: 1, x: {b: 1}}, 'initial fieldset');
    ItemsB.update(id, {$unset: {'x.a': 1, b: 1}, $set: {val: 5.5}}, function(err, res) {
      test.isUndefined(err, 'error during update: ' + err);
      test.equal(ItemsB.findOne(id), {_id: id, val: 5.5, a: 1, x: {b: 1}}, 'resulting fieldset');
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
