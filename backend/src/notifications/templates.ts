import { formatInr } from '../common/money';

/** Plain, table-based HTML that renders consistently in Gmail, Outlook and Apple Mail. */
interface Rendered {
  subject: string;
  html: string;
  text: string;
}

const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

function layout(storeName: string, heading: string, bodyHtml: string, cta?: { label: string; url: string }) {
  const button = cta
    ? `<tr><td style="padding:8px 0 24px"><a href="${esc(cta.url)}" style="display:inline-block;background:#1F4E4A;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:999px;font:600 14px/1 Helvetica,Arial,sans-serif">${esc(cta.label)}</a></td></tr>`
    : '';
  return `<!doctype html><html><body style="margin:0;background:#F4F2EE;padding:24px 12px">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center">
<table role="presentation" width="560" cellspacing="0" cellpadding="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:16px;padding:32px">
<tr><td style="font:600 18px/1.2 Georgia,serif;letter-spacing:0.12em;text-transform:uppercase;color:#171614;padding-bottom:28px">${esc(storeName)}</td></tr>
<tr><td style="font:500 26px/1.25 Georgia,serif;color:#171614;padding-bottom:16px">${esc(heading)}</td></tr>
<tr><td style="font:400 15px/1.6 Helvetica,Arial,sans-serif;color:#3F3C37;padding-bottom:16px">${bodyHtml}</td></tr>
${button}
<tr><td style="border-top:1px solid #E7E3DB;padding-top:16px;font:400 12px/1.5 Helvetica,Arial,sans-serif;color:#8A857C">You are receiving this email because of activity on your ${esc(storeName)} account or order.</td></tr>
</table></td></tr></table></body></html>`;
}

export interface OrderSummary {
  orderNumber: string;
  name: string;
  grandTotal: number;
  paymentMethod: string;
  items: { productName: string; variantTitle: string; quantity: number; lineTotal: number }[];
  url: string;
}

function itemsTable(o: OrderSummary) {
  const rows = o.items
    .map(
      (i) =>
        `<tr><td style="padding:6px 0">${esc(i.productName)}<br><span style="color:#8A857C;font-size:13px">${esc(i.variantTitle)} × ${i.quantity}</span></td><td align="right" style="padding:6px 0">${formatInr(i.lineTotal)}</td></tr>`,
    )
    .join('');
  return `<table width="100%" style="border-collapse:collapse;margin:8px 0 4px">${rows}<tr><td style="padding-top:10px;border-top:1px solid #E7E3DB;font-weight:600">Total</td><td align="right" style="padding-top:10px;border-top:1px solid #E7E3DB;font-weight:600">${formatInr(o.grandTotal)}</td></tr></table>`;
}

const itemsText = (o: OrderSummary) =>
  o.items.map((i) => `- ${i.productName} (${i.variantTitle}) x${i.quantity}: ${formatInr(i.lineTotal)}`).join('\n') +
  `\nTotal: ${formatInr(o.grandTotal)}`;

