smart-publish
=============

Rather smart publications for Meteor.

This package is developed as fast alternative of https://github.com/Diggsey/meteor-reactive-publish and
production-ready and working alternative of https://github.com/erundook/meteor-publish-with-relations, which
has several issues. I've decided that fixing all of them will make me to re-write all code and here is what I've done
instead. Unfortunatelly, this package is not done yet (see 'known issues and limitations' below)

Features and usage
==================

Several cursors publication
---------------------------
Publication of several cursors from the same collection - union of these cursors will be published. This is done
by storing counters for each element - in how many cursors is it presented. So, each connection requires linear amount of memory:

```
Meteor.smartPublish('users', function(id) {
  check(id, String);
  return [
    Meteor.users.find(this.userId),
    Meteor.users.find(id),
    Items.find({author: this.userId})
  ];
});

Meteor.smartPublish('items', function(l, r) {
  check(l, Number);
  check(r, Number);
  return [
    Items.find({value: {$lt: l}}),
    Items.find({value: {$gt: r}}),
  ];
});
```

Reactive joins
--------------

Each element may 'depend on' arbitrary elements from this or another collections (say, each Post may depend on
its author and last ten voters). Not implemented yet.

Known issues and limitations
============================
1. No reactive joins yet
2. If you publish several cursors with different subsets of fields from the same collection, some fields may be not removed from client after they
   disappeared from cursor. Say, if you publish fields `user.A` for users from query `Q1` and `user.B` for query `Q2` and some user `X` falls under both queries,
   both fields will be available on client, as expected. But if `X` is no longer falls under `Q1`, field `user.A` won't be removed from client, because
   no per-field reference counting is implemented yet. However, no further updates on this field will be sent.
