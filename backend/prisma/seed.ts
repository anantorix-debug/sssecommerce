/**
 * Demo data for development and review.
 *   npm run db:seed            fills an empty database
 *   npm run db:seed -- --fresh  clears this project's tables first (development only)
 *
 * Photos: Unsplash (Unsplash License). 3D models: Khronos glTF Sample Assets,
 * "GlamVelvetSofa" and "SheenChair" by Wayfair (CC BY 4.0).
 * Files are downloaded once into storage/.seed-cache and processed like real uploads.
 */
import { PrismaClient, Prisma } from '@prisma/client';
import { hash } from '@node-rs/argon2';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import sharp from 'sharp';
import { SYSTEM_ROLES } from '../src/common/permissions';

const envFile = resolve(process.cwd(), '.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);

const prisma = new PrismaClient();
const MEDIA_ROOT = resolve(process.cwd(), process.env.MEDIA_ROOT ?? './storage');
const CACHE = join(MEDIA_ROOT, '.seed-cache');
const rs = (rupees: number) => Math.round(rupees * 100);
const ARGON = { memoryCost: 19456, timeCost: 2, parallelism: 1 };

// ───────────────────────── media ─────────────────────────

const unsplash = (id: string) => `https://images.unsplash.com/photo-${id}?w=2400&q=82&fm=jpg&fit=max`;

async function download(url: string, file: string) {
  const path = join(CACHE, file);
  if (existsSync(path)) return readFile(path);
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, buf);
      return buf;
    } catch (err) {
      if (attempt === 3) throw new Error(`Download failed for ${url}: ${(err as Error).message}`);
      await new Promise((r) => setTimeout(r, 1500 * attempt));
    }
  }
  throw new Error('unreachable');
}

const imageCache = new Map<string, { key: string; id: string }>();

/** Downloads (once), normalises and registers an image exactly like an admin upload. */
async function image(photoId: string, alt: string, slug: string) {
  const cached = imageCache.get(photoId);
  if (cached) return cached;
  const raw = await download(unsplash(photoId), `${photoId}.jpg`);
  const out = await sharp(raw).rotate().resize({ width: 2400, height: 2400, fit: 'inside', withoutEnlargement: true }).toColourspace('srgb').jpeg({ quality: 84, mozjpeg: true }).toBuffer({ resolveWithObject: true });
  const key = `seed/${slug}-${photoId.slice(-6)}.jpg`;
  const path = join(MEDIA_ROOT, 'public', key);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, out.data);
  const tiny = await sharp(out.data).resize(24).blur(1.2).webp({ quality: 40 }).toBuffer();
  const asset = await prisma.mediaAsset.create({
    data: {
      kind: 'IMAGE',
      storageKey: key,
      mimeType: 'image/jpeg',
      width: out.info.width,
      height: out.info.height,
      bytes: out.data.length,
      altText: alt,
      placeholder: `data:image/webp;base64,${tiny.toString('base64')}`,
    },
  });
  const result = { key, id: asset.id };
  imageCache.set(photoId, result);
  return result;
}

async function model(name: string) {
  const raw = await download(`https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/${name}/glTF-Binary/${name}.glb`, `${name}.glb`);
  const key = `seed/${name.toLowerCase()}.glb`;
  const path = join(MEDIA_ROOT, 'public', key);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, raw);
  const jsonLength = raw.readUInt32LE(12);
  const json = JSON.parse(raw.subarray(20, 20 + jsonLength).toString('utf8'));
  const variants: string[] = json.extensions?.KHR_materials_variants?.variants?.map((v: { name: string }) => v.name) ?? [];
  const asset = await prisma.mediaAsset.create({
    data: { kind: 'MODEL_3D', storageKey: key, mimeType: 'model/gltf-binary', bytes: raw.length, altText: `${name} 3D model` },
  });
  return { id: asset.id, key, variants };
}

// ───────────────────────── catalogue definition ─────────────────────────

type Finish = { name: string; hex: string };
type Size = { label: string; delta: number; dims: [number, number, number]; weight: number };
interface ProductDef {
  name: string;
  category: string;
  rooms: string[];
  collections?: string[];
  tagline: string;
  description: string;
  materials: string;
  care: string;
  photos: [string, string];
  price: number;
  mrp?: number;
  finishes: Finish[];
  sizes?: Size[];
  attributes: { material: string; seating?: string; style: string };
  installation?: boolean;
  assembly?: boolean;
  lead?: number;
  badge?: string;
  featured?: boolean;
  warranty?: number;
  gst?: number;
  hsn?: string;
  returnable?: boolean;
  model?: 'GlamVelvetSofa' | 'SheenChair';
}

const WOOD: Record<string, Finish> = {
  teak: { name: 'Natural Teak', hex: '#B07A47' },
  walnut: { name: 'Walnut', hex: '#5A3B26' },
  oak: { name: 'Smoked Oak', hex: '#7A6450' },
  ebony: { name: 'Ebony', hex: '#2A2522' },
  ash: { name: 'Bleached Ash', hex: '#D9CBB4' },
};
const FABRIC: Record<string, Finish> = {
  linen: { name: 'Ivory Linen', hex: '#E8E1D3' },
  moss: { name: 'Moss Velvet', hex: '#4E5B3A' },
  rust: { name: 'Rust Boucle', hex: '#A2532F' },
  indigo: { name: 'Indigo Cotton', hex: '#2E3B5C' },
  sand: { name: 'Sand Weave', hex: '#CDB895' },
  tan: { name: 'Saddle Leather', hex: '#8B5A34' },
  cognac: { name: 'Cognac Leather', hex: '#7A3E22' },
};

const sofaSizes: Size[] = [
  { label: '2 Seater', delta: -18000, dims: [168, 92, 84], weight: 48 },
  { label: '3 Seater', delta: 0, dims: [216, 92, 84], weight: 62 },
];
const bedSizes: Size[] = [
  { label: 'Queen', delta: 0, dims: [214, 166, 104], weight: 88 },
  { label: 'King', delta: 12000, dims: [214, 196, 104], weight: 102 },
];
const diningSizes: Size[] = [
  { label: '4 Seater', delta: 0, dims: [140, 90, 76], weight: 46 },
  { label: '6 Seater', delta: 16000, dims: [180, 95, 76], weight: 62 },
];

