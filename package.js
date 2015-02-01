Package.describe({
  summary: "Smart publications with joins and multiple cursors from the same collection",
  version: "0.1.8",
  git: "https://github.com/yeputons/meteor-smart-publish.git",
  name: "mrt:smart-publish"
});

Package.onUse(function (api, where) {
  api.addFiles('utils.js', ['server']);
  api.addFiles('collection-items.js', ['server']);
  api.addFiles('wrappers.js', ['server']);
  api.addFiles('smart-publish.js', ['server']);
});

Package.onTest(function (api) {
  api.use('mrt:smart-publish');
  api.use('tinytest');
  api.use('insecure');
  api.use('meteor-platform');

  api.addFiles('tests/several-cursors.js', ['server', 'client']);
  api.addFiles('tests/basic-joins.js', ['server', 'client']);
  api.addFiles('tests/callbacks.js', ['server', 'client']);
});
