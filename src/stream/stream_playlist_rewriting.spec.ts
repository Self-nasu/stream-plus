import { Test, TestingModule } from '@nestjs/testing';
import { StreamService } from './stream.service';
import { getModelToken } from '@nestjs/mongoose';
import { Video } from '../schemas/video.schema';
import { StreamLog } from '../schemas/stream-log.schema';
import { CryptoService } from '../shared/services/crypto/crypto.service';
import { AzureBlobService } from '../shared/services/azure-blob/azure-blob.service';
import { ConfigService } from '@nestjs/config';

describe('StreamService Playlist Rewriting', () => {
  let streamService: StreamService;
  let mockAzureBlobService: any;
  let mockConfigService: any;
  let mockCryptoService: any;

  beforeEach(async () => {
    mockAzureBlobService = {
      exists: jest.fn(),
      downloadToBuffer: jest.fn(),
      streamBlob: jest.fn(),
    };

    mockConfigService = {
      get: jest.fn(),
    };

    mockCryptoService = {
      encryptFilePath: jest.fn((path) => `encrypted_${path}`),
      decryptFilePath: jest.fn((path) => path.replace('encrypted_', '')),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StreamService,
        { provide: getModelToken(Video.name), useValue: {} },
        { provide: getModelToken(StreamLog.name), useValue: {} },
        { provide: AzureBlobService, useValue: mockAzureBlobService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: CryptoService, useValue: mockCryptoService },
      ],
    }).compile();

    streamService = module.get<StreamService>(StreamService);
  });

  describe('Master Playlist Rewriting', () => {
    it('should rewrite quality playlist paths for unencrypted stream', async () => {
      const masterPlaylist = `#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=300000,RESOLUTION=426x240
240p/output.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=500000,RESOLUTION=640x360
360p/output.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=700000,RESOLUTION=854x480
480p/output.m3u8`;

      mockAzureBlobService.exists.mockResolvedValue(true);
      mockAzureBlobService.downloadToBuffer.mockResolvedValue(Buffer.from(masterPlaylist));
      mockConfigService.get.mockReturnValue(false); // streamEncrypt = false

      const result = await streamService.streamFile(
        'projectID/videoID/master.m3u8',
        '127.0.0.1',
        'test-agent',
        false
      );

      expect(result.content).toContain('/stream/open/projectID/videoID/240p/output.m3u8');
      expect(result.content).toContain('/stream/open/projectID/videoID/360p/output.m3u8');
      expect(result.content).toContain('/stream/open/projectID/videoID/480p/output.m3u8');
      expect(result.content).toContain('#EXT-X-STREAM-INF:BANDWIDTH=300000,RESOLUTION=426x240');
    });

    it('should rewrite quality playlist paths for encrypted stream', async () => {
      const masterPlaylist = `#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=300000,RESOLUTION=426x240
240p/output.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=500000,RESOLUTION=640x360
360p/output.m3u8`;

      mockAzureBlobService.exists.mockResolvedValue(true);
      mockAzureBlobService.downloadToBuffer.mockResolvedValue(Buffer.from(masterPlaylist));
      mockConfigService.get.mockReturnValue(true); // streamEncrypt = true

      const result = await streamService.streamFile(
        'projectID/videoID/master.m3u8',
        '127.0.0.1',
        'test-agent',
        false
      );

      expect(result.content).toContain('/stream/encrypted_projectID%2FvideoID%2F240p%2Foutput.m3u8');
      expect(result.content).toContain('/stream/encrypted_projectID%2FvideoID%2F360p%2Foutput.m3u8');
    });
  });

  describe('Quality Playlist Rewriting', () => {
    it('should rewrite segment paths for unencrypted stream', async () => {
      const qualityPlaylist = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:60
#EXT-X-PLAYLIST-TYPE:VOD
#EXTINF:60.000,
segments/segment_0.ts
#EXTINF:60.000,
segments/segment_1.ts
#EXTINF:60.000,
segments/segment_2.ts
#EXT-X-ENDLIST`;

      mockAzureBlobService.exists.mockResolvedValue(true);
      mockAzureBlobService.downloadToBuffer.mockResolvedValue(Buffer.from(qualityPlaylist));
      mockConfigService.get.mockReturnValue(false); // streamEncrypt = false

      const result = await streamService.streamFile(
        'projectID/videoID/240p/output.m3u8',
        '127.0.0.1',
        'test-agent',
        false
      );

      expect(result.content).toContain('/stream/open/projectID/videoID/240p/segments/segment_0.ts');
      expect(result.content).toContain('/stream/open/projectID/videoID/240p/segments/segment_1.ts');
      expect(result.content).toContain('/stream/open/projectID/videoID/240p/segments/segment_2.ts');
      expect(result.content).toContain('#EXTINF:60.000,');
      expect(result.content).toContain('#EXT-X-ENDLIST');
    });

    it('should rewrite segment paths for encrypted stream', async () => {
      const qualityPlaylist = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:60
#EXT-X-PLAYLIST-TYPE:VOD
#EXTINF:60.000,
segments/segment_0.ts
#EXTINF:60.000,
segments/segment_1.ts
#EXT-X-ENDLIST`;

      mockAzureBlobService.exists.mockResolvedValue(true);
      mockAzureBlobService.downloadToBuffer.mockResolvedValue(Buffer.from(qualityPlaylist));
      mockConfigService.get.mockReturnValue(true); // streamEncrypt = true

      const result = await streamService.streamFile(
        'projectID/videoID/240p/output.m3u8',
        '127.0.0.1',
        'test-agent',
        false
      );

      expect(result.content).toContain('/stream/encrypted_projectID%2FvideoID%2F240p%2Fsegments%2Fsegment_0.ts');
      expect(result.content).toContain('/stream/encrypted_projectID%2FvideoID%2F240p%2Fsegments%2Fsegment_1.ts');
    });
  });
});
