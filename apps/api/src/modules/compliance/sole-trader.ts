/**
 * looksLikeSoleTrader heuristic (spec §8). Conservative: when uncertain, say true (block).
 * A business is treated as a sole trader when its name matches a personal-name pattern, carries
 * no corporate suffix, and its review count is below the threshold.
 */
export const SOLE_TRADER_REVIEW_THRESHOLD = 25;

const CORPORATE_SUFFIX = /\b(ltd\.?|limited|gmbh|s\.?r\.?l\.?|s\.?a\.?|s\.?p\.?a\.?|b\.?v\.?|n\.?v\.?|plc|inc\.?|llc|llp|lp|corp\.?|corporation|co\.?|company|group|holdings?|partners(hip)?|associates|s\.?l\.?|ag|kg|oy|ab|as|aps|a\/s|pty|pte|sas|sarl|eurl|ug|e\.?v\.?|cic|cio|oü|sp\.? z\.? o\.? o\.?|d\.?o\.?o\.?|kft|zrt)\b\.?$/i;
const CORPORATE_ANYWHERE = /\b(ltd|limited|gmbh|srl|plc|inc|llc|llp|corp|pty|sarl)\b/i;
const HONORIFIC = /^(dr|doctor|mr|mrs|ms|miss|prof|professor|dott|dott\.ssa|av|avv|me|maître|dra|sr|sra|ing|arch)\.?\s+/i;
const BUSINESS_NOUNS = new Set([
  'plumbing', 'plumber', 'plumbers', 'electrical', 'electrician', 'electricians', 'dental', 'dentist', 'dentistry', 'law', 'legal', 'solicitors', 'solicitor', 'attorney', 'attorneys', 'lawyer', 'lawyers', 'accountants', 'accountant', 'accounting', 'physio', 'physiotherapy', 'physiotherapist', 'salon', 'hair', 'barber', 'barbers', 'beauty', 'nails', 'bakery', 'cafe', 'café', 'restaurant', 'bar', 'kitchen', 'studio', 'clinic', 'surgery', 'practice', 'vet', 'vets', 'veterinary', 'roofing', 'roofer', 'builders', 'builder', 'building', 'construction', 'contractors', 'contractor', 'carpentry', 'joinery', 'painting', 'decorating', 'decorators', 'garage', 'motors', 'autos', 'auto', 'repairs', 'repair', 'services', 'service', 'consulting', 'consultancy', 'design', 'designs', 'photography', 'photographer', 'florist', 'flowers', 'cleaning', 'cleaners', 'tutoring', 'tuition', 'fitness', 'gym', 'yoga', 'pilates', 'massage', 'therapy', 'therapist', 'counselling', 'insurance', 'estates', 'estate', 'properties', 'property', 'realty', 'lettings', 'removals', 'movers', 'moving', 'landscaping', 'gardens', 'gardening', 'tailor', 'tailoring', 'alterations', 'bespoke', 'optician', 'opticians', 'pharmacy', 'chemist', 'locksmith', 'locksmiths', 'tiling', 'plastering', 'heating', 'gas', 'boilers',
  'and', '&', 'the', 'of', 'at', 'by', 'son', 'sons', 'daughter', 'daughters', 'bros', 'brothers', 'family', 'co',
]);
const NAME_TOKEN = /^[A-ZÀ-ÖØ-Þ][a-zà-öø-ÿ'’\-]+$/u;
const INITIAL = /^[A-Z]\.?$/;
/** Common given names (EU/UK/US/NG). A first token in this list is the strongest personal-name signal. */
const FIRST_NAMES = new Set(`
james john robert michael william david richard joseph thomas charles christopher daniel matthew anthony mark donald steven paul andrew joshua kenneth kevin brian george timothy ronald edward jason jeffrey ryan jacob gary nicholas eric jonathan stephen larry justin scott brandon benjamin samuel gregory alexander frank patrick raymond jack dennis jerry tyler aaron jose adam nathan henry douglas zachary peter kyle noah ethan jeremy walter christian keith roger terry austin sean gerald carl harold dylan arthur lawrence jordan jesse bryan billy bruce gabriel joe logan alan juan albert willie elijah wayne randy vincent mason roy ralph bobby russell bradley philip eugene
mary patricia jennifer linda elizabeth barbara susan jessica sarah karen lisa nancy betty sandra margaret ashley kimberly emily donna michelle carol amanda melissa deborah stephanie dorothy rebecca sharon laura cynthia amy kathleen angela shirley brenda emma anna pamela nicole samantha katherine christine helen debra rachel carolyn janet maria catherine heather diane olivia julie joyce victoria ruth virginia lauren kelly christina joan evelyn judith andrea hannah megan cheryl jacqueline martha madison teresa gloria sara janice ann kathryn abigail sophia frances jean alice judy isabella julia grace amber denise danielle marilyn beverly charlotte natalie theresa diana brittany doris kayla alexis lori
mario luigi giuseppe giovanni antonio francesco luca marco andrea alessandro matteo lorenzo stefano roberto paolo carlo angelo salvatore franco bruno pietro giulia francesca chiara federica sara valentina alessia martina elena laura silvia paola roberta simona
hans peter klaus wolfgang jürgen jurgen dieter günter gunter horst manfred uwe rolf stefan andreas thomas michael christian markus florian sebastian tobias ursula monika petra sabine gabriele renate claudia birgit heike anja katrin nicole stefanie julia
jean pierre michel philippe alain jacques bernard andré andre louis claude françois francois nicolas eric patrick christophe laurent olivier pascal frédéric marie nathalie isabelle sylvie catherine françoise martine christine monique valérie sandrine sophie céline julie camille
jan piet kees hendrik willem jaap dirk bas joost sander jeroen mark pieter wim johan anne maria johanna wilhelmina elisabeth cornelia marianne petra ingrid sanne fleur lotte
erik lars anders johan karl per nils sven mikael magnus fredrik olof björn bjorn henrik gustav oskar anna eva maria karin lena kristina ingrid birgitta marie helena sofia emma linnea
seán sean patrick liam conor cian oisín oisin niall declan eoin ciarán ciaran aoife niamh siobhán siobhan ciara saoirse róisín roisin sinéad sinead gráinne grainne
joseph joe charles carmel carmelo paul anthony tony emmanuel emanuel john ġorġ gorg george karmenu salvu ġużeppi guzeppi mario maria doris rita josephine carmen grace mariella therese tereza antoinette anna
chukwu chidi emeka obi ngozi chioma adaeze amaka ifeoma oluwaseun seun tunde ayo femi kemi bola yemi funke tobi dayo bisi adebayo chinedu ikenna uche nnamdi musa ibrahim aisha fatima abubakar yusuf hassan hussein amina zainab
carlos jose josé juan luis miguel javier antonio francisco manuel pedro jorge alberto sergio pablo raúl raul fernando diego alejandro ana maría carmen laura lucía lucia marta sofía elena isabel paula cristina pilar rosa
joão joao pedro tiago miguel luís luis rui nuno bruno ricardo andré ana maria inês ines sofia catarina beatriz carla sandra patrícia
`.split(/\s+/).filter(Boolean));
const COMMON_WORDS = new Set(['blue', 'red', 'green', 'white', 'black', 'golden', 'gold', 'silver', 'royal', 'happy', 'little', 'big', 'grand', 'new', 'old', 'best', 'top', 'quality', 'premier', 'elite', 'modern', 'classic', 'urban', 'city', 'central', 'north', 'south', 'east', 'west', 'sunny', 'fresh', 'first', 'prime', 'star', 'sun', 'moon', 'ocean', 'sea', 'blue', 'lagoon', 'island', 'harbour', 'harbor', 'bay', 'hill', 'valley', 'garden', 'house', 'home', 'corner', 'village', 'town', 'main', 'street', 'square', 'coast', 'mediterranean', 'european', 'local', 'national', 'global', 'international', 'express', 'pro', 'smart', 'perfect', 'total', 'super', 'master', 'crown', 'king', 'queen', 'prince', 'lion', 'eagle', 'phoenix', 'diamond', 'pearl', 'ruby', 'ivy', 'rose', 'olive', 'lemon', 'orange', 'cherry', 'apple', 'honey', 'sugar', 'spice', 'bella', 'bello', 'casa', 'villa', 'la', 'le', 'el', 'il', 'da', 'de', 'di', 'du', 'des', 'van', 'von', 'ta', 'tal', 'ir', 'is']);

export interface SoleTraderVerdict {
  soleTrader: boolean;
  reason: string;
}

export function looksLikeSoleTrader(businessName: string, reviewCount: number | null | undefined): SoleTraderVerdict {
  const name = businessName.trim();
  if (!name) return { soleTrader: true, reason: 'empty name; uncertain -> block' };
  if (CORPORATE_SUFFIX.test(name) || CORPORATE_ANYWHERE.test(name)) {
    return { soleTrader: false, reason: 'corporate suffix present' };
  }
  const reviews = reviewCount ?? 0;
  if (reviews >= SOLE_TRADER_REVIEW_THRESHOLD) {
    return { soleTrader: false, reason: `review count ${reviews} >= ${SOLE_TRADER_REVIEW_THRESHOLD}` };
  }
  const stripped = name.replace(HONORIFIC, '');
  const possessive = /^([A-ZÀ-Þ][\w'’\-]*)('s|’s|s')\s+/u.test(stripped);
  const tokens = stripped.split(/\s+/).filter(Boolean);
  const nameTokens = tokens.filter((t) => !BUSINESS_NOUNS.has(t.toLowerCase().replace(/[’']s$/u, '')));
  const clean = (t: string) => t.replace(/[’']s$/u, '');
  const wellFormed = nameTokens.length >= 1 && nameTokens.length <= 3 && nameTokens.every((t) => NAME_TOKEN.test(clean(t)) || INITIAL.test(t));
  const first = nameTokens[0] ? clean(nameTokens[0]).toLowerCase() : '';
  const firstIsGivenName = FIRST_NAMES.has(first);
  const hasInitial = nameTokens.some((t) => INITIAL.test(t));
  const anyCommonWord = nameTokens.some((t) => COMMON_WORDS.has(clean(t).toLowerCase()));
  if (HONORIFIC.test(name)) return { soleTrader: true, reason: 'honorific prefix (Dr/Mr/...) suggests an individual' };
  if (possessive && (firstIsGivenName || !anyCommonWord)) return { soleTrader: true, reason: 'possessive personal name (e.g. "John\'s Plumbing") with low review count' };
  if (wellFormed && firstIsGivenName) return { soleTrader: true, reason: 'given name + surname pattern with no corporate suffix and low review count' };
  if (wellFormed && hasInitial && nameTokens.length >= 2 && !anyCommonWord) return { soleTrader: true, reason: 'initial + surname pattern with low review count' };
  if (wellFormed && nameTokens.length === 1 && tokens.length === 1 && firstIsGivenName) return { soleTrader: true, reason: 'single given name; uncertain -> block' };
  return { soleTrader: false, reason: 'no personal-name pattern detected' };
}
