const { MongoClient } = require('mongodb');
require('dotenv').config({ path: "../.env" });

const client = new MongoClient(process.env.MONGO_URI);
const db = client.db('mediastream');
const videosCollection = db.collection('videos');
const projectsCollection = db.collection('projects');

/**
 * Generate a unique videoID based on the last video count for a project.
 */
async function generateVideoID(projectID) {
    await client.connect();

    const project = await projectsCollection.findOne({ projectID });
    let videoCount = project ? project.lastVideoCount : 0;

    const videoID = `${projectID}_${videoCount + 1}`;

    await projectsCollection.updateOne(
        { projectID },
        { $set: { lastVideoCount: videoCount + 1 } },
        { upsert: true }
    );

    return videoID;
}

/**
 * Insert initial entry for video metadata.
 */
async function insertInitialEntry(videoID, fileName, filePath, fileSize, projectID) {
    await client.connect();

    const videoData = {
        videoID,
        projectID,
        fileName,
        filePath,
        masterFilePath: filePath.replace('/org/', '/converted/').replace(fileName, 'master.m3u8'),
        fileSize,
        converted: false,
        uploadTime: new Date(),
        resolutions: ["240p", "360p", "480p", "720p", "1080p"],
        processingStatus: {
            "240p": "pending",
            "360p": "pending",
            "480p": "pending",
            "720p": "pending",
            "1080p": "pending"
        }
    };

    await videosCollection.insertOne(videoData);
}

/**
 * Get the original file path of a video based on videoID and projectID.
 */
async function getOrgPath(videoID, projectID) {
    try {
        await client.connect();
        const video = await videosCollection.findOne({ videoID, projectID }, { projection: { filePath: 1, _id: 0 } });

        if (!video) {
            console.log(`No video found with videoID: ${videoID} and projectID: ${projectID}`);
            return null;
        }

        return video.filePath;
    } catch (error) {
        console.error('Error fetching video data:', error);
        return null;
    }
}


module.exports = {
    generateVideoID,
    insertInitialEntry,
    getOrgPath
};
