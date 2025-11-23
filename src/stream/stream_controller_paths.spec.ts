import { Test, TestingModule } from '@nestjs/testing';
import { StreamController } from './stream.controller';
import { StreamService } from './stream.service';

describe('StreamController Path Handling', () => {
  let streamController: StreamController;

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
    mockStreamService.streamFile.mockClear();
  });

  describe('streamOpenVideo', () => {
    it('should handle path as string', async () => {
      const openPath = '6921dd92344345a6d15d8541/044bdf46-9330-481a-858f-165724b3c170/converted/master.m3u8';
      const req = { ip: '127.0.0.1', headers: { 'user-agent': 'test' }, params: {} };
      const res = { setHeader: jest.fn(), send: jest.fn() };

      await streamController.streamOpenVideo(openPath, req, res as any);

      expect(mockStreamService.streamFile).toHaveBeenCalledWith(
        openPath,
        '127.0.0.1',
        'test',
        false
      );
    });

    it('should handle path as array and join with slashes', async () => {
      const pathArray = ['6921dd92344345a6d15d8541', '044bdf46-9330-481a-858f-165724b3c170', 'converted', 'master.m3u8'];
      const expectedPath = '6921dd92344345a6d15d8541/044bdf46-9330-481a-858f-165724b3c170/converted/master.m3u8';
      const req = { ip: '127.0.0.1', headers: { 'user-agent': 'test' }, params: {} };
      const res = { setHeader: jest.fn(), send: jest.fn() };

      await streamController.streamOpenVideo(pathArray, req, res as any);

      expect(mockStreamService.streamFile).toHaveBeenCalledWith(
        expectedPath,
        '127.0.0.1',
        'test',
        false
      );
    });

    it('should fallback to req.params.path if @Param is undefined', async () => {
      const expectedPath = '6921dd92344345a6d15d8541/044bdf46-9330-481a-858f-165724b3c170/converted/master.m3u8';
      const req = { 
        ip: '127.0.0.1', 
        headers: { 'user-agent': 'test' }, 
        params: { path: expectedPath } 
      };
      const res = { setHeader: jest.fn(), send: jest.fn() };

      await streamController.streamOpenVideo(undefined as any, req, res as any);

      expect(mockStreamService.streamFile).toHaveBeenCalledWith(
        expectedPath,
        '127.0.0.1',
        'test',
        false
      );
    });
  });

  describe('streamVideo (encrypted)', () => {
    it('should handle encrypted path correctly', async () => {
      const encryptedPath = 'some-encrypted-string';
      const req = { ip: '127.0.0.1', headers: { 'user-agent': 'test' } };
      const res = { setHeader: jest.fn(), send: jest.fn() };

      await streamController.streamVideo(encryptedPath, req, res as any);

      expect(mockStreamService.streamFile).toHaveBeenCalledWith(
        encryptedPath,
        '127.0.0.1',
        'test',
        true
      );
    });
  });
});
