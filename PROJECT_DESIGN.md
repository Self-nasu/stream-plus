# Project Design & Architecture

## Overview
Stream Plus is a video streaming platform that handles video uploads, processing (transcoding), and streaming. The system is designed to be multi-tenant, where organizations can manage their own video content.

## Authentication Flow
The API uses API Key authentication.
1.  **Client** sends a request with `x-api-key` header.
2.  **ApiKeyGuard** intercepts the request.
3.  It validates the key against the `Organization` collection.
4.  If valid, it attaches the `organization` object to the request.
5.  The `projectID` is derived from the organization's `_id`.

## Upload Flow
1.  **Client** calls `POST /upload` with `x-api-key` and file/URL.
2.  **UploadController** receives the request.
3.  It extracts `projectID` and `videoProcessConfig` from the authenticated organization.
4.  **UploadService** handles the file:
    -   Saves to temp storage.
    -   Uploads to Azure Blob Storage (`{projectID}/{videoID}/{fileName}`).
    -   Creates a `Video` record in MongoDB.
    -   Sends a message to Kafka (`video-processing-a`) with resolutions defined in `videoProcessConfig`.
5.  **Video Processor** (Consumer) picks up the message and starts transcoding.

## Database Schema

### Organization (`organizations`)
Stores organization details and configuration.
-   `_id`: ObjectId (Project ID)
-   `email`: String
-   `passwordHash`: String
-   `apiKey`: String (Unique)
-   `name`: String
-   `videoProcessConfig`: Object (e.g., `{'1080p': false, '720p': true}`)
-   `streamConfig`: Object (e.g., `allowedDomains`)

### Video (`videos`)
Stores metadata for uploaded videos.
-   `videoID`: String (UUID)
-   `projectID`: String (Organization ID)
-   `fileName`: String
-   `filePath`: String (Blob path)
-   `masterFilePath`: String
-   `fileSize`: Number
-   `converted`: Boolean
-   `resolutions`: Array<String>
-   `processingStatus`: Object
-   `uploadTime`: Date

### Upload Log (`upload_logs`)
Logs events related to video uploads.
-   `videoID`: String
-   `projectID`: String
-   `logType`: String ("upload", "processing", "error")
-   `message`: String
-   `details`: Object

### Stream Log (`stream_logs`)
Logs video streaming events.
-   `videoID`: String
-   `projectID`: String
-   `userIP`: String
-   `userAgent`: String
-   `timestamp`: Date

### API Key (`api_keys`)
(Legacy/Alternative) Stores API keys if separated from Organization.
-   `apiKey`: String
-   `isActive`: Boolean

## API Endpoints

### Upload
-   `POST /upload`
    -   Headers: `x-api-key`
    -   Body: `multipart/form-data` (file) or JSON (`videoUrl`)
    -   Response: `{ message, videoID, projectID }`

-   `POST /reprocess/:videoID`
    -   Headers: `x-api-key`
    -   Response: `{ message }`
