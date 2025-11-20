const { Kafka } = require("kafkajs");
const fs = require("fs");
const path = require("path");
const { downloadFromBlob, convertToHLS, uploadFolderToBlob } = require("./videoProcessorUtils");
require("dotenv").config({ path: "../.env" });
const { updateProcessingStatus, markVideoAsConverted } = require('./../helpers/helper2');
const { spawn } = require('child_process');

const kafka = new Kafka({
  clientId: "video-processor-a",
  brokers: ["localhost:9092"],
  connectionTimeout: 3000,
  retry: { retries: 5 },
});

const consumer = kafka.consumer({ groupId: "video-processing-a", sessionTimeout: 1500000 });
const producer = kafka.producer();

const resolutions = [
  { name: "240p", width: 426, height: 240, bitrate: "300k" },
  { name: "360p", width: 640, height: 360, bitrate: "500K" },
  { name: "480p", width: 854, height: 480, bitrate: "700K" },
  { name: "720p", width: 1280, height: 720, bitrate: "900K" }
];

let workerstate = "free";
let currentFFmpegProcess = null; // global reference
let skipCurrentJob = false;

// 🔹 Function to skip current job
function skipCurrentVideoJob() {
  if (workerstate === "working") {
    console.log("⚡ Skip requested: current video will stop after current resolution");
    skipCurrentJob = true;
    if (currentFFmpegProcess) {
      currentFFmpegProcess.kill("SIGKILL");
      currentFFmpegProcess = null;
    }
  } else {
    console.log("No video currently processing");
  }
}

// 🔹 Function to send Kafka messages
async function sendMessage(topic, message) {
  try {
    await producer.send({ topic, messages: [{ key: message.videoID, value: JSON.stringify(message) }] });
    console.log(`📩 Sent message to Kafka: ${topic} - ${JSON.stringify(message)}`);
  } catch (error) {
    console.error("❌ Kafka Message Sending Failed:", error);
  }
}

// 🔹 Create master playlist
function createMasterPlaylist(outputDir, processedResolutions) {
  const masterPlaylistPath = path.join(outputDir, "master.m3u8");
  let playlistContent = "#EXTM3U\n";
  processedResolutions.forEach(res => {
    playlistContent += `#EXT-X-STREAM-INF:BANDWIDTH=${res.bitrate},RESOLUTION=${res.width}x${res.height}\n`;
    playlistContent += `${res.name}/output.m3u8\n`;
  });
  fs.writeFileSync(masterPlaylistPath, playlistContent);
  return masterPlaylistPath;
}

// 🔹 Video processing function


async function processVideo(videoID, projectID, filePath, msgResolutions, retryCount = 0) {
    workerstate = "working";
    skipCurrentJob = false; // reset for each new job

    const tempDir = path.join(__dirname, projectID, videoID, "temp-a");
    fs.mkdirSync(tempDir, { recursive: true });

    const localInputPath = path.join(tempDir, "input.mp4");
    await downloadFromBlob(filePath, localInputPath);

    let processedDirs = [];
    let failedResolutions = [];

    for (let res of resolutions.filter(r => msgResolutions.includes(r.name))) {
        if (skipCurrentJob) {
            console.log(`⏩ Skipping video ${videoID} as requested`);
            break;
        }

        const outputDir = path.join(tempDir, res.name);
        fs.mkdirSync(outputDir, { recursive: true });

        try {
            console.log(`🎞️ Converting ${res.name} to HLS`);
            await updateProcessingStatus(videoID, projectID, res.name, "processing");

            // Spawn FFmpeg and keep reference
            currentFFmpegProcess = spawn('ffmpeg', [
                '-i', localInputPath,
                '-c:v', 'libx264',
                '-c:a', 'aac',
                '-strict', 'experimental',
                path.join(outputDir, "output.m3u8")
            ]);

            await new Promise((resolve, reject) => {
                currentFFmpegProcess.on('close', (code) => {
                    currentFFmpegProcess = null; // clear reference
                    if (code === 0) resolve();
                    else reject(new Error(`FFmpeg failed with code ${code}`));
                });
                currentFFmpegProcess.on('error', reject);
            });

            await updateProcessingStatus(videoID, projectID, res.name, "completed");
            processedDirs.push(outputDir);
        } catch (error) {
            console.error(`❌ Failed ${res.name} for ${videoID}:`, error);
            await updateProcessingStatus(videoID, projectID, res.name, "failed");
            failedResolutions.push(res.name);
        }
    }

    // Cleanup
    workerstate = "free";
    currentFFmpegProcess = null;
    fs.rmSync(tempDir, { recursive: true, force: true });
    console.log(`🧹 Finished processing ${videoID}`);
}


// 🔹 Kafka Consumer
async function runConsumer() {
  try {
    await consumer.connect();
    await producer.connect();
    await consumer.subscribe({ topics: ["video-processing-a", "video-retry"], fromBeginning: false });

    let lastJobTime = Date.now();

    await consumer.run({
      eachMessage: async ({ topic, partition, message, heartbeat }) => {
        lastJobTime = Date.now();
        const rawMessage = message.value.toString();
        console.log(`📩 Received Kafka Message: ${rawMessage}`);

        try {
          let { videoID, projectID, filePath, resolution, from, retryCount = 0 } = JSON.parse(rawMessage);
          if (!videoID || !projectID || !filePath || !resolution) return;

          if (!Array.isArray(resolution)) resolution = [resolution];

          if (["video-processing-a", "video-retry"].includes(from) && resolution.every(res => ["240p", "360p", "480p", "720p"].includes(res))) {
            await processVideo(videoID, projectID, filePath, resolution, retryCount);
          } else {
            console.log(`🚫 Skipping message from ${from} with resolution: ${resolution}`);
          }

          // Commit offset regardless to skip or complete
          await consumer.commitOffsets([{ topic, partition, offset: (Number(message.offset) + 1).toString() }]);
          console.log(`✅ Committed offset for ${topic} - Partition: ${partition}, Offset: ${message.offset}`);
          await heartbeat();
        } catch (error) {
          console.error("❌ Error processing message:", error);
        }
      }
    });

    // Idle check for video-retry topic
    // setInterval(async () => {
    //   if (Date.now() - lastJobTime >= 180000 && workerstate === "free") {
    //     console.log("💤 Idle for 3 mins, resuming video-retry...");
    //     await consumer.resume([{ topic: "video-retry" }]);
    //   } else {
    //     await consumer.pause([{ topic: "video-retry" }]);
    //   }
    // }, 60000);

    console.log("🎥 Consumer is running...");
  } catch (error) {
    console.error("❌ Consumer failed to start:", error);
    setTimeout(runConsumer, 5000);
  }
}

// 🔹 Graceful Shutdown
process.on("SIGINT", async () => {
  console.log("\n🛑 Shutting down gracefully...");
  await consumer.disconnect();
  await producer.disconnect();
  console.log("✅ Kafka connections closed.");
  process.exit(0);
});

process.on("uncaughtException", (error) => {
  console.error("🚨 Uncaught Exception:", error);
  process.exit(1);
});

// Export skip function
module.exports = { skipCurrentVideoJob };

runConsumer().catch(console.error);
