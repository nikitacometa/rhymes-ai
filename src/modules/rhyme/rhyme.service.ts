import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class RhymeService {
  constructor(private readonly prisma: PrismaService) {}

  // TODO: Реализовать в Milestone 2
}

