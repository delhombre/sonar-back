// src/invitations/invitations.controller.ts
import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Req,
} from '@nestjs/common';
import { InvitationsService } from './invitation.service';
import { CreateInvitationDto } from './dto/create-invitation.dto';
import { UpdateInvitationDto } from './dto/update-invitation.dto';
import { Invitation } from './entities/invitation.entity';

@Controller('invitations')
export class InvitationsController {
  constructor(private readonly invitationsService: InvitationsService) {}

  @Post()
  create(
    @Body() createInvitationDto: CreateInvitationDto,
  ): Promise<Invitation> {
    return this.invitationsService.create(createInvitationDto);
  }

  // @Get()
  // findAll(@Req() req: any): Promise<Invitation[]> {
  //   return this.invitationsService.findByUserId(+req.user.id);
  // }

  @Get(':id')
  findOne(@Param('id') id: number): Promise<Invitation> {
    return this.invitationsService.findOne(id);
  }

  @Get('user/all')
  findByUserId(@Req() req: any): Promise<Invitation[]> {
    return this.invitationsService.findByUserId(+req.user.id);
  }

  @Patch(':id')
  update(
    @Param('id') id: number,
    @Body() updateInvitationDto: UpdateInvitationDto,
  ): Promise<Invitation> {
    return this.invitationsService.update(id, updateInvitationDto);
  }

  @Delete(':id')
  remove(@Param('id') id: number): Promise<void> {
    return this.invitationsService.remove(id);
  }
}
