import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PhoneticService {
  constructor(private readonly prisma: PrismaService) {}

  // TODO: Реализовать фонетизацию в Milestone 3
}

