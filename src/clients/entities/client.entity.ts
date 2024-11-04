import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Invoice } from '../../invoice/entities/invoice.entity';
import { Quote } from '../../quote/entities/quote.entity';

@Entity()
export class Client {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column()
  email: string;

  @Column()
  phone: string;

  @Column()
  street: string;

  @Column()
  number: string;

  @Column()
  city: string;

  @Column()
  country: string;

  @Column()
  postalCode: string;

  @Column({ nullable: true })
  company_number: string;

  @Column({ nullable: true })
  company_vat_number: string;

  @Column({ nullable: true })
  national_number: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn({ nullable: true })
  updatedAt?: Date;

  @ManyToOne((type) => User, (user) => user.clients)
  user: User;

  @OneToMany(() => Quote, (quote) => quote.client, { cascade: true })
  quote: Quote;

  @OneToMany(() => Invoice, (invoice) => invoice.client, { cascade: true })
  invoice: Invoice;
}
