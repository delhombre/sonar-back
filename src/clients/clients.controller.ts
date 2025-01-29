import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Request,
  UseInterceptors,
} from '@nestjs/common';
import { ClientsService } from './clients.service';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';
import { User } from '../users/entities/user.entity';
import { CustomCacheInterceptor } from '../interceptors/cache.interceptor';

@Controller('clients')
export class ClientsController {
  constructor(private readonly clientsService: ClientsService) {}

  @Post()
  create(@Body() createClientDto: CreateClientDto, @Request() request) {
    let user: User = request.user as User;
    return this.clientsService.create(user, createClientDto);
  }

  @Get()
  @UseInterceptors(CustomCacheInterceptor)
  findAll() {
    return this.clientsService.findAll();
  }

  @Get(':id')
  @UseInterceptors(CustomCacheInterceptor)
  findOne(@Param('id') id: string) {
    return this.clientsService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateClientDto: UpdateClientDto) {
    return this.clientsService.update(+id, updateClientDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.clientsService.remove(+id);
  }

  @Get('bce/:vat')
  checkBCE(@Param('vat') vat: number) {
    return this.clientsService.checkBCE(vat);
  }
}
