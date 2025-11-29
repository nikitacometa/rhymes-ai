import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  ParseUUIDPipe,
} from '@nestjs/common';
import { RhymeService } from './rhyme.service';
import {
  CreateRhymeFamilyDto,
  CreateRhymeExampleDto,
  CreateRhymeUnitDto,
  CreateRhymeLinkDto,
  SearchRhymeDto,
} from './dto';

@Controller('api/rhyme')
export class RhymeController {
  constructor(private readonly rhymeService: RhymeService) {}

  // =====================================================
  // SEARCH
  // =====================================================

  @Post('search')
  async search(@Body() dto: SearchRhymeDto) {
    return this.rhymeService.search(dto);
  }

  @Get('search')
  async searchGet(@Query() dto: SearchRhymeDto) {
    return this.rhymeService.search(dto);
  }

  // =====================================================
  // STATS
  // =====================================================

  @Get('stats')
  async getStats() {
    return this.rhymeService.getStats();
  }

  // =====================================================
  // FAMILIES
  // =====================================================

  @Post('families')
  async createFamily(@Body() dto: CreateRhymeFamilyDto) {
    return this.rhymeService.createFamily(dto);
  }

  @Get('families')
  async findAllFamilies(@Query('limit') limit?: string) {
    return this.rhymeService.findAllFamilies(limit ? parseInt(limit, 10) : 100);
  }

  @Get('families/:id')
  async findFamilyById(@Param('id', ParseUUIDPipe) id: string) {
    return this.rhymeService.findFamilyById(id);
  }

  @Get('families/slug/:slug')
  async findFamilyBySlug(@Param('slug') slug: string) {
    return this.rhymeService.findFamilyBySlug(slug);
  }

  @Put('families/:id')
  async updateFamily(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: Partial<CreateRhymeFamilyDto>,
  ) {
    return this.rhymeService.updateFamily(id, dto);
  }

  @Delete('families/:id')
  async deleteFamily(@Param('id', ParseUUIDPipe) id: string) {
    await this.rhymeService.deleteFamily(id);
    return { success: true };
  }

  // =====================================================
  // EXAMPLES
  // =====================================================

  @Post('examples')
  async createExample(@Body() dto: CreateRhymeExampleDto) {
    return this.rhymeService.createExample(dto);
  }

  @Post('examples/batch')
  async createManyExamples(@Body() examples: CreateRhymeExampleDto[]) {
    return this.rhymeService.createManyExamples(examples);
  }

  @Get('examples/family/:familyId')
  async findExamplesByFamilyId(@Param('familyId', ParseUUIDPipe) familyId: string) {
    return this.rhymeService.findExamplesByFamilyId(familyId);
  }

  @Get('examples/track/:track')
  async findExamplesByTrack(@Param('track') track: string) {
    return this.rhymeService.findExamplesByTrack(track);
  }

  // =====================================================
  // UNITS
  // =====================================================

  @Post('units')
  async createUnit(@Body() dto: CreateRhymeUnitDto) {
    return this.rhymeService.createUnit(dto);
  }

  @Post('units/batch')
  async createManyUnits(@Body() units: CreateRhymeUnitDto[]) {
    return this.rhymeService.createManyUnits(units);
  }

  @Get('units/family/:familyId')
  async findUnitsByFamilyId(@Param('familyId', ParseUUIDPipe) familyId: string) {
    return this.rhymeService.findUnitsByFamilyId(familyId);
  }

  @Get('units/phonetic/:phoneticTail')
  async findUnitsByPhoneticTail(@Param('phoneticTail') phoneticTail: string) {
    return this.rhymeService.findUnitsByPhoneticTail(phoneticTail);
  }

  // =====================================================
  // LINKS
  // =====================================================

  @Post('links')
  async createLink(@Body() dto: CreateRhymeLinkDto) {
    return this.rhymeService.createLink(dto);
  }

  @Post('links/batch')
  async createManyLinks(@Body() links: CreateRhymeLinkDto[]) {
    return this.rhymeService.createManyLinks(links);
  }

  @Get('links/unit/:unitId')
  async findLinksByUnitId(@Param('unitId', ParseUUIDPipe) unitId: string) {
    return this.rhymeService.findLinksByUnitId(unitId);
  }
}
