smart-publish
=============

Rather smart publications for Meteor.

This package is developed as fast alternative of https://github.com/Diggsey/meteor-reactive-publish and
production-ready and working alternative of https://github.com/erundook/meteor-publish-with-relations, which
has several issues. I've decided that fixing all of them will make me to re-write all code and here is what I've done
instead.

== Features and usage ==
1. Publication of several cursors from the same collection - union of these cursors will be published. This is done
by storing counters for each element - in how many cursors is it presented. So, each connection requires linear amount of memory:

```
Meteor.smartPublish('users', function(id) {
  check(id, String);
  return [
    Meteor.users.find(this.userId),
    Meteor.users.find(id),
  ];
});
```

2. Reactive joins. Each element may 'depend on' arbitrary elements from this or another collections (say, each Post may depend on
its author and last ten voters). Not implemented yet.
