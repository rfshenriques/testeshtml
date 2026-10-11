import { Provider } from '@nestjs/common';
import { ENV, Env } from '../../shared/config/config.module';
import { EMAIL_PROVIDER, EmailProvider, INBOUND_SOURCE, InboundSource } from './email.types';

/** Provider adapter (spec §11.4): SES by default, Smartlead optional, fake in tests. Switching is a config change. */
export const emailProviderProvider: Provider = {
  provide: EMAIL_PROVIDER,
  inject: [ENV],
  useFactory: (env: Env): EmailProvider => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pkg = require('@sitewright/email-adapters');
    switch (env.EMAIL_PROVIDER) {
      case 'ses': return new pkg.SesProvider({ region: env.AWS_SES_REGION, accessKeyId: env.AWS_ACCESS_KEY_ID || undefined, secretAccessKey: env.AWS_SECRET_ACCESS_KEY || undefined });
      case 'smartlead': return new pkg.SmartleadProvider({ apiKey: env.SMARTLEAD_API_KEY });
      default: return new pkg.FakeProvider();
    }
  },
};

export const inboundSourceProvider: Provider = {
  provide: INBOUND_SOURCE,
  inject: [ENV],
  useFactory: (env: Env): InboundSource => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pkg = require('@sitewright/email-adapters');
    if (env.IMAP_HOST && env.IMAP_USER) return new pkg.ImapSource({ host: env.IMAP_HOST, user: env.IMAP_USER, pass: env.IMAP_PASS });
    return new pkg.FakeInboundSource();
  },
};
