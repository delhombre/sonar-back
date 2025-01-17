import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Request,
  Query,
  UploadedFile,
  UseInterceptors,
  Logger,
  Res,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { VirementSepaService } from './virement-sepa.service';
import { CreateVirementSepaDto } from './dto/create-virement-sepa.dto';
import { UpdateVirementSepaDto } from './dto/update-virement-sepa.dto';
import { FileInterceptor } from '@nestjs/platform-express';
import { S3Service } from '../services/s3/s3.service';
import { Public } from '@/auth/decorators/public.decorator';
import { Response } from 'express';
import { JwtAuthGuard } from '@/guards/auth.guard';

@Controller('virement-sepa')
@UseGuards(JwtAuthGuard)
export class VirementSepaController {
  constructor(
    private readonly virementSepaService: VirementSepaService,
    private readonly s3Service: S3Service,
  ) {}

  @Post()
  @UseInterceptors(FileInterceptor('invoice'))
  async create(
    @Body() createVirementSepaDto: CreateVirementSepaDto,
    @Request() req,
    @Query() params: string,
    @UploadedFile() invoice: Express.Multer.File,
  ) {
    Logger.debug(JSON.stringify(createVirementSepaDto, null, 2));
    return this.virementSepaService.create(
      createVirementSepaDto,
      req.user.id,
      params,
      invoice,
    );
  }

  @Get()
  findAll(@Request() req) {
    return this.virementSepaService.findAll(req.user.id);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.virementSepaService.findOne(+id);
  }

  @Get(':id/invoice')
  async getInvoice(@Param('id') id: string, @Res() res: Response) {
    const virementSepa = await this.virementSepaService.findOne(+id);
    if (virementSepa.invoice_key) {
      const fileBuffer = await this.s3Service.getFile(virementSepa.invoice_key);
      res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${virementSepa.invoice_key.split('/').pop()}"`,
      });
      return res.send(fileBuffer);
    }
    return null;
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateVirementSepaDto: UpdateVirementSepaDto,
  ) {
    return this.virementSepaService.update(+id);
  }

  @Patch(':id/reject')
  rejectVirement(
    @Param('id') id: string,
    @Body() body: { rejected_reason: string },
  ) {
    return this.virementSepaService.update(+id, 'REJECTED', body);
  }

  @Patch(':id/accept')
  acceptVirement(@Param('id') id: string) {
    return this.virementSepaService.update(+id, 'ACCEPTED');
  }

  @Patch(':id/paid')
  paidVirement(@Param('id') id: string, @Request() req) {
    return this.virementSepaService.paid(+id, req.user.id);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.virementSepaService.remove(+id);
  }

  @Post('initiate-transfers')
  async initiateTransfers(@Request() req) {
    Logger.debug('Début de initiateTransfers dans le contrôleur');
    Logger.debug(`User role: ${req.user.role}`);

    if (req.user.role !== 'ADMIN') {
      Logger.error("Tentative d'accès non autorisé - rôle non admin");
      throw new BadRequestException(
        'Seul un administrateur peut initier les virements SEPA',
      );
    }

    try {
      const result =
        await this.virementSepaService.initiateValidatedTransfers();
      Logger.debug('Virements initiés avec succès', result);
      return result;
    } catch (error) {
      Logger.error('Erreur dans le contrôleur:', error);
      throw error;
    }
  }
}
