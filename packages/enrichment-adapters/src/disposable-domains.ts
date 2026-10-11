/**
 * Built-in list of common disposable / throwaway email domains (spec §6.5 local check).
 * Not exhaustive by design — a provider verification runs before anything reaches send.
 */
export const DISPOSABLE_DOMAINS: ReadonlySet<string> = new Set([
  '0-mail.com', '10minutemail.com', '10minutemail.net', '10minutemail.de', '10minemail.com', '20minutemail.com',
  '33mail.com', 'anonbox.net', 'anonymbox.com', 'armyspy.com', 'binkmail.com', 'bobmail.info', 'bugmenot.com',
  'burnermail.io', 'byom.de', 'chammy.info', 'cuvox.de', 'dayrep.com', 'deadaddress.com', 'despam.it',
  'discard.email', 'discardmail.com', 'discardmail.de', 'dispostable.com', 'disposableemailaddresses.com',
  'dodgeit.com', 'dodgit.com', 'dontreg.com', 'drdrb.net', 'dropmail.me', 'dump-email.info', 'e4ward.com',
  'einrot.com', 'emailfake.com', 'emailondeck.com', 'emailsensei.com', 'emailtemporario.com.br', 'emltmp.com',
  'ethereal.email', 'fakeinbox.com', 'fakemail.net', 'fakemailgenerator.com', 'filzmail.com', 'fleckens.hu',
  'getairmail.com', 'getnada.com', 'gishpuppy.com', 'grr.la', 'guerrillamail.biz', 'guerrillamail.com',
  'guerrillamail.de', 'guerrillamail.info', 'guerrillamail.net', 'guerrillamail.org', 'guerrillamailblock.com',
  'gustr.com', 'harakirimail.com', 'haltospam.com', 'hidemail.de', 'hmamail.com', 'incognitomail.com',
  'incognitomail.org', 'inboxalias.com', 'inboxbear.com', 'inboxkitten.com', 'jetable.org', 'jourrapide.com',
  'kasmail.com', 'klzlk.com', 'koszmail.pl', 'kurzepost.de', 'lroid.com', 'mail-temporaire.fr', 'mail.tm',
  'mail7.io', 'mailcatch.com', 'maildrop.cc', 'maildu.de', 'maileater.com', 'mailexpire.com', 'mailforspam.com',
  'mailinator.com', 'mailinator.net', 'mailinator2.com', 'mailnesia.com', 'mailnull.com', 'mailsac.com',
  'mailtemp.info', 'mailtothis.com', 'mailzilla.com', 'meltmail.com', 'mintemail.com', 'moakt.com', 'mohmal.com',
  'mt2015.com', 'mytemp.email', 'mytrashmail.com', 'nada.email', 'neverbox.com', 'no-spam.ws', 'nomail.xl.cx',
  'nospam.ze.tc', 'nowmymail.com', 'objectmail.com', 'onewaymail.com', 'owlpic.com', 'pokemail.net',
  'proxymail.eu', 'rcpt.at', 'rhyta.com', 'rmqkr.net', 'rtrtr.com', 'safetymail.info', 'sharklasers.com',
  'shieldemail.com', 'sogetthis.com', 'spam4.me', 'spamavert.com', 'spambog.com', 'spambog.de', 'spambox.us',
  'spamex.com', 'spamfree24.org', 'spamgourmet.com', 'spamherelots.com', 'spamhole.com', 'spaml.com',
  'spamspot.com', 'superrito.com', 'tafmail.com', 'teleworm.us', 'temp-mail.io', 'temp-mail.org', 'temp-mail.ru',
  'tempail.com', 'tempemail.com', 'tempemail.net', 'tempinbox.com', 'tempmail.com', 'tempmail.de', 'tempmail.net',
  'tempmailaddress.com', 'tempmailo.com', 'tempr.email', 'temporaryemail.net', 'temporaryinbox.com',
  'thankyou2010.com', 'throwam.com', 'throwawaymail.com', 'tmail.ws', 'tmailinator.com', 'tmpmail.net',
  'tmpmail.org', 'trash-mail.at', 'trash-mail.com', 'trash-mail.de', 'trash2009.com', 'trashmail.at',
  'trashmail.com', 'trashmail.de', 'trashmail.me', 'trashmail.net', 'trashmail.org', 'trashymail.com',
  'tyldd.com', 'uggsrock.com', 'wegwerfmail.de', 'wegwerfmail.net', 'wegwerfmail.org', 'wh4f.org', 'yopmail.com',
  'yopmail.fr', 'yopmail.net', 'zetmail.com', 'zippymail.info', 'zoemail.net',
]);