const PRODUCTS: ProductDef[] = [
  {
    name: 'Noor Velvet Sofa', category: 'three-seater-sofas', rooms: ['living-room'], collections: ['monsoon-velvet'],
    tagline: 'A deep-seated velvet sofa with a softly tufted back', featured: true, badge: 'View in 3D',
    description: 'Noor is built for long evenings. A kiln-dried hardwood frame carries pocket-spring seats wrapped in high-resilience foam and a feather-blend topper, so the cushions hold their shape for years. The velvet is a dense, rub-tested cotton blend that catches the light as you move. Turn the model in 3D to see the tufting and the tapered brass-capped legs.',
    materials: 'Kiln-dried hardwood frame, pocket springs, HR foam with feather-blend topper, cotton-blend velvet, brass-capped legs',
    care: 'Vacuum weekly with a soft brush. Blot spills at once with a dry cloth. Professional dry clean only. Keep out of direct afternoon sun to protect the pile.',
    photos: ['1590251024078-8a6d9f90b02d', '1484101403633-562f891dc89a'], price: 89900, mrp: 104900,
    finishes: [], model: 'GlamVelvetSofa', attributes: { material: 'Velvet', seating: '3 seats', style: 'Contemporary' }, installation: true, lead: 0, warranty: 36,
  },
  {
    name: 'Sahyadri Chesterfield Sofa', category: 'three-seater-sofas', rooms: ['living-room', 'study'], collections: ['teak-and-linen'],
    tagline: 'Hand-buttoned leather, rolled arms, made to age well', featured: true, badge: 'Bestseller',
    description: 'A Chesterfield in the old way: every button is hand-tied, the rolled arms are shaped over solid sheesham, and the full-grain leather is left uncoated so it darkens and softens with use. It is the sofa your grandchildren will argue over.',
    materials: 'Solid sheesham frame, sinuous springs, full-grain aniline leather, hand-tied deep buttoning',
    care: 'Dust with a dry cloth. Condition the leather every six months. Avoid harsh cleaners and direct heat.',
    photos: ['1573866926487-a1865558a9cf', '1615873968403-89e068629265'], price: 124900, mrp: 139900,
    finishes: [FABRIC.tan, FABRIC.cognac], sizes: sofaSizes, attributes: { material: 'Leather', seating: '3 seats', style: 'Classic' }, installation: true, warranty: 60,
  },
  {
    name: 'Tamarind Sectional', category: 'sectional-sofas', rooms: ['living-room'], collections: ['studio-oak'],
    tagline: 'A low, generous L-shape for the whole family',
    description: 'Tamarind wraps around a room without crowding it. The low back keeps sightlines open, the deep seat is made for sitting cross-legged, and the chaise can be fitted on the left or right on delivery.',
    materials: 'Engineered hardwood frame, webbing suspension, HR foam, performance weave',
    care: 'Removable covers can be dry cleaned. Rotate cushions monthly for even wear.',
    photos: ['1616047006789-b7af5afb8c20', '1550581190-9c1c48d21d6c'], price: 154900,
    finishes: [FABRIC.sand, FABRIC.linen, FABRIC.indigo], attributes: { material: 'Performance fabric', seating: '5 seats', style: 'Contemporary' }, installation: true, lead: 7, badge: 'Made to order',
  },
  {
    name: 'Juhu Two-Seater', category: 'loveseats', rooms: ['living-room', 'bedroom'], collections: ['studio-oak'],
    tagline: 'Compact, upright and right for smaller flats',
    description: 'Juhu fits a 5-foot wall with room to spare. Firm seats, slim arms and a raised base that lets a robot vacuum pass underneath make it an easy everyday sofa for apartments.',
    materials: 'Solid oak legs, plywood frame, HR foam, top-grain leather',
    care: 'Wipe with a damp cloth. Condition leather twice a year.',
    photos: ['1512212621149-107ffe572d2f', '1605774337664-7a846e9cdf17'], price: 54900, mrp: 62900,
    finishes: [FABRIC.sand, FABRIC.tan], attributes: { material: 'Leather', seating: '2 seats', style: 'Mid-century' }, installation: false, assembly: true,
  },
  {
    name: 'Malabar Fabric Sofa', category: 'three-seater-sofas', rooms: ['living-room'], collections: ['teak-and-linen'],
    tagline: 'Teak frame, loose cushions, lived-in comfort',
    description: 'An exposed teak frame with loose, plump cushions. The arms are wide enough to hold a cup of chai, and every cushion cover zips off for washing.',
    materials: 'Solid teak frame, foam and fibre cushions, washable cotton covers',
    care: 'Covers are machine washable at 30°C. Oil the teak twice a year.',
    photos: ['1567016432779-094069958ea5', '1630585308572-f53438fc684f'], price: 72900,
    finishes: [FABRIC.rust, FABRIC.indigo, FABRIC.linen], sizes: sofaSizes, attributes: { material: 'Cotton', seating: '3 seats', style: 'Indian modern' }, installation: true,
  },
  {
    name: 'Haze Three-Seater', category: 'three-seater-sofas', rooms: ['living-room'], collections: ['studio-oak'],
    tagline: 'Soft lines and pillow-back comfort in a quiet grey', badge: 'New',
    description: 'Haze is the calm centre of a room: a pillow back you sink into, rounded arms and a pale oak plinth. The weave is stain-resistant and safe for homes with pets.',
    materials: 'Oak plinth, hardwood frame, fibre-wrapped foam, stain-resistant weave',
    care: 'Spot clean with mild soap and water. Plump cushions daily.',
    photos: ['1698936061086-2bf99c7b9fc5', '1583847268964-b28dc8f51f92'], price: 68900, mrp: 74900,
    finishes: [FABRIC.sand, FABRIC.linen], sizes: sofaSizes, attributes: { material: 'Performance fabric', seating: '3 seats', style: 'Contemporary' }, installation: true,
  },
  {
    name: 'Pallavi Accent Chair', category: 'accent-chairs', rooms: ['living-room', 'bedroom'], collections: ['monsoon-velvet'],
    tagline: 'A sculpted reading chair in sheen velvet', featured: true, badge: 'View in 3D',
    description: 'Pallavi’s curved back holds you like a cupped hand. Turn the chair in 3D and switch finishes to see how the sheen velvet changes in the light.',
    materials: 'Moulded plywood shell, HR foam, sheen velvet, solid wood legs',
    care: 'Brush the pile gently. Professional clean only.',
    photos: ['1586023492125-27b2c045efd7', '1634712282287-14ed57b9cc89'], price: 32900, mrp: 36900,
    finishes: [], model: 'SheenChair', attributes: { material: 'Velvet', seating: '1 seat', style: 'Contemporary' }, assembly: false,
  },
  {
    name: 'Kora Lounge Chair', category: 'accent-chairs', rooms: ['living-room', 'bedroom'], collections: ['teak-and-linen'],
    tagline: 'A deep, linen lounge chair for slow mornings',
    description: 'Kora is a low, deep chair with a loose linen cover that softens over time. Pair it with an ottoman and a lamp and you have a reading corner.',
    materials: 'Hardwood frame, feather-blend cushions, stonewashed linen',
    care: 'Cover is dry clean only. Fluff cushions regularly.',
    photos: ['1519961655809-34fa156820ff', '1616627547584-bf28cee262db'], price: 41900,
    finishes: [FABRIC.linen, FABRIC.sand], attributes: { material: 'Linen', seating: '1 seat', style: 'Relaxed' },
  },
  {
    name: 'Arc Dining Chair', category: 'dining-chairs', rooms: ['dining-room', 'study'], collections: ['studio-oak'],
    tagline: 'A moulded seat on solid ash legs, sold as a pair', badge: 'Set of 2',
    description: 'Arc pairs a curved, moulded seat with solid ash legs joined by hand. It is light enough to move with one hand and sturdy enough for daily dinners.',
    materials: 'Moulded polymer seat, solid ash legs, steel fixings',
    care: 'Wipe with a damp cloth. Tighten fixings once a year.',
    photos: ['1592078615290-033ee584e267', '1699588772787-1eed3b726e0a'], price: 18900,
    finishes: [WOOD.ash, WOOD.ebony], attributes: { material: 'Solid wood', style: 'Mid-century' }, assembly: true, gst: 18,
  },
  {
    name: 'Ranthambore Armchair', category: 'accent-chairs', rooms: ['living-room'], collections: ['teak-and-linen'],
    tagline: 'Block-printed cotton on a hand-carved frame',
    description: 'Upholstered in cotton block-printed by hand in Bagru, Ranthambore brings colour without shouting. Each print run is slightly different, so no two chairs match exactly.',
    materials: 'Solid mango wood frame, HR foam, hand block-printed cotton',
    care: 'Dry clean only. Natural dyes may soften with sunlight.',
    photos: ['1601392740426-907c7b028119', '1505843490538-5133c6c7d0e1'], price: 28900,
    finishes: [{ name: 'Bagru Floral', hex: '#C8A27A' }, FABRIC.linen], attributes: { material: 'Cotton', seating: '1 seat', style: 'Indian modern' },
  },
  {
    name: 'Vriksha Coffee Table', category: 'coffee-tables', rooms: ['living-room'], collections: ['teak-and-linen'],
    tagline: 'A solid teak top with live-edge character', badge: 'Bestseller', featured: true,
    description: 'Vriksha is cut from reclaimed teak, so every top shows its own grain, nail marks and history. A lower shelf keeps books and remotes out of sight.',
    materials: 'Reclaimed solid teak, natural oil finish',
    care: 'Use coasters. Re-oil every six months with teak oil.',
    photos: ['1581428982868-e410dd047a90', '1604061986761-d9d0cc41b0d1'], price: 34900, mrp: 39900,
    finishes: [WOOD.teak, WOOD.walnut], attributes: { material: 'Solid wood', style: 'Rustic' }, assembly: false,
  },
  {
    name: 'Ganga Round Dining Table', category: 'dining-tables', rooms: ['dining-room'], collections: ['teak-and-linen'],
    tagline: 'A round table that seats four and fits small rooms',
    description: 'Round tables make conversation easy and corners disappear. Ganga stands on a single turned pedestal, so nobody fights a table leg for knee room.',
    materials: 'Solid sheesham top and pedestal, PU lacquer',
    care: 'Wipe spills promptly. Avoid placing hot dishes directly on the top.',
    photos: ['1616486338812-3dadae4b4ace', '1604578762246-41134e37f9cc'], price: 46900,
    finishes: [WOOD.teak, WOOD.oak], attributes: { material: 'Solid wood', seating: '4 seats', style: 'Classic' }, installation: true,
  },
  {
    name: 'Konkan Dining Set', category: 'dining-tables', rooms: ['dining-room'], collections: ['studio-oak'],
    tagline: 'A table and chairs that seat four or six, together', featured: true,
    description: 'Konkan comes complete: a rectangular table with softly rounded corners and matching chairs with woven cane backs. Choose four or six seats.',
    materials: 'Solid acacia, natural cane, matte PU finish',
    care: 'Dust regularly. Keep cane away from moisture.',
    photos: ['1505409628601-edc9af17fda6', '1617098709804-705581f844eb'], price: 79900, mrp: 89900,
    finishes: [WOOD.oak, WOOD.walnut], sizes: diningSizes, attributes: { material: 'Solid wood', seating: '6 seats', style: 'Contemporary' }, installation: true,
  },
  {
    name: 'Mysore Side Table', category: 'side-tables', rooms: ['living-room', 'bedroom'], collections: ['studio-oak'],
    tagline: 'A small table with a powder-coated steel base',
    description: 'Mysore puts a solid wood top on a slim steel frame. It is the right height for a sofa arm and small enough for the space beside a bed.',
    materials: 'Solid acacia top, powder-coated steel base',
    care: 'Wipe with a dry cloth.',
    photos: ['1594125674956-61a9b49c8ecc', '1647967527216-adea2f078e07'], price: 9900,
    finishes: [WOOD.oak, WOOD.ebony], attributes: { material: 'Solid wood', style: 'Industrial' }, assembly: true,
  },
  {
    name: 'Lotus Oval Dining Table', category: 'dining-tables', rooms: ['dining-room'], collections: ['studio-oak'],
    tagline: 'A pale oval table for bright dining rooms', badge: 'New',
    description: 'An oval top seats one more than a rectangle of the same size and feels lighter in a room. Lotus pairs a white oak veneer with solid splayed legs.',
    materials: 'White oak veneer on plywood, solid oak legs',
    care: 'Wipe spills promptly. Use mats under hot dishes.',
    photos: ['1594000311835-6d564e5a46b3', '1602872030490-4a484a7b3ba6'], price: 52900,
    finishes: [WOOD.ash, WOOD.oak], sizes: diningSizes, attributes: { material: 'Engineered wood', seating: '6 seats', style: 'Scandinavian' }, installation: true,
  },
  {
    name: 'Nilgiri Upholstered Bed', category: 'beds', rooms: ['bedroom'], collections: ['monsoon-velvet'],
    tagline: 'A tall, padded headboard for reading in bed', featured: true,
    description: 'Nilgiri’s headboard rises high enough to lean against comfortably with a book. The frame sits on a solid wood platform with a centre rail, so no box spring is needed.',
    materials: 'Solid wood platform, plywood headboard, HR foam, linen-blend upholstery',
    care: 'Vacuum the headboard monthly. Spot clean only.',
    photos: ['1616594039964-ae9021a400a0', '1615874959474-d609969a20ed'], price: 74900, mrp: 84900,
    finishes: [FABRIC.linen, FABRIC.sand], sizes: bedSizes, attributes: { material: 'Linen', style: 'Contemporary' }, installation: true, warranty: 60,
  },
  {
    name: 'Hampi Bed', category: 'beds', rooms: ['bedroom'], collections: ['monsoon-velvet'],
    tagline: 'A channel-tufted velvet headboard in deep indigo',
    description: 'Hampi’s vertical channel tufting adds rhythm to a bedroom wall. The velvet is dense and soft, and the bed frame is finished with a low, tapered plinth.',
    materials: 'Solid wood frame, channel-tufted velvet headboard',
    care: 'Brush the velvet. Professional clean only.',
    photos: ['1566665797739-1674de7a421a', '1618221118493-9cfa1a1c00da'], price: 82900,
    finishes: [FABRIC.indigo, FABRIC.moss], sizes: bedSizes, attributes: { material: 'Velvet', style: 'Glam' }, installation: true, lead: 5, badge: 'Made to order',
  },
  {
    name: 'Coorg Storage Bed', category: 'beds', rooms: ['bedroom'], collections: ['studio-oak'],
    tagline: 'Hydraulic lift storage under a clean oak frame',
    description: 'Lift the mattress platform on gas struts and the whole base becomes storage for linen, luggage and winter quilts. The struts hold the platform open safely at any height.',
    materials: 'Engineered wood with oak veneer, gas-lift hydraulics',
    care: 'Do not overload the storage base. Wipe with a dry cloth.',
    photos: ['1562438668-bcf0ca6578f0', '1560185893-a55cbc8c57e8'], price: 59900, mrp: 66900,
    finishes: [WOOD.oak, WOOD.walnut], sizes: bedSizes, attributes: { material: 'Engineered wood', style: 'Contemporary' }, installation: true, badge: 'Bestseller',
  },
  {
    name: 'Chettinad Sideboard', category: 'sideboards', rooms: ['dining-room', 'living-room'], collections: ['teak-and-linen'],
    tagline: 'Cane-front doors and a solid teak top', featured: true,
    description: 'Inspired by the doors of Chettinad mansions, this sideboard pairs a solid teak top with woven cane doors that let air through, which helps in humid cities.',
    materials: 'Solid teak, natural cane, brass handles',
    care: 'Dust the cane with a soft brush. Oil the teak twice a year.',
    photos: ['1628152371231-936cf45eb8f3', '1758974782657-e5ada4b01c3c'], price: 64900, mrp: 72900,
    finishes: [WOOD.teak, WOOD.walnut], attributes: { material: 'Solid wood', style: 'Indian modern' }, installation: true,
  },
  {
    name: 'Bastar Chest of Drawers', category: 'dressers', rooms: ['bedroom'], collections: ['teak-and-linen'],
    tagline: 'Six deep drawers on full-extension runners',
    description: 'Bastar’s drawers run on soft-close, full-extension runners, so you can reach the back without pulling the chest over. An anti-tip kit is included and fitted on delivery.',
    materials: 'Solid sheesham, soft-close runners, anti-tip kit',
    care: 'Wipe with a dry cloth. Keep away from damp walls.',
    photos: ['1593443746658-bfaece08b4f8', '1556020685-ae41abfc9365'], price: 44900,
    finishes: [WOOD.teak, WOOD.ebony], attributes: { material: 'Solid wood', style: 'Classic' }, installation: true,
  },
  {
    name: 'Wicker Cabinet', category: 'sideboards', rooms: ['living-room', 'bedroom'], collections: ['studio-oak'],
    tagline: 'A tall rattan cabinet with adjustable shelves', badge: 'Low stock',
    description: 'A tall cabinet in natural rattan with three adjustable shelves. Good for books, crockery or linen, and light enough to move between rooms.',
    materials: 'Natural rattan, mango wood frame',
    care: 'Dust regularly. Keep away from direct rain and moisture.',
    photos: ['1764930680939-bfed8542e40c', '1713810958247-01dbd76b4a61'], price: 36900,
    finishes: [{ name: 'Natural Rattan', hex: '#C9A86B' }], attributes: { material: 'Rattan', style: 'Bohemian' }, assembly: true,
  },
  {
    name: 'Shastri Writing Desk', category: 'study-tables', rooms: ['study'], collections: ['studio-oak'],
    tagline: 'A clean oak desk with a hidden cable tray', featured: true,
    description: 'A desk that keeps a home office calm: a hidden tray for chargers and cables, a single slim drawer and a top deep enough for a monitor and a notebook side by side.',
    materials: 'Solid oak top, steel cable tray, soft-close drawer',
    care: 'Wipe with a damp cloth. Use a mouse mat to protect the finish.',
    photos: ['1623177623442-979c1e42c255', '1518455027359-f3f8164ba6bd'], price: 32900, mrp: 36900,
    finishes: [WOOD.oak, WOOD.walnut], attributes: { material: 'Solid wood', style: 'Scandinavian' }, assembly: true,
  },
  {
    name: 'Atelier Work Desk', category: 'study-tables', rooms: ['study'], collections: ['teak-and-linen'],
    tagline: 'A long walnut desk for two',
    description: 'At 160 cm, Atelier seats two side by side or one person who spreads out. The top is a single walnut veneer panel with a rounded front edge kind to wrists.',
    materials: 'Walnut veneer, solid walnut legs',
    care: 'Wipe with a dry cloth.',
    photos: ['1604074131665-7a4b13870ab4', '1593642632559-0c6d3fc62b89'], price: 42900,
    finishes: [WOOD.walnut], attributes: { material: 'Engineered wood', style: 'Mid-century' }, assembly: true,
  },
  {
    name: 'Diya Table Lamp', category: 'lamps', rooms: ['living-room', 'bedroom', 'study'], collections: ['teak-and-linen'],
    tagline: 'Turned mango wood with a pleated linen shade',
    description: 'A warm, low pool of light for a side table. The base is turned from a single block of mango wood and the pleated linen shade softens the bulb.',
    materials: 'Mango wood base, linen shade, E27 holder (bulb not included)',
    care: 'Dust the shade with a soft brush.',
    photos: ['1517991104123-1d56a6e81ed9', '1580130281320-0ef0754f2bf7'], price: 6900,
    finishes: [WOOD.teak, WOOD.ash], attributes: { material: 'Solid wood', style: 'Relaxed' }, gst: 12, hsn: '9405', returnable: true,
  },
  {
    name: 'Halo Brass Lamp', category: 'lamps', rooms: ['study', 'bedroom'], collections: ['monsoon-velvet'],
    tagline: 'An adjustable brass task lamp',
    description: 'Halo’s arm and head adjust so the light lands exactly where you are working. The brass will darken gently over time unless polished.',
    materials: 'Solid brass, steel weighted base, LED compatible',
    care: 'Polish with a dry cloth. Do not use abrasive cleaners.',
    photos: ['1573676386604-78f8ed228e2b', '1576054595984-a4b05c80e70b'], price: 8900,
    finishes: [{ name: 'Antique Brass', hex: '#A8834A' }, WOOD.ebony], attributes: { material: 'Metal', style: 'Industrial' }, gst: 12, hsn: '9405',
  },
  {
    name: 'Kalash Glass Vase Set', category: 'decor', rooms: ['living-room', 'dining-room'], collections: ['studio-oak'],
    tagline: 'Three mouth-blown glass vases',
    description: 'Three vases in mouth-blown glass from Firozabad, each slightly irregular. Use them together on a sideboard or spread them around a room.',
    materials: 'Mouth-blown glass',
    care: 'Hand wash only.',
    photos: ['1581641363874-158d26798a62', '1614348531934-c338408a46bb'], price: 4900,
    finishes: [{ name: 'Clear', hex: '#DDE5E3' }], attributes: { material: 'Glass', style: 'Contemporary' }, gst: 12, hsn: '7013', returnable: false,
  },
];

