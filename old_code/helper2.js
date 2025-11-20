const { MongoClient } = require('mongodb');
require('dotenv').config({ path: "../.env" });

const client = new MongoClient(process.env.MONGO_URI);
const db = client.db('mediastream');

// Collections
const videosCollection = db.collection('videos');
const videoQueueCollection = db.collection('videoQueue');

/**
 * Updates the processing status of a video for a specific resolution.
 */
async function updateProcessingStatus(videoID, projectID, resolution, status) {
    await client.connect();

    await videosCollection.updateOne(
        { videoID, projectID },
        { $set: { [`processingStatus.${resolution}`]: status } }
    );
}

/**
 * Marks the video as fully converted when all resolutions are completed.
 */
async function markVideoAsConverted(videoID, projectID) {
    await client.connect();

    await videosCollection.updateOne(
        { videoID, projectID },
        { $set: { converted: true } }
    );
}

module.exports = {
    client,
    videosCollection,
    videoQueueCollection,
    updateProcessingStatus,
    markVideoAsConverted
};
