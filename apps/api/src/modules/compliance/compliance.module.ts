import { Global, Module } from '@nestjs/common';
import { AuditService } from './audit.service';
import { JurisdictionService } from './jurisdiction.service';
import { SuppressionService } from './suppression.service';
import { GateService } from './gate.service';
import { LinkTokenService } from './link-token.service';
import { EmailBlockService } from './email-block.service';
import { RetentionService } from './retention.service';
import { ComplianceAdminController, UnsubscribeController } from './compliance.controller';

/**
 * Legal and compliance module (spec §1). First-class, global: every module that could send or
 * generate depends on it. Nothing may be sent unless GateService.assertClear passes at dispatch.
 */
@Global()
@Module({
  providers: [AuditService, JurisdictionService, SuppressionService, GateService, LinkTokenService, EmailBlockService, RetentionService],
  controllers: [ComplianceAdminController, UnsubscribeController],
  exports: [AuditService, JurisdictionService, SuppressionService, GateService, LinkTokenService, EmailBlockService, RetentionService],
})
export class ComplianceModule {}
