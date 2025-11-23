
import { Test, TestingModule } from '@nestjs/testing';
import { StreamService } from './stream.service';
import { StreamController } from './stream.controller';
import { ConfigService } from '@nestjs/config';
import { CryptoService } from '../shared/services/crypto/crypto.service';
import { AzureBlobService } from '../shared/services/azure-blob/azure-blob.service';
import { getModelToken } from '@nestjs/mongoose';
import { Video } from '../schemas/video.schema';
import { StreamLog } from '../schemas/stream-log.schema';
import { NotFoundException } from '@nestjs/common';

describe('Stream API Debug', () => {
  let streamService: StreamService;
  let streamController: StreamController;
  let configService: ConfigService;
  let cryptoService: CryptoService;
  let azureBlobService: AzureBlobService;

  const mockVideoModel = {
    findOne: jest.fn(),
  };

  const mockStreamLogModel = {
    create: jest.fn(),
  };

  const mockCryptoService = {
    encryptFilePath: jest.fn((path) => `encrypted_${path}`),
    decryptFilePath: jest.fn((path) => path.replace('encrypted_', '')),
  };

  const mockAzureBlobService = {
    exists: jest.fn(),
    downloadToBuffer: jest.fn(),
    streamBlob: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [StreamController],
      providers: [
        StreamService,
        { provide: getModelToken(Video.name), useValue: mockVideoModel },
        { provide: getModelToken(StreamLog.name), useValue: mockStreamLogModel },
        { provide: CryptoService, useValue: mockCryptoService },
        { provide: AzureBlobService, useValue: mockAzureBlobService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    streamService = module.get<StreamService>(StreamService);
    streamController = module.get<StreamController>(StreamController);
    configService = module.get<ConfigService>(ConfigService);
    cryptoService = module.get<CryptoService>(CryptoService);
    azureBlobService = module.get<AzureBlobService>(AzureBlobService);
  });

  it('should return encrypted URL when STREAM_ENCRYPT is true', async () => {
    mockConfigService.get.mockReturnValue(true);
    mockVideoModel.findOne.mockReturnValue({
      exec: jest.fn().mockResolvedValue({
        filePath: 'project/video/file.mp4',
        converted: true,
        projectID: 'project',
      }),
    });

    const result = await streamService.getVideo('video1', '127.0.0.1', 'test-agent');
    expect(result.videoURL).toContain('stream/encrypted_');
  });

  it('should return open URL when STREAM_ENCRYPT is false', async () => {
    mockConfigService.get.mockReturnValue(false);
    mockVideoModel.findOne.mockReturnValue({
      exec: jest.fn().mockResolvedValue({
        filePath: 'project/video/file.mp4',
        converted: true,
        projectID: 'project',
      }),
    });

    const result = await streamService.getVideo('video1', '127.0.0.1', 'test-agent');
    expect(result.videoURL).toContain('stream/open/');
    expect(result.videoURL).not.toContain('encrypted_');
  });

  it('should stream file successfully if exists', async () => {
    mockAzureBlobService.exists.mockResolvedValue(true);
    mockAzureBlobService.downloadToBuffer.mockResolvedValue(Buffer.from('#EXTM3U\nfile.ts'));
    mockConfigService.get.mockReturnValue(false); // Test open stream rewriting

    const result = await streamService.streamFile('path/to/master.m3u8', '127.0.0.1', 'test-agent', false);
    expect(result.content).toBeDefined();
  });

  it('should throw NotFoundException if file does not exist', async () => {
    mockAzureBlobService.exists.mockResolvedValue(false);

    await expect(
      streamService.streamFile('path/to/missing.m3u8', '127.0.0.1', 'test-agent', false)
    ).rejects.toThrow(NotFoundException);
  });
});
