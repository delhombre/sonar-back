import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { TypeOrmModule } from "@nestjs/typeorm";
import config from "../ormconfig";
import { AuthModule } from "./auth/auth.module";
import { UsersModule } from "./users/users.module";
import { ConfigModule } from "@nestjs/config";
import { ComptePrincipalModule } from './compte_principal/compte_principal.module';
import { CompteGroupeModule } from './compte_groupe/compte_groupe.module';
import { DevtoolsModule } from '@nestjs/devtools-integration';
import { UserSecondaryAccountModule } from './user-secondary-account/user-secondary-account.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRoot(config),
    AuthModule,
    UsersModule,
    ComptePrincipalModule,
    CompteGroupeModule,
    UserSecondaryAccountModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
