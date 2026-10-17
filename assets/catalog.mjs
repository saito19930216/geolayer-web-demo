// Shared by the browser, publication script and tests. No Android or DOM dependencies.
export const CATEGORIES = Object.freeze({
  CAFE: 'カフェ', SOUVENIR: '土産物店', RESTAURANT: '飲食店',
  ATTRACTION: '観光施設', SHOP: '工芸・雑貨', OTHER: 'その他',
});
const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const own = (object, key) => Object.hasOwn(object, key);
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const string = (value, max = 500) => typeof value === 'string' && value.trim().length > 0 && value.length <= max;
export const validId = value => typeof value === 'string' && value.length <= 64 && ID.test(value);

export class CatalogError extends Error {
  constructor(code) { super(code); this.name = 'CatalogError'; this.code = code; }
}
function check(condition, code = 'INVALID_DATA') {
  if (!condition) throw new CatalogError(code);
}
function fields(value, required, optional = []) {
  check(record(value));
  check(required.every(key => own(value, key)));
  check(Object.keys(value).every(key => required.includes(key) || optional.includes(key)));
}

export function validateCatalog(value) {
  fields(value, ['schemaVersion', 'contentVersion', 'stores']);
  check(value.schemaVersion === 1, 'UNSUPPORTED_SCHEMA');
  check(typeof value.contentVersion === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(value.contentVersion));
  check(Array.isArray(value.stores) && value.stores.length <= 1000);
  const ids = new Set();
  for (const store of value.stores) {
    fields(store, ['id', 'name', 'description', 'category', 'latitude', 'longitude', 'isPublished', 'advertisement'], ['openingHours']);
    check(validId(store.id), 'INVALID_ID');
    check(!ids.has(store.id), 'DUPLICATE_ID');
    ids.add(store.id);
    check(string(store.name, 100) && string(store.description, 8000));
    check(typeof store.category === 'string' && own(CATEGORIES, store.category));
    check(Number.isFinite(store.latitude) && Math.abs(store.latitude) <= 90);
    check(Number.isFinite(store.longitude) && Math.abs(store.longitude) <= 180);
    check(typeof store.isPublished === 'boolean');
    check(store.openingHours == null || string(store.openingHours, 1000));
    fields(store.advertisement, ['image', 'news']);
    const { image, news } = store.advertisement;
    if (image !== null) {
      fields(image, ['assetKey', 'alternativeText']);
      check(validId(image.assetKey) && string(image.alternativeText, 300));
    }
    check(Array.isArray(news) && news.length <= 100);
    const newsIds = new Set();
    for (const item of news) {
      fields(item, ['id', 'title', 'body', 'publishedAtEpochMillis']);
      check(validId(item.id) && !newsIds.has(item.id), 'INVALID_NEWS_ID');
      newsIds.add(item.id);
      check(string(item.title, 200) && string(item.body, 8000));
      check(Number.isSafeInteger(item.publishedAtEpochMillis) && item.publishedAtEpochMillis >= 0 &&
        item.publishedAtEpochMillis <= 8_640_000_000_000_000);
    }
  }
  return value;
}

export function publicCatalog(value) {
  validateCatalog(value); // Validate private entries too; duplicate IDs cannot be hidden by filtering.
  return { schemaVersion: value.schemaVersion, contentVersion: value.contentVersion,
    stores: value.stores.filter(store => store.isPublished) };
}

export function readStoreId(search) {
  const values = new URLSearchParams(search).getAll('id');
  if (values.length !== 1 || !validId(values[0])) throw new CatalogError('INVALID_ID');
  return values[0];
}

export function findPublicStore(catalog, id) {
  if (!validId(id)) throw new CatalogError('INVALID_ID');
  return catalog.stores.find(store => store.id === id && store.isPublished) ?? null;
}

export function storeHref(id) {
  if (!validId(id)) throw new CatalogError('INVALID_ID');
  return `./store.html?id=${encodeURIComponent(id)}`;
}
