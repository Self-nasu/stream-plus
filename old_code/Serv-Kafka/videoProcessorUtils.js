const { BlobServiceClient } = require("@azure/storage-blob");
const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");
require("dotenv").config({ path: "../.env" });

// 🔹 Azure Blob Storage Setup
const blobServiceClient = BlobServiceClient.fromConnectionString(
  `DefaultEndpointsProtocol=https;AccountName=${process.env.AZURE_STORAGE_ACCOUNT_NAME};AccountKey=${process.env.AZURE_STORAGE_ACCOUNT_KEY};EndpointSuffix=core.windows.net`
);
const containerClient = blobServiceClient.getContainerClient(process.env.AZURE_STORAGE_CONTAINER_NAME);

/**
 * 🔹 Download a file from Azure Blob Storage
 */
async function downloadFromBlob(blobPath, localPath) {
  try {
    console.log(`📥 Downloading: ${blobPath} → ${localPath}`);
    const blockBlobClient = containerClient.getBlockBlobClient(blobPath);
    await blockBlobClient.downloadToFile(localPath);
    console.log("✅ Download complete");
  } catch (error) {
    console.error("❌ ERROR downloading from blob:", error);
    throw error;
  }
}

/**
 * 🔹 Convert video to HLS using FFmpeg
 */
const { spawn } = require("child_process");

function convertToHLS(inputFile, resolution, segmentPath, outputM3U8) {
  return new Promise((resolve, reject) => {
    const ffmpegArgs = [
      "-i", inputFile,
      "-vf", `scale=${resolution.width}:${resolution.height}`,
      "-c:v", "h264",
      "-b:v", resolution.bitrate,
      "-hls_time", "10",
      "-hls_playlist_type", "vod",
      "-hls_segment_filename", segmentPath,
      outputM3U8
    ];

    console.log(`🎞️ Running FFmpeg: ffmpeg ${ffmpegArgs.join(" ")}`);

    const ffmpegProcess = spawn("ffmpeg", ffmpegArgs);

    // Timeout: Kill FFmpeg if it takes more than 10 minutes
    const timeout = setTimeout(() => {
      console.error(`⏳ FFmpeg processing timeout for ${resolution.name}`);
      ffmpegProcess.kill("SIGKILL"); // Force kill FFmpeg
      reject(new Error("Processing Timeout"));
    }, 25 * 60 * 1000);

    ffmpegProcess.stdout.on("data", (data) => console.log(`FFmpeg: ${data}`));
    ffmpegProcess.stderr.on("data", (data) => console.error(`FFmpeg Error: ${data}`));

    ffmpegProcess.on("exit", (code) => {
      clearTimeout(timeout); // Prevent timeout from firing if process exits
      if (code === 0) {
        console.log(`✅ FFmpeg complete`);
        resolve();
      } else {
        reject(new Error(`FFmpeg process failed with exit code ${code}`));
      }
    });
  });
}


/**
 * 🔹 Upload a folder to Azure Blob Storage
 */
async function uploadFolderToBlob(folderPath, destinationBlobPath) {
  try {
    console.log(`📤 Uploading folder: ${folderPath} → ${destinationBlobPath}`);
    
    const files = fs.readdirSync(folderPath, { withFileTypes: true });
    for (const file of files) {
      const filePath = path.join(folderPath, file.name);
      const blobFilePath = `${destinationBlobPath}/${file.name}`;

      if (file.isDirectory()) {
        // 🔹 Recursively upload subdirectories
        await uploadFolderToBlob(filePath, blobFilePath);
      } else {
        // 🔹 Upload file
        const blockBlobClient = containerClient.getBlockBlobClient(blobFilePath);
        await blockBlobClient.uploadFile(filePath);
        console.log(`✅ Uploaded: ${blobFilePath}`);
      }
    }
    console.log("✅ Folder upload complete");
  } catch (error) {
    console.error("❌ ERROR uploading folder:", error);
    throw error;
  }
}

/**
 * 🔹 Upload a single file to Azure Blob Storage
 */
async function uploadToBlob(localFilePath, destinationBlobPath) {
  try {
    console.log(`📤 Uploading file: ${localFilePath} → ${destinationBlobPath}`);
    
    const blockBlobClient = containerClient.getBlockBlobClient(destinationBlobPath);
    await blockBlobClient.uploadFile(localFilePath);
    console.log(`✅ Uploaded: ${localFilePath}`);
  } catch (error) {
    console.error("❌ ERROR uploading file:", error);
    throw error;
  }
}



module.exports = {
  downloadFromBlob,
  convertToHLS,
  uploadFolderToBlob,
  uploadToBlob,
};
