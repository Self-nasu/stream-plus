// src/config/configuration.ts
export default () => ({
  port: parseInt(process.env.PORT || '3000', 10),
  mongoUri: process.env.MONGO_URI || 'mongodb://localhost:27017/media',
  mongoPoolSize: parseInt(process.env.MONGO_POOL_SIZE || '10', 10),
});
