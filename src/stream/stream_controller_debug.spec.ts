import { Test, TestingModule } from '@nestjs/testing';
import { StreamController } from './stream.controller';
import { StreamService } from './stream.service';
import { ConfigService } from '@nestjs/config';
import { CryptoService } from '../shared/services/crypto/crypto.service';
import { AzureBlobService } from '../shared/services/azure-blob/azure-blob.service';
import { getModelToken } from '@nestjs/mongoose';
import { Video } from '../schemas/video.schema';
import { StreamLog } from '../schemas/stream-log.schema';

describe('StreamController Wildcard Debug', () => {
  let streamController: StreamController;
  let streamService: StreamService;

  const mockStreamService = {
    streamFile: jest.fn().mockResolvedValue({ content: 'mock content', contentType: 'text/plain' }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [StreamController],
      providers: [
        { provide: StreamService, useValue: mockStreamService },
      ],
    }).compile();

    streamController = module.get<StreamController>(StreamController);
  });

  it('should correctly extract wildcard path using @Param("0")', async () => {
    const req = { ip: '127.0.0.1', headers: { 'user-agent': 'test' } };
    const res = { setHeader: jest.fn(), send: jest.fn() };
    const openPath = 'project/video/master.m3u8';

    await streamController.streamOpenVideo(openPath, req, res as any);

    expect(mockStreamService.streamFile).toHaveBeenCalledWith(
      openPath,
      '127.0.0.1',
      'test',
      false
    );
  });
});
