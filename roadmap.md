# Project Roadmap: Stream Plus Migration

This document outlines the roadmap for migrating the legacy Node.js/Express video streaming application to a modern NestJS microservices architecture.

## 1. Core Infrastructure & Setup
**Status:** 🟡 In Progress

- [x] **Project Initialization**: NestJS workspace set up.
- [x] **Configuration**: `ConfigModule` and environment variable handling.
- [x] **Database**: `MongooseModule` connection to MongoDB.
- [x] **Shared Services**:
    - [x] `AzureBlobService`: Implemented.
    - [x] `KafkaService`: Implemented.
- [ ] **Logging**: Structured logging setup (Pending).

## 2. Data Layer (Schemas & DTOs)
**Status:** 🔴 Pending

- [ ] **Video Schema**: Define schema for video metadata (replacing `videos` collection).
- [ ] **API Key Schema**: Define schema for API keys.
- [ ] **Log Schemas**: Define schemas for upload and stream logs.
- [ ] **DTOs**: Create Data Transfer Objects for API requests/responses.

## 3. Upload Service
**Status:** 🔴 Pending

- [ ] **Upload Module**: Create `UploadModule`.
- [ ] **Upload Controller**:
    - `POST /:projectID/upload`: Unified endpoint for file uploads (multipart) and URL-based uploads.
    - `POST /reprocess/:projectID/:videoID`: Handle reprocessing requests.
- [ ] **Upload Service**:
    - Integrate `AzureBlobService` for storage.
    - Integrate `KafkaService` to publish processing jobs.
    - Implement FFmpeg validation/conversion (if needed before processing).
- [ ] **Guards**: Implement `ApiKeyGuard`.

## 4. Video Processor Service
**Status:** 🔴 Pending

- [ ] **Processor Module**: Create `ProcessorModule`.
- [ ] **Kafka Consumer**: Implement consumer for `video-processing-a` topic.
- [ ] **Video Processing Logic**:
    - Download raw video from Azure.
    - Generate HLS streams (multi-resolution) using FFmpeg.
    - Upload HLS segments to Azure.
    - Update video status in MongoDB.
- [ ] **Error Handling**: Retry logic and dead-letter queues.

## 5. Stream Service
**Status:** 🔴 Pending

- [ ] **Stream Module**: Create `StreamModule`.
- [ ] **Stream Controller**:
    - `GET /videos/:videoID`: Get video metadata.
    - `GET /stream/:encryptedPath`: Serve HLS playlists/segments.
- [ ] **Security**:
    - Implement URL encryption/decryption utilities.
    - Validate signed URLs.

## 6. Organization & Auth (Enhancements)
**Status:** 🟡 In Progress

- [x] **Organization Module**: Basic structure created.
- [ ] **Auth Module**: Implement authentication logic.
- [ ] **API Key Management**: logic for creating/validating keys.

## 7. Testing & Deployment
**Status:** ⚪ Not Started

- [ ] **Unit Tests**: Cover services and controllers.
- [ ] **Integration Tests**: Test Kafka flows and DB interactions.
- [ ] **Docker**: Update `Dockerfile` and `docker-compose` for the NestJS apps.
- [ ] **CI/CD**: Setup pipelines (optional).

## 8. Advanced Features (New)
**Status:** 🔴 Pending

- [ ] **Dynamic Consumer Management**:
    - Auto-scale Kafka consumers based on load.
    - Create/Destroy consumers dynamically.
- [ ] **Super Admin API**:
    - `GET /admin/stats`: View active consumers, queue depth, and processing stats.
    - `POST /admin/video/:videoID/stop`: Force stop/skip processing for a video.
- [ ] **Processing Control**:
    - Implement cancellation tokens/flags for ongoing processing jobs.