const CATEGORIES: { name: string; slug: string; photo: string; description: string; children: { name: string; slug: string }[] }[] = [
  { name: 'Sofas', slug: 'sofas', photo: '1555041469-a586c61ea9bc', description: 'Sofas built on kiln-dried frames with seats that keep their shape, from compact two-seaters to sectionals for the whole family.', children: [{ name: 'Three-seater sofas', slug: 'three-seater-sofas' }, { name: 'Sectional sofas', slug: 'sectional-sofas' }, { name: 'Loveseats', slug: 'loveseats' }] },
  { name: 'Chairs', slug: 'chairs', photo: '1586023492125-27b2c045efd7', description: 'Accent chairs for reading corners and dining chairs for daily use.', children: [{ name: 'Accent chairs', slug: 'accent-chairs' }, { name: 'Dining chairs', slug: 'dining-chairs' }] },
  { name: 'Tables', slug: 'tables', photo: '1616486338812-3dadae4b4ace', description: 'Dining, coffee and side tables in solid wood.', children: [{ name: 'Dining tables', slug: 'dining-tables' }, { name: 'Coffee tables', slug: 'coffee-tables' }, { name: 'Side tables', slug: 'side-tables' }] },
  { name: 'Beds', slug: 'beds', photo: '1616594039964-ae9021a400a0', description: 'Platform, upholstered and storage beds in queen and king sizes.', children: [] },
  { name: 'Storage', slug: 'storage', photo: '1628152371231-936cf45eb8f3', description: 'Sideboards, cabinets and chests that hide clutter beautifully.', children: [{ name: 'Sideboards and cabinets', slug: 'sideboards' }, { name: 'Dressers', slug: 'dressers' }] },
  { name: 'Study', slug: 'study', photo: '1623177623442-979c1e42c255', description: 'Desks for working well at home.', children: [{ name: 'Study tables', slug: 'study-tables' }] },
  { name: 'Lighting and decor', slug: 'lighting-and-decor', photo: '1517991104123-1d56a6e81ed9', description: 'Lamps and objects that finish a room.', children: [{ name: 'Lamps', slug: 'lamps' }, { name: 'Decor', slug: 'decor' }] },
];

