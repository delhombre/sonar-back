import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { CreateQuoteDto } from './dto/create-quote.dto';
import { UpdateQuoteDto } from './dto/update-quote.dto';
import { Quote } from './entities/quote.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ClientsService } from '../clients/clients.service';
import { ProductService } from '../product/product.service';
import { Product } from '../product/entities/product.entity';
import { ComptePrincipalService } from '../compte_principal/compte_principal.service';
import { CompteGroupeService } from '../compte_groupe/compte_groupe.service';
import { MailService } from '../services/mail.services';
import { UsersService } from '../users/users.service';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ComptePrincipal } from '../compte_principal/entities/compte_principal.entity';
import { CompteGroupe } from '../compte_groupe/entities/compte_groupe.entity';

@Injectable()
export class QuoteService {
  constructor(
    @InjectRepository(Quote)
    private readonly quoteRepository: Repository<Quote>,
    private readonly usersService: UsersService,
    private clientService: ClientsService,
    private productService: ProductService,
    private comptePrincipalService: ComptePrincipalService,
    private compteGroupeService: CompteGroupeService,
    private readonly mailService: MailService,
  ) {}

  private async updateAccountAndGetQuoteNumber(
    accountId: number | undefined,
    accountType: 'main' | 'group',
  ): Promise<{
    account: ComptePrincipal | CompteGroupe;
    quoteNumber: number;
  } | null> {
    if (accountId === undefined) {
      return null;
    }

    const service =
      accountType === 'main'
        ? this.comptePrincipalService
        : this.compteGroupeService;

    const account = await service.findOne(accountId);
    const quoteNumber = account.next_quote_number;

    account.next_quote_number += 1;
    await service.save(account as ComptePrincipal);

    return { account, quoteNumber };
  }

  private calculateTotals(products: Product[]): {
    totalHtva: number;
    totalVat6: number;
    totalVat21: number;
    total: number;
  } {
    const result = products.reduce(
      (acc, product) => {
        acc.totalHtva += product.price_htva;
        if (product.vat === 0.06) {
          acc.totalVat6 += product.tva_amount;
        } else if (product.vat === 0.21) {
          acc.totalVat21 += product.tva_amount;
        }
        return acc;
      },
      {
        totalHtva: 0,
        totalVat6: 0,
        totalVat21: 0,
        total: 0,
      },
    );

    result.total = result.totalHtva + result.totalVat6 + result.totalVat21;
    return result;
  }

  async create(createQuoteDto: CreateQuoteDto, user_id: number) {
    Logger.debug(
      `[QuotesService] Create a quote for user ${user_id} with ${JSON.stringify(createQuoteDto, null, 2)}`,
    );

    // Validation de base
    if (!createQuoteDto.client_id || !createQuoteDto.products_id?.length) {
      throw new BadRequestException('Client and products are required');
    }

    let quote: Quote = this.quoteRepository.create(createQuoteDto);

    // Gestion des comptes
    const mainAccountResult = await this.updateAccountAndGetQuoteNumber(
      createQuoteDto.main_account_id,
      'main',
    );
    if (mainAccountResult) {
      quote.main_account = mainAccountResult.account as ComptePrincipal;
      quote.quote_number = mainAccountResult.quoteNumber;
    }

    const groupAccountResult = await this.updateAccountAndGetQuoteNumber(
      createQuoteDto.group_account_id,
      'group',
    );
    if (groupAccountResult) {
      quote.group_account = groupAccountResult.account as CompteGroupe;
      quote.quote_number = groupAccountResult.quoteNumber;
    }

    // Récupération du client
    quote.client = await this.clientService.findOne(createQuoteDto.client_id);

    // Récupération des produits
    const productPromises = createQuoteDto.products_id.map((id) =>
      this.productService.findOne(id),
    );
    quote.products = await Promise.all(productPromises);

    // Calcul des totaux
    const totals = this.calculateTotals(quote.products);
    quote.price_htva = totals.totalHtva;
    quote.total_vat_6 = totals.totalVat6;
    quote.total_vat_21 = totals.totalVat21;
    quote.total = totals.totalHtva + totals.totalVat6 + totals.totalVat21;
    quote.isVatIncluded = createQuoteDto.isVatIncluded;

    // Gestion de la date de validation
    if (!createQuoteDto.validation_deadline) {
      const currentDate = new Date();
      quote.validation_deadline = new Date(currentDate.getMonth() + 1);
    } else {
      quote.validation_deadline = createQuoteDto.validation_deadline;
    }

    const userConnected = await this.usersService.findOne(user_id);
    quote = await this.quoteRepository.save(quote);

    // Envoi des emails
    await Promise.all([
      this.mailService.sendDevisAcceptationEmail(
        quote.client.email,
        quote.client.name,
        quote.id,
        'CLIENT',
      ),
      this.mailService.sendDevisAcceptationEmail(
        userConnected.email,
        userConnected.firstName,
        quote.id,
        'GROUP',
        userConnected.name,
      ),
    ]);

    return quote;
  }

