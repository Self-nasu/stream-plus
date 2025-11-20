const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
require('dotenv').config();
const { BlobServiceClient, StorageSharedKeyCredential } = require('@azure/storage-blob');
const streamToString = require('stream-to-string');

const { getVideoIDs, getVideoState, getVideoPath, getQualityVideoPath, getOrgPath } = require('./stream-helper/streamHelper');
const { getAPIKeyFromDB } = require('./helpers/apiKeyHelper');
const { encryptFilePath, decryptFilePath } = require('./stream-helper/cryptoUtils'); 
const { logStreamEvent } = require('./helpers/logHelper');

const app = express();
const PORT = process.env.STREAMPORT || 5500;

app.use(cors({ origin: "*" }));

// Azure Blob Storage client setup
const blobServiceClient = BlobServiceClient.fromConnectionString(
    `DefaultEndpointsProtocol=https;AccountName=${process.env.AZURE_STORAGE_ACCOUNT_NAME};AccountKey=${process.env.AZURE_STORAGE_ACCOUNT_KEY};EndpointSuffix=core.windows.net`
);
const containerClient = blobServiceClient.getContainerClient(process.env.AZURE_STORAGE_CONTAINER_NAME);

// Middleware to validate API Key
const apiKeyMiddleware = async (req, res, next) => {
    const apiKey = req.headers['api-key'];  

    if (!apiKey) {
        return res.status(403).send('API key is missing');
    }

    try {
        const validApiKey = await getAPIKeyFromDB(apiKey);
        if (!validApiKey) {
            return res.status(403).send('Invalid API key');
        }
        next();
    } catch (error) {
        console.error('Error validating API key:', error);
        res.status(500).send('Internal Server Error');
    }
};

// Apply API key validation middleware to all routes
app.use(apiKeyMiddleware);

app.get('/:project_id/GetVideoIDs', async (req, res) => {
    try {
        const { project_id } = req.params;
        const final = await getVideoIDs(project_id);
        res.json(final);
    } catch (err) {
        console.error('Error fetching VideoIDs:', err);
        res.status(500).json({
            success: false,
            message: 'Error fetching VideoIDs from the database',
        });
    }
});

// Serve video URL dynamically based on video ID
app.get('/videos/:videoID', async (req, res) => {
    const { videoID } = req.params;
    const userIP = req.ip;
    const userAgent = req.headers['user-agent'];

    try {
        // "pending", "processing", "completed", "failed"
        const videostate = await getVideoState(videoID);
        const masterBlobPath = await getVideoPath(videoID);
        
        if (videostate === true) {
            const encryptedPath = encryptFilePath(masterBlobPath);

            // Log the streaming request
            await logStreamEvent(videoID, videoID.split("_")[0], userIP, userAgent);

            res.send({ 
                videoURL: `stream/${encodeURIComponent(encryptedPath)}`,
                videostate: videostate
            });
        } else {
            const directpath = await getOrgPath(videoID);

            if (videostate === false) {
                res.send({ 
                    videostate: videostate,
                    directpath: `https://edulystblob.blob.core.windows.net/ev-soa/${directpath}`
                 });
            } else {
                res.status(404).send('Video not found');
            }
        }
    } catch (error) {
        res.status(500).send('Internal Server Error');
    }
});

// Serve specific quality video URL
app.get('/videos/:videoID/:quality', async (req, res) => {
    const { videoID, quality } = req.params;
    const userIP = req.ip;
    const userAgent = req.headers['user-agent'];

    try {
        const qualityBlobPath = await getQualityVideoPath(videoID, quality);

        if (qualityBlobPath) {
            const encryptedPath = encryptFilePath(qualityBlobPath);

            // Log the streaming request
            await logStreamEvent(videoID, videoID.split("_")[0], userIP, userAgent);

            res.send({ videoURL: `stream/${encodeURIComponent(encryptedPath)}` });
        } else {
            const videostate = await getVideoState(videoID);
            const directpath = await getOrgPath(videoID);

            if (videostate === false) {
                res.send({ 
                    videostate: "processing",
                    directpath: directpath
                 });
            } else {
                res.status(404).send('Quality video not found');
            }
        }
    } catch (error) {
        res.status(500).send('Internal Server Error');
    }
});

// Stream handler
app.get('/stream/:encryptedPath', async (req, res) => {
    const { encryptedPath } = req.params;
    const blobPath = decryptFilePath(decodeURIComponent(encryptedPath)); 
    const userIP = req.ip;
    const userAgent = req.headers['user-agent'];

    try {
        if (blobPath.endsWith('.m3u8')) {
            const blobClient = getBlobClient(blobPath);
            const exists = await blobClient.exists();

            if (exists) {
                const downloadResponse = await blobClient.download(0);
                const fileContent = await streamToString(downloadResponse.readableStreamBody);

                await logStreamEvent(blobPath.split('/')[2], blobPath.split('/')[0], userIP, userAgent);

                if (blobPath.includes('master.m3u8')) {
                    const basePath = path.dirname(blobPath);
                    const updatedContent = fileContent.replace(/(.*\.m3u8)/g, (relativePath) => {
                        const r_path = `${basePath}/${relativePath}`;
                        const encryptedr_path = encryptFilePath(r_path);
                        return `/stream/${encodeURIComponent(encryptedr_path)}`;
                    });

                    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
                    return res.send(updatedContent);
                }

                if (blobPath.includes('output.m3u8')) {
                    const basePath = path.dirname(blobPath);
                    const updatedContent = fileContent.replace(/(.*\.ts)/g, (segmentPath) => {
                        const r_path = `${basePath}/${segmentPath}`;
                        const encryptedr_path = encryptFilePath(r_path);
                        return `/stream/${encodeURIComponent(encryptedr_path)}`;
                    });

                    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
                    return res.send(updatedContent);
                }

                res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
                return res.send(fileContent);
            } else {
                return res.status(404).send('File not found');
            }
        }

        if (blobPath.endsWith('.ts')) {
            const blobClient = getBlobClient(blobPath);
            const exists = await blobClient.exists();

            if (exists) {
                const downloadResponse = await blobClient.download(0);

                if (downloadResponse.readableStreamBody) {
                    await logStreamEvent(blobPath.split('/')[2], blobPath.split('/')[0], userIP, userAgent);
                    res.setHeader('Content-Type', 'video/mp2t');
                    return downloadResponse.readableStreamBody.pipe(res);
                } else {
                    throw new Error('No stream body available for the blob');
                }
            } else {
                return res.status(404).send('File not found');
            }
        }

        res.status(400).send('Unsupported file type');
    } catch (error) {
        console.error('Error streaming file:', error.message);
        res.status(500).send('Internal Server Error');
    }
});

function getBlobClient(blobPath) {
    const accountName = process.env.AZURE_STORAGE_ACCOUNT_NAME;
    const accountKey = process.env.AZURE_STORAGE_ACCOUNT_KEY;
    const containerName = process.env.AZURE_STORAGE_CONTAINER_NAME;

    const sharedKeyCredential = new StorageSharedKeyCredential(accountName, accountKey);
    const blobServiceClient = new BlobServiceClient(
        `https://${accountName}.blob.core.windows.net`,
        sharedKeyCredential
    );

    const containerClient = blobServiceClient.getContainerClient(containerName);
    return containerClient.getBlobClient(blobPath);
}

// Start the server
app.listen(PORT, "0.0.0.0", () => {
    console.log(`Streaming service running on http://localhost:${PORT}`);
});
