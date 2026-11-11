export const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);

/** Appends -2, -3… until the slug is free. */
export async function uniqueSlug(base: string, taken: (slug: string) => Promise<boolean>) {
  const root = slugify(base) || 'item';
  let slug = root;
  for (let i = 2; await taken(slug); i++) slug = `${root}-${i}`;
  return slug;
}
