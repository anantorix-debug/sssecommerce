export interface Img {
  url: string;
  width: number | null;
  height: number | null;
  alt: string;
  placeholder: string | null;
}

export interface ProductCard {
  id: string;
  slug: string;
  name: string;
  tagline: string | null;
  badge: string | null;
  category: { name: string; slug: string };
  price: number;
  mrp: number | null;
  image: Img | null;
  hoverImage: Img | null;
  swatches: { id: string; value: string; hex: string | null; image: Img | null }[];
  material: string | null;
  ratingAvg: number;
  ratingCount: number;
  has3d: boolean;
  leadTimeDays: number;
  defaultVariantId: string | null;
}

export interface ProductList {
  items: ProductCard[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
  sort: string;
  correctedQuery?: string | null;
  facets: {
    attributes: { key: string; label: string; values: { value: string; count: number }[] }[];
    finishes: { value: string; hex: string | null; count: number }[];
    price: { min: number; max: number };
  };
}

export interface Review {
  id: string;
  rating: number;
  title: string;
  body: string;
  photos: string[];
  reply: string | null;
  author: string;
  verified: boolean;
  createdAt: string;
}

export interface ProductDetail {
  id: string;
  slug: string;
  name: string;
  brand: string;
  tagline: string | null;
  badge: string | null;
  description: string;
  materials: string | null;
  careInfo: string | null;
  warrantyMonths: number;
  returnable: boolean;
  returnWindowDays: number;
  installationIncluded: boolean;
  assemblyRequired: boolean;
  codAllowed: boolean;
  category: { name: string; slug: string };
  breadcrumbs: { label: string; href: string }[];
  seo: { title: string; description: string };
  options: { id: string; name: string; values: { id: string; value: string; hex: string | null; modelVariant: string | null }[] }[];
  variants: {
    id: string;
    sku: string;
    title: string;
    price: number;
    mrp: number | null;
    optionValueIds: string[];
    dimensions: { length: number | null; width: number | null; height: number | null };
    weightKg: number | null;
    leadTimeDays: number;
    maxPerOrder: number;
    isDefault: boolean;
  }[];
  media: (Img & { id: string; role: string; optionValueId: string | null })[];
  model3d: { url: string; poster: string | null; bytes: number } | null;
  attributes: { key: string; label: string; value: string }[];
  rooms: { name: string; slug: string }[];
  collections: { name: string; slug: string }[];
  rating: { average: number; count: number; distribution: { rating: number; count: number }[] };
  reviews: Review[];
  completeTheLook: ProductCard[];
  related: ProductCard[];
  redirect?: string;
}

export interface Look {
  name: string;
  slug: string;
  description: string | null;
  room: { name: string; slug: string } | null;
  image: Img;
  hotspots: { id: string; x: number; y: number; product: ProductCard }[];
  totalPrice: number;
}

export interface Room {
  name: string;
  slug: string;
  tagline: string | null;
  intro: string | null;
  image: string | null;
  productCount?: number;
}

export interface Collection {
  name: string;
  slug: string;
  tagline: string | null;
  intro: string | null;
  image: string | null;
  productCount?: number;
}

export interface Navigation {
  categories: {
    name: string;
    slug: string;
    image: string | null;
    children: { name: string; slug: string }[];
    fromPrice: number | null;
    count: number;
    bestseller: ProductCard | null;
  }[];
  rooms: Room[];
  collections: Collection[];
}

export interface PublicSettings {
  store: { name: string; email: string; phone: string; supportHours: string; address: string; legalName: string; gstin: string };
  announcement: { text: string; href: string } | null;
  payments: { online: boolean; mode: 'test' | 'live'; cod: boolean; codLimit: number; emi: boolean };
  freeDeliveryAbove: number;
  /** Cities with active delivery pincodes, busiest first. */
  deliveryCities: string[];
  /** Every valid Indian pincode is served (listed pincodes only override terms or block). */
  deliversAllIndia: boolean;
  googleClientId: string | null;
  footer: { title: string; links: { label: string; href: string }[] }[];
}

export interface Delivery {
  pincode: string;
  serviceable: boolean;
  /** Known only for listed pincodes; all-India deliveries leave these empty. */
  city?: string | null;
  state?: string | null;
  /** Town or block from India Post, for "Deliver to 637214 · Tiruchengodu, Namakkal". */
  area?: string | null;
  listed?: boolean;
  /** Why a pincode was refused. */
  reason?: 'INVALID' | 'BLOCKED' | 'OUTSIDE_AREA' | null;
  codAvailable?: boolean;
  installationAvailable?: boolean;
  installationIncluded?: boolean;
  deliveryFee?: number;
  leadDays?: number;
  estimate?: { from: string; to: string };
}

export interface CartLine {
  id: string;
  variantId: string;
  productId: string;
  slug: string;
  name: string;
  variantTitle: string;
  sku: string;
  image: Img | null;
  unitPrice: number;
  mrp: number | null;
  quantity: number;
  lineTotal: number;
  discount: number;
  available: number;
  maxQuantity: number;
  leadTimeDays: number;
  installationIncluded: boolean;
  codAllowed: boolean;
  notices: string[];
}

export interface Cart {
  id: string | null;
  pincode: string | null;
  items: CartLine[];
  itemCount: number;
  coupon: { code: string; discount: number; valid: boolean; message: string } | null;
  delivery: Delivery | null;
  summary: { subtotal: number; mrpTotal: number; savings: number; discount: number; delivery: number; freeDeliveryAbove: number; total: number; taxIncluded: number };
  payment: {
    online: { offered: boolean; available: boolean; mode: 'test' | 'live' };
    cod: { offered: boolean; available: boolean; reason: string | null; limit: number };
    emi: { available: boolean };
  };
  maxLeadDays: number;
  issues: { code: string; message: string }[];
}

export interface User {
  id: string;
  email: string;
  name: string | null;
  phone: string | null;
  marketingOptIn: boolean;
  hasPassword: boolean;
  googleLinked: boolean;
}

export interface Address {
  id: string;
  name: string;
  phone: string;
  line1: string;
  line2: string | null;
  landmark: string | null;
  city: string;
  state: string;
  pincode: string;
  floor: number | null;
  hasLift: boolean;
  isDefault: boolean;
}

export type OrderStatus = 'PENDING_PAYMENT' | 'PENDING_CONFIRMATION' | 'CONFIRMED' | 'PROCESSING' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED' | 'EXPIRED';

export interface OrderDetail {
  orderNumber: string;
  status: OrderStatus;
  statusLabel: string;
  paymentMethod: 'ONLINE' | 'COD';
  placedAt: string;
  confirmedAt: string | null;
  shippedAt: string | null;
  deliveredAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  reservationExpiresAt: string | null;
  trackingNote: string | null;
  email: string;
  phone: string;
  name: string;
  shippingAddress: { name: string; phone: string; line1: string; line2?: string | null; landmark?: string | null; city: string; state: string; pincode: string };
  totals: { subtotal: number; discount: number; delivery: number; taxIncluded: number; total: number; couponCode: string | null };
  items: {
    id: string;
    productName: string;
    productSlug: string;
    variantTitle: string;
    sku: string;
    image: string | null;
    unitPrice: number;
    quantity: number;
    lineTotal: number;
    installationIncluded: boolean;
    canReview: boolean;
    review: { id: string; status: string } | null;
    returnableQuantity: number;
    returnWindowDays: number;
  }[];
  timeline: { status: OrderStatus; label: string; at: string; note: string | null }[];
  payment: { method: string; status: string; amount: number } | null;
  invoice: { number: string; issuedAt: string } | null;
  deliverySlot: { date: string; window: string } | null;
  installation: { date: string; window: string; status: string } | null;
  returns: { id: string; returnNumber: string; status: string; createdAt: string }[];
  refunds: { amount: number; status: string; method: string; createdAt: string }[];
  actions: { canCancel: boolean; canSchedule: boolean; canPay: boolean; canReturn: boolean };
}

export interface PaymentStart {
  orderNumber: string;
  accessToken: string;
  status: OrderStatus;
  paymentMethod: 'ONLINE' | 'COD';
  total: number;
  reservationExpiresAt: string | null;
  razorpay: {
    keyId: string;
    mode: 'test' | 'live';
    hiddenMethods: string[];
    orderId: string;
    amount: number;
    currency: 'INR';
    prefill: { name: string; email: string; contact: string };
  } | null;
}

export interface Block {
  id: string;
  type: string;
  data: Record<string, any>;
}

export interface ContentPage {
  type: 'STATIC' | 'POLICY' | 'GUIDE' | 'FAQ';
  slug: string;
  title: string;
  excerpt: string | null;
  cover: Img | null;
  author: string | null;
  publishedAt: string | null;
  updatedAt: string;
  seo: { title: string; description: string };
  blocks: Block[];
}

export interface Guide {
  slug: string;
  title: string;
  excerpt: string | null;
  author: string | null;
  publishedAt: string | null;
  cover: Img | null;
  readMinutes: number;
}
