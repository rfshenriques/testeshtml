import { EmailBlockService } from './email-block.service';
import { LinkTokenService } from './link-token.service';
import { loadEnv } from '../../shared/config/config';
import type { JurisdictionPolicy } from '@sitewright/shared-types';

const env = loadEnv(process.env);
const policy: JurisdictionPolicy = {
  countryCode: 'MT', b2bColdEmailAllowed: true, soleTraderTreatedAsIndividual: true, priorConsentRequired: false,
  requiresPhysicalAddressInFooter: true, requiresDataSourceDisclosure: true, maxFollowUps: 3, optOutHonourWindowHours: 24,
  defaultLanguageCode: 'en', defaultCurrency: 'EUR', notes: '',
};

describe('EmailBlockService (spec §1.2 mandatory content)', () => {
  const links = new LinkTokenService(env);
  const svc = new EmailBlockService(env, links);
  const block = svc.build({ leadId: 'lead1', contactId: 'c1', policy, contactSource: 'registry:companies-house', contactSourceUrl: 'https://find-and-update.company-information.service.gov.uk/company/123' });

  it('contains the sender legal identity', () => {
    expect(block.text).toContain('Test Studio Ltd');
    expect(block.text).toContain('C12345');
    expect(block.text).toContain('1 Test Street, Valletta, Malta');
  });
  it('states why they were contacted', () => {
    expect(block.text).toContain('identified your business on Google Maps as operating without a website');
  });
  it('contains the Art.14 notice quoting the source verbatim, purpose, legal basis, privacy link and right to object', () => {
    expect(block.text).toContain('registry:companies-house (https://find-and-update.company-information.service.gov.uk/company/123)');
    expect(block.text).toContain('legitimate interest');
    expect(block.text).toContain('right to object');
    expect(block.text).toContain('https://example.test/privacy');
  });
  it('contains one-click unsubscribe + List-Unsubscribe headers and the takedown link', () => {
    expect(block.headers['List-Unsubscribe']).toContain(block.unsubscribeUrl);
    expect(block.headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
    expect(block.text).toContain(block.unsubscribeUrl);
    expect(block.text).toContain(block.takedownUrl);
    expect(links.verify(block.unsubscribeUrl.split('/u/')[1], 'unsubscribe')).toMatchObject({ leadId: 'lead1', contactId: 'c1' });
    expect(links.verify(block.takedownUrl.split('/takedown/')[1], 'takedown')).toMatchObject({ leadId: 'lead1' });
    expect(links.verify(block.takedownUrl.split('/takedown/')[1], 'unsubscribe')).toBeNull();
  });
  it('passes its own completeness assertion and rejects a tampered block', () => {
    expect(() => EmailBlockService.assertComplete(block, env)).not.toThrow();
    expect(() => EmailBlockService.assertComplete({ ...block, text: block.text.replace('C12345', '') }, env)).toThrow(/missing/);
  });
  it('html escapes and mirrors the text content', () => {
    expect(block.html).toContain('Unsubscribe with one click');
    expect(block.html).toContain('Delete the mockup');
  });
});
