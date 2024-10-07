import { Module } from '@nestjs/common';
import { InvoiceService } from './invoice.service';
import { InvoiceController } from './invoice.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Invoice } from './entities/invoice.entity';
import { UsersModule } from '../users/users.module';
import { ClientsModule } from '../clients/clients.module';
import { ProductModule } from '../product/product.module';
import { QuoteModule } from '../quote/quote.module';
import { CompteGroupeModule } from '../compte_groupe/compte_groupe.module';
import { ComptePrincipalModule } from '../compte_principal/compte_principal.module';
import { MailService } from 'src/services/mail.services';

@Module({
  controllers: [InvoiceController],
  providers: [InvoiceService, MailService],
  exports: [InvoiceService],
  imports: [
    TypeOrmModule.forFeature([Invoice]),
    UsersModule,
    ClientsModule,
    ProductModule,
    QuoteModule,
    ClientsModule,
    CompteGroupeModule,
    ComptePrincipalModule,
    UsersModule,
  ],
})
export class InvoiceModule {}
