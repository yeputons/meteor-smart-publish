Package.describe({
  summary: "Smart publications with joins and multiple cursors from the same collection",
  version: "0.1.8",
  git: "https://github.com/yeputons/meteor-smart-publish.git",
  name: "mrt:smart-publish"
});

Package.on_use(function (api, where) {
  api.add_files('utils.js', ['server']);
  api.add_files('collection-items.js', ['server']);
  api.add_files('wrappers.js', ['server']);
  api.add_files('smart-publish.js', ['server']);
});

Package.on_test(function (api) {
  api.use('mrt:smart-publish');
  api.use('tinytest');
  api.use('insecure');
  api.use('meteor-platform');

  api.add_files('tests/several-cursors.js', ['server', 'client']);
  api.add_files('tests/basic-joins.js', ['server', 'client']);
  api.add_files('tests/callbacks.js', ['server', 'client']);
});
