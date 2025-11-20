const express = require('express');
const multer = require('multer');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const { BlobServiceClient } = require('@azure/storage-blob');
require('dotenv').config();
// const { statusMonitor } = ('express-status-monitor');
const axios = require('axios');


// Import helper functions
const { generateVideoID, insertInitialEntry, getOrgPath } = require('./helpers/videoHelper');
const { getAPIKeyFromDB } = require('./helpers/apiKeyHelper');
const { videosCollection, videoQueueCollection } = require('./helpers/helper2');
const { sendMessage } = require('./kafka/producer');
const { logUploadEvent } = require('./helpers/logHelper');
const { skipCurrentVideoJob } = require('./Serv-Kafka/video-processing-a');
const app = express();
const PORT = process.env.PORT || 5000;


// Azure Blob Storage setup
const blobServiceClient = BlobServiceClient.fromConnectionString(
    `DefaultEndpointsProtocol=https;AccountName=${process.env.AZURE_STORAGE_ACCOUNT_NAME};AccountKey=${process.env.AZURE_STORAGE_ACCOUNT_KEY};EndpointSuffix=core.windows.net`
);
const containerClient = blobServiceClient.getContainerClient(process.env.AZURE_STORAGE_CONTAINER_NAME);

app.use(cors({ origin: "*" }));
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// app.use(statusMonitor());

// Middleware to validate API Key
const apiKeyMiddleware = async (req, res, next) => {
    const apiKey = req.headers['api-key'];
    if (!apiKey) return res.status(403).send('API key is missing');

    try {
        const validApiKey = await getAPIKeyFromDB(apiKey);
        if (!validApiKey) return res.status(403).send('Invalid API key');
        next();
    } catch (error) {
        console.error("❌ Error validating API key:", error);
        res.status(500).send('Internal Server Error');
    }
};

// Validate Project ID Format
const isValidProjectID = (projectID) => /^EVSOA\d{4}$/.test(projectID);

// Multer configuration
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const tempPath = path.join(__dirname, 'temp');
        if (!fs.existsSync(tempPath)) fs.mkdirSync(tempPath, { recursive: true });
        cb(null, tempPath);
    },
    filename: (req, file, cb) => cb(null, file.originalname)
});

const upload = multer({ storage });

