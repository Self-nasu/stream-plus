// src/shared/services/azure-blob.service.ts
import { Injectable, Logger } from '@nestjs/common';
import {
  BlobServiceClient,
  StorageSharedKeyCredential,
  ContainerClient,
  BlockBlobClient,
  BlobDownloadResponseModel,
  BlobSASPermissions,
  generateBlobSASQueryParameters,
  SASProtocol,
} from '@azure/storage-blob';
import * as fs from 'fs';
import * as path from 'path';
import { Readable } from 'stream';

@Injectable()
export class AzureBlobService {
  private readonly logger = new Logger(AzureBlobService.name);
  private blobServiceClient: BlobServiceClient;
  private containerClient: ContainerClient;
  private accountName: string;
  private accountKey?: string;

  constructor() {
    const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
    this.accountName = process.env.AZURE_STORAGE_ACCOUNT_NAME || '';
    this.accountKey = process.env.AZURE_STORAGE_ACCOUNT_KEY;

    if (connectionString) {
      this.blobServiceClient =
        BlobServiceClient.fromConnectionString(connectionString);
      this.logger.log(
        'AzureBlobService: using AZURE_STORAGE_CONNECTION_STRING',
      );
    } else if (this.accountName && this.accountKey) {
      const credential = new StorageSharedKeyCredential(
        this.accountName,
        this.accountKey,
      );
      const url = `https://${this.accountName}.blob.core.windows.net`;
      this.blobServiceClient = new BlobServiceClient(url, credential);
      this.logger.log('AzureBlobService: using StorageSharedKeyCredential');
    } else {
      throw new Error(
        'Azure storage credentials not configured (AZURE_STORAGE_CONNECTION_STRING or AZURE_STORAGE_ACCOUNT_NAME & AZURE_STORAGE_ACCOUNT_KEY)',
      );
    }

    const containerName = process.env.AZURE_STORAGE_CONTAINER_NAME;
    if (!containerName) throw new Error('AZURE_STORAGE_CONTAINER_NAME not set');
    this.containerClient =
      this.blobServiceClient.getContainerClient(containerName);
  }

  /** Ensure the container exists (create if not). Useful for local dev. */
  async ensureContainerExists(): Promise<void> {
    const exists = await this.containerClient.exists();
    if (!exists) {
      this.logger.log(
        `Container "${this.containerClient.containerName}" does not exist. Creating...`,
      );
      await this.containerClient.create();
      this.logger.log('Container created');
    }
  }

  /** Upload a local file to blob (uploads as a single block blob). */
  async uploadFile(
    localFilePath: string,
    destinationBlobPath: string,
  ): Promise<void> {
    // Check if file exists before attempting upload
    try {
      await fs.promises.access(localFilePath, fs.constants.R_OK);
    } catch (error) {
      this.logger.error(
        `File does not exist or is not readable: ${localFilePath}`,
      );
      throw new Error(
        `Cannot upload file ${localFilePath}: file not found or not readable`,
      );
    }

    const blockBlobClient: BlockBlobClient =
      this.containerClient.getBlockBlobClient(destinationBlobPath);
    this.logger.log(
      `Uploading local file ${localFilePath} -> ${destinationBlobPath}`,
    );
    
    try {
      await blockBlobClient.uploadFile(localFilePath);
      this.logger.log('Upload complete');
    } catch (error) {
      this.logger.error(
        `Failed to upload ${localFilePath} -> ${destinationBlobPath}:`,
        error,
      );
      throw error;
    }
  }

  /** Upload a readable stream to blob. Use this for streaming uploads. */
  async uploadStream(
    stream: Readable,
    destinationBlobPath: string,
    bufferSize = 4 * 1024 * 1024,
    maxConcurrency = 20,
  ): Promise<void> {
    const blockBlobClient =
      this.containerClient.getBlockBlobClient(destinationBlobPath);
    this.logger.log(`Uploading stream -> ${destinationBlobPath}`);
    await blockBlobClient.uploadStream(stream, bufferSize, maxConcurrency);
    this.logger.log('Stream upload complete');
  }

