import { CATEGORIES, CatalogError, validateCatalog, readStoreId, findPublicStore, storeHref } from './catalog.mjs';

const THEMES = Object.freeze({
  CAFE: ['coffee', 'coffee', 'COFFEE & PAUSE'],
  SOUVENIR: ['souvenir', 'gift', 'MEMORIES TO TAKE HOME'],
  RESTAURANT: ['restaurant', 'meal', 'A TASTE OF THE SEASON'],
  SHOP: ['craft', 'pottery', 'MADE WITH CARE'],
});
// Only explicitly reviewed local assets may be displayed. Never use a JSON value as a URL.
const IMAGE_ASSETS = Object.freeze({});
const status = document.querySelector('#catalog-status');
const list = document.querySelector('#store-list');
const detail = document.querySelector('#store-detail');

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}
function fallbackMedia(store) {
  const [theme, shape, label] = THEMES[store.category] ?? ['other', 'gift', 'A LOCAL STORY'];
  const visual = element('div', undefined, 'visual');
  visual.dataset.theme = theme;
  visual.setAttribute('role', 'img');
  visual.setAttribute('aria-label', `${CATEGORIES[store.category]}のイメージ図。広告写真は未登録です。`);
  const art = element('div', undefined, `object-art ${shape}`);
  art.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < 4; i++) art.append(element('span', undefined, 'shape'));
  const type = element('span', label, 'art-type');
  type.setAttribute('aria-hidden', 'true');
  const caption = element('span', 'イメージ図 / 広告写真は未登録', 'art-caption');
  visual.append(type, art, caption);
  return visual;
}
function mediaFor(store) {
  const image = store.advertisement.image;
  const source = image && Object.hasOwn(IMAGE_ASSETS, image.assetKey) ? IMAGE_ASSETS[image.assetKey] : null;
  if (!source) return fallbackMedia(store);
  const img = element('img');
  img.alt = image.alternativeText;
  img.src = source;
  img.addEventListener('error', () => img.replaceWith(fallbackMedia(store)), { once: true });
  return img;
}
function cardFor(store) {
  const link = element('a', undefined, 'store-card');
  link.href = storeHref(store.id);
  link.dataset.storeId = store.id;
  const content = element('div', undefined, 'card-content');
  const top = element('div', undefined, 'card-topline');
  top.append(element('span', CATEGORIES[store.category], 'category-label'), element('span', '架空店舗', 'mini-badge'));
  const title = element('div', undefined, 'card-title-line');
  const arrow = element('span', '↗', 'card-arrow');
  arrow.setAttribute('aria-hidden', 'true');
  title.append(element('h3', store.name), arrow);
  content.append(top, title, element('p', store.description, 'card-description'));
  link.append(mediaFor(store), content);
  return link;
}
function renderStore(store) {
  document.title = `${store.name} — GeoLayer デモ広告`;
  document.querySelector('#store-name').textContent = store.name;
  document.querySelector('#store-category').textContent = CATEGORIES[store.category];
  document.querySelector('#store-description').textContent = store.description;
  document.querySelector('#store-media').replaceChildren(mediaFor(store));
  const hours = document.querySelector('#hours-section');
  hours.hidden = !store.openingHours;
  document.querySelector('#store-hours').textContent = store.openingHours ?? '';
  const news = document.querySelector('#store-news');
  news.replaceChildren();
  const formatter = new Intl.DateTimeFormat('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Asia/Tokyo' });
  for (const item of [...store.advertisement.news].sort((a, b) => b.publishedAtEpochMillis - a.publishedAtEpochMillis)) {
    const article = element('article', undefined, 'news-item');
    const date = new Date(item.publishedAtEpochMillis);
    const time = element('time', formatter.format(date));
    time.dateTime = date.toISOString();
    article.append(time, element('h3', item.title), element('p', item.body));
    news.append(article);
  }
  if (!store.advertisement.news.length) news.append(element('p', '新しいお知らせは、まだありません。', 'no-news'));
  detail.hidden = false;
}

function showError(error) {
  let title = '店舗情報を読み込めませんでした';
  let message = '通信状況をご確認のうえ、もう一度お試しください。';
  let retry = true;
  if (error.code === 'INVALID_ID') {
    title = '店舗URLを確認してください';
    message = '店舗IDが指定されていないか、URLの形式が正しくありません。店舗一覧からお選びください。';
    retry = false;
  } else if (error.code === 'NOT_FOUND') {
    title = '店舗が見つかりません';
    message = 'この店舗は登録されていないか、現在公開されていません。店舗一覧からお選びください。';
    retry = false;
  } else if (error instanceof CatalogError || error instanceof SyntaxError) {
    message = '掲載データに問題があるため表示できません。時間をおいて、もう一度お試しください。';
  }
  status.replaceChildren(element('h2', title), element('p', message));
  if (retry) {
    const button = element('button', 'もう一度読み込む', 'button');
    button.type = 'button';
    button.addEventListener('click', () => { button.disabled = true; loadPage(); }, { once: true });
    status.append(button);
  }
  if (detail) {
    document.title = `${title} — GeoLayer`;
    const back = element('a', 'GeoLayerトップへ戻る', 'text-link');
    back.href = './index.html#stores';
    status.append(element('br'), back);
  }
}

async function loadPage() {
  status.textContent = '店舗情報を読み込んでいます。';
  status.setAttribute('aria-busy', 'true');
  if (list) list.replaceChildren();
  if (detail) detail.hidden = true;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const id = detail ? readStoreId(location.search) : null;
    const response = await fetch(new URL('../data/stores.json', import.meta.url), { signal: controller.signal, cache: 'no-cache' });
    if (!response.ok) throw new Error('Catalog request failed');
    const catalog = validateCatalog(await response.json());
    if (detail) {
      const store = findPublicStore(catalog, id);
      if (!store) throw new CatalogError('NOT_FOUND');
      renderStore(store);
      status.replaceChildren();
    } else {
      const stores = catalog.stores.filter(store => store.isPublished);
      list.replaceChildren(...stores.map(cardFor));
      status.textContent = stores.length ? '' : '現在、掲載中のデモ店舗はありません。';
    }
  } catch (error) { showError(error); }
  finally { clearTimeout(timeout); status.setAttribute('aria-busy', 'false'); }
}

loadPage();
