meteor-smart-publish
=============

Rather smart publications for Meteor.

This package is developed as fast alternative of https://github.com/Diggsey/meteor-reactive-publish and
production-ready and working alternative of https://github.com/erundook/meteor-publish-with-relations, which
has several issues. I've decided that fixing all of them will make me to re-write all code and here is what I've done
instead.

_WARNING_: this version this lacks big corner tests and the code is relatively complex, so I kindly ask you
not to use this in production, because awful things may happen in case of bugs. I'll be happy if you help me
generate corner cases (like empty keys in JSON or `null` values) and other interesting tests, even if current
version successfully passes them.

Features and usage
==================

Demonstration
-------------

You can see this package in action at <a href="http://smart-publish-demo.meteor.com/">`smart-publish-demo.meteor.com`</a>, source
code is available in <a href="https://github.com/yeputons/meteor-smart-publish-demo-basic">yeputons/meteor-smart-publish-demo-basic</a>.

Installation
------------

Just run `meteor add mrt:smart-publish`.

Several cursors publication
---------------------------
Publication of several cursors from the same collection - union of these cursors will be published. This is done
by storing counters for each element - in how many cursors is it presented. So, each connection requires linear amount of memory:

```
Meteor.smartPublish('users', function(id) {
  check(id, String);
  return [
    Meteor.users.find(this.userId),
    Meteor.users.find(id, {fields: {username: 1}}),
    Items.find({author: this.userId})
  ];
});

Meteor.smartPublish('items', function(l, r) {
  check(l, Number);
  check(r, Number);
  return [
    Items.find({value: {$lt: l}}, {fields: {value: 1, a: 1, 'x.a': 1}}),
    Items.find({value: {$gt: r}}, {fields: {value: 1, b: 1, 'x.b': 1}}),
  ];
});
```

Please note that different cursors may not even return different subsets of collection, they may return subsets with non-empty intersection and
different fields - union of fields will be correctly published, just like if you subscribe to several publications, which publish same elements.
This may not work with array projections (`$` and `$elemMatch`), though - I would be happy if you write a usecase and a test for me (and I would
be very happy if you fix this).

Reactive joins
--------------

Each element may 'depend on' arbitrary elements from this or another collections (say, each Post may depend on
its author and last ten voters):

```
Posts = new Posts('posts_collection');
Avatars = new Avatars('avatars');
Meteor.smartPublish('posts', function(limit) {
  this.addDependency('posts_collection', 'authorId' /* you may specify array of fields here as well */, function(post) {
    return Meteor.users.find(post.authorId); // Please note that callback should return cursor, don't use findOne here
  })
  this.addDependency('posts_collection', 'voters', function(post) {
    return [ Meteor.users.find({_in: _.first(post.voters, 10)}) ];
  })
  this.addDependency('users', 'avatar', function(user) { // All dependencies are recursively pushed
    return Avatars.find(user.avatar);
  });
  return Posts.find({}, {limit: limit});
});
```

For each dependency, you should specify one or more fields that affect cursors that are returned by your callback (for example, empty array
or `_id` if you have reverse foreign keys). When any of these fields is updated, your callback is automatically re-run, new data is fetched
recursively, old data is dismissed. 'Diamond' joins are supported as well without any changes.

Custom datasets instead of cursors
----------------------------------
As mentioned in #9, there can be some situations where you want to customize data set: you may want to alter data sent to client
in some way or do even more evil stuff with `this.added`/`this.changed`/`this.removed` callbacks. You're free to use these callbacks
both in the publish function and in dependency functions. Do not call `this.ready()` in either one - it's automatically called
after top-level callback (i.e. parameter of `smartPublish`) finishes its execution.

Here is an example of 'on-the-fly' binary heap from tests:

```
function AlteringObserver(uplink) {
  this.added = function(id, fields) {
    fields.l = fields.val * 2;
    fields.r = fields.val * 2 + 1;
    uplink.added('HeapItems', id, fields);
  };
  this.changed = function(id, fields) {
    uplink.changed('HeapItems', id, fields);
  };
  this.removed = function(id) {
    uplink.removed('HeapItems', id);
  }
}
Meteor.smartPublish('heap', function() {
  this.addDependency('HeapItems', ['l', 'r'], function(fields) {
    // Here 'this' refers to dependency only, so 'onStop' is called when this
    // dependency becomes obsolote
    var handle = HeapItems.find({val: {$in: [fields.l, fields.r]}}).observeChanges(new AlteringObserver(this));
    this.onStop(function() {
      handle.stop();
    });
  });
  var handle = HeapItems.find({selected: true}).observeChanges(new AlteringObserver(this));
  this.onStop(function() {
    handle.stop();
  });
});
```

In this example `HeapItems` collection contain some items with `val` property specified. When you select some item by setting
its `selected` to `true`, it and all its children (which are generated on-the-fly) are published to client together with their `l` and `r` properties,
which were not initially in the DB.

Known issues and limitations
============================
1. Not enough tests yet.
2. Because I use links counter for tracking dependencies, circular dependencies may preserve some elements from deletion. Say, if you publish A, B depends on A, and B and C depends
on each other, removal of A won't remove B and C from the resulting set as they still have some incoming dependencies.
3. `smart-publish` tracks fields on document-level only. I.e. if you track `profile.avatar` property, the whole `profile` is tracked instead, which, unfortunately,
is not the best option for performance.

Running tests
=============

Run `meteor test-packages ./` in a directory with package and navigate to <a href="http://localhost:3000">`http://localhost:3000`</a> to run tests and see results. Hot code push should work.
