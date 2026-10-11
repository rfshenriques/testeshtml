import { Injectable } from '@nestjs/common';
import type { JurisdictionPolicy } from '@sitewright/shared-types';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { AuditService } from './audit.service';

/**
 * Per-country policy table (spec §1.1). Any country with no row is BLOCKED. The operator may edit
 * rows from the console; every edit is audited. A short in-process cache keeps the gate cheap.
 */
@Injectable()
export class JurisdictionService {
  private cache = new Map<string, { value: JurisdictionPolicy | null; at: number }>();
  private readonly ttlMs = 30_000;

  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  async get(countryCode: string): Promise<JurisdictionPolicy | null> {
    const cc = countryCode.toUpperCase();
    const hit = this.cache.get(cc);
    if (hit && Date.now() - hit.at < this.ttlMs) return hit.value;
    const row = await this.prisma.jurisdictionPolicy.findUnique({ where: { countryCode: cc } });
    const value = row ? toPolicy(row) : null;
    this.cache.set(cc, { value, at: Date.now() });
    return value;
  }

  async list() {
    return this.prisma.jurisdictionPolicy.findMany({ orderBy: { countryCode: 'asc' } });
  }

  async upsert(input: JurisdictionPolicy & { confirmedByCounsel?: boolean }, actor: string) {
    if (input.optOutHonourWindowHours > 72) throw new Error('optOutHonourWindowHours must be <= 72');
    const cc = input.countryCode.toUpperCase();
    const before = await this.prisma.jurisdictionPolicy.findUnique({ where: { countryCode: cc } });
    const data = { ...input, countryCode: cc, confirmedByCounsel: input.confirmedByCounsel ?? false };
    const row = await this.prisma.jurisdictionPolicy.upsert({ where: { countryCode: cc }, create: data, update: data });
    this.cache.delete(cc);
    await this.audit.log('jurisdiction.updated', { before, after: row }, { actor, subjectId: cc });
    return row;
  }

  invalidate() {
    this.cache.clear();
  }
}

export function toPolicy(row: {
  countryCode: string; b2bColdEmailAllowed: boolean; soleTraderTreatedAsIndividual: boolean; priorConsentRequired: boolean;
  requiresPhysicalAddressInFooter: boolean; requiresDataSourceDisclosure: boolean; maxFollowUps: number; optOutHonourWindowHours: number;
  defaultLanguageCode: string; defaultCurrency: string; notes: string;
}): JurisdictionPolicy {
  return {
    countryCode: row.countryCode,
    b2bColdEmailAllowed: row.b2bColdEmailAllowed,
    soleTraderTreatedAsIndividual: row.soleTraderTreatedAsIndividual,
    priorConsentRequired: row.priorConsentRequired,
    requiresPhysicalAddressInFooter: row.requiresPhysicalAddressInFooter,
    requiresDataSourceDisclosure: row.requiresDataSourceDisclosure,
    maxFollowUps: row.maxFollowUps,
    optOutHonourWindowHours: row.optOutHonourWindowHours,
    defaultLanguageCode: row.defaultLanguageCode,
    defaultCurrency: row.defaultCurrency,
    notes: row.notes,
  };
}
