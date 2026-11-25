import { page } from './page.mjs';

const price = 990;
const idPattern = /^[0-9a-f-]{36}$/i;
const intents = ['yes', 'cheaper', 'no'];
const formats = ['once', 'regular', 'unsure'];
const labels = {
  yes: 'Готовы купить', cheaper: 'Купили бы дешевле', no: 'Не купили бы',
  once: 'Разовый набор', regular: 'Регулярная доставка', unsure: 'Пока не решили'
};
const json = (value, status = 200) => Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } });
const html = body => new Response(body, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
const escape = value => String(value).replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/') return html(page(price));
    if (request.method === 'GET' && url.pathname === '/results') {
      const { results: rows } = await env.DB.prepare('SELECT intent, format, COUNT(*) AS total FROM responses WHERE price = ? GROUP BY intent, format').bind(price).all();
      const { total: visits } = await env.DB.prepare('SELECT COUNT(*) AS total FROM visits').first();
      const count = (key, value) => rows.filter(row => row[key] === value).reduce((sum, row) => sum + row.total, 0);
      const total = rows.reduce((sum, row) => sum + row.total, 0);
      const yes = count('intent', 'yes');
      const routes = await env.DB.prepare('SELECT visits.source, COUNT(*) AS visits, COUNT(responses.id) AS replies, SUM(CASE WHEN responses.intent = \'yes\' THEN 1 ELSE 0 END) AS yes FROM visits LEFT JOIN responses ON visits.id = responses.id AND responses.price = ? GROUP BY visits.source ORDER BY visits DESC').bind(price).all();
      return html(`<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Результаты · С вечера</title><style>body{max-width:760px;margin:48px auto;padding:0 24px;background:#faf5ed;color:#301625;font:18px/1.6 system-ui}a{color:#8e3057}table{border-collapse:collapse;width:100%;font-size:15px}td,th{text-align:left;padding:8px;border-bottom:1px solid #dacbd0}</style><a href="/">С вечера</a><h1>Результаты теста</h1><p>Набор за ${price} ₽ · ${visits} браузеров · ${total} ответов</p><p><strong>${yes} готовы купить</strong>${total ? ` · ${Math.round(100 * yes / total)}% ответивших` : ''}${visits ? ` · ${Math.round(100 * yes / visits)}% посетителей` : ''}</p><ul>${intents.map(key => `<li>${labels[key]} — ${count('intent', key)}</li>`).join('')}</ul><h2>Формат среди готовых купить</h2><ul>${formats.map(key => `<li>${labels[key]} — ${rows.filter(row => row.intent === 'yes' && row.format === key).reduce((sum, row) => sum + row.total, 0)}</li>`).join('')}</ul><h2>По источникам</h2><table><thead><tr><th>Источник</th><th>Визиты</th><th>Ответы</th><th>Готовы купить</th></tr></thead><tbody>${routes.results.map(row => `<tr><td>${escape(row.source)}</td><td>${row.visits}</td><td>${row.replies}</td><td>${row.yes}</td></tr>`).join('')}</tbody></table><p>Опрос измеряет заявленную готовность купить. Повторные визиты с того же браузера учитываются один раз.</p></html>`);
    }
    if (request.method !== 'POST' || !['/api/visit', '/api/response'].includes(url.pathname)) return new Response('Страница не найдена', { status: 404 });
    if (request.headers.get('Origin') && request.headers.get('Origin') !== url.origin) return json({ error: 'Неверный источник запроса' }, 403);
    try {
      const raw = await request.text();
      if (raw.length > 1500) return json({ error: 'Слишком длинный запрос' }, 413);
      const data = JSON.parse(raw);
      if (typeof data?.id !== 'string' || !idPattern.test(data.id)) return json({ error: 'Неверный идентификатор' }, 400);
      const source = typeof data.source === 'string' && /^[a-z0-9_.-]{1,40}$/i.test(data.source) ? data.source.toLowerCase() : 'direct';
      const visit = env.DB.prepare('INSERT OR IGNORE INTO visits (id, source) VALUES (?, ?)').bind(data.id, source);
      if (url.pathname === '/api/visit') {
        await visit.run();
        return json({ ok: true });
      }
      if (!intents.includes(data.intent) || !formats.includes(data.format) || data.price !== price) return json({ error: 'Проверьте ответы' }, 400);
      await env.DB.batch([visit, env.DB.prepare('INSERT OR IGNORE INTO responses (id, intent, format, price) VALUES (?, ?, ?, ?)').bind(data.id, data.intent, data.format, price)]);
      return json({ ok: true });
    } catch (error) {
      return error instanceof SyntaxError ? json({ error: 'Неверный запрос' }, 400) : json({ error: 'Ответ пока не сохранился. Попробуйте ещё раз.' }, 503);
    }
  }
};
