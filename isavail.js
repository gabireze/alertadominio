import dgram from "node:dgram";
import crypto from "node:crypto";

const SERVER = "avail.registro.br";
const PORT = 43;

function randomCookie() {
  return crypto.randomBytes(10).toString("hex");
}

export const STATUS_MAP = {
  0: "Disponível",
  1: "Disponível com tickets concorrentes",
  2: "Registrado",
  3: "Indisponível",
  4: "Query inválido",
  5: "Aguardando processo de liberação",
  6: "Disponível durante processo de liberação",
  7: "Disponível na liberação com tickets concorrentes",
  8: "Erro",
  9: "Competitivo em processo de liberação (Versão 2)",
};

function parseResponse(text) {
  if (!text) {
    return { type: "empty", raw: text };
  }

  const lines = text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const ckLine = lines.find((l) => l.startsWith("CK "));
  if (ckLine) {
    const parts = ckLine.split(" ");
    const cookie = parts[1] || "";
    const qid = parts[2] || "";
    return { type: "cookie", cookie, qid, raw: text, lines };
  }

  const stLine = lines.find((l) => l.startsWith("ST "));
  if (stLine) {
    const parts = stLine.split(" ");
    const statusStr = parts[1];
    const qid = parts[2] || null;
    const status = Number.isFinite(Number(statusStr)) ? Number(statusStr) : NaN;

    return {
      type: "status",
      status,
      qid,
      raw: text,
      lines,
    };
  }

  return { type: "unknown", raw: text, lines };
}

function queryDomain(fqdn, cookie = randomCookie()) {
  return new Promise((resolve, reject) => {
    const qid = Math.floor(Math.random() * 1e9).toString();
    const version = 0; 
    const lang = 1;

    const query = `${version} ${cookie} ${lang} ${qid} ${fqdn}`;
    const message = Buffer.from(query, "latin1");

    const client = dgram.createSocket("udp4");
    let closed = false;

    const safeClose = () => {
      if (!closed) {
        closed = true;
        client.close();
      }
    };

    const timeoutId = setTimeout(() => {
      safeClose();
      reject(new Error("Timeout ao consultar avail.registro.br"));
    }, 3000);

    client.on("message", (buf) => {
      clearTimeout(timeoutId);
      const text = buf.toString("latin1");
      safeClose();
      resolve({ text, cookie, fqdn });
    });

    client.on("error", (err) => {
      clearTimeout(timeoutId);
      safeClose();
      reject(err);
    });

    client.send(message, 0, message.length, PORT, SERVER, (err) => {
      if (err) {
        clearTimeout(timeoutId);
        safeClose();
        reject(err);
      }
    });
  });
}

export async function checkDomain(fqdn) {
  const first = await queryDomain(fqdn);
  let parsed = parseResponse(first.text);

  if (parsed.type === "cookie" && parsed.cookie) {
    const second = await queryDomain(fqdn, parsed.cookie);
    parsed = parseResponse(second.text);
  }

  return parsed;
}

if (
  process.argv[1] &&
  process.argv[1].endsWith("isavail.js") &&
  process.argv[2]
) {
  const domain = process.argv[2];

  checkDomain(domain)
    .then((result) => {
      console.log("Resposta bruta:\n");
      console.log(result.raw || "<sem conteúdo>");

      if (result.type === "status") {
        console.log("\nStatus numérico:", result.status);
        console.log(
          "Significado:",
          STATUS_MAP[result.status] || "Desconhecido"
        );

        if ([6, 7, 9].includes(result.status)) {
          const idx = result.lines.findIndex((l) => l === process.argv[2]);
          if (idx >= 0 && result.lines[idx + 1]) {
            const dates = result.lines[idx + 1].split("|");
            console.log("\nInício da liberação:", dates[0]);
            console.log("Fim da liberação:", dates[1]);

            if (result.status === 9 && dates[2]) {
              console.log("Aceitando novos tickets até:", dates[2]);
            }
          }
        }

        console.log("QID:", result.qid);
      } else if (result.type === "cookie") {
        console.log("\nCookie recebido:", result.cookie);
        console.log("QID:", result.qid);
      } else {
        console.log("\nObjeto parseado:", result);
      }
    })
    .catch((err) => {
      console.error("Erro ao consultar:", err);
    });
}
