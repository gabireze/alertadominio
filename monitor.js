import dotenv from "dotenv";
dotenv.config();

import { checkDomain, STATUS_MAP } from "./isavail.js";
import { checkDomainCOM } from "./whois.js";

const DOMAINS = process.env.DOMAINS
  ? process.env.DOMAINS.split(",").map((d) => d.trim())
  : [];

const ALERT_STATUSES_BR = new Set([0, 5, 6, 7, 9]);
const ALERT_STATUSES_COM = new Set([0]);

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const TIMEZONE = process.env.TIMEZONE || "America/Sao_Paulo";
const MAX_RETRIES = parseInt(process.env.MAX_RETRIES || "3", 10);
const RETRY_DELAY_MS = parseInt(process.env.RETRY_DELAY_MS || "2000", 10);

if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
  console.error(
    "Defina TELEGRAM_BOT_TOKEN e TELEGRAM_CHAT_ID nas variáveis de ambiente (.env)."
  );
  process.exit(1);
}

if (DOMAINS.length === 0) {
  console.error(
    "Nenhum domínio configurado. Defina DOMAINS no arquivo .env (ex: DOMAINS=example.com.br,test.com)"
  );
  process.exit(1);
}

async function sendTelegramMessage(text) {
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text,
        parse_mode: "Markdown",
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error("Erro ao enviar mensagem ao Telegram:", res.status, body);
    }
  } catch (err) {
    console.error("Erro ao conectar com Telegram:", err.message);
  }
}

function extractReleaseDates(result, domain) {
  if (!result.lines || ![5, 6, 7, 9].includes(result.status)) {
    return null;
  }

  const idx = result.lines.findIndex((l) => l === domain);
  if (idx < 0 || !result.lines[idx + 1]) {
    return null;
  }

  const parts = result.lines[idx + 1].split("|");
  return {
    begin: parts[0] || null,
    end: parts[1] || null,
    acceptingUntil: parts[2] || null,
  };
}

function formatDomainStatus(domain, result) {
  if (result.type === "status") {
    const statusCode = result.status;
    const statusText = STATUS_MAP[statusCode] || "Desconhecido";

    let line = `- ${domain}: *${statusCode}* – ${statusText}`;

    const dates = extractReleaseDates(result, domain);
    if (dates && (dates.begin || dates.end)) {
      line += `\n  • Início liberação: ${
        dates.begin || "-"
      }\n  • Fim liberação: ${dates.end || "-"}`;
      if (dates.acceptingUntil) {
        line += `\n  • Aceitando novos tickets até: ${dates.acceptingUntil}`;
      }
    }

    return line;
  }

  if (result.type === "com") {
    return `- ${domain}: *${result.status}* – ${result.statusText}`;
  }

  if (result.type === "error") {
    return `- ${domain}: erro na consulta (${result.error})`;
  }

  return `- ${domain}: resposta inesperada (${result.type || "desconhecido"})`;
}

const lastNotifiedStatus = new Map();

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function checkDomainWithRetry(domain, attempt = 1) {
  try {
    let result;
    if (domain.endsWith(".br")) {
      result = await checkDomain(domain);
    } else {
      result = await checkDomainCOM(domain);
    }
    return result;
  } catch (err) {
    if (attempt < MAX_RETRIES) {
      console.error(`Erro ao consultar ${domain} (tentativa ${attempt}/${MAX_RETRIES}): ${err.message}`);
      await sleep(RETRY_DELAY_MS);
      return checkDomainWithRetry(domain, attempt + 1);
    }
    throw err;
  }
}

async function checkAllDomains() {
  const results = [];

  for (const domain of DOMAINS) {
    try {
      const result = await checkDomainWithRetry(domain);
      results.push({ domain, result });
    } catch (err) {
      console.error(`Erro final ao consultar ${domain} após ${MAX_RETRIES} tentativas:`, err.message);
      results.push({
        domain,
        result: { type: "error", error: err.message },
      });
    }
  }

  return results;
}

async function sendStartupStatus() {
  console.log("Enviando status inicial...");
  const now = new Date();
  const timestamp = now.toISOString().replace("T", " ").substring(0, 19);

  const results = await checkAllDomains();

  const lines = results.map(({ domain, result }) =>
    formatDomainStatus(domain, result)
  );

  const msg =
    `Bot de monitoramento iniciado.\n` +
    `Horário: ${timestamp}\n\n` +
    `Domínios monitorados:\n` +
    lines.join("\n\n");

  await sendTelegramMessage(msg);

  for (const { domain, result } of results) {
    if (result.type === "status" || result.type === "com") {
      const key = `${result.type}:${result.status}`;
      lastNotifiedStatus.set(domain, key);
    }
  }
}

async function periodicCheck() {
  const now = new Date();
  const localTime = new Date(now.toLocaleString("en-US", { timeZone: TIMEZONE }));
  const hour = localTime.getHours();
  const minute = localTime.getMinutes();
  const timestamp = now.toISOString().replace("T", " ").substring(0, 19);

  const inWindow =
    (hour === 14 && minute >= 50) || (hour === 15 && minute <= 10);

  if (!inWindow) {
    return;
  }

  const results = await checkAllDomains();
  const alerts = [];

  for (const { domain, result } of results) {
    let alertSet = null;

    if (result.type === "status") {
      alertSet = ALERT_STATUSES_BR;
    } else if (result.type === "com") {
      alertSet = ALERT_STATUSES_COM;
    } else {
      continue;
    }

    if (!alertSet.has(result.status)) {
      continue;
    }

    const statusKey = `${result.type}:${result.status}`;
    const lastKey = lastNotifiedStatus.get(domain);

    if (lastKey === statusKey) {
      continue;
    }

    alerts.push(formatDomainStatus(domain, result));
    lastNotifiedStatus.set(domain, statusKey);
  }

  if (alerts.length > 0) {
    console.log(`${timestamp} - ${alerts.length} alerta(s) detectado(s)`);
    const msg =
      `⚠️ Atualização de status em domínios monitorados:\n\n` +
      alerts.join("\n\n");
    await sendTelegramMessage(msg);
  }
}

async function main() {
  console.log("=" .repeat(50));
  console.log("Monitor de Domínios Iniciado");
  console.log(`Domínios monitorados: ${DOMAINS.join(", ")}`);
  console.log(`Janela de alerta: 14:50 - 15:10`);
  console.log(`Verificação a cada: 60 segundos`);
  console.log("=" .repeat(50));

  await sendStartupStatus();

  console.log("\nVerificação periódica ativada.");
  setInterval(() => {
    periodicCheck().catch((err) => {
      console.error("Erro na verificação periódica:", err.message);
    });
  }, 60_000);
}

main().catch((err) => {
  console.error("Erro na inicialização:", err.message);
  process.exit(1);
});
