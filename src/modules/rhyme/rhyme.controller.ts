import { Controller } from '@nestjs/common';
import { RhymeService } from './rhyme.service';

@Controller('api/rhyme')
export class RhymeController {
  constructor(private readonly rhymeService: RhymeService) {}

  // TODO: Реализовать эндпоинты в Milestone 2
}

