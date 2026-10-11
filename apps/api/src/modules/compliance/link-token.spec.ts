import { LinkTokenService } from './link-token.service';
import { loadEnv } from '../../shared/config/config';

describe('LinkTokenService', () => {
  const svc = new LinkTokenService(loadEnv(process.env));
  it('round-trips and rejects tampering', () => {
    const t = svc.sign({ p: 'takedown', leadId: 'L' });
    expect(svc.verify(t, 'takedown')).toMatchObject({ leadId: 'L' });
    expect(svc.verify(t.slice(0, -2) + 'xx', 'takedown')).toBeNull();
    expect(svc.verify('garbage', 'takedown')).toBeNull();
  });
  it('honours expiry', () => {
    const t = svc.sign({ p: 'track', leadId: 'L', exp: Math.floor(Date.now() / 1000) - 10 });
    expect(svc.verify(t, 'track')).toBeNull();
  });
});
