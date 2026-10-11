import { ImapFlow } from 'imapflow';
import { parseRawEmail } from './inbound';
import type { InboundMessage, InboundSource } from './types';

export interface ImapSourceOptions {
  host: string;
  port?: number;
  secure?: boolean;
  user: string;
  pass: string;
  /** Default 'INBOX'. */
  mailbox?: string;
}

/**
 * IMAP poller (spec §11.7: poll every 2 minutes). Each `poll(sinceUid)` opens a connection,
 * fetches messages with UID > sinceUid from the mailbox, parses them with mailparser and logs out.
 * Messages are never flagged or deleted; the caller persists `lastUid` to resume.
 */
export class ImapSource implements InboundSource {
  readonly name = 'imap';
  private readonly opts: Required<Pick<ImapSourceOptions, 'host' | 'port' | 'secure' | 'user' | 'pass' | 'mailbox'>>;

  constructor(opts: ImapSourceOptions) {
    this.opts = {
      host: opts.host,
      port: opts.port ?? 993,
      secure: opts.secure ?? true,
      user: opts.user,
      pass: opts.pass,
      mailbox: opts.mailbox ?? 'INBOX',
    };
  }

  /** Factory kept separate so tests can stub the client. */
  protected createClient(): ImapFlow {
    return new ImapFlow({
      host: this.opts.host,
      port: this.opts.port,
      secure: this.opts.secure,
      auth: { user: this.opts.user, pass: this.opts.pass },
      logger: false,
    });
  }

  async poll(sinceUid = 0): Promise<{ messages: InboundMessage[]; lastUid: number }> {
    const client = this.createClient();
    const messages: InboundMessage[] = [];
    let lastUid = sinceUid;

    await client.connect();
    try {
      const lock = await client.getMailboxLock(this.opts.mailbox);
      try {
        const mailbox = client.mailbox;
        const uidNext = mailbox && typeof mailbox === 'object' ? mailbox.uidNext : undefined;
        // Nothing new: avoid the `n:*` quirk where a range above the highest UID still returns the last message.
        if (typeof uidNext === 'number' && sinceUid >= uidNext - 1) return { messages, lastUid };

        const range = `${sinceUid + 1}:*`;
        for await (const msg of client.fetch(range, { uid: true, source: true }, { uid: true })) {
          if (msg.uid <= sinceUid || !msg.source) continue;
          try {
            messages.push(await parseRawEmail(msg.source));
          } catch {
            // Unparseable message: skip it but still advance the cursor so we do not loop on it forever.
          }
          if (msg.uid > lastUid) lastUid = msg.uid;
        }
      } finally {
        lock.release();
      }
    } finally {
      try {
        await client.logout();
      } catch {
        client.close();
      }
    }
    return { messages, lastUid };
  }
}
