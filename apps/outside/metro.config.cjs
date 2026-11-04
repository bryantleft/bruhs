const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
const blockList = config.resolver.blockList;

// Generated QA files must not invalidate an active server-rendered page.
config.resolver.blockList = [
  ...(Array.isArray(blockList) ? blockList : blockList ? [blockList] : []),
  /[/\\]\.playwright-mcp(?:[/\\]|$)/,
  /[/\\]\.convex(?:[/\\]|$)/,
];

module.exports = config;
