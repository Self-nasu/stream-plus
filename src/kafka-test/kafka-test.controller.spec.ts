import { Test, TestingModule } from '@nestjs/testing';
import { KafkaTestController } from './kafka-test.controller';

describe('KafkaTestController', () => {
  let controller: KafkaTestController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [KafkaTestController],
    }).compile();

    controller = module.get<KafkaTestController>(KafkaTestController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
