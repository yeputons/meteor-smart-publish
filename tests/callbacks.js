// TODO: changing of 'enabled'
// TODO: mixing of callbacks and returned cursors
// TODO: on-the-fly changes of fields via callbacks

var CallbacksA = new Mongo.Collection('CallbacksA');

if (Meteor.isServer) {
  Meteor.methods({
    callbacks_initDb: function() {
      CallbacksA.remove({});
      for (var i = 1; i <= 15; i++) {
        CallbacksA.insert({val: i});
      }
    },
    callbacks_setEnabled: function(val, enabled) {
       CallbacksA.update({val: val}, {$set: {enabled: enabled}});
    },
  });

  Meteor.smartPublish('callbacks_items', function() {
    this.addDependency('CallbacksA', ['l', 'r'], function(fields) {
      return CallbacksA.find({val: {$in: [fields.l, fields.r]}});
    });

    var self = this;
    var handle = CallbacksA.find({enabled: true}).observeChanges({
      added: function(id, fields) {
        fields.l = fields.val * 2;
        fields.r = fields.val * 2 + 1;
        self.added("CallbacksA", id, fields);
      },
      changed: function(id, fields) {
        self.changed("CallbacksA", id, fields);
      },
      removed: function(id) {
        self.removed("CallbacksA", id);
      }
    });
    self.ready();
    self.onStop(function() {
      handle.stop();
    });
  });
}

if (Meteor.isClient) {
  Tinytest.addAsync('callbacks: init', function(test, next) {
    Meteor.call('callbacks_initDb', function(err) {
      test.isUndefined(err, 'error during initialization: ' + err);
      test.equal(CallbacksA.find().count(), 0, 'CallbacksA is not empty');
      next();
    });
  });

  var subscr;
  Tinytest.addAsync('callbacks: subscription start', function(test, next) {
    subscr = Meteor.subscribe('callbacks_items', function() {
      test.equal(CallbacksA.find().count(), 0, 'CallbacksA is not empty');
      next();
    });
  });

  function getVals(coll, filter) {
    return _.pluck(coll.find(filter || {}, {fields: {val: 1}}).fetch(), 'val')
  }
  function testAVals(test, expected) {
    var got = getVals(CallbacksA);
    got.sort();
    expected.sort();
    test.equal(got, expected, 'CallbacksA is invalid');
  }

  Tinytest.addAsync('callbacks: enabling 5, 7, 9', function(test, next) {
    Meteor.call('callbacks_setEnabled', {$in: [5,7,9]}, true, function(err, res) {
      test.isUndefined(err, 'error during update: ' + err);
      testAVals(test, [5,10,11,20,21,22,23,9,18,19,7,14,15,28,29,30,31]);
      next();
    });
  });

  Tinytest.addAsync('callbacks: subscription stop', function(test, next) {
    subscr.stop();
    Meteor.setTimeout(function() {
      test.equal(CallbacksA.find().count(), 0, 'CallbacksA is not empty');
      next();
    }, 100);
  });
}
