Package.describe({
  summary: "Smart publications with joins and multiple cursors from the same collection",
  version: "0.1.5",
  git: "https://github.com/yeputons/meteor-smart-publish.git",
  name: "mrt:smart-publish"
});

Package.on_use(function (api, where) {
  api.add_files('smart-publish.js', ['server']);
});

Package.on_test(function (api) {
  if (api.versionsFrom) { // Meteor >= 0.9.0 and new packaging system
    api.use('mrt:smart-publish');
  } else { // Meteorite
    api.use('smart-publish');
  }
  api.use('tinytest');
  api.use('insecure');

  api.add_files('tests/several-cursors.js', ['server', 'client']);
  api.add_files('tests/basic-joins.js', ['server', 'client']);
});
