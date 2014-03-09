var JoinedA = new Meteor.Collection('JoinedA');
var JoinedB = new Meteor.Collection('JoinedB');

if (Meteor.isServer) {
  var idFieldWasNotAvailable; // How many times fields._id was undefined in addDependency callback
  var addDependencyCount;     // How many times addDependency callback was called

  Meteor.methods({
    joins_initDb: function() {
      idFieldWasNotAvailable = 0;
      addDependencyCount = 0;

      JoinedA.remove({});
      JoinedB.remove({});
      for (var i = 10; i <= 20; i++) {
        JoinedA.insert({val: i});
      }
      JoinedA.insert({val: 1, l: 1, r: 7});
      JoinedA.insert({val: 2, l: 4, r: 10});

      for (var i = 1; i <= 10; i++) {
        JoinedB.insert({val: i});
      }
    },
    joins_setEnabled: function(val, enabled) {
      JoinedA.update({val: val}, {$set: {enabled: enabled}});
    },
    idFieldWasAvailable: function() {
      return {
        fail: idFieldWasNotAvailable,
        total: addDependencyCount
      };
    }
  });

  Meteor.smartPublish('joins_items', function() {
    this.addDependency('JoinedA', ['l', 'r'], function(fields) {
      if (_.isUndefined(fields.l) || _.isUndefined(fields.r)) return [];

      // Check for fields._id's correctness
      var el = undefined;
      if (fields._id) {
        el = JoinedA.findOne(fields._id);
      }
      if (!el || el.l != fields.l || el.r != fields.r) {
        idFieldWasNotAvailable++;
      }
      addDependencyCount++;

      return JoinedB.find({$and: [
        {val: {$gte: fields.l}},
        {val: {$lte: fields.r}}
      ]});
    });
    this.addDependency('JoinedB', 'val', function(fields) {
      return JoinedA.find({val: 9 + fields.val});
    });
    return JoinedA.find({enabled: true});
  });
}

if (Meteor.isClient) {
  Tinytest.addAsync('joins: init', function(test, next) {
    Meteor.call('joins_initDb', function(err) {
      test.isUndefined(err, 'error during initialization: ' + err);
      test.equal(JoinedA.find().count(), 0, 'JoinedA is not empty');
      test.equal(JoinedB.find().count(), 0, 'JoinedB is not empty');
      next();
    });
  });

  var subscr;
  Tinytest.addAsync('joins: subscription start', function(test, next) {
    subscr = Meteor.subscribe('joins_items', function() {
      test.equal(JoinedA.find().count(), 0, 'JoinedA is not empty');
      test.equal(JoinedB.find().count(), 0, 'JoinedB is not empty');
      next();
    });
  });

  function getVals(coll, filter) {
    return _.pluck(coll.find(filter || {}, {fields: {val: 1}}).fetch(), 'val')
  }

  Tinytest.addAsync('joins: enabling 1..7', function(test, next) {
    Meteor.call('joins_setEnabled', 1, true, function(err, res) {
      test.isUndefined(err, 'error during update: ' + err);
      test.equal(getVals(JoinedA), [1,10,11,12,13,14,15,16], 'JoinedA is invalid');
      test.equal(getVals(JoinedB), [1,2,3,4,5,6,7], 'JoinedB is invalid');
      next();
    });
  });

  Tinytest.addAsync('joins: enabling 4..10', function(test, next) {
    Meteor.call('joins_setEnabled', 2, true, function(err, res) {
      test.isUndefined(err, 'error during update: ' + err);
      test.equal(getVals(JoinedA), [1,10,11,12,13,14,15,16,2,17,18,19], 'JoinedA is invalid');
      test.equal(getVals(JoinedB), [1,2,3,4,5,6,7,8,9,10], 'JoinedB is invalid');
      next();
    });
  });

  Tinytest.addAsync('joins: disabling 1..7', function(test, next) {
    Meteor.call('joins_setEnabled', 1, false, function(err, res) {
      test.isUndefined(err, 'error during update: ' + err);
      test.equal(getVals(JoinedA), [13,14,15,16,2,17,18,19], 'JoinedA is invalid');
      test.equal(getVals(JoinedB), [4,5,6,7,8,9,10], 'JoinedB is invalid');
      next();
    });
  });

  Tinytest.addAsync('joins: changing 4..10 to 4..8', function(test, next) {
    JoinedA.update(JoinedA.findOne({l: 4, r: 10})._id, {$set: {r: 8}}, function(err, res) {
      test.isUndefined(err, 'error during update: ' + err);
      test.equal(getVals(JoinedA), [13,14,15,16,2,17], 'JoinedA is invalid');
      test.equal(getVals(JoinedB), [4,5,6,7,8], 'JoinedB is invalid');
      next();
    });
  });

  Tinytest.addAsync('joins: disabling 4..10', function(test, next) {
    Meteor.call('joins_setEnabled', 2, false, function(err, res) {
      test.isUndefined(err, 'error during update: ' + err);
      test.equal(JoinedA.find().count(), 0, 'JoinedA is not empty');
      test.equal(JoinedB.find().count(), 0, 'JoinedB is not empty');
      next();
    });
  });

  Tinytest.addAsync('joins: subscription stop', function(test, next) {
    subscr.stop();
    Meteor.setTimeout(function() {
      test.equal(JoinedA.find().count(), 0, 'JoinedA is not empty');
      test.equal(JoinedB.find().count(), 0, 'JoinedB is not empty');
      next();
    }, 100);
  });

  Tinytest.addAsync('joins: fields._id was correct in all addDependency callbacks', function(test, next) {
    Meteor.call('idFieldWasAvailable', function(err, res) {
      test.equal(res.fail, 0, 'was not available or invalid in some of ' + res.total + ' callbacks');
      next();
    });
  });
}
