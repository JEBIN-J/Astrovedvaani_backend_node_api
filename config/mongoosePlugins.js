const mongoosePaginate = require('mongoose-paginate-v2');

module.exports = function applyGlobalPlugins(connection) {
  // Apply to all future schemas
  connection.plugin((schema) => {
    schema.plugin(mongoosePaginate);
  });
  
  // Apply to already compiled models
  Object.values(connection.models).forEach(model => {
    if (!model.schema.plugins.some(p => p.fn === mongoosePaginate)) {
      model.schema.plugin(mongoosePaginate);
    }
  });
  
  // Force recompilation of models
  Object.keys(connection.models).forEach(modelName => {
    connection.model(modelName, connection.models[modelName].schema);
  });
};