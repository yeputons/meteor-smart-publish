## vNEXT
* #9: now `this.added`/`this.changed`/`this.removed` callbacks can be called in both publish function and dependency functions: it's treated as if one more cursor were returned, so you can both return cursors and use these callbacks
* `this.ready` was explicitly removed in smartPublish callback, because it's automatically called after its end
* dependency functions are allowed to not return. You're expected to use `this.added` and friends in that case, otherwise your dependency function is useless.

## v0.1.8
* Some refactoring was done
* Now elements are added to publication _after_ all dependencies and removed _before_ all dependencies (contrary to what was before); that is, all dependencies are resolved at any particular moment of time
* #6 was fixed: now you can use Mongo.ObjectID together with strings as ids of elements

## v0.1.7
* README updated with new information about demo (it works with latest Meteor now)
* `.versions` was added to gitignore

## v0.1.6
* Removed support of Meteor <0.9.1 and Meteorite
* `versions.json` was removed

## v0.1.5

* Bug fix (#8): now you can specify nested fields (like 'profile.avatar') as parameter for `addDependency`. However, it tracks the whole subdocument, not the only field, which is still not the best option for performance.

## v0.1.4

* Bug fix (#4): now adding new fields to the items published does not crash the server

## v0.1.3

* Bug fix (#2): dynamic change of foreign keys

## v0.1.2

* `EJSON.clone()` is now used for deep copying instead of underscore's one