const ROOMS = [
  { name: 'Living room', slug: 'living-room', photo: '1583847268964-b28dc8f51f92', tagline: 'Gather, lounge, linger', intro: 'The room that does the most work: sofas you can sink into, tables that hold the chai and the homework, and light that changes with the evening. Start with the sofa, then build around it.' },
  { name: 'Bedroom', slug: 'bedroom', photo: '1616486029423-aaa4789e8c9a', tagline: 'Quiet rooms for good sleep', intro: 'Beds with the storage Indian homes need, headboards to lean against with a book, and chests that keep the room calm.' },
  { name: 'Dining room', slug: 'dining-room', photo: '1617806118233-18e1de247200', tagline: 'Tables for long meals', intro: 'Round tables for small rooms, sets for six, and sideboards that keep the good crockery close at hand.' },
  { name: 'Study', slug: 'study', photo: '1593642632559-0c6d3fc62b89', tagline: 'A calm place to work', intro: 'Desks with room for a monitor and a notebook, chairs you can sit in all day, and task lights that land where you need them.' },
];

const COLLECTIONS = [
  {
    name: 'Teak and Linen', slug: 'teak-and-linen', photo: '1616486338812-3dadae4b4ace', tagline: 'Honest materials that get better with age',
    intro: 'Reclaimed teak, hand-woven cane and stonewashed linen. Pieces made the way furniture was made before it was flat-packed.',
    story: [
      { title: 'Teak, reclaimed', body: 'Our teak comes from old Kerala homes and warehouses being rebuilt. It has already spent decades drying, so it doesn’t warp in Mumbai monsoons or Delhi winters.', photo: '1611600700192-d87eaeed4f81' },
      { title: 'Joined by hand', body: 'Mortise-and-tenon joints, not staples. Each piece is shaped and fitted in our workshop near Bengaluru by craftspeople with twenty years at the bench.', photo: '1497219055242-93359eeed651' },
      { title: 'Linen that softens', body: 'Stonewashed linen starts relaxed and only gets softer. It breathes in the heat and the covers come off for cleaning.', photo: '1528458909336-e7a0adfed0a5' },
    ],
  },
  {
    name: 'Monsoon Velvet', slug: 'monsoon-velvet', photo: '1590251024078-8a6d9f90b02d', tagline: 'Deep colour, soft light',
    intro: 'Rich velvets in moss, indigo and rust, inspired by the colours of the hills in the rains.',
    story: [
      { title: 'Colours of the rains', body: 'Moss green from the Western Ghats, indigo from the evening sky over the Arabian Sea. Colours that look right in the soft light of an Indian home.', photo: '1591195854242-8804547cdcab' },
      { title: 'Velvet that wears well', body: 'A dense cotton-blend velvet tested to 50,000 rubs, so it stands up to children, pets and long evenings.', photo: '1631396326646-c06a935ff3a6' },
    ],
  },
  {
    name: 'Studio Oak', slug: 'studio-oak', photo: '1618221195710-dd6b41faaea6', tagline: 'Light, simple, made for small homes',
    intro: 'Pale oak and ash, clean lines and clever storage for apartments where every square foot counts.',
    story: [
      { title: 'Light woods, bright rooms', body: 'Oak and ash reflect light around a room, so a small flat feels bigger. We finish them in a matte lacquer that resists marks.', photo: '1623177623442-979c1e42c255' },
      { title: 'Measured for apartments', body: 'Every Studio Oak piece fits through a standard 80 cm door and up a building lift, and most arrive assembled.', photo: '1659930087003-2d64e33181f7' },
    ],
  },
];

const LOOKS = [
  { name: 'An easy living room', slug: 'easy-living-room', room: 'living-room', photo: '1583847268964-b28dc8f51f92', description: 'A soft grey sofa, a reclaimed teak table and warm light for long evenings.', hotspots: [['Haze Three-Seater', 56, 62], ['Vriksha Coffee Table', 32, 86], ['Diya Table Lamp', 22, 30], ['Kalash Glass Vase Set', 8, 74]] },
  { name: 'A calm bedroom', slug: 'calm-bedroom', room: 'bedroom', photo: '1616486029423-aaa4789e8c9a', description: 'An upholstered bed, a chest with deep drawers and a brass lamp to read by.', hotspots: [['Nilgiri Upholstered Bed', 48, 62], ['Bastar Chest of Drawers', 14, 70], ['Halo Brass Lamp', 80, 46]] },
  { name: 'Dinner for six', slug: 'dinner-for-six', room: 'dining-room', photo: '1617806118233-18e1de247200', description: 'A dining set for six and a cane sideboard for the good plates.', hotspots: [['Konkan Dining Set', 50, 66], ['Arc Dining Chair', 28, 72], ['Chettinad Sideboard', 84, 58]] },
  { name: 'A study that works', slug: 'study-that-works', room: 'study', photo: '1593642632559-0c6d3fc62b89', description: 'A desk with room to spread out and a lamp that lands where you need it.', hotspots: [['Atelier Work Desk', 50, 70], ['Halo Brass Lamp', 76, 40], ['Arc Dining Chair', 30, 80]] },
];

// ───────────────────────── seeding ─────────────────────────

