const { Kafka } = require("kafkajs");
const fs = require("fs");
const path = require("path");
const { downloadFromBlob, convertToHLS, uploadFolderToBlob } = require("./videoProcessorUtils"); // Import shared functions
require("dotenv").config({ path: "../.env" });
const { updateProcessingStatus, markVideoAsConverted } = require('./../helpers/helper2');

const kafka = new Kafka({ 
  clientId: "video-processor-b", 
  brokers: ["localhost:9092"], 
  retry: { retries: 5 }, // Auto-retry Kafka connection failures
});

const consumer = kafka.consumer({ 
  groupId: "video-processing-b",
  sessionTimeout: 1500000, // Increased session timeout
});
const producer = kafka.producer();

const resolutions = [
  { name: "720p", width: 1280, height: 720, bitrate: "2500000" },
  // { name: "1080p", width: 1920, height: 1080, bitrate: "5000000" }
];

async function sendMessage(topic, message) {
  try {
    await producer.send({ topic, messages: [{ key: message.videoID, value: JSON.stringify(message) }] });
    console.log(`📩 Sent message to Kafka topic: ${topic} - ${JSON.stringify(message)}`);
  } catch (error) {
    console.error("❌ Error sending Kafka message:", error);
  }
}

// 🔹 Function to update `master.m3u8`
function updateMasterPlaylist(masterPlaylistPath, newResolutions) {
  let playlistContent = fs.existsSync(masterPlaylistPath) ? fs.readFileSync(masterPlaylistPath, "utf8") : "#EXTM3U\n";
  const existingResolutions = new Set();

  playlistContent.split("\n").forEach(line => {
    const match = line.match(/RESOLUTION=(\d+x\d+)/);
    if (match) existingResolutions.add(match[1]);
  });

  newResolutions.forEach(res => {
    const resKey = `${res.width}x${res.height}`;
    if (!existingResolutions.has(resKey)) {
      playlistContent += `#EXT-X-STREAM-INF:BANDWIDTH=${res.bitrate},RESOLUTION=${resKey}\n${res.name}/output.m3u8\n`;
    }
  });

  fs.writeFileSync(masterPlaylistPath, playlistContent.trim() + "\n");
  return masterPlaylistPath;
}
let workerstate = "free";

// 🔹 Function to process video
async function processVideo(videoID, projectID, filePath, msgResolutions, heartbeat, retryCount = 0) {
  console.log(`🎬 Processing Video: ${videoID}, Path: ${filePath}, Resolutions: ${msgResolutions}`);
  workerstate = "working";
  const tempDir = path.join(__dirname, projectID, videoID, "temp-b");
  fs.mkdirSync(tempDir, { recursive: true });

  const masterPlaylistPath = path.join(tempDir, "master.m3u8");
  await downloadFromBlob(`${projectID}/converted/${videoID}/master.m3u8`, masterPlaylistPath);
  const localInputPath = path.join(tempDir, "input.mp4");
  await downloadFromBlob(filePath, localInputPath);

  let processedDirs = [];
  let failedResolutions = [];
  let resolutionsToProcess = resolutions.filter(r => msgResolutions.includes(r.name));

  for (let res of resolutionsToProcess) {
    const outputDir = path.join(tempDir, res.name);
    fs.mkdirSync(outputDir, { recursive: true });

    try {
      workerstate = "free";
      console.log(`🎞️ Converting ${res.name} to HLS`);
      await updateProcessingStatus(videoID, projectID, res.name, "processing");
      await convertToHLS(localInputPath, res, path.join(outputDir, "segment%03d.ts"), path.join(outputDir, "output.m3u8"));
      await updateProcessingStatus(videoID, projectID, res.name, "completed");
      // await consumer.heartbeat();
      processedDirs.push(outputDir);
    } catch (error) {
      console.error(`❌ Failed to process ${res.name} for ${videoID}:`, error);
      await updateProcessingStatus(videoID, projectID, res.name, "failed");
      failedResolutions.push(res.name);
    }

    await heartbeat(); // Keep Kafka session alive during long processing
  }

  if (failedResolutions.length > 0) {
    console.log(`🔁 Sending job to video-retry due to failures: ${failedResolutions}`);
    if (retryCount >= 3) {
      console.log(`🚨 Retry limit exceeded for ${videoID}. Discarding job.`);
    } else {
      await sendMessage("video-retry", { videoID, projectID, filePath, resolution: msgResolutions, from: "video-processing-b", retryCount: retryCount + 1 });
    }
    return;
  }

  updateMasterPlaylist(masterPlaylistPath, resolutionsToProcess);
  fs.unlinkSync(localInputPath);

  console.log(`📤 Uploading processed files for ${videoID}`);
  await uploadFolderToBlob(tempDir, `${projectID}/converted/${videoID}`);
  await markVideoAsConverted(videoID, projectID);
  fs.rmSync(tempDir, { recursive: true, force: true });
  console.log(`✅ Processed and cleaned up ${videoID}`);
  workerstate = "free";
}

// 🔹 Kafka Consumer for `video-processing-b`
async function runConsumer() {
  await consumer.connect();
  await producer.connect();
  await consumer.subscribe({ topics: ["video-processing-b", "video-retry"], fromBeginning: false });

  let lastJobTime = Date.now();

  await consumer.run({
    eachMessage: async ({ topic, partition, message, heartbeat }) => {
      lastJobTime = Date.now();
      const rawMessage = message.value.toString();
      console.log(`📩 Received Kafka Message: ${rawMessage}`);

      let { videoID, projectID, filePath, resolution, from, retryCount = 0 } = JSON.parse(rawMessage);
      if (!videoID || !projectID || !filePath || !resolution) {
        console.error("🚨 Invalid Kafka message, missing required fields.");
        return;
      }
      if (!Array.isArray(resolution)) resolution = [resolution];

      try {
        if (from === "video-processing-a" && resolution.every(res => ["720p", "1080p"].includes(res))) {
          await processVideo(videoID, projectID, filePath, resolution, heartbeat, retryCount);
        } else if (from === "video-retry" && resolution.every(res => ["720p", "1080p"].includes(res))) {
          await processVideo(videoID, projectID, filePath, resolution, heartbeat, retryCount);
        } else {
          console.log(`🚫 Skipping message from ${from} with resolution: ${resolution}`);
        }

        await consumer.commitOffsets([{ topic, partition, offset: (Number(message.offset) + 1).toString() }]);
        console.log(`✅ Committed offset for ${topic} - Partition: ${partition}, Offset: ${message.offset}`);
        await heartbeat();
      } catch (error) {
        console.error("❌ Error processing message:", error);
      }
    },
  });

  setInterval(async () => {
    if (Date.now() - lastJobTime >= 180000 && workerstate == "free") {
      console.log("💤 Idle for 3 mins, resuming video-retry...");
      await consumer.resume([{ topic: "video-retry" }]);
    } else {
      await consumer.pause([{ topic: "video-retry" }]);
    }
  }, 60000);

  console.log("🎥 Consumer is running...");
}

// Handle graceful shutdown
async function shutdown() {
  console.log("\n🛑 Gracefully shutting down...");
  await consumer.disconnect();
  await producer.disconnect();
  console.log("✅ Kafka consumer and producer disconnected.");
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

runConsumer().catch(console.error);
