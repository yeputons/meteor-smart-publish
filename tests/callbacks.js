// TODO: changing of 'enabled'
// TODO: mixing of callbacks and returned cursors
// TODO: on-the-fly changes of fields via callbacks

var CallbacksA = new Mongo.Collection('CallbacksA');

if (Meteor.isServer) {
  Meteor.methods({
    callbacks_initDb: function() {
      CallbacksA.remove({});
      for (var i = 1; i <= 20; i++) {
        CallbacksA.insert({val: i});
      }
    },
    callbacks_setEnabled: function(val, enabled) {
      CallbacksA.update({val: val}, {$set: {enabled: enabled}}, {multi: true});
    },
  });

  function AlteringObserver(collectionName, uplink) {
    this.added = function(id, fields) {
      fields.l = fields.val * 2;
      fields.r = fields.val * 2 + 1;
      uplink.added(collectionName, id, fields);
    };
    this.changed = function(id, fields) {
      uplink.changed(collectionName, id, fields);
    };
    this.removed = function(id) {
      uplink.removed(collectionName, id);
    }
  }

  Meteor.smartPublish('callbacks_items', function() {
    this.addDependency('CallbacksA', ['l', 'r'], function(fields) {
      return CallbacksA.find({val: {$in: [fields.l, fields.r]}});
    });

    var self = this;
    var handle = CallbacksA.find({enabled: true}).observeChanges(new AlteringObserver('CallbacksA', self));
    self.onStop(function() {
      handle.stop();
    });
  });
  Meteor.smartPublish('callbacks_items_deep', function() {
    this.addDependency('CallbacksA', ['l', 'r'], function(fields) {
      var self = this;
      var handle = CallbacksA.find({val: {$in: [fields.l, fields.r]}}).observeChanges(new AlteringObserver('CallbacksA', self));
      self.onStop(function() {
        handle.stop();
      });
    });

    var self = this;
    var handle = CallbacksA.find({enabled: true}).observeChanges(new AlteringObserver('CallbacksA', self));
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
      testAVals(test, [10,11,5,14,15,7,18,19,9]);
      next();
    });
  });

  Tinytest.addAsync('callbacks: enabling 10', function(test, next) {
    Meteor.call('callbacks_setEnabled', {$in: [10]}, true, function(err, res) {
      test.isUndefined(err, 'error during update: ' + err);
      testAVals(test, [10,11,5,14,15,7,18,19,9,20]);
      next();
    });
  });

  Tinytest.addAsync('callbacks: disabling 5', function(test, next) {
    Meteor.call('callbacks_setEnabled', {$in: [5]}, false, function(err, res) {
      test.isUndefined(err, 'error during update: ' + err);
      testAVals(test, [10,14,15,7,18,19,9,20]);
      next();
    });
  });

  Tinytest.addAsync('callbacks: disabling 10', function(test, next) {
    Meteor.call('callbacks_setEnabled', {$in: [10]}, false, function(err, res) {
      test.isUndefined(err, 'error during update: ' + err);
      testAVals(test, [14,15,7,18,19,9]);
      next();
    });
  });

  Tinytest.addAsync('callbacks: enabling 5', function(test, next) {
    Meteor.call('callbacks_setEnabled', {$in: [5]}, true, function(err, res) {
      test.isUndefined(err, 'error during update: ' + err);
      testAVals(test, [14,15,7,18,19,9,10,11,5]);
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

  Tinytest.addAsync('callbacks-deep: deep subscription start', function(test, next) {
    subscr = Meteor.subscribe('callbacks_items_deep', function() {
      testAVals(test, [20,10,11,5,14,15,7,18,19,9]);
      test.equal(CallbacksA.findOne({val:  5}).l, 10, '`l` is invalid for item with val=5');
      test.equal(CallbacksA.findOne({val:  5}).r, 11, '`r` is invalid for item with val=5');
      test.equal(CallbacksA.findOne({val: 11}).l, 22, '`l` is invalid for item with val=11');
      test.equal(CallbacksA.findOne({val: 11}).r, 23, '`r` is invalid for item with val=11');
      next();
    });
  });

  Tinytest.addAsync('callbacks-deep: enabling 10', function(test, next) {
    Meteor.call('callbacks_setEnabled', 10, true, function(err, res) {
      test.isUndefined(err, 'error during update: ' + err);
      testAVals(test, [20,10,11,5,14,15,7,18,19,9]);
      next();
    });
  });

  Tinytest.addAsync('callbacks-deep: disabling 5', function(test, next) {
    Meteor.call('callbacks_setEnabled', 5, false, function(err, res) {
      test.isUndefined(err, 'error during update: ' + err);
      testAVals(test, [20,10,14,15,7,18,19,9]);
      next();
    });
  });

  Tinytest.addAsync('callbacks-deep: disabling 10', function(test, next) {
    Meteor.call('callbacks_setEnabled', 10, false, function(err, res) {
      test.isUndefined(err, 'error during update: ' + err);
      testAVals(test, [14,15,7,18,19,9]);
      next();
    });
  });

  Tinytest.addAsync('callbacks-deep: subscription stop', function(test, next) {
    subscr.stop();
    Meteor.setTimeout(function() {
      test.equal(CallbacksA.find().count(), 0, 'CallbacksA is not empty');
      next();
    }, 100);
  });
}
