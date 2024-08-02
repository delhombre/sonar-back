import { Body, Controller, Delete, Get, Param, Patch, Post, Req, Request, UnauthorizedException } from "@nestjs/common";
import { CompteGroupeService } from "./compte_groupe.service";
import { CreateCompteGroupeDto } from "./dto/create-compte_groupe.dto";
import { UpdateCompteGroupeDto } from "./dto/update-compte_groupe.dto";
import { UsersService } from "src/users/users.service";
import { User } from "src/users/entities/user.entity";

@Controller('compte-groupe')
export class CompteGroupeController {
  constructor(private readonly compteGroupeService: CompteGroupeService, private readonly usersService: UsersService) {}

  @Post()
  create(@Body() createCompteGroupeDto: CreateCompteGroupeDto, @Request() request) {
    return this.compteGroupeService.create(createCompteGroupeDto, request.user.id);
  }

  @Get()
  async findAll(@Req() req) {
      return this.compteGroupeService.findAll()
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.compteGroupeService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateCompteGroupeDto: UpdateCompteGroupeDto) {
    return this.compteGroupeService.update(+id, updateCompteGroupeDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.compteGroupeService.remove(+id);
  }
}
