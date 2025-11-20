# Upload & Stream Microservices (Migration guide to NestJS)

This repository contains a Node.js-based production-grade Video Upload and Streaming system using:

- FFmpeg for video conversion/HLS
- Kafka for job queueing (kafkajs)
- Azure Blob Storage for object storage
- MongoDB for metadata and logs
- Multer for uploads
- Express for HTTP APIs

This README documents the current project, explains the core components and data flows, and provides a detailed migration guide to implement the same functionality using a NestJS architecture (recommended folder layout, modules, DTOs, schemas, and steps to get up and running).

## Table of contents

- Project summary (what each service does)
- Current endpoints & flows
- Environment variables needed
- Mapping to NestJS (modules, controllers, services)
- Suggested NestJS folder layout
- Example Mongoose schemas & DTOs
- Kafka and video-processor recommendations
- Docker / local dev notes
- Migration steps (step-by-step)
- Next steps & improvements

## Project summary

This project contains multiple responsibilities split across files/services:

- Upload API (`app.js`): Receives video uploads or URL uploads, converts non-MP4 to MP4 using FFmpeg, uploads to Azure Blob Storage, writes metadata to MongoDB, and enqueues processing messages to Kafka.
- Streaming API (`stream-app.js`): Validates API keys, returns encrypted streaming URLs and streams HLS master playlists and TS segments from Azure Blob Storage.
- Kafka producer (`kafka/producer.js`): Sends messages to the `video-processing-a` topic for conversion into HLS and other resolutions.
- Kafka consumer/processor (`Serv-Kafka/video-processing-a.js` + `Serv-Kafka/videoProcessorUtils.js`): Consumes messages, downloads original file from Blob Storage, spawns FFmpeg to produce HLS segments per resolution, uploads HLS folder back to Blob Storage, updates MongoDB processing status.
- Helpers (`helpers/*`, `stream-helper/*`): DB helpers (Mongo), logging, API key validation, encryption/decryption for streaming URLs.

## Important endpoints (current Express implementation)

- POST /:projectID/upload
	- multipart form-data (field `video`) — uploads and converts if needed, stores to Azure Blob
- POST /:projectID/upload-url
	- JSON { videoUrl } — downloads remote URL, stores to blob, queues job
- POST /reprocess/:projectID/:videoID
	- re-enqueue an existing object for processing
- POST /skip-current-job
	- sets a skip flag used by the video-processor to stop
- GET /:project_id/GetVideoIDs (stream service)
- GET /videos/:videoID
- GET /videos/:videoID/:quality
- GET /stream/:encryptedPath

## Required environment variables (from current repo)

- AZURE_STORAGE_ACCOUNT_NAME
- AZURE_STORAGE_ACCOUNT_KEY
- AZURE_STORAGE_CONTAINER_NAME
- MONGO_URI
- PORT (for upload service)
- STREAMPORT (for stream service)
- ENCRYPTION_KEY (used by stream-helper/cryptoUtils)

Ensure `.env` in each service (or centralized config) contains these.

## Mapping to a NestJS architecture

Goal: reorganize the codebase into modular, testable NestJS apps. I recommend splitting into two or three NestJS apps/services:

1) upload-service (NestJS app) — handles HTTP uploads + enqueues Kafka messages
2) stream-service (NestJS app) — handles streaming endpoints and serving HLS via signed/encrypted paths
3) video-processor (NestJS microservice or separate Nest app) — Kafka consumer that converts and uploads HLS

Each Nest app should follow the standard module/controller/service/provider pattern.

Suggested modules and responsibilities

- SharedModule
	- Providers: AzureBlobService, MongoService (or MongooseModule), KafkaService (producer utilities), ConfigService
- UploadModule
	- Controller: UploadController
		- endpoints: POST /:projectID/upload, POST /:projectID/upload-url, POST /reprocess/:projectID/:videoID
	- Service: UploadService
		- responsibilities: store temp files, convert via FFmpeg, upload to blob, save metadata, send kafka message
	- Guards/Middleware: ApiKeyGuard (reads from Mongo `api_keys` collection)
- StreamModule
	- Controller: StreamController
		- endpoints: GET /:project_id/GetVideoIDs, GET /videos/:videoID, GET /videos/:videoID/:quality, GET /stream/:encryptedPath
	- Service: StreamService
		- responsibilities: fetch DB metadata, generate encrypted links (use Nest Crypto provider), stream blob content (pipe), update stream logs
- ProcessorModule (video-processor)
	- A Nest microservice or standalone consumer process
	- Service: ProcessorService
		- responsibilities: consume Kafka messages, download blob, run FFmpeg to produce HLS (keep process handle for skip), upload processed files, update DB

Notes on Kafka in Nest

- You can use native kafkajs for parity with the original project or use Nest's microservices Kafka transport (but kafkajs is more flexible and matches original code).
- Keep consumer and producer logic encapsulated in a KafkaService provider.

## Suggested NestJS folder layout

upload-service/
- src/
	- app.module.ts
	- main.ts
	- shared/
		- shared.module.ts
		- services/
			- azure-blob.service.ts
			- kafka.service.ts
		- guards/
			- api-key.guard.ts
	- upload/
		- upload.module.ts
		- upload.controller.ts
		- upload.service.ts
		- dto/
			- upload-url.dto.ts
		- pipes/
	- schemas/
		- video.schema.ts
		- project.schema.ts
		- api-key.schema.ts
	- config/
		- configuration.ts
	- utils/
		- ffmpeg.util.ts
		- file.util.ts

processor-service/
- src/
	- processor.module.ts
	- processor.service.ts
	- kafka/
		- consumer.service.ts
	- utils/
		- video-processor.util.ts
	- helpers/
		- blob-upload.util.ts