async function fresh() {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(', ')} RESTART IDENTITY CASCADE`);
  await prisma.$executeRawUnsafe(`ALTER SEQUENCE order_number_seq RESTART WITH 1001`);
  await prisma.$executeRawUnsafe(`ALTER SEQUENCE return_number_seq RESTART WITH 101`);
}

async function main() {
  const isFresh = process.argv.includes('--fresh');
  if (isFresh) {
    if (process.env.NODE_ENV === 'production') throw new Error('Refusing to clear data in production.');
    await fresh();
    console.log('Cleared existing data.');
  } else if ((await prisma.product.count()) > 0) {
    console.log('The database already has products. Run with --fresh to clear it first (development only).');
    return;
  }
  await mkdir(CACHE, { recursive: true });
  const t0 = Date.now();

  // Roles and staff
  for (const r of SYSTEM_ROLES) await prisma.role.create({ data: { ...r, isSystem: true } });
  const owner = await prisma.role.findUniqueOrThrow({ where: { name: 'Owner' } });
  const ops = await prisma.role.findUniqueOrThrow({ where: { name: 'Order operations' } });
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? 'Aangan-Admin-2026';
  await prisma.staffUser.create({ data: { email: 'owner@aangan.example', name: 'Store Owner', roleId: owner.id, passwordHash: await hash(adminPassword, ARGON) } });
  await prisma.staffUser.create({ data: { email: 'ops@aangan.example', name: 'Meera Ops', roleId: ops.id, passwordHash: await hash(adminPassword, ARGON) } });

  // Locations and pincodes (Salem, where SSS Furniture is based, plus Bengaluru, Mumbai, Delhi NCR)
  const locs = {
    slm: await prisma.location.create({ data: { name: 'Salem showroom and workshop', city: 'Salem' } }),
    blr: await prisma.location.create({ data: { name: 'Bengaluru warehouse', city: 'Bengaluru' } }),
    bom: await prisma.location.create({ data: { name: 'Mumbai warehouse', city: 'Mumbai' } }),
    del: await prisma.location.create({ data: { name: 'Delhi NCR warehouse', city: 'Gurugram' } }),
  };
  const pins: Prisma.PincodeCreateManyInput[] = [];
  for (let p = 636001; p <= 636017; p++) pins.push({ pincode: String(p), city: 'Salem', state: 'Tamil Nadu', locationId: locs.slm.id, leadDays: 2, deliveryFee: rs(299) });
  for (let p = 560001; p <= 560110; p++) pins.push({ pincode: String(p), city: 'Bengaluru', state: 'Karnataka', locationId: locs.blr.id, leadDays: 3, deliveryFee: rs(499), codAvailable: p % 17 !== 0 });
  for (let p = 400001; p <= 400104; p++) pins.push({ pincode: String(p), city: 'Mumbai', state: 'Maharashtra', locationId: locs.bom.id, leadDays: 4, deliveryFee: rs(599), codAvailable: p % 13 !== 0 });
  for (let p = 110001; p <= 110096; p++) pins.push({ pincode: String(p), city: 'New Delhi', state: 'Delhi', locationId: locs.del.id, leadDays: 5, deliveryFee: rs(599) });
  for (let p = 122001; p <= 122018; p++) pins.push({ pincode: String(p), city: 'Gurugram', state: 'Haryana', locationId: locs.del.id, leadDays: 5, deliveryFee: rs(699), installationAvailable: p % 2 === 0 });
  await prisma.pincode.createMany({ data: pins });

  // Categories
  const catIds = new Map<string, string>();
  for (const [i, c] of CATEGORIES.entries()) {
    const img = await image(c.photo, c.name, c.slug);
    const parent = await prisma.category.create({ data: { name: c.name, slug: c.slug, description: c.description, imageKey: img.key, sort: i, seoTitle: `${c.name} online in India`, seoDescription: c.description.slice(0, 160) } });
    catIds.set(c.slug, parent.id);
    for (const [j, ch] of c.children.entries()) {
      const child = await prisma.category.create({ data: { name: ch.name, slug: ch.slug, parentId: parent.id, sort: j, imageKey: img.key } });
      catIds.set(ch.slug, child.id);
    }
  }
  catIds.set('beds', catIds.get('beds')!);

  // Rooms and collections
  const roomIds = new Map<string, string>();
  for (const [i, r] of ROOMS.entries()) {
    const img = await image(r.photo, `${r.name} styled with SSS Furniture`, r.slug);
    const room = await prisma.room.create({ data: { name: r.name, slug: r.slug, tagline: r.tagline, intro: r.intro, heroKey: img.key, sort: i } });
    roomIds.set(r.slug, room.id);
  }
  const collectionIds = new Map<string, string>();
  for (const [i, c] of COLLECTIONS.entries()) {
    const img = await image(c.photo, c.name, c.slug);
    const story = [];
    for (const s of c.story) story.push({ title: s.title, body: s.body, imageKey: (await image(s.photo, s.title, `${c.slug}-story`)).key });
    const col = await prisma.collection.create({ data: { name: c.name, slug: c.slug, tagline: c.tagline, intro: c.intro, heroKey: img.key, story, sort: i, seoTitle: `${c.name} collection`, seoDescription: c.intro.slice(0, 160) } });
    collectionIds.set(c.slug, col.id);
  }

  // Products
  const productIds = new Map<string, string>();
  const variantsByProduct = new Map<string, { id: string; price: number }[]>();
  let skuN = 100;
  for (const [pi, d] of PRODUCTS.entries()) {
    const slug = d.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const main = await image(d.photos[0], `${d.name}, ${d.tagline.toLowerCase()}`, slug);
    const alt = await image(d.photos[1], `${d.name} in a styled room`, slug);
    let finishes = d.finishes;
    let modelAsset: Awaited<ReturnType<typeof model>> | null = null;
    if (d.model) {
      modelAsset = await model(d.model);
      const palette = ['#C9B28F', '#2F3A56', '#7C7C78', '#1F1D1B', '#D9A9A4', '#4E5B3A', '#A2532F', '#E8E1D3'];
      finishes = modelAsset.variants.map((v, i) => ({ name: v, hex: palette[i % palette.length] }));
    }
    const product = await prisma.product.create({
      data: {
        name: d.name, slug, status: 'ACTIVE', categoryId: catIds.get(d.category)!, tagline: d.tagline, description: d.description,
        materials: d.materials, careInfo: d.care, warrantyMonths: d.warranty ?? 24, returnable: d.returnable ?? true, returnWindowDays: 7,
        installationIncluded: d.installation ?? false, assemblyRequired: d.assembly ?? false, hsnCode: d.hsn ?? '9403', gstRate: d.gst ?? 18,
        featured: d.featured ?? false, badge: d.badge, publishedAt: new Date(Date.now() - (PRODUCTS.length - pi) * 86_400_000),
        seoTitle: `${d.name} | ${d.attributes.material} ${d.category.replace(/-/g, ' ')}`.slice(0, 70),
        seoDescription: `${d.tagline}. ${d.materials}.`.slice(0, 160),
        rooms: { create: d.rooms.map((r) => ({ roomId: roomIds.get(r)! })) },
        collections: d.collections ? { create: d.collections.map((c, i) => ({ collectionId: collectionIds.get(c)!, sort: i })) } : undefined,
        attributes: {
          create: [
            { key: 'material', label: 'Material', value: d.attributes.material, filterable: true, sort: 0 },
            ...(d.attributes.seating ? [{ key: 'seating', label: 'Seating', value: d.attributes.seating, filterable: true, sort: 1 }] : []),
            { key: 'style', label: 'Style', value: d.attributes.style, filterable: true, sort: 2 },
            { key: 'origin', label: 'Made in', value: 'India', filterable: false, sort: 3 },
            { key: 'warranty', label: 'Warranty', value: `${Math.round((d.warranty ?? 24) / 12)} years`, filterable: false, sort: 4 },
          ],
        },
      },
    });
    productIds.set(d.name, product.id);

    const finishOpt = finishes.length ? await prisma.productOption.create({ data: { productId: product.id, name: 'Finish', sort: 0 } }) : null;
    const finishVals = [];
    for (const [i, f] of finishes.entries()) {
      finishVals.push(await prisma.optionValue.create({ data: { optionId: finishOpt!.id, value: f.name, swatchHex: f.hex, modelVariant: modelAsset ? f.name : null, sort: i } }));
    }
    const sizeOpt = d.sizes ? await prisma.productOption.create({ data: { productId: product.id, name: 'Size', sort: 1 } }) : null;
    const sizeVals = [];
    for (const [i, s] of (d.sizes ?? []).entries()) sizeVals.push(await prisma.optionValue.create({ data: { optionId: sizeOpt!.id, value: s.label, sort: i } }));

    const combos: { finish?: (typeof finishVals)[number]; size?: (typeof sizeVals)[number]; sizeDef?: Size }[] = [];
    const fList = finishVals.length ? finishVals : [undefined];
    const sList = d.sizes ? d.sizes.map((s, i) => ({ v: sizeVals[i], s })) : [undefined];
    for (const f of fList) for (const s of sList) combos.push({ finish: f, size: s?.v, sizeDef: s?.s });

    const created: { id: string; price: number }[] = [];
    for (const [ci, c] of combos.entries()) {
      const price = rs(d.price + (c.sizeDef?.delta ?? 0));
      const mrp = d.mrp ? rs(d.mrp + (c.sizeDef?.delta ?? 0)) : null;
      const dims = c.sizeDef?.dims ?? defaultDims(d.category);
      const title = [c.finish?.value, c.size?.value].filter(Boolean).join(' / ') || 'Standard';
      const v = await prisma.variant.create({
        data: {
          productId: product.id,
          sku: `SSS-${slug.split('-').map((w) => w[0]).join('').toUpperCase()}-${skuN++}`,
          title, price, mrp, lengthCm: dims[0], widthCm: dims[1], heightCm: dims[2], weightKg: c.sizeDef?.weight ?? 18,
          leadTimeDays: d.lead ?? 0, isDefault: ci === 0, maxPerOrder: d.category === 'decor' || d.category === 'lamps' ? 10 : 4,
          optionValues: { create: [c.finish, c.size].filter(Boolean).map((ov) => ({ optionValueId: ov!.id })) },
        },
      });
      created.push({ id: v.id, price });
      // Stock: plenty in the home warehouse, some elsewhere, a few low or out of stock to show those states
      const isLow = d.badge === 'Low stock';
      const out = slug === 'hampi-bed' && ci === 1;
      await prisma.inventoryLevel.createMany({
        data: [
          { variantId: v.id, locationId: locs.blr.id, onHand: out ? 0 : isLow ? 2 : 6 + ((ci * 7 + pi) % 9) },
          { variantId: v.id, locationId: locs.bom.id, onHand: out ? 0 : isLow ? 1 : 3 + ((ci + pi) % 6) },
          { variantId: v.id, locationId: locs.del.id, onHand: out ? 0 : isLow ? 0 : 2 + ((ci * 3 + pi) % 7) },
        ],
      });
      for (const loc of [locs.blr, locs.bom, locs.del]) {
        const lvl = await prisma.inventoryLevel.findUniqueOrThrow({ where: { variantId_locationId: { variantId: v.id, locationId: loc.id } } });
        if (lvl.onHand > 0) await prisma.stockMovement.create({ data: { variantId: v.id, locationId: loc.id, type: 'RECEIPT', quantity: lvl.onHand, reason: 'Opening stock', reference: 'SEED' } });
      }
    }
    variantsByProduct.set(d.name, created);
    await prisma.product.update({ where: { id: product.id }, data: { minPrice: Math.min(...created.map((c) => c.price)) } });

    // Media: main + lifestyle, and per-finish images for the first two finishes (demo of finish-driven galleries)
    const media: Prisma.ProductMediaCreateManyInput[] = [
      { productId: product.id, mediaId: main.id, role: 'GALLERY', sort: 0 },
      { productId: product.id, mediaId: alt.id, role: 'LIFESTYLE', sort: 1 },
    ];
    if (finishVals[1] && !modelAsset) media.push({ productId: product.id, mediaId: alt.id, role: 'GALLERY', sort: 2, optionValueId: finishVals[1].id });
    if (modelAsset) {
      media.push({ productId: product.id, mediaId: modelAsset.id, role: 'MODEL_3D', sort: 10 });
      media.push({ productId: product.id, mediaId: main.id, role: 'MODEL_POSTER', sort: 11 });
    }
    await prisma.productMedia.createMany({ data: media });
  }

  // Looks with hotspots
  for (const [i, l] of LOOKS.entries()) {
    const img = await image(l.photo, l.name, l.slug);
    await prisma.look.create({
      data: {
        name: l.name, slug: l.slug, description: l.description, imageKey: img.key, roomId: roomIds.get(l.room), sort: i,
        hotspots: { create: l.hotspots.map(([name, x, y]) => ({ productId: productIds.get(name as string)!, x: x as number, y: y as number })) },
      },
    });
  }

  // Coupons
  const now = Date.now();
  await prisma.coupon.createMany({
    data: [
      { code: 'WELCOME10', description: '10% off your first order, up to ₹5,000', type: 'PERCENT', value: 10, maxDiscount: rs(5000), firstOrderOnly: true },
      { code: 'HOME2500', description: '₹2,500 off orders above ₹40,000', type: 'FIXED', value: rs(2500), minSubtotal: rs(40000), perCustomerLimit: 3 },
      { code: 'MONSOON15', description: 'Monsoon sale (ended)', type: 'PERCENT', value: 15, endsAt: new Date(now - 10 * 86_400_000), startsAt: new Date(now - 40 * 86_400_000) },
    ],
  });

  // Content pages
  await seedContent(productIds);

  // Demo customer with delivered orders and approved reviews (so ratings and reviews show)
  await seedCustomers(productIds, variantsByProduct, locs.blr.id);

  // Delivery slots for the next three weeks
  const windows = ['09:00 – 13:00', '14:00 – 18:00'];
  const slots: Prisma.DeliverySlotCreateManyInput[] = [];
  for (const loc of Object.values(locs)) {
    for (let i = 1; i <= 21; i++) {
      const d = new Date(now + i * 86_400_000);
      const day = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
      if (day.getUTCDay() === 0) continue;
      for (const w of windows) slots.push({ locationId: loc.id, date: day, window: w, capacity: 8 });
    }
  }
  await prisma.deliverySlot.createMany({ data: slots, skipDuplicates: true });

  console.log(`Seeded in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  console.log(`  ${PRODUCTS.length} products, ${await prisma.variant.count()} variants, ${await prisma.mediaAsset.count()} media files, ${pins.length} pincodes`);
  console.log('  Admin: owner@aangan.example / ' + adminPassword + '  (two-factor setup on first sign-in)');
  console.log('  Customer: priya@example.com / Customer-2026');
}

