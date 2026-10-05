module.exports = function (api) {
  api.cache(true);
  return {
    presets: [['babel-preset-expo', { jsxImportSource: 'nativewind' }], 'nativewind/babel'],
    // Drizzle migrations (drizzle/*.sql) are inlined as strings into the bundle.
    plugins: [['inline-import', { extensions: ['.sql'] }]],
  };
};
