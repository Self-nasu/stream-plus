const { Kafka } = require("kafkajs");

const kafka = new Kafka({
  clientId: "upload-service",
  brokers: ["localhost:9092"], // Kafka broker
});

const producer = kafka.producer();

// 🔹 Function to send video processing message to Kafka
const sendMessage = async (videoID, projectID, filePath, resolution = ["240p","360p","480p", "720p"], from = "video-processing-a") => {
  try {
    await producer.connect();
    
    console.log(`📩 Sending Kafka message: ${JSON.stringify({ videoID, projectID, filePath, resolution })}`);

    await producer.send({
      topic: "video-processing-a",
      messages: [
        {
          key: videoID,
          value: JSON.stringify({ videoID, projectID, filePath, resolution, from }), // Added resolution
        },
      ],
    });

    console.log(`✅ Sent message to Kafka: ${videoID} for resolution: ${resolution}`);
  } catch (error) {
    console.error("❌ Error sending Kafka message:", error);
  } finally {
    await producer.disconnect();
  }
};

module.exports = { sendMessage };
