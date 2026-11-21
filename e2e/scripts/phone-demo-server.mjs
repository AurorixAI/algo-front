/**
 * The helper page of the phone stand: three sign-in buttons (forms that POST to the passwordless sign-in of the stand, so the stand's cookies come
 * from the form itself - no password is typed or stored anywhere) and the links to the screens.  Static, no state.
 * Started detached by e2e/scripts/phone-demo.mjs; stopped by `npm run e2e:down`.   usage: node phone-demo-server.mjs <port> <authPort> <frontPort>
 */
import http from "node:http";

const [port, authPort, frontPort] = process.argv.slice(2).map(Number);
const AUTH = `http://localhost:${authPort}/api/v1/auth/dev-login`;
const FRONT = `http://localhost:${frontPort}`;
const links = [
  ["Оплаты (владелец)", "/owner/payments"],
  ["Главная владельца", "/owner/dashboard"],
  ["Группы", "/owner/groups"],
  ["Ученики", "/owner/students"],
  ["Оплаты (администратор)", "/admin/payments"],
];
const button = (role, label) => `<form method="post" action="${AUTH}?role=${role}"><button type="submit" data-testid="login-${role}">${label}</button></form>`;
const page = `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>ALGO: телефонный стенд</title><style>
body{font:17px -apple-system,system-ui,sans-serif;margin:0;padding:20px 16px;background:#f6f7f9;color:#111}
h1{font-size:20px;margin:0 0 4px}p{margin:0 0 16px;color:#555;font-size:15px}
form{margin:0 0 12px}button{width:100%;padding:18px;font-size:19px;border:0;border-radius:14px;background:#2f5bea;color:#fff}
h2{font-size:16px;margin:24px 0 8px}a{display:block;padding:16px;margin-bottom:8px;border-radius:12px;background:#fff;color:#2f5bea;text-decoration:none;font-size:18px}
</style></head><body>
<h1>ALGO: телефонный стенд</h1>
<p>1. Нажмите кнопку входа (появится ответ сервера в виде текста). 2. Вернитесь назад и откройте экран ссылкой.</p>
${button("owner", "Войти как владелец")}${button("admin", "Войти как администратор")}${button("teacher", "Войти как преподаватель")}
<h2>Экраны</h2>
${links.map(([label, href]) => `<a href="${FRONT}${href}">${label}<br><small>${FRONT}${href}</small></a>`).join("\n")}
</body></html>`;

http
  .createServer((req, res) => {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
    res.end(page);
  })
  .listen(port, "0.0.0.0", () => console.log(`phone-demo page on http://localhost:${port}/`));