  findAll() {
    return this.quoteRepository.find({ relations: { products: false } });
  }

  findOne(id: number) {
    Logger.debug('Id', id);
    return this.quoteRepository.findOneBy({ id });
  }

  findOneWithoutRelation(id: number) {
    return this.quoteRepository.findOne({
      where: {
        id,
      },
      relations: {
        products: false,
        client: false,
      },
    });
  }
  async save(quote: Quote) {
    return await this.quoteRepository.save(quote);
  }

  async update(id: string, updateQuoteDto: UpdateQuoteDto, user_id: number) {
    let quote: Quote = await this.findOne(+id);

    quote.quote_date = updateQuoteDto.quote_date;
    quote.service_date = updateQuoteDto.service_date;
    quote.validation_deadline = updateQuoteDto.validation_deadline;

    if (!quote) {
      throw new NotFoundException('Quote not found');
    }

    quote.client = await this.clientService.findOne(updateQuoteDto.client_id);

    let products: Product[] = [];
    for (const productId of updateQuoteDto.products_id) {
      let product = await this.productService.findOne(productId);
      products.push(product);
    }

    quote.products = products;
    quote.isVatIncluded = updateQuoteDto.isVatIncluded;
    quote.price_htva = await this.setTotalHtva(quote.products);
    quote.total_vat_6 = await this.setTotalTva6(quote.products);
    quote.total_vat_21 = await this.setTotalTva21(quote.products);

    quote.total = quote.price_htva + quote.total_vat_21 + quote.total_vat_6;

    if (updateQuoteDto.main_account_id !== undefined) {
      quote.main_account = await this.comptePrincipalService.findOne(
        updateQuoteDto.main_account_id,
      );
    }

    if (updateQuoteDto.group_account_id !== undefined) {
      quote.group_account = await this.compteGroupeService.findOne(
        updateQuoteDto.group_account_id,
      );
    }

    if (!updateQuoteDto.validation_deadline) {
      const currentDate = new Date();
      quote.validation_deadline = new Date(currentDate.getMonth() + 1);
    } else {
      quote.validation_deadline = updateQuoteDto.validation_deadline;
    }

    const userConnected = await this.usersService.findOne(user_id);
    quote.group_acceptance = 'pending';
    quote.order_giver_acceptance = 'pending';

    quote = await this.quoteRepository.save(quote);

    await this.mailService.sendDevisAcceptationEmail(
      quote.client.email,
      quote.client.name,
      quote.id,
      'CLIENT',
    );
    await this.mailService.sendDevisAcceptationEmail(
      userConnected.email,
      userConnected.firstName,
      quote.id,
      'GROUP',
      userConnected.name,
    );

    return quote;
  }

  private async updateQuoteStatus(
    id: number,
    type: 'group' | 'order_giver',
    status: 'accepted' | 'refused',
  ): Promise<Quote> {
    const quote = await this.findOne(id);
    const field = `${type}_acceptance` as
      | 'group_acceptance'
      | 'order_giver_acceptance';
    quote[field] = status;

    if (status === 'accepted') {
      const otherField =
        type === 'group' ? 'order_giver_acceptance' : 'group_acceptance';
      if (quote[otherField] === 'accepted') {
        quote.status = 'accepted';
      }
    } else if (status === 'refused') {
      const otherField =
        type === 'group' ? 'order_giver_acceptance' : 'group_acceptance';
      if (quote[otherField] === 'refused') {
        quote.status = 'refused';
      }
    }

    if (
      status === 'accepted' &&
      quote.validation_deadline.getTime() < new Date().getTime()
    ) {
      quote.validation_deadline = new Date(
        new Date().getTime() + 10 * 24 * 60 * 60 * 1000,
      );
    }

    return await this.quoteRepository.save(quote);
  }