export const templates = {
  otp(store: string, d: { code: string; purpose: 'LOGIN' | 'RESET' }): Rendered {
    const what = d.purpose === 'RESET' ? 'reset your password' : 'sign in';
    return {
      subject: `${d.code} is your ${store} code`,
      html: layout(store, 'Your one-time code', `Use this code to ${what}. It expires in 10 minutes.<div style="font:600 34px/1 'Courier New',monospace;letter-spacing:0.3em;color:#171614;padding:20px 0">${esc(d.code)}</div>If you didn't ask for this code, you can ignore this email.`),
      text: `Your ${store} code is ${d.code}. Use it to ${what}. It expires in 10 minutes.`,
    };
  },

  orderPlaced(store: string, o: OrderSummary & { cod: boolean }): Rendered {
    const lead = o.cod
      ? `Thank you, ${esc(o.name)}. We have received your cash-on-delivery order <b>${esc(o.orderNumber)}</b>. Our team will call you within one working day to confirm it before we prepare it for delivery.`
      : `Thank you, ${esc(o.name)}. Your order <b>${esc(o.orderNumber)}</b> is placed.`;
    return {
      subject: `Order ${o.orderNumber} received`,
      html: layout(store, 'We have your order', `${lead}${itemsTable(o)}`, { label: 'View your order', url: o.url }),
      text: `${o.cod ? 'Cash on delivery order received. We will call to confirm.' : 'Order placed.'} ${o.orderNumber}\n${itemsText(o)}\n${o.url}`,
    };
  },

  orderConfirmed(store: string, o: OrderSummary): Rendered {
    return {
      subject: `Order ${o.orderNumber} confirmed`,
      html: layout(store, 'Your order is confirmed', `Good news, ${esc(o.name)}. Order <b>${esc(o.orderNumber)}</b> is confirmed. You can now choose a delivery slot that suits you.${itemsTable(o)}`, { label: 'Choose a delivery slot', url: `${o.url}/schedule` }),
      text: `Order ${o.orderNumber} is confirmed. Choose a delivery slot: ${o.url}/schedule\n${itemsText(o)}`,
    };
  },

  orderShipped(store: string, o: OrderSummary & { slot?: string | null; note?: string | null }): Rendered {
    const when = o.slot ? ` It is due on <b>${esc(o.slot)}</b>.` : '';
    return {
      subject: `Order ${o.orderNumber} is on its way`,
      html: layout(store, 'On its way to you', `Order <b>${esc(o.orderNumber)}</b> has left our warehouse.${when}${o.note ? `<br><br>${esc(o.note)}` : ''}`, { label: 'Track your order', url: o.url }),
      text: `Order ${o.orderNumber} is on its way.${o.slot ? ` Due ${o.slot}.` : ''} ${o.url}`,
    };
  },

  orderDelivered(store: string, o: OrderSummary & { reviewUrl: string }): Rendered {
    return {
      subject: `Order ${o.orderNumber} delivered`,
      html: layout(store, 'Delivered. Enjoy it.', `Order <b>${esc(o.orderNumber)}</b> has been delivered. When you've lived with it for a while, we'd love to hear what you think.`, { label: 'Write a review', url: o.reviewUrl }),
      text: `Order ${o.orderNumber} has been delivered. Write a review: ${o.reviewUrl}`,
    };
  },

  orderCancelled(store: string, o: OrderSummary & { reason?: string | null; refund?: boolean }): Rendered {
    const refund = o.refund ? ' Your refund has been started and usually reaches your account in 5 to 7 working days.' : '';
    return {
      subject: `Order ${o.orderNumber} cancelled`,
      html: layout(store, 'Your order is cancelled', `Order <b>${esc(o.orderNumber)}</b> has been cancelled.${o.reason ? ` Reason: ${esc(o.reason)}.` : ''}${refund}`, { label: 'View order', url: o.url }),
      text: `Order ${o.orderNumber} has been cancelled.${refund}`,
    };
  },

  returnUpdate(store: string, d: { returnNumber: string; heading: string; message: string; url: string }): Rendered {
    return {
      subject: `Return ${d.returnNumber}: ${d.heading}`,
      html: layout(store, d.heading, esc(d.message), { label: 'View return', url: d.url }),
      text: `${d.heading}. ${d.message} ${d.url}`,
    };
  },

  refundProcessed(store: string, d: { orderNumber: string; amount: number; method: string; url: string }): Rendered {
    return {
      subject: `Refund for order ${d.orderNumber}`,
      html: layout(store, 'Your refund is on its way', `We have processed a refund of <b>${formatInr(d.amount)}</b> for order <b>${esc(d.orderNumber)}</b> by ${esc(d.method)}.`, { label: 'View order', url: d.url }),
      text: `Refund of ${formatInr(d.amount)} processed for order ${d.orderNumber} by ${d.method}.`,
    };
  },

  staffLocked(store: string, d: { email: string; minutes: number }): Rendered {
    return {
      subject: `${store} admin: account locked after failed sign-ins`,
      html: layout(store, 'Admin account locked', `The admin account <b>${esc(d.email)}</b> was locked for ${d.minutes} minutes after 5 failed sign-in attempts. If this wasn't you, change the password and review the audit log.`),
      text: `Admin account ${d.email} locked for ${d.minutes} minutes after 5 failed sign-ins.`,
    };
  },

  diskSpace(store: string, d: { percent: number; freeGb: number; level: number }): Rendered {
    return {
      subject: `${store} server: disk ${d.percent}% full`,
      html: layout(store, `Disk is ${d.percent}% full`, `The server disk has passed ${d.level}% and has <b>${d.freeGb} GB</b> free. Check media uploads, the image cache and old backups before it fills up: a full disk stops orders being saved.`),
      text: `Server disk ${d.percent}% full (${d.freeGb} GB free). Passed the ${d.level}% alert level.`,
    };
  },

  staffInvite(store: string, d: { name: string; email: string; password: string; url: string }): Rendered {
    return {
      subject: `You've been invited to the ${store} admin`,
      html: layout(store, `Welcome, ${esc(d.name)}`, `An account has been created for <b>${esc(d.email)}</b>. Your temporary password is <b style="font-family:'Courier New',monospace">${esc(d.password)}</b>. You will set up two-factor authentication when you first sign in, then please change this password.`, { label: 'Open the admin', url: d.url }),
      text: `Admin account created for ${d.email}. Temporary password: ${d.password}. Sign in at ${d.url}`,
    };
  },
};

export type TemplateName = keyof typeof templates;
