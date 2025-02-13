import { Product } from '@/product/entities/product.entity';
import { ProductService } from '@/product/product.service';
import {
  BadRequestException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { DataSource, Repository } from 'typeorm';
import { ClientsService } from '../clients/clients.service';
import { CompteGroupeService } from '../compte_groupe/compte_groupe.service';
import { ComptePrincipalService } from '../compte_principal/compte_principal.service';
import { Quote } from '../quote/entities/quote.entity';
import { QuoteService } from '../quote/quote.service';
import { MailService } from '../services/mail.services';
import { User } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';
import { CreateCreditNoteDto } from './dto/create-invoice.dto';
import { UpdateInvoiceDto } from './dto/update-invoice.dto';
import { Invoice } from './entities/invoice.entity';
import { CompteGroupe } from '@/compte_groupe/entities/compte_groupe.entity';
import { ComptePrincipal } from '@/compte_principal/entities/compte_principal.entity';

@Injectable()
export class InvoiceService {
  constructor(
    @InjectRepository(Invoice)
    private readonly _invoiceRepository: Repository<Invoice>,
    private quoteService: QuoteService,
    private clientService: ClientsService,
    private comptePrincipalService: ComptePrincipalService,
    private compteGroupeService: CompteGroupeService,
    private dataSource: DataSource,
    private mailService: MailService,
    private usersService: UsersService,
    private productService: ProductService,
  ) {}

  async create(
    quoteObject: any,
    user: User,
    params: { account_id: number; type: 'PRINCIPAL' | 'GROUP' },
  ) {
    let quoteFromDB = await this.quoteService.findOne(quoteObject.id);
    let account;
    let userFromDB = await this.usersService.findOne(user.id);

    if (!userFromDB) {
      throw new BadRequestException('Aucun utilisateur trouvé');
    }

    if (!quoteFromDB) {
      throw new BadRequestException('Aucun devis trouvé');
    }

    if (quoteFromDB.invoice !== null) {
      throw new BadRequestException('Une facture existe déja');
    }

    let invoice = await this.createInvoiceFromQuote(quoteFromDB);

    if (params.type === 'PRINCIPAL') {
      account = await this.comptePrincipalService.findOne(params.account_id);
      invoice.main_account = account;
      invoice.invoice_number = account.next_invoice_number;

      // Incrémenter et mettre à jour le prochain numéro de facture
      account.next_invoice_number += 1;
      await this.comptePrincipalService.save(account);
    }

    if (params.type === 'GROUP') {
      account = await this.compteGroupeService.findOne(params.account_id);
      invoice.group_account = account;
      invoice.invoice_number = account.next_invoice_number;

      // Incrémenter et mettre à jour le prochain numéro de facture
      account.next_invoice_number += 1;
      await this.compteGroupeService.save(account);
    }

    const invoiceCreated = await this._invoiceRepository.save(invoice);

    invoiceCreated.quote = quoteFromDB;

    invoiceCreated.client = await this.clientService.findOne(
      quoteFromDB.client.id,
    );

    if (params.type === 'PRINCIPAL') {
      account = await this.comptePrincipalService.findOne(params.account_id);
      invoiceCreated.main_account = account;
    }

    if (params.type === 'GROUP') {
      account = await this.compteGroupeService.findOne(params.account_id);
      invoiceCreated.group_account = account;
    }

    invoiceCreated.quote = quoteFromDB;
    if (invoiceCreated.type !== 'credit_note') {
      invoiceCreated.products = quoteFromDB.products;
    }
    await this._invoiceRepository.save(invoiceCreated);
    quoteFromDB.status = 'invoiced';
    quoteFromDB.invoice = invoiceCreated;
    await this.quoteService.save(quoteFromDB);
    const pdf = this.generateInvoicePDF(quoteFromDB, userFromDB);
    this.mailService.sendInvoiceEmail(quoteFromDB, userFromDB, pdf);
    return await this._invoiceRepository.findOneBy({ id: invoiceCreated.id });
  }

  async save(invoice: Invoice) {
    return await this._invoiceRepository.save(invoice);
  }

  async createInvoiceFromQuote(quote: Quote) {
    const currentDate = new Date();

    const invoice = new Invoice();
    invoice.invoice_date = currentDate;
    invoice.service_date = quote.service_date;

    // Calculer la date limite de paiement
    const paymentDeadline = new Date(currentDate);
    paymentDeadline.setDate(currentDate.getDate() + quote.payment_deadline);
    invoice.payment_deadline = paymentDeadline;
    invoice.validation_deadline = quote.validation_deadline;

    invoice.price_htva = quote.price_htva;
    invoice.total = quote.total;
    invoice.total_vat_21 = quote.total_vat_21;
    invoice.total_vat_6 = quote.total_vat_6;
    invoice.status = 'payment_pending';

    return invoice;
  }

  generateInvoicePDF(quote: Quote, user: User) {
    const doc = new jsPDF();
    const invoice = quote.invoice;

    // Ajouter le logo
    // const logoUrl = '/assets/images/Groupe-30.png';
    // doc.addImage(logoUrl, 'PNG', 10, 10, 50, 20);

    // Informations sur l'utilisateur (alignées à gauche)
    doc.setFontSize(12);
    doc.text(`Créé par: ${user.firstName} ${user.name}`, 10, 40);
    doc.text(`Email: ${user.email}`, 10, 50);
    doc.text(`Téléphone: ${user.telephone}`, 10, 60);

    // Informations sur le client (alignées à droite)
    const clientInfo = [
      `Client: ${quote.client.name}`,
      `Email: ${quote.client.email}`,
      `Téléphone: ${quote.client.phone}`,
      `Adresse: ${quote.client.street} ${quote.client.number}, ${quote.client.city}, ${quote.client.country}, ${quote.client.postalCode}`,
    ];

    const pageWidth = doc.internal.pageSize.getWidth();
    clientInfo.forEach((line, index) => {
      const textWidth = doc.getTextWidth(line);
      doc.text(line, pageWidth - textWidth - 10, 40 + index * 10);
    });

    // Tableau pour les informations sur le devis
    const invoiceData = [
      ['Date de la facture', invoice.invoice_date.toLocaleString()],
      ['Date de service', invoice.service_date.toLocaleString()],
      ['Total HTVA', `${invoice.price_htva.toFixed(2)} €`],
      ['Total TVA 6%', `${invoice.total_vat_6.toFixed(2)} €`],
      ['Total TVA 21%', `${invoice.total_vat_21.toFixed(2)} €`],
      ['Total TTC', `${invoice.total.toFixed(2)} €`],
    ];

    let yPosition = 100;
    autoTable(doc, {
      head: [['Information', 'Valeur']],
      body: invoiceData,
      startY: yPosition,
      styles: { fontSize: 10 },
      headStyles: { fillColor: [100, 100, 100] },
    });

    // Mettre à jour la position Y après le premier tableau
    yPosition = (doc as any).lastAutoTable.finalY + 10;

    // Tableau pour les détails des produits
    const productData = quote.products.map((product) => [
      product.description,
      `Quantité: ${product.quantity}`,
      `Prix: ${product.price.toFixed(2)} €`,
    ]);

    autoTable(doc, {
      head: [['Produit', 'Quantité', 'Prix']],
      body: productData,
      startY: yPosition,
      styles: { fontSize: 10 },
      headStyles: { fillColor: [100, 100, 100] },
    });

    return doc.output('arraybuffer');
  }

  async findAll(user_id: number) {
    const user = await this.usersService.findOne(user_id);
    if (user.role !== 'ADMIN') {
      throw new UnauthorizedException(
        "Vous n'êtes pas autorisé à accéder à cette ressource",
      );
    }
    return this._invoiceRepository.find({});
  }

  async findOne(id: number) {
    return await this._invoiceRepository.findOneBy({ id });
  }

  async update(id: number, updateInvoiceDto: UpdateInvoiceDto) {
    return await this._invoiceRepository.update(id, updateInvoiceDto);
  }

  async remove(id: number) {
    return await this._invoiceRepository.delete(id);
  }

  @Cron(CronExpression.EVERY_10_SECONDS)
  async createFacture() {
    const currentDate = new Date();

    const quoteWithoutInvoice =
      await this.quoteService.findQuoteWithoutInvoice();

    const currentQuotes: Quote[] = [];

    for (const quote of quoteWithoutInvoice) {
      const serviceDate = new Date(quote.service_date);
      const dateUnJourPlus = new Date(
        serviceDate.getTime() + 24 * 60 * 60 * 1000,
      );
      const sameDate =
        currentDate.getFullYear() === dateUnJourPlus.getFullYear() &&
        currentDate.getMonth() === dateUnJourPlus.getMonth() &&
        currentDate.getDate() === dateUnJourPlus.getDate();
      if (
        sameDate &&
        quote.group_acceptance === 'accepted' &&
        quote.order_giver_acceptance === 'accepted'
      ) {
        currentQuotes.push(quote);
      }
    }

    if (currentQuotes.length > 0) {
      for (const quote of currentQuotes) {
        const invoice = new Invoice();
        invoice.invoice_date = currentDate;
        invoice.service_date = quote.service_date;
        currentDate.setDate(currentDate.getDate() + quote.payment_deadline);
        invoice.payment_deadline = currentDate;
        invoice.price_htva = quote.price_htva;
        invoice.total = quote.total;
        invoice.total_vat_21 = quote.total_vat_21;
        invoice.total_vat_6 = quote.total_vat_6;
        invoice.validation_deadline = quote.validation_deadline;
        invoice.status = 'pending';

        const invoiceCreated = await this._invoiceRepository.save(invoice);
        invoiceCreated.quote = await this.quoteService.findOne(quote.id);
        invoiceCreated.client = await this.clientService.findOne(
          quote.client.id,
        );
        if (quote.main_account) {
          invoiceCreated.main_account =
            await this.comptePrincipalService.findOne(quote.main_account.id);
        }

        if (quote.group_account) {
          invoiceCreated.group_account = await this.compteGroupeService.findOne(
            quote.group_account.id,
          );
        }
        await this._invoiceRepository.update(invoiceCreated.id, invoiceCreated);
        quote.status = 'invoiced';
        quote.invoice = invoiceCreated;
        await this.quoteService.save(quote);
      }
    }
  }

  async createCreditNote(
    createCreditNoteDto: CreateCreditNoteDto,
    params: { account_id: number; type: 'PRINCIPAL' | 'GROUP' },
  ): Promise<Invoice> {
    return await this.dataSource.transaction(async (manager) => {
      const invoice = await manager.findOneBy(Invoice, {
        id: createCreditNoteDto.linkedInvoiceId,
      });

      if (invoice.linkedInvoiceId) {
        throw new Error('Invoice already has a linked credit note');
      }

      const products = [];
      for (const productId of createCreditNoteDto.products_ids) {
        const product = await this.productService.findOne(productId);
        if (product.quote === null) {
          products.push(product); // Si le produit n'est pas lié à un devis, on l'ajoute à la note de crédit car il n'a pas été facturé
        }
      }

      // Récupérer le compte principal par défaut
      let account: ComptePrincipal | CompteGroupe;
      if (params.type === 'PRINCIPAL') {
        account = await this.comptePrincipalService.findOne(params.account_id);
      } else {
        account = await this.compteGroupeService.findOne(params.account_id);
      }
      if (!account && params.type === 'PRINCIPAL') {
        throw new Error('Aucun compte principal trouvé');
      }
      if (!account && params.type === 'GROUP') {
        throw new Error('Aucun compte groupe trouvé');
      }

      if (!invoice) {
        throw new Error('Invoice not found'); // Vérifie si la facture existe
      }

      if (createCreditNoteDto.creditNoteAmount > invoice.total) {
        throw new Error('Credit note amount exceeds invoice total amount'); // Vérifie que le montant de la note de crédit ne dépasse pas le total de la facture
      }
      // Crée la note de crédit en utilisant les données fournies
      let { id, ...invoiceWithoutId } = invoice;
      invoiceWithoutId.products = products;
      const creditNote = manager.create(Invoice, {
        ...invoiceWithoutId,
        ...createCreditNoteDto,
        products: products,
        type: 'credit_note',
        invoice_number: null, // On réinitialise le numéro de facture
      });
      if (params.type === 'PRINCIPAL') {
        creditNote.main_account = account as ComptePrincipal;
        creditNote.invoice_number = account.next_invoice_number;
        account.next_invoice_number += 1;
        await manager.save(account);
      } else {
        creditNote.group_account = account as CompteGroupe;
        creditNote.invoice_number = account.next_invoice_number;
        account.next_invoice_number += 1;
        await manager.save(account);
      }

      // Calculer les totaux en fonction des produits
      const totalHT = creditNote.products.reduce(
        (sum: number, product: any) => sum + product.price_htva,
        0,
      );
      const totalVAT6 = creditNote.products
        .filter((product: any) => product.vat === 0.06)
        .reduce((sum: number, product: any) => sum + product.tva_amount, 0);
      const totalVAT21 = creditNote.products
        .filter((product: any) => product.vat === 0.21)
        .reduce((sum: number, product: any) => sum + product.tva_amount, 0);
      const totalTTC = creditNote.products.reduce(
        (sum: number, product: any) => sum + product.total,
        0,
      );

      // Calculer le montant de la note de crédit en prenant en compte que les montants négatifs
      const totalNegative = creditNote.products.reduce(
        (sum: number, product: any) =>
          sum + (product.total < 0 ? product.total : 0),
        0,
      );

      creditNote.creditNoteAmount = totalNegative;

      const creditNoteSaved = await manager.save(creditNote);
      invoice.linkedInvoiceId = creditNoteSaved.id;
      await manager.save(invoice);
      return creditNoteSaved;
      // return null;
    });
    // Récupère la facture liée
    // Sauvegarde la note de crédit dans la base de données
  }

  async createCreditNoteWithoutInvoice(
    createCreditNoteDto: any,
    account_id: number,
    type: 'PRINCIPAL' | 'GROUP',
  ): Promise<Invoice> {
    return await this.dataSource.transaction(async (manager) => {
      // Récupérer les produits lié a la note de crédit

      const products = [];

      for (const productId of createCreditNoteDto.products_id) {
        const product = await this.productService.findOne(productId);
        products.push(product);
      }

      createCreditNoteDto.products = products;

      // Récupérer le compte principal par défaut
      let account: ComptePrincipal | CompteGroupe;
      if (type === 'PRINCIPAL') {
        account = await this.comptePrincipalService.findOne(account_id);
      } else {
        account = await this.compteGroupeService.findOne(account_id);
      }
      if (!account && type === 'PRINCIPAL') {
        throw new Error('Aucun compte principal trouvé');
      }
      if (!account && type === 'GROUP') {
        throw new Error('Aucun compte groupe trouvé');
      }

      createCreditNoteDto.status = 'paid';

      // Créer la note de crédit
      let creditNote: Invoice = manager.create(Invoice, {
        client_id: createCreditNoteDto.client_id,
        invoice_date: new Date(), // Date actuelle pour la date de facture
        credit_note_date: createCreditNoteDto.credit_note_date,
        service_date: createCreditNoteDto.service_date,
        status: createCreditNoteDto.status,
        type: 'credit_note',
        payment_deadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // +30 jours par défaut
        invoice_number: account.next_invoice_number, // Utiliser le prochain numéro de facture
      });

      // Associer le client
      creditNote.client = await this.clientService.findOne(
        createCreditNoteDto.client_id,
      );

      // Associer le compte principal
      if (type === 'PRINCIPAL') {
        creditNote.main_account = account as ComptePrincipal;
      } else {
        creditNote.group_account = account as CompteGroupe;
      }

      // Associer les produits
      creditNote.products = products;

      // Calculer les totaux
      creditNote.price_htva = await this.setTotalHtva(creditNote.products);
      creditNote.total_vat_6 = await this.setTotalTva6(creditNote.products);
      creditNote.total_vat_21 = await this.setTotalTva21(creditNote.products);
      creditNote.total =
        creditNote.price_htva +
        creditNote.total_vat_6 +
        creditNote.total_vat_21;

      // Incrémenter le numéro de facture du compte principal
      account.next_invoice_number += 1;
      await manager.save(account);

      // Sauvegarder la note de crédit
      return await manager.save(Invoice, creditNote);
    });
  }

  findCreditNoteByInvoiceId(creditNoteId: number) {
    return this._invoiceRepository.findOne({
      where: {
        id: creditNoteId,
        type: 'credit_note',
      },
      relations: ['products'],
    });
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
}
