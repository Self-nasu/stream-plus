const { MongoClient } = require('mongodb');
require('dotenv').config({ path: "../.env" });

const client = new MongoClient(process.env.MONGO_URI);
const db = client.db('mediastream');
const videosCollection = db.collection('videos');

/**
 * Fetches the master file path of a video.
 * @param {string} videoID - The ID of the video.
 * @returns {Promise<string>} - The master file path.
 */
async function getVideoPath(videoID) {
    await client.connect();

    const video = await videosCollection.findOne(
        { videoID },
        { projection: { masterFilePath: 1, _id: 0 } }
    );

    if (!video) throw new Error(`No video found with VideoID: ${videoID}`);
    return video.masterFilePath;
}

/**
 * Fetches the processing state of a video.
 * @param {string} videoID - The ID of the video.
 * @returns {Promise<boolean>} - True if converted, false otherwise.
 */
async function getVideoState(videoID) {
    await client.connect();

    const video = await videosCollection.findOne(
        { videoID },
        { projection: { converted: 1, _id: 0 } }
    );

    if (!video) throw new Error(`No video found with VideoID: ${videoID}`);
    return video.converted;
}

/**
 * Fetches the HLS playlist path for a specific video resolution.
 * @param {string} videoID - The ID of the video.
 * @param {string} quality - The resolution (e.g., "240p").
 * @returns {Promise<string>} - The HLS playlist file path.
 */
async function getQualityVideoPath(videoID, quality) {
    const masterFilePath = await getVideoPath(videoID);
    if (!masterFilePath) throw new Error(`MasterFilePath not found for VideoID: ${videoID}`);

    const qualityDir = masterFilePath.replace('/converted/', `/converted/${quality}/`);
    return `${qualityDir}/output.m3u8`;
}

/**
 * Fetches all video IDs for a given project.
 * @param {string} projectID - The ID of the project.
 * @returns {Promise<object[]>} - List of video details.
 */
async function getVideoIDs(projectID) {
    await client.connect();

    const videos = await videosCollection
        .find({ projectID })
        .project({ videoID: 1, fileName: 1, converted: 1, _id: 0 })
        .toArray();

    return { data: videos };
}

async function getOrgPath(videoID) {
    try {
        await client.connect();
        const video = await videosCollection.findOne({ videoID}, { projection: { filePath: 1, _id: 0 } });

        if (!video) {
            console.log(`No video found with videoID: ${videoID}.`);
            return null;
        }

        return video.filePath;
    } catch (error) {
        console.error('Error fetching video data:', error);
        return null;
    }
}

module.exports = {
    getVideoPath,
    getVideoState,
    getQualityVideoPath,
    getVideoIDs,
    getOrgPath
};
