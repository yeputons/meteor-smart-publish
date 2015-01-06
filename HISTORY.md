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
