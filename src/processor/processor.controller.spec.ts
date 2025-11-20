import { Test, TestingModule } from '@nestjs/testing';
import { ProcessorController } from './processor.controller';

describe('ProcessorController', () => {
  let controller: ProcessorController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProcessorController],
    }).compile();

    controller = module.get<ProcessorController>(ProcessorController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
