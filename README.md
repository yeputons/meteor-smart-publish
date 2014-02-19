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
its author and last ten voters). Not implemented yet.

Known issues and limitations
============================
1. No reactive joins yet