// Upload API
app.post('/:projectID/upload', apiKeyMiddleware, upload.single('video'), async (req, res) => {
    const { projectID } = req.params;
    if (!isValidProjectID(projectID)) return res.status(400).send('Invalid Project ID format.');

    const file = req.file;
    if (!file) return res.status(400).send('No file uploaded.');

    let inputPath, outputPath, finalFilePath;
    try {
        const videoID = await generateVideoID(projectID);
        inputPath = file.path;
        outputPath = path.join(__dirname, 'temp', `${videoID}.mp4`);
        const isMP4 = file.mimetype === 'video/mp4';

        console.log(`📤 Uploading file: ${file.originalname} (Video ID: ${videoID})`);

        // Convert video to MP4 if necessary
        if (!isMP4) {
            await convertToMP4(inputPath, outputPath);
            console.log(`🎥 Converted ${file.originalname} to MP4`);
        }

        finalFilePath = isMP4 ? inputPath : outputPath;
        const blobPath = `${projectID}/org/${videoID}/${videoID}.mp4`;
        await uploadToBlob(finalFilePath, blobPath);

        // Insert metadata in DB
        await insertInitialEntry(videoID, file.originalname, blobPath, file.size, projectID);

        // Log Upload Event
        await logUploadEvent(videoID, projectID, "upload", `video uploaded with video id : ${videoID}`);

        // Send message to Kafka for processing
        await sendMessage(videoID, projectID, blobPath);

        res.status(200).send({
            message: 'File uploaded successfully.',
            videoID,
            blobPath: `https://${process.env.AZURE_STORAGE_ACCOUNT_NAME}.blob.core.windows.net/${process.env.AZURE_STORAGE_CONTAINER_NAME}/${blobPath}`
        });

    } catch (error) {
        console.error("❌ Error uploading video:", error);
        await logUploadEvent(videoID, projectID, "error", `error video uploaded with video id : ${videoID}`);
        res.status(500).send('Internal Server Error');
    } finally {
        // Cleanup temp files
        try {
            if (inputPath && fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
            if (outputPath && fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
        } catch (cleanupError) {
            console.error("❌ Error during cleanup:", cleanupError);
        }
    }
});

async function processVideoFromUrl(videoID, projectID, videoUrl) {
    let inputPath, outputPath, finalFilePath;

    try {
        // temp paths
        const fileName = `${videoID}.mp4`;
        const tempDir = path.join(__dirname, 'temp');
        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

        inputPath = path.join(tempDir, fileName);
        outputPath = path.join(tempDir, `${videoID}.mp4`);

        // download
        console.log(`🌐 Downloading ${videoUrl}`);
        const response = await axios({ method: 'GET', url: videoUrl, responseType: 'stream', timeout: 6000000 });
        const writer = fs.createWriteStream(inputPath);
        response.data.pipe(writer);
        await new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
        });

        // convert if needed
        const isMP4 = response.headers['content-type'] === 'video/mp4';
        finalFilePath = isMP4 ? inputPath : outputPath;
        if (!isMP4) await convertToMP4(inputPath, outputPath);

        // upload to blob
        const blobPath = `${projectID}/org/${videoID}/${fileName}`;
        await uploadToBlob(finalFilePath, blobPath);

        // update videos collection
        const fileSize = fs.statSync(finalFilePath).size;
        await videosCollection.updateOne(
            { videoID, projectID },
            {
                $set: {
                    filePath: blobPath,
                    masterFilePath: blobPath.replace('/org/', '/converted/').replace(fileName, 'master.m3u8'),
                    fileSize,
                    converted: false,
                    resolutions: ["240p", "360p", "480p", "720p", "1080p"],
                    processingStatus: {
                        "240p": "pending",
                        "360p": "pending",
                        "480p": "pending",
                        "720p": "pending",
                        "1080p": "pending"
                    },
                    status: "uploaded"
                }
            }
        );

        // send kafka job
        await sendMessage(videoID, projectID, blobPath);

        // remove from queue
        await videoQueueCollection.deleteOne({ videoID, projectID });

        console.log(`✅ Video ${videoID} processed successfully`);

    } catch (err) {
        console.error(`❌ Error processing video ${videoID}:`, err);
        await videosCollection.updateOne(
            { videoID, projectID },
            { $set: { status: "error" } }
        );
    } finally {
        // cleanup
        try {
            if (inputPath && fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
            if (outputPath && fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
        } catch (cleanupErr) {
            console.error("Cleanup error:", cleanupErr);
        }
    }
}


app.post('/:projectID/upload-url', apiKeyMiddleware, async (req, res) => {
    const { projectID } = req.params;
    const { videoUrl } = req.body;

    if (!isValidProjectID(projectID)) return res.status(400).send('Invalid Project ID format.');
    if (!videoUrl) return res.status(400).send('videoUrl is required.');

    try {
        const videoID = await generateVideoID(projectID);

        // 1. Insert into queue collection
        await videoQueueCollection.insertOne({
            videoID,
            projectID,
            videoUrl,
            status: "queued",
            queuedAt: new Date()
        });

        // 2. Insert skeleton into main collection
        await videosCollection.insertOne({
            videoID,
            projectID,
            fileName: `${videoID}.mp4`,
            videoUrl,
            status: "queued",
            uploadTime: new Date()
        });

        // 3. Respond immediately
        res.status(200).send({
            message: "Video queued for upload",
            videoID,
            status: "queued"
        });

        // 4. Trigger async processing
        processVideoFromUrl(videoID, projectID, videoUrl);

    } catch (error) {
        console.error("❌ Error queuing video:", error);
        res.status(500).send('Internal Server Error');
    }
});



app.post('/reprocess/:projectID/:videoID', apiKeyMiddleware, async (req, res) => {
    try {
        const { projectID, videoID } = req.params;
        const blobPath = await getOrgPath(videoID, projectID);
        if (!blobPath) {
            return res.status(404).send({
                message: 'Original video path not found',
            });
        }

        await sendMessage(videoID, projectID, blobPath);
        await logUploadEvent(videoID, projectID, "reprocess", `video uploaded with video id : ${videoID}`);

        res.status(200).send({
            message: 'added to Reprocessing',
        });
    } catch (error) {
        console.error('Error during reprocessing:', error);
        res.status(500).send({
            message: 'Error during reprocessing. Please try again.',
        });
    }
});


app.post('/skip-current-job', apiKeyMiddleware, async (req, res) => {
    skipCurrentVideoJob();
    res.status(200).send({ message: "Skip signal sent. Current video job will stop." });
});



// Convert video to MP4
function convertToMP4(inputPath, outputPath) {
    return new Promise((resolve, reject) => {
        const ffmpeg = spawn('ffmpeg', [
            '-i', inputPath,
            '-c:v', 'libx264',
            '-c:a', 'aac',
            '-strict', 'experimental',
            outputPath
        ]);

        ffmpeg.on('close', (code) => {
            if (code === 0) resolve();
            else reject(new Error(`FFmpeg conversion failed with code ${code}`));
        });

        ffmpeg.on('error', (err) => reject(err));
    });
}

// Upload to Azure Blob Storage
async function uploadToBlob(filePath, blobName) {
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);
    const fileStream = fs.createReadStream(filePath);
    await blockBlobClient.uploadStream(fileStream);
}

// Start Server
app.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
});


