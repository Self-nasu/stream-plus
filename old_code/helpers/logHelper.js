const { MongoClient } = require('mongodb');
require('dotenv').config({ path: "../.env" });

const client = new MongoClient(process.env.MONGO_URI);
const db = client.db('mediastream');
const uploadLogsCollection = db.collection('upload_logs');
const streamLogsCollection = db.collection('stream_logs');

/**
 * Logs video upload or processing events.
 * @param {string} videoID - The ID of the video.
 * @param {string} projectID - The ID of the project.
 * @param {string} logType - Type of log ("upload", "processing", "error").
 * @param {string} message - Log message.
 * @param {object} [details] - Additional details (optional).
 */
async function logUploadEvent(videoID, projectID, logType, message, details = {}) {
    await client.connect();

    const logEntry = {
        videoID,
        projectID,
        logType, // "upload", "processing", "error"
        message,
        details,
        createdAt: new Date()
    };

    await uploadLogsCollection.insertOne(logEntry);
}

/**
 * Logs video streaming events.
 * @param {string} videoID - The ID of the video.
 * @param {string} projectID - The ID of the project.
 * @param {string} userIP - The IP address of the user.
 * @param {string} userAgent - The user agent string.
 */
async function logStreamEvent(videoID, projectID, userIP, userAgent) {
    await client.connect();

    const logEntry = {
        videoID,
        projectID,
        userIP,
        userAgent,
        timestamp: new Date()
    };

    await streamLogsCollection.insertOne(logEntry);
}

module.exports = {
    logUploadEvent,
    logStreamEvent
};