function defaultDims(category: string): [number, number, number] {
  const map: Record<string, [number, number, number]> = {
    'accent-chairs': [78, 82, 86], 'dining-chairs': [46, 52, 80], 'coffee-tables': [110, 60, 42], 'side-tables': [45, 45, 55],
    'dining-tables': [140, 90, 76], sideboards: [160, 45, 80], dressers: [100, 50, 110], 'study-tables': [140, 65, 75],
    lamps: [30, 30, 52], decor: [20, 20, 30], 'sectional-sofas': [280, 180, 82], loveseats: [150, 86, 82],
    'three-seater-sofas': [214, 94, 82], beds: [214, 166, 104],
  };
  return map[category] ?? [100, 60, 80];
}

async function seedContent(productIds: Map<string, string>) {
  const hero = await image('1600210492493-0946911123ea', 'A sunlit living room with a deep brown sofa and tall windows', 'home-hero');
  const wood = await image('1611600700192-d87eaeed4f81', 'Close-up of reclaimed teak grain', 'material-wood');
  const linen = await image('1528458909336-e7a0adfed0a5', 'Stonewashed linen fabric', 'material-linen');
  const hands = await image('1497219055242-93359eeed651', 'A craftsman shaping wood with a chisel', 'material-craft');
  const story = await image('1631396326838-de37e5f8bcbc', 'A craftsman at work in the SSS Furniture workshop', 'collection-story');
  void productIds;

  await prisma.contentPage.create({
    data: {
      type: 'HOME', slug: 'home', title: 'Home', status: 'ACTIVE', publishedAt: new Date(),
      seoTitle: 'SSS Furniture | Teak furniture, sofas and home furnishing in Salem',
      seoDescription: 'Teak furniture, luxury and recliner sofas, home furnishing and office setups from SSS Furniture, Salem. Delivered on a date you choose and installed by our team.',
      blocks: [
        { id: 'hero', type: 'HERO', data: { eyebrow: 'New season · Teak and Linen', title: 'Furniture for the way you live at home', subtitle: 'Solid wood, honest fabrics and a delivery date you can plan around. Installed by our own team.', imageKey: hero.key, ctaPrimary: { label: 'Shop by room', href: '/rooms' }, ctaSecondary: { label: 'Explore collections', href: '/collections' } } },
        { id: 'rooms', type: 'ROOMS', data: { eyebrow: 'Shop by room', title: 'Start with the room', subtitle: 'Every piece is chosen to work with the others, so a room comes together without guesswork.' } },
        { id: 'story', type: 'COLLECTION_STORY', data: { collectionSlug: 'teak-and-linen', eyebrow: 'The collection', title: 'Teak that has already lived a life', body: 'Our Teak and Linen pieces are cut from wood reclaimed from old Kerala homes, then joined by hand in our workshop in Salem. Decades of seasoning mean it won’t warp in the monsoon.', imageKey: story.key, secondaryImageKey: wood.key } },
        { id: 'look', type: 'LOOK', data: { lookSlug: 'easy-living-room', eyebrow: 'Shop the room', title: 'An easy living room', subtitle: 'Tap a piece to see it, or add the whole look.' } },
        { id: 'bestsellers', type: 'PRODUCT_RAIL', data: { eyebrow: 'Most loved', title: 'Pieces people come back for', source: 'featured', limit: 8, href: '/shop' } },
        { id: 'materials', type: 'MATERIALS', data: { eyebrow: 'Made properly', title: 'What it’s made of matters', items: [
          { title: 'Seasoned solid wood', body: 'Teak, sheesham and oak, dried for months so joints stay tight through Indian summers and monsoons.', imageKey: wood.key },
          { title: 'Fabrics that breathe', body: 'Linen and cotton blends tested to 50,000 rubs, with covers that come off for cleaning.', imageKey: linen.key },
          { title: 'Joined by hand', body: 'Mortise-and-tenon joints and hand-tied springs from craftspeople with decades at the bench.', imageKey: hands.key },
        ] } },
        { id: 'promise', type: 'PROMISE', data: { items: [
          { title: 'Delivery on your date', body: 'Choose a morning or afternoon slot once your order is confirmed.', icon: 'calendar' },
          { title: 'Installed by our team', body: 'Furniture is assembled and placed, and the packaging taken away.', icon: 'wrench' },
          { title: '7-day returns', body: 'If it isn’t right, we collect it and refund you after inspection.', icon: 'rotate' },
          { title: 'Up to 5-year warranty', body: 'On frames, joints and mechanisms. Details on every product.', icon: 'shield' },
        ] } },
        { id: 'reviews', type: 'REVIEWS', data: { eyebrow: 'In their homes', title: 'What customers say' } },
        { id: 'guides', type: 'GUIDES', data: { eyebrow: 'Buying guides', title: 'Choose with confidence', limit: 3 } },
        { id: 'newsletter', type: 'NEWSLETTER', data: { title: 'New pieces, first', body: 'One email a month about new collections and the makers behind them. No sales spam.' } },
      ] as unknown as Prisma.InputJsonValue,
    },
  });

  const md = (text: string) => [{ id: 'body', type: 'RICH_TEXT', data: { body: text.trim() } }];
  const policies: [string, string, string, string][] = [
    ['shipping', 'Shipping and delivery', 'How and when we deliver, and what to expect on the day.', `
In short: we deliver across India from Salem. Once your order is confirmed you choose a delivery date. Where installation is included, we assemble the furniture and take the packaging away.

## Where we deliver
We deliver to every valid Indian pincode. Salem usually takes about two days, and places further away take around ten working days. Enter your pincode on any product page to see your delivery date and charge.

## Delivery charges
Delivery is free on orders above ₹25,000. Below that, the charge depends on your pincode: ₹299 in Salem and up to ₹999 elsewhere. The charge is shown at checkout before you pay.

## Choosing your slot
After your order is confirmed you will get an email to choose a delivery slot, in a morning or afternoon window. You can change it up to the day before dispatch from your account.

## On the day
- We will call you before we arrive.
- Please make sure the furniture can pass through doors, lifts and stairways. Each product page lists its dimensions.
- Where installation is included, we assemble and place the furniture, and take the packaging away. The product page shows whether it is included for your pincode.

## If something arrives damaged
Tell us within 48 hours with photos, from your order page or by email. We will repair or replace it.`],
    ['returns', 'Returns and refunds', 'How to return a piece and how refunds work.', `
In short: you can return most items within 7 days of delivery. We collect them, inspect them and refund you.

## What can be returned
Most furniture and decor can be returned within 7 days of delivery if it is unused and in its original condition. Made-to-order pieces and some decor items cannot be returned; this is shown on the product page.

## How to return
1. Open your order in your account and choose "Request a return".
2. Pick the items, tell us why, and add photos if anything is damaged.
3. We confirm within one working day and schedule a pickup.

## Refunds
After pickup we inspect the item within two working days. If it passes inspection we refund you:
- Online payments are refunded to the original payment method, usually within 5 to 7 working days.
- Cash on delivery orders are refunded by bank transfer or UPI to the details you share.

Delivery charges are refunded only if the item was damaged or not as described.`],
    ['warranty', 'Warranty', 'What our warranty covers.', `
Every product page shows its warranty period, from 1 to 5 years.

## What is covered
Manufacturing defects in frames, joints, drawer runners, hinges and mechanisms under normal home use.

## What is not covered
Normal wear of fabrics and finishes, damage from misuse, moisture or direct sunlight, and changes in natural materials such as colour variation in wood or cane.

## Making a claim
Email us with your order number and photos. We will arrange an inspection and repair or replace the affected part.`],
    ['cancellation', 'Cancellation', 'Cancelling an order before it ships.', `
You can cancel any order from your account until it leaves our warehouse.

- Online payments are refunded in full to the original payment method.
- Cash on delivery orders are simply cancelled; nothing is charged.

Once an order has been dispatched it cannot be cancelled, but you can return it after delivery under our returns policy.`],
    ['privacy', 'Privacy policy', 'How we collect and use your personal data.', `
We collect only what we need to deliver your order and look after you: your name, email, phone number and delivery address, and the details of your orders.

## How we use it
To process and deliver orders, send order updates, provide support, and, if you opt in, send our monthly newsletter.

## Payments
Card and UPI details are handled by our payment partner Razorpay. We never see or store your card number.

## Your rights
Under the Digital Personal Data Protection Act, 2023 you can ask to see, correct or delete your data. Email us and we will respond within 30 days.

## Grievance officer
For any concern about your data, write to the grievance officer at care@sssfurniture.co.in or call +91 93420 83981.`],
    ['terms', 'Terms of use', 'The terms for using this website and buying from us.', `
By using this website and placing an order you agree to these terms.

## Prices
All prices are in Indian rupees and include GST. We confirm the final price, including any delivery charge, before you pay.

## Orders
An order is accepted when we confirm it by email. We may cancel an order if a product is unavailable or a pricing error occurs, and will refund any payment in full.

## Seller
SSS Furniture (proprietor Yogeshwaran S), 100/179, Erumapalayam Pallikuduthar Kadu (near Govt Ration Store), Saniyasi Gundu, Salem, Tamil Nadu 636015. Phone +91 93420 83981. Our GSTIN is printed on every tax invoice.`],
  ];
  for (const [slug, title, excerpt, body] of policies) {
    await prisma.contentPage.create({ data: { type: 'POLICY', slug, title, excerpt, status: 'ACTIVE', publishedAt: new Date(), blocks: md(body) as unknown as Prisma.InputJsonValue } });
  }

  await prisma.contentPage.create({
    data: {
      type: 'STATIC', slug: 'about', title: 'About SSS Furniture', status: 'ACTIVE', publishedAt: new Date(),
      excerpt: 'Quality, trust and comfort: furniture from Salem, made properly and delivered with care.',
      blocks: md(`
SSS Furniture is a Salem furniture house led by proprietor Yogeshwaran S. We make and supply teak furniture, luxury and recliner sofas, home furnishing and complete office setups, and we stand behind three words: quality, trust and comfort.

## How we make it
Our wood is seasoned for months, our joints are cut by hand, and our fabrics are chosen to breathe in Indian weather. Every piece is checked in our Salem workshop before it leaves.

## Visit us
100/179, Erumapalayam Pallikuduthar Kadu (near Govt Ration Store), Saniyasi Gundu, Salem, Tamil Nadu 636015. Call **+91 93420 83981**.

## How we deliver it
We don't hand our furniture to a courier. Our own teams deliver it on the date you choose, assemble it, place it where you want it and take the packaging away.

## How we price it
One fair price, with no inflated "MRP" to discount from. When a piece is genuinely reduced, we show you by how much.`) as unknown as Prisma.InputJsonValue,
    },
  });

  await prisma.contentPage.create({
    data: {
      type: 'FAQ', slug: 'faq', title: 'Frequently asked questions', status: 'ACTIVE', publishedAt: new Date(),
      blocks: [
        { id: 'orders', type: 'FAQ', data: { title: 'Orders and payment', items: [
          { q: 'Which payment methods do you accept?', a: 'UPI, cards and net banking through Razorpay, and cash on delivery on orders up to ₹50,000 in most pincodes.' },
          { q: 'Do prices include GST?', a: 'Yes. Every price on the site includes GST, and your invoice shows the GST breakdown.' },
          { q: 'Can I get a GST invoice for my business?', a: 'Yes. Add your GSTIN at checkout and it will appear on your tax invoice.' },
        ] } },
        { id: 'delivery', type: 'FAQ', data: { title: 'Delivery and installation', items: [
          { q: 'When will my order arrive?', a: 'Enter your pincode on a product page to see an estimate. After your order is confirmed you choose an exact delivery slot.' },
          { q: 'Do you assemble the furniture?', a: 'Yes. Our team assembles beds, sofas, dining sets and storage on delivery. Smaller pieces marked "easy assembly" come with simple instructions.' },
          { q: 'Will it fit through my door?', a: 'Each product page lists the dimensions. Most pieces fit through an 80 cm door. If you are unsure, contact us with photos before ordering.' },
        ] } },
        { id: 'returns', type: 'FAQ', data: { title: 'Returns', items: [
          { q: 'Can I return something?', a: 'Most items can be returned within 7 days of delivery. We collect it, inspect it and refund you.' },
          { q: 'How long do refunds take?', a: 'Online payments are refunded in 5 to 7 working days after inspection. Cash on delivery refunds are paid by bank transfer or UPI.' },
        ] } },
      ] as unknown as Prisma.InputJsonValue,
    },
  });

  const guides: [string, string, string, string, string][] = [
    ['how-to-choose-a-sofa', 'How to choose a sofa that lasts', '1600210491892-03d54c0aaf87', 'What to look for in the frame, the seat and the fabric, and how to measure your room first.', `
A good sofa should last fifteen years. Most don't make it to five. Here is what makes the difference.

## Start with the frame
Ask what the frame is made of. Kiln-dried hardwood or solid sheesham holds screws and joints tightly for years. Particle board does not. Lift one corner: a good frame barely flexes.

## Then the seat
Pocket springs or sinuous springs under high-resilience foam keep their shape. Cheap foam flattens within a year. Sit for a full minute, not ten seconds.

## Choose fabric for your life
- Homes with children or pets: performance weaves or leather.
- Hot, humid cities: linen and cotton blends breathe better than polyester.
- Removable covers make cleaning far easier.

## Measure twice
Measure the wall, the door, the lift and any tight turns in the stairs. Check the product's width, depth and height against all of them.`],
    ['teak-sheesham-or-oak', 'Teak, sheesham or oak?', '1598928506311-c55ded91a20c', 'How the three woods we use most compare for strength, look and care.', `
All three are excellent furniture woods. They differ in look, weight and how they age.

## Teak
Naturally oily, so it resists moisture and insects. It turns a soft honey-grey over decades. Best for pieces that will see humidity or heavy use.

## Sheesham
Indian rosewood: dense, strong and richly figured with dark streaks. It takes a polish beautifully and is the classic choice for carved and traditional pieces.

## Oak
Pale, straight-grained and very hard. It suits light, modern rooms and small spaces, because pale wood reflects light.

## Caring for solid wood
Use coasters, wipe spills quickly and keep furniture away from direct afternoon sun. Oil or wax every six months.`],
    ['plan-a-small-living-room', 'Planning a small living room', '1631679706909-1844bbd07221', 'Make a compact living room feel generous with the right sizes and a few simple rules.', `
Small rooms don't need small furniture. They need the right furniture, placed well.

## Leave walking space
Keep at least 75 cm for paths through the room and 40 to 45 cm between the sofa and the coffee table.

## Choose raised legs
Sofas and cabinets on legs show more floor, which makes a room feel bigger.

## One large piece beats many small ones
A single generous sofa looks calmer than a sofa plus two armchairs crowded together.

## Light from three heights
Combine a ceiling light, a floor or table lamp and a small accent light. Layered light makes a room feel deeper in the evening.`],
  ];
  for (const [i, [slug, title, photo, excerpt, body]] of guides.entries()) {
    const cover = await image(photo, title, `guide-${slug}`);
    await prisma.contentPage.create({
      data: { type: 'GUIDE', slug, title, excerpt, coverKey: cover.key, authorName: 'The SSS Furniture team', status: 'ACTIVE', publishedAt: new Date(Date.now() - (i + 1) * 9 * 86_400_000), blocks: md(body) as unknown as Prisma.InputJsonValue },
    });
  }

  await prisma.navigationMenu.create({
    data: {
      location: 'footer',
      items: [
        { title: 'Shop', links: [{ label: 'Sofas', href: '/shop/sofas' }, { label: 'Beds', href: '/shop/beds' }, { label: 'Tables', href: '/shop/tables' }, { label: 'Storage', href: '/shop/storage' }, { label: 'All rooms', href: '/rooms' }, { label: 'Collections', href: '/collections' }] },
        { title: 'Help', links: [{ label: 'Track your order', href: '/track' }, { label: 'Shipping and delivery', href: '/policies/shipping' }, { label: 'Returns and refunds', href: '/policies/returns' }, { label: 'Warranty', href: '/policies/warranty' }, { label: 'FAQ', href: '/faq' }, { label: 'Contact us', href: '/contact' }] },
        { title: 'SSS Furniture', links: [{ label: 'About us', href: '/about' }, { label: 'Buying guides', href: '/guides' }, { label: 'Privacy policy', href: '/policies/privacy' }, { label: 'Terms of use', href: '/policies/terms' }, { label: 'Cancellation', href: '/policies/cancellation' }] },
      ] as unknown as Prisma.InputJsonValue,
    },
  });
}

