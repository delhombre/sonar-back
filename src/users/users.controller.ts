import {
  Body,
  Controller,
  Get,
  Logger, Param,
  Patch,
  Post,
  Query,
  Req,
  Request, Res,
  UnauthorizedException, UploadedFile, UseInterceptors
} from "@nestjs/common";
import { UsersService } from './users.service';
import { UpdateUserDto } from './dtos/update-user.dto';
import { FileInterceptor } from "@nestjs/platform-express";
import { diskStorage } from "multer";
import { extname, join } from "path";
import { Response } from 'express';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}
  private readonly logger = new Logger('UsersController');

  @Get()
  async findConnectedUser(@Request() req) {
    try {
      return await this.usersService.findOne(req.user.id);
    } catch (e) {
      throw new UnauthorizedException(e.message);
    }
  }

  @Get('all')
  async findAll() {
    return this.usersService.findAll();
  }

  @Get('groups')
  async findAllUsersGroup(@Request() req, @Query() params: string) {
    return await this.usersService.findAllUsersGroup(params);
  }

  @Patch()
  async updateAddress(@Request() req, @Body() updateUserDto: UpdateUserDto) {
    return await this.usersService.updateAddress(req.user.id, updateUserDto);
  }

  @UseInterceptors(FileInterceptor('file', {
    storage: diskStorage({
      destination: './uploads', // Dossier où les fichiers seront enregistrés
      filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + extname(file.originalname)); // Renommer le fichier
      }
    })
  }))
  @Post('profile-picture')
  async uploadProfilePicture(@UploadedFile() file: Express.Multer.File, @Request() req) {
    console.log(file);
    const url = `${file.filename}`;
    const user = await this.usersService.findOne(req.id)
    user.profilePicture = url
    return this.usersService.update(user)
  }

  @Get(':imgpath')
  seeUploadedFile(@Param('imgpath') image, @Res() res: Response) {
    const imagePath = join(process.cwd(), 'uploads', image);
    return res.sendFile(imagePath);
  }
}