  async updateQuoteGroupAcceptance(id: number) {
    return this.updateQuoteStatus(id, 'group', 'accepted');
  }

  async updateOrderGiverAcceptance(id: number) {
    return this.updateQuoteStatus(id, 'order_giver', 'accepted');
  }

  async updateQuoteGroupRejection(id: number) {
    return this.updateQuoteStatus(id, 'group', 'refused');
  }

  async updateOrderGiverRejection(id: number) {
    return this.updateQuoteStatus(id, 'order_giver', 'refused');
  }

  remove(id: number) {
    return `This action removes a #${id} quote`;
  }

  async setTotalHtva(products: Product[]) {
    let total = 0;
    for (const product of products) {
      total += product.price_htva;
    }

    return total;
  }

  async setTotalTva6(products: Product[]) {
    let total = 0;

    for (const product of products) {
      if (product.vat === 0.06) {
        total += product.tva_amount;
      }
    }

    return total;
  }

  async setTotalTva21(products: Product[]) {
    let total = 0;

    for (const product of products) {
      if (product.vat === 0.21) {
        total += product.tva_amount;
      }
    }

    return total;
  }

  async findQuoteWithoutInvoice() {
    return this.quoteRepository.find({
      where: {
        status: 'accepted',
      },
      relations: {
        client: true,
        group_account: true,
        main_account: true,
      },
    });
  }

  async updateReportDate(id: number, report_date: Date) {
    const quote = await this.findOne(id);
    if (quote.status !== 'accepted') {
      quote.validation_deadline = report_date;
      const quoteUpdated = await this.quoteRepository.save(quote);
      return quoteUpdated ? true : false;
    } else {
      throw new BadRequestException('Quote already accepted');
    }
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async checkQuoteValidationDate() {
    const quotes = await this.findQuoteInPending();

    for (const quote of quotes) {
      if (quote.validation_deadline.getTime() < new Date().getTime()) {
        if (
          quote.group_acceptance !== 'pending' ||
          quote.order_giver_acceptance !== 'pending'
        ) {
          quote.group_acceptance = 'pending';
          quote.order_giver_acceptance = 'pending';
          await this.quoteRepository.save(quote);
        }
      }
    }
  }

  private async sendReminderEmails(
    quotes: Quote[],
    timeThreshold: number | null = null,
  ) {
    for (const quote of quotes) {
      const currentTime = new Date().getTime();
      const deadlineTime = quote.validation_deadline.getTime();

      if (timeThreshold !== null) {
        if (
          quote.status !== 'pending' ||
          deadlineTime >= currentTime + timeThreshold
        ) {
          continue;
        }
      } else if (deadlineTime >= currentTime) {
        continue;
      }

      if (quote.group_acceptance === 'pending') {
        await this.mailService.sendDevisAcceptationEmail(
          quote.client.email,
          quote.client.name,
          quote.id,
          'GROUP',
        );
      }

      if (quote.order_giver_acceptance === 'pending') {
        await this.mailService.sendDevisAcceptationEmail(
          quote.client.email,
          quote.client.name,
          quote.id,
          'CLIENT',
        );
      }
    }
  }

  @Cron(CronExpression.EVERY_DAY_AT_9AM)
  async sendReminderEmailLessThan2Days() {
    const quotes = await this.findQuoteInPending();
    await this.sendReminderEmails(quotes, 2 * 24 * 60 * 60 * 1000);
  }

  @Cron(CronExpression.EVERY_DAY_AT_9AM)
  async sendReminderEmailLessThan1Day() {
    const quotes = await this.findQuoteInPending();
    await this.sendReminderEmails(quotes);
  }

  findQuoteInPending() {
    return this.quoteRepository.find({
      where: {
        status: 'pending',
      },
    });
  }
}
