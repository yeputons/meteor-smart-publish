Package.describe({
  summary: "Smart publications with joins and multiple cursors from the same collection"
});

Package.on_use(function (api, where) {
  api.add_files('smart-publish.js', ['server']);
});

/*Package.on_test(function (api) {
  api.use('smart-publish');

  api.add_files('smart-publish_tests.js', ['server']);
});
*/