async function seedCustomers(productIds: Map<string, string>, variants: Map<string, { id: string; price: number }[]>, locationId: string) {
  const people = [
    { name: 'Priya Raman', email: 'priya@example.com', phone: '9845012345', password: 'Customer-2026' },
    { name: 'Arjun Mehta', email: 'arjun@example.com', phone: '9820098200', password: 'Customer-2026' },
    { name: 'Kavya Iyer', email: 'kavya@example.com', phone: '9900112233', password: 'Customer-2026' },
  ];
  const reviews: [string, number, string, string][] = [
    ['Sahyadri Chesterfield Sofa', 5, 'Worth every rupee', 'The leather has already started to soften after two months, and the buttoning is perfect. The installation team was careful with our lift and took all the packaging away.'],
    ['Vriksha Coffee Table', 5, 'Beautiful grain, solid build', 'You can see the history in the wood. It is heavy and absolutely steady. Delivered on the date I chose.'],
    ['Noor Velvet Sofa', 4, 'Deep and very comfortable', 'The velvet colour is richer in person than in photos. Seats are deep, so add a cushion if you are short. Great quality overall.'],
    ['Coorg Storage Bed', 5, 'Storage is a game changer', 'The hydraulic lift is smooth and holds open safely. We fit all our winter quilts and suitcases underneath.'],
    ['Pallavi Accent Chair', 5, 'My favourite reading spot', 'Viewing it in 3D before buying helped me choose the colour. It looks exactly like the model.'],
    ['Konkan Dining Set', 4, 'Lovely set, cane is delicate', 'Very sturdy table and the chairs are comfortable. The cane needs a little care, as the guide says.'],
    ['Chettinad Sideboard', 5, 'Gets compliments from every guest', 'The cane doors are gorgeous and practical in Mumbai humidity. Brass handles are a nice touch.'],
    ['Diya Table Lamp', 5, 'Warm, soft light', 'Exactly the glow I wanted for my bedside. Well packed.'],
  ];
  let reviewIdx = 0;
  for (const [pi, person] of people.entries()) {
    const user = await prisma.user.create({
      data: {
        name: person.name, email: person.email, phone: person.phone, emailVerifiedAt: new Date(), passwordHash: await hash(person.password, ARGON),
        addresses: { create: { name: person.name, phone: person.phone, line1: `${12 + pi * 7}, 4th Main Road`, line2: 'HAL 2nd Stage', city: 'Bengaluru', state: 'Karnataka', pincode: '560038', floor: 2, hasLift: true, isDefault: true } },
      },
    });
    const mine = reviews.slice(reviewIdx, reviewIdx + (pi === 0 ? 4 : 2));
    reviewIdx += mine.length;
    for (const [oi, [productName, rating, title, body]] of mine.entries()) {
      const v = variants.get(productName)![0];
      const variant = await prisma.variant.findUniqueOrThrow({ where: { id: v.id }, include: { product: { include: { media: { where: { role: 'GALLERY' }, include: { media: true }, take: 1 } } } } });
      const placed = new Date(Date.now() - (40 - oi * 6 - pi * 3) * 86_400_000);
      const [{ nextval }] = await prisma.$queryRaw<{ nextval: bigint }[]>`SELECT nextval('order_number_seq')`;
      const orderNumber = `SSS-${String(placed.getFullYear()).slice(2)}${String(placed.getMonth() + 1).padStart(2, '0')}-${String(nextval).padStart(6, '0')}`;
      const tax = Math.round((v.price * variant.product.gstRate) / (100 + variant.product.gstRate));
      const order = await prisma.order.create({
        data: {
          orderNumber, userId: user.id, email: user.email, phone: person.phone, name: person.name, status: 'DELIVERED', paymentMethod: 'COD',
          subtotal: v.price, taxTotal: tax, grandTotal: v.price, idempotencyKey: `seed-${orderNumber}`, accessToken: `seed${nextval}token${pi}${oi}`,
          shippingAddress: { name: person.name, phone: person.phone, line1: `${12 + pi * 7}, 4th Main Road`, line2: 'HAL 2nd Stage', city: 'Bengaluru', state: 'Karnataka', pincode: '560038' },
          placedAt: placed, confirmedAt: new Date(placed.getTime() + 3600_000), shippedAt: new Date(placed.getTime() + 3 * 86_400_000), deliveredAt: new Date(placed.getTime() + 4 * 86_400_000),
          items: { create: { variantId: v.id, productId: variant.productId, productName: variant.product.name, productSlug: variant.product.slug, variantTitle: variant.title, sku: variant.sku, imageKey: variant.product.media[0]?.media.storageKey, unitPrice: v.price, mrp: variant.mrp, quantity: 1, gstRate: variant.product.gstRate, taxAmount: tax, lineTotal: v.price, hsnCode: variant.product.hsnCode, installationIncluded: variant.product.installationIncluded } },
          payments: { create: { method: 'COD', provider: 'cod', amount: v.price, status: 'COLLECTED', collectedAt: new Date(placed.getTime() + 4 * 86_400_000), collectedBy: 'Delivery team' } },
          events: { create: [
            { toStatus: 'PENDING_CONFIRMATION', actorType: 'CUSTOMER', note: 'Placed with cash on delivery', createdAt: placed },
            { fromStatus: 'PENDING_CONFIRMATION', toStatus: 'CONFIRMED', actorType: 'STAFF', note: 'COD order confirmed with customer', createdAt: new Date(placed.getTime() + 3600_000) },
            { fromStatus: 'CONFIRMED', toStatus: 'PROCESSING', actorType: 'STAFF', createdAt: new Date(placed.getTime() + 2 * 86_400_000) },
            { fromStatus: 'PROCESSING', toStatus: 'SHIPPED', actorType: 'STAFF', createdAt: new Date(placed.getTime() + 3 * 86_400_000) },
            { fromStatus: 'SHIPPED', toStatus: 'DELIVERED', actorType: 'STAFF', createdAt: new Date(placed.getTime() + 4 * 86_400_000) },
          ] },
        },
        include: { items: true },
      });
      await prisma.stockReservation.create({ data: { orderId: order.id, variantId: v.id, locationId, quantity: 1, status: 'CONSUMED', expiresAt: placed } });
      await prisma.product.update({ where: { id: variant.productId }, data: { soldCount: { increment: 1 } } });
      await prisma.review.create({
        data: { productId: variant.productId, userId: user.id, orderItemId: order.items[0].id, rating, title, body, status: 'APPROVED', createdAt: new Date(order.deliveredAt!.getTime() + 5 * 86_400_000) },
      });
    }
  }
  // Ratings and a little sales history so "most loved" ordering looks real
  for (const id of productIds.values()) {
    const agg = await prisma.review.aggregate({ where: { productId: id, status: 'APPROVED' }, _avg: { rating: true }, _count: { rating: true } });
    await prisma.product.update({ where: { id }, data: { ratingAvg: agg._avg.rating ?? 0, ratingCount: agg._count.rating } });
  }
  await prisma.user.create({ data: { name: 'Rohan Das', email: 'rohan@example.com', phone: '9123456780', emailVerifiedAt: new Date() } });
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
