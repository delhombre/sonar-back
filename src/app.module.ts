import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { TypeOrmModule, TypeOrmModuleOptions } from '@nestjs/typeorm';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';

import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { MulterModule } from '@nestjs/platform-express';
import { ScheduleModule } from '@nestjs/schedule';
import { ServeStaticModule } from '@nestjs/serve-static';
import { TypeOrmModule } from '@nestjs/typeorm';
import { join } from 'path';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { ClientsModule } from './clients/clients.module';
import { CommentsModule } from './comment/comment.module';
import { CompteGroupeModule } from './compte_groupe/compte_groupe.module';
import { ComptePrincipalModule } from './compte_principal/compte_principal.module';
import config from './config/config';
import { EventsModule } from './event/event.module';
import { InvitationsModule } from './invitation/invitation.module';
import { InvoiceModule } from './invoice/invoice.module';
import { MeetModule } from './meet/meet.module';
import { ProductModule } from './product/product.module';
import { QuoteModule } from './quote/quote.module';
import { BceService } from './services/bce/bce.service';
import { TransactionModule } from './transaction/transaction.module';
import { UserSecondaryAccountModule } from './user-secondary-account/user-secondary-account.module';
import { UsersModule } from './users/users.module';
import { VirementSepaModule } from './virement-sepa/virement-sepa.module';

//import * as driveConfig from './config/drive-config.json';

@Module({
  imports: [
    /*GoogleDriveModule.register(
      driveConfig as GoogleDriveConfig,
      '1BE2dfBbQ76djrsp1jRkDlhsu8_jsVQC8',
    ),*/

    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      load: [config],
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
        const config = {
          type: 'postgres',
          // ssl: configService.get('STAGE') === 'prod',
          // extra: {
          //   ssl:
          //     configService.get('STAGE') === 'prod'
          //       ? { rejectUnauthorized: false }
          //       : null,
          // },
          database: configService.get('database.database'),
          host:
            configService.get('STAGE') === 'prod'

              ? configService.get('database.host')
              : 'localhost',
          port: +configService.get('database.port'),
          username: configService.get('database.username'),
          password: configService.get('database.password'),
          url:
            configService.get('STAGE') === 'prod'
              ? configService.get('DATABASE_URL')
              : '',
          entities: [__dirname + '/**/*.entity{.ts,.js}'],
          synchronize: false,
        };

        return config as TypeOrmModuleOptions;
      },


      inject: [ConfigService],
    }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get('jwt.secret'),
      }),
      inject: [ConfigService],
      global: true,
    }),
    MulterModule.register({
      dest: './uploads',
    }),
    ScheduleModule.forRoot(),
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'uploads'), // Indiquez le chemin vers le dossier des fichiers uploadés
      serveRoot: '/uploads', // Le préfixe de l'URL pour accéder aux fichiers
    }),
    AuthModule,
    UsersModule,
    ComptePrincipalModule,
    CompteGroupeModule,
    UserSecondaryAccountModule,
    ProductModule,
    InvoiceModule,
    ClientsModule,
    QuoteModule,
    TransactionModule,
    EventsModule,
    InvitationsModule,
    CommentsModule,
    VirementSepaModule,
    MeetModule,
    HttpModule,
  ],
  controllers: [AppController],
  providers: [AppService, BceService],
})
export class AppModule {}
