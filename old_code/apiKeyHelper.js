const { MongoClient } = require('mongodb');
require('dotenv').config({ path: "../.env" });

const client = new MongoClient(process.env.MONGO_URI);
const db = client.db('mediastream');
const apiKeysCollection = db.collection('api_keys');

/**
 * Check if API key is valid.
 */
async function getAPIKeyFromDB(apiKey) {
    await client.connect();

    const keyRecord = await apiKeysCollection.findOne({ apiKey, isActive: true });

    return !!keyRecord;
}

module.exports = { getAPIKeyFromDB };
