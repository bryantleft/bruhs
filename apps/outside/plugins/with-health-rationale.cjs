const { withMainActivity } = require('expo/config-plugins');

// Health Connect's privacy-policy actions have no URL. Map only those actions
// to our explanation screen before React Native resolves its initial deep link.
module.exports = function withHealthRationale(config) {
  return withMainActivity(config, (mod) => {
    if (mod.modResults.language !== 'kt') throw new Error('Health permission routing requires the Expo Kotlin MainActivity template.');
    let contents = mod.modResults.contents;
    if (contents.includes('private fun routeHealthPermissions')) return mod;
    const create = 'override fun onCreate(savedInstanceState: Bundle?) {';
    if (!contents.includes(create)) throw new Error('Expo MainActivity.onCreate changed. Update with-health-rationale.cjs before building.');
    contents = contents.replace(create, `${create}\n    routeHealthPermissions(intent)`);
    if (contents.includes('override fun onNewIntent')) {
      const intentMethod = /override fun onNewIntent\(intent: (?:android\.content\.)?Intent\) \{/;
      if (!intentMethod.test(contents)) throw new Error('Expo MainActivity.onNewIntent changed. Update health permission routing before building.');
      contents = contents.replace(intentMethod, '$&\n    routeHealthPermissions(intent)');
    } else {
      contents = contents.replace(create, `override fun onNewIntent(intent: android.content.Intent) {\n    routeHealthPermissions(intent)\n    super.onNewIntent(intent)\n  }\n\n  ${create}`);
    }
    const helper = `private fun routeHealthPermissions(request: android.content.Intent?) {
    val healthIntent = request ?: return
    if (healthIntent.action == "androidx.health.ACTION_SHOW_PERMISSIONS_RATIONALE" ||
        healthIntent.action == "android.intent.action.VIEW_PERMISSION_USAGE") {
      healthIntent.action = android.content.Intent.ACTION_VIEW
      healthIntent.data = android.net.Uri.parse("bruhs-outside://health")
    }
  }

  `;
    contents = contents.replace('override fun onNewIntent', `${helper}override fun onNewIntent`);
    mod.modResults.contents = contents;
    return mod;
  });
};