  /** Download a blob to local file path */
  async downloadToFile(blobPath: string, localPath: string): Promise<void> {
    const client = this.containerClient.getBlockBlobClient(blobPath);
    this.logger.log(`Downloading blob ${blobPath} -> ${localPath}`);
    await client.downloadToFile(localPath);
    this.logger.log('Download complete');
  }

  /** Download a blob and return a Buffer */
  async downloadToBuffer(blobPath: string): Promise<Buffer> {
    const client = this.containerClient.getBlockBlobClient(blobPath);
    const downloadResponse = await client.download();
    const stream = downloadResponse.readableStreamBody;

    if (!stream) {
      throw new Error('No readable stream body');
    }

    const chunks: Buffer[] = [];

    // (chunk can be Buffer | string | Uint8Array depending on source)
    for await (const chunk of stream) {
      if (Buffer.isBuffer(chunk)) {
        chunks.push(chunk);
      } else {
        chunks.push(Buffer.from(String(chunk)));
      }
    }

    return Buffer.concat(chunks);
  }

  /** Stream a blob: returns the readable stream for piping to HTTP responses. */
  async streamBlob(blobPath: string): Promise<Readable> {
    const client = this.containerClient.getBlockBlobClient(blobPath);
    const response: BlobDownloadResponseModel = await client.download();
    if (!response.readableStreamBody)
      throw new Error('No readable stream body from blob');
    return response.readableStreamBody as Readable;
  }

  /** Recursively upload a folder to blob (preserve directory structure under destinationBlobPath) */
  async uploadFolder(
    localFolderPath: string,
    destinationBlobPath = '',
  ): Promise<void> {
    const entries = await fs.promises.readdir(localFolderPath, {
      withFileTypes: true,
    });
    
    // Collect all upload promises to ensure they all complete
    const uploadPromises: Promise<void>[] = [];
    
    for (const entry of entries) {
      const fullPath = path.join(localFolderPath, entry.name);
      const destPath = destinationBlobPath
        ? `${destinationBlobPath}/${entry.name}`
        : entry.name;
      if (entry.isDirectory()) {
        uploadPromises.push(this.uploadFolder(fullPath, destPath));
      } else if (entry.isFile()) {
        uploadPromises.push(this.uploadFile(fullPath, destPath));
      }
    }
    
    // Wait for all uploads to complete before returning
    await Promise.all(uploadPromises);
    this.logger.log(`Folder upload complete: ${localFolderPath} -> ${destinationBlobPath}`);
  }

  /** Check whether a blob exists */
  async exists(blobPath: string): Promise<boolean> {
    const client = this.containerClient.getBlockBlobClient(blobPath);
    return client.exists();
  }

  /** Delete a blob */
  async delete(blobPath: string): Promise<void> {
    const client = this.containerClient.getBlockBlobClient(blobPath);
    await client.deleteIfExists();
  }

  /**
   * Generate a SAS URL for a blob (short-lived). Requires account key to be configured.
   *
   * expiresInSeconds - number of seconds from now the SAS will expire
   */
  generateBlobSASUrl(blobPath: string, expiresInSeconds = 60 * 60): string {
    if (!this.accountName || !this.accountKey) {
      throw new Error('Account key required to generate SAS URL');
    }
    const sharedKeyCredential = new StorageSharedKeyCredential(
      this.accountName,
      this.accountKey,
    );

    const expiresOn = new Date(new Date().valueOf() + expiresInSeconds * 1000);

    const sas = generateBlobSASQueryParameters(
      {
        containerName: this.containerClient.containerName,
        blobName: blobPath,
        permissions: BlobSASPermissions.parse('r'), // read-only
        protocol: SASProtocol.HttpsAndHttp,
        startsOn: new Date(),
        expiresOn,
      },
      sharedKeyCredential,
    ).toString();

    const blobUrl = `${this.containerClient.getBlockBlobClient(blobPath).url}?${sas}`;
    return blobUrl;
  }
}