stream-service/
- src/
	- stream.module.ts
	- stream.controller.ts
	- stream.service.ts
	- utils/
		- crypto.util.ts
	- schemas (reuse same Mongoose schemas)

## Example Mongoose schemas (simplified)

videos.schema.ts (Mongoose)

```ts
import { Schema } from 'mongoose';

export const VideoSchema = new Schema({
	videoID: { type: String, unique: true },
	projectID: String,
	fileName: String,
	filePath: String,
	masterFilePath: String,
	fileSize: Number,
	converted: { type: Boolean, default: false },
	uploadTime: Date,
	resolutions: [String],
	processingStatus: Schema.Types.Mixed
});
```

apiKey.schema.ts

```ts
import { Schema } from 'mongoose';

export const ApiKeySchema = new Schema({
	apiKey: { type: String, unique: true },
	createdAt: Date,
	isActive: Boolean
});
```

## DTO examples

upload-url.dto.ts

```ts
export class UploadUrlDto { 
	videoUrl: string;
}
```

## FFmpeg & temp storage

- Keep FFmpeg command execution in a single util/service using child_process.spawn so the process reference is accessible for skip/kill operations.
- Use a temp folder per job and ensure cleanup with try/finally.

## Kafka topics & consumer behavior

- Topics: video-processing-a, video-processing-b (if needed), video-retry
- Messages should contain: { videoID, projectID, filePath, resolution[], from, retryCount }
- The processor must update processingStatus per resolution in DB and write `converted: true` and `masterFilePath` when done.

## Environment & dependencies for NestJS apps

Install the Nest CLI and create projects:

```bash
npm i -g @nestjs/cli
nest new upload-service
```

Inside each Nest project, install runtime deps (example):

```bash
npm install @nestjs/mongoose mongoose kafkajs @azure/storage-blob fluent-ffmpeg multer dotenv crypto stream-to-string
```

Host system must have `ffmpeg` available in PATH (install via brew on macOS: `brew install ffmpeg`).

## Docker / local dev notes

- Keep Kafka + Zookeeper and MongoDB in Docker for local dev (your repo already contains docker-compose for Kafka and MongoDB). Use the existing compose files and ensure correct ports.
- Azure Blob Storage can be mocked locally with Azurite for dev:
	- `npm install -g azurite` and run `azurite` for local blob emulation.

## Migration steps (concrete)

1) Create a Nest app for `upload-service`:

```bash
nest new upload-service
cd upload-service
npm install @nestjs/mongoose mongoose kafkajs @azure/storage-blob fluent-ffmpeg multer dotenv
```

2) Create SharedModule and providers: `AzureBlobService`, `MongoModule` (MongooseModule.forRoot(process.env.MONGO_URI)) and `KafkaService` (producer wrapper around kafkajs).

3) Implement UploadModule:
	 - UploadController: endpoints matching current Express routes.
	 - UploadService: reuse logic from `app.js` with better error handling, use `Injectable`, and use the shared services for blob/kafka/db.
	 - Use `@UseGuards(ApiKeyGuard)` on controller or routes to validate API key.

4) Implement StreamModule in separate Nest app:
	 - Implement stream endpoints; for `/stream/:encryptedPath` use a controller that decodes the path and pipes blob download to response.
	 - Keep encryption logic in a provider for testability.

5) Implement Processor as a microservice/worker:
	 - Use a simple Node script within Nest (e.g., `ProcessorService` that starts Kafka consumer in `onModuleInit`) or use Nest's microservice / custom transport.
	 - Keep FFmpeg invocation in a util that can be aborted via stored child process handle.

6) Schemas and DTOs: Create Mongoose schemas for videos, projects, api_keys, upload_logs, stream_logs and wire them into each app.

7) Tests: Add basic unit tests for controllers and services. Add an integration smoke test that uses a small sample mp4 and checks processing queueing.

## Run & verify (local)

1. Start MongoDB and Kafka (use repo's docker-compose):

```bash
# from repo root
docker-compose -f Kafka_Service/docker-compose.yml up -d
docker-compose -f MongoDB/docker-compose.mongodb.yml up -d
```

2. Start the Nest upload-service with env vars pointing to local Mongo/Kafka/Azure or Azurite.

3. Upload a small sample video (via curl or Postman) to POST /:projectID/upload and confirm a message appears on Kafka topic and DB has an entry in `videos`.

4. Start processor service and observe logs for FFmpeg processing; verify HLS files uploaded to Azure/Azurite and DB updated.

## Caveats & notes

- FFmpeg must be available in the environment where processor runs.
- Consider using a job/worker framework (BullMQ / Redis) if you need requeue/retry semantics heavier than Kafka provides.
- Secure ENCRYPTION_KEY and Azure keys (don’t commit `.env`) and rotate keys if needed.
- For very large uploads, consider streaming upload directly into blob (multipart upload) instead of storing temporary disk files.

## Next steps & improvements

- Add structured logging and Prometheus metrics for observability.
- Add retry strategy / dead-letter topic for failed conversions.
- Add e2e tests for upload -> process -> stream flow.
- Consider sharding/partitioning for Kafka topics for scale.

---

If you'd like, I can now:

- generate the NestJS project skeleton and create the modules/controllers/services mapping for `upload-service` (I can create files under a new `nest-upload-service` folder), or
- produce example controller/service code for one endpoint (e.g., POST /:projectID/upload) so you can see how to wire Azure + FFmpeg + Kafka in Nest.

Tell me which of these you'd like me to do next and I'll implement it.

# stream-plus
stream-plus
