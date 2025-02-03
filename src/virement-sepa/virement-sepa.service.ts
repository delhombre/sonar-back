import { S3Service } from '@/services/s3/s3.service';
import {
  BadRequestException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CompteGroupeService } from '../compte_groupe/compte_groupe.service';
import { CompteGroupe } from '../compte_groupe/entities/compte_groupe.entity';
import { ComptePrincipalService } from '../compte_principal/compte_principal.service';
import { ComptePrincipal } from '../compte_principal/entities/compte_principal.entity';
import { UserSecondaryAccount } from '../user-secondary-account/entities/user-secondary-account.entity';
import { User } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';
import { CreateVirementSepaDto } from './dto/create-virement-sepa.dto';
import { VirementSepa } from './entities/virement-sepa.entity';
import { MailService } from '../mail/mail.service';
import { PdfService } from '../services/pdf.service';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class VirementSepaService {
  constructor(
    @InjectRepository(VirementSepa)
    private virementSepaRepository: Repository<VirementSepa>,
    private usersService: UsersService,
    private compteGroupService: CompteGroupeService,
    private comptePrincipalService: ComptePrincipalService,
    private s3Service: S3Service,
    private mailService: MailService,
    private pdfService: PdfService,
    private configService: ConfigService,
  ) {}

  async create(
    createVirementSepaDto: CreateVirementSepaDto,
    userId: number,
    params: any,
    invoice?: Express.Multer.File,
  ) {
    const user: User = await this.usersService.findOne(userId);
    let groupAccount: CompteGroupe | undefined = undefined;
    let principalAccount: ComptePrincipal | undefined = undefined;
    let accountFinded: UserSecondaryAccount | undefined;

    if (params.typeOfProjet === 'PRINCIPAL') {
      principalAccount = await this.comptePrincipalService.findOne(params.id);
      if (principalAccount.solde - createVirementSepaDto.amount_htva <= 0) {
        throw new BadRequestException('Solde insuffisant');
      }
    }

    if (params.typeOfProjet === 'GROUP') {
      groupAccount = await this.compteGroupService.findOne(params.id);

      if (user.role !== 'ADMIN') {
        accountFinded = user.userSecondaryAccounts?.find(
          (account) => account.group_account.id === +params.id,
        );

        user.userSecondaryAccounts?.forEach((account) => {
          Logger.debug(
            `Account: ${JSON.stringify(account.id, null, 2)} - ${JSON.stringify(
              account.secondary_account_id,
              null,
              2,
            )}`,
          );
        });

        if (!accountFinded) {
          Logger.error(
            `L'utilisateur ${user.id} n'a pas accès au compte groupe ${params.id}`,
          );
          throw new UnauthorizedException(
            "Vous n'avez pas accès à ce compte groupe",
          );
        }

        if (accountFinded.role_billing !== 'ADMIN') {
          throw new UnauthorizedException(
            "Vous n'avez pas les droits de facturation nécessaires pour effectuer cette opération",
          );
        }
      }

      if (groupAccount.solde - createVirementSepaDto.amount_htva <= 0) {
        throw new BadRequestException('Solde insuffisant');
      }
    }

    if (!groupAccount && !principalAccount) {
      throw new BadRequestException('Aucun compte trouvé');
    }

    if (user.role !== 'ADMIN') {
      if (
        params.typeOfProjet === 'GROUP' &&
        accountFinded.role_billing !== 'ADMIN'
      ) {
        throw new BadRequestException(
          "Vous n'avez pas l'autorisation de faire cela",
        );
      }
    }

    const virementSepa: VirementSepa = this.virementSepaRepository.create(
      createVirementSepaDto,
    );

    if (principalAccount) {
      principalAccount.solde -= virementSepa.amount_htva;
      await this.comptePrincipalService.update(principalAccount);
      virementSepa.comptePrincipal = principalAccount;
      virementSepa.projet_username = principalAccount.username;
    }

    if (groupAccount) {
      groupAccount.solde -= +virementSepa.amount_htva;
      await this.compteGroupService.save(groupAccount);
      virementSepa.compteGroupe = groupAccount;
      virementSepa.projet_username = groupAccount.username;
    }

    if (invoice) {
      try {
        const key = await this.s3Service.uploadFile(
          invoice,
          `virement-sepa/${virementSepa.projet_username}`,
        );
        virementSepa.invoice_key = key;
        virementSepa.invoice_url = this.s3Service.getFileUrl(key);
      } catch (error) {
        Logger.error(error);
        throw new BadRequestException("Erreur lors de l'upload du fichier");
      }
    }

    return this.virementSepaRepository.save(virementSepa);
  }

  async findAll(userId: number) {
    console.log(userId);
    const user = await this.usersService.findOne(userId);

    if (!user) {
      throw new UnauthorizedException('Vous ne pouvez pas faire cela');
    }

    if (user.role !== 'ADMIN') {
      throw new UnauthorizedException('Vous ne pouvez pas faire cela');
    }

    return this.virementSepaRepository
      .createQueryBuilder('virement')
      .leftJoinAndSelect('virement.compteGroupe', 'compteGroupe')
      .leftJoinAndSelect('virement.comptePrincipal', 'comptePrincipal')
      .select(['virement', 'compteGroupe.id', 'comptePrincipal.id'])
      .getMany();
  }

  findOne(id: number) {
    return this.virementSepaRepository
      .createQueryBuilder('virement')
      .leftJoinAndSelect('virement.compteGroupe', 'compteGroupe')
      .leftJoinAndSelect('virement.comptePrincipal', 'comptePrincipal')
      .select(['virement', 'compteGroupe.id', 'comptePrincipal.id'])
      .where('virement.id = :id', { id })
      .getOneOrFail();
  }

  async update(
    id: number,
    status?: 'ACCEPTED' | 'REJECTED',
    body?: { rejected_reason: string },
  ) {
    let virement = await this.findOne(id);
    if (status) {
      virement.status = status;
    }

    if (virement.status === 'REJECTED') {
      if (virement.comptePrincipal !== null) {
        let account = await this.comptePrincipalService.findOne(
          virement.comptePrincipal.id,
        );
        account.solde += +virement.amount_htva;
        await this.comptePrincipalService.update(account);
      }

      if (virement.compteGroupe !== null) {
        let account = await this.compteGroupService.findOne(
          virement.compteGroupe.id,
        );
        account.solde += +virement.amount_htva;
        Logger.debug(JSON.stringify(account, null, 2));
        await this.compteGroupService.save(account);
      }

      if (body) {
        virement.rejected_reason = body.rejected_reason;
      }
    }

    return this.virementSepaRepository.save(virement);
  }

  async paid(id: number, userId: number) {
    let user = await this.usersService.findOne(userId);
    if (user.role !== 'ADMIN') {
      throw new UnauthorizedException('Vous ne pouvez pas faire cela');
    }
    let virement = await this.findOne(id);
    if (virement.status === 'ACCEPTED') {
      virement.status = 'PAID';
    }
    return this.virementSepaRepository.save(virement);
  }

  remove(id: number) {
    return `This action removes a #${id} virementSepa`;
  }

  async initiateValidatedTransfers() {
    try {
      Logger.debug('Début de initiateValidatedTransfers');
      const validatedTransfers = await this.virementSepaRepository
        .createQueryBuilder('virement')
        .where('virement.status = :status', { status: 'ACCEPTED' })
        .getMany();

      Logger.debug(`Nombre de virements trouvés: ${validatedTransfers.length}`);

      const to = this.configService.get('isProd')
        ? 'achat-0700273583@soligere.clouddemat.be'
        : 'ryanfoerster@dimagin.be';

      const cc = this.configService.get('isProd')
        ? 'comptabilite@sonar.management'
        : '';

      Logger.debug(`To: ${to}`);
      Logger.debug(`Cc: ${cc}`);

      // for (const transfer of validatedTransfers) {
      //   try {
      //     Logger.debug(`Traitement du virement ${transfer.id}`);
      //     Logger.debug(`Clé du fichier: ${transfer.invoice_key}`);

      //     // Récupérer le PDF depuis S3
      //     const pdfContent = await this.s3Service.getFile(transfer.invoice_key);
      //     Logger.debug('PDF récupéré depuis S3');

      //     // Générer le PDF complet (récap + facture)
      //     const completePdf = await this.pdfService.generateVirementRecap(
      //       new Date(transfer.created_at).toLocaleDateString(),
      //       transfer.iban,
      //       transfer.amount_total,
      //       transfer.amount_htva,
      //       transfer.amount_tva,
      //       transfer.communication,
      //       transfer.structured_communication,
      //       transfer.projet_username,
      //       pdfContent,
      //       transfer.account_owner,
      //     );
      //     const base64Content = completePdf.toString('base64');
      //     Logger.debug('PDF complet généré');

      //     // Envoyer le mail avec le PDF complet
      //     Logger.debug(`Envoi du mail pour le virement ${transfer.id}`);
      //     Logger.debug(`Account owner: ${transfer.account_owner}`);
      //     Logger.debug(`Project name: ${transfer.projet_username}`);
      //     Logger.debug(`Amount: ${transfer.amount_total}`);

      //     await this.mailService.sendVirementSepaEmail(
      //       to,
      //       transfer.account_owner,
      //       transfer.projet_username,
      //       transfer.amount_total,
      //       base64Content,
      //       transfer.id,
      //       cc,
      //     );

      //     // Mettre à jour le statut en PAID
      //     transfer.status = 'PAID';
      //     await this.virementSepaRepository.save(transfer);

      //     Logger.log(
      //       `Mail envoyé et statut mis à jour pour le virement ${transfer.id}`,
      //     );
      //   } catch (error) {
      //     Logger.error(
      //       `Erreur lors de l'envoi du mail pour le virement ${transfer.id}:`,
      //       error,
      //     );
      //     throw error;
      //   }
      // }

      return {
        success: true,
        message: `${validatedTransfers.length} virements traités`,
        processedTransfers: validatedTransfers.length,
      };
    } catch (error) {
      Logger.error("Erreur lors de l'initiation des virements:", error);
      throw new BadRequestException(
        `Erreur lors de l'initiation des virements SEPA: ${error.message}`,
      );
    }
  }
}
